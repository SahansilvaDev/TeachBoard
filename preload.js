const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, ...args) => cb(...args));

contextBridge.exposeInMainWorld('api', {
  openPdfDialog: () => ipcRenderer.invoke('open-pdf-dialog'),
  openBoardDialog: () => ipcRenderer.invoke('open-board-dialog'),
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog'),
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  readText: (p) => ipcRenderer.invoke('read-text', p),
  saveText: (opts) => ipcRenderer.invoke('save-text', opts),
  saveBinary: (opts) => ipcRenderer.invoke('save-binary', opts),
  recentList: () => ipcRenderer.invoke('recent-list'),
  annotLoad: (p) => ipcRenderer.invoke('annot-load', p),
  annotSave: (p, d) => ipcRenderer.invoke('annot-save', p, d),
  fetchImage: (url) => ipcRenderer.invoke('fetch-image', url),
  captureWebContents: (id) => ipcRenderer.invoke('capture-webcontents', id),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  inkOpen: () => ipcRenderer.invoke('ink-open'),
  inkClose: () => ipcRenderer.invoke('ink-close'),
  inkPassthrough: (on) => ipcRenderer.invoke('ink-passthrough', on),
  getPathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },

  onShortcut: on('shortcut'),
  onOpenPath: on('open-path'),
  onOpenUrlInTab: on('open-url-in-tab'),
  onWebImageToBoard: on('web-image-to-board'),
  onWebTextToBoard: on('web-text-to-board'),
  onWebSnapshotRequest: on('web-snapshot-request'),
  onFullscreenChanged: on('fullscreen-changed'),
});
