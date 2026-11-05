// Đảo Sinh Tồn scene server. Runs beside StudioLive (bridge mode) on its own port, the same way
// Kéo Co does: StudioLive owns the TikTok connection and forwards normalised events via ingest().
// Standalone (`node dao/server.mjs`) it only supports practice/simulation for development.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { GameEngine, DEFAULTS } from './engine.mjs';
import { emptySeason, recordResult, prune, leaderboard } from './season.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const threeModule = (() => { try { return fileURLToPath(import.meta.resolve('three')); } catch { return join(root, 'node_modules/three/build/three.module.js'); } })();

const BOUNDS = {
  lobbySeconds: [5, 600], dropSeconds: [3, 60], lootSeconds: [10, 600], stormWaitSeconds: [5, 300], stormShrinkSeconds: [5, 300],
  finalSeconds: [10, 300], resultSeconds: [5, 120], maxPlayers: [2, 1000], minPlayers: [0, 50], giftPower: [0, 100],
  autoJoin: [0, 1], zombies: [0, 1], hypeLikes: [50, 100000], rejoinSeconds: [0, 3600], likeHealPerSecond: [0, 20], tts: [0, 1]
};
export function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw Error('Cấu hình không hợp lệ');
  const out = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (!Object.hasOwn(BOUNDS, k) || !Number.isInteger(v) || v < BOUNDS[k][0] || v > BOUNDS[k][1]) throw Error(`Cấu hình không hợp lệ: ${k}`);
    out[k] = v;
  }
  return out;
}

const atomicWrite = (file, value) => { const tmp = `${file}.tmp`; writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); renameSync(tmp, file); };
const readJSON = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT' || e instanceof SyntaxError) return fallback; throw e; } };
const files = {
  '/': 'control.html', '/control.html': 'control.html', '/control.css': 'control.css', '/control.js': 'control.js',
  '/overlay.html': 'overlay.html', '/overlay.css': 'overlay.css', '/overlay.js': 'overlay.js', '/stage.js': 'stage.js',
  '/three.module.js': threeModule
};
const mime = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8' };

export function sendBounded(ws, data, maxBytes = 1024 * 1024) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount + Buffer.byteLength(data) > maxBytes) { ws.terminate(); return false; }
  try { ws.send(data); return true; } catch { ws.terminate(); return false; }
}

const SIM_NAMES = ['Mèo Mập', 'Bé Na', 'Tí Sún', 'Anh Ba', 'Gấu Trúc', 'Su Su', 'Bông', 'Kem Dâu', 'Đậu Đen', 'Tôm Hùm', 'Mít Ướt', 'Khoai Lang', 'Cún Con', 'Bắp Rang', 'Xoài Non', 'Rồng Con'];
const SIM_COMMANDS = ['vào', 'chiến', 'cung', 'ninja', 'bắc', 'nam', 'đông', 'tây'];
const STANCES = ['trốn', 'xông', 'hồi'];

export async function createApp({ port = 3003, dataDir, staticDir = root, bridge = null, now = Date.now, random = Math.random } = {}) {
  if (!dataDir) throw Error('dataDir is required');
  const configPath = join(dataDir, 'config.json'), seasonPath = join(dataDir, 'season.json');
  let config = { tts: 1 };
  try { config = { ...config, ...validateConfig(readJSON(configPath, {})) }; } catch { /* broken file -> defaults */ }
  let season = readJSON(seasonPath, null);
  if (!season || typeof season.players !== 'object' || !season.players) season = emptySeason(now());
  prune(season, now());

  let live = { status: 'disconnected', username: '' }, closed = false, practice = false, simulated = false;
  const logs = [];
  const log = (msg) => { logs.push({ at: now(), msg: String(msg) }); if (logs.length > 60) logs.shift(); };

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
  const broadcast = (obj) => { const data = JSON.stringify(obj); for (const ws of wss.clients) sendBounded(ws, data); };

  // Events are relayed to overlays at most 60 per second; storms can kill hundreds at once and the
  // overlay already collapses bursts in its kill feed.
  let evWindow = 0, evCount = 0, evDropped = 0;
  const onEvent = (ev) => {
    const t = now();
    if (t - evWindow >= 1000) { if (evDropped) broadcast({ type: 'event', ev: { type: 'kills-hidden', count: evDropped } }); evWindow = t; evCount = 0; evDropped = 0; }
    if (evCount >= 60) { if (ev.type === 'kill') evDropped++; return; }
    evCount++;
    broadcast({ type: 'event', ev });
    if (ev.type === 'result') log(ev.winner ? `🏆 Ván ${ev.round}: ${ev.winner.nickname} vô địch (${ev.winner.kills} hạ gục)` : `🧟 Ván ${ev.round}: Đảo thất thủ`);
    if (ev.type === 'gift') log(`🎁 ${ev.nickname}: ${ev.effect}`);
    if (ev.type === 'supply') log('📦 Thả hòm tiếp tế (hype đầy)');
  };
  const onResult = (result) => {
    if (simulated || practice) return;
    try { recordResult(season, result, now()); atomicWrite(seasonPath, season); } catch (e) { log(`Không lưu được thống kê: ${e.message}`); }
  };
  const engine = new GameEngine({ config, now, random, onEvent, onResult });

  // ---------- LIVE input ----------
  function liveChat(u, text) {
    const r = engine.comment({ ...u, comment: text });
    if (!r) return;
    if (r.join === 'joined' || r.join === 'late') log(`➕ ${u.nickname || u.uniqueId} ${r.join === 'late' ? 'nhảy dù muộn' : 'vào đảo'}`);
    if (r.kind === 'position') broadcast({ type: 'event', ev: { type: 'position', uniqueId: u.uniqueId, nickname: r.player.nickname } });
  }
  function liveGift(u, ev) {
    const key = ev.msgId ? `m:${ev.msgId}` : `g:${u.uniqueId}:${ev.giftId}:${ev.groupId}:${ev.ts}`;
    const total = Number(ev.total ?? (Number(ev.diamonds) || 0) * (Number(ev.repeatCount) || 1));
    const out = engine.gift({ ...u, diamonds: total, giftName: ev.giftName, key });
    if (out === 'joined' || out === 'queued' || out === 'hype' || out === 'bonus') log(`🎁 ${u.nickname}: ${out}`);
  }
  function liveStatus({ status, username = '', message = '' } = {}) {
    if (!bridge || closed) return;
    const was = live.status;
    if (status === 'live') {
      if (simulated || practice) { practice = false; simulated = false; engine.reset({ clearPlayers: true }); }
      engine.resume(); live = { status: 'connected', username: username || live.username };
      if (was !== 'connected') log(`Đã kết nối @${live.username} (qua StudioLive)`);
    } else if (status === 'connecting') live = { status: 'connecting', username: username || live.username };
    else if (status === 'reconnecting') { if (was === 'connected') engine.pause(); live = { status: 'reconnecting', username: username || live.username }; }
    else if (['idle', 'ended', 'error'].includes(status)) {
      if (was === 'connected' || was === 'reconnecting') engine.pause();
      live = { status: 'disconnected', username: '' };
      if (message && was !== 'disconnected') log(`Live: ${message}`);
    }
  }
  // Normalised StudioLive events: {type, user:{id,uniqueId,nickname,avatar}, text|count|diamonds|total,...}.
  function ingest(ev) {
    if (!bridge || closed || live.status !== 'connected' || !ev?.user) return;
    const u = { uniqueId: String(ev.user.uniqueId || ev.user.id || ''), nickname: ev.user.nickname, avatar: ev.user.avatar || '' };
    if (!u.uniqueId || u.uniqueId.length > 128) return;
    if (ev.type === 'chat') liveChat(u, ev.text);
    else if (ev.type === 'like') engine.like({ ...u, count: ev.count });
    else if (ev.type === 'gift') liveGift(u, ev);   // giftStreak is a running combo; only the final 'gift' counts
    else if (ev.type === 'follow') engine.follow(u);
    else if (ev.type === 'share') engine.share(u);
  }

  // ---------- practice / simulation ----------
  let simSeq = 0;
  const simUser = (i) => ({ uniqueId: `sim_${i}`, nickname: `${SIM_NAMES[i % SIM_NAMES.length]} ${Math.floor(i / SIM_NAMES.length) + 1}`, avatar: '' });
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function ensureSim() {
    if (live.status !== 'disconnected') throw Error('Không giả lập được khi đang kết nối live');
    if (!simulated) { simulated = true; engine.reset({ clearPlayers: true }); }
  }
  function simulate(kind, count) {
    ensureSim();
    const enrolled = engine.snapshot().players;
    const anyone = () => (enrolled.length ? enrolled[Math.floor(Math.random() * enrolled.length)].uniqueId : 'sim_0');
    for (let i = 0; i < count; i++) {
      if (kind === 'join') { const u = simUser(simSeq++); engine.comment({ ...u, comment: pick(SIM_COMMANDS) }); }
      else if (kind === 'like') engine.like({ uniqueId: anyone(), count: 15 });
      else if (kind === 'stance') engine.comment({ uniqueId: anyone(), comment: pick(STANCES) });
      else if (kind === 'vote') engine.comment({ uniqueId: anyone(), comment: `bão ${1 + Math.floor(Math.random() * 3)}` });
      else if (kind.startsWith('gift')) { const d = { gift1: 1, gift2: 10, gift3: 99, gift4: 499, gift5: 5000 }[kind]; const id = anyone(); engine.gift({ uniqueId: id, diamonds: d, giftName: 'Quà thử' }); }
    }
  }
  function practiceTick() {
    if (!practice) return;
    const f = engine.frame();
    if (f.phase === 'lobby' && f.enrolled < 24 && Math.random() < 0.6) simulate('join', 2);
    if (['loot', 'storm', 'final'].includes(f.phase)) {
      if (Math.random() < 0.5) simulate('like', 3);
      if (Math.random() < 0.3) simulate('stance', 1);
      if (Math.random() < 0.06) simulate(pick(['gift1', 'gift2', 'gift3']), 1);
      if (f.phase === 'storm' && !f.storm.shrinking && Math.random() < 0.4) simulate('vote', 2);
      if (f.phase === 'loot' && Math.random() < 0.15) simulate('join', 1);
    }
  }

  // ---------- HTTP / WS ----------
  const hosts = ['127.0.0.1', 'localhost', 'lvh.me'];
  const allowedHost = (h) => hosts.some((n) => h === `${n}:${port}`);
  const allowedOrigin = (o) => hosts.some((n) => o === `http://${n}:${port}`);
  const server = http.createServer(async (req, res) => {
    if (!allowedHost(req.headers.host) || (req.headers.origin && !allowedOrigin(req.headers.origin))) { res.writeHead(403); return res.end('Forbidden'); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const p = (req.url || '/').split('?')[0];
    if (!Object.hasOwn(files, p)) { res.writeHead(404); return res.end('Not found'); }
    const file = files[p];
    try {
      const body = await readFile(file === threeModule ? file : join(staticDir, file));
      res.writeHead(200, { 'Content-Type': mime[file.split('.').pop()], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws' || !allowedHost(req.headers.host) || !allowedOrigin(req.headers.origin)) return socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const hello = () => ({ type: 'hello', studioPort: bridge?.studioPort ?? 0, tts: config.tts === 1 });
  const controlState = () => ({
    type: 'state', state: engine.snapshot(), live, practice, simulated, logs: logs.slice(-30),
    config: { ...DEFAULTS, ...engine.config, tts: config.tts ?? 1 }, leaderboard: leaderboard(season, 10), seasonStartedAt: season.startedAt
  });
  let lastRoster = -1;
  wss.on('connection', (ws) => {
    sendBounded(ws, JSON.stringify(hello()));
    sendBounded(ws, JSON.stringify({ type: 'roster', version: engine.rosterVersion, roster: engine.roster() }));
    sendBounded(ws, JSON.stringify(controlState()));
    ws.on('error', () => {});
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        if (!m || typeof m !== 'object' || Array.isArray(m)) throw Error('Thông điệp không hợp lệ');
        switch (m.type) {
          case 'start': engine.start(); break;
          case 'skip': engine.skip(); break;
          case 'end': engine.endRound(); break;
          case 'reset': engine.reset({ clearPlayers: !!m.clearPlayers }); break;
          case 'kick': if (typeof m.uniqueId !== 'string') throw Error('Thiếu uniqueId'); if (engine.kick(m.uniqueId)) log(`🚫 Đã loại ${m.uniqueId} khỏi phiên`); break;
          case 'config': {
            const next = { ...config, ...validateConfig(m.config) };
            engine.configure(next); atomicWrite(configPath, next); config = next;
            broadcast(hello());
            break;
          }
          case 'simulate': {
            const kinds = ['join', 'like', 'stance', 'vote', 'gift1', 'gift2', 'gift3', 'gift4', 'gift5'];
            if (!kinds.includes(m.event) || ![1, 5, 10, 30, 100].includes(m.count)) throw Error('Giả lập không hợp lệ');
            simulate(m.event, m.count); break;
          }
          case 'practice': if (m.on) ensureSim(); practice = !!m.on; log(practice ? '🧪 Bật chế độ luyện tập' : 'Tắt chế độ luyện tập'); break;
          case 'season-reset': season = emptySeason(now()); atomicWrite(seasonPath, season); log('Đã reset bảng xếp hạng mùa'); break;
          default: throw Error('Lệnh không hợp lệ');
        }
        sendBounded(ws, JSON.stringify(controlState()));
      } catch (e) { sendBounded(ws, JSON.stringify({ type: 'error', message: e.message })); }
    });
  });

  let n = 0;
  const timer = setInterval(() => {
    try {
      engine.tick();
      if (engine.rosterVersion !== lastRoster) { lastRoster = engine.rosterVersion; broadcast({ type: 'roster', version: lastRoster, roster: engine.roster() }); }
      broadcast({ type: 'frame', f: engine.frame() });
      if (++n % 5 === 0) broadcast(controlState());
      if (n % 10 === 0) practiceTick();
    } catch (e) { console.error('[dao] tick', e); }
  }, 100);

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }).catch((e) => { clearInterval(timer); throw e; });
  port = server.address().port;
  if (bridge?.initialStatus) liveStatus(bridge.initialStatus);

  const navigateOverlays = () => { if (bridge) broadcast({ type: 'navigate', port: bridge.studioPort }); };
  return {
    server, engine, ingest, liveStatus, navigateOverlays,
    close: async () => { closed = true; clearInterval(timer); for (const ws of wss.clients) ws.terminate(); await new Promise((r) => server.close(r)); wss.close(); }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Dev run keeps its config/season out of the source tree.
  const dataDir = process.env.DAO_DATA || join(tmpdir(), 'dao-dev');
  mkdirSync(dataDir, { recursive: true });
  createApp({ port: Number(process.env.PORT) || 3003, dataDir }).then((a) => console.log(`http://127.0.0.1:${a.server.address().port}/control.html`)).catch((e) => { console.error(e); process.exitCode = 1; });
}
