// zJu4nn Hub — Main process (Electron)
// Cria a janela, intercepta links externos, expõe IPC seguro pro renderer.

const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
// Auto-updater (lazy require — só carrega em produção)
let autoUpdater = null;
const torrentEngine = require('./torrent-engine');
const settings = require('./settings');
const installer = require('./installer');
const sources = require('./sources');
const steamSearch = require('./steam-search');
const steamTools = require('./steam-tools');
const hostResolvers = require('./host-resolvers');
const httpDownloader = require('./http-downloader');
const steamCatalog = require('./steam-catalog');
const library = require('./library');
const auth = require('./auth');
const gameOverrides = require('./game-overrides');
const coverCache = require('./cover-cache');
const extractor = require('./extractor');
const manualLibrary = require('./manual-library');
const achievementSchema = require('./achievement-schema');
const achievements = require('./achievements');
const friends = require('./friends');

const isDev = !app.isPackaged;
let mainWindow = null;
let overlayWindow = null;

// ----- Janela overlay (notificação flutuante por cima de jogos) -----
function createOverlayWindow() {
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const W = 420, H = 380;
  overlayWindow = new BrowserWindow({
    width: W,
    height: H,
    x: display.workArea.x + display.workArea.width - W - 10,
    y: display.workArea.y + 10,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  // Garante que fica acima de jogos fullscreen
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'overlay', 'notification.html'));
  overlayWindow.on('closed', () => { overlayWindow = null; });
}

// Mostra um toast no overlay window (genérico — kind define template)
let overlayHideTimer = null;
function showOverlay(kind, payload) {
  try {
    if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow();
    if (!overlayWindow.isVisible()) overlayWindow.showInactive();
    overlayWindow.webContents.send(`overlay:${kind}`, payload);
    if (overlayHideTimer) clearTimeout(overlayHideTimer);
    overlayHideTimer = setTimeout(() => {
      try { if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide(); } catch {}
    }, 6500);
  } catch (err) {
    console.warn('[main] overlay show falhou:', err.message);
  }
}
function showAchievementOverlay(payload) { showOverlay('achievement', payload); }
function showFriendOverlay(payload) {
  // payload: { kind: 'requestReceived'|'accepted', other: {username, avatar_url, ...} }
  showOverlay('friend', payload);
}
ipcMain.on('overlay:shown', () => {
  if (overlayHideTimer) clearTimeout(overlayHideTimer);
  overlayHideTimer = setTimeout(() => {
    try { if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide(); } catch {}
  }, 6500);
});

// ----- Single instance lock (não abre 2 janelas se user clicar 2x no atalho) -----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ----- Janela principal -----
function createWindow() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    backgroundColor: '#08060d',
    show: false,
    icon: iconPath,
    title: 'zJu4nn Hub',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  // Carrega o renderer
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Mostra só quando tá pronto pra evitar flash branco
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // DevTools NÃO abre automático — abre só se ZHUB_DEVTOOLS=1 ou via F12.
    // Isso evita o tooltip de "tamanho da janela" do Chromium ao maximizar/restaurar.
    if (isDev && process.env.ZHUB_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Atalhos de teclado:
  // - Em dev: F12 toggle DevTools, Ctrl+R recarrega
  // - Em produção: bloqueia F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S, Ctrl+R
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = input.key?.toLowerCase();

    if (isDev) {
      // F12 ou Ctrl+Shift+I → toggle DevTools
      if (key === 'f12' || (input.control && input.shift && key === 'i')) {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
        return;
      }
      // Ctrl+R recarrega (útil após editar arquivos do renderer)
      if (input.control && !input.shift && key === 'r') {
        mainWindow.webContents.reload();
        event.preventDefault();
        return;
      }
      // Ctrl+Shift+R hard reload
      if (input.control && input.shift && key === 'r') {
        mainWindow.webContents.reloadIgnoringCache();
        event.preventDefault();
        return;
      }
    } else {
      // Produção: bloqueia atalhos de inspeção
      const blockedDev = key === 'f12'
        || (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c'))
        || (input.control && (key === 'u' || key === 's' || key === 'r'));
      if (blockedDev) {
        event.preventDefault();
        return;
      }
    }
  });

  // Intercepta TODA tentativa de abrir nova janela / window.open / target=_blank
  // → manda pro browser do sistema operacional, nunca abre janela Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('magnet:')) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  // Bloqueia navegação dentro da janela pra URLs externas (também redireciona)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();
    // Permite apenas navegação dentro do file:// (renderer interno)
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });

  // Em produção: bloqueia menu de contexto (right-click)
  if (!isDev) {
    mainWindow.webContents.on('context-menu', (event) => event.preventDefault());
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Eventos de maximize/restore — renderer precisa saber pra trocar ícone do botão
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:state', { isMaximized: true });
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:state', { isMaximized: false });
  });
}

// ----- IPC Handlers (Fase 1: só janela e sistema) -----

// Window controls (custom titlebar)
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }
  mainWindow.maximize();
  return true;
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

// Sistema
ipcMain.handle('system:openExternal', async (_evt, url) => {
  if (typeof url !== 'string') return false;
  if (!/^(https?:|magnet:|mailto:|steam:)/i.test(url)) return false;
  try {
    await shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('system:showInFolder', (_evt, fullPath) => {
  if (typeof fullPath !== 'string') return false;
  shell.showItemInFolder(fullPath);
  return true;
});

// Pasta picker (dialog nativo do Windows)
ipcMain.handle('system:pickFolder', async (_evt, defaultPath) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolha a pasta de download',
    defaultPath: defaultPath || undefined,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  return result.filePaths[0];
});

// Espaço em disco — usa check-disk-space (multi-platform)
ipcMain.handle('system:getDiskSpace', async (_evt, dirPath) => {
  try {
    // import dinâmico — check-disk-space exporta default em ESM
    const mod = await import('check-disk-space');
    const checkDiskSpace = mod.default;
    // Se a pasta não existe ainda, usa o drive raiz
    const fs = require('node:fs');
    let target = dirPath;
    while (target && !fs.existsSync(target)) {
      const parent = path.dirname(target);
      if (parent === target) break;
      target = parent;
    }
    if (!target) target = path.parse(dirPath || 'C:\\').root;
    const info = await checkDiskSpace(target);
    return { free: info.free, size: info.size, path: info.diskPath };
  } catch (err) {
    return { error: err.message };
  }
});

// ----- Installer IPC -----
ipcMain.handle('installer:detect', (_evt, folderPath) => installer.detect(folderPath));
ipcMain.handle('installer:run', (_evt, payload) => {
  const { exePath, asAdmin } = payload || {};
  return installer.run({ exePath, asAdmin });
});

// ----- Sources IPC -----
ipcMain.handle('sources:list', () => sources.list());
ipcMain.handle('sources:add', (_evt, payload) => {
  try {
    return sources.add(payload || {});
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('sources:addFromFile', async () => {
  try {
    return await sources.addFromFile();
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('sources:remove', (_evt, id) => sources.remove(id));
ipcMain.handle('sources:setEnabled', (_evt, payload) => {
  const { id, enabled } = payload || {};
  return sources.setEnabled(id, enabled);
});
ipcMain.handle('sources:sync', async (_evt, id) => {
  try {
    return await sources.sync(id);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('sources:syncAll', async () => sources.syncAll());
ipcMain.handle('sources:getMergedAdditions', () => sources.getMergedAdditions());

// ----- Steam Tools IPC -----
ipcMain.handle('steamtools:detectSteam', () => steamTools.detectSteamPath());
ipcMain.handle('steamtools:detectInstall', () => steamTools.detectSteamTools());
ipcMain.handle('steamtools:countLua', () => steamTools.countInstalledLuaApps());
ipcMain.handle('steamtools:listLua', () => steamTools.listInstalledLuaApps());
ipcMain.handle('steamtools:hasLuaForApp', (_evt, appid) => steamTools.hasLuaForApp(appid));
ipcMain.handle('steamtools:install', async () => {
  try {
    return await steamTools.installSteamTools();
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('steamtools:addGame', async (_evt, payload) => {
  try {
    return await steamTools.addGameToSteam(payload || {});
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('steamtools:removeGame', async (_evt, appid) => {
  try {
    return await steamTools.removeGameFromSteam(appid);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('steamtools:restartSteam', async () => {
  try {
    return await steamTools.restartSteam();
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('steamtools:getState', (_evt, appid) => steamTools.getState(appid));

// ----- Host Resolvers IPC (size/metadata pra direct download hosts) -----
ipcMain.handle('host:getSize', async (_evt, url) => {
  try {
    return await hostResolvers.getSize(url);
  } catch {
    return null;
  }
});
ipcMain.handle('host:getPixeldrainInfo', async (_evt, fileId) => {
  return await hostResolvers.getPixeldrainInfo(fileId);
});
ipcMain.handle('host:getGofileContents', async (_evt, folderId) => {
  return await hostResolvers.getGofileContents(folderId);
});

// ----- Steam Catalog IPC (sync diário do catálogo completo) -----
ipcMain.handle('steamCatalog:isInCatalog', (_evt, appid) => steamCatalog.isInCatalog(appid));
ipcMain.handle('steamCatalog:getGameName', (_evt, appid) => steamCatalog.getGameName(appid));
ipcMain.handle('steamCatalog:getStatus', () => steamCatalog.getStatus());
ipcMain.handle('steamCatalog:sync', async (_evt, opts) => steamCatalog.sync(opts || {}));

// ----- Steam Search IPC -----
ipcMain.handle('steam:search', async (_evt, term) => {
  try {
    return await steamSearch.search(term);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('steam:details', async (_evt, appid) => {
  try {
    return await steamSearch.details(appid);
  } catch (err) {
    return { error: err.message };
  }
});

// ----- Settings IPC -----
ipcMain.handle('settings:get', (_evt, key) => settings.get(key));
ipcMain.handle('settings:set', (_evt, payload) => {
  const { key, value } = payload || {};
  return settings.set(key, value);
});
ipcMain.handle('settings:update', (_evt, partial) => settings.update(partial || {}));

// App info
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPlatform', () => process.platform);

// ----- Torrent IPC -----
ipcMain.handle('torrent:add', async (_evt, payload) => {
  try {
    const { magnet, name, downloadDir } = payload || {};
    return await torrentEngine.add({ magnet, name, downloadDir });
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('torrent:pause', async (_evt, id) => torrentEngine.pause(id));
ipcMain.handle('torrent:resume', async (_evt, id) => torrentEngine.resume(id));
ipcMain.handle('torrent:remove', async (_evt, payload) => {
  const { id, deleteFiles } = payload || {};
  return torrentEngine.remove(id, !!deleteFiles);
});
ipcMain.handle('torrent:list', async () => torrentEngine.list());
ipcMain.handle('torrent:openFolder', async (_evt, id) => torrentEngine.openFolder(id));
ipcMain.handle('torrent:fetchMetadata', async (_evt, magnet) => {
  try {
    return await torrentEngine.fetchMetadata(magnet);
  } catch (err) {
    return { error: err.message };
  }
});

// ----- HTTP Downloader IPC (Pixeldrain, Gofile via session.downloadURL) -----
ipcMain.handle('http:add', async (_evt, payload) => {
  try {
    const { url, name, downloadDir } = payload || {};
    return await httpDownloader.add({ url, name, downloadDir });
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('http:pause', async (_evt, id) => httpDownloader.pause(id));
ipcMain.handle('http:resume', async (_evt, id) => httpDownloader.resume(id));
ipcMain.handle('http:remove', async (_evt, payload) => {
  const { id, deleteFiles } = payload || {};
  return httpDownloader.remove(id, !!deleteFiles);
});
ipcMain.handle('http:list', async () => httpDownloader.list());
ipcMain.handle('http:openFolder', async (_evt, id) => httpDownloader.openFolder(id));
ipcMain.handle('http:isSupported', async (_evt, url) => httpDownloader.isSupported(url));
ipcMain.handle('http:detectHost', async (_evt, url) => httpDownloader.detectHost(url));

// ----- Library IPC (playtime tracker + launch) -----
ipcMain.handle('library:launchSteamTools', async (_evt, payload) => {
  try {
    const { appid, steamPath } = payload || {};
    let p = steamPath;
    if (!p) {
      try { p = await steamTools.detectSteamPath(); } catch {}
    }
    return await library.launchSteamTools({ appid, steamPath: p });
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('library:launchAppDownload', async (_evt, payload) => {
  try {
    return await library.launchAppDownload(payload || {});
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('library:getPlaytime', (_evt, key) => library.getPlaytime(key));
ipcMain.handle('library:listSessions', () => library.listSessions());
ipcMain.handle('library:readSteamLastPlayed', async (_evt, payload) => {
  const { appid, steamPath } = payload || {};
  let p = steamPath;
  if (!p) {
    try { p = await steamTools.detectSteamPath(); } catch {}
  }
  return library.readSteamLastPlayed(appid, p);
});
ipcMain.handle('library:readSteamSizeOnDisk', async (_evt, payload) => {
  const { appid, steamPath } = payload || {};
  let p = steamPath;
  if (!p) {
    try { p = await steamTools.detectSteamPath(); } catch {}
  }
  return library.readSteamSizeOnDisk(appid, p);
});
ipcMain.handle('library:endSession', (_evt, key) => library.endSession(key));
ipcMain.handle('library:resetPlaytime', (_evt, key) => library.resetPlaytime(key));
ipcMain.handle('library:removePlaytime', (_evt, key) => library.removePlaytime(key));
ipcMain.handle('library:isSteamGameInstalled', async (_evt, payload) => {
  const { appid, steamPath } = payload || {};
  let p = steamPath;
  if (!p) { try { p = await steamTools.detectSteamPath(); } catch {} }
  return library.isSteamGameInstalled(appid, p);
});
ipcMain.handle('library:autoDetectExeInFolder', async (_evt, folderPath) => {
  return library.autoDetectExeInFolder(folderPath);
});
ipcMain.handle('library:autoDetectGameExe', async (_evt, payload) => {
  const { appid, steamPath } = payload || {};
  let p = steamPath;
  if (!p) { try { p = await steamTools.detectSteamPath(); } catch {} }
  return library.autoDetectGameExe(appid, p);
});

// ----- Achievements (Fase 9.x) -----
ipcMain.handle('achievements:getSchema', async (_evt, payload) => {
  const { appid, opts } = payload || {};
  return achievementSchema.getSchema(appid, opts || {});
});
ipcMain.handle('achievements:getCachedSchema', (_evt, appid) => achievementSchema.getCached(appid));
ipcMain.handle('achievements:refreshSchema', async (_evt, appid) => {
  return achievementSchema.getSchema(appid, { force: true });
});
ipcMain.handle('achievements:getProgress', async (_evt, key) => achievements.getProgress(key));
ipcMain.handle('achievements:getProgressSync', (_evt, key) => achievements.getProgressSync(key));
ipcMain.handle('achievements:getStats', () => achievements.getStats());
ipcMain.handle('achievements:tickWatcher', async (_evt, key) => achievements.tickWatcher(key));
ipcMain.handle('achievements:scanOnce', async (_evt, payload) => achievements.scanOnce(payload || {}));

// ----- Manual library (jogos adicionados manualmente, sem download via app) -----
ipcMain.handle('manualLibrary:add', (_evt, payload) => {
  const { appid, name } = payload || {};
  return manualLibrary.add({ appid, name });
});
ipcMain.handle('manualLibrary:remove', (_evt, appid) => manualLibrary.remove(appid));
ipcMain.handle('manualLibrary:has', (_evt, appid) => manualLibrary.has(appid));
ipcMain.handle('manualLibrary:list', () => manualLibrary.list());

// ----- Cover cache (URLs de capas pré-resolvidas) -----
ipcMain.handle('coverCache:get', (_evt, appid) => coverCache.get(appid));
ipcMain.handle('coverCache:set', (_evt, payload) => {
  const { appid, url } = payload || {};
  return coverCache.set(appid, url);
});
ipcMain.handle('coverCache:remove', (_evt, appid) => coverCache.remove(appid));
ipcMain.handle('coverCache:listAll', () => coverCache.listAll());

// ----- Game overrides (config por jogo) -----
ipcMain.handle('gameOverrides:get', (_evt, key) => gameOverrides.get(key));
ipcMain.handle('gameOverrides:set', (_evt, payload) => {
  const { key, patch } = payload || {};
  return gameOverrides.set(key, patch || {});
});
ipcMain.handle('gameOverrides:remove', (_evt, key) => gameOverrides.remove(key));
ipcMain.handle('gameOverrides:listAll', () => gameOverrides.listAll());
// Picker de .exe específico pra config (filtra exec)
ipcMain.handle('gameOverrides:pickExe', async () => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolha o executável do jogo',
    filters: [{ name: 'Executável', extensions: ['exe', 'bat', 'cmd', 'lnk'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths?.[0]) return null;
  return r.filePaths[0];
});

// ----- Auth IPC (Fase 8: Login Discord via Supabase) -----
ipcMain.handle('auth:signInDiscord', async () => {
  try {
    return await auth.signInWithDiscord();
  } catch (err) {
    return { error: err.message || String(err) };
  }
});
ipcMain.handle('auth:cancelSignIn', () => {
  try { return auth.cancelSignIn(); } catch (err) { return { error: err.message }; }
});
ipcMain.handle('auth:signOut', async () => {
  try { return await auth.signOut(); } catch (err) { return { error: err.message }; }
});
ipcMain.handle('auth:getSession', async () => {
  try { return await auth.getSession(); } catch { return null; }
});
ipcMain.handle('auth:getProfile', async () => {
  try { return await auth.getProfile(); } catch { return null; }
});
ipcMain.handle('auth:updateProfile', async (_evt, patch) => {
  try { return await auth.updateProfile(patch || {}); } catch (err) { return { error: err.message }; }
});
ipcMain.handle('auth:uploadImage', async (_evt, payload) => {
  try { return await auth.uploadImage(payload || {}); } catch (err) { return { error: err.message }; }
});
// Picker de arquivo (image): retorna path absoluto ou null
ipcMain.handle('auth:pickImage', async () => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolha uma imagem',
    filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths?.[0]) return null;
  return r.filePaths[0];
});

// ----- FRIENDS IPC (Fase 10) -----
ipcMain.handle('friends:search', async (_evt, query) => {
  try { return await friends.searchUsers(query); }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('friends:send', async (_evt, targetUserId) => {
  try { return await friends.sendRequest(targetUserId); }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('friends:respond', async (_evt, payload) => {
  try { return await friends.respondRequest(payload || {}); }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('friends:cancel', async (_evt, targetUserId) => {
  try { return await friends.cancelRequest(targetUserId); }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('friends:remove', async (_evt, friendId) => {
  try { return await friends.removeFriend(friendId); }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('friends:block', async (_evt, targetId) => {
  try { return await friends.blockUser(targetId); }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('friends:list', async () => friends.listFriends());
ipcMain.handle('friends:listPending', async () => friends.listPending());
ipcMain.handle('friends:profile', async (_evt, userId) => friends.getUserProfile(userId));
ipcMain.handle('friends:setHandle', async (_evt, handle) => {
  try { return await friends.setHandle(handle); }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('friends:setPrivacy', async (_evt, isPrivate) => {
  try { return await friends.setPrivacy(isPrivate); }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('friends:compareAch', async (_evt, payload) => {
  try { return await friends.compareAchievements(payload || {}); }
  catch (err) { return { error: err.message }; }
});

// Carrega tokens dos arquivos *.txt (se não tiverem salvos no settings)
function loadTokenFromFile(settingKey, fileName) {
  if (settings.get(settingKey)) return;
  const tokenFile = path.join(__dirname, '..', '..', 'Site zJu4nnTools', 'Sobre mim (zJu4nn)', fileName);
  try {
    const fs = require('node:fs');
    if (fs.existsSync(tokenFile)) {
      const key = fs.readFileSync(tokenFile, 'utf8').trim();
      if (key) {
        settings.set(settingKey, key);
        console.log(`[main] ${settingKey} carregado de ${fileName}`);
      }
    }
  } catch (err) {
    console.warn(`[main] não consegui ler ${fileName}:`, err.message);
  }
}

// Carrega de env var (settings.json não tinha) — usado em build/release com vars setadas
function loadTokenFromEnv(settingKey, envName) {
  if (settings.get(settingKey)) return;
  const v = process.env[envName];
  if (v && v.trim()) {
    settings.set(settingKey, v.trim());
    console.log(`[main] ${settingKey} carregado de env ${envName}`);
  }
}

// Carrega de bundle.json (gerado em build time com tokens embutidos no .asar)
function loadTokenFromBundle(settingKey, bundleKey) {
  if (settings.get(settingKey)) return;
  try {
    const bundlePath = path.join(__dirname, 'token-bundle.json');
    if (!fs.existsSync(bundlePath)) return;
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    if (bundle[bundleKey] && String(bundle[bundleKey]).trim()) {
      settings.set(settingKey, String(bundle[bundleKey]).trim());
      console.log(`[main] ${settingKey} carregado de token-bundle`);
    }
  } catch {}
}

function ensureSteamApiKey() {
  loadTokenFromBundle('steamApiKey', 'steamApiKey');
  loadTokenFromEnv('steamApiKey', 'STEAM_API_KEY');
  loadTokenFromFile('steamApiKey', 'Token Steam.txt'); // fallback dev local
}

function ensureSourceDKey() {
  loadTokenFromBundle('sourceDKey', 'sourceDKey');
  loadTokenFromEnv('sourceDKey', 'SOURCE_D_KEY');
  loadTokenFromFile('sourceDKey', 'Token Source D.txt');
}

function ensureImgbbKey() {
  loadTokenFromBundle('imgbbKey', 'imgbbKey');
  loadTokenFromEnv('imgbbKey', 'IMGBB_KEY');
  loadTokenFromFile('imgbbKey', 'Token imgbb.txt');
}

// ----- Lifecycle -----
app.whenReady().then(async () => {
  createWindow();
  // Carrega tokens (se ainda não estiverem salvos nas settings)
  ensureSteamApiKey();
  ensureSourceDKey();
  ensureImgbbKey();
  // Inicializa HTTP downloader (precisa do mainWindow pra emitir eventos)
  httpDownloader.init(mainWindow);
  // Inicializa Steam Catalog (carrega do disco + sync background se stale)
  steamCatalog.init().catch((err) => console.error('[main] steamCatalog init falhou:', err.message));
  // Inicializa biblioteca (playtime tracker, sessions órfãs)
  library.init(mainWindow).catch((err) => console.error('[main] library init falhou:', err.message));
  // Inicializa overrides
  try { gameOverrides.init(); } catch (err) { console.error('[main] gameOverrides init falhou:', err.message); }
  // Inicializa cache de URLs de capas (Fase 9.x)
  try { coverCache.init(); } catch (err) { console.error('[main] coverCache init falhou:', err.message); }
  // Inicializa biblioteca manual (jogos adicionados sem download via app)
  try { manualLibrary.init(); } catch (err) { console.error('[main] manualLibrary init falhou:', err.message); }
  // Inicializa cache de schemas de conquistas (Steam Web API) e orquestrador
  try { achievementSchema.init(); } catch (err) { console.error('[main] ach-schema init falhou:', err.message); }
  try { achievements.init(mainWindow, { onUnlock: showAchievementOverlay }); } catch (err) { console.error('[main] achievements init falhou:', err.message); }
  // Liga o ticker em background — escaneia jogos sem sessão ativa a cada 30s
  try { achievements.startBackgroundTicker(); } catch (err) { console.error('[main] background ticker falhou:', err.message); }
  // Inicializa Sistema de Amigos (Fase 10) — espera auth montar a sessão
  try {
    friends.setOnFriendOverlayHook(showFriendOverlay);
    // Atrasamos init de friends pra esperar auth conectar
    setTimeout(() => {
      friends.init(mainWindow).catch((err) => console.error('[main] friends init falhou:', err.message));
    }, 1500);
  } catch (err) { console.error('[main] friends setup falhou:', err.message); }
  // Cria a janela overlay (escondida; aparece quando uma conquista desbloqueia)
  try { createOverlayWindow(); } catch (err) { console.error('[main] overlay window falhou:', err.message); }

  // ----- Auto-updater (Fase 13) — só roda em produção -----
  if (!isDev) {
    try {
      autoUpdater = require('electron-updater').autoUpdater;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on('checking-for-update', () => console.log('[updater] checking…'));
      autoUpdater.on('update-available', (info) => {
        console.log('[updater] update available:', info.version);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updater:available', { version: info.version });
        }
      });
      autoUpdater.on('update-not-available', () => console.log('[updater] no update'));
      autoUpdater.on('error', (err) => console.warn('[updater] erro:', err.message));
      autoUpdater.on('download-progress', (p) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updater:progress', {
            percent: Math.round(p.percent),
            transferred: p.transferred,
            total: p.total,
          });
        }
      });
      autoUpdater.on('update-downloaded', (info) => {
        console.log('[updater] downloaded:', info.version);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updater:ready', { version: info.version });
        }
      });
      // Checa por update 10s após boot, depois a cada 4h
      setTimeout(() => autoUpdater.checkForUpdates().catch((e) => console.warn('[updater]', e.message)), 10_000);
      setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
    } catch (err) {
      console.error('[main] auto-updater init falhou:', err.message);
    }
  }
  // IPC pra renderer disparar instalação manualmente (botão "Reiniciar e atualizar")
  ipcMain.handle('updater:installNow', () => {
    if (autoUpdater) {
      try { autoUpdater.quitAndInstall(false, true); return { ok: true }; }
      catch (err) { return { error: err.message }; }
    }
    return { error: 'Auto-updater indisponível' };
  });

  // ----- Auto-extração de archives + auto-detect .exe pós-download -----
  async function postDownloadProcess(dl, kind) {
    const folderPath = dl.path || dl.downloadDir;
    if (!folderPath) return;
    const downloadId = dl.id;
    const overrideKey = `dl_${downloadId}`;

    const stt = settings.get();
    if (stt.autoExtract) {
      try {
        const result = await extractor.extractAllInFolder(folderPath, {
          deleteAfter: !!stt.deleteArchiveAfterExtract,
        });
        if (result.extracted.length > 0) {
          console.log(`[main] extração ok — ${result.extracted.length} archive(s) extraído(s)`);
          // Notifica renderer pra re-render biblioteca (path mudou de conteúdo)
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(`${kind}:done`, { id: downloadId });
          }
        }
        if (result.errors.length > 0) {
          console.warn('[main] extração com erros:', result.errors);
        }
      } catch (err) {
        console.warn('[main] extractAllInFolder falhou:', err.message);
      }
    }

    // Auto-detect .exe na pasta (após extração) e salva como override
    let resolvedAppid = null;
    try {
      // Não sobrescreve se user já configurou manualmente
      const existing = gameOverrides.get(overrideKey);
      if (!existing || !existing.exePath) {
        const exePath = library.autoDetectExeInFolder(folderPath);
        if (exePath) {
          gameOverrides.set(overrideKey, { exePath });
          console.log(`[main] auto-detect post-extract: salvou exePath=${exePath}`);
        }
      }
    } catch (err) {
      console.warn('[main] auto-detect post-extract falhou:', err.message);
    }

    // Auto-cleanup: se existe entry na manualLibrary com appid que bate com o download,
    // remove ela (evita duplicação na biblioteca: lib_{appid} + dl_{id} pro mesmo jogo)
    try {
      const all = manualLibrary.list();
      const dlName = (dl.name || '').toLowerCase().trim();
      // Heurística simples: nome similar (sem precisar de Steam search aqui)
      for (const m of all) {
        const mname = (m.name || '').toLowerCase().trim();
        if (mname && dlName.includes(mname)) {
          manualLibrary.remove(m.appid);
          console.log(`[main] auto-cleanup manual lib: removeu ${m.name} (appid ${m.appid}) por download bater`);
        }
      }
    } catch (err) {
      console.warn('[main] auto-cleanup manual lib falhou:', err.message);
    }
  }
  try { torrentEngine.setOnDownloadComplete?.((dl) => postDownloadProcess(dl, 'torrent')); } catch {}
  try { httpDownloader.setOnDownloadComplete?.((dl) => postDownloadProcess(dl, 'http')); } catch {}
  // Inicializa auth (Supabase + Discord OAuth)
  try { auth.init(mainWindow); } catch (err) { console.error('[main] auth init falhou:', err.message); }
  // Inicializa o engine de torrent em background — não bloqueia a UI
  torrentEngine.init().catch((err) => {
    console.error('[main] Falha ao inicializar torrent engine:', err.message);
  });
});

// Kill switch — se shutdown demorar muito, força quit pra evitar processos zombie
let isQuitting = false;
function forceKillIn(ms) {
  setTimeout(() => {
    console.log('[main] kill switch — forçando exit');
    try { app.exit(0); } catch {}
    try { process.exit(0); } catch {}
  }, ms).unref?.();
}

app.on('before-quit', async (event) => {
  if (isQuitting) return;
  isQuitting = true;
  // KILL SWITCH: se nada disso terminar em 3s, force exit
  forceKillIn(3000);

  // Limpa todos os timers de achievements (background ticker + watchers)
  try { achievements.stopBackgroundTicker?.(); } catch {}
  try { achievements.shutdown(); } catch {}
  try { achievementSchema.shutdown(); } catch {}
  try { coverCache.shutdown(); } catch {}

  // Friends — Realtime channels (com timeout)
  try {
    await Promise.race([
      friends.shutdown(),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
  } catch {}

  // Torrent engine (com timeout)
  try {
    await Promise.race([
      torrentEngine.shutdown(),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {}

  // Fecha overlay window manualmente (mainWindow já fecha ao quit)
  try { if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy(); } catch {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    // Garante que se quit demorar, kill em 3s
    forceKillIn(3000);
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Segurança extra: bloqueia novas janelas em qualquer webContents
app.on('web-contents-created', (_evt, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|magnet:)/i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });
});
