const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cifradorDesktop', {
  isDesktop: true,
  platform: process.platform,
  storage: {
    getItem: (key) => ipcRenderer.sendSync('storage:get', key),
    setItem: (key, value) => ipcRenderer.sendSync('storage:set', key, value),
  },
  ai: {
    request: (action, body) => ipcRenderer.invoke('ai:request', action, body),
  },
});
