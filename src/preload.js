'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const fn = (_e, data) => cb(data);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('studio', {
  init: () => ipcRenderer.invoke('app:init'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  connect: (username) => ipcRenderer.invoke('live:connect', username),
  disconnect: () => ipcRenderer.invoke('live:disconnect'),
  test: (type) => ipcRenderer.invoke('overlay:test', type),
  reloadOverlay: () => ipcRenderer.invoke('overlay:reload'),
  setPaused: (p) => ipcRenderer.invoke('overlay:pause', p),
  chua: (action, extra) => ipcRenderer.invoke('chua:command', { action, ...extra }),
  rap: (action, extra) => ipcRenderer.invoke('rap:command', { action, ...extra }),
  pickVideos: () => ipcRenderer.invoke('dialog:pickVideos'),
  onPause: on('pause:state'),
  restartServer: () => ipcRenderer.invoke('server:restart'),
  pickSound: (kind) => ipcRenderer.invoke('dialog:pickSound', kind),
  openOutput: () => ipcRenderer.invoke('output:open'),
  onOutput: on('output:state'),
  tiktokLogin: () => ipcRenderer.invoke('tiktok:login'),
  tiktokLogout: () => ipcRenderer.invoke('tiktok:logout'),
  copy: (text) => ipcRenderer.invoke('util:copy', text),
  openExternal: (url) => ipcRenderer.invoke('util:openExternal', url),
  onStatus: on('live:status'),
  onStats: on('live:stats'),
  onEvent: on('live:event'),
  onServer: on('server:state'),
  onPreviewReload: on('preview:reload'),
  onVuaGoLive: on('vua:goLive')
});
