import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location ??= {origin: 'http://127.0.0.1:3001'};
globalThis.document ??= {createElement: () => ({})};
const {createYouTubeMusic} = await import('../youtube-music.js');

const PLAYING = 1, PAUSED = 2;
const state = (phase, paused = false) => ({phase, paused, config: {musicEnabled: true, musicVolume: 30, youtubeMusicUrl: 'https://youtu.be/rrZlxX1FsOU'}});

async function setup() {
  const calls = [], handlers = {}, created = {count: 0};
  const local = {duck() {}, setMuted() {}, update() {}, unlock() {}};
  const player = {setVolume() {}, playVideo: () => calls.push('play'), pauseVideo: () => calls.push('pause'), seekTo() {}, destroy() {}};
  const YT = {Player: function (_frame, {events}) { created.count++; Object.assign(handlers, events); }};
  const el = () => ({textContent: '', replaceChildren() {}, append() {}});
  const button = el(), status = el();
  const music = createYouTubeMusic({local, host: el(), button, status, load: async () => YT});
  music.update(state('playing'));
  await button.onclick();
  handlers.onReady({target: player});
  handlers.onStateChange({data: PLAYING});
  return {calls, handlers, music, status, created};
}

test('late PAUSED event from our own pause is not treated as an autoplay block', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout', 'setInterval', 'Date']});
  const {calls, handlers, music, status} = await setup();
  music.update(state('playing', true));
  assert.equal(calls.at(-1), 'pause');
  music.update(state('playing'));
  assert.equal(calls.at(-1), 'play');
  handlers.onStateChange({data: PAUSED});
  handlers.onStateChange({data: PLAYING});
  assert.match(status.textContent, /Đang phát nhạc YouTube/);
});

test('external pause while studying resumes playback instead of falling back', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout', 'setInterval', 'Date']});
  const {calls, handlers, status} = await setup();
  t.mock.timers.tick(5000);
  const before = calls.length;
  handlers.onStateChange({data: PAUSED});
  assert.equal(calls.slice(before).at(-1), 'play');
  assert.doesNotMatch(status.textContent, /không phát được/);
});

test('transient YouTube failure retries automatically', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout', 'setInterval', 'Date']});
  const {handlers, status, created} = await setup();
  handlers.onError();
  assert.match(status.textContent, /không phát được/);
  t.mock.timers.tick(60000);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(created.count, 2);
});
