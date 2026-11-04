import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createApp } from '../server.mjs';
import { GameEngine } from '../engine.mjs';

// StudioLive embeds the game with a bridge: StudioLive owns the TikTok connection and forwards its normalised events.
async function bridgedApp(t, bridgeOverrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'keoco-bridge-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ pvpThreshold: 1 }));
  const clock = { t: 0 };
  class ClockEngine extends GameEngine { constructor(o) { super({ ...o, now: () => clock.t }); } }
  const calls = [];
  const bridge = {
    studioPort: 4321,
    initialStatus: { status: 'idle', username: '' },
    connect: async username => { calls.push(['connect', username]); return { ok: true }; },
    disconnect: () => { calls.push(['disconnect']); },
    ...bridgeOverrides
  };
  const app = await createApp({ port: 0, Engine: ClockEngine, dataDir: dir, bridge });
  t.after(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  return { app, dir, clock, calls, port: app.server.address().port };
}
function toPull(app, clock) { app.engine.start(); for (let i = 0; i < 400 && app.engine.phase !== 'pull'; i++) { clock.t += 250; app.engine.tick(); } }
const user = (uniqueId, nickname = uniqueId) => ({ id: `id-${uniqueId}`, uniqueId, nickname, avatar: '' });
function socket(port, host = '127.0.0.1') {
  const ws = new WebSocket(`ws://${host}:${port}/ws`, { origin: `http://${host}:${port}` });
  const messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
  const next = predicate => new Promise((resolve, reject) => {
    const found = messages.find(predicate); if (found) return resolve(found);
    const timer = setTimeout(() => reject(Error('timeout')), 2000);
    ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (predicate(m)) { clearTimeout(timer); resolve(m); } });
  });
  return { ws, next, open: new Promise((r, j) => { ws.once('open', r); ws.once('error', j); }) };
}
const get = (port, path, host = '127.0.0.1') => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path, headers: { host: `${host}:${port}` } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', reject);
});

test('bridge mode listens on a free port, serves Three.js from the hoisted package and accepts lvh.me', async t => {
  const { port } = await bridgedApp(t);
  assert.ok(port > 0);
  assert.equal(await get(port, '/three.module.js'), 200);
  assert.equal(await get(port, '/overlay.html', 'lvh.me'), 200);
  assert.equal(await get(port, '/overlay.html', 'evil.example'), 403);
});

test('StudioLive status drives the game: live resumes, ended pauses, nothing is persisted to live.json', async t => {
  const { app, dir } = await bridgedApp(t);
  app.liveStatus({ status: 'live', username: 'Host.Live' });
  app.ingest({ type: 'chat', user: user('alice'), text: 'đỏ' });
  assert.equal(app.engine.players.get('alice')?.team, 'red');
  app.liveStatus({ status: 'ended', username: 'Host.Live', message: 'Buổi live đã kết thúc' });
  assert.equal(app.engine.snapshot().paused, true);
  app.ingest({ type: 'chat', user: user('bob'), text: 'xanh' });
  assert.equal(app.engine.players.has('bob'), false, 'events after the LIVE ends are ignored');
  app.liveStatus({ status: 'live', username: 'Host.Live' });
  assert.equal(app.engine.snapshot().paused, false);
  assert.equal(app.engine.players.has('alice'), true, 'same channel keeps the roster');
  app.liveStatus({ status: 'live', username: 'other.channel' });
  assert.equal(app.engine.players.size, 0, 'a different channel starts a fresh roster');
  assert.equal(existsSync(join(dir, 'live.json')), false);
});

test('bridged events enroll by comment, like and join; streak gifts are credited once at completion', async t => {
  const { app, clock } = await bridgedApp(t);
  app.liveStatus({ status: 'live', username: 'host' });
  app.ingest({ type: 'chat', user: user('alice'), text: 'do' });
  app.ingest({ type: 'chat', user: user('bob'), text: 'xanh' });
  app.ingest({ type: 'like', user: user('carol'), count: 3 });
  app.ingest({ type: 'join', user: user('dave') });
  assert.deepEqual(['alice', 'bob', 'carol', 'dave'].map(id => app.engine.players.has(id)), [true, true, true, true]);
  toPull(app, clock);
  assert.equal(app.engine.phase, 'pull');
  const red = app.engine.score.red;
  const gift = (type, repeatCount) => ({ type, user: user('alice'), giftName: 'Rose', giftId: 5655, groupId: '90071992547409931', msgId: `m${repeatCount}`, streakable: true, diamonds: 5, repeatCount });
  app.ingest(gift('giftStreak', 1));
  app.ingest(gift('giftStreak', 3));
  assert.equal(app.engine.score.red, red, 'a running streak scores nothing yet');
  app.ingest(gift('gift', 3));
  assert.equal(app.engine.score.red, red + 15 * app.engine.config.giftMultiplier);
  app.ingest(gift('gift', 3));
  assert.equal(app.engine.score.red, red + 15 * app.engine.config.giftMultiplier, 'a replayed completion is not credited twice');
});

test('a completion without any observed start is rejected, like the standalone connector', async t => {
  const { app, clock } = await bridgedApp(t);
  app.liveStatus({ status: 'live', username: 'host' });
  app.ingest({ type: 'chat', user: user('alice'), text: 'do' });
  app.ingest({ type: 'chat', user: user('bob'), text: 'xanh' });
  toPull(app, clock);
  const red = app.engine.score.red;
  app.ingest({ type: 'gift', user: user('alice'), giftId: 1, groupId: 'g1', msgId: 'x', streakable: true, diamonds: 5, repeatCount: 2 });
  assert.equal(app.engine.score.red, red);
  app.ingest({ type: 'gift', user: user('alice'), giftId: 2, msgId: 'single-1', streakable: false, diamonds: 10, repeatCount: 1 });
  assert.equal(app.engine.score.red, red + 10 * app.engine.config.giftMultiplier, 'a non-streak gift scores immediately');
});

test('control panel Kết nối / Ngắt go through StudioLive; overlays are sent back on scene change', async t => {
  const { app, port, calls } = await bridgedApp(t);
  const control = socket(port); await control.open;
  t.after(() => control.ws.close());
  control.ws.send(JSON.stringify({ type: 'connect', username: '@Host.Live' }));
  await control.next(m => m.type === 'state' && m.live.status === 'connecting');
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(calls, [['connect', 'Host.Live']]);
  app.liveStatus({ status: 'live', username: 'Host.Live' });
  await control.next(m => m.type === 'state' && m.live.status === 'connected');
  control.ws.send(JSON.stringify({ type: 'disconnect' }));
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(calls.at(-1), ['disconnect']);
  app.navigateOverlays();
  assert.deepEqual(await control.next(m => m.type === 'navigate'), { type: 'navigate', port: 4321 });
});

test('a failed StudioLive connect returns the panel to disconnected', async t => {
  const { port } = await bridgedApp(t, { connect: async () => ({ ok: false, message: 'Kênh này hiện không phát live.' }) });
  const control = socket(port); await control.open;
  t.after(() => control.ws.close());
  control.ws.send(JSON.stringify({ type: 'connect', username: 'nobody' }));
  await control.next(m => m.type === 'log' && m.message.includes('không phát live'));
  await control.next(m => m.type === 'state' && m.live.status === 'disconnected');
});
