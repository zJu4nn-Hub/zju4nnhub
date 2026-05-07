// steam-catalog.js — Sync diário do catálogo COMPLETO de jogos da Steam.
//
// Usa IStoreService/GetAppList (precisa Steam Web API key) que retorna TODOS
// os jogos da loja em poucas chamadas (paginado, ~10 reqs pra cobrir 100k+).
//
// Salva em userData/steam-catalog.json. Re-sincroniza se >24h.
// Expõe API rápida em memória pra checar "este appid é jogo válido?".

const { app, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const settings = require('./settings');

const CATALOG_FILE = () => path.join(app.getPath('userData'), 'steam-catalog.json');
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;   // 24h
const PAGE_SIZE = 50000;                          // max do IStoreService
const MAX_PAGES = 20;                             // safety net (1M jogos)

let index = null;          // Map<appid, name>
let lastSyncAt = 0;
let isSyncing = false;

// ============================================================
// HTTP helper (electron.net, sem CORS)
// ============================================================
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
    timer = setTimeout(() => { req.abort(); reject(new Error('Timeout (30s)')); }, 30000);
    req.end();
  });
}

// ============================================================
// Fetch paginado do IStoreService
// ============================================================
async function fetchAllGames(apiKey) {
  const games = [];
  let lastAppid = 0;
  let pages = 0;

  while (pages < MAX_PAGES) {
    pages++;
    const url = `https://api.steampowered.com/IStoreService/GetAppList/v1/` +
                `?key=${encodeURIComponent(apiKey)}` +
                `&include_games=1&include_dlc=0&include_software=0&include_videos=0&include_hardware=0` +
                `&max_results=${PAGE_SIZE}` +
                (lastAppid ? `&last_appid=${lastAppid}` : '');

    const data = await httpGetJson(url);
    const apps = data?.response?.apps || [];
    games.push(...apps);

    if (!data?.response?.have_more_results) break;
    lastAppid = data.response.last_appid;
  }

  return games;
}

// ============================================================
// Load catalog from disk
// ============================================================
function loadFromDisk() {
  try {
    const file = CATALOG_FILE();
    if (!fs.existsSync(file)) return false;
    const stat = fs.statSync(file);
    lastSyncAt = stat.mtimeMs;
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    const games = Array.isArray(data) ? data : (data.games || []);
    index = new Map();
    for (const g of games) index.set(parseInt(g.appid, 10), g.name);
    console.log(`[steam-catalog] Carregado ${index.size} jogos (mtime: ${new Date(lastSyncAt).toISOString()})`);
    return true;
  } catch (err) {
    console.warn('[steam-catalog] loadFromDisk falhou:', err.message);
    return false;
  }
}

function saveToDisk(games) {
  try {
    fs.writeFileSync(CATALOG_FILE(), JSON.stringify(games), 'utf8');
    lastSyncAt = Date.now();
  } catch (err) {
    console.warn('[steam-catalog] saveToDisk falhou:', err.message);
  }
}

// ============================================================
// Sync: roda em background se stale
// ============================================================
async function sync({ force = false } = {}) {
  if (isSyncing) return { error: 'já tá sincronizando' };

  const apiKey = settings.get('steamApiKey');
  if (!apiKey) return { error: 'API key não configurada' };

  if (!force && lastSyncAt && (Date.now() - lastSyncAt) < SYNC_INTERVAL_MS) {
    return { skipped: true, total: index?.size || 0, lastSyncAt };
  }

  isSyncing = true;
  try {
    console.log('[steam-catalog] iniciando sync...');
    const t0 = Date.now();
    const games = await fetchAllGames(apiKey);
    saveToDisk(games);
    index = new Map();
    for (const g of games) index.set(parseInt(g.appid, 10), g.name);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[steam-catalog] sync OK: ${games.length} jogos em ${elapsed}s`);
    return { ok: true, total: games.length, elapsedSec: elapsed };
  } catch (err) {
    console.error('[steam-catalog] sync falhou:', err.message);
    return { error: err.message };
  } finally {
    isSyncing = false;
  }
}

// ============================================================
// Init: carrega do disco + sync se stale (background, não bloqueia)
// ============================================================
async function init() {
  loadFromDisk();
  // Não bloqueia o app — sincroniza em background
  sync({ force: false }).then((result) => {
    if (result?.ok) console.log('[steam-catalog] sync background concluído');
    else if (result?.skipped) console.log('[steam-catalog] cache fresh, sync skippado');
    else if (result?.error) console.log('[steam-catalog] sync skipped:', result.error);
  });
}

// ============================================================
// Query API
// ============================================================
function isInCatalog(appid) {
  if (!index) return false;
  return index.has(parseInt(appid, 10));
}

function getGameName(appid) {
  if (!index) return null;
  return index.get(parseInt(appid, 10)) || null;
}

function getStatus() {
  return {
    loaded: !!index,
    total: index?.size || 0,
    lastSyncAt,
    ageMs: lastSyncAt ? Date.now() - lastSyncAt : null,
    syncing: isSyncing,
    hasApiKey: !!settings.get('steamApiKey'),
  };
}

module.exports = { init, sync, isInCatalog, getGameName, getStatus };
