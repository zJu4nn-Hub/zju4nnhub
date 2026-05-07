// http-downloader.js — Download de arquivos HTTP usando session.downloadURL.
//
// Usa o downloader nativo do Chromium (via Electron) que já dá:
//  - Progresso (received/total bytes)
//  - Pausar / retomar (HTTP range requests)
//  - Cancelar
//
// Suporta múltiplos arquivos por job (caso Gofile com pasta de N arquivos).
// Eventos são emitidos pra renderer via webContents.send.

const { app, session, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const settings = require('./settings');
const hostResolvers = require('./host-resolvers');

// ============================================================
// STATE
// ============================================================
const downloads = new Map(); // id → { id, name, host, folderUrl, files, downloadDir, status, ... }
let mainWindow = null;
let pendingItems = [];        // jobs aguardando capture do will-download
let stateFilePath = null;

// ============================================================
// PERSISTENCE
// ============================================================
function getStateFile() {
  if (!stateFilePath) {
    stateFilePath = path.join(app.getPath('userData'), 'http-downloads.json');
  }
  return stateFilePath;
}

function saveState() {
  try {
    const list = [...downloads.values()].map((d) => ({
      id: d.id,
      name: d.name,
      host: d.host,
      folderUrl: d.folderUrl,
      downloadDir: d.downloadDir,
      files: d.files.map((f) => ({
        url: f.url,
        name: f.name,
        size: f.size,
        savedPath: f.savedPath,
        downloaded: f.downloaded,
        status: f.status,
      })),
      status: d.status,
      createdAt: d.createdAt,
      finishedAt: d.finishedAt,
    }));
    fs.writeFileSync(getStateFile(), JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.warn('[http-downloader] saveState falhou:', err.message);
  }
}

function loadState() {
  try {
    const file = getStateFile();
    if (!fs.existsSync(file)) return;
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const d of list) {
      // Restaura como "paused" (não pode retomar download em andamento entre sessões facilmente)
      // Cards aparecem no histórico, user pode iniciar novamente se quiser.
      const status = d.status === 'done' ? 'done' : 'paused';
      downloads.set(d.id, {
        ...d,
        status,
        items: new Map(),                  // DownloadItem refs (recriados ao retomar)
        files: d.files.map((f) => ({ ...f, item: null })),
      });
    }
  } catch (err) {
    console.warn('[http-downloader] loadState falhou:', err.message);
  }
}

// ============================================================
// INIT
// ============================================================
function init(window) {
  mainWindow = window;
  loadState();

  // Hook will-download na sessão default — captura cada DownloadItem
  // que session.downloadURL inicia.
  session.defaultSession.on('will-download', handleWillDownload);
}

function broadcast(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// ============================================================
// HOST DETECTION
// ============================================================
function detectHost(url) {
  if (!url) return null;
  if (/pixeldrain\.com\/u\//i.test(url)) return 'pixeldrain';
  if (/gofile\.io\/d\//i.test(url)) return 'gofile';
  return null;
}

function isSupported(url) {
  return detectHost(url) !== null;
}

// ============================================================
// RESOLVE FILES — pega URLs diretas + nomes pra cada host
// ============================================================
async function resolveFiles(url) {
  const host = detectHost(url);

  if (host === 'pixeldrain') {
    const m = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9]+)/);
    if (!m) throw new Error('URL Pixeldrain inválida');
    const info = await hostResolvers.getPixeldrainInfo(m[1]);
    if (!info) throw new Error('Falha ao buscar info do Pixeldrain');
    return {
      host: 'pixeldrain',
      name: info.name,
      files: [{ url: info.directUrl, name: info.name, size: info.size }],
      cookies: [],
    };
  }

  if (host === 'gofile') {
    const m = url.match(/gofile\.io\/d\/([a-zA-Z0-9]+)/);
    if (!m) throw new Error('URL Gofile inválida');
    const contents = await hostResolvers.getGofileContents(m[1]);
    if (!contents) throw new Error('Falha ao buscar contents do Gofile (pode estar offline ou requer login)');
    if (!contents.files?.length) throw new Error('Pasta Gofile vazia');

    const cookies = contents.accountToken
      ? [{ url: 'https://gofile.io', name: 'accountToken', value: contents.accountToken, domain: '.gofile.io', path: '/' }]
      : [];

    return {
      host: 'gofile',
      name: contents.folderName || `Gofile_${m[1]}`,
      files: contents.files.map((f) => ({ url: f.link, name: f.name, size: f.size })),
      cookies,
    };
  }

  throw new Error(`Host não suportado: ${url}`);
}

// ============================================================
// START DOWNLOAD
// ============================================================
async function add({ url, name, downloadDir }) {
  if (!isSupported(url)) {
    throw new Error('Host não suportado pra download in-app. Abra no browser.');
  }

  const id = `http-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const baseDir = downloadDir || settings.get('defaultDownloadDir') || path.join(app.getPath('downloads'));
  const finalName = (name || 'Download').replace(/[<>:"/\\|?*]/g, '_').trim();
  const targetDir = path.join(baseDir, finalName);

  // Cria diretório do jogo
  fs.mkdirSync(targetDir, { recursive: true });

  // Cria entry no estado com status "resolving"
  const dl = {
    id,
    name: finalName,
    host: detectHost(url),
    folderUrl: url,
    downloadDir: targetDir,
    files: [],
    items: new Map(),     // url → DownloadItem
    status: 'resolving',
    createdAt: Date.now(),
  };
  downloads.set(id, dl);
  broadcast('http:added', toPublicState(dl));

  try {
    const resolved = await resolveFiles(url);
    dl.files = resolved.files.map((f) => ({
      url: f.url,
      name: (f.name || 'file').replace(/[<>:"/\\|?*]/g, '_'),
      size: f.size || 0,
      savedPath: path.join(targetDir, f.name || 'file'),
      downloaded: 0,
      status: 'queued',
    }));

    // Se Gofile, seta cookie ANTES de iniciar downloads
    for (const cookie of resolved.cookies || []) {
      try {
        await session.defaultSession.cookies.set(cookie);
      } catch (err) {
        console.warn('[http-downloader] cookie set falhou:', err.message);
      }
    }

    dl.status = 'downloading';
    broadcast('http:state', { id, state: toPublicState(dl) });

    // Inicia download de cada arquivo
    for (const file of dl.files) {
      // Marca pendingItems pra que will-download saiba este download é nosso
      pendingItems.push({ id, fileUrl: file.url, savedPath: file.savedPath });
      session.defaultSession.downloadURL(file.url);
    }

    saveState();
    return toPublicState(dl);
  } catch (err) {
    dl.status = 'failed';
    dl.error = err.message;
    saveState();
    broadcast('http:state', { id, state: toPublicState(dl) });
    throw err;
  }
}

// ============================================================
// will-download — captura DownloadItem e conecta progresso
// ============================================================
function handleWillDownload(event, item, webContents) {
  const itemUrl = item.getURL();

  // Tenta achar o pendingItem que casa com essa URL
  const pendingIdx = pendingItems.findIndex((p) => p.fileUrl === itemUrl);
  if (pendingIdx === -1) {
    // Não é nosso download — deixa Chromium tratar normal (provavelmente vai abrir browser)
    return;
  }

  const pending = pendingItems[pendingIdx];
  pendingItems.splice(pendingIdx, 1);

  const dl = downloads.get(pending.id);
  if (!dl) {
    item.cancel();
    return;
  }

  // Setta path de save
  item.setSavePath(pending.savedPath);

  // Acha file dentro de dl
  const file = dl.files.find((f) => f.url === itemUrl);
  if (file) {
    file.item = item;
    dl.items.set(itemUrl, item);
  }

  // Eventos
  item.on('updated', (_evt, state) => {
    if (!file) return;
    file.downloaded = item.getReceivedBytes();
    if (state === 'progressing') {
      file.status = item.isPaused() ? 'paused' : 'downloading';
    } else if (state === 'interrupted') {
      file.status = 'interrupted';
    }
    if (item.getTotalBytes() > 0 && !file.size) file.size = item.getTotalBytes();
    broadcast('http:progress', { id: dl.id, state: toPublicState(dl) });
  });

  item.once('done', (_evt, state) => {
    if (!file) return;
    if (state === 'completed') {
      file.status = 'done';
      file.downloaded = file.size;
    } else if (state === 'cancelled') {
      file.status = 'cancelled';
    } else {
      file.status = 'failed';
    }
    dl.items.delete(itemUrl);

    // Verifica se TODOS os files estão done
    const allDone = dl.files.every((f) => f.status === 'done');
    const anyFailed = dl.files.some((f) => f.status === 'failed' || f.status === 'cancelled');

    if (allDone) {
      dl.status = 'done';
      dl.finishedAt = Date.now();
      broadcast('http:done', { id: dl.id, state: toPublicState(dl) });
      // Hook de extração automática (Fase 9.x)
      try { onDownloadComplete && onDownloadComplete(dl); } catch (err) { console.warn('[http] post-process falhou:', err.message); }
    } else if (anyFailed && dl.items.size === 0) {
      dl.status = 'failed';
      broadcast('http:state', { id: dl.id, state: toPublicState(dl) });
    } else {
      broadcast('http:state', { id: dl.id, state: toPublicState(dl) });
    }
    saveState();
  });
}

// ============================================================
// PAUSE / RESUME / REMOVE
// ============================================================
function pause(id) {
  const dl = downloads.get(id);
  if (!dl) return false;
  for (const item of dl.items.values()) {
    if (!item.isPaused()) item.pause();
  }
  dl.status = 'paused';
  broadcast('http:state', { id, state: toPublicState(dl) });
  saveState();
  return true;
}

function resume(id) {
  const dl = downloads.get(id);
  if (!dl) return false;
  for (const item of dl.items.values()) {
    if (item.isPaused() && item.canResume()) item.resume();
  }
  dl.status = 'downloading';
  broadcast('http:state', { id, state: toPublicState(dl) });
  saveState();
  return true;
}

function remove(id, deleteFiles) {
  const dl = downloads.get(id);
  if (!dl) return false;
  // Cancela items ativos
  for (const item of dl.items.values()) {
    try { item.cancel(); } catch {}
  }
  if (deleteFiles && dl.downloadDir) {
    try { fs.rmSync(dl.downloadDir, { recursive: true, force: true }); } catch {}
  }
  downloads.delete(id);
  broadcast('http:removed', { id });
  saveState();
  return true;
}

function list() {
  return [...downloads.values()].map(toPublicState);
}

// Estado serializável (sem refs ao DownloadItem)
function toPublicState(dl) {
  const totalSize = dl.files.reduce((acc, f) => acc + (f.size || 0), 0);
  const downloaded = dl.files.reduce((acc, f) => acc + (f.downloaded || 0), 0);
  return {
    id: dl.id,
    type: 'http',
    name: dl.name,
    host: dl.host,
    folderUrl: dl.folderUrl,
    downloadDir: dl.downloadDir,
    status: dl.status,
    error: dl.error,
    createdAt: dl.createdAt,
    finishedAt: dl.finishedAt,
    totalSize,
    downloaded,
    progress: totalSize > 0 ? downloaded / totalSize : 0,
    files: dl.files.map((f) => ({
      name: f.name,
      url: f.url,
      size: f.size,
      downloaded: f.downloaded,
      savedPath: f.savedPath,
      status: f.status,
    })),
  };
}

function openFolder(id) {
  const dl = downloads.get(id);
  if (!dl) return false;
  const { shell } = require('electron');
  shell.openPath(dl.downloadDir);
  return true;
}

// Callback chamado quando um download completa (registrado pelo main.js)
let onDownloadComplete = null;
function setOnDownloadComplete(fn) { onDownloadComplete = typeof fn === 'function' ? fn : null; }

module.exports = { init, add, pause, resume, remove, list, openFolder, isSupported, detectHost, setOnDownloadComplete };
