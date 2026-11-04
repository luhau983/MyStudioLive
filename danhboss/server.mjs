import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Engine, DEFAULT_CONFIG } from './engine.mjs';

const root = dirname(fileURLToPath(import.meta.url));

// Editable from the control panel; everything else in DEFAULT_CONFIG stays fixed.
const bounds = {
  roundSeconds: [15, 600], countdownSeconds: [1, 30], resultSeconds: [3, 120],
  bossHp: [100, 1000000], damagePerTap: [1, 100], damagePerCommand: [1, 500], critPerDiamond: [1, 1000],
  playerHp: [1, 10], slamMinMs: [3000, 60000], slamMaxMs: [3000, 90000], slamWarnMs: [1000, 10000],
  graceMs: [0, 5000], enrageAt: [0, 90], maxPlayers: [1, 300],
  minPlayers: [1, 300], autoStart: [0, 1], lobbySeconds: [5, 600], botCount: [1, 50],
  audioVolume: [0, 100], audioMuted: [0, 1]
};
const integerKeys = new Set(Object.keys(bounds));

export function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('Cấu hình không hợp lệ');
  for (const [k, v] of Object.entries(config)) {
    if (!Object.hasOwn(bounds, k) || typeof v !== 'number' || !Number.isFinite(v) || v < bounds[k][0] || v > bounds[k][1]
      || (integerKeys.has(k) && !Number.isInteger(v))) throw Error(`Cấu hình không hợp lệ: ${k}`);
  }
  return { ...config };
}

const atomicWrite = (file, value) => { const tmp = `${file}.tmp`; writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n'); renameSync(tmp, file); };
const readJSON = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };

const files = {
  '/overlay.html': 'overlay.html', '/overlay.css': 'overlay.css', '/overlay.js': 'overlay.js', '/audio.js': 'audio.js',
  '/control.html': 'control.html', '/control.css': 'control.css', '/control.js': 'control.js'
};
const mime = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8' };

/**
 * Standalone (node server.mjs) runs offline with bots; inside StudioLive a bridge shares the app's TikTok connection:
 * LIVE events arrive through ingest(), connection changes through liveStatus().
 */
export async function createApp({ port = 3011, dataDir = root, staticDir = root, bridge = null, now = () => Date.now(), tickMs = 100 } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const configPath = join(dataDir, 'config.json');
  let config = { ...DEFAULT_CONFIG, audioVolume: 80, audioMuted: 0 };
  try { config = { ...config, ...validateConfig(readJSON(configPath, {})) }; } catch (e) { console.error('[danhboss] config:', e.message); }

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const broadcast = (msg) => { const s = JSON.stringify(msg); for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1 << 20) ws.send(s); };
  const engine = new Engine({ config, onEvent: (ev) => broadcast({ type: 'event', event: ev }) });
  let live = { status: 'disconnected', username: '' };
  let closed = false;

  const audio = () => ({ volume: config.audioVolume, muted: !!config.audioMuted });
  const state = () => ({ type: 'state', state: engine.snapshot(now()), live, audio: audio(), standalone: !bridge });
  const sendState = () => broadcast(state());

  function liveStatus({ status, username = '' } = {}) {
    live = status === 'live' ? { status: 'connected', username }
      : status === 'connecting' ? { status: 'connecting', username }
      : { status: 'disconnected', username: '' };
    sendState();
  }

  // Events normalised by StudioLive's LiveService: {type,user:{id,uniqueId,nickname,avatar},text|count|diamonds,...}.
  function ingest(ev) {
    if (closed || !ev?.user) return;
    const u = { uniqueId: String(ev.user.uniqueId || ev.user.id || ''), nickname: ev.user.nickname || ev.user.uniqueId, avatar: ev.user.avatar || '' };
    if (!u.uniqueId || u.uniqueId.length > 128) return;
    const t = now();
    if (ev.type === 'chat') engine.comment({ ...u, text: ev.text }, t);
    else if (ev.type === 'like') engine.tap(u, ev.count, t);
    else if (ev.type === 'join' && engine.phase === 'lobby') { /* a viewer entering the room is not consent to play */ }
    // Streaks report each step as giftStreak and the final total as gift: count only the final one.
    else if (ev.type === 'gift') engine.gift({ ...u, diamonds: Number(ev.diamonds ?? 1) * Number(ev.repeatCount ?? 1) }, t);
  }

  const navigateOverlays = () => { if (bridge) broadcast({ type: 'navigate', port: bridge.studioPort }); };

  const hosts = ['127.0.0.1', 'localhost', ...(bridge ? ['lvh.me'] : [])];
  const allowedHost = (h) => hosts.some((name) => h === `${name}:${port}`);
  const allowedOrigin = (o) => hosts.some((name) => o === `http://${name}:${port}`);

  const server = http.createServer(async (req, res) => {
    if (!allowedHost(req.headers.host) || (req.headers.origin && !allowedOrigin(req.headers.origin))) { res.writeHead(403); return res.end('Forbidden'); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const path = (req.url || '/').split('?')[0];
    if (path === '/') { res.writeHead(302, { Location: '/control.html' }); return res.end(); }
    const file = Object.hasOwn(files, path) ? files[path] : null;
    if (!file) { res.writeHead(404); return res.end('Not found'); }
    try {
      const body = await readFile(join(staticDir, file));
      res.writeHead(200, { 'Content-Type': mime[file.split('.').pop()], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });

  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws' || !allowedHost(req.headers.host) || !allowedOrigin(req.headers.origin)) return socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify(state()));
    ws.on('error', () => {});
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        if (!m || typeof m !== 'object' || Array.isArray(m)) throw Error('Thông điệp không hợp lệ');
        const t = now();
        switch (m.type) {
          case 'start': engine.start(t); break;
          case 'stop': engine.stop(t); break;
          case 'reset': engine.newLobby(t); break;
          case 'bots': if (!engine.canJoin()) throw Error('Đang hiện kết quả, chờ ván mới để thêm bot'); engine.addBots(config.botCount, t); break;
          case 'simulate': {
            // Offline testing: a fake viewer taps/comments/gifts like a real one would.
            const n = Number(m.number);
            const p = [...engine.players.values()].find((x) => x.number === n) || null;
            const u = p ? { uniqueId: p.id, nickname: p.nickname } : { uniqueId: `sim_${engine.nextNumber}`, nickname: `Khách ${engine.nextNumber}` };
            if (m.event === 'tap') engine.tap(u, 5, t);
            else if (m.event === 'gift') engine.gift({ ...u, diamonds: 5 }, t);
            else if (m.event === 'join') engine.comment({ ...u, text: 'vào' }, t);
            else if (m.event === 'attack') engine.comment({ ...u, text: 'đánh' }, t);
            else if (m.event === 'dodge') engine.comment({ ...u, text: 'né' }, t);
            else throw Error('Giả lập không hợp lệ');
            break;
          }
          case 'config': {
            const next = { ...config, ...validateConfig(m.config) };
            if (next.slamMinMs > next.slamMaxMs) throw Error('Thời gian tối thiểu phải ≤ tối đa');
            config = next; engine.configure(next); atomicWrite(configPath, next); break;
          }
          case 'audio': {
            if (!Number.isInteger(m.volume) || m.volume < 0 || m.volume > 100 || typeof m.muted !== 'boolean') throw Error('Âm thanh không hợp lệ');
            config = { ...config, audioVolume: m.volume, audioMuted: m.muted ? 1 : 0 }; atomicWrite(configPath, config); break;
          }
          case 'audio-test': broadcast({ type: 'audio-test' }); break;
          default: throw Error('Lệnh không hợp lệ');
        }
        sendState();
      } catch (e) { ws.send(JSON.stringify({ type: 'error', message: e.message })); }
    });
  });

  const timer = setInterval(() => { try { engine.tick(now()); sendState(); } catch (e) { console.error('[danhboss] tick:', e); } }, tickMs);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }).catch((e) => { clearInterval(timer); throw e; });
  port = server.address().port;
  if (bridge?.initialStatus) liveStatus(bridge.initialStatus);

  return {
    server, engine, ingest, liveStatus, navigateOverlays,
    close: async () => { closed = true; clearInterval(timer); for (const ws of wss.clients) ws.terminate(); await new Promise((r) => server.close(r)); wss.close(); }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApp().then((a) => console.log(`http://127.0.0.1:${a.server.address().port}/control.html`)).catch((e) => { console.error(e); process.exitCode = 1; });
}
