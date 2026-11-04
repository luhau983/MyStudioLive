import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, isMoveCommand } from '../engine.mjs';

// Deterministic light timings: random() = 0 -> every phase uses its minimum length.
const make = (config = {}) => {
  const events = [];
  const e = new Engine({ config: { countdownSeconds: 1, roundSeconds: 60, greenMinMs: 3000, greenMaxMs: 3000, turningMs: 500, redMinMs: 3000, redMaxMs: 3000, graceMs: 1000, stepPerTap: 1, maxStepPerEvent: 200, ...config }, random: () => 0, onEvent: (ev) => events.push(ev) });
  return { e, events };
};
const u = (id) => ({ uniqueId: id, nickname: id });
const toPlay = (e, t = 0) => { e.start(t); e.tick(t + 1000); return t + 1000; }; // play starts green at t+1000

test('viewers join in the lobby by tapping or commenting, not after the game started', () => {
  const { e } = make();
  assert.equal(e.tap(u('a')), 'joined');
  assert.equal(e.comment({ ...u('b'), text: 'hello' }), 'joined');
  assert.equal(e.players.size, 2);
  toPlay(e);
  e.tap(u('late'));
  assert.equal(e.players.has('late'), false);
});

test('moving on green advances; moving on red after grace eliminates; within grace is ignored', () => {
  const { e } = make();
  e.tap(u('a'));
  let t = toPlay(e);
  assert.equal(e.light, 'green');
  assert.equal(e.tap(u('a'), 5, t), 'moved');
  assert.equal(e.players.get('a').pos, 5);
  e.tick(t += 3000); assert.equal(e.light, 'turning');
  assert.equal(e.tap(u('a'), 1, t), 'moved', 'turning is still safe');
  e.tick(t += 500); assert.equal(e.light, 'red');
  assert.equal(e.tap(u('a'), 1, t + 500), 'grace');
  assert.equal(e.players.get('a').state, 'alive');
  assert.equal(e.tap(u('a'), 1, t + 1200), 'out');
  assert.equal(e.players.get('a').state, 'out');
});

test('a gift shield absorbs one red-light move; gifts never eliminate', () => {
  const { e } = make();
  e.tap(u('a'));
  let t = toPlay(e);
  e.tick(t += 3000); e.tick(t += 500);
  assert.equal(e.gift({ ...u('a'), diamonds: 1 }, t + 2000), 'shield');
  assert.equal(e.players.get('a').shields, 1);
  assert.equal(e.tap(u('a'), 1, t + 2000), 'shielded');
  assert.equal(e.players.get('a').state, 'alive');
  assert.equal(e.tap(u('a'), 1, t + 2100), 'out');
});

test('only the move command moves via comments during play', () => {
  assert.ok(isMoveCommand('Chạy!'));
  assert.ok(isMoveCommand('GO'));
  assert.ok(!isMoveCommand('chạy đi anh ơi'));
  const { e } = make({ stepPerCommand: 2 });
  e.tap(u('a'));
  const t = toPlay(e);
  assert.equal(e.comment({ ...u('a'), text: 'xin chào' }, t), 'ignored');
  assert.equal(e.comment({ ...u('a'), text: 'chạy' }, t), 'moved');
  assert.equal(e.players.get('a').pos, 2);
});

test('reaching 100 finishes with a rank; time out eliminates the rest and builds the result', () => {
  const { e, events } = make();
  e.tap(u('a')); e.tap(u('b'));
  const t = toPlay(e);
  e.tap(u('a'), 120, t);
  assert.equal(e.players.get('a').state, 'finished');
  assert.equal(e.players.get('a').rank, 1);
  // stay on green forever for this check
  e.lightEndsAt = Infinity;
  e.tick(t + 60_000);
  assert.equal(e.phase, 'result');
  assert.equal(e.players.get('b').outReason, 'time');
  assert.deepEqual(e.lastResult.winners.map((w) => w.id), ['a']);
  assert.ok(events.some((ev) => ev.type === 'result'));
});

test('round ends early when nobody is left alive, then returns to an empty lobby', () => {
  const { e } = make({ resultSeconds: 5 });
  e.tap(u('a'));
  let t = toPlay(e);
  e.tap(u('a'), 100, t);
  e.tick(t += 100);
  assert.equal(e.phase, 'result');
  e.tick(t += 5000);
  assert.equal(e.phase, 'lobby');
  assert.equal(e.players.size, 0);
});

test('auto start counts down from the first join once enough players are in', () => {
  const { e } = make({ autoStart: 1, minPlayers: 2, lobbySeconds: 10 });
  e.tap(u('a'), 1, 0);
  assert.equal(e.lobbyEndsAt, 0);
  e.tap(u('b'), 1, 1000);
  assert.equal(e.lobbyEndsAt, 11000);
  e.tick(11000);
  assert.equal(e.phase, 'countdown');
});

test('bots join, move on green and the cap on players holds', () => {
  const { e } = make({ maxPlayers: 5 });
  assert.equal(e.addBots(10), 5);
  let t = toPlay(e);
  e.random = () => 0.1; // bots always step on green
  e.tick(t += 100);
  assert.ok([...e.players.values()].every((p) => p.pos > 0));
});
