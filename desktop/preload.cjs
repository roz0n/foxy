// The only thing the dashboard can ask of the desktop app. Preloads in a sandboxed window have to be CommonJS.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('foxyDesktop', {
  /** The MetaMask Mobile folder Foxy is using, or '' when none is chosen. */
  folder: () => ipcRenderer.invoke('foxy:folder'),
  /** Opens the folder picker (the same as File > Switch MetaMask Mobile Folder…). */
  switchFolder: () => ipcRenderer.invoke('foxy:switch-folder'),
});
