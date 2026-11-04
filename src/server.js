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
        scare: o.customScareSound, ambient: o.customAmbient, barMusic: o.barMusic, barScreen: o.barScreen
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

module.exports = { OverlayServer, isAvatarUrl };
