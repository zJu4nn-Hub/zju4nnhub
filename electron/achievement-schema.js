// achievement-schema.js — Cache de schemas oficiais da Steam (Fase 9.x)
//
// Busca o schema oficial das conquistas de cada appid via:
//   ISteamUserStats/GetSchemaForGame/v2/?appid={A}&key={K}&l=portuguese
// e ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/ (raridade global)
//
// Persiste em userData/achievement-schemas.json. TTL de 7 dias.

'use strict';

const { app, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const settings = require('./settings');

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const SAVE_DEBOUNCE_MS = 1500;

let stateFile = null;
let state = {};
let saveTimer = null;
let inflight = new Map(); // appid → Promise (evita fetch duplicado)

function init() {
  stateFile = path.join(app.getPath('userData'), 'achievement-schemas.json');
  try {
    if (fs.existsSync(stateFile)) {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) || {};
    }
  } catch (err) {
    console.warn('[ach-schema] load falhou:', err.message);
    state = {};
  }
  console.log('[ach-schema] init OK — entries:', Object.keys(state).length);
}

function flushSave() {
  if (!stateFile) return;
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[ach-schema] save falhou:', err.message);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; flushSave(); }, SAVE_DEBOUNCE_MS);
}

// HTTP GET JSON via electron.net (sem CORS)
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, method: 'GET', redirect: 'follow' });
    req.setHeader('User-Agent', 'zJu4nn-Hub/1.0');
    req.setHeader('Accept', 'application/json');
    let data = '';
    let timer;
    req.on('response', (resp) => {
      if (resp.statusCode >= 400) {
        req.abort();
        reject(new Error(`HTTP ${resp.statusCode}`));
        return;
      }
      resp.on('data', (c) => { data += c.toString('utf8'); });
      resp.on('end', () => { clearTimeout(timer); try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
      resp.on('error', reject);
    });
    req.on('error', reject);
    timer = setTimeout(() => { req.abort(); reject(new Error('Timeout (15s)')); }, 15000);
    req.end();
  });
}

async function fetchSchemaFromSteam(appid, language = 'portuguese') {
  const apiKey = settings.get('steamApiKey');
  if (!apiKey) throw new Error('Steam API key não configurada');
  const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/`
    + `?appid=${appid}`
    + `&key=${encodeURIComponent(apiKey)}`
    + `&l=${encodeURIComponent(language)}`;
  const data = await httpGetJson(url);
  const game = data?.game;
  const rawAchievements = game?.availableGameStats?.achievements || [];
  return {
    appid: Number(appid),
    displayName: game?.gameName || null,
    language,
    achievements: rawAchievements.map((a) => ({
      name: a.name,                  // apiname (chave de match com unlock)
      displayName: a.displayName || a.name,
      description: a.description || '',
      icon: a.icon || '',            // URL da img colorida
      icongray: a.icongray || '',    // URL da img cinza (locked)
      hidden: a.hidden ? 1 : 0,
      // Progress parcial — Steam retorna `progress: { min_val, max_val }` em algumas
      progressMin: a.progress?.min_val != null ? Number(a.progress.min_val) : null,
      progressMax: a.progress?.max_val != null ? Number(a.progress.max_val) : null,
    })),
    fetchedAt: Date.now(),
  };
}

async function fetchGlobalPercentages(appid) {
  // Endpoint público (sem key) com rarity %
  const url = `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}`;
  try {
    const data = await httpGetJson(url);
    const list = data?.achievementpercentages?.achievements || [];
    const map = {};
    for (const a of list) {
      if (a?.name != null && a?.percent != null) {
        map[String(a.name)] = Number(a.percent);
      }
    }
    return map;
  } catch (err) {
    console.warn('[ach-schema] global pct falhou pra', appid, err.message);
    return {};
  }
}

function isFresh(entry) {
  if (!entry) return false;
  return (Date.now() - (entry.fetchedAt || 0)) < TTL_MS;
}

// API pública: garante que temos schema fresco pra esse appid (cache hit ou fetch)
// opts: { force?: bool, language?: string }
async function getSchema(appid, opts = {}) {
  if (!appid) return null;
  const key = String(appid);
  const language = opts.language || 'portuguese';

  // Cache hit válido + idioma bate
  if (!opts.force && state[key] && isFresh(state[key]) && state[key].language === language) {
    return state[key];
  }

  // Evita fetch duplicado em paralelo
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    try {
      const [schema, rarity] = await Promise.all([
        fetchSchemaFromSteam(appid, language),
        fetchGlobalPercentages(appid),
      ]);
      // Anexa rarity em cada achievement (pode estar vazio se Steam não tem dados)
      schema.achievements = schema.achievements.map((a) => ({
        ...a,
        rarity: rarity[a.name] != null ? Number(rarity[a.name]) : null,
      }));
      schema.totalCount = schema.achievements.length;
      state[key] = schema;
      scheduleSave();
      return schema;
    } catch (err) {
      console.warn('[ach-schema] fetch falhou pra', appid, err.message);
      // Se já temos cache antigo, retorna ele
      if (state[key]) return state[key];
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

function getCached(appid) {
  if (!appid) return null;
  return state[String(appid)] || null;
}

function clear(appid) {
  if (!appid) return;
  delete state[String(appid)];
  scheduleSave();
}

function shutdown() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    flushSave();
  }
}

module.exports = { init, getSchema, getCached, clear, shutdown };
