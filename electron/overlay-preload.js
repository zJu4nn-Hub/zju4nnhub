// overlay-preload.js — Bridge segura pra janela overlay de notificação
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zhubOverlay', {
  onAchievement: (cb) => {
    const listener = (_evt, payload) => cb(payload);
    ipcRenderer.on('overlay:achievement', listener);
    return () => ipcRenderer.removeListener('overlay:achievement', listener);
  },
  onFriend: (cb) => {
    const listener = (_evt, payload) => cb(payload);
    ipcRenderer.on('overlay:friend', listener);
    return () => ipcRenderer.removeListener('overlay:friend', listener);
  },
  notifyShown: () => ipcRenderer.send('overlay:shown'),
});
