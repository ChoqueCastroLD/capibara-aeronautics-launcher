const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  getState: () => ipcRenderer.invoke('state:get'),
  saveState: (data) => ipcRenderer.invoke('state:save', data),
  getTotalRamGB: () => ipcRenderer.invoke('system:totalRamGB'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  detectGpus: () => ipcRenderer.invoke('gpu:detect'),
  detectJava: () => ipcRenderer.invoke('java:detect'),
  downloadJava: () => ipcRenderer.invoke('java:download'),
  browseJava: () => ipcRenderer.invoke('java:browse'),
  onJavaProgress: (cb) => ipcRenderer.on('java:progress', (_e, v) => cb(v)),

  installModpack: (opts) => ipcRenderer.invoke('modpack:install', opts),
  uninstallModpack: () => ipcRenderer.invoke('modpack:uninstall'),
  onInstallProgress: (cb) => ipcRenderer.on('install:progress', (_e, v) => cb(v)),

  launchGame: (opts) => ipcRenderer.invoke('game:launch', opts),
  killGame: () => ipcRenderer.invoke('game:kill'),
  openGameDir: () => ipcRenderer.invoke('game:openDir'),
  listMods: () => ipcRenderer.invoke('mods:list'),
  onGameLog: (cb) => ipcRenderer.on('game:log', (_e, v) => cb(v)),
  onGameClosed: (cb) => ipcRenderer.on('game:closed', (_e, code) => cb(code)),

  copyLogs: () => ipcRenderer.invoke('logs:copy'),
  openLogs: () => ipcRenderer.invoke('logs:open'),

  setMapVisible: (visible) => ipcRenderer.send('window:setMapVisible', visible),

  getSkin: (username) => ipcRenderer.invoke('skin:get', username),

  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  pingServer: () => ipcRenderer.invoke('server:ping'),
});
