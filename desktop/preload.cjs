const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('maokiDesktop', {
  info: () => ipcRenderer.invoke('app:info'),
  setThemeSource: value => ipcRenderer.invoke('app:set-theme-source', value),
  openExternal: url => ipcRenderer.invoke('app:open-external', url),
});
