// host-resolvers.js — Resolve URLs de hosts de download (Pixeldrain, Gofile, etc)
// pra metadata (tamanho, nome) e URLs diretas pra download via IPC.
//
// Roda no MAIN PROCESS (electron.net.request não tem CORS restriction).

const { net } = require('electron');
const gofileBrowser = require('./gofile-browser');

// ============================================================
// HTTP HELPER (electron.net, sem CORS)
// ============================================================
function httpRequest(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = net.request({
      url,
      method: opts.method || 'GET',
      redirect: 'follow',
    });
    req.setHeader('User-Agent', 'Mozilla/5.0 zJu4nn-Hub/1.0');
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
      resp.on('end', () => {
        clearTimeout(timer);
        resolve(data);
      });
      resp.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
    req.on('error', (err) => { clearTimeout(timer); reject(err); });

    timer = setTimeout(() => {
      req.abort();
      reject(new Error('Timeout (12s)'));
    }, opts.timeout || 12000);

    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ============================================================
// PIXELDRAIN
// ============================================================
async function getPixeldrainInfo(fileId) {
  try {
    const raw = await httpRequest(`https://pixeldrain.com/api/file/${fileId}/info`);
    const json = JSON.parse(raw);
    if (!json) return null;
    return {
      host: 'pixeldrain',
      name: json.name,
      size: json.size,
      // URL direta de download
      directUrl: `https://pixeldrain.com/api/file/${fileId}?download`,
    };
  } catch {
    return null;
  }
}

// ============================================================
// GOFILE — delegado pro gofile-client (que lida com WT dinâmico via VM)
// ============================================================
async function getGofileContents(folderId) {
  try {
    const result = await gofileBrowser.getContents(folderId);
    if (!result) return null;
    return { host: 'gofile', ...result };
  } catch (err) {
    console.warn('[gofile] getContents falhou:', err.message);
    return null;
  }
}

// ============================================================
// DISPATCHER POR URL
// ============================================================
async function getSize(url) {
  if (typeof url !== 'string') return null;

  const pd = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9]+)/);
  if (pd) {
    const info = await getPixeldrainInfo(pd[1]);
    return info?.size ?? null;
  }

  const gf = url.match(/gofile\.io\/d\/([a-zA-Z0-9]+)/);
  if (gf) {
    const info = await getGofileContents(gf[1]);
    return info?.totalSize ?? null;
  }

  return null;
}

module.exports = {
  getSize,
  getPixeldrainInfo,
  getGofileContents,
};
