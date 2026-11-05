// Cưới Liền Tay scene server. Runs beside StudioLive (bridge mode) on its own port, like dao/ and thabi/:
// StudioLive owns the TikTok connection and forwards normalised events via ingest(); this server turns them
// into the SSE events the React client (built into cuoi/dist by `npm run build:cuoi`) already understands.
// Standalone (`node cuoi/server.mjs`) only the test buttons work — handy for working on the scene.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const root = dirname(fileURLToPath(import.meta.url));
const mime = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', woff2: 'font/woff2'
};
const PAGES = new Set(['/', '/index.html', '/control.html', '/overlay.html']);
const CONTROL_ACTIONS = ['speak', 'setRate', 'reset', 'setName', 'custom'];
const TEST_EVENTS = ['chat', 'gift', 'member', 'follow', 'share', 'like'];

// Giọng MC: nam NamMinh (mặc định), nữ HoaiMy; cao hơn một chút cho tươi
const VOICE_M = 'vi-VN-NamMinhNeural', VOICE_F = 'vi-VN-HoaiMyNeural', TTS_PITCH = '+6%';
const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function splitText(text, max = 190) {
  const chunks = [];
  let rest = text.trim();
  while (rest.length > max) {
    const win = rest.slice(0, max + 1);
    let cut = Math.max(win.lastIndexOf('. '), win.lastIndexOf('! '), win.lastIndexOf('? '));
    if (cut < max / 2) cut = Math.max(win.lastIndexOf(', '), win.lastIndexOf('; '));
    if (cut < max / 2) cut = win.lastIndexOf(' ');
    if (cut <= 0) cut = max - 1;
    chunks.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

// hype = câu hô của MC: chỉ to hơn, giữ nguyên cao độ
async function edgeTts(text, rate, hype, voiceName) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeXml(text), {
      rate: `${rate >= 1 ? '+' : ''}${Math.round((rate - 1) * 100)}%`, pitch: TTS_PITCH, volume: hype ? '+40%' : '+0%'
    });
    const chunks = [];
    const read = (async () => { for await (const c of audioStream) chunks.push(c); })();
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Edge TTS timeout')), 20000); });
    try { await Promise.race([read, timeout]); } finally { clearTimeout(timer); }
    if (!chunks.length) throw Error('Edge TTS không trả âm thanh');
    return Buffer.concat(chunks);
  } finally {
    tts.close();
  }
}

async function googleTts(text) {
  const parts = [];
  for (const chunk of splitText(text)) {
    const r = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(chunk)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', Referer: 'https://translate.google.com/' }
    });
    if (!r.ok) throw Error(`Google TTS lỗi ${r.status}`);
    parts.push(Buffer.from(await r.arrayBuffer()));
  }
  return Buffer.concat(parts);
}

const readJSON = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };
const atomicWrite = (file, value) => { const tmp = `${file}.tmp`; writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); renameSync(tmp, file); };

export async function createApp({ port = 3007, dataDir, staticDir = join(root, 'dist'), bridge = null, tts = { edgeTts, googleTts } } = {}) {
  if (!dataDir) throw Error('dataDir is required');
  const settingsPath = join(dataDir, 'settings.json');
  let closed = false;

  // ---------- SSE ----------
  const emptyStats = () => ({ isConnected: false, isConnecting: false, username: '', roomId: '', viewerCount: 0, totalLikes: 0, error: '', bridge: true });
  let liveStats = emptyStats();
  const clients = new Set();
  // Trang stage đang mở (theo thứ tự). Chỉ trang mở SAU CÙNG phát tiếng, tránh 2 giọng đè nhau.
  let stageIds = [];
  let lastRateControl = null, lastNameControl = null;
  const saved = readJSON(settingsPath, {});
  if (typeof saved.channelName === 'string' && saved.channelName.trim()) lastNameControl = { action: 'setName', text: saved.channelName.trim().slice(0, 40) };

  const frame = (type, data) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  const broadcast = (type, data) => {
    const payload = frame(type, data);
    for (const res of clients) {
      // trang treo không đọc kịp: cắt, nó tự kết nối lại
      if (res.writableLength > 1024 * 1024) { res.destroy(); continue; }
      try { res.write(payload); } catch { /* trang đã đóng */ }
    }
  };
  const speaker = () => ({ id: stageIds[stageIds.length - 1] ?? null, count: stageIds.length });

  function openEvents(req, res, query) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Content-Type-Options': 'nosniff' });
    res.write(frame('status', liveStats));
    if (lastRateControl) res.write(frame('control', lastRateControl));
    if (lastNameControl) res.write(frame('control', lastNameControl));
    clients.add(res);
    const stageId = String(query.get('stage') || '').slice(0, 40);
    if (stageId) { stageIds = [...stageIds.filter((x) => x !== stageId), stageId]; broadcast('speaker', speaker()); }
    else res.write(frame('speaker', speaker()));
    const heartbeat = setInterval(() => { try { res.write(': keep-alive\n\n'); } catch { clearInterval(heartbeat); } }, 20000);
    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
      if (stageId) { stageIds = stageIds.filter((x) => x !== stageId); broadcast('speaker', speaker()); }
    });
  }

  // ---------- Live input from StudioLive ----------
  function liveStatus({ status, username = '', message = '' } = {}) {
    if (!bridge || closed) return;
    const name = username || liveStats.username;
    if (status === 'live') liveStats = { ...liveStats, isConnected: true, isConnecting: false, username: name, error: '' };
    else if (status === 'connecting' || status === 'reconnecting') liveStats = { ...liveStats, isConnected: false, isConnecting: true, username: name };
    else if (['idle', 'ended', 'error'].includes(status)) liveStats = { ...emptyStats(), error: status === 'idle' ? '' : String(message || '') };
    else return;
    broadcast('status', liveStats);
  }

  // Quà combo: StudioLive gửi giftStreak với repeatCount cộng dồn rồi 1 gift cuối; chỉ chuyển phần MỚI để cướp dâu ăn ngay
  const streaks = new Map();
  function ingest(ev) {
    if (!bridge || closed || !liveStats.isConnected || !ev?.user) return;
    const u = ev.user;
    const username = String(u.uniqueId || u.id || '').slice(0, 128);
    if (!username) return;
    const who = { username, nickname: String(u.nickname || username).slice(0, 80), avatar: String(u.avatar || '').slice(0, 1000) };
    const timestamp = Date.now();
    if (ev.type === 'chat') {
      const comment = String(ev.text || '').slice(0, 300);
      if (comment) broadcast('chat', { ...who, comment, timestamp });
    } else if (ev.type === 'gift' || ev.type === 'giftStreak') {
      const key = `${u.id || username}:${ev.giftId ?? ''}:${ev.groupId ?? ''}`;
      const total = Math.max(1, Number(ev.repeatCount) || 1);
      const delta = total - (streaks.get(key) || 0);
      if (ev.type === 'giftStreak') streaks.set(key, total); else streaks.delete(key);
      if (streaks.size > 500) streaks.delete(streaks.keys().next().value);
      if (delta <= 0) return;
      broadcast('gift', {
        ...who, giftName: String(ev.giftName || 'Quà').slice(0, 60), giftId: Number(ev.giftId) || 0,
        diamondCount: Math.max(1, Number(ev.diamonds) || 1), repeatCount: delta, timestamp
      });
    } else if (ev.type === 'like') {
      const likeCount = Math.max(1, Number(ev.count) || 1);
      liveStats.totalLikes += likeCount;
      broadcast('like', { ...who, likeCount, totalLikes: liveStats.totalLikes });
    } else if (ev.type === 'join') broadcast('member', { ...who, timestamp });
    else if (ev.type === 'follow' || ev.type === 'share') broadcast(ev.type, { ...who, timestamp });
  }

  // ---------- HTTP ----------
  const ttsCache = new Map();
  async function ttsAudio(query) {
    const text = String(query.get('text') || '').trim().slice(0, 1500);
    if (!text) return null;
    const rate = Math.min(1.5, Math.max(0.5, Number(query.get('rate')) || 1));
    const hype = query.get('hype') === '1';
    // chỉ nhận 2 giọng MC, không cho truyền tên giọng tuỳ ý
    const voiceName = query.get('v') === 'f' ? VOICE_F : VOICE_M;
    const key = `${voiceName}|${rate}|${hype}|${text}`;
    let audio = ttsCache.get(key);
    if (!audio) {
      try { audio = await tts.edgeTts(text, rate, hype, voiceName); }
      catch (e) { console.warn('[cuoi] Edge TTS lỗi, chuyển Google:', e.message); audio = await tts.googleTts(text); }
      ttsCache.set(key, audio);
      if (ttsCache.size > 200) ttsCache.delete(ttsCache.keys().next().value);
    }
    return audio;
  }

  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 16384) { reject(Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Error('bad json')); } });
    req.on('error', reject);
  });
  const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

  function control(body) {
    const { action, text } = body || {};
    if (!CONTROL_ACTIONS.includes(action)) return [400, { success: false, error: 'Lệnh không hợp lệ' }];
    if (action === 'speak' && (typeof text !== 'string' || !text.trim())) return [400, { success: false, error: 'Chưa nhập nội dung cần đọc' }];
    const payload = { action, text: typeof text === 'string' ? text.trim().slice(0, 1000) : undefined };
    if (action === 'setRate' && payload.text) lastRateControl = { action, text: payload.text };
    if (action === 'setName') {
      const name = (payload.text || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 40);
      if (!name) return [400, { success: false, error: 'Chưa nhập tên kênh' }];
      payload.text = name;
      lastNameControl = { action, text: name };
      try { atomicWrite(settingsPath, { channelName: name }); } catch (e) { console.error('[cuoi] Không lưu được tên kênh:', e.message); }
    }
    broadcast('control', payload);
    return [200, { success: true, pages: clients.size }];
  }

  function testEmit(body) {
    const { type, data } = body || {};
    if (!TEST_EVENTS.includes(type)) return [400, { success: false, error: 'Loại sự kiện không hợp lệ' }];
    const event = { timestamp: Date.now(), avatar: '', ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}) };
    if (type === 'like') { liveStats.totalLikes += Number(event.likeCount) || 1; event.totalLikes = liveStats.totalLikes; }
    broadcast(type, event);
    return [200, { success: true }];
  }

  async function serveStatic(res, p, head) {
    const rel = PAGES.has(p) ? 'index.html' : p.slice(1);
    const file = normalize(join(staticDir, decodeURIComponent(rel)));
    if (!file.startsWith(staticDir + sep)) { res.writeHead(404); return res.end('Not found'); }
    try {
      const body = await readFile(file);
      const hashed = p.startsWith('/assets/');
      res.writeHead(200, {
        'Content-Type': mime[file.split('.').pop()] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff', 'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-store'
      });
      res.end(head ? undefined : body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(PAGES.has(p) ? 'Chưa build cảnh Cưới Liền Tay: chạy npm run build:cuoi' : 'Not found');
    }
  }

  // Chặn DNS rebinding: chỉ nhận Host/Origin là máy này đúng cổng
  const hosts = ['127.0.0.1', 'localhost', 'lvh.me'];
  const allowedHost = (h) => hosts.some((n) => h === `${n}:${port}`);
  const allowedOrigin = (o) => hosts.some((n) => o === `http://${n}:${port}`);
  const server = http.createServer(async (req, res) => {
    if (!allowedHost(req.headers.host) || (req.headers.origin && !allowedOrigin(req.headers.origin))) { res.writeHead(403); return res.end('Forbidden'); }
    const url = new URL(req.url || '/', 'http://x');
    const p = url.pathname;
    try {
      if (req.method === 'GET' && p === '/api/tiktok/events') return openEvents(req, res, url.searchParams);
      if (req.method === 'GET' && p === '/api/tiktok/status') return json(res, 200, { success: true, data: liveStats });
      if (req.method === 'GET' && p === '/api/tts') {
        const audio = await ttsAudio(url.searchParams);
        if (!audio) return json(res, 400, { error: 'Thiếu text' });
        res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' });
        return res.end(audio);
      }
      if (req.method === 'POST' && (p === '/api/control' || p === '/api/test/emit')) {
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { success: false, error: 'Cần JSON' });
        const [code, out] = (p === '/api/control' ? control : testEmit)(await readBody(req));
        return json(res, code, out);
      }
      if (req.method === 'POST' && (p === '/api/tiktok/connect' || p === '/api/tiktok/disconnect')) {
        return json(res, 400, { success: false, error: 'Kết nối TikTok ở thanh trên cùng của MyStudioLive' });
      }
      if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(res, p, req.method === 'HEAD');
      res.writeHead(405); res.end();
    } catch (e) {
      if (!res.headersSent) json(res, p === '/api/tts' ? 500 : 400, { success: false, error: p === '/api/tts' ? 'TTS failed' : 'Yêu cầu không hợp lệ' });
      else res.destroy();
      if (p === '/api/tts') console.error('[cuoi] TTS lỗi:', e.message);
    }
  });

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  port = server.address().port;
  if (bridge?.initialStatus) liveStatus(bridge.initialStatus);

  // MyStudioLive đổi sang cảnh khác: trang live quay về cảnh chung
  const navigateOverlays = () => { if (bridge) broadcast('navigate', { port: bridge.studioPort }); };
  return {
    server, ingest, liveStatus, navigateOverlays,
    close: async () => {
      closed = true;
      for (const res of clients) res.destroy();
      clients.clear();
      await new Promise((r) => server.close(r));
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dataDir = process.env.CUOI_DATA || join(tmpdir(), 'cuoi-dev');
  mkdirSync(dataDir, { recursive: true });
  createApp({ port: Number(process.env.PORT) || 3007, dataDir })
    .then((a) => console.log(`http://127.0.0.1:${a.server.address().port}/control.html`))
    .catch((e) => { console.error(e); process.exitCode = 1; });
}
