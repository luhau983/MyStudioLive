// Thả Bi — a plinko board for TikTok LIVE. Pure game logic. No timers, no I/O: the server drives it with tick(now).
//
// Phases: lobby -> play -> result -> lobby.
// During play, viewers drop balls: comment "thả" (with a cooldown) or send hearts (every N hearts = one ball).
// The engine decides each ball's path up front (one left/right bounce per peg row), so the overlay only animates it
// and the score lands exactly when the animation does. Gifts drop golden balls that multiply the slot's points.
// Highest score when the timer ends wins.

export const DEFAULT_CONFIG = Object.freeze({
  rows: 12,
  roundSeconds: 180,
  resultSeconds: 12,
  basePoints: 10,
  dropCooldownMs: 2000,
  likesPerBall: 15,
  maxBallsPerPlayer: 3,
  maxBallsOnBoard: 60,
  goldMultiplier: 3,
  diamondsPerExtraBall: 10,
  maxGiftBalls: 5,
  rowMs: 210,
  autoStart: 0,
  minPlayers: 1,
  lobbySeconds: 20,
  maxPlayers: 300,
  botCount: 8
});

// Multipliers per slot, edges are the jackpots. Length = rows + 1, symmetric.
export function slotMultipliers(rows) {
  const n = rows + 1, mid = rows / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = Math.abs(i - mid) / mid; // 0 centre .. 1 edge
    out.push(d >= 1 ? 50 : d >= 0.8 ? 10 : d >= 0.6 ? 5 : d >= 0.4 ? 2 : d >= 0.2 ? 1 : 0.5);
  }
  return out;
}

const normalize = (s) => String(s ?? '').trim().toLowerCase().replace(/[!.?\s]+/g, ' ').trim();
export const DROP_COMMANDS = ['thả', 'tha', 'drop', 'bi', 'thả bi', 'tha bi', 'go'];
export const isDropCommand = (text) => DROP_COMMANDS.includes(normalize(text));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Engine {
  constructor({ config = {}, random = Math.random, onEvent = () => {} } = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.random = random;
    this.onEvent = onEvent;
    this.round = 0;
    this.ballSeq = 1;
    this.reset(0);
  }

  configure(config) {
    const rowsChanged = config.rows != null && config.rows !== this.config.rows;
    this.config = { ...this.config, ...config };
    if (rowsChanged) this.balls = []; // in-flight paths no longer match the board
    this.multipliers = slotMultipliers(this.config.rows);
  }

  reset(now = this.now ?? 0) {
    this.now = now;
    this.phase = 'lobby';
    this.phaseEndsAt = 0;
    this.roundEndsAt = 0;
    this.lobbyEndsAt = 0;
    this.players = new Map();
    this.balls = [];
    this.nextNumber = 1;
    this.lastResult = null;
    this.landed = 0;
    this.multipliers = slotMultipliers(this.config.rows);
  }

  // ---------- Players ----------
  join({ uniqueId, nickname, avatar = '', bot = false }, now = this.now) {
    if (!uniqueId) return null;
    const existing = this.players.get(uniqueId);
    if (existing) return existing;
    if (this.phase === 'result' || this.players.size >= this.config.maxPlayers) return null;
    const p = {
      id: uniqueId,
      nickname: String(nickname || 'Người chơi').slice(0, 24),
      avatar: String(avatar || ''),
      number: this.nextNumber++,
      score: 0,
      balls: 0,
      best: 0,
      likes: 0,
      lastDropAt: -Infinity,
      bot,
      joinedAt: now
    };
    this.players.set(uniqueId, p);
    this.onEvent({ type: 'join', id: p.id, nickname: p.nickname, number: p.number, bot });
    if (this.config.autoStart && this.phase === 'lobby' && !this.lobbyEndsAt && this.humanCount() >= this.config.minPlayers) {
      this.lobbyEndsAt = now + this.config.lobbySeconds * 1000;
    }
    return p;
  }

  humanCount() { let n = 0; for (const p of this.players.values()) if (!p.bot) n++; return n; }

  addBots(count = this.config.botCount, now = this.now) {
    let added = 0;
    for (let i = 0; i < count && this.players.size < this.config.maxPlayers; i++) {
      if (this.join({ uniqueId: `bot_${this.nextNumber}`, nickname: `Bot ${this.nextNumber}`, bot: true }, now)) added++;
    }
    return added;
  }

  inFlight(p) { let n = 0; for (const b of this.balls) if (b.owner === p.id) n++; return n; }

  // ---------- Dropping ----------
  // Returns 'dropped' | 'cooldown' | 'busy' | 'ignored'.
  // force: gifts skip the per-player limits. cooldown: only the chat command is rate limited.
  drop(p, now, { gold = false, force = false, cooldown = false } = {}) {
    if (!p || this.phase !== 'play') return 'ignored';
    if (this.balls.length >= this.config.maxBallsOnBoard) return 'busy';
    if (!force) {
      if (this.inFlight(p) >= this.config.maxBallsPerPlayer) return 'busy';
      if (cooldown && now - p.lastDropAt < this.config.dropCooldownMs) return 'cooldown';
      if (cooldown) p.lastDropAt = now;
    }
    const path = [];
    for (let r = 0; r < this.config.rows; r++) path.push(this.random() < 0.5 ? 0 : 1);
    const slot = path.reduce((a, b) => a + b, 0);
    const ball = {
      id: this.ballSeq++, owner: p.id, number: p.number, nickname: p.nickname, gold, path, slot,
      startedAt: now, landsAt: now + (this.config.rows + 2) * this.config.rowMs
    };
    this.balls.push(ball);
    p.balls++;
    this.onEvent({ type: 'drop', ball: this.ballView(ball, now) });
    return 'dropped';
  }

  land(ball, now) {
    const p = this.players.get(ball.owner);
    const mult = this.multipliers[ball.slot] ?? 1;
    const points = Math.round(this.config.basePoints * mult * (ball.gold ? this.config.goldMultiplier : 1));
    if (p) { p.score += points; p.best = Math.max(p.best, points); }
    this.landed++;
    const jackpot = ball.slot === 0 || ball.slot === this.config.rows;
    this.onEvent({ type: 'land', ballId: ball.id, id: ball.owner, number: ball.number, nickname: ball.nickname, slot: ball.slot, multiplier: mult, points, gold: ball.gold, jackpot });
  }

  // ---------- Actions from LIVE ----------
  comment(u, now = this.now) {
    let p = this.players.get(u.uniqueId);
    if (!p) { p = this.join(u, now); if (!p) return 'ignored'; if (this.phase !== 'play') return 'joined'; }
    if (!isDropCommand(u.text)) return 'ignored';
    return this.drop(p, now, { cooldown: true });
  }

  tap(u, count = 1, now = this.now) {
    let p = this.players.get(u.uniqueId);
    if (!p) { p = this.join(u, now); if (!p) return 'ignored'; if (this.phase !== 'play') return 'joined'; }
    if (this.phase !== 'play') return 'ignored';
    // Charge is capped at one full ball so a like burst never turns into a ball flood.
    p.likes = Math.min(p.likes + clamp(Number(count) || 1, 1, 1000), this.config.likesPerBall);
    if (p.likes < this.config.likesPerBall) return 'charging';
    const r = this.drop(p, now);
    if (r === 'dropped') p.likes = 0; // a full board keeps the charge for the next heart
    return r === 'dropped' ? 'dropped' : 'charging';
  }

  gift(u, now = this.now) {
    let p = this.players.get(u.uniqueId);
    if (!p) p = this.join(u, now);
    if (!p || this.phase !== 'play') return p ? 'joined' : 'ignored';
    const diamonds = Math.max(1, Number(u.diamonds) || 1);
    const n = clamp(1 + Math.floor(diamonds / this.config.diamondsPerExtraBall), 1, this.config.maxGiftBalls);
    let dropped = 0;
    for (let i = 0; i < n; i++) if (this.drop(p, now + i, { gold: true, force: true }) === 'dropped') dropped++;
    this.onEvent({ type: 'gift', id: p.id, number: p.number, nickname: p.nickname, balls: dropped });
    return dropped ? 'gold' : 'busy';
  }

  // ---------- Flow ----------
  start(now = this.now) {
    if (this.phase !== 'lobby') throw Error('Ván đang diễn ra');
    this.phase = 'play';
    this.roundEndsAt = now + this.config.roundSeconds * 1000;
    this.lobbyEndsAt = 0;
    this.onEvent({ type: 'phase', phase: 'play' });
  }

  stop(now = this.now) { if (this.phase === 'play') this.endRound(now); }

  newLobby(now = this.now) {
    this.reset(now);
    this.onEvent({ type: 'phase', phase: 'lobby' });
  }

  ranking() {
    return [...this.players.values()].filter((p) => p.score > 0).sort((a, b) => b.score - a.score || b.best - a.best || a.number - b.number);
  }

  endRound(now) {
    // Balls still falling count: land them now so nobody loses points to the buzzer.
    for (const b of this.balls) this.land(b, now);
    this.balls = [];
    const top = this.ranking().slice(0, 5).map((p) => ({ id: p.id, nickname: p.nickname, number: p.number, score: p.score, best: p.best, bot: p.bot }));
    this.lastResult = { top, total: this.players.size, landed: this.landed };
    this.round++;
    this.phase = 'result';
    this.phaseEndsAt = now + this.config.resultSeconds * 1000;
    this.onEvent({ type: 'result', ...this.lastResult });
  }

  tickBots(now) {
    for (const p of this.players.values()) if (p.bot && this.random() < 0.05) this.drop(p, now);
  }

  tick(now) {
    this.now = now;
    if (this.phase === 'lobby') {
      if (this.lobbyEndsAt && now >= this.lobbyEndsAt && this.players.size >= this.config.minPlayers) this.start(now);
      return;
    }
    if (this.phase === 'play') {
      const still = [];
      for (const b of this.balls) { if (now >= b.landsAt) this.land(b, now); else still.push(b); }
      this.balls = still;
      this.tickBots(now);
      if (now >= this.roundEndsAt) this.endRound(now);
      return;
    }
    if (this.phase === 'result' && now >= this.phaseEndsAt) this.newLobby(now);
  }

  ballView(b, now) {
    return { id: b.id, owner: b.owner, number: b.number, nickname: b.nickname, gold: b.gold, path: b.path, slot: b.slot, ageMs: now - b.startedAt, durationMs: b.landsAt - b.startedAt };
  }

  snapshot(now = this.now) {
    const players = [...this.players.values()].map((p) => ({ id: p.id, nickname: p.nickname, number: p.number, score: p.score, balls: p.balls, best: p.best, likes: p.likes, bot: p.bot }));
    return {
      phase: this.phase,
      rows: this.config.rows,
      multipliers: this.multipliers,
      balls: this.balls.map((b) => this.ballView(b, now)),
      phaseLeftMs: Math.max(0, (this.phase === 'play' ? this.roundEndsAt : this.phase === 'lobby' ? this.lobbyEndsAt : this.phaseEndsAt) - now),
      players,
      top: this.ranking().slice(0, 5).map((p) => ({ id: p.id, nickname: p.nickname, number: p.number, score: p.score })),
      counts: { total: players.length, humans: players.filter((p) => !p.bot).length, landed: this.landed, onBoard: this.balls.length },
      result: this.lastResult,
      round: this.round,
      config: this.config
    };
  }
}
