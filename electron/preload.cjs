const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronDesktop', {
  isElectron: true,
  getOtaInfo: () => ipcRenderer.invoke('ota:info'),
  applyOtaUpdate: (url, version) => ipcRenderer.invoke('ota:apply', { url, version }),
  reloadBundle: () => ipcRenderer.invoke('ota:reload'),
  loadAllTables: () => ipcRenderer.invoke('db:loadAll'),
  saveTable: (tableName, data) => ipcRenderer.invoke('db:saveTable', { tableName, data }),
});
