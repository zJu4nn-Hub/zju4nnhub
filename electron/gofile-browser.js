// gofile-browser.js — Cliente Gofile via BrowserWindow oculta.
//
// Gofile mudou a API e exige X-Website-Token gerado dinamicamente. A função
// generateWT() é ofuscada e tentamos rodá-la em VM, mas falhou. Solução
// confiável: carregar a página real do Gofile num Chromium oculto, deixar o
// JS deles popular `appdata.fileManager.mainContent`, extrair os dados.
//
// A BrowserWindow é criada UMA VEZ por sessão e reutilizada (warm). Após
// 5min sem uso, é fechada automaticamente pra liberar memória.

const { BrowserWindow, session } = require('electron');

// ============================================================
// STATE — BrowserWindow warm + cookie/token cacheados
// ============================================================
let warmWindow = null;
let warmIdleTimer = null;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos

function scheduleClose() {
  if (warmIdleTimer) clearTimeout(warmIdleTimer);
  warmIdleTimer = setTimeout(() => {
    if (warmWindow && !warmWindow.isDestroyed()) {
      warmWindow.destroy();
      console.log('[gofile-browser] janela warm fechada por inatividade');
    }
    warmWindow = null;
  }, IDLE_TIMEOUT_MS);
}

async function getWindow() {
  if (warmWindow && !warmWindow.isDestroyed()) {
    scheduleClose();
    return warmWindow;
  }

  // Sessão isolada pra não poluir cookies do app principal
  const partition = 'persist:gofile-bg';
  const sess = session.fromPartition(partition);

  // Bloqueia carregamento de imagens/ads/fontes pra acelerar (só precisamos do JS+JSON)
  sess.webRequest.onBeforeRequest((details, cb) => {
    const url = details.url;
    const isAd =
      /doubleclick|googlesyndication|adsystem|adcash|clickadu|popads|cleverad|galaksion|pubfuture|cointraffic/i.test(url);
    const isImg = /\.(png|jpg|jpeg|gif|webp|svg|woff2?|ttf|eot|ico)(\?|$)/i.test(url);
    if (isAd || isImg) return cb({ cancel: true });
    cb({});
  });

  warmWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      offscreen: false,
    },
  });

  // Quando a janela for fechada (manualmente ou idle), limpa
  warmWindow.on('closed', () => {
    warmWindow = null;
    if (warmIdleTimer) { clearTimeout(warmIdleTimer); warmIdleTimer = null; }
  });

  scheduleClose();
  return warmWindow;
}

// ============================================================
// WAIT HELPER — espera uma expressão JS retornar truthy
// ============================================================
async function waitFor(win, expression, { timeout = 15000, interval = 200 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const result = await win.webContents.executeJavaScript(expression, true);
      if (result) return result;
    } catch {}
    await new Promise((r) => setTimeout(r, interval));
  }
  return null;
}

// ============================================================
// GET CONTENTS — carrega gofile.io/d/{id} e extrai dados
// ============================================================
async function getContents(folderId) {
  const win = await getWindow();
  const url = `https://gofile.io/d/${folderId}`;

  // Navega pra página
  try {
    await win.loadURL(url);
  } catch (err) {
    console.warn('[gofile-browser] loadURL falhou:', err.message);
    return null;
  }

  // Espera o appdata.fileManager.mainContent ficar populado
  // (tem id, name e children quando carregou)
  const data = await waitFor(
    win,
    `(()=>{
      try {
        const mc = window.appdata?.fileManager?.mainContent;
        if (!mc || !mc.id) return null;
        if (mc.type !== 'folder') return mc;
        if (!mc.children || Object.keys(mc.children).length === 0) return null;
        return mc;
      } catch (e) { return null; }
    })()`,
    { timeout: 20000, interval: 300 }
  );

  if (!data) {
    console.warn('[gofile-browser] timeout esperando appdata');
    return null;
  }

  // Extrai accountToken do localStorage/cookie da sessão (usado pelo download)
  let accountToken = null;
  try {
    accountToken = await win.webContents.executeJavaScript(
      `(()=>{
        try {
          // Account token tá em appdata.accounts[<active>]
          const accs = window.appdata?.accounts || {};
          for (const key of Object.keys(accs)) {
            if (accs[key]?.token) return accs[key].token;
          }
          // Fallback: cookie
          const m = document.cookie.match(/accountToken=([^;]+)/);
          return m ? m[1] : null;
        } catch (e) { return null; }
      })()`,
      true
    );
  } catch {}

  const children = data.children || {};
  const files = Object.values(children)
    .filter((c) => c && c.type === 'file')
    .map((c) => ({
      id: c.id,
      name: c.name,
      size: typeof c.size === 'number' ? c.size : 0,
      link: c.link,
      mimetype: c.mimetype,
    }));

  scheduleClose(); // reset idle timer

  return {
    folderName: data.name,
    files,
    totalSize: files.reduce((acc, f) => acc + (f.size || 0), 0),
    accountToken,
  };
}

// ============================================================
// CLEANUP (ao fechar app)
// ============================================================
function shutdown() {
  if (warmIdleTimer) { clearTimeout(warmIdleTimer); warmIdleTimer = null; }
  if (warmWindow && !warmWindow.isDestroyed()) {
    warmWindow.destroy();
  }
  warmWindow = null;
}

module.exports = { getContents, shutdown };
