import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CrowdAudio } from '../crowd-audio.js';

test('requires explicit enable and plays only during pull', async () => {
  const ctx = new FakeContext();
  const audio = new CrowdAudio({ contextFactory: () => ctx, fetch: fakeFetch });
  audio.setPulling(true);
  assert.equal(ctx.sources.length, 0);
  assert.equal(await audio.enable(), true);
  assert.equal(ctx.sources.length, 2);
  assert.deepEqual(ctx.sources.map(s => s.offset), [0, 5]);
  audio.setPulling(false);
  assert.equal(ctx.gain.gain.target, 0);
  await audio.destroy();
});

class FakeParam {
  value = 0;
  cancelScheduledValues() {}
  setValueAtTime(v) { this.value = v; }
  linearRampToValueAtTime(v) { this.target = v; this.value = v; }
}
class FakeContext {
  currentTime = 0; state = 'suspended'; destination = {};
  sources = []; gain = null; panners = [];
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  async decodeAudioData() { return { duration: 10 }; }
  createGain() { return this.gain = { gain: new FakeParam(), connect() {}, disconnect() {} }; }
  createStereoPanner() { const p = { pan: { value: 0 }, connect() {}, disconnect() {} }; this.panners.push(p); return p; }
  createBufferSource() { const s = { connect() {}, disconnect() {}, start(_time, offset) { this.offset = offset; }, stop() { this.stopped = true; } }; this.sources.push(s); return s; }
}
const fakeFetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });

test('fetch is called without an invalid receiver, as required by browser fetch', async () => {
  const ctx = new FakeContext();
  const audio = new CrowdAudio({ contextFactory: () => ctx, fetch: async function () {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    return fakeFetch();
  } });
  assert.equal(await audio.enable(), true);
  await audio.destroy();
});

test('mute, pause, and volume changes control and restart voices', async () => {
  const ctx = new FakeContext();
  const audio = new CrowdAudio({ contextFactory: () => ctx, fetch: fakeFetch });
  await audio.enable();
  audio.setPulling(true);
  assert.deepEqual(ctx.panners.map(p => p.pan.value), [-0.75, 0.75]);
  audio.setVolume(0.08);
  assert.equal(ctx.gain.gain.target, 0.08);
  audio.setMuted(true);
  assert.equal(ctx.gain.gain.target, 0);
  assert.ok(ctx.sources.slice(0, 2).every(s => s.stopped));
  audio.setMuted(false);
  assert.equal(ctx.sources.length, 4);
  audio.setPaused(true);
  assert.equal(ctx.gain.gain.target, 0);
  audio.setPulling(false);
  audio.setPaused(false);
  assert.equal(ctx.sources.length, 4);
  await audio.destroy();
  assert.equal(ctx.state, 'closed');
});

test('rejected autoplay and failed fetch can be retried explicitly', async () => {
  const ctx = new FakeContext();
  let attempts = 0;
  ctx.resume = async () => { if (!attempts++) throw new Error('gesture required'); ctx.state = 'running'; };
  let fetches = 0;
  const audio = new CrowdAudio({ contextFactory: () => ctx, fetch: async () => ++fetches === 1 ? { ok: false, status: 500 } : fakeFetch() });
  audio.setPulling(true);
  assert.equal(await audio.enable(), false);
  assert.equal(await audio.enable(), false);
  assert.equal(await audio.enable(), true);
  assert.equal(ctx.sources.length, 2);
  await audio.destroy();
});

test('destroy during loading prevents later playback', async () => {
  const ctx = new FakeContext();
  let resolve;
  const audio = new CrowdAudio({ contextFactory: () => ctx, fetch: () => new Promise(r => { resolve = r; }) });
  audio.setPulling(true);
  const enabling = audio.enable();
  await Promise.resolve();
  await audio.destroy();
  resolve(await fakeFetch());
  assert.equal(await enabling, false);
  assert.equal(ctx.sources.length, 0);
});

test('one-shot reactions use cached audio and obey mute, pause and volume',async()=>{
 const ctx=new FakeContext();let fetches=0;
 const audio=new CrowdAudio({contextFactory:()=>ctx,fetch:async()=>{fetches++;return fakeFetch();}});
 assert.equal(await audio.playCue('/cheer.mp3'),false,'a gesture is still required');
 await audio.enable();assert.equal(await audio.playCue('/cheer.mp3'),true);
 assert.equal(ctx.sources.at(-1).loop,false);
 audio.setVolume(.25);assert.equal([...audio.cues][0].gain.gain.value,.25*1.4);
 audio.stopCues();assert.equal(await audio.playCue('/cheer.mp3'),true);assert.equal(fetches,2,'base loop and one cached cue');
 audio.setPaused(true);assert.equal(audio.cues.size,0);assert.equal(await audio.playCue('/cheer.mp3'),false);
 audio.setPaused(false);audio.setMuted(true);assert.equal(await audio.playCue('/cheer.mp3'),false);
 await audio.destroy();
});

test('a reaction finishing its download after a phase change cannot play late',async()=>{
 const ctx=new FakeContext();let resolve;
 const audio=new CrowdAudio({contextFactory:()=>ctx,fetch:url=>url==='/late.mp3'?new Promise(r=>{resolve=r;}):fakeFetch()});
 await audio.enable();const pending=audio.playCue('/late.mp3');audio.stopCues();resolve(await fakeFetch());
 assert.equal(await pending,false);assert.equal(ctx.sources.length,0);await audio.destroy();
});

test('preloads are reused and an expired countdown digit never plays late',async()=>{
 const ctx=new FakeContext();let fetches=0;
 const audio=new CrowdAudio({contextFactory:()=>ctx,fetch:async()=>{fetches++;return fakeFetch();}});
 await audio.enable();await audio.preloadCues(['/count-3.mp3','/ko.mp3']);
 assert.equal(fetches,3);
 assert.equal(await audio.playCue('/count-3.mp3',{expiresAt:Date.now()-1}),false);
 assert.equal(ctx.sources.length,0);
 assert.equal(await audio.playCue('/ko.mp3'),true);assert.equal(fetches,3);
 await audio.destroy();
});
