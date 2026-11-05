import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createApp, validateConfig } from '../server.mjs';

const user = (id) => ({ id, uniqueId: id, nickname: `Nick ${id}`, avatar: '' });

async function boot() {
  const dataDir = mkdtempSync(join(tmpdir(), 'dao-'));
  const app = await createApp({ port: 0, dataDir, bridge: { studioPort: 1234, initialStatus: { status: 'idle' } } });
  const port = app.server.address().port;
  return { app, port, dataDir };
}

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: `http://127.0.0.1:${port}` });
  const msgs = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  return new Promise((resolve) => ws.on('open', () => resolve({ ws, msgs, send: (m) => ws.send(JSON.stringify(m)) })));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('config validation rejects unknown keys and out-of-range values', () => {
  assert.deepEqual(validateConfig({ giftPower: 50 }), { giftPower: 50 });
  assert.throws(() => validateConfig({ giftPower: 500 }));
  assert.throws(() => validateConfig({ nope: 1 }));
  assert.throws(() => validateConfig({ lobbySeconds: 1.5 }));
});

test('bridge: events are ignored until live, then chat joins and gifts dedupe', async () => {
  const { app } = await boot();
  try {
    app.ingest({ type: 'chat', user: user('a'), text: 'vào' });
    assert.equal(app.engine.frame().enrolled, 0, 'offline events ignored');
    app.liveStatus({ status: 'live', username: 'host' });
    app.ingest({ type: 'chat', user: user('a'), text: 'vào' });
    app.ingest({ type: 'chat', user: user('b'), text: 'ninja' });
    assert.equal(app.engine.frame().enrolled, 2);
    app.engine.start();
    app.engine.skip();
    assert.equal(app.engine.frame().phase, 'loot');
    const gift = { type: 'gift', user: user('a'), giftName: 'Rose', repeatCount: 10, diamonds: 1, total: 10, msgId: '99' };
    app.ingest({ ...gift, type: 'giftStreak' });
    assert.equal(app.engine.players.get('a').ent.shieldUntil, 0, 'running combos never count');
    app.ingest(gift);
    assert.ok(app.engine.players.get('a').ent.shieldUntil > 0, '10 diamonds total = T2 shield');
    const before = app.engine.players.get('a').ent.shieldReadyAt;
    app.ingest(gift);
    assert.equal(app.engine.players.get('a').ent.shieldReadyAt, before, 'same msgId is credited once');
    app.liveStatus({ status: 'reconnecting' });
    assert.equal(app.engine.frame().paused, true);
  } finally { await app.close(); }
});

test('http: host check, static whitelist and three module', async () => {
  const { app, port } = await boot();
  try {
    const ok = await fetch(`http://127.0.0.1:${port}/overlay.html`);
    assert.equal(ok.status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/three.module.js`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/server.mjs`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/../package.json`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/control.html`, { headers: { origin: 'http://evil.test' } })).status, 403);
  } finally { await app.close(); }
});

test('ws: control commands, simulation and persisted config', async () => {
  const { app, port, dataDir } = await boot();
  try {
    const c = await client(port);
    await wait(150);
    assert.ok(c.msgs.some((m) => m.type === 'hello' && m.studioPort === 1234));
    c.send({ type: 'simulate', event: 'join', count: 10 });
    await wait(150);
    assert.equal(app.engine.frame().enrolled, 10);
    c.send({ type: 'config', config: { giftPower: 80, tts: 0 } });
    await wait(150);
    assert.equal(app.engine.config.giftPower, 80);
    assert.equal(JSON.parse(readFileSync(join(dataDir, 'config.json'), 'utf8')).tts, 0);
    c.send({ type: 'start' });
    await wait(300);
    assert.ok(c.msgs.some((m) => m.type === 'frame' && m.f.phase === 'drop'));
    assert.ok(c.msgs.some((m) => m.type === 'roster' && m.roster.length === 10));
    c.send({ type: 'bogus' });
    await wait(100);
    assert.ok(c.msgs.some((m) => m.type === 'error'));
    app.liveStatus({ status: 'live', username: 'host' });
    c.send({ type: 'simulate', event: 'join', count: 5 });
    await wait(100);
    assert.ok(c.msgs.filter((m) => m.type === 'error').length >= 2, 'no simulation while live');
    c.ws.close();
  } finally { await app.close(); }
});
