// gofile-client.js — Cliente Gofile usando o JS ofuscado deles num Node VM.
//
// Gofile mudou a API: agora exige header `X-Website-Token` gerado dinamicamente
// pela função `generateWT(token)` do wt.obf.js (ofuscado pra anti-scraping).
//
// Solução: baixamos o wt.obf.js, rodamos num sandbox VM, chamamos generateWT.
// Sem precisar de BrowserWindow (verificado: o código não usa window/document/etc).

const vm = require('node:vm');
const { net } = require('electron');

// ============================================================
// HTTP HELPER (electron.net, sem CORS)
// ============================================================
function httpRequest(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, method: opts.method || 'GET', redirect: 'follow' });
    req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    req.setHeader('Accept', 'application/json, */*');
    if (opts.headers) {
      for (const [k, v] of Object.entries(opts.headers)) req.setHeader(k, v);
    }

    let data = '';
    let timer;
    req.on('response', (resp) => {
      if (resp.statusCode >= 400) {
        req.abort();
        reject(new Error(`HTTP ${resp.statusCode}`));
        return;
      }
      resp.on('data', (chunk) => { data += chunk.toString('utf8'); });
      resp.on('end', () => { clearTimeout(timer); resolve(data); });
      resp.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
    req.on('error', (err) => { clearTimeout(timer); reject(err); });
    timer = setTimeout(() => { req.abort(); reject(new Error('Timeout (15s)')); }, opts.timeout || 15000);
    req.end();
  });
}

// ============================================================
// STATE (cacheado pra sessão inteira)
// ============================================================
let cachedToken = null;
let cachedWT = null;
let generateWTFn = null;
let initPromise = null;

// ============================================================
// CARREGA O wt.obf.js E COMPILA generateWT NUM VM SANDBOX
// ============================================================
async function loadGenerateWT() {
  if (generateWTFn) return generateWTFn;

  const code = await httpRequest('https://gofile.io/dist/js/wt.obf.js');

  // Sandbox mínimo: o wt.obf.js é JS puro, mas alguns ofuscadores acessam
  // globalThis/window — colocamos placeholders pra não quebrar.
  const sandbox = {
    window: {},
    globalThis: {},
    self: {},
  };
  sandbox.window.window = sandbox.window;
  sandbox.globalThis.globalThis = sandbox.globalThis;

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { timeout: 5000 });

  // generateWT pode ter sido exportada como global no sandbox ou em window
  const fn = sandbox.generateWT || sandbox.window.generateWT || sandbox.globalThis.generateWT;
  if (typeof fn !== 'function') {
    throw new Error('generateWT não encontrada após executar wt.obf.js');
  }
  generateWTFn = fn;
  return fn;
}

// ============================================================
// AUTH — cria conta anônima + computa WT
// ============================================================
async function ensureAuth() {
  if (cachedToken && cachedWT) return { token: cachedToken, wt: cachedWT };
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Cria account anônimo
    const accRaw = await httpRequest('https://api.gofile.io/accounts', { method: 'POST' });
    const accJson = JSON.parse(accRaw);
    const token = accJson?.data?.token;
    if (!token) throw new Error('Falha ao criar account Gofile');

    // Carrega generateWT e computa WT
    const generateWT = await loadGenerateWT();
    const wt = generateWT(token);
    if (!wt || typeof wt !== 'string') {
      throw new Error('generateWT retornou valor inválido');
    }

    cachedToken = token;
    cachedWT = wt;
    return { token, wt };
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

// ============================================================
// API: getContents — lista arquivos numa pasta
// ============================================================
async function getContents(folderId) {
  const { token, wt } = await ensureAuth();

  // Endpoint atual usa query params (não wt na URL)
  const params = new URLSearchParams({
    contentFilter: '',
    page: '1',
    pageSize: '1000',
    sortField: 'createTime',
    sortDirection: '-1',
  });
  const url = `https://api.gofile.io/contents/${folderId}?${params.toString()}`;

  const raw = await httpRequest(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Website-Token': wt,
      'X-BL': 'en-US',
    },
  });
  const json = JSON.parse(raw);

  if (json?.status !== 'ok' && json?.status !== 'error-notFound') {
    throw new Error(`Gofile API: ${json?.status || 'unknown error'}`);
  }
  if (json?.status === 'error-notFound') return null;

  const children = json?.data?.children || {};
  const files = Object.values(children).map((c) => ({
    id: c.id,
    name: c.name,
    size: typeof c.size === 'number' ? c.size : 0,
    link: c.link,
    mimetype: c.mimetype,
  }));

  return {
    folderName: json?.data?.name,
    files,
    totalSize: files.reduce((acc, f) => acc + (f.size || 0), 0),
    // Cookie precisa ser passado nos downloads
    cookie: { name: 'accountToken', value: token, domain: '.gofile.io' },
  };
}

module.exports = { getContents, ensureAuth };
