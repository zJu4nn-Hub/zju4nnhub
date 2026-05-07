// zJu4nn Hub — Preload script
// Bridge segura entre o renderer (UI) e o main process (Node).
// Renderer NUNCA acessa Node direto. Toda chamada nativa passa por aqui.

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  // Janela (titlebar custom)
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onStateChange: (cb) => {
      const listener = (_evt, state) => cb(state);
      ipcRenderer.on('window:state', listener);
      return () => ipcRenderer.removeListener('window:state', listener);
    },
  },

  // Sistema
  system: {
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
    showInFolder: (path) => ipcRenderer.invoke('system:showInFolder', path),
    pickFolder: (defaultPath) => ipcRenderer.invoke('system:pickFolder', defaultPath),
    getDiskSpace: (path) => ipcRenderer.invoke('system:getDiskSpace', path),
  },

  // Installer (detecta repacker e roda setup/game.exe)
  installer: {
    detect: (folderPath) => ipcRenderer.invoke('installer:detect', folderPath),
    run: ({ exePath, asAdmin = true }) =>
      ipcRenderer.invoke('installer:run', { exePath, asAdmin }),
  },

  // Steam Search (Steam Store API)
  // Host resolvers (Pixeldrain, Gofile metadata via main process — sem CORS)
  host: {
    getSize: (url) => ipcRenderer.invoke('host:getSize', url),
    getPixeldrainInfo: (fileId) => ipcRenderer.invoke('host:getPixeldrainInfo', fileId),
    getGofileContents: (folderId) => ipcRenderer.invoke('host:getGofileContents', folderId),
  },

  // Steam catalog (sync diário do catálogo Steam completo via IStoreService)
  steamCatalog: {
    isInCatalog: (appid) => ipcRenderer.invoke('steamCatalog:isInCatalog', appid),
    getGameName: (appid) => ipcRenderer.invoke('steamCatalog:getGameName', appid),
    getStatus: () => ipcRenderer.invoke('steamCatalog:getStatus'),
    sync: (opts) => ipcRenderer.invoke('steamCatalog:sync', opts),
  },

  steam: {
    search: (term) => ipcRenderer.invoke('steam:search', term),
    details: (appid) => ipcRenderer.invoke('steam:details', appid),
  },

  // Steam Tools (Lua import + Millennium framework)
  steamTools: {
    detectSteam: () => ipcRenderer.invoke('steamtools:detectSteam'),
    detectInstall: () => ipcRenderer.invoke('steamtools:detectInstall'),
    countLua: () => ipcRenderer.invoke('steamtools:countLua'),
    listLua: () => ipcRenderer.invoke('steamtools:listLua'),
    hasLuaForApp: (appid) => ipcRenderer.invoke('steamtools:hasLuaForApp', appid),
    install: () => ipcRenderer.invoke('steamtools:install'),
    addGame: ({ appid, name }) => ipcRenderer.invoke('steamtools:addGame', { appid, name }),
    removeGame: (appid) => ipcRenderer.invoke('steamtools:removeGame', appid),
    restartSteam: () => ipcRenderer.invoke('steamtools:restartSteam'),
    getState: (appid) => ipcRenderer.invoke('steamtools:getState', appid),

    onState: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('steam-tools:state', listener);
      return () => ipcRenderer.removeListener('steam-tools:state', listener);
    },
  },

  // Sources (fontes externas de jogos)
  sources: {
    list: () => ipcRenderer.invoke('sources:list'),
    add: ({ name, url }) => ipcRenderer.invoke('sources:add', { name, url }),
    addFromFile: () => ipcRenderer.invoke('sources:addFromFile'),
    remove: (id) => ipcRenderer.invoke('sources:remove', id),
    setEnabled: ({ id, enabled }) =>
      ipcRenderer.invoke('sources:setEnabled', { id, enabled }),
    sync: (id) => ipcRenderer.invoke('sources:sync', id),
    syncAll: () => ipcRenderer.invoke('sources:syncAll'),
    getMergedAdditions: () => ipcRenderer.invoke('sources:getMergedAdditions'),
  },

  // Settings (persistência simples em userData/settings.json)
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
    update: (partial) => ipcRenderer.invoke('settings:update', partial),
  },

  // App
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  },

  // Torrent engine (Fase 3 — implementado)
  torrent: {
    add: ({ magnet, name, downloadDir }) =>
      ipcRenderer.invoke('torrent:add', { magnet, name, downloadDir }),
    pause: (id) => ipcRenderer.invoke('torrent:pause', id),
    resume: (id) => ipcRenderer.invoke('torrent:resume', id),
    remove: ({ id, deleteFiles = false }) =>
      ipcRenderer.invoke('torrent:remove', { id, deleteFiles }),
    list: () => ipcRenderer.invoke('torrent:list'),
    openFolder: (id) => ipcRenderer.invoke('torrent:openFolder', id),
    fetchMetadata: (magnet) => ipcRenderer.invoke('torrent:fetchMetadata', magnet),

    // Listeners — retornam função pra desinscrever
    onAdded: (cb) => {
      const listener = (_evt, dl) => cb(dl);
      ipcRenderer.on('torrent:added', listener);
      return () => ipcRenderer.removeListener('torrent:added', listener);
    },
    onProgress: (cb) => {
      const listener = (_evt, dl) => cb(dl);
      ipcRenderer.on('torrent:progress', listener);
      return () => ipcRenderer.removeListener('torrent:progress', listener);
    },
    onState: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('torrent:state', listener);
      return () => ipcRenderer.removeListener('torrent:state', listener);
    },
    onDone: (cb) => {
      const listener = (_evt, dl) => cb(dl);
      ipcRenderer.on('torrent:done', listener);
      return () => ipcRenderer.removeListener('torrent:done', listener);
    },
    onRemoved: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('torrent:removed', listener);
      return () => ipcRenderer.removeListener('torrent:removed', listener);
    },
  },

  // HTTP downloader (Pixeldrain, Gofile via session.downloadURL)
  http: {
    add: ({ url, name, downloadDir }) =>
      ipcRenderer.invoke('http:add', { url, name, downloadDir }),
    pause: (id) => ipcRenderer.invoke('http:pause', id),
    resume: (id) => ipcRenderer.invoke('http:resume', id),
    remove: ({ id, deleteFiles = false }) =>
      ipcRenderer.invoke('http:remove', { id, deleteFiles }),
    list: () => ipcRenderer.invoke('http:list'),
    openFolder: (id) => ipcRenderer.invoke('http:openFolder', id),
    isSupported: (url) => ipcRenderer.invoke('http:isSupported', url),
    detectHost: (url) => ipcRenderer.invoke('http:detectHost', url),

    onAdded: (cb) => {
      const listener = (_evt, dl) => cb(dl);
      ipcRenderer.on('http:added', listener);
      return () => ipcRenderer.removeListener('http:added', listener);
    },
    onProgress: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('http:progress', listener);
      return () => ipcRenderer.removeListener('http:progress', listener);
    },
    onState: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('http:state', listener);
      return () => ipcRenderer.removeListener('http:state', listener);
    },
    onDone: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('http:done', listener);
      return () => ipcRenderer.removeListener('http:done', listener);
    },
    onRemoved: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('http:removed', listener);
      return () => ipcRenderer.removeListener('http:removed', listener);
    },
  },

  // Library (Fase 7): playtime tracker + launch
  library: {
    launchSteamTools: ({ appid }) => ipcRenderer.invoke('library:launchSteamTools', { appid }),
    launchAppDownload: ({ id, exePath }) =>
      ipcRenderer.invoke('library:launchAppDownload', { id, exePath }),
    getPlaytime: (key) => ipcRenderer.invoke('library:getPlaytime', key),
    listSessions: () => ipcRenderer.invoke('library:listSessions'),
    readSteamLastPlayed: ({ appid, steamPath } = {}) =>
      ipcRenderer.invoke('library:readSteamLastPlayed', { appid, steamPath }),
    readSteamSizeOnDisk: ({ appid, steamPath } = {}) =>
      ipcRenderer.invoke('library:readSteamSizeOnDisk', { appid, steamPath }),
    isSteamGameInstalled: ({ appid, steamPath } = {}) =>
      ipcRenderer.invoke('library:isSteamGameInstalled', { appid, steamPath }),
    autoDetectGameExe: ({ appid, steamPath } = {}) =>
      ipcRenderer.invoke('library:autoDetectGameExe', { appid, steamPath }),
    autoDetectExeInFolder: (folderPath) =>
      ipcRenderer.invoke('library:autoDetectExeInFolder', folderPath),
    endSession: (key) => ipcRenderer.invoke('library:endSession', key),
    resetPlaytime: (key) => ipcRenderer.invoke('library:resetPlaytime', key),
    removePlaytime: (key) => ipcRenderer.invoke('library:removePlaytime', key),

    onState: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('library:state', listener);
      return () => ipcRenderer.removeListener('library:state', listener);
    },
  },
  // Achievements (Fase 9.x: schema Steam + watchers de unlock)
  achievements: {
    getSchema: (appid, opts) => ipcRenderer.invoke('achievements:getSchema', { appid, opts }),
    getCachedSchema: (appid) => ipcRenderer.invoke('achievements:getCachedSchema', appid),
    refreshSchema: (appid) => ipcRenderer.invoke('achievements:refreshSchema', appid),
    getProgress: (key) => ipcRenderer.invoke('achievements:getProgress', key),
    getProgressSync: (key) => ipcRenderer.invoke('achievements:getProgressSync', key),
    getStats: () => ipcRenderer.invoke('achievements:getStats'),
    tickWatcher: (key) => ipcRenderer.invoke('achievements:tickWatcher', key),
    scanOnce: ({ key, appid, exePath }) => ipcRenderer.invoke('achievements:scanOnce', { key, appid, exePath }),
    onUnlocked: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('achievements:unlocked', listener);
      return () => ipcRenderer.removeListener('achievements:unlocked', listener);
    },
    onState: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('achievements:state', listener);
      return () => ipcRenderer.removeListener('achievements:state', listener);
    },
  },

  // Updater (Fase 13: auto-update via GitHub Releases)
  updater: {
    installNow: () => ipcRenderer.invoke('updater:installNow'),
    onAvailable: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('updater:available', listener);
      return () => ipcRenderer.removeListener('updater:available', listener);
    },
    onProgress: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('updater:progress', listener);
      return () => ipcRenderer.removeListener('updater:progress', listener);
    },
    onReady: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('updater:ready', listener);
      return () => ipcRenderer.removeListener('updater:ready', listener);
    },
  },

  // Friends (Fase 10: sistema de amigos via Supabase)
  friends: {
    search: (query) => ipcRenderer.invoke('friends:search', query),
    send: (targetUserId) => ipcRenderer.invoke('friends:send', targetUserId),
    respond: ({ requesterId, accept }) => ipcRenderer.invoke('friends:respond', { requesterId, accept }),
    cancel: (targetUserId) => ipcRenderer.invoke('friends:cancel', targetUserId),
    remove: (friendId) => ipcRenderer.invoke('friends:remove', friendId),
    block: (targetId) => ipcRenderer.invoke('friends:block', targetId),
    list: () => ipcRenderer.invoke('friends:list'),
    listPending: () => ipcRenderer.invoke('friends:listPending'),
    getProfile: (userId) => ipcRenderer.invoke('friends:profile', userId),
    setHandle: (handle) => ipcRenderer.invoke('friends:setHandle', handle),
    setPrivacy: (isPrivate) => ipcRenderer.invoke('friends:setPrivacy', isPrivate),
    compareAchievements: ({ friendId, appid }) => ipcRenderer.invoke('friends:compareAch', { friendId, appid }),
    onState: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('friends:state', listener);
      return () => ipcRenderer.removeListener('friends:state', listener);
    },
    onListChanged: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('friends:listChanged', listener);
      return () => ipcRenderer.removeListener('friends:listChanged', listener);
    },
  },

  // Manual library (Fase 9.x: jogos adicionados manualmente sem download via app)
  manualLibrary: {
    add: ({ appid, name }) => ipcRenderer.invoke('manualLibrary:add', { appid, name }),
    remove: (appid) => ipcRenderer.invoke('manualLibrary:remove', appid),
    has: (appid) => ipcRenderer.invoke('manualLibrary:has', appid),
    list: () => ipcRenderer.invoke('manualLibrary:list'),
  },

  // Cover cache (Fase 9.x: cacheia URL de capa que funcionou pra cada appid)
  coverCache: {
    get: (appid) => ipcRenderer.invoke('coverCache:get', appid),
    set: ({ appid, url }) => ipcRenderer.invoke('coverCache:set', { appid, url }),
    remove: (appid) => ipcRenderer.invoke('coverCache:remove', appid),
    listAll: () => ipcRenderer.invoke('coverCache:listAll'),
  },

  // Game overrides (Fase 9: config por jogo — exePath, displayName)
  gameOverrides: {
    get: (key) => ipcRenderer.invoke('gameOverrides:get', key),
    set: ({ key, patch }) => ipcRenderer.invoke('gameOverrides:set', { key, patch }),
    remove: (key) => ipcRenderer.invoke('gameOverrides:remove', key),
    listAll: () => ipcRenderer.invoke('gameOverrides:listAll'),
    pickExe: () => ipcRenderer.invoke('gameOverrides:pickExe'),
  },

  // Auth (Fase 8: Login Discord via Supabase)
  auth: {
    signInDiscord: () => ipcRenderer.invoke('auth:signInDiscord'),
    cancelSignIn: () => ipcRenderer.invoke('auth:cancelSignIn'),
    signOut: () => ipcRenderer.invoke('auth:signOut'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
    getProfile: () => ipcRenderer.invoke('auth:getProfile'),
    updateProfile: (patch) => ipcRenderer.invoke('auth:updateProfile', patch),
    uploadImage: ({ kind, filePath }) => ipcRenderer.invoke('auth:uploadImage', { kind, filePath }),
    pickImage: () => ipcRenderer.invoke('auth:pickImage'),
    onState: (cb) => {
      const listener = (_evt, payload) => cb(payload);
      ipcRenderer.on('auth:state', listener);
      return () => ipcRenderer.removeListener('auth:state', listener);
    },
  },
};

contextBridge.exposeInMainWorld('zhub', api);
