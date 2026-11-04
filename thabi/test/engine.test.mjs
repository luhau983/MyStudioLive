import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, isDropCommand, slotMultipliers } from '../engine.mjs';

// A scripted random(): bounces come from the queue, then 0 (always left).
const make = (config = {}, seq = []) => {
  const events = [];
  const q = [...seq];
  const e = new Engine({ config: { rows: 4, rowMs: 100, basePoints: 10, dropCooldownMs: 1000, likesPerBall: 5, ...config }, random: () => (q.length ? q.shift() : 0), onEvent: (ev) => events.push(ev) });
  return { e, events };
};
const u = (id, extra = {}) => ({ uniqueId: id, nickname: id, ...extra });

test('slot multipliers are symmetric with jackpots on the edges', () => {
  const m = slotMultipliers(12);
  assert.equal(m.length, 13);
  assert.deepEqual(m, [...m].reverse());
  assert.equal(m[0], 50);
  assert.ok(m[6] < 1);
});

test('drop command matches the whole comment only', () => {
  assert.ok(isDropCommand('Thả!'));
  assert.ok(isDropCommand('tha bi'));
  assert.ok(!isDropCommand('thả tim đi'));
});

test('viewers join in the lobby; balls only drop during play', () => {
  const { e } = make();
  assert.equal(e.comment(u('a', { text: 'thả' })), 'joined');
  assert.equal(e.tap(u('b')), 'joined');
  assert.equal(e.comment(u('a', { text: 'thả' })), 'ignored');
  e.start(0);
  assert.equal(e.comment(u('a', { text: 'thả' }), 0), 'dropped');
  assert.equal(e.balls.length, 1);
});

test('the path decides the slot; points land when the animation ends', () => {
  const { e, events } = make({}, [0.9, 0.9, 0.9, 0.9]); // four rights -> right edge slot 4 (jackpot)
  e.comment(u('a', { text: 'x' }));
  e.start(0);
  e.comment(u('a', { text: 'thả' }), 0);
  const b = e.balls[0];
  assert.deepEqual(b.path, [1, 1, 1, 1]);
  assert.equal(b.slot, 4);
  e.tick(b.landsAt - 1);
  assert.equal(e.players.get('a').score, 0);
  e.tick(b.landsAt);
  assert.equal(e.players.get('a').score, 500);
  const land = events.find((x) => x.type === 'land');
  assert.equal(land.jackpot, true);
  assert.equal(e.balls.length, 0);
});

test('the chat command has a cooldown and a per-player in-flight cap', () => {
  const { e } = make({ maxBallsPerPlayer: 2, dropCooldownMs: 100, rowMs: 10000 });
  e.comment(u('a', { text: 'x' }));
  e.start(0);
  assert.equal(e.comment(u('a', { text: 'thả' }), 0), 'dropped');
  assert.equal(e.comment(u('a', { text: 'thả' }), 50), 'cooldown');
  assert.equal(e.comment(u('a', { text: 'thả' }), 100), 'dropped');
  assert.equal(e.comment(u('a', { text: 'thả' }), 300), 'busy');
});

test('hearts charge a ball every likesPerBall, with no burst from one big like event', () => {
  const { e } = make({ likesPerBall: 5, maxBallsPerPlayer: 10 });
  e.tap(u('a'));
  e.start(0);
  assert.equal(e.tap(u('a'), 3, 0), 'charging');
  assert.equal(e.tap(u('a'), 2, 0), 'dropped');
  assert.equal(e.tap(u('a'), 500, 0), 'dropped');
  assert.equal(e.balls.length, 2);
  assert.equal(e.players.get('a').likes, 0);
});

test('gifts drop golden balls that skip limits and multiply points', () => {
  const { e } = make({ goldMultiplier: 3, diamondsPerExtraBall: 10, maxGiftBalls: 5, maxBallsPerPlayer: 1 });
  e.tap(u('a'));
  e.start(0);
  assert.equal(e.gift(u('a', { diamonds: 25 }), 0), 'gold');
  assert.equal(e.balls.length, 3);
  assert.ok(e.balls.every((b) => b.gold));
  e.tick(10000);
  // all-left paths -> slot 0 jackpot (x50) x gold 3 x base 10
  assert.equal(e.players.get('a').score, 3 * 1500);
});

test('the round ends on time, lands balls still in the air and ranks by score', () => {
  const { e, events } = make({ roundSeconds: 1, rowMs: 10000 });
  e.tap(u('a')); e.tap(u('b'));
  e.start(0);
  e.comment(u('b', { text: 'thả' }), 0);
  e.tick(1000);
  assert.equal(e.phase, 'result');
  const r = events.find((x) => x.type === 'result');
  assert.deepEqual(r.top.map((p) => p.id), ['b']);
  assert.equal(r.landed, 1);
});

test('the board limit stops new drops', () => {
  const { e } = make({ maxBallsOnBoard: 2, maxBallsPerPlayer: 5, dropCooldownMs: 0, rowMs: 10000 });
  e.tap(u('a'));
  e.start(0);
  e.comment(u('a', { text: 'thả' }), 0);
  e.comment(u('a', { text: 'thả' }), 1);
  assert.equal(e.comment(u('a', { text: 'thả' }), 2), 'busy');
});
