// sources.js — Gerencia fontes externas de jogos (Hydra/Kazumi format).
//
// Storage:
//   userData/sources.json           → meta de todas as fontes (lista)
//   userData/source-cache/{id}.json → cache local do JSON baixado
//
// Format suportado (Hydra/Kazumi):
//   { name: "FitGirl", downloads: [{ title, uris[], uploadDate, fileSize }] }
//
// Esse módulo:
//   - Lista/adiciona/remove fontes
//   - Sincroniza (faz fetch do JSON e salva no cache)
//   - Devolve um array combinado pra o renderer mesclar com o catálogo oficial

const { app, net, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SOURCES_FILE = path.join(app.getPath('userData'), 'sources.json');
const CACHE_DIR = path.join(app.getPath('userData'), 'source-cache');

// Cloudflare Worker proxy do zJu4nn — bypassa CloudFlare WAF em fontes que permitem CF-to-CF.
// Algumas fontes (hydralinks.cloud) bloqueiam até esse caminho — pra elas usar file import.
const PROXY_URL = 'https://zju4nnhub-source-proxy.zju4nnhub.workers.dev/';

let sources = []; // [{ id, name, url, addedAt, lastSyncedAt, gameCount, enabled }]
let loaded = false;

function load() {
  if (loaded) return sources;
  loaded = true;
  try {
    if (fs.existsSync(SOURCES_FILE)) {
      const raw = fs.readFileSync(SOURCES_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) sources = parsed;
    }
  } catch (err) {
    console.error('[sources] load falhou:', err.message);
  }
  return sources;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(SOURCES_FILE), { recursive: true });
    fs.writeFileSync(SOURCES_FILE, JSON.stringify(sources, null, 2));
  } catch (err) {
    console.error('[sources] save falhou:', err.message);
  }
}

function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(id) {
  return path.join(CACHE_DIR, `${id}.json`);
}

function readCache(id) {
  try {
    const file = cachePath(id);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error('[sources] readCache falhou:', err.message);
    return null;
  }
}

function writeCache(id, data) {
  try {
    ensureCacheDir();
    fs.writeFileSync(cachePath(id), JSON.stringify(data));
  } catch (err) {
    console.error('[sources] writeCache falhou:', err.message);
  }
}

function deleteCache(id) {
  try {
    const file = cachePath(id);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}
}

// ============================================================
// PUBLIC API
// ============================================================

function list() {
  load();
  return sources.map((s) => ({ ...s }));
}

function add({ name, url }) {
  load();
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error('URL inválida (precisa começar com http:// ou https://)');
  }
  // Não permite duplicado pelo URL
  if (sources.some((s) => s.url === url)) {
    throw new Error('Essa URL já foi adicionada');
  }
  const id = crypto.randomBytes(8).toString('hex');
  const entry = {
    id,
    name: (name || '').trim() || 'Sem nome',
    url,
    addedAt: Date.now(),
    lastSyncedAt: null,
    gameCount: 0,
    enabled: true,
  };
  sources.push(entry);
  save();
  return entry;
}

// Adiciona fonte a partir de arquivo .json local (dialog de file picker no main)
async function addFromFile() {
  const { dialog, BrowserWindow } = require('electron');
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    title: 'Selecionar arquivo da fonte (.json)',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return null;
  }
  const filePath = result.filePaths[0];

  // Tenta ler e parsear pra validar antes de adicionar
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Não consegui ler o arquivo: ${err.message}`);
  }

  // Stub temporário pra parser ser feliz
  const tempMeta = { id: 'temp', name: 'Importado' };
  let parsed;
  try {
    parsed = parseSource(raw, tempMeta);
  } catch (err) {
    throw new Error(`Arquivo inválido: ${err.message}`);
  }

  load();
  const id = crypto.randomBytes(8).toString('hex');
  // Usamos URL com prefixo file:// pra reconhecer fonte local
  const url = 'file:///' + filePath.replace(/\\/g, '/');

  // Já adiciona com o nome sugerido pelo JSON (se houver)
  const name = parsed.suggestedName || path.basename(filePath, '.json');

  if (sources.some((s) => s.url === url)) {
    throw new Error('Esse arquivo já foi importado');
  }

  const entry = {
    id,
    name,
    url,
    addedAt: Date.now(),
    lastSyncedAt: Date.now(),
    gameCount: parsed.games.length,
    enabled: true,
  };
  sources.push(entry);
  save();

  // Já salva no cache (não precisa rodar sync)
  writeCache(id, parsed.games);

  return entry;
}

function remove(id) {
  load();
  const before = sources.length;
  sources = sources.filter((s) => s.id !== id);
  if (sources.length === before) return false;
  save();
  deleteCache(id);
  return true;
}

function setEnabled(id, enabled) {
  load();
  const s = sources.find((x) => x.id === id);
  if (!s) return false;
  s.enabled = !!enabled;
  save();
  return true;
}

// Detecta se o conteúdo retornado é uma página de desafio CloudFlare
function isCloudflareChallenge(content) {
  if (!content || typeof content !== 'string') return false;
  return /just a moment|cloudflare|cf-challenge|<title>just a moment/i.test(content.slice(0, 1000));
}

// Fallback: usa uma janela invisível do Electron pra carregar a URL como navegador real.
// Cloudflare resolve o desafio JS sozinho (é Chromium nativo). Polling 1s/45s pra capturar
// o JSON quando aparecer (CF pode redirecionar várias vezes).
function fetchUrlViaBrowser(url) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let pollInterval = null;
    const POLL_MS = 1000;
    const TOTAL_TIMEOUT = 45000;

    const win = new BrowserWindow({
      show: false,
      width: 1024,
      height: 768,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    const finish = (action) => {
      if (resolved) return;
      resolved = true;
      if (pollInterval) clearInterval(pollInterval);
      clearTimeout(timeout);
      try { if (!win.isDestroyed()) win.destroy(); } catch {}
      action();
    };

    const timeout = setTimeout(() => {
      finish(() => reject(new Error('Timeout (45s) — CloudFlare não liberou')));
    }, TOTAL_TIMEOUT);

    const startPolling = () => {
      if (pollInterval) return;
      console.log('[sources] BrowserWindow: iniciando polling do conteúdo…');
      pollInterval = setInterval(async () => {
        if (resolved || win.isDestroyed()) return;
        try {
          const content = await win.webContents.executeJavaScript(`
            (function() {
              const pre = document.querySelector('pre');
              if (pre) return pre.textContent || '';
              return document.body ? (document.body.innerText || document.body.textContent || '') : '';
            })()
          `);

          if (resolved) return;
          if (!content || content.length < 20) return; // ainda carregando
          if (isCloudflareChallenge(content)) return;  // ainda no desafio CF

          // Tenta validar como JSON
          try {
            JSON.parse(content);
            console.log('[sources] BrowserWindow: JSON capturado (', content.length, 'bytes)');
            finish(() => resolve(content));
          } catch {
            // Não é JSON ainda — pode estar em estado intermediário (HTML)
            // Mantém polling
          }
        } catch {
          // executeJavaScript falha durante navegação. Ignora e tenta de novo.
        }
      }, POLL_MS);
    };

    win.webContents.on('did-finish-load', startPolling);
    win.webContents.on('did-navigate', startPolling);
    win.webContents.on('did-fail-load', (_evt, code, desc) => {
      // -3 = ABORT (redirecionamento). Ignora.
      if (code === -3) return;
      finish(() => reject(new Error(`Falha ao carregar: ${desc} (${code})`)));
    });

    win.loadURL(url, {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    }).catch((err) => {
      finish(() => reject(err));
    });
  });
}

// HTTP fetch usando net (do Electron) — bypassa CORS e funciona offline-resiliente
// Adiciona headers de navegador pra evitar 403 em servidores que bloqueiam UAs genéricos
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET', redirect: 'follow' });

    // Headers que fazem parecer um navegador real (Chrome no Windows)
    request.setHeader('User-Agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    request.setHeader('Accept', 'application/json, text/plain, */*');
    request.setHeader('Accept-Language', 'pt-BR,pt;q=0.9,en;q=0.8');
    request.setHeader('Accept-Encoding', 'identity'); // sem gzip pra evitar dor de cabeça
    request.setHeader('Cache-Control', 'no-cache');

    let data = '';
    let timeoutId;

    request.on('response', (response) => {
      if (response.statusCode >= 400) {
        // Lê o body do erro pra ajudar no debug
        let errBody = '';
        response.on('data', (chunk) => { errBody += chunk.toString('utf8'); });
        response.on('end', () => {
          clearTimeout(timeoutId);
          const snippet = errBody.slice(0, 200).trim();
          reject(new Error(`HTTP ${response.statusCode}${snippet ? ` — ${snippet}` : ''}`));
        });
        return;
      }
      response.on('data', (chunk) => { data += chunk.toString('utf8'); });
      response.on('end', () => {
        clearTimeout(timeoutId);
        resolve(data);
      });
      response.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    });

    request.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });

    timeoutId = setTimeout(() => {
      request.abort();
      reject(new Error('Timeout (15s)'));
    }, 15000);

    request.end();
  });
}

// Parser do formato Hydra/Kazumi
function parseSource(raw, sourceMeta) {
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error('JSON inválido: ' + err.message);
  }

  // Suporte aos formatos:
  //   { name, downloads: [...] }     → Hydra/Kazumi padrão
  //   [...] direto                   → fallback se a fonte for um array puro
  let downloads;
  let nameFromJson = null;
  if (Array.isArray(json)) {
    downloads = json;
  } else if (json && Array.isArray(json.downloads)) {
    downloads = json.downloads;
    nameFromJson = json.name || null;
  } else {
    throw new Error('Formato não reconhecido (esperado { name, downloads: [...] })');
  }

  // Normaliza cada item
  const games = [];
  for (const d of downloads) {
    if (!d || typeof d !== 'object') continue;
    const title = (d.title || '').trim();
    const uris = Array.isArray(d.uris) ? d.uris.filter((u) => typeof u === 'string' && u.length > 0) : [];
    if (!title || uris.length === 0) continue;
    games.push({
      title,
      uris,
      uploadDate: d.uploadDate || null,
      fileSize: d.fileSize || null,
      sourceId: sourceMeta.id,
      sourceName: sourceMeta.name,
    });
  }

  return { games, suggestedName: nameFromJson };
}

async function sync(id) {
  load();
  const source = sources.find((s) => s.id === id);
  if (!source) throw new Error('Fonte não encontrada');

  let raw;

  // Se for fonte LOCAL (arquivo importado), apenas releia do disco do user
  if (source.url.startsWith('file://')) {
    try {
      const filePath = source.url.replace(/^file:\/\//, '').replace(/\//g, path.sep);
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      throw new Error(`Não consegui ler o arquivo: ${err.message}`);
    }
  } else {
    // Estratégia em cascata:
    //   1) net.request direto (rápido, mas falha se CloudFlare bloquear residencial IP)
    //   2) Vercel proxy (servidor → servidor, contorna CF na maioria dos casos)
    //   3) BrowserWindow real (último recurso, requer JS challenge resolver)
    raw = null;

    // 1ª tentativa: direto
    try {
      const direct = await fetchUrl(source.url);
      if (!isCloudflareChallenge(direct)) {
        raw = direct;
        console.log('[sources] sync OK direto:', source.url);
      } else {
        console.log('[sources] direto retornou CloudFlare challenge, tentando proxy…');
      }
    } catch (err) {
      console.log('[sources] direto falhou (', err.message, '), tentando proxy…');
    }

    // 2ª tentativa: Vercel proxy
    if (!raw) {
      const proxiedUrl = `${PROXY_URL}?url=${encodeURIComponent(source.url)}`;
      try {
        const viaProxy = await fetchUrl(proxiedUrl);
        if (!isCloudflareChallenge(viaProxy)) {
          raw = viaProxy;
          console.log('[sources] sync OK via proxy Vercel:', source.url);
        } else {
          console.log('[sources] proxy também retornou CF challenge');
        }
      } catch (err) {
        console.log('[sources] proxy Vercel falhou (', err.message, '), tentando BrowserWindow…');
      }
    }

    // 3ª tentativa: BrowserWindow (real Chromium)
    if (!raw) {
      try {
        raw = await fetchUrlViaBrowser(source.url);
      } catch (err) {
        throw new Error(`Não consegui buscar (proxy Vercel + BrowserWindow falharam): ${err.message}`);
      }
    }

    if (isCloudflareChallenge(raw)) {
      throw new Error('CloudFlare bloqueou em todos os caminhos. Use "Importar .json" como fallback.');
    }
  }

  const parsed = parseSource(raw, source);

  // Se a fonte declarou um nome no JSON e o user deixou genérico, usa o do JSON
  if (parsed.suggestedName && (!source.name || source.name === 'Sem nome')) {
    source.name = parsed.suggestedName;
  }

  source.lastSyncedAt = Date.now();
  source.gameCount = parsed.games.length;
  save();

  writeCache(id, parsed.games);

  return { gameCount: parsed.games.length, name: source.name };
}

async function syncAll() {
  load();
  const results = [];
  for (const s of sources) {
    if (!s.enabled) continue;
    try {
      const res = await sync(s.id);
      results.push({ id: s.id, name: s.name, ok: true, ...res });
    } catch (err) {
      results.push({ id: s.id, name: s.name, ok: false, error: err.message });
    }
  }
  return results;
}

// Devolve TODOS os jogos das fontes habilitadas, mesclados em um array só.
// Usado pelo renderer pra extender o catálogo oficial.
function getMergedAdditions() {
  load();
  const out = [];
  for (const s of sources) {
    if (!s.enabled) continue;
    const cached = readCache(s.id);
    if (Array.isArray(cached)) {
      out.push(...cached);
    }
  }
  return out;
}

module.exports = {
  list,
  add,
  addFromFile,
  remove,
  setEnabled,
  sync,
  syncAll,
  getMergedAdditions,
};
