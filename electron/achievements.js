// achievements.js — Orquestrador do sistema de conquistas (Fase 9.x)
//
// Mantém:
//   - Estado de unlocks por jogo em userData/achievement-progress.json
//   - Map de watchers ativos (key → { appid, exePath, fingerprints })
//   - Tick periódico (chamado por library.js junto com PID polling)
//
// Emite eventos:
//   - 'achievements:unlocked' → { key, appid, achievement, schema, total, unlocked }
//   - 'achievements:state'    → { key, total, unlocked }   (atualizações genéricas)

'use strict';

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const locator = require('./achievement-locator');
const parsers = require('./achievement-parsers');
const schemaCache = require('./achievement-schema');

let mainWindow = null;
let onUnlockHook = null;       // callback opcional pra notificar listeners externos (ex: overlay)
let stateFile = null;
let state = {};                  // { [key]: { appid, unlocked: [{name, unlockTime}], fileFingerprints, updatedAt } }
const watchers = new Map();      // key → { appid, exePath, lastSchemaSeen?, lastTickAt? }
let saveTimer = null;
const SAVE_DEBOUNCE_MS = 1500;

function loadState() {
  try {
    if (fs.existsSync(stateFile)) {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) || {};
    }
  } catch (err) {
    console.warn('[ach] loadState falhou:', err.message);
    state = {};
  }
}

function flushSave() {
  if (!stateFile) return;
  try { fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8'); }
  catch (err) { console.warn('[ach] save falhou:', err.message); }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; flushSave(); }, SAVE_DEBOUNCE_MS);
}

function broadcast(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function init(window, opts = {}) {
  mainWindow = window;
  if (typeof opts.onUnlock === 'function') onUnlockHook = opts.onUnlock;
  stateFile = path.join(app.getPath('userData'), 'achievement-progress.json');
  loadState();
  console.log('[ach] init OK — entries:', Object.keys(state).length);
}

function setOnUnlockHook(fn) { onUnlockHook = typeof fn === 'function' ? fn : null; }

// Garante entry pra esse key
function ensureEntry(key, appid) {
  if (!state[key]) {
    state[key] = {
      appid: Number(appid) || null,
      unlocked: [],
      progress: {},          // { [name]: { value, max } } — pra achievements parciais
      fileFingerprints: {},
      updatedAt: Date.now(),
    };
  } else {
    if (appid && !state[key].appid) state[key].appid = Number(appid);
    if (!state[key].progress) state[key].progress = {};  // backfill de migration
  }
  return state[key];
}

// Inicia tracking pra essa sessão. Chamado por library.js no launch.
function startWatcher({ key, appid, exePath }) {
  if (!key || !appid) return;
  watchers.set(key, { appid: Number(appid), exePath: exePath || null, lastTickAt: 0 });
  ensureEntry(key, appid);
  // Pre-fetch schema em background (não bloqueia)
  schemaCache.getSchema(appid).catch(() => {});
  // Tick imediato pra pegar unlocks que existiam antes do launch
  tickWatcher(key).catch(() => {});
  console.log(`[ach] watcher start — key=${key} appid=${appid}`);
}

function stopWatcher(key) {
  if (!key) return;
  watchers.delete(key);
  console.log(`[ach] watcher stop — key=${key}`);
}

// Lê arquivo + parseia, retornando lista de unlocks
function readAndParse(file) {
  try {
    if (file.format === 'flt') {
      // Pasta com 1 arquivo por achievement
      const entries = fs.readdirSync(file.path);
      return parsers.parseFltFolder(entries);
    }
    const content = fs.readFileSync(file.path, 'utf8');
    return parsers.parseAchievementContent(file.emulator, content);
  } catch (err) {
    return [];
  }
}

// Tick principal — chamado a cada 15s pelo library.js durante sessão ativa.
// Também pode ser chamado pontualmente (ex: depois de iniciar watcher).
async function tickWatcher(key) {
  const w = watchers.get(key);
  if (!w) return;
  const entry = ensureEntry(key, w.appid);
  const files = locator.findAchievementFiles({ appid: w.appid, exePath: w.exePath });
  if (!files.length) {
    console.log(`[ach] tick ${key}: nenhum arquivo encontrado`);
    return;
  }
  console.log(`[ach] tick ${key}: ${files.length} arquivo(s) encontrado(s):`, files.map((f) => `${f.emulator}:${path.basename(f.path)}`).join(', '));

  // Detecta arquivos novos/modificados via fingerprint (mtime + size)
  const changedFiles = [];
  for (const f of files) {
    const fp = entry.fileFingerprints[f.path];
    if (!fp || fp.mtime !== f.mtime || fp.size !== f.size) {
      changedFiles.push(f);
    }
  }
  if (!changedFiles.length) {
    console.log(`[ach] tick ${key}: sem mudanças (fingerprints OK)`);
    w.lastTickAt = Date.now();
    return;
  }
  console.log(`[ach] tick ${key}: ${changedFiles.length} arquivo(s) mudaram, parseando...`);

  // Coleta todos os unlocks (de todos os arquivos modificados) e mescla com existentes
  const allParsed = [];
  for (const f of changedFiles) {
    const parsed = readAndParse(f);
    console.log(`[ach] tick ${key}: ${path.basename(f.path)} (${f.emulator}) → ${parsed.length} unlocks parseados`);
    for (const a of parsed) allParsed.push(a);
    // Atualiza fingerprint
    entry.fileFingerprints[f.path] = { mtime: f.mtime, size: f.size };
  }

  // Dedup e merge com unlocks existentes (case-insensitive name match)
  const existingByName = new Map();
  for (const u of entry.unlocked) existingByName.set(u.name.toLowerCase(), u);
  const newlyUnlocked = [];
  // Limpa progresso antigo pra refletir só o estado atual dos arquivos
  const newProgress = {};
  for (const a of allParsed) {
    if (!a.name) continue;
    const k = a.name.toLowerCase();
    // Considera "unlocked" se: NÃO veio campo `unlocked` explícito (parsers antigos sempre retornam unlocked) OU explicit unlocked=true
    const isUnlocked = a.unlocked !== false;  // undefined OU true → unlocked
    if (isUnlocked) {
      if (!existingByName.has(k)) {
        const u = { name: a.name, unlockTime: a.unlockTime || Math.floor(Date.now() / 1000) };
        existingByName.set(k, u);
        newlyUnlocked.push(u);
      }
    } else if (a.progressValue != null && a.progressValue > 0) {
      // Partial progress: track separadamente (não vai pra unlocked)
      newProgress[a.name] = { value: a.progressValue, max: a.progressMax || null };
    }
  }
  entry.unlocked = Array.from(existingByName.values()).sort((a, b) => (b.unlockTime || 0) - (a.unlockTime || 0));
  entry.progress = newProgress;
  entry.updatedAt = Date.now();
  scheduleSave();

  console.log(`[ach] tick ${key}: ${newlyUnlocked.length} novos unlocks`);
  // Notifica novos unlocks via broadcast
  if (newlyUnlocked.length > 0) {
    let schema = schemaCache.getCached(w.appid);
    if (!schema) {
      try { schema = await schemaCache.getSchema(w.appid); } catch {}
    }
    for (const u of newlyUnlocked) {
      const meta = schema?.achievements?.find((a) => a.name?.toLowerCase() === u.name.toLowerCase());
      const payload = {
        key,
        appid: w.appid,
        achievement: {
          name: u.name,
          unlockTime: u.unlockTime,
          displayName: meta?.displayName || u.name,
          description: meta?.description || '',
          icon: meta?.icon || '',
          icongray: meta?.icongray || '',
          rarity: meta?.rarity ?? null,
          hidden: meta?.hidden || 0,
        },
        total: schema?.totalCount || 0,
        unlocked: entry.unlocked.length,
      };
      broadcast('achievements:unlocked', payload);
      if (onUnlockHook) {
        try { onUnlockHook(payload); } catch (err) { console.warn('[ach] onUnlock hook erro:', err.message); }
      }
    }
    broadcast('achievements:state', {
      key, appid: w.appid,
      total: schema?.totalCount || 0,
      unlocked: entry.unlocked.length,
    });
  }

  w.lastTickAt = Date.now();
}

// Recupera progresso pra UI: { unlocked, total, percent, list (com merge schema) }
async function getProgress(key, opts = {}) {
  const entry = state[key];
  if (!entry) return { unlocked: 0, total: 0, percent: 0, list: [], appid: null };
  let schema = schemaCache.getCached(entry.appid);
  if (!schema && opts.fetch !== false) {
    try { schema = await schemaCache.getSchema(entry.appid); } catch {}
  }
  const unlockedMap = new Map();
  for (const u of (entry.unlocked || [])) unlockedMap.set(u.name.toLowerCase(), u);

  let list = [];
  if (schema?.achievements?.length) {
    list = schema.achievements.map((a) => {
      const u = unlockedMap.get(a.name.toLowerCase());
      const partial = entry.progress?.[a.name] || null;
      // Max: prioriza schema, fallback no parser, fallback default 100
      const progressMax = a.progressMax || partial?.max || null;
      return {
        name: a.name,
        displayName: a.displayName || a.name,
        description: a.description || '',
        icon: a.icon || '',
        icongray: a.icongray || '',
        hidden: a.hidden || 0,
        rarity: a.rarity ?? null,
        unlocked: !!u,
        unlockTime: u?.unlockTime || 0,
        progressValue: partial?.value ?? null,
        progressMax,
      };
    });
  } else {
    // Sem schema → lista crua só com nomes
    list = (entry.unlocked || []).map((u) => ({
      name: u.name, displayName: u.name, description: '', icon: '', icongray: '',
      hidden: 0, rarity: null, unlocked: true, unlockTime: u.unlockTime || 0,
      progressValue: null, progressMax: null,
    }));
  }

  const total = schema?.totalCount || list.length;
  const unlockedCount = list.filter((a) => a.unlocked).length;
  return {
    appid: entry.appid,
    unlocked: unlockedCount,
    total,
    percent: total > 0 ? Math.round((unlockedCount / total) * 100) : 0,
    list,
  };
}

// Versão síncrona, usa só cache (pra badge nos cards — sem latência)
function getProgressSync(key) {
  const entry = state[key];
  if (!entry) return null;
  const schema = schemaCache.getCached(entry.appid);
  const total = schema?.totalCount || (entry.unlocked?.length || 0);
  const unlocked = entry.unlocked?.length || 0;
  return { appid: entry.appid, total, unlocked, percent: total > 0 ? Math.round((unlocked / total) * 100) : 0 };
}

// Stats agregadas pro Perfil
function getStats() {
  let totalUnlocked = 0;
  let totalAvailable = 0;
  let games = 0;
  for (const [, entry] of Object.entries(state)) {
    if (!entry?.appid) continue;
    games++;
    const schema = schemaCache.getCached(entry.appid);
    totalUnlocked += entry.unlocked?.length || 0;
    totalAvailable += schema?.totalCount || (entry.unlocked?.length || 0);
  }
  return { games, totalUnlocked, totalAvailable };
}

// Faz UMA varredura pontual num appid específico (sem manter watcher ativo).
// Útil pra ver achievements desbloqueados sem precisar iniciar o jogo.
// Limpa fingerprints antes pra forçar re-parse (dedup por nome cuida do resto).
async function scanOnce({ key, appid, exePath }) {
  if (!key || !appid) return;
  const wasWatching = watchers.has(key);
  if (!wasWatching) {
    watchers.set(key, { appid: Number(appid), exePath: exePath || null, lastTickAt: 0 });
  } else if (exePath && !watchers.get(key).exePath) {
    watchers.get(key).exePath = exePath;
  }
  const entry = ensureEntry(key, appid);
  // Força re-parse de TODOS os arquivos (sobrescreve fingerprints velhos com size errado)
  entry.fileFingerprints = {};
  // Pre-fetch schema (não bloqueia o tick)
  schemaCache.getSchema(appid).catch(() => {});
  try { await tickWatcher(key); } catch {}
  if (!wasWatching) watchers.delete(key);
}

// ============================================================
// BACKGROUND TICKER — scan periódico de TODOS os jogos sem precisar
// de sessão ativa. Pega mudanças que o emulador faz durante gameplay
// E também edits manuais do user fora do app.
// ============================================================
let bgTimer = null;
const BG_SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 min — reduz uso de CPU pra disco/parser

function startBackgroundTicker() {
  if (bgTimer) return;
  bgTimer = setInterval(async () => {
    // Pra cada entry em state com appid, faz scanOnce
    for (const [key, entry] of Object.entries(state)) {
      if (!entry?.appid) continue;
      // Skip se já tem watcher ativo (eles ja tickaram via library polling)
      if (watchers.has(key)) continue;
      try {
        await scanOnce({ key, appid: entry.appid, exePath: null });
      } catch {}
    }
  }, BG_SCAN_INTERVAL_MS);
  console.log(`[ach] background ticker on (${BG_SCAN_INTERVAL_MS / 1000}s)`);
}

function stopBackgroundTicker() {
  if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
}

// Faz uma varredura de todos os jogos sem watcher ativo (chamado opcionalmente no boot)
async function scanAllOnce({ appidByKey }) {
  // appidByKey = { 'st_xxx': appid, 'dl_yyy': appid, ... }
  for (const [key, appid] of Object.entries(appidByKey || {})) {
    if (!appid) continue;
    if (watchers.has(key)) continue;
    watchers.set(key, { appid: Number(appid), exePath: null, lastTickAt: 0 });
    try { await tickWatcher(key); } catch {}
    watchers.delete(key);
  }
}

function shutdown() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    flushSave();
  }
}

module.exports = {
  init,
  setOnUnlockHook,
  startWatcher,
  stopWatcher,
  tickWatcher,
  scanOnce,
  getProgress,
  getProgressSync,
  getStats,
  scanAllOnce,
  startBackgroundTicker,
  stopBackgroundTicker,
  shutdown,
};
