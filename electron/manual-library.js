// manual-library.js — Jogos adicionados manualmente à biblioteca (Fase 9.x)
//
// Pra casos onde o user já tem o jogo instalado fora do app (baixou externamente,
// instalou via outro launcher etc) e só quer trackear na biblioteca + perfil.
//
// Storage: userData/manual-library.json
// Formato: { [appid]: { appid, name, addedAt } }
// O exePath dessas entries fica no gameOverrides com key `lib_{appid}`.
// O playtime fica no library.js com key `lib_{appid}`.

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let stateFile = null;
let state = {};

function init() {
  stateFile = path.join(app.getPath('userData'), 'manual-library.json');
  try {
    if (fs.existsSync(stateFile)) {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) || {};
    }
  } catch (err) {
    console.warn('[manual-library] load falhou:', err.message);
    state = {};
  }
  console.log('[manual-library] init OK — entries:', Object.keys(state).length);
}

function save() {
  if (!stateFile) return;
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[manual-library] save falhou:', err.message);
  }
}

function add({ appid, name }) {
  if (!appid) return null;
  const key = String(appid);
  // Não sobrescreve se já existe (evita reset do addedAt em re-add acidental)
  if (state[key]) return state[key];
  state[key] = {
    appid: Number(appid),
    name: String(name || `App ${appid}`),
    addedAt: Date.now(),
  };
  save();
  return state[key];
}

function remove(appid) {
  if (!appid) return false;
  const key = String(appid);
  if (state[key]) {
    delete state[key];
    save();
    return true;
  }
  return false;
}

function has(appid) {
  if (!appid) return false;
  return !!state[String(appid)];
}

function get(appid) {
  if (!appid) return null;
  return state[String(appid)] || null;
}

function list() {
  return Object.values(state);
}

module.exports = { init, add, remove, has, get, list };
