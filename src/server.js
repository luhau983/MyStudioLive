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
    app.get('/', (req, res, next) => {
      const to = this.getRedirect(req);
      if (!to) return next();
      res.set('Cache-Control', 'no-store');
      res.redirect(302, to);
    });

    app.use(express.static(path.join(__dirname, '..', 'overlay'), { index: 'index.html' }));

    // Âm thanh tuỳ chỉnh người dùng chọn trên máy
    app.get('/media/:kind', (req, res) => {
      const o = this.getConfig().overlay;
      const file = {
        gift: o.customGiftSound, chat: o.customChatSound, jumpscare: o.customJumpscare,
        scare: o.customScareSound, ambient: o.customAmbient
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

module.exports = { OverlayServer };
