import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, giftTier, STEP_MS } from '../engine.mjs';
import { parseCommand } from '../commands.mjs';
import { emptySeason, recordResult, prune, leaderboard } from '../season.mjs';

// Seeded RNG (mulberry32) so full matches are reproducible.
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function setup(config = {}, seed = 1) {
  let time = 0; const results = [], events = [];
  const game = new GameEngine({ config: { minPlayers: 0, ...config }, now: () => time, random: rng(seed), onResult: r => results.push(r), onEvent: e => events.push(e) });
  return { game, results, events, advance(ms) { while (ms > 0) { const d = Math.min(ms, 1000); time += d; ms -= d; game.tick(); } }, run(ms) { for (let t = 0; t < ms; t += 1000) { time += 1000; game.tick(); } } };
}
const say = (game, id, comment = 'vào') => game.comment({ uniqueId: id, nickname: id, comment });

test('command parser handles accents, aliases and long chat', () => {
  assert.deepEqual(parseCommand('Trốn'), { kind: 'stance', value: 'hide' });
  assert.deepEqual(parseCommand('xong len anh em'), { kind: 'stance', value: 'charge' });
  assert.deepEqual(parseCommand('CUNG THỦ'), { kind: 'class', value: 'archer' });
  assert.deepEqual(parseCommand('Bắc'), { kind: 'zone', value: 'bac' });
  assert.deepEqual(parseCommand('bão 2'), { kind: 'vote', value: 1 });
  assert.deepEqual(parseCommand('vị trí'), { kind: 'position' });
  assert.deepEqual(parseCommand('hôm nay trốn học đi chơi vui quá'), { kind: 'chat' });
  assert.equal(parseCommand(''), null);
});

test('gift tiers follow diamond ranges', () => {
  assert.deepEqual([0, 1, 9, 10, 98, 99, 498, 499, 4999, 5000].map(giftTier), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
});

test('lobby waits for a player, then drops, loots and storms', () => {
  const { game, advance } = setup({ lobbySeconds: 5, dropSeconds: 2, lootSeconds: 3 });
  advance(6000);
  assert.equal(game.frame().phase, 'lobby', 'empty lobby restarts');
  say(game, 'a'); say(game, 'b', 'ninja'); say(game, 'c', 'nam');
  assert.equal(game.frame().enrolled, 3);
  advance(5000);
  assert.equal(game.frame().phase, 'drop');
  assert.equal(game.frame().ents.length, 3);
  advance(2000);
  assert.equal(game.frame().phase, 'loot');
  advance(3000);
  assert.equal(game.frame().phase, 'storm');
  assert.equal(game.frame().storm.candidates.length, 3);
});

test('class and zone choices stick and are balanced when unset', () => {
  const { game } = setup();
  say(game, 'a', 'cung'); say(game, 'b', 'chiến binh'); say(game, 'c', 'đông');
  const players = Object.fromEntries(game.snapshot().players.map(p => [p.uniqueId, p]));
  assert.equal(players.a.cls, 'archer');
  assert.equal(players.b.cls, 'warrior');
  assert.equal(players.c.zone, 'dong');
  assert.equal(players.c.cls, 'ninja', 'unchosen class fills the least-picked one');
});

test('autoJoin off requires an explicit join command', () => {
  const { game } = setup({ autoJoin: 0 });
  say(game, 'a', 'hello mọi người');
  assert.equal(game.frame().enrolled, 0);
  say(game, 'a', 'vào');
  assert.equal(game.frame().enrolled, 1);
});

test('late join during loot spawns at 70% hp, after loot queues for next round', () => {
  const { game, advance } = setup({ lobbySeconds: 1, dropSeconds: 1, lootSeconds: 5 });
  say(game, 'a'); say(game, 'b'); advance(2000);
  assert.equal(game.frame().phase, 'loot');
  assert.equal(say(game, 'late').join, 'late');
  const late = game.players.get('late').ent;
  assert.equal(late.hp, Math.round(late.maxHp * 0.7));
  advance(5000);
  assert.equal(say(game, 'queue').join, 'queued');
});

test('stances respect cooldowns', () => {
  const { game, advance } = setup({ lobbySeconds: 1, dropSeconds: 1, lootSeconds: 60 });
  say(game, 'a'); say(game, 'b'); advance(3000);
  assert.equal(say(game, 'a', 'trốn').ok, true);
  assert.equal(say(game, 'a', 'trốn').ok, false);
  assert.equal(game.players.get('a').ent.stance, 'hide');
  advance(9000);
  assert.equal(game.players.get('a').ent.stance, null);
});

test('likes heal with a per-user per-second cap and fill hype into a supply drop', () => {
  const { game, advance, events } = setup({ lobbySeconds: 1, dropSeconds: 1, lootSeconds: 60, hypeLikes: 150 });
  say(game, 'a'); say(game, 'b'); advance(3000);
  const e = game.players.get('a').ent; e.hp = 10;
  assert.equal(game.like({ uniqueId: 'a', count: 50 }), 2);
  assert.equal(game.like({ uniqueId: 'a', count: 50 }), 0);
  const crates = game.crates.length;
  game.like({ uniqueId: 'z', count: 60 });
  assert.equal(game.crates.length, crates + 8);
  assert.ok(events.some(ev => ev.type === 'supply'));
});

test('gifts: dedup, shield cap, airdrop cap, revive once, final locks mid tiers', () => {
  const { game, advance } = setup({ lobbySeconds: 1, dropSeconds: 1, lootSeconds: 60, giftPower: 100 });
  say(game, 'a'); say(game, 'b'); advance(3000);
  const g = (diamonds, key) => game.gift({ uniqueId: 'a', nickname: 'a', diamonds, key });
  assert.equal(g(10, 'k1'), 'shield');
  assert.equal(g(10, 'k1'), 'duplicate');
  assert.equal(g(10, 'k2'), 'heal', 'second shield inside cooldown falls back to heal');
  assert.equal(g(100), 'airdrop');
  assert.equal(g(100), 'airdrop');
  assert.notEqual(g(100), 'airdrop');
  const e = game.players.get('a').ent; e.hp = 0; e.alive = false;
  assert.equal(g(500), 'revive');
  assert.equal(e.alive, true);
  e.alive = false;
  assert.equal(g(500), 'revive-used');
  e.alive = true; e.hp = 50;
  game.beginFinal();
  assert.equal(g(50), 'final-locked');
  assert.equal(g(1), 'heal');
});

test('meteor shower hits everyone except the donor, once per minute', () => {
  const { game, advance } = setup({ lobbySeconds: 1, dropSeconds: 1, lootSeconds: 60, giftPower: 100 });
  for (const id of ['a', 'b', 'c']) say(game, id);
  advance(3000);
  for (const e of game.ents) { e.x = 0; e.z = 0; }
  game.crates = [];
  assert.equal(game.gift({ uniqueId: 'a', diamonds: 5000 }), 'meteor');
  game.meteors.forEach(m => { m.x = 0; m.z = 0; });
  const before = Object.fromEntries(game.ents.map(e => [e.player.uniqueId, e.hp]));
  advance(1600);
  const hp = id => game.players.get(id).ent.hp;
  assert.ok(hp('b') < before.b);
  assert.ok(hp('a') >= before.a - 30, 'donor is shielded from fights and skipped by meteors');
  assert.notEqual(game.gift({ uniqueId: 'a', diamonds: 5000 }), 'meteor');
});

test('ghost votes choose the storm centre', () => {
  const { game, advance } = setup({ lobbySeconds: 1, dropSeconds: 1, lootSeconds: 1, stormWaitSeconds: 10 });
  for (const id of ['a', 'b', 'c']) say(game, id);
  advance(3100);
  assert.equal(game.frame().phase, 'storm');
  const ghost = game.players.get('c').ent; ghost.alive = false;
  assert.equal(say(game, 'c', 'bão 3').kind, 'vote');
  assert.equal(say(game, 'c', 'bão 1').kind, 'ignored', 'one vote per stage');
  assert.equal(say(game, 'a', 'bão 1').kind, 'ignored', 'living players cannot vote');
  const want = game.storm.candidates[2];
  advance(10000);
  assert.equal(game.storm.shrinking, true);
  assert.deepEqual(game.storm.to, want);
});

test('zombies fill an empty room and can never win', () => {
  const { game, run, results } = setup({ minPlayers: 8, lobbySeconds: 1, dropSeconds: 1 }, 7);
  say(game, 'solo');
  run(2000);
  assert.equal(game.frame().zombies, 11);
  run(10 * 60 * 1000);
  assert.equal(results.length >= 1, true);
  const r = results[0];
  if (r.winner) assert.equal(r.winner.uniqueId, 'solo');
  else assert.equal(r.fallen, true);
});

test('full seeded match is deterministic and produces one winner and a podium', () => {
  const play = seed => {
    const { game, run, results } = setup({ lobbySeconds: 2 }, seed);
    for (let i = 0; i < 60; i++) say(game, `p${i}`, ['chiến', 'cung', 'ninja', 'bắc', 'nam'][i % 5]);
    run(10 * 60 * 1000);
    return results[0];
  };
  const a = play(42), b = play(42);
  assert.ok(a, 'match finished');
  assert.ok(a.winner, 'someone won');
  assert.deepEqual(a, b);
  assert.equal(a.podium[0].uniqueId, a.winner.uniqueId);
  assert.equal(a.podium.length, 3);
  assert.equal(a.players.filter(p => p.place === 1).length, 1);
});

test('round returns to a lobby with recent players re-enrolled', () => {
  const { game, run, results } = setup({ lobbySeconds: 2, resultSeconds: 5 }, 3);
  for (let i = 0; i < 10; i++) say(game, `p${i}`);
  run(10 * 60 * 1000);
  assert.ok(results.length >= 1);
  const f = game.frame();
  assert.ok(f.round >= 2);
});

test('pause freezes the clock', () => {
  const { game, advance } = setup({ lobbySeconds: 5 });
  say(game, 'a');
  game.pause(); advance(10000); game.resume();
  assert.equal(game.frame().phase, 'lobby');
  advance(5000);
  assert.equal(game.frame().phase, 'drop');
});

test('kick removes and bans the viewer for the session', () => {
  const { game } = setup();
  say(game, 'bad'); assert.equal(game.frame().enrolled, 1);
  game.kick('bad'); assert.equal(game.frame().enrolled, 0);
  say(game, 'bad'); assert.equal(game.frame().enrolled, 0);
});

test('perf: 500 players simulate under budget', () => {
  const { game, advance } = setup({ lobbySeconds: 1, dropSeconds: 1, lootSeconds: 600, maxPlayers: 500 }, 9);
  for (let i = 0; i < 500; i++) say(game, `p${i}`);
  advance(2100);
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) advance(STEP_MS);
  const per = (performance.now() - t0) / 100;
  assert.ok(per < 8, `tick ${per.toFixed(2)} ms`);
});

test('season records wins, prunes stale viewers and ranks', () => {
  const s = emptySeason(0);
  recordResult(s, { winner: { uniqueId: 'a' }, players: [{ uniqueId: 'a', nickname: 'A', place: 1, kills: 3 }, { uniqueId: 'b', nickname: 'B', place: 2, kills: 5 }, { uniqueId: '__proto__', nickname: 'x', place: 4, kills: 0 }] }, 1000);
  assert.equal(s.players.a.wins, 1);
  assert.equal(s.players.b.top3, 1);
  assert.equal(leaderboard(s)[0].uniqueId, 'a');
  prune(s, 1000 + 61 * 86400000);
  assert.equal(Object.keys(s.players).length, 0);
});
