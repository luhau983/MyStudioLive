'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');

const MEDIA_TYPES = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime'
};

let threeModule = null;
function resolveThreeModule() {
  try { return path.join(path.dirname(require.resolve('three')), 'three.module.js'); } catch { /* fall through */ }
  return path.join(__dirname, '..', 'node_modules', 'three', 'build', 'three.module.js');
}

const DJ_MODEL_EXT = /\.(fbx|glb|gltf)$/i;
const DJ_RESOURCE_EXT = /\.(png|jpe?g|webp|bin)$/i;
// Textures / buffers of the DJ model: looked up by bare file name next to the model,
// in Textures/ or in <model>.fbm/ (Mixamo / Unity layouts). Never outside those folders.
function findDjResource(model, name) {
  if (typeof model !== 'string' || !model || !DJ_RESOURCE_EXT.test(name) || path.basename(name) !== name) return null;
  const dir = path.dirname(model);
  const base = path.basename(model, path.extname(model));
  for (const d of [dir, path.join(dir, 'Textures'), path.join(dir, base + '.fbm')]) {
    const f = path.join(d, name);
    try { if (fs.statSync(f).isFile()) return f; } catch { /* next */ }
  }
  return null;
}

// Live Bar ships the original tiktok-live-bar assets (overlay/bar/assets). Setting value:
// '' = those built-in files, 'none' = drawn in code / synthesized, anything else = the user's own path.
const BAR_ASSETS = path.join(__dirname, '..', 'overlay', 'bar', 'assets');
const BUILTIN_BAR = {
  chars: path.join(BAR_ASSETS, 'characters'),
  dj: path.join(BAR_ASSETS, 'dj', 'Megan_DJ.fbx'),
  firework: path.join(BAR_ASSETS, 'sfx', 'fireworks.mp3')
};
function resolveBarAsset(value, kind) {
  if (value === 'none') return '';
  if (!value) return fs.existsSync(BUILTIN_BAR[kind]) ? BUILTIN_BAR[kind] : '';
  return value;
}

const CHARACTER_EXT = /\.(gif|png|webp)$/i;
const MAX_CHARACTERS = 60;
function listCharacterFiles(dir) {
  if (typeof dir !== 'string' || !dir) return [];
  try {
    // readdir + stat (not Dirent) so it also works inside the packaged app.asar
    return fs.readdirSync(dir)
      .filter((n) => CHARACTER_EXT.test(n) && path.basename(n) === n && fs.statSync(path.join(dir, n)).isFile())
      .sort((a, b) => a.localeCompare(b)).slice(0, MAX_CHARACTERS);
  } catch { return []; }
}

// Only TikTok's image CDNs are proxied (no open proxy / SSRF into the LAN); redirects are refused.
const AVATAR_HOSTS = ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'ibyteimg.com', 'byteimg.com', 'muscdn.com'];
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const avatarCache = new Map();
function isAvatarUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  return AVATAR_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}
async function fetchAvatar(raw) {
  if (!isAvatarUrl(raw)) return null;
  if (avatarCache.has(raw)) return avatarCache.get(raw);
  const job = (async () => {
    try {
      const r = await fetch(raw, { redirect: 'error', signal: AbortSignal.timeout(6000) });
      const type = (r.headers.get('content-type') || '').split(';')[0].trim();
      if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) return null;
      const body = Buffer.from(await r.arrayBuffer());
      return body.length && body.length <= AVATAR_MAX_BYTES ? { type, body } : null;
    } catch { return null; }
  })();
  avatarCache.set(raw, job);
  job.then((v) => { if (!v) avatarCache.delete(raw); });
  if (avatarCache.size > 400) avatarCache.delete(avatarCache.keys().next().value);
  return job;
}

/*
 * Server overlay nội bộ: chỉ lắng nghe 127.0.0.1 nên không ai ngoài máy truy cập được.
 * OBS / TikTok Live Studio thêm Browser Source trỏ tới http://localhost:<port>
 */
class OverlayServer {
  constructor({ getConfig, getSnapshot, getPaused, getRedirect }) {
    this.getConfig = getConfig;
    this.getRedirect = getRedirect || (() => null);
    this.getPaused = getPaused || (() => false);
    this.getSnapshot = getSnapshot;
    this.server = null;
    this.io = null;
    this.port = 0;
  }

  async start(port) {
    await this.stop();
    const app = express();
    app.disable('x-powered-by');

    // Giọng đọc tiếng Việt cho chế độ Đi Chùa
    app.get('/api/tts', async (req, res) => {
      const text = String(req.query.text || '').trim().slice(0, 1500);
      if (!text) return res.status(400).send('Missing text parameter');
      const rate = Math.min(1.5, Math.max(0.5, Number(req.query.rate) || 1));
      try {
        const audio = await require('./tts').synthesize(text, rate);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(audio);
      } catch (e) {
        console.error('[tts]', e.message);
        res.status(500).json({ error: 'TTS failed' });
      }
    });

    // Cảnh chạy trên server riêng (Vua Tiếng Việt, Kéo Co): chuyển hướng mọi màn hình phát sang đó
    // Live Bar chạy trang riêng (bar.html, three.js) trên chính server này
    app.get('/', (req, res, next) => {
      const to = this.getRedirect(req) || (this.getConfig().overlay.mode === 'bar' ? '/bar.html' + req.url.slice(1) : null);
      if (!to) return next();
      res.set('Cache-Control', 'no-store');
      res.redirect(302, to);
    });

    // three.js (ES module) cho cảnh 3D Live Bar
    app.get('/three.module.js', (_req, res) => {
      if (!threeModule) threeModule = fs.readFileSync(resolveThreeModule());
      res.type('application/javascript').set('Cache-Control', 'public, max-age=86400').send(threeModule);
    });

    // three.js addons (FBXLoader / GLTFLoader cho model DJ), chỉ phục vụ file .js
    app.use('/three-addons', (req, res, next) => (/\.js$/i.test(req.path) ? next() : res.sendStatus(404)),
      express.static(path.join(path.dirname(resolveThreeModule()), '..', 'examples', 'jsm'), { fallthrough: false, maxAge: '1d' }));

    // Model DJ 3D (.fbx / .glb / .gltf, như Megan_DJ.fbx của bản gốc) + texture đi kèm, tìm theo tên file
    app.get('/bar/dj/info', (_req, res) => {
      const file = resolveBarAsset(this.getConfig().overlay.barDjModel, 'dj');
      const kind = file && fs.existsSync(file) ? (file.match(DJ_MODEL_EXT) || [])[1] || '' : '';
      res.set('Cache-Control', 'no-store').json({ kind: kind.toLowerCase() });
    });
    app.get('/bar/dj/model', (_req, res) => {
      const file = resolveBarAsset(this.getConfig().overlay.barDjModel, 'dj');
      if (!file || !DJ_MODEL_EXT.test(file) || !fs.existsSync(file)) return res.sendStatus(404);
      res.sendFile(file, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } });
    });
    app.get('/bar/dj/res/:name', (req, res) => {
      const file = findDjResource(resolveBarAsset(this.getConfig().overlay.barDjModel, 'dj'), String(req.params.name || ''));
      if (!file) return res.sendStatus(404);
      res.sendFile(file, { headers: { 'Content-Type': MEDIA_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
    });

    // Bộ nhân vật Live Bar (GIF/PNG/WEBP trong thư mục người dùng chọn), giống CharacterLibrary của bản gốc
    app.get('/bar/chars', (_req, res) => {
      res.set('Cache-Control', 'no-store').json({ files: listCharacterFiles(resolveBarAsset(this.getConfig().overlay.barCharDir, 'chars')) });
    });
    app.get('/bar/chars/:name', (req, res) => {
      const dir = resolveBarAsset(this.getConfig().overlay.barCharDir, 'chars');
      const name = String(req.params.name || '');
      // chỉ phục vụ đúng tên file có trong danh sách (không cho ../ ra ngoài thư mục)
      if (!listCharacterFiles(dir).includes(name)) return res.sendStatus(404);
      res.sendFile(path.join(dir, name), { headers: { 'Content-Type': MEDIA_TYPES[path.extname(name).toLowerCase()], 'Cache-Control': 'no-store' } });
    });

    // Avatar TikTok cho Live Bar: CDN không bật CORS nên WebGL không dùng trực tiếp được -> tải hộ, cùng origin
    app.get('/bar/avatar', async (req, res) => {
      const img = await fetchAvatar(String(req.query.u || ''));
      if (!img) return res.sendStatus(404);
      res.set({ 'Content-Type': img.type, 'Cache-Control': 'public, max-age=3600' }).send(img.body);
    });

    app.use(express.static(path.join(__dirname, '..', 'overlay'), { index: 'index.html' }));

    // Âm thanh tuỳ chỉnh người dùng chọn trên máy
    app.get('/media/:kind', (req, res) => {
      const o = this.getConfig().overlay;
      const file = {
        gift: o.customGiftSound, chat: o.customChatSound, jumpscare: o.customJumpscare,
        scare: o.customScareSound, ambient: o.customAmbient, barMusic: o.barMusic, barScreen: o.barScreen, barFirework: resolveBarAsset(o.barFireworkFile, 'firework')
      }[req.params.kind] || '';
      const type = MEDIA_TYPES[path.extname(file).toLowerCase()];
      if (!file || !type || !fs.existsSync(file)) return res.sendStatus(404);
      // sendFile hỗ trợ Range -> video tua/phát được trong OBS
      res.sendFile(file, { headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } });
    });

    // Phim cho cảnh Rạp Phim (file trên máy, hỗ trợ tua nhờ sendFile/Range)
    app.get('/rap/:i', (req, res) => {
      const list = this.getConfig().overlay.rapVideos || [];
      const file = list[Number(req.params.i)] || '';
      const type = MEDIA_TYPES[path.extname(file).toLowerCase()];
      if (!file || !type || !type.startsWith('video/') || !fs.existsSync(file)) return res.sendStatus(404);
      res.sendFile(file, { headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } });
    });

    app.get('/health', (_req, res) => res.json({ ok: true }));

    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: false } });
    io.on('connection', (socket) => {
      socket.emit('config', this.getConfig().overlay);
      socket.emit('stats', this.getSnapshot().stats);
      socket.emit('pause', this.getPaused());
      this.emitClients();
      socket.on('disconnect', () => this.emitClients());
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.server = server;
    this.io = io;
    this.port = port;
    return port;
  }

  emitClients() {
    if (this.onClients) this.onClients(this.io ? this.io.engine.clientsCount : 0);
  }

  broadcast(event, payload) {
    if (this.io) this.io.emit(event, payload);
  }

  async stop() {
    if (!this.server) return;
    const server = this.server;
    this.io.close();
    this.server = null;
    this.io = null;
    await new Promise((r) => server.close(() => r()));
  }
}

module.exports = { OverlayServer, isAvatarUrl, listCharacterFiles, findDjResource, resolveBarAsset };
