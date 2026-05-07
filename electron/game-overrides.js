// game-overrides.js — Configurações por jogo (Hydra-style)
//
// Permite o user sobrescrever:
//   - exePath: caminho do executável (pra spawn direto)
//   - displayName: nome mostrado na UI
//   - launchArgs: args extras (futuro)
//
// Storage: userData/game-overrides.json
// Formato: { [key]: { exePath?, displayName?, launchArgs?, savePath? } }
// Keys: st_{appid} (Steam Tools) | dl_{id} (App download)

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let stateFile = null;
let state = {};

function init() {
  stateFile = path.join(app.getPath('userData'), 'game-overrides.json');
  try {
    if (fs.existsSync(stateFile)) {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) || {};
    }
  } catch (err) {
    console.warn('[overrides] load falhou:', err.message);
    state = {};
  }
  console.log('[overrides] init OK — entries:', Object.keys(state).length);
}

function save() {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[overrides] save falhou:', err.message);
  }
}

function get(key) {
  if (!key) return null;
  return state[key] || null;
}

function set(key, patch) {
  if (!key) return null;
  if (!state[key]) state[key] = {};
  // Sanitiza campos permitidos
  const allowed = ['exePath', 'displayName', 'launchArgs', 'savePath'];
  for (const k of allowed) {
    if (k in (patch || {})) {
      const v = patch[k];
      if (v == null || v === '') {
        delete state[key][k];
      } else {
        state[key][k] = String(v);
      }
    }
  }
  // Mantém entry mesmo vazia — serve como marker "user já interagiu"
  // (assim auto-detect não vai re-preencher na próxima abertura)
  save();
  return state[key] || {};
}

function remove(key) {
  if (state[key]) {
    delete state[key];
    save();
    return true;
  }
  return false;
}

function listAll() {
  return { ...state };
}

module.exports = { init, get, set, remove, listAll };
