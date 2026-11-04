import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeVideoId,musicVolume,useDefaultMusic,VoiceSignals} from '../music-state.mjs';
import {GiftFeed} from '../gift-feed.mjs';
import {validateConfig} from '../engine.mjs';

test('youtube links parse to video id, unsafe or foreign links rejected', () => {
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=rrZlxX1FsOU'), 'rrZlxX1FsOU');
  assert.equal(youtubeVideoId('https://youtu.be/rrZlxX1FsOU'), 'rrZlxX1FsOU');
  assert.equal(youtubeVideoId('https://m.youtube.com/shorts/rrZlxX1FsOU'), 'rrZlxX1FsOU');
  assert.equal(youtubeVideoId('http://www.youtube.com/watch?v=rrZlxX1FsOU'), '');
  assert.equal(youtubeVideoId('https://evil.com/watch?v=rrZlxX1FsOU'), '');
  assert.equal(youtubeVideoId('not a url'), '');
  assert.equal(youtubeVideoId(''), '');
});

test('config accepts empty or valid youtube url only', () => {
  assert.doesNotThrow(() => validateConfig({youtubeMusicUrl: ''}));
  assert.doesNotThrow(() => validateConfig({youtubeMusicUrl: 'https://youtu.be/rrZlxX1FsOU', musicVolume: 40}));
  assert.throws(() => validateConfig({youtubeMusicUrl: 'https://example.com'}), /YouTube/);
  assert.throws(() => validateConfig({youtubeMusicUrl: 5}), /YouTube/);
});

test('music volume clamps and ducks to 20%, fallback rules', () => {
  assert.equal(musicVolume({musicVolume: 50}, false), 50);
  assert.equal(musicVolume({musicVolume: 50}, true), 10);
  assert.equal(musicVolume({musicVolume: 150}, false), 100);
  assert.equal(musicVolume({}, false), 16);
  assert.equal(useDefaultMusic({videoId: '', activated: true}), true);
  assert.equal(useDefaultMusic({videoId: 'x', activated: true, failed: false, blocked: false}), false);
  assert.equal(useDefaultMusic({videoId: 'x', activated: true, blocked: true}), true);
});

test('voice signals expire stale overlays', () => {
  let now = 0; const v = new VoiceSignals(() => now), a = {};
  v.update(a, {speaking: true, muted: false});
  assert.deepEqual(v.snapshot(), {ducked: true, muted: false});
  now = 4000;
  assert.deepEqual(v.snapshot(), {ducked: false, muted: false});
  assert.throws(() => v.update(a, {speaking: 'yes', muted: false}));
});

test('gift feed waits for streak end, dedupes, and queues notices', () => {
  let now = 0; const g = new GiftFeed(() => now);
  assert.equal(g.accept({uniqueId: 'a', giftId: 1, groupId: 'g1', giftType: 1, repeatEnd: false, repeatCount: 3}), null);
  const e = g.accept({uniqueId: 'a', giftId: 1, groupId: 'g1', giftType: 1, repeatEnd: true, repeatCount: 5, giftName: 'Rose'});
  assert.equal(e.count, 5);
  assert.equal(g.accept({uniqueId: 'a', giftId: 1, groupId: 'g1', giftType: 1, repeatEnd: true, repeatCount: 5}), null);
  g.accept({uniqueId: 'b', giftName: 'Hoa'});
  assert.equal(g.snapshot().userId, 'a');
  now = 5000;
  assert.equal(g.snapshot().userId, 'b');
  assert.equal(g.accept({}), null);
});

test('gift feed reads tiktok-live-connector v2 giftDetails', () => {
  const g = new GiftFeed(() => 0), base = {user: {uniqueId: 'v2', nickname: 'Viewer'}, giftId: 5655, groupId: 'grp', giftDetails: {giftType: 1, giftName: 'Rose'}};
  assert.equal(g.accept({...base, repeatCount: 1, repeatEnd: 0}), null);
  const e = g.accept({...base, repeatCount: 10, repeatEnd: 1});
  assert.equal(e.count, 10);
  assert.equal(e.giftName, 'Rose');
});
