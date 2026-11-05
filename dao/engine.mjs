// Đảo Sinh Tồn: pure battle-royale simulation. No I/O; clock and RNG are injected so a seeded
// match replays identically in tests. The server calls tick() every ~100 ms and the engine
// advances in fixed 100 ms steps.
import { parseCommand } from './commands.mjs';

export const STEP_MS = 100;
export const ISLAND_RADIUS = 60;
export const CLASS_KEYS = ['warrior', 'archer', 'ninja'];
export const CLASSES = {
  warrior: { name: 'Chiến binh', hp: 130, dmg: 10, range: 1.6, speed: 3.0, armor: 0.85, dodge: 0, cooldown: 1.0 },
  archer: { name: 'Cung thủ', hp: 85, dmg: 8, range: 6, speed: 3.0, armor: 1, dodge: 0, cooldown: 1.2 },
  ninja: { name: 'Ninja', hp: 95, dmg: 9, range: 1.6, speed: 4.05, armor: 1, dodge: 0.2, cooldown: 1.0 }
};
const ZOMBIE = { hp: 40, dmg: 4, range: 1.4, speed: 1.7, armor: 1, dodge: 0, cooldown: 1.5 };
// Fight damage multiplier per phase: early fights are skirmishes so the round lasts ~5 minutes.
export const PACE = { loot: 0.12, storm: [0.2, 0.3, 0.45, 0.7], final: 1.3 };
export const ZONES = { bac: { x: 0, z: -32 }, nam: { x: 0, z: 32 }, dong: { x: 32, z: 0 }, tay: { x: -32, z: 0 } };
export const ZONE_KEYS = Object.keys(ZONES);
// Safe-circle radius as a share of the island, and storm damage per second, per stage.
export const STORM = [{ radius: 0.7, dps: 2 }, { radius: 0.45, dps: 4 }, { radius: 0.25, dps: 7 }, { radius: 0.1, dps: 12 }];
const STORM_FACTOR = [1, 0.8, 0.6, 0.4];
const FINAL_DPS = 16;
const DETECT = 7;
const WEAPON_MULT = [1, 1, 1.3, 1.6];
const STANCE = { hide: { seconds: 8, cooldown: 25 }, charge: { seconds: 10, cooldown: 25 }, heal: { seconds: 5, cooldown: 30 } };
const CELL = 8;

export const DEFAULTS = {
  lobbySeconds: 30, dropSeconds: 8, lootSeconds: 45, stormWaitSeconds: 25, stormShrinkSeconds: 20,
  finalSeconds: 30, resultSeconds: 15, maxPlayers: 500, minPlayers: 8, giftPower: 60, autoJoin: 1,
  zombies: 1, hypeLikes: 3000, rejoinSeconds: 180, likeHealPerSecond: 2
};

export const FLAG = { zombie: 1, shield: 2, hide: 4, charge: 8, heal: 16, drop: 32, donor: 64, follower: 128 };

export function giftTier(diamonds) {
  const d = Number(diamonds) || 0;
  if (d < 1) return 0;
  if (d <= 9) return 1;
  if (d <= 98) return 2;
  if (d <= 498) return 3;
  if (d <= 4999) return 4;
  return 5;
}

const clean = (v, max = 40) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, ' ').trim().slice(0, max) : '');
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

export class GameEngine {
  constructor({ config = {}, now = Date.now, random = Math.random, onResult = () => {}, onEvent = () => {} } = {}) {
    this.now = now; this.random = random; this.onResult = onResult; this.onEvent = onEvent;
    this.config = { ...DEFAULTS };
    this.configure(config);
    this.players = new Map();   // uniqueId -> persistent viewer record
    this.banned = new Set();
    this.giftKeys = new Set();
    this.round = 0; this.rosterVersion = 0; this.pausedAt = null;
    this.clock = now(); this.lastTick = this.clock;
    this.meteorReadyAt = 0;
    this.hype = 0;
    this.lastResult = null;
    this.newLobby();
  }

  configure(cfg = {}) {
    for (const [k, v] of Object.entries(cfg || {})) {
      if (!(k in DEFAULTS)) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) continue;
      this.config[k] = n;
    }
    return { ...this.config };
  }

  // ---------- round lifecycle ----------
  newLobby() {
    this.round++;
    this.phase = 'lobby';
    this.endsAt = this.clock + this.config.lobbySeconds * 1000;
    this.ents = []; this.entById = new Map(); this.nextEnt = 1;
    this.crates = []; this.nextCrate = 1; this.meteors = [];
    this.storm = { x: 0, z: 0, r: ISLAND_RADIUS * 1.1, from: null, to: null, stage: -1, shrinking: false, candidates: [], votes: [0, 0, 0] };
    this.enrolled = [];         // uniqueIds in join order
    this.humansAtStart = 0;
    this.recentJoins = [];
    this.winner = null; this.podium = []; this.mvp = null;
    const cutoff = this.clock - this.config.rejoinSeconds * 1000;
    for (const p of this.players.values()) {
      p.ent = null; p.voted = -1; p.revives = 0; p.airdrops = 0; p.place = 0;
      if (p.queued || (p.lastActivity >= cutoff && p.playedRound === this.round - 1)) { p.queued = false; this.enroll(p, false); }
    }
    for (const [id, p] of this.players) if (p.lastActivity < this.clock - 30 * 60 * 1000 && p.enrolledRound !== this.round && !p.queued) this.players.delete(id);
    this.rosterVersion++;
    this.emit({ type: 'phase', phase: 'lobby', round: this.round });
  }

  enroll(p, announce = true) {
    if (p.enrolledRound === this.round) return true;
    if (this.enrolled.length >= this.config.maxPlayers) { p.queued = true; return false; }
    p.enrolledRound = this.round;
    if (!p.cls) p.cls = this.balancedClass();
    if (!p.zone) p.zone = ZONE_KEYS[Math.floor(this.random() * ZONE_KEYS.length)];
    this.enrolled.push(p.uniqueId);
    if (announce) { this.recentJoins.push(p.nickname); if (this.recentJoins.length > 12) this.recentJoins.shift(); }
    if (this.phase === 'lobby' && this.enrolled.length >= 50) this.endsAt = Math.min(this.endsAt, this.clock + 15000);
    this.rosterVersion++;
    return true;
  }

  balancedClass() {
    const counts = Object.fromEntries(CLASS_KEYS.map(k => [k, 0]));
    for (const id of this.enrolled) { const c = this.players.get(id)?.cls; if (c in counts) counts[c]++; }
    const min = Math.min(...Object.values(counts));
    const pool = CLASS_KEYS.filter(k => counts[k] === min);
    return pool[Math.floor(this.random() * pool.length)];
  }

  spawnEnt({ player = null, zombie = false, x, z, y = 0, hpShare = 1 }) {
    const base = zombie ? ZOMBIE : CLASSES[player.cls];
    const maxHp = base.hp + (player?.bonusHp || 0);
    const e = {
      id: this.nextEnt++, player, zombie, cls: zombie ? -1 : CLASS_KEYS.indexOf(player.cls), base,
      x, z, y, hp: Math.round(maxHp * hpShare), maxHp, alive: true, kills: 0, weapon: 1,
      attackAt: 0, stance: null, stanceUntil: 0, healPool: 0, shieldUntil: 0, shieldReadyAt: 0,
      wx: x, wz: z, donorUntil: 0, diedAt: 0
    };
    if (player) { player.ent = e; player.bonusHp = 0; player.playedRound = this.round; }
    this.ents.push(e); this.entById.set(e.id, e);
    return e;
  }

  randomPointInCircle(cx, cz, r) {
    const a = this.random() * Math.PI * 2, d = Math.sqrt(this.random()) * r;
    return this.clampIsland({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d });
  }

  clampIsland(p, max = ISLAND_RADIUS - 2) {
    const d = Math.hypot(p.x, p.z);
    if (d > max) { p.x *= max / d; p.z *= max / d; }
    return p;
  }

  beginDrop() {
    this.phase = 'drop';
    this.endsAt = this.clock + this.config.dropSeconds * 1000;
    for (const id of this.enrolled) {
      const p = this.players.get(id); if (!p) continue;
      const c = ZONES[p.zone] || ZONES.bac;
      const pos = this.randomPointInCircle(c.x, c.z, 14);
      this.spawnEnt({ player: p, x: pos.x, z: pos.z, y: 40 + this.random() * 10 });
    }
    this.humansAtStart = this.ents.length;
    if (this.config.zombies) {
      const count = Math.round(Math.max(0, this.config.minPlayers - this.humansAtStart) * 1.5);
      for (let i = 0; i < count; i++) { const pos = this.randomPointInCircle(0, 0, ISLAND_RADIUS - 6); this.spawnEnt({ zombie: true, x: pos.x, z: pos.z }); }
    }
    const crates = Math.min(60, Math.max(8, Math.round(this.ents.length / 2)));
    for (let i = 0; i < crates; i++) { const pos = this.randomPointInCircle(0, 0, ISLAND_RADIUS - 4); this.addCrate(pos.x, pos.z, this.random() < 0.25 ? 3 : 2); }
    this.rosterVersion++;
    this.emit({ type: 'phase', phase: 'drop', round: this.round, players: this.humansAtStart });
  }

  addCrate(x, z, tier) { this.crates.push({ id: this.nextCrate++, x, z, tier }); }

  beginLoot() {
    this.phase = 'loot';
    this.endsAt = this.clock + this.config.lootSeconds * 1000;
    for (const e of this.ents) e.y = 0;
    this.emit({ type: 'phase', phase: 'loot' });
  }

  beginStormWait(stage) {
    this.phase = 'storm';
    const s = this.storm;
    s.stage = stage; s.shrinking = false;
    if (stage === 0) { s.x = 0; s.z = 0; s.r = ISLAND_RADIUS; }
    const nextR = ISLAND_RADIUS * STORM[stage].radius;
    s.candidates = [0, 1, 2].map(() => { const p = this.randomPointInCircle(s.x, s.z, Math.max(0, s.r - nextR)); return { x: p.x, z: p.z, r: nextR }; });
    s.votes = [0, 0, 0];
    for (const p of this.players.values()) p.voted = -1;
    this.endsAt = this.clock + this.config.stormWaitSeconds * 1000;
    this.emit({ type: 'phase', phase: 'storm', stage, shrinking: false });
  }

  beginShrink() {
    const s = this.storm;
    const max = Math.max(...s.votes);
    const best = s.votes.map((v, i) => (v === max ? i : -1)).filter(i => i >= 0);
    const pick = max > 0 && best.length === 1 ? best[0] : best[Math.floor(this.random() * best.length)];
    s.from = { x: s.x, z: s.z, r: s.r }; s.to = s.candidates[pick]; s.picked = pick; s.shrinking = true;
    this.shrinkStart = this.clock;
    this.endsAt = this.clock + this.config.stormShrinkSeconds * 1000;
    this.emit({ type: 'phase', phase: 'storm', stage: s.stage, shrinking: true, picked: pick, votes: [...s.votes] });
  }

  beginFinal() {
    this.phase = 'final';
    const s = this.storm;
    s.from = { x: s.x, z: s.z, r: s.r }; s.to = { x: s.x, z: s.z, r: 0 }; s.shrinking = true; s.candidates = [];
    this.shrinkStart = this.clock;
    this.endsAt = this.clock + this.config.finalSeconds * 1000;
    this.emit({ type: 'phase', phase: 'final' });
  }

  finish(winnerEnt) {
    if (this.phase === 'result') return;
    const humans = this.ents.filter(e => !e.zombie);
    if (winnerEnt && !winnerEnt.zombie) { winnerEnt.player.place = 1; }
    for (const e of humans) if (e.alive && e !== winnerEnt) e.player.place = e.player.place || 2;
    const ranked = humans.filter(e => e.player.place).sort((a, b) => a.player.place - b.player.place || b.hp - a.hp);
    const pub = e => ({ uniqueId: e.player.uniqueId, nickname: e.player.nickname, avatar: e.player.avatar, kills: e.kills, cls: CLASS_KEYS[e.cls] });
    this.winner = winnerEnt && !winnerEnt.zombie ? pub(winnerEnt) : null;
    this.podium = ranked.slice(0, 3).map(pub);
    const best = humans.reduce((a, e) => (e.kills > (a?.kills ?? 0) ? e : a), null);
    this.mvp = best ? pub(best) : null;
    this.phase = 'result';
    this.endsAt = this.clock + this.config.resultSeconds * 1000;
    const result = {
      round: this.round, winner: this.winner, podium: this.podium, mvp: this.mvp, humans: humans.length,
      fallen: !this.winner, players: humans.map(e => ({ uniqueId: e.player.uniqueId, nickname: e.player.nickname, kills: e.kills, place: e.player.place || 0 }))
    };
    this.lastResult = result;
    this.emit({ type: 'result', ...result });
    try { this.onResult(result); } catch { /* the host's stats must never break the match */ }
  }

  // ---------- host controls ----------
  start() { if (this.phase === 'lobby' && this.enrolled.length) this.beginDrop(); }
  skip() {
    if (this.phase === 'lobby') return this.start();
    if (this.phase === 'result') return this.newLobby();
    this.endsAt = this.clock;
    this.step();
  }
  endRound() { if (!['lobby', 'result'].includes(this.phase)) this.finish(this.bestAlive()); }
  reset({ clearPlayers = false } = {}) {
    if (clearPlayers) { this.players.clear(); this.giftKeys.clear(); }
    this.hype = 0; this.newLobby();
  }
  kick(uniqueId) {
    this.banned.add(uniqueId);
    const p = this.players.get(uniqueId); if (!p) return false;
    if (p.ent?.alive) { p.ent.alive = false; p.ent.diedAt = this.clock; }
    this.enrolled = this.enrolled.filter(id => id !== uniqueId);
    this.players.delete(uniqueId); this.rosterVersion++;
    return true;
  }
  pause() { if (this.pausedAt === null) this.pausedAt = this.now(); }
  resume() {
    if (this.pausedAt === null) return;
    this.lastTick = this.now(); this.pausedAt = null;
  }

  // ---------- viewer input ----------
  viewer({ uniqueId, nickname, avatar }) {
    if (typeof uniqueId !== 'string' || !uniqueId || uniqueId.length > 128 || this.banned.has(uniqueId)) return null;
    let p = this.players.get(uniqueId);
    if (!p) {
      p = { uniqueId, nickname: clean(nickname) || 'Người xem', avatar: typeof avatar === 'string' && /^https:\/\//.test(avatar) ? avatar.slice(0, 600) : '', cls: null, zone: null, ent: null, cooldowns: {}, lastActivity: this.clock, likeSec: 0, likeUsed: 0, voted: -1, revives: 0, airdrops: 0, bonusHp: 0, follower: false, shared: false };
      this.players.set(uniqueId, p);
    } else {
      if (clean(nickname)) p.nickname = clean(nickname);
      if (typeof avatar === 'string' && /^https:\/\//.test(avatar)) p.avatar = avatar.slice(0, 600);
    }
    p.lastActivity = this.clock;
    return p;
  }

  canLateDrop() { return this.phase === 'drop' || this.phase === 'loot'; }

  // Joins a viewer to the current round if the phase allows; returns 'joined' | 'late' | 'queued' | 'in' | 'full'.
  join(p) {
    if (p.enrolledRound === this.round) return 'in';
    if (this.phase === 'lobby') return this.enroll(p) ? 'joined' : 'full';
    if (this.canLateDrop() && this.enrolled.length < this.config.maxPlayers) {
      this.enroll(p);
      const s = this.storm, r = Math.min(s.r, ISLAND_RADIUS) * 0.8, a = this.random() * Math.PI * 2;
      const pos = this.clampIsland({ x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r });
      this.spawnEnt({ player: p, x: pos.x, z: pos.z, y: 20, hpShare: 0.7 });
      this.humansAtStart++;
      this.rosterVersion++;
      return 'late';
    }
    p.queued = true;
    return 'queued';
  }

  comment(event) {
    const p = this.viewer(event); if (!p) return null;
    const cmd = parseCommand(event.comment); if (!cmd) return null;
    const inRound = p.enrolledRound === this.round;
    if (cmd.kind === 'position') return { kind: 'position', player: p };
    if (cmd.kind === 'vote') {
      const e = p.ent;
      if (this.phase !== 'storm' || this.storm.shrinking || !e || e.alive || p.voted >= 0) return { kind: 'ignored' };
      p.voted = cmd.value; this.storm.votes[cmd.value]++;
      return { kind: 'vote', value: cmd.value };
    }
    if (cmd.kind === 'class' || cmd.kind === 'zone') {
      if (this.phase === 'lobby' || !inRound) { if (cmd.kind === 'class') p.cls = cmd.value; else p.zone = cmd.value; this.rosterVersion++; }
      if (!inRound && (this.config.autoJoin || this.phase === 'lobby')) return { kind: cmd.kind, value: cmd.value, join: this.join(p) };
      return { kind: cmd.kind, value: cmd.value };
    }
    if (cmd.kind === 'stance') {
      if (!inRound) return this.config.autoJoin ? { kind: 'join', join: this.join(p) } : { kind: 'ignored' };
      return { kind: 'stance', value: cmd.value, ok: this.stance(p.ent, cmd.value) };
    }
    if (cmd.kind === 'join' || (cmd.kind === 'chat' && this.config.autoJoin)) {
      if (inRound) return { kind: 'chat' };
      return { kind: 'join', join: this.join(p) };
    }
    return { kind: 'chat' };
  }

  stance(e, kind) {
    if (!e || !e.alive || e.y > 0 || !['loot', 'storm', 'final'].includes(this.phase)) return false;
    const p = e.player, conf = STANCE[kind];
    if ((p.cooldowns[kind] || 0) > this.clock) return false;
    p.cooldowns[kind] = this.clock + conf.cooldown * 1000;
    if (kind === 'heal') { e.healPool = 20; e.healUntil = this.clock + conf.seconds * 1000; }
    else { e.stance = kind; e.stanceUntil = this.clock + conf.seconds * 1000; }
    return true;
  }

  like(event) {
    const p = this.viewer(event); if (!p) return 0;
    const count = Math.max(0, Math.min(1000, Math.floor(Number(event.count ?? event.likeCount) || 0)));
    if (!count) return 0;
    this.addHype(count);
    const e = p.ent;
    if (!e || !e.alive || !['loot', 'storm', 'final'].includes(this.phase)) return 0;
    const sec = Math.floor(this.clock / 1000);
    if (p.likeSec !== sec) { p.likeSec = sec; p.likeUsed = 0; }
    const heal = Math.min(count, this.config.likeHealPerSecond - p.likeUsed);
    if (heal <= 0) return 0;
    p.likeUsed += heal;
    return this.heal(e, heal);
  }

  follow(event) { const p = this.viewer(event); if (p && !p.follower) { p.follower = true; this.rosterVersion++; } }
  share(event) { const p = this.viewer(event); if (p && !p.shared) { p.shared = true; p.bonusHp = 10; } }

  addHype(n) {
    this.hype += n;
    if (this.hype >= this.config.hypeLikes) {
      if (['loot', 'storm', 'final'].includes(this.phase)) {
        this.hype -= this.config.hypeLikes;
        const s = this.storm;
        for (let i = 0; i < 8; i++) { const pos = this.randomPointInCircle(s.x, s.z, Math.min(s.r, ISLAND_RADIUS) * 0.85); this.addCrate(pos.x, pos.z, this.random() < 0.5 ? 3 : 2); }
        this.emit({ type: 'supply' });
      } else this.hype = this.config.hypeLikes;
    }
  }

  heal(e, n) { const before = e.hp; e.hp = Math.min(e.maxHp, e.hp + n); return e.hp - before; }

  stageFactor() {
    if (this.phase === 'storm') return STORM_FACTOR[this.storm.stage] ?? 0.4;
    if (this.phase === 'final') return 0.4;
    return 1;
  }

  // gift: { uniqueId, nickname, avatar, diamonds (total), key? } -> outcome string
  gift(event) {
    if (event.key) {
      if (this.giftKeys.has(event.key)) return 'duplicate';
      if (this.giftKeys.size >= 5000) this.giftKeys.delete(this.giftKeys.values().next().value);
      this.giftKeys.add(event.key);
    }
    const p = this.viewer(event); if (!p) return 'invalid';
    const diamonds = Math.max(0, Number(event.diamonds) || 0);
    const tier = giftTier(diamonds); if (!tier) return 'invalid';
    if (p.enrolledRound !== this.round) {
      const j = this.join(p);
      if (j === 'joined' || j === 'queued' || j === 'full') { p.bonusHp = Math.max(p.bonusHp, 10 * Math.min(tier, 3)); this.addHype(diamonds * 5); return j === 'joined' ? 'joined' : 'queued'; }
    }
    if (this.phase === 'lobby') { p.bonusHp = Math.max(p.bonusHp, 10 * Math.min(tier, 3)); return 'bonus'; }
    if (this.phase === 'result') { this.addHype(diamonds * 5); return 'hype'; }
    const e = p.ent; if (!e) { this.addHype(diamonds * 5); return 'hype'; }
    const power = (this.config.giftPower / 100) * this.stageFactor();
    e.donorUntil = this.clock + 10000;
    const out = this.applyGift(e, tier, power);
    this.emit({ type: 'gift', uniqueId: p.uniqueId, nickname: p.nickname, tier, effect: out, giftName: clean(event.giftName, 40) });
    return out;
  }

  applyGift(e, tier, power) {
    if (this.phase === 'final' && tier !== 1 && tier !== 5) { this.addHype(50); return 'final-locked'; }
    if (tier === 5) {
      if (this.clock >= this.meteorReadyAt) {
        this.meteorReadyAt = this.clock + 60000;
        const s = this.storm, r = Math.min(s.r, ISLAND_RADIUS);
        for (let i = 0; i < 12; i++) { const pos = this.randomPointInCircle(s.x, s.z, r); this.meteors.push({ x: pos.x, z: pos.z, at: this.clock + 1500, donor: e.id, dmg: Math.max(15, 35 * power) }); }
        if (!e.alive) this.revive(e, 0.6); else this.shield(e, 8, true);
        return 'meteor';
      }
      tier = 4;
    }
    if (tier === 4) {
      if (!e.alive) { if (e.player.revives >= 1) return 'revive-used'; e.player.revives++; this.revive(e, 0.6); return 'revive'; }
      this.shield(e, Math.max(3, 6 * power), true); this.heal(e, Math.round(50 * power)); return 'shield+heal';
    }
    if (!e.alive) { this.addHype(20); return 'dead'; }
    if (tier === 3 && e.player.airdrops < 2) {
      e.player.airdrops++;
      const a = this.random() * Math.PI * 2;
      const pos = this.clampIsland({ x: e.x + Math.cos(a) * 3, z: e.z + Math.sin(a) * 3 });
      this.addCrate(pos.x, pos.z, 3);
      return 'airdrop';
    }
    if (tier >= 2 && this.shield(e, Math.max(3, 6 * power))) return 'shield';
    this.heal(e, Math.max(5, Math.round(15 * power)));
    return 'heal';
  }

  shield(e, seconds, force = false) {
    if (!force && (e.shieldUntil > this.clock || e.shieldReadyAt > this.clock)) return false;
    e.shieldUntil = this.clock + seconds * 1000;
    e.shieldReadyAt = this.clock + 20000;
    return true;
  }

  revive(e, share) {
    const s = this.storm, r = Math.min(s.r, ISLAND_RADIUS) * 0.75, a = this.random() * Math.PI * 2;
    const pos = this.clampIsland({ x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r });
    Object.assign(e, { alive: true, hp: Math.round(e.maxHp * share), x: pos.x, z: pos.z, y: 12, wx: pos.x, wz: pos.z, stance: null, healPool: 0 });
    e.player.place = 0;
    this.emit({ type: 'revive', uniqueId: e.player.uniqueId, nickname: e.player.nickname });
  }

  // ---------- simulation ----------
  tick() {
    if (this.pausedAt !== null) return;
    const now = this.now();
    let steps = Math.floor((now - this.lastTick) / STEP_MS);
    if (steps <= 0) return;
    if (steps > 20) { this.lastTick = now - 20 * STEP_MS; steps = 20; }
    for (let i = 0; i < steps; i++) { this.lastTick += STEP_MS; this.clock += STEP_MS; this.step(); }
  }

  step() {
    const dt = STEP_MS / 1000;
    switch (this.phase) {
      case 'lobby':
        if (this.clock >= this.endsAt) {
          if (this.enrolled.length) this.beginDrop();
          else this.endsAt = this.clock + this.config.lobbySeconds * 1000;
        }
        return;
      case 'drop':
        for (const e of this.ents) if (e.y > 0) e.y = Math.max(0, e.y - (50 / this.config.dropSeconds) * dt);
        if (this.clock >= this.endsAt) this.beginLoot();
        return;
      case 'result':
        if (this.clock >= this.endsAt) this.newLobby();
        return;
    }
    // loot / storm / final
    const s = this.storm;
    if (s.shrinking) {
      const t = Math.min(1, (this.clock - this.shrinkStart) / Math.max(1, this.endsAt - this.shrinkStart));
      s.x = s.from.x + (s.to.x - s.from.x) * t; s.z = s.from.z + (s.to.z - s.from.z) * t; s.r = s.from.r + (s.to.r - s.from.r) * t;
    }
    this.simulate(dt);
    if (this.checkEnd()) return;
    if (this.clock < this.endsAt) return;
    if (this.phase === 'loot') this.beginStormWait(0);
    else if (this.phase === 'storm') {
      if (!s.shrinking) this.beginShrink();
      else if (s.stage + 1 < STORM.length) this.beginStormWait(s.stage + 1);
      else this.beginFinal();
    } else if (this.phase === 'final') this.finish(this.bestAlive());
  }

  bestAlive() {
    let best = null;
    for (const e of this.ents) if (e.alive && !e.zombie && (!best || e.hp > best.hp)) best = e;
    return best;
  }

  checkEnd() {
    let humans = 0, zombies = 0, last = null;
    for (const e of this.ents) if (e.alive) { if (e.zombie) zombies++; else { humans++; last = e; } }
    if (humans === 0) { this.finish(null); return true; }
    if (humans === 1 && (this.humansAtStart >= 2 || zombies === 0)) { this.finish(last); return true; }
    if (this.phase === 'storm' && humans <= 3 && this.humansAtStart >= 6) { this.beginFinal(); return false; }
    return false;
  }

  buildGrid() {
    const grid = new Map();
    for (const e of this.ents) {
      if (!e.alive) continue;
      const k = (Math.floor(e.x / CELL) + 64) * 256 + (Math.floor(e.z / CELL) + 64);
      let cell = grid.get(k); if (!cell) grid.set(k, cell = []); cell.push(e);
    }
    return grid;
  }

  nearestEnemy(grid, e, range) {
    const cx = Math.floor(e.x / CELL), cz = Math.floor(e.z / CELL), span = Math.ceil(range / CELL);
    let best = null, bestD = range * range;
    for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) {
      const cell = grid.get((cx + i + 64) * 256 + (cz + j + 64)); if (!cell) continue;
      for (const o of cell) {
        if (o === e || o.y > 0 || (e.zombie && o.zombie)) continue;
        let d = dist2(e, o);
        if (o.stance === 'hide') d /= 0.16; // hidden targets are spotted only at 40% range
        if (d < bestD) { bestD = d; best = o; }
      }
    }
    return best;
  }

  simulate(dt) {
    const s = this.storm, clock = this.clock;
    const grid = this.buildGrid();
    const dps = this.phase === 'final' ? FINAL_DPS : this.phase === 'storm' ? STORM[s.stage].dps : 0;
    for (const e of this.ents) {
      if (!e.alive) continue;
      if (e.stance && e.stanceUntil <= clock) e.stance = null;
      if (e.y > 0) { e.y = Math.max(0, e.y - 10 * dt); continue; }
      if (e.healPool > 0) { const n = Math.min(e.healPool, 4 * dt); e.healPool -= n; this.heal(e, n); }
      const outside = Math.hypot(e.x - s.x, e.z - s.z) > s.r;
      if (outside && dps > 0) this.damage(e, dps * dt * (e.zombie ? 0.5 : 1), null, 'storm');
      if (!e.alive) continue;
      this.think(e, grid, outside, dt);
    }
    if (this.meteors.length) {
      const due = this.meteors.filter(m => m.at <= clock);
      this.meteors = this.meteors.filter(m => m.at > clock);
      for (const m of due) for (const e of this.ents) if (e.alive && e.id !== m.donor && dist2(e, m) <= 16) this.damage(e, m.dmg, this.entById.get(m.donor) || null, 'meteor', true);
    }
  }

  think(e, grid, outside, dt) {
    const b = e.base, s = this.storm;
    let tx = e.wx, tz = e.wz, target = null;
    const hiding = e.stance === 'hide';
    if (!outside || e.stance === 'charge') {
      const range = e.stance === 'charge' ? DETECT * 1.8 : e.zombie ? 9 : DETECT;
      target = hiding ? null : this.nearestEnemy(grid, e, range);
    }
    if (outside && !target) { tx = s.x; tz = s.z; }
    else if (target) {
      const d = Math.sqrt(dist2(e, target));
      if (d <= b.range) {
        tx = e.x; tz = e.z;
        if (b.range > 3 && d < 3) { tx = e.x + (e.x - target.x); tz = e.z + (e.z - target.z); }
        if (this.clock >= e.attackAt) {
          e.attackAt = this.clock + b.cooldown * 1000;
          const pace = this.phase === 'storm' ? PACE.storm[this.storm.stage] : PACE[this.phase] ?? 1;
          const dmg = b.dmg * WEAPON_MULT[e.weapon] * (e.stance === 'charge' ? 1.25 : 1) * pace;
          this.damage(target, dmg, e, 'hit');
        }
      } else { tx = target.x; tz = target.z; }
    } else if (!e.zombie && !hiding) {
      const crate = this.nearestCrate(e);
      if (crate) { tx = crate.x; tz = crate.z; }
      else if ((e.x - e.wx) ** 2 + (e.z - e.wz) ** 2 < 1) this.pickWander(e);
    } else if (e.zombie && (e.x - e.wx) ** 2 + (e.z - e.wz) ** 2 < 1) this.pickWander(e);
    if (hiding && !outside) return;
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d > 0.05) { const step = Math.min(d, b.speed * dt); e.x += (dx / d) * step; e.z += (dz / d) * step; this.clampIsland(e); }
    if (!e.zombie) for (let i = this.crates.length - 1; i >= 0; i--) {
      const c = this.crates[i];
      if (dist2(e, c) <= 2.25) { this.crates.splice(i, 1); e.weapon = Math.max(e.weapon, c.tier); this.heal(e, 20); }
    }
  }

  nearestCrate(e) {
    if (e.weapon >= 3 && e.hp >= e.maxHp * 0.6) return null;
    let best = null, bestD = 100;
    for (const c of this.crates) { const d = dist2(e, c); if (d < bestD && (c.tier > e.weapon || e.hp < e.maxHp * 0.6)) { bestD = d; best = c; } }
    return best;
  }

  pickWander(e) {
    const s = this.storm, t = s.shrinking ? s.to : s;
    const r = Math.min(t.r, ISLAND_RADIUS) * 0.8;
    const p = this.randomPointInCircle(t.x, t.z, r);
    e.wx = p.x; e.wz = p.z;
  }

  damage(e, amount, source, cause, ignoreDodge = false) {
    if (!e.alive || e.y > 0) return;
    if (cause !== 'storm' && e.shieldUntil > this.clock) return;
    if (!ignoreDodge && cause === 'hit' && e.base.dodge && this.random() < e.base.dodge) return;
    e.hp -= amount * (cause === 'storm' ? 1 : e.base.armor);
    if (cause === 'hit') e.healPool = 0;
    if (e.hp > 0) return;
    e.hp = 0; e.alive = false; e.diedAt = this.clock;
    if (!e.zombie) {
      let alive = 0; for (const o of this.ents) if (o.alive && !o.zombie) alive++;
      e.player.place = alive + 1;
    }
    if (source && source !== e && source.alive) { source.kills++; if (!source.zombie) this.heal(source, 10); }
    this.emit({
      type: 'kill', cause, victim: this.entName(e), victimZombie: e.zombie,
      killer: source && source !== e ? this.entName(source) : null, killerZombie: !!source?.zombie
    });
  }

  entName(e) { return e.zombie ? 'Zombie' : e.player.nickname; }

  emit(ev) { try { this.onEvent(ev); } catch { /* listeners must not break the sim */ } }

  // ---------- snapshots ----------
  counts() {
    let humans = 0, zombies = 0;
    for (const e of this.ents) if (e.alive) { if (e.zombie) zombies++; else humans++; }
    return { humans, zombies };
  }

  // Compact per-frame state: entities as arrays to keep JSON small at 10 Hz.
  frame() {
    const clock = this.clock, ents = [];
    for (const e of this.ents) {
      if (!e.alive && clock - e.diedAt > 1500) continue;
      let f = 0;
      if (e.zombie) f |= FLAG.zombie;
      if (e.shieldUntil > clock) f |= FLAG.shield;
      if (e.stance === 'hide') f |= FLAG.hide;
      if (e.stance === 'charge') f |= FLAG.charge;
      if (e.healPool > 0) f |= FLAG.heal;
      if (e.y > 0) f |= FLAG.drop;
      if (e.donorUntil > clock) f |= FLAG.donor;
      if (e.player?.follower) f |= FLAG.follower;
      ents.push([e.id, Math.round(e.x * 10), Math.round(e.z * 10), e.alive ? Math.ceil(e.hp) : 0, e.maxHp, f, Math.round(e.y * 10), e.weapon, e.kills]);
    }
    const s = this.storm, c = this.counts();
    const lobby = this.phase === 'lobby' ? {
      zones: Object.fromEntries(ZONE_KEYS.map(k => [k, 0])), classes: Object.fromEntries(CLASS_KEYS.map(k => [k, 0])), recent: [...this.recentJoins]
    } : null;
    if (lobby) for (const id of this.enrolled) { const p = this.players.get(id); if (p) { lobby.zones[p.zone]++; lobby.classes[p.cls]++; } }
    return {
      phase: this.phase, round: this.round, remainingMs: Math.max(0, this.endsAt - clock), paused: this.pausedAt !== null,
      enrolled: this.enrolled.length, humansAtStart: this.humansAtStart, alive: c.humans, zombies: c.zombies,
      queued: [...this.players.values()].filter(p => p.queued).length,
      storm: { x: Math.round(s.x * 10) / 10, z: Math.round(s.z * 10) / 10, r: Math.round(s.r * 10) / 10, stage: s.stage, shrinking: s.shrinking,
        to: s.shrinking && s.to ? { x: s.to.x, z: s.to.z, r: s.to.r } : null,
        candidates: this.phase === 'storm' && !s.shrinking ? s.candidates.map(p => [Math.round(p.x), Math.round(p.z), Math.round(p.r)]) : [],
        votes: [...s.votes] },
      crates: this.crates.map(c => [c.id, Math.round(c.x * 10), Math.round(c.z * 10), c.tier]),
      meteors: this.meteors.map(m => [Math.round(m.x * 10), Math.round(m.z * 10), m.at - clock]),
      hype: { value: Math.min(this.hype, this.config.hypeLikes), max: this.config.hypeLikes },
      ents, rosterVersion: this.rosterVersion, lobby,
      result: this.phase === 'result' ? { winner: this.winner, podium: this.podium, mvp: this.mvp } : null
    };
  }

  roster() {
    return this.ents.map(e => (e.zombie ? [e.id, 'Zombie', '', -1, 1, ''] : [e.id, e.player.nickname, e.player.avatar, e.cls, 0, e.player.uniqueId]));
  }

  // Host panel view: everything the frame has plus the viewer list.
  snapshot() {
    return {
      ...this.frame(), config: { ...this.config },
      players: this.enrolled.map(id => this.players.get(id)).filter(Boolean).map(p => ({
        uniqueId: p.uniqueId, nickname: p.nickname, cls: p.cls, zone: p.zone,
        alive: p.ent ? p.ent.alive : null, hp: p.ent ? Math.ceil(p.ent.hp) : null, kills: p.ent?.kills ?? 0
      }))
    };
  }
}
