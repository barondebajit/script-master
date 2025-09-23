const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scriptAPI', {
  list: () => ipcRenderer.invoke('scripts:list'),
  get: (id) => ipcRenderer.invoke('scripts:get', id),
  save: (script) => ipcRenderer.invoke('scripts:save', script),
  delete: (id) => ipcRenderer.invoke('scripts:delete', id),
  run: (id) => ipcRenderer.invoke('scripts:run', id),
  stop: (id) => ipcRenderer.invoke('scripts:stop', id),
  onOutput: (cb) => {
    ipcRenderer.removeAllListeners('scripts:run:output');
    ipcRenderer.on('scripts:run:output', (_, data) => cb(data));
  }
});
