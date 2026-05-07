// torrent-engine.js — WebTorrent wrapper pro main process
// Persiste estado em userData/downloads.json, retoma ao reabrir o app,
// emite eventos de progresso pra todas as janelas via webContents.send.

const { app, BrowserWindow, Notification, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

// ============================================================
// CONFIG
// ============================================================

const STATE_FILE = path.join(app.getPath('userData'), 'downloads.json');
const DEFAULT_DOWNLOAD_DIR = path.join(app.getPath('documents'), 'zJu4nn Hub', 'Downloads');
const PROGRESS_BROADCAST_INTERVAL_MS = 750;

// ============================================================
// STATE
// ============================================================

let WebTorrent = null;       // class, lazy-loaded
let client = null;           // WebTorrent instance, singleton
let initialized = false;
let initPromise = null;

// Lista persistida em disco. Cada item:
// { id, magnet, infoHash, name, path, status, progress, speed, peers,
//   totalSize, downloadedSize, addedAt, completedAt, error? }
const state = { downloads: [] };

// Throttle de broadcast por torrent
const lastBroadcast = new Map(); // id → timestamp

// ============================================================
// HELPERS
// ============================================================

function sanitizeName(name) {
  if (!name) return 'Jogo';
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Jogo';
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.downloads)) {
        state.downloads = parsed.downloads;
      }
    }
  } catch (err) {
    console.error('[torrent] loadState falhou:', err.message);
  }
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[torrent] saveState falhou:', err.message);
  }
}

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

function snapshot(dl, torrent) {
  // Snapshot serializável seguro pra mandar pro renderer
  return {
    id: dl.id,
    magnet: dl.magnet,
    infoHash: dl.infoHash,
    name: dl.name,
    path: dl.path,
    status: dl.status,
    progress: dl.progress || 0,
    speed: dl.speed || 0,
    peers: dl.peers || 0,
    totalSize: dl.totalSize || 0,
    downloadedSize: dl.downloadedSize || 0,
    addedAt: dl.addedAt,
    completedAt: dl.completedAt,
    error: dl.error,
  };
}

function findDownload(id) {
  return state.downloads.find((d) => d.id === id);
}

function findTorrent(infoHash) {
  if (!client || !infoHash) return null;
  return client.torrents.find((t) => t.infoHash === infoHash) || null;
}

function notifyDone(name) {
  if (!Notification.isSupported()) return;
  try {
    new Notification({
      title: 'Download concluído',
      body: name,
      silent: false,
    }).show();
  } catch {}
}

function notifyError(name, errMsg) {
  if (!Notification.isSupported()) return;
  try {
    new Notification({
      title: 'Erro no download',
      body: `${name}: ${errMsg}`,
      silent: false,
    }).show();
  } catch {}
}

// ============================================================
// INIT (lazy)
// ============================================================

async function init() {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Dynamic import — webtorrent v2 é ESM-only
    const mod = await import('webtorrent');
    WebTorrent = mod.default;

    client = new WebTorrent({
      // Limites razoáveis. Premium pode aumentar via Fase 7.
      maxConns: 80,
    });

    client.on('error', (err) => {
      console.error('[torrent] client error:', err.message);
    });

    loadState();

    // Retoma downloads ainda em progresso
    for (const dl of state.downloads) {
      if (dl.status === 'downloading' || dl.status === 'paused') {
        try {
          fs.mkdirSync(dl.path, { recursive: true });
          const torrent = client.add(dl.magnet, { path: dl.path });
          attachListeners(torrent, dl);
          if (dl.status === 'paused') {
            // pausa imediatamente após adicionar
            torrent.on('ready', () => torrent.pause());
          }
        } catch (err) {
          console.error('[torrent] resume falhou:', dl.name, err.message);
          dl.status = 'failed';
          dl.error = err.message;
        }
      }
    }

    initialized = true;
  })();

  return initPromise;
}

// ============================================================
// EVENT HANDLERS
// ============================================================

function attachListeners(torrent, dl) {
  if (!torrent) return;

  torrent.on('infoHash', () => {
    if (!dl.infoHash) {
      dl.infoHash = torrent.infoHash;
      saveState();
    }
  });

  torrent.on('ready', () => {
    dl.totalSize = torrent.length;
    if (!dl.name || dl.name === 'Jogo') dl.name = torrent.name || dl.name;
    dl.infoHash = torrent.infoHash;
    saveState();
    broadcast('torrent:progress', snapshot(dl, torrent));
  });

  torrent.on('download', () => {
    const now = Date.now();
    const last = lastBroadcast.get(dl.id) || 0;
    if (now - last < PROGRESS_BROADCAST_INTERVAL_MS) return;
    lastBroadcast.set(dl.id, now);

    dl.progress = torrent.progress;
    dl.downloadedSize = torrent.downloaded;
    dl.speed = torrent.downloadSpeed;
    dl.peers = torrent.numPeers;
    broadcast('torrent:progress', snapshot(dl, torrent));
  });

  torrent.on('done', () => {
    dl.progress = 1;
    dl.downloadedSize = torrent.length;
    dl.speed = 0;
    dl.status = 'completed';
    dl.completedAt = Date.now();
    saveState();
    broadcast('torrent:progress', snapshot(dl, torrent));
    broadcast('torrent:done', snapshot(dl, torrent));
    notifyDone(dl.name);
    // Hook de extração automática (Fase 9.x)
    try { onDownloadComplete && onDownloadComplete(dl); } catch (err) { console.warn('[torrent] post-process falhou:', err.message); }
  });

  torrent.on('error', (err) => {
    dl.status = 'failed';
    dl.error = err.message || String(err);
    saveState();
    broadcast('torrent:progress', snapshot(dl, torrent));
    notifyError(dl.name, dl.error);
  });
}

// ============================================================
// PUBLIC API
// ============================================================

async function add({ magnet, name, downloadDir }) {
  await init();

  if (!magnet || typeof magnet !== 'string' || !magnet.startsWith('magnet:')) {
    throw new Error('Magnet inválido');
  }

  // Detecta duplicado pelo magnet exato
  const existing = state.downloads.find((d) => d.magnet === magnet);
  if (existing) {
    return { id: existing.id, alreadyExists: true };
  }

  const id = crypto.randomUUID();
  const safeName = sanitizeName(name);
  // Pasta base = downloadDir custom (passado pelo dialog) OU default
  const baseDir = downloadDir && typeof downloadDir === 'string'
    ? downloadDir
    : DEFAULT_DOWNLOAD_DIR;
  const downloadPath = path.join(baseDir, safeName);

  fs.mkdirSync(downloadPath, { recursive: true });

  const dl = {
    id,
    magnet,
    infoHash: null,
    name: safeName,
    path: downloadPath,
    status: 'downloading',
    progress: 0,
    speed: 0,
    peers: 0,
    totalSize: 0,
    downloadedSize: 0,
    addedAt: Date.now(),
    completedAt: null,
  };

  state.downloads.push(dl);
  saveState();

  const torrent = client.add(magnet, { path: downloadPath });
  attachListeners(torrent, dl);

  broadcast('torrent:added', snapshot(dl, torrent));

  return { id, alreadyExists: false };
}

async function pause(id) {
  await init();
  const dl = findDownload(id);
  if (!dl) return false;
  if (dl.status !== 'downloading') return false;

  // WebTorrent v2 pause() não para o download de fato — só pausa peers novos.
  // Pra pause real: destruir o torrent (sem apagar arquivos). No resume, re-adiciona.
  const torrent = findTorrent(dl.infoHash);
  if (torrent) {
    await new Promise((resolve) => {
      try {
        torrent.destroy({ destroyStore: false }, () => resolve());
      } catch {
        resolve();
      }
    });
  }
  lastBroadcast.delete(id);

  dl.status = 'paused';
  dl.speed = 0;
  dl.peers = 0;
  saveState();
  broadcast('torrent:state', { id, status: 'paused', speed: 0, peers: 0 });
  return true;
}

async function resume(id) {
  await init();
  const dl = findDownload(id);
  if (!dl) return false;
  if (dl.status === 'completed') return false;

  // Limpa qualquer instância antiga que possa ter ficado pendurada
  const existing = findTorrent(dl.infoHash);
  if (existing) {
    await new Promise((resolve) => {
      try {
        existing.destroy({ destroyStore: false }, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  // Recria o torrent (WebTorrent verifica os pieces já baixados no disco
  // e retoma só os que faltam)
  fs.mkdirSync(dl.path, { recursive: true });
  const torrent = client.add(dl.magnet, { path: dl.path });
  attachListeners(torrent, dl);

  dl.status = 'downloading';
  dl.error = undefined;
  saveState();
  broadcast('torrent:state', { id, status: 'downloading' });
  return true;
}

async function remove(id, deleteFiles = false) {
  await init();
  const dl = findDownload(id);
  if (!dl) return false;

  const torrent = findTorrent(dl.infoHash);
  if (torrent) {
    await new Promise((resolve) => {
      try {
        torrent.destroy({ destroyStore: !!deleteFiles }, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  // Se deleteFiles, garante que a pasta foi removida
  if (deleteFiles) {
    try {
      fs.rmSync(dl.path, { recursive: true, force: true });
    } catch {}
  }

  state.downloads = state.downloads.filter((d) => d.id !== id);
  lastBroadcast.delete(id);
  saveState();
  broadcast('torrent:removed', { id });
  return true;
}

async function list() {
  // Não chama init() aqui pra deixar a UI carregar rápido —
  // se o client ainda não tá pronto, retorna o que tá em disco.
  return state.downloads.map((dl) => {
    const torrent = client ? findTorrent(dl.infoHash) : null;
    return snapshot(dl, torrent);
  });
}

// Pré-fetch de metadados de um magnet (pra mostrar tamanho ANTES de baixar).
// Adiciona o torrent num path temporário só pra resolver os metadados,
// destrói em seguida sem deixar resíduos.
const metadataCache = new Map(); // magnet → { size, name, files }

async function fetchMetadata(magnet, timeoutMs = 30000) {
  await init();

  if (!magnet || typeof magnet !== 'string' || !magnet.startsWith('magnet:')) {
    throw new Error('Magnet inválido');
  }

  // Cache hit
  if (metadataCache.has(magnet)) {
    return metadataCache.get(magnet);
  }

  // Se já tem um torrent ativo com esse magnet (download em andamento),
  // usa os metadados dele direto
  const existing = state.downloads.find((d) => d.magnet === magnet);
  if (existing && existing.totalSize > 0) {
    const meta = { size: existing.totalSize, name: existing.name, files: [] };
    metadataCache.set(magnet, meta);
    return meta;
  }

  // Caso contrário, adiciona temporariamente em pasta temp só pra metadata
  const tempDir = path.join(app.getPath('temp'), 'zhub-meta', crypto.randomBytes(8).toString('hex'));
  fs.mkdirSync(tempDir, { recursive: true });

  return new Promise((resolve, reject) => {
    let resolved = false;
    let torrent = null;

    const cleanup = () => {
      if (torrent && !torrent.destroyed) {
        try {
          torrent.destroy({ destroyStore: true }, () => {});
        } catch {}
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    };

    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(new Error('Timeout buscando metadados (sem peers)'));
    }, timeoutMs);

    try {
      torrent = client.add(magnet, { path: tempDir });

      torrent.on('ready', () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        const meta = {
          size: torrent.length,
          name: torrent.name,
          files: torrent.files.map((f) => ({ name: f.name, length: f.length })),
        };
        metadataCache.set(magnet, meta);
        cleanup();
        resolve(meta);
      });

      torrent.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        cleanup();
        reject(err);
      });
    } catch (err) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      cleanup();
      reject(err);
    }
  });
}

async function openFolder(id) {
  const dl = findDownload(id);
  if (!dl) return false;
  try {
    shell.openPath(dl.path);
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// SHUTDOWN
// ============================================================

async function shutdown() {
  if (!client) return;
  return new Promise((resolve) => {
    try {
      client.destroy(() => resolve());
    } catch {
      resolve();
    }
  });
}

// Callback chamado quando um download completa (registrado pelo main.js)
let onDownloadComplete = null;
function setOnDownloadComplete(fn) { onDownloadComplete = typeof fn === 'function' ? fn : null; }

module.exports = {
  init,
  add,
  pause,
  resume,
  remove,
  list,
  openFolder,
  fetchMetadata,
  shutdown,
  setOnDownloadComplete,
};
