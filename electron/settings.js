// settings.js — Settings persistence simples em JSON
// Vive em userData/settings.json (sobrevive ao update do app, vai pro mesmo lugar)

const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

const defaults = {
  // Pasta padrão de download (resolvida via app.getPath em getDefaults())
  downloadDir: null,
  // Lembrar última pasta escolhida pra pré-popular o picker
  lastDownloadDir: null,
  // Abrir pasta automaticamente quando download terminar
  openFolderOnDone: false,
  // Iniciar app no boot do Windows
  autoLaunch: false,
  // Extrair automaticamente .zip / .rar / .7z após download completar (Fase 9.x)
  autoExtract: true,
  // Apagar o archive original após extrair com sucesso (libera espaço)
  deleteArchiveAfterExtract: false,
  // Idioma (pt-BR / en) — placeholder pra futuro
  language: 'pt-BR',
};

function getDefaults() {
  return {
    ...defaults,
    downloadDir: path.join(app.getPath('documents'), 'zJu4nn Hub', 'Downloads'),
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  let data = {};
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {};
    }
  } catch (err) {
    console.error('[settings] load falhou:', err.message);
  }
  cache = { ...getDefaults(), ...data };
  return cache;
}

function save() {
  if (!cache) return;
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('[settings] save falhou:', err.message);
  }
}

function get(key) {
  const all = load();
  if (key === undefined) return { ...all };
  return all[key];
}

function set(key, value) {
  load();
  cache[key] = value;
  save();
  return cache[key];
}

function update(partial) {
  load();
  Object.assign(cache, partial);
  save();
  return { ...cache };
}

module.exports = { get, set, update, getDefaults };
