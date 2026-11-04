'use strict';
const path = require('path');
const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, nativeTheme } = require('electron');
const { Settings } = require('./settings');
const { LiveService, friendlyError } = require('./live');
const { OverlayServer } = require('./server');

app.setName('MyStudioLive');
// Giữ nguyên thư mục dữ liệu cũ (settings.json, phiên TikTok) sau khi đổi tên app
// STUDIO_DATA_DIR: thư mục dữ liệu riêng (chạy thử / test song song với app đang mở, không đụng cài đặt thật)
app.setPath('userData', process.env.STUDIO_DATA_DIR || path.join(app.getPath('appData'), 'StudioLive'));
// Cho phép phát âm thanh hiệu ứng mà không cần bấm vào trang trước
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
nativeTheme.themeSource = 'dark';

// Màu khung cửa sổ theo giao diện sáng/tối đang dùng — trùng nền header (TailAdmin: gray-900 / white)
const chromeColors = () => (nativeTheme.shouldUseDarkColors
  ? { bg: '#101828', symbol: '#98a2b3' }
  : { bg: '#ffffff', symbol: '#667085' });
// Windows caption buttons span the header (renderer .app-header: 72px incl. 1px bottom border) so they line up
// with its buttons; 71 keeps the header's bottom border visible under them
const TITLEBAR_HEIGHT = 71;
function applyUiTheme(mode) {
  nativeTheme.themeSource = ['light', 'dark', 'system'].includes(mode) ? mode : 'dark';
}
nativeTheme.on('updated', () => {
  if (!win || win.isDestroyed()) return;
  const c = chromeColors();
  win.setBackgroundColor(c.bg);
  if (process.platform !== 'darwin') win.setTitleBarOverlay({ color: c.bg, symbolColor: c.symbol, height: TITLEBAR_HEIGHT });
});

let win = null;
let settings;
const live = new LiveService();
let paused = false;
async function connectLive(username) {
  const s = settings.update({ username: String(username || '') });
  try {
    await live.start(s.username, { autoReconnect: s.autoReconnect });
    return { ok: true };
  } catch (e) {
    const message = friendlyError(e);
    live.setStatus('error', message);
    return { ok: false, message };
  }
}

// ---- Vua Tiếng Việt: game đoán chữ chạy server riêng (vua/server.mjs), dùng chung kết nối TikTok ----
let vua = null;
let vuaState = { running: false, port: 0, error: '', dataDir: '' };
const VUA_HOSTS = ['127.0.0.1', 'localhost', 'lvh.me'];

function vuaRedirect(req) {
  if (!vua || settings.get().overlay.mode !== 'vua') return null;
  const host = VUA_HOSTS.includes(req.hostname) ? req.hostname : '127.0.0.1';
  const q = String(req.originalUrl.split('?')[1] || '');
  const silent = new URLSearchParams(q).get('mute') === '1';
  return `http://${host}:${vuaState.port}/overlay.html?sl=1${silent ? '&silent=1' : ''}${q ? '&' + q : ''}`;
}

async function startVua() {
  const fs = require('fs');
  const { pathToFileURL } = require('url');
  const root = path.join(__dirname, '..', 'vua');
  const dataDir = path.join(app.getPath('userData'), 'vua');
  const paths = { dataDir, questionsPath: path.join(dataDir, 'questions.json'), logsDir: path.join(dataDir, 'logs') };
  try {
    // Đã dùng app Vua Tiếng Việt riêng trước đó: mang theo câu hỏi đã import, điểm và cài đặt
    const legacy = path.join(app.getPath('appData'), 'VuaTiengViet');
    if (!fs.existsSync(paths.questionsPath) && fs.existsSync(path.join(legacy, 'questions.json'))) {
      fs.mkdirSync(dataDir, { recursive: true });
      for (const f of ['questions.json', 'config.json', 'scores.json']) {
        if (fs.existsSync(path.join(legacy, f))) fs.copyFileSync(path.join(legacy, f), path.join(dataDir, f));
      }
    }
    const { initializeData } = await import(pathToFileURL(path.join(root, 'electron', 'runtime.mjs')).href);
    const { createApp } = await import(pathToFileURL(path.join(root, 'server.mjs')).href);
    await initializeData(paths, path.join(root, 'questions.json'));
    const bridge = {
      get studioPort() { return serverState.port; },
      get overlayURL() { return `http://localhost:${serverState.port}`; },
      initialStatus: { status: live.status, username: live.username },
      current: () => ({ status: live.status, username: live.username }),
      async connect(username) {
        const s = live.snapshot();
        if (s.status === 'live' && s.username.toLowerCase() === username.toLowerCase()) {
          vua.liveStatus({ status: 'live', username: s.username });
          return { ok: true };
        }
        const r = await connectLive(username);
        return r;
      },
      disconnect: () => live.stop()
    };
    const opts = { dataDir, questionsPath: paths.questionsPath, bridge };
    try {
      vua = await createApp({ ...opts, port: settings.get().port + 1 });
    } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
      vua = await createApp({ ...opts, port: 0 });
    }
    vuaState = { running: true, port: vua.server.address().port, error: '', dataDir };
  } catch (e) {
    console.error('[vua]', e);
    vuaState = { running: false, port: 0, error: e.message, dataDir };
  }
}

// ---- Kéo Co: game kéo co 3D chạy server riêng (keoco/server.mjs), dùng chung kết nối TikTok ----
let keoco = null;
let keocoState = { running: false, port: 0, error: '' };
const KEOCO_HOSTS = ['127.0.0.1', 'localhost', 'lvh.me'];

function keocoRedirect(req) {
  if (!keoco || settings.get().overlay.mode !== 'keoco') return null;
  const host = KEOCO_HOSTS.includes(req.hostname) ? req.hostname : '127.0.0.1';
  const q = String(req.originalUrl.split('?')[1] || '');
  const silent = new URLSearchParams(q).get('mute') === '1';
  return `http://${host}:${keocoState.port}/overlay.html?sl=1${silent ? '&silent=1' : ''}${q ? '&' + q : ''}`;
}

async function startKeoco() {
  const fs = require('fs');
  const { pathToFileURL } = require('url');
  const root = path.join(__dirname, '..', 'keoco');
  const dataDir = path.join(app.getPath('userData'), 'keoco');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const { createApp } = await import(pathToFileURL(path.join(root, 'server.mjs')).href);
    const bridge = {
      get studioPort() { return serverState.port; },
      initialStatus: { status: live.status, username: live.username },
      async connect(username) {
        const s = live.snapshot();
        if (s.status === 'live' && s.username.toLowerCase() === username.toLowerCase()) {
          keoco.liveStatus({ status: 'live', username: s.username });
          return { ok: true };
        }
        return connectLive(username);
      },
      disconnect: () => live.stop()
    };
    // cạnh cổng StudioLive (+2, chừa +1 cho cảnh khác); bận thì lấy cổng trống bất kỳ
    try {
      keoco = await createApp({ port: settings.get().port + 2, dataDir, bridge });
    } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
      keoco = await createApp({ port: 0, dataDir, bridge });
    }
    keocoState = { running: true, port: keoco.server.address().port, error: '' };
  } catch (e) {
    console.error('[keoco]', e);
    keocoState = { running: false, port: 0, error: e.message };
  }
}

// ---- Đèn Xanh Đèn Đỏ: game chạy server riêng (denxanh/server.mjs), dùng chung kết nối TikTok ----
let denxanh = null;
let denxanhState = { running: false, port: 0, error: '' };

function denxanhRedirect(req) {
  if (!denxanh || settings.get().overlay.mode !== 'denxanh') return null;
  const host = KEOCO_HOSTS.includes(req.hostname) ? req.hostname : '127.0.0.1';
  const q = String(req.originalUrl.split('?')[1] || '');
  const silent = new URLSearchParams(q).get('mute') === '1';
  return `http://${host}:${denxanhState.port}/overlay.html?sl=1${silent ? '&silent=1' : ''}${q ? '&' + q : ''}`;
}

async function startDenxanh() {
  const fs = require('fs');
  const { pathToFileURL } = require('url');
  const root = path.join(__dirname, '..', 'denxanh');
  const dataDir = path.join(app.getPath('userData'), 'denxanh');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const { createApp } = await import(pathToFileURL(path.join(root, 'server.mjs')).href);
    const bridge = {
      get studioPort() { return serverState.port; },
      initialStatus: { status: live.status, username: live.username }
    };
    // cổng StudioLive +3 (+1 Vua, +2 Kéo Co); bận thì lấy cổng trống bất kỳ
    try {
      denxanh = await createApp({ port: settings.get().port + 3, dataDir, bridge });
    } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
      denxanh = await createApp({ port: 0, dataDir, bridge });
    }
    denxanhState = { running: true, port: denxanh.server.address().port, error: '' };
  } catch (e) {
    console.error('[denxanh]', e);
    denxanhState = { running: false, port: 0, error: e.message };
  }
}

const overlay = new OverlayServer({
  getConfig: () => settings.get(),
  getSnapshot: () => live.snapshot(),
  getPaused: () => paused,
  getRedirect: (req) => vuaRedirect(req) || keocoRedirect(req) || denxanhRedirect(req)
});

let serverState = { running: false, port: 0, error: '', clients: 0 };
let outWin = null;

// Cửa sổ "màn hình phát live": chỉ có cảnh overlay, để TikTok LIVE Studio / OBS quay cửa sổ này
function openOutputWindow() {
  if (outWin && !outWin.isDestroyed()) {
    outWin.show();
    outWin.focus();
    return;
  }
  outWin = new BrowserWindow({
    width: 540,
    height: 960,
    minWidth: 270,
    minHeight: 480,
    title: 'MyStudioLive - Man hinh phat live',
    icon: APP_ICON,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false }
  });
  outWin.setAspectRatio(9 / 16);
  outWin.on('page-title-updated', (e) => e.preventDefault());
  outWin.loadURL(`http://127.0.0.1:${serverState.port}/?output`);
  outWin.on('closed', () => {
    outWin = null;
    send('output:state', { open: false });
  });
  send('output:state', { open: true });
}

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

// ---- Chuyển tiếp sự kiện live -> dashboard + overlay ----
live.on('status', (s) => {
  send('live:status', s);
  if (vua) vua.liveStatus(s);
  if (keoco) keoco.liveStatus(s);
  if (denxanh) denxanh.liveStatus(s);
});
live.on('stats', (s) => {
  send('live:stats', s);
  overlay.broadcast('stats', s);
});
live.on('event', (e) => {
  send('live:event', e);
  overlay.broadcast('live', e);
  // chỉ chấm điểm khi Vua Tiếng Việt đang là cảnh trên live
  if (vua && !paused && settings.get().overlay.mode === 'vua') vua.ingest(e);
  // chỉ tính điểm khi Kéo Co đang là cảnh trên live
  if (keoco && !paused && settings.get().overlay.mode === 'keoco') keoco.ingest(e);
  // chỉ nhận thao tác khi Đèn Xanh Đèn Đỏ đang là cảnh trên live
  if (denxanh && !paused && settings.get().overlay.mode === 'denxanh') denxanh.ingest(e);
});
overlay.onClients = (n) => {
  serverState.clients = n;
  send('server:state', serverState);
};

async function startServer(port) {
  try {
    await overlay.start(port);
    serverState = { running: true, port, error: '', clients: 0 };
  } catch (e) {
    serverState = {
      running: false, port, clients: 0,
      error: e.code === 'EADDRINUSE' ? `Cổng ${port} đang bị ứng dụng khác dùng. Đổi cổng trong Cài đặt.` : e.message
    };
  }
  send('server:state', serverState);
  if (outWin && !outWin.isDestroyed() && serverState.running) outWin.loadURL(`http://127.0.0.1:${port}/?output`);
  return serverState;
}

// Window / taskbar icon (renderer/logo.png ships in the package; build/icon.png is only for the installer)
const APP_ICON = path.join(__dirname, '..', 'renderer', 'logo.png');

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: chromeColors().bg,
    title: 'MyStudioLive',
    icon: APP_ICON,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? false : { color: chromeColors().bg, symbolColor: chromeColors().symbol, height: TITLEBAR_HEIGHT },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!process.env.STUDIO_SELFTEST) win.show(); });
  if (process.env.STUDIO_SELFTEST) selfTest();

  // Link ngoài mở bằng trình duyệt mặc định
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Nút "Mở overlay LIVE" trong bảng điều khiển Vua Tiếng Việt -> chuyển cảnh + mở màn hình phát của StudioLive
    if (vuaState.running && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/overlay\.html/.test(url) && new URL(url).port === String(vuaState.port)) {
      send('vua:goLive');
      return { action: 'deny' };
    }
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

}

// ---- IPC ----
ipcMain.handle('app:init', () => ({
  settings: settings.get(),
  server: serverState,
  live: live.snapshot(),
  paused,
  vua: vuaState,
  keoco: keocoState,
  denxanh: denxanhState,
  platform: process.platform,
  version: app.getVersion()
}));

ipcMain.handle('settings:update', async (_e, patch) => {
  const before = settings.get();
  const next = settings.update(patch || {});
  if (next.uiTheme !== before.uiTheme) applyUiTheme(next.uiTheme);
  overlay.broadcast('config', next.overlay);
  if (next.overlay.mode !== before.overlay.mode) {
    // đổi chế độ: mọi trang đang hiện cảnh (LIVE Studio, OBS, xem trước) tải lại để sang cảnh mới
    overlay.broadcast('reload');
    // các màn hình đang ở cảnh Vua Tiếng Việt (server riêng) quay về StudioLive
    if (before.overlay.mode === 'vua' && vua) vua.navigateOverlays();
    // các màn hình đang ở cảnh Kéo Co (server riêng) quay về StudioLive
    if (before.overlay.mode === 'keoco' && keoco) keoco.navigateOverlays();
    if (before.overlay.mode === 'denxanh' && denxanh) denxanh.navigateOverlays();
  }
  if (next.port !== before.port) await startServer(next.port);
  return { settings: next, server: serverState };
});

ipcMain.handle('live:connect', (_e, username) => connectLive(username));

ipcMain.handle('live:disconnect', async () => {
  await live.stop();
  return { ok: true };
});

ipcMain.handle('overlay:test', (_e, type) => {
  if (['round', 'thunder', 'jumpscare', 'peek', 'howto'].includes(type)) {
    overlay.broadcast('game', type);
    return true;
  }
  const demo = demoEvent(type);
  if (demo) {
    overlay.broadcast('live', demo);
    send('live:event', { ...demo, test: true });
  }
  return true;
});

ipcMain.handle('overlay:pause', (_e, p) => {
  paused = typeof p === 'boolean' ? p : !paused;
  overlay.broadcast('pause', paused);
  send('pause:state', paused);
  return paused;
});

// Lệnh điều khiển cảnh Rạp Phim: chiếu / dừng / chuyển phim, vỗ tay, mưa bắp, đọc ngay…
ipcMain.handle('rap:command', (_e, c) => {
  const actions = ['play', 'pause', 'next', 'prev', 'index', 'speak', 'clap', 'rain', 'share', 'reset', 'testLikes'];
  if (!c || !actions.includes(c.action)) return false;
  if (c.action === 'index') settings.update({ overlay: { rapIndex: Number(c.n) || 0 } });
  overlay.broadcast('rap', { action: c.action, text: typeof c.text === 'string' ? c.text.slice(0, 400) : undefined, n: Number(c.n) || 0 });
  return true;
});

// Lệnh điều khiển cảnh Live Bar: quẩy cả sàn, pháo hoa, drop, thêm khách thử, đặt lại
ipcMain.handle('bar:command', (_e, c) => {
  const actions = ['party', 'fireworks', 'drop', 'crowd', 'reset'];
  if (!c || !actions.includes(c.action)) return false;
  overlay.broadcast('bar', { action: c.action, n: Math.min(400, Math.max(0, Number(c.n) || 0)) });
  return true;
});

ipcMain.handle('dialog:pickVideos', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Chọn phim để chiếu',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'm4v'] }]
  });
  return r.canceled ? [] : r.filePaths;
});

// Lệnh điều khiển Trà Đá Vỉa Hè / Đi Nhậu: đọc ngay, khao / dzô cả quán, dọn quán, đặt lại bảng…
ipcMain.handle('quan:command', (_e, c) => {
  const actions = ['speak', 'share', 'reset', 'clear', 'testLikes', 'event', 'treat', 'cheerAll'];
  if (!c || !['trada', 'nhau'].includes(c.scene) || !actions.includes(c.action)) return false;
  overlay.broadcast(c.scene, { action: c.action, text: typeof c.text === 'string' ? c.text.slice(0, 400) : undefined, n: Number(c.n) || undefined });
  return true;
});

// Lệnh điều khiển cảnh chùa: đọc ngay, thỉnh chuông, gõ mõ, nhắc chia sẻ, mưa hoa sen, đặt lại điểm
ipcMain.handle('chua:command', (_e, c) => {
  const actions = ['speak', 'bell', 'mo', 'share', 'rain', 'reset', 'testLikes'];
  if (!c || !actions.includes(c.action)) return false;
  overlay.broadcast('chua', { action: c.action, text: typeof c.text === 'string' ? c.text.slice(0, 400) : undefined, n: Number(c.n) || undefined });
  return true;
});

ipcMain.handle('overlay:reload', () => {
  overlay.broadcast('reload');
  return true;
});

ipcMain.handle('server:restart', () => startServer(settings.get().port));

ipcMain.handle('dialog:pickFolder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Chọn thư mục nhân vật (GIF / PNG / WEBP)', properties: ['openDirectory'] });
  return r.canceled ? '' : r.filePaths[0];
});

ipcMain.handle('dialog:pickSound', async (_e, kind) => {
  const media = kind === 'media';
  const model = kind === 'model';
  const r = await dialog.showOpenDialog(win, {
    title: model ? 'Chọn model DJ 3D' : media ? 'Chọn ảnh / video' : 'Chọn file âm thanh',
    properties: ['openFile'],
    filters: model
      ? [{ name: 'Model 3D', extensions: ['fbx', 'glb', 'gltf'] }]
      : media
        ? [{ name: 'Ảnh hoặc video', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov'] }]
        : [{ name: 'Âm thanh', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }]
  });
  return r.canceled ? '' : r.filePaths[0];
});

ipcMain.handle('output:open', () => {
  openOutputWindow();
  return true;
});

ipcMain.handle('tiktok:login', () => {
  require('./direct').openLoginWindow(win);
  return true;
});

ipcMain.handle('tiktok:logout', async () => {
  await require('./direct').logoutTikTok();
  return true;
});

ipcMain.handle('util:copy', (_e, text) => {
  clipboard.writeText(String(text));
  return true;
});

ipcMain.handle('util:openExternal', (_e, url) => {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
  return true;
});

// ---- Dữ liệu thử nghiệm ----
const DEMO_NAMES = ['Hồn Ma Áo Trắng', 'Bé Ma Lém Lỉnh', 'Thầy Pháp Tập Sự', 'Cô Hồn Dạ Khúc', 'Quỷ Nhỏ 2k7', 'Ma Da Sông Hàn'];
const DEMO_CHATS = ['Ghê quá streamer ơi 😱', 'Sau lưng anh có gì kìa!!!', 'Tắt đèn đi chơi mới vui', 'Ai đang xem một mình giơ tay 🙋', 'Nghe tiếng chuông rợn người', 'Cho em xin lá bùa với'];
const DEMO_GIFTS = [
  { giftName: 'Hoa Hồng', diamonds: 1, repeatCount: 5 },
  { giftName: 'Kẹo Bông', diamonds: 5, repeatCount: 1 },
  { giftName: 'Mũ Phù Thuỷ', diamonds: 99, repeatCount: 1 },
  { giftName: 'Lâu Đài Ma', diamonds: 299, repeatCount: 2 }
];
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

function demoEvent(type) {
  const nickname = rand(DEMO_NAMES);
  const user = { id: 'demo-' + nickname, uniqueId: 'demo' + DEMO_NAMES.indexOf(nickname), nickname, avatar: '' };
  const ts = Date.now();
  switch (type) {
    case 'chat': return { type: 'chat', user, text: rand(DEMO_CHATS), ts };
    case 'scare': return { type: 'chat', user, text: 'hù', ts };
    case 'adidaphat': return { type: 'chat', user, text: 'adidaphat', ts };
    case 'clap': return { type: 'chat', user, text: 'vỗ tay', ts };
    case 'haha': return { type: 'chat', user, text: 'haha', ts };
    case 'wow': return { type: 'chat', user, text: 'wow', ts };
    case 'popcorn': return { type: 'chat', user, text: 'bắp', ts };
    case 'wish': return { type: 'chat', user, text: rand(['Cầu cho con thi đỗ đại học', 'Cầu sức khỏe cho mẹ', 'Mong sớm gặp người thương', 'Cầu bình an cho gia đình']), ts };
    case 'hide': return { type: 'chat', user, text: 'trốn', ts };
    case 'seek': return { type: 'chat', user, text: 'tìm', ts };
    case 'freeze': return { type: 'chat', user, text: 'bùa', ts };
    case 'summon': return { type: 'chat', user, text: 'gọi hồn', ts };
    case 'blackout': return { type: 'chat', user, text: 'tắt đèn', ts };
    case 'dance': return { type: 'chat', user, text: 'nhảy', ts };
    case 'laugh': return { type: 'chat', user, text: 'cười', ts };
    case 'cry': return { type: 'chat', user, text: 'khóc', ts };
    case 'hug': return { type: 'chat', user, text: 'ôm', ts };
    case 'trada': return { type: 'chat', user, text: rand(['trà đá', 'cho cốc trà đá', 'trà đá bà ơi']), ts };
    case 'cafe': return { type: 'chat', user, text: rand(['cà phê', 'nâu đá', 'bạc xỉu']), ts };
    case 'huongduong': return { type: 'chat', user, text: 'hướng dương', ts };
    case 'bia': return { type: 'chat', user, text: rand(['bia', 'cho cốc bia', 'thêm bia em ơi']), ts };
    case 'dzo': return { type: 'chat', user, text: rand(['dzô', 'dzô dzô', '100%', 'một hai ba dzô']), ts };
    case 'moi': return { type: 'chat', user, text: rand(['lạc rang', 'mực nướng', 'nem', 'chân gà', 'ốc luộc']), ts };
    case 'lau': return { type: 'chat', user, text: 'lẩu', ts };
    case 'tinhtien': return { type: 'chat', user, text: 'tính tiền', ts };
    case 'gift': {
      const g = rand(DEMO_GIFTS);
      return { type: 'gift', user, ...g, total: g.diamonds * g.repeatCount, giftImage: '', ts };
    }
    case 'bigGift': {
      const g = DEMO_GIFTS[3];
      return { type: 'gift', user, ...g, total: g.diamonds * g.repeatCount, giftImage: '', ts };
    }
    // Live Bar
    case 'barHey': return { type: 'chat', user, text: settings.get().overlay.barJoinKeyword || 'hey', ts };
    case 'barDance': return { type: 'chat', user, text: 'dance', ts };
    case 'barJump': return { type: 'chat', user, text: 'nhảy', ts };
    case 'barWalk': return { type: 'chat', user, text: 'đi vòng', ts };
    case 'barChange': return { type: 'chat', user, text: 'đổi nv', ts };
    case 'barRose': return { type: 'gift', user, giftName: 'Rose', diamonds: 1, repeatCount: 1, total: 1, giftImage: '', ts };
    case 'barMedal': return { type: 'gift', user, giftName: 'Mũ Neon', diamonds: 50, repeatCount: 1, total: 50, giftImage: '', ts };
    case 'barVip': return { type: 'gift', user, giftName: 'Siêu Xe', diamonds: 100, repeatCount: 1, total: 100, giftImage: '', ts };
    case 'barGrow': return { type: 'gift', user, giftName: 'Portal', diamonds: 99, repeatCount: 1, total: 99, giftImage: '', ts };
    case 'barFireworks': return { type: 'gift', user, giftName: 'Pháo Hoa', diamonds: 500, repeatCount: 1, total: 500, giftImage: '', ts };
    case 'barGalaxy': return { type: 'gift', user, giftName: 'Galaxy', diamonds: 1000, repeatCount: 1, total: 1000, giftImage: '', ts };
    case 'follow': return { type: 'follow', user, ts };
    case 'share': return { type: 'share', user, ts };
    case 'join': return { type: 'join', user, ts };
    default: return null;
  }
}

// ---- Tự kiểm tra (không hiện cửa sổ): STUDIO_SELFTEST=<file kết quả> ----
function selfTest() {
  const fs = require('fs');
  win.webContents.once('did-finish-load', async () => {
    const r = { server: serverState.running, port: serverState.port };
    try {
      const h = await fetch(`http://127.0.0.1:${serverState.port}/health`).then((x) => x.json());
      r.health = h.ok === true;
      const html = await fetch(`http://127.0.0.1:${serverState.port}/`).then((x) => x.text());
      r.overlay = html.includes('temple.js') && html.includes('game.js');
      const img = await fetch(`http://127.0.0.1:${serverState.port}/chua-assets/hall.jpg`);
      r.chuaAssets = img.ok;
      r.quan = html.includes('quan.js')
        && (await fetch(`http://127.0.0.1:${serverState.port}/trada-assets/street.jpg`)).ok
        && (await fetch(`http://127.0.0.1:${serverState.port}/nhau-assets/street.jpg`)).ok;
      await new Promise((ok) => setTimeout(ok, 1500));
      r.ui = await win.webContents.executeJavaScript("!!document.querySelector('#view-dashboard') && document.querySelector('#srv-sub').textContent");
      r.quanUi = await win.webContents.executeJavaScript("['trada','nhau'].every((k) => document.querySelector('#view-' + k) && document.querySelector('.nav-item[data-view=' + k + ']') && document.querySelector('[data-open-scene=' + k + ']'))");
      r.decoder = typeof require('tiktok-live-connector').deserializeWebSocketMessage === 'function';
    } catch (e) {
      r.error = String(e.message || e);
    }
    fs.writeFileSync(process.env.STUDIO_SELFTEST, JSON.stringify(r));
    app.quit();
  });
}

// ---- Vòng đời ứng dụng ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    settings = new Settings(app.getPath('userData'));
    applyUiTheme(settings.get().uiTheme);
    await startServer(settings.get().port);
    await startVua();
    await startKeoco();
    await startDenxanh();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // Tiến trình đồ hoạ (GPU) sập -> khung xem / màn hình phát dễ bị đen: tự tải lại
  app.on('child-process-gone', (_e, d) => {
    if (d.type !== 'GPU') return;
    setTimeout(() => {
      send('preview:reload');
      if (outWin && !outWin.isDestroyed()) outWin.webContents.reload();
    }, 800);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // Đợi Vua Tiếng Việt ghi xong điểm / câu hỏi đang lưu rồi mới thoát
  let vuaClosed = false;
  app.on('before-quit', (e) => {
    live.stop(true);
    overlay.stop();
    // Kéo Co ghi điểm / lịch sử đồng bộ ngay khi có kết quả nên chỉ cần đóng server
    if (keoco) { const k = keoco; keoco = null; Promise.resolve(k.close()).catch((err) => console.error('[keoco]', err)); }
    if (denxanh) { const d = denxanh; denxanh = null; Promise.resolve(d.close()).catch((err) => console.error('[denxanh]', err)); }
    if (!vua || vuaClosed) return;
    e.preventDefault();
    const v = vua;
    vua = null;
    Promise.resolve(v.close()).catch((err) => console.error('[vua]', err)).finally(() => { vuaClosed = true; app.quit(); });
  });
}
