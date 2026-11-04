import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, isAttackCommand, isDodgeCommand } from '../engine.mjs';

// random() = 0 -> slams come at slamMinMs, deterministic.
const make = (config = {}) => {
  const events = [];
  const e = new Engine({
    config: { countdownSeconds: 1, roundSeconds: 60, bossHp: 100, slamMinMs: 5000, slamMaxMs: 5000, slamWarnMs: 2000, graceMs: 1000, playerHp: 2, ...config },
    random: () => 0,
    onEvent: (ev) => events.push(ev)
  });
  return { e, events };
};
const u = (id, extra = {}) => ({ uniqueId: id, nickname: id, ...extra });
const toPlay = (e, t = 0) => { e.start(t); e.tick(t + 1000); return t + 1000; };

test('commands are recognised only as the whole comment', () => {
  assert.ok(isAttackCommand('Đánh!'));
  assert.ok(isDodgeCommand('NÉ'));
  assert.ok(!isDodgeCommand('né đi anh'));
  assert.ok(!isAttackCommand('xin chào'));
});

test('viewers join by tapping or commenting; hearts only deal damage during play', () => {
  const { e } = make();
  assert.equal(e.tap(u('a')), 'joined');
  assert.equal(e.comment(u('b', { text: 'hello' })), 'joined');
  assert.equal(e.tap(u('a'), 5), 'ignored');
  const t = toPlay(e);
  assert.equal(e.tap(u('a'), 5, t), 'hit');
  assert.equal(e.bossHp, 95);
  assert.equal(e.players.get('a').damage, 5);
  assert.equal(e.tap(u('late'), 1, t), 'joined', 'late viewers can still join the raid');
});

test('tap damage per event is capped and the attack command has a cooldown', () => {
  const { e } = make({ maxTapDamagePerEvent: 10, damagePerCommand: 3, commandCooldownMs: 1000 });
  e.tap(u('a'));
  const t = toPlay(e);
  e.tap(u('a'), 500, t);
  assert.equal(e.bossHp, 90);
  assert.equal(e.comment(u('a', { text: 'đánh' }), t), 'hit');
  assert.equal(e.comment(u('a', { text: 'đánh' }), t + 500), 'cooldown');
  assert.equal(e.comment(u('a', { text: 'đánh' }), t + 1000), 'hit');
  assert.equal(e.bossHp, 84);
});

test('a slam hurts everyone who did not dodge during the wind-up or grace window', () => {
  const { e, events } = make();
  e.tap(u('a')); e.tap(u('b')); e.tap(u('c'));
  let t = toPlay(e);
  e.tick(t += 5000);
  assert.equal(e.slam, 'warn');
  assert.equal(e.comment(u('a', { text: 'né' }), t + 500), 'dodged');
  e.tick(t + 2000);
  assert.equal(e.slam, 'warn', 'still in the grace window');
  assert.equal(e.comment(u('b', { text: 'né' }), t + 2500), 'dodged', 'late dodges inside grace count');
  e.tick(t += 3000);
  assert.equal(e.slam, 'idle');
  assert.equal(e.players.get('a').hp, 2);
  assert.equal(e.players.get('b').hp, 2);
  assert.equal(e.players.get('c').hp, 1);
  assert.deepEqual(events.find((x) => x.type === 'slam'), { type: 'slam', hurt: 1, dodged: 2, downed: 0 });
});

test('a dodge before the wind-up does not count for the next slam', () => {
  const { e } = make();
  e.tap(u('a')); e.tap(u('b'));
  let t = toPlay(e);
  assert.equal(e.comment(u('a', { text: 'né' }), t), 'ignored');
  e.tick(t += 5000); e.tick(t += 3000);
  assert.equal(e.players.get('a').hp, 1);
});

test('knocked down players are revived by a gift; gifts otherwise crit', () => {
  const { e } = make({ playerHp: 1, critPerDiamond: 10 });
  e.tap(u('a')); e.tap(u('b'));
  let t = toPlay(e);
  e.tick(t += 5000);
  e.comment(u('b', { text: 'né' }), t);
  e.tick(t += 3000);
  assert.equal(e.players.get('a').state, 'down');
  assert.equal(e.tap(u('a'), 5, t), 'ignored', 'down players cannot attack');
  assert.equal(e.gift(u('a', { diamonds: 5 }), t), 'revived');
  assert.equal(e.players.get('a').state, 'alive');
  assert.equal(e.gift(u('a', { diamonds: 5 }), t), 'crit');
  assert.equal(e.bossHp, 50);
});

test('killing the boss wins; the result ranks players by damage', () => {
  const { e, events } = make({ bossHp: 20, critPerDiamond: 10 });
  e.tap(u('a')); e.tap(u('b'));
  const t = toPlay(e);
  e.tap(u('a'), 5, t);
  e.gift(u('b', { diamonds: 3 }), t);
  assert.equal(e.phase, 'result');
  const r = events.find((x) => x.type === 'result');
  assert.equal(r.win, true);
  assert.deepEqual(r.top.map((p) => [p.id, p.damage]), [['b', 15], ['a', 5]]);
});

test('time running out or everyone down loses', () => {
  const { e, events } = make({ playerHp: 1 });
  e.tap(u('a'));
  let t = toPlay(e);
  e.tick(t += 5000); e.tick(t += 3000);
  assert.equal(e.phase, 'result');
  assert.equal(events.at(-1).win, false);
  const m = make();
  m.e.tap(u('a'));
  const t2 = toPlay(m.e);
  m.e.tick(t2 + 60000);
  assert.equal(m.e.phase, 'result');
  assert.equal(m.e.lastResult.win, false);
});

test('the boss enrages under the threshold and slams sooner', () => {
  const { e, events } = make({ bossHp: 100, enrageAt: 50, enrageSpeed: 0.5, critPerDiamond: 60 });
  e.tap(u('a'));
  const t = toPlay(e);
  e.gift(u('a', { diamonds: 1 }), t);
  assert.ok(e.enraged);
  assert.ok(events.some((x) => x.type === 'enrage'));
  e.scheduleSlam(t);
  assert.equal(e.slamAt, t + 2500);
});

test('the result returns to a fresh lobby', () => {
  const { e } = make({ resultSeconds: 2 });
  e.tap(u('a'));
  const t = toPlay(e);
  e.stop(t);
  e.tick(t + 2000);
  assert.equal(e.phase, 'lobby');
  assert.equal(e.players.size, 0);
  assert.equal(e.bossHp, 100);
});
