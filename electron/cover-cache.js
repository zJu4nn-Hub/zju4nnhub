// cover-cache.js — Cache de URLs de capas dos jogos
//
// Salva qual URL de capa funcionou pra cada appid, pra evitar repetir
// a cascata de fallback (akamai → cloudflare → library_hero → search) em
// toda abertura do app.
//
// Storage: userData/cover-urls.json
// Formato: { [appid]: "https://..." }
//
// Uso:
//   - cover-cache.get(appid) → URL ou null
//   - cover-cache.set(appid, url) → salva (debounced)
//   - cover-cache.remove(appid) → invalida (ex: URL parou de funcionar)

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let stateFile = null;
let state = {};
let saveTimer = null;
const SAVE_DEBOUNCE_MS = 1500;

function init() {
  stateFile = path.join(app.getPath('userData'), 'cover-urls.json');
  try {
    if (fs.existsSync(stateFile)) {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) || {};
    }
  } catch (err) {
    console.warn('[cover-cache] load falhou:', err.message);
    state = {};
  }
  console.log('[cover-cache] init OK — entries:', Object.keys(state).length);
}

function flushSave() {
  if (!stateFile) return;
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[cover-cache] save falhou:', err.message);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushSave();
  }, SAVE_DEBOUNCE_MS);
}

function get(appid) {
  if (!appid) return null;
  return state[String(appid)] || null;
}

function set(appid, url) {
  if (!appid || !url) return false;
  const key = String(appid);
  if (state[key] === url) return false; // sem mudança
  state[key] = url;
  scheduleSave();
  return true;
}

function remove(appid) {
  if (!appid) return false;
  const key = String(appid);
  if (state[key]) {
    delete state[key];
    scheduleSave();
    return true;
  }
  return false;
}

function listAll() {
  return { ...state };
}

function clear() {
  state = {};
  scheduleSave();
}

// Garante que um save pendente seja persistido antes do app fechar
function shutdown() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    flushSave();
  }
}

module.exports = { init, get, set, remove, listAll, clear, shutdown };
