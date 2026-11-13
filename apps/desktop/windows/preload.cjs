const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('startup', {
  subscribe: callback => { ipcRenderer.on('startup-status', (_event, value) => callback(value)); },
  retry: () => ipcRenderer.invoke('startup-retry'),
  logs: () => ipcRenderer.invoke('startup-logs'),
});
