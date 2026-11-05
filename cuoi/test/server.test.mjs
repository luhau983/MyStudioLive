import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createApp, splitText } from '../server.mjs';

const fakeTts = { edgeTts: async (text) => Buffer.from(`edge:${text}`), googleTts: async (text) => Buffer.from(`google:${text}`) };

async function setup(opts = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'cuoi-test-'));
  const staticDir = join(dataDir, 'dist');
  mkdirSync(join(staticDir, 'assets'), { recursive: true });
  writeFileSync(join(staticDir, 'index.html'), '<div id="root"></div>');
  writeFileSync(join(staticDir, 'assets', 'app.js'), 'console.log(1)');
  const bridge = { studioPort: 3000, initialStatus: { status: 'live', username: 'host' } };
  const app = await createApp({ port: 0, dataDir, staticDir, bridge, tts: fakeTts, ...opts });
  const port = app.server.address().port;
  return { app, port, dataDir, close: () => app.close() };
}

function request(port, path, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body !== undefined) { req.setHeader('content-type', 'application/json'); req.end(JSON.stringify(body)); } else req.end();
  });
}

// Open the SSE stream and collect events until `count` named events arrived.
function events(port, path = '/api/tiktok/events') {
  const got = [];
  let buf = '';
  let wake = () => {};
  const req = http.get({ host: '127.0.0.1', port, path, headers: { host: `127.0.0.1:${port}` } }, (res) => {
    res.setEncoding('utf8');
    res.on('data', (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(block), data = /^data: (.+)$/m.exec(block);
        if (ev && data) got.push({ type: ev[1], data: JSON.parse(data[1]) });
      }
      wake();
    });
  });
  req.on('error', () => {});
  const until = async (pred, ms = 2000) => {
    const end = Date.now() + ms;
    while (!pred(got)) {
      if (Date.now() > end) throw Error(`timeout; got ${JSON.stringify(got.map((g) => g.type))}`);
      await new Promise((r) => { wake = r; setTimeout(r, 50); });
    }
    return got;
  };
  return { got, until, close: () => req.destroy() };
}

test('serves the built client for every page path and blocks traversal', async () => {
  const s = await setup();
  try {
    for (const p of ['/', '/control.html', '/overlay.html']) {
      const r = await request(s.port, p);
      assert.equal(r.status, 200);
      assert.match(r.text, /id="root"/);
    }
    assert.equal((await request(s.port, '/assets/app.js')).status, 200);
    assert.equal((await request(s.port, '/../server.mjs')).status, 404);
    assert.equal((await request(s.port, '/%2e%2e/settings.json')).status, 404);
  } finally { await s.close(); }
});

test('rejects foreign Host and Origin headers', async () => {
  const s = await setup();
  try {
    assert.equal((await request(s.port, '/', { headers: { host: 'evil.com' } })).status, 403);
    assert.equal((await request(s.port, '/api/control', { method: 'POST', body: { action: 'reset' }, headers: { origin: 'http://evil.com' } })).status, 403);
    assert.equal((await request(s.port, '/', { headers: { host: `lvh.me:${s.port}` } })).status, 200);
  } finally { await s.close(); }
});

test('bridge events become the SSE events the client expects; gift combos send only the new part', async () => {
  const s = await setup();
  const sse = events(s.port);
  try {
    await sse.until((g) => g.some((e) => e.type === 'status'));
    assert.equal(sse.got.find((e) => e.type === 'status').data.isConnected, true);
    const user = { id: '1', uniqueId: 'lan', nickname: 'Lan Anh', avatar: 'a.png' };
    s.app.ingest({ type: 'chat', user, text: 'cưới vợ @tuan' });
    s.app.ingest({ type: 'giftStreak', user, giftId: '5655', groupId: 'g', repeatCount: 2, diamonds: 1 });
    s.app.ingest({ type: 'giftStreak', user, giftId: '5655', groupId: 'g', repeatCount: 5, diamonds: 1 });
    s.app.ingest({ type: 'gift', user, giftId: '5655', groupId: 'g', repeatCount: 5, diamonds: 1, total: 5 });
    s.app.ingest({ type: 'gift', user, giftId: '1', repeatCount: 1, diamonds: 30, total: 30 });
    s.app.ingest({ type: 'like', user, count: 15 });
    s.app.ingest({ type: 'join', user });
    const got = await sse.until((g) => g.some((e) => e.type === 'member'));
    const chat = got.find((e) => e.type === 'chat').data;
    assert.deepEqual({ username: chat.username, nickname: chat.nickname, comment: chat.comment, avatar: chat.avatar }, { username: 'lan', nickname: 'Lan Anh', comment: 'cưới vợ @tuan', avatar: 'a.png' });
    const gifts = got.filter((e) => e.type === 'gift').map((e) => [e.data.repeatCount, e.data.diamondCount]);
    assert.deepEqual(gifts, [[2, 1], [3, 1], [1, 30]]);
    assert.equal(got.find((e) => e.type === 'like').data.likeCount, 15);
  } finally { sse.close(); await s.close(); }
});

test('ignores bridge events while StudioLive is not live, and announces navigation back to the studio', async () => {
  const s = await setup();
  const sse = events(s.port);
  try {
    await sse.until((g) => g.some((e) => e.type === 'speaker'));
    s.app.liveStatus({ status: 'ended', message: 'Buổi live đã kết thúc' });
    s.app.ingest({ type: 'chat', user: { uniqueId: 'x' }, text: 'hi' });
    s.app.navigateOverlays();
    const got = await sse.until((g) => g.some((e) => e.type === 'navigate'));
    assert.equal(got.some((e) => e.type === 'chat'), false);
    assert.equal(got.filter((e) => e.type === 'status').at(-1).data.error, 'Buổi live đã kết thúc');
    assert.deepEqual(got.find((e) => e.type === 'navigate').data, { port: 3000 });
  } finally { sse.close(); await s.close(); }
});

test('only the most recently opened stage page is the speaker', async () => {
  const s = await setup();
  const a = events(s.port, '/api/tiktok/events?stage=aaa');
  try {
    await a.until((g) => g.some((e) => e.type === 'speaker' && e.data.id === 'aaa'));
    const b = events(s.port, '/api/tiktok/events?stage=bbb');
    await a.until((g) => g.some((e) => e.type === 'speaker' && e.data.id === 'bbb' && e.data.count === 2));
    b.close();
    await a.until((g) => g.at(-1).type === 'speaker' && g.at(-1).data.id === 'aaa' && g.at(-1).data.count === 1);
  } finally { a.close(); await s.close(); }
});

test('control validates actions and persists the channel name', async () => {
  const s = await setup();
  try {
    assert.equal((await request(s.port, '/api/control', { method: 'POST', body: { action: 'rm -rf' } })).status, 400);
    assert.equal((await request(s.port, '/api/control', { method: 'POST', body: { action: 'speak', text: ' ' } })).status, 400);
    const r = await request(s.port, '/api/control', { method: 'POST', body: { action: 'setName', text: 'Kênh\u0007 Vui' } });
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(readFileSync(join(s.dataDir, 'settings.json'), 'utf8')).channelName, 'Kênh Vui');
    assert.equal((await request(s.port, '/api/test/emit', { method: 'POST', body: { type: 'eval' } })).status, 400);
    assert.equal((await request(s.port, '/api/test/emit', { method: 'POST', body: { type: 'chat', data: { username: 'a', nickname: 'A', comment: 'x' } } })).status, 200);
  } finally { await s.close(); }
  // a restarted server replays the saved name to new pages
  const again = await createApp({ port: 0, dataDir: s.dataDir, staticDir: join(s.dataDir, 'dist'), tts: fakeTts });
  const sse = events(again.server.address().port);
  try {
    const got = await sse.until((g) => g.some((e) => e.type === 'control'));
    assert.deepEqual(got.find((e) => e.type === 'control').data, { action: 'setName', text: 'Kênh Vui' });
  } finally { sse.close(); await again.close(); }
});

test('tts picks one of the two MC voices, caches, and falls back to Google', async () => {
  const calls = [];
  const tts = {
    edgeTts: async (text, rate, hype, voice) => { calls.push(voice); if (text === 'fail') throw Error('down'); return Buffer.from('mp3'); },
    googleTts: async () => Buffer.from('google')
  };
  const s = await setup({ tts });
  try {
    assert.equal((await request(s.port, '/api/tts?text=hello&v=f')).text, 'mp3');
    await request(s.port, '/api/tts?text=hello&v=f');
    await request(s.port, '/api/tts?text=hello&v=en-US-Evil');
    assert.deepEqual(calls, ['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural']);
    assert.equal((await request(s.port, '/api/tts?text=fail')).text, 'google');
    assert.equal((await request(s.port, '/api/tts')).status, 400);
  } finally { await s.close(); }
});

test('splitText keeps chunks under the limit', () => {
  const parts = splitText('Một câu rất dài. '.repeat(40), 190);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 190));
});
