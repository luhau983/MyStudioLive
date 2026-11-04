// Đèn Xanh Đèn Đỏ — pure game logic. No timers, no I/O: the server drives it with tick(now).
//
// Phases: lobby -> countdown -> play (light cycles green -> turning -> red -> green ...) -> result -> lobby.
// Viewers join in the lobby by commenting or tapping hearts. During play, hearts (and the "chạy"/"go" comment)
// move a runner forward. Moving while the light is red eliminates the runner, after a grace window that absorbs
// TikTok's event delay. Gifts give a shield that blocks one elimination, plus a small dash.

export const DEFAULT_CONFIG = Object.freeze({
  countdownSeconds: 3,
  roundSeconds: 90,
  resultSeconds: 12,
  greenMinMs: 2500,
  greenMaxMs: 6000,
  turningMs: 800,
  redMinMs: 2500,
  redMaxMs: 5000,
  graceMs: 1500,
  stepPerTap: 0.5,
  maxStepPerEvent: 4,
  stepPerCommand: 1.5,
  giftDashPerDiamond: 0.5,
  maxGiftDash: 10,
  maxShields: 3,
  maxPlayers: 80,
  minPlayers: 1,
  autoStart: 0,
  lobbySeconds: 30,
  botCount: 10
});

export const MOVE_COMMANDS = ['chạy', 'chay', 'go', 'run', 'đi', 'di', 'tiến', 'tien'];
const normalize = (s) => String(s ?? '').trim().toLowerCase();
export const isMoveCommand = (text) => {
  const t = normalize(text).replace(/[!.?\s]+/g, ' ').trim();
  return MOVE_COMMANDS.includes(t);
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Engine {
  constructor({ config = {}, random = Math.random, onEvent = () => {} } = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.random = random;
    this.onEvent = onEvent;
    this.reset(0);
  }

  configure(config) { this.config = { ...this.config, ...config }; }

  reset(now = this.now ?? 0) {
    this.now = now;
    this.phase = 'lobby';
    this.light = 'green';
    this.phaseEndsAt = 0;
    this.lightEndsAt = 0;
    this.redSince = 0;
    this.roundEndsAt = 0;
    this.lobbyEndsAt = 0;
    this.players = new Map();
    this.nextNumber = 1;
    this.finishOrder = [];
    this.round = (this.round ?? 0);
    this.lastResult = null;
  }

  // ---------- Players ----------
  join({ uniqueId, nickname, avatar = '', bot = false }, now = this.now) {
    if (!uniqueId) return null;
    const existing = this.players.get(uniqueId);
    if (existing) return existing;
    if (this.phase !== 'lobby') return null;
    if (this.players.size >= this.config.maxPlayers) return null;
    const p = {
      id: uniqueId,
      nickname: String(nickname || 'Người chơi').slice(0, 24),
      avatar: String(avatar || ''),
      number: this.nextNumber++,
      pos: 0,
      state: 'alive',
      shields: 0,
      rank: 0,
      outReason: '',
      bot,
      lane: this.random(),
      lastMoveAt: 0,
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
      const id = `bot_${this.nextNumber}`;
      if (this.join({ uniqueId: id, nickname: `Bot ${this.nextNumber}`, bot: true }, now)) added++;
    }
    return added;
  }

  // ---------- Actions from LIVE ----------
  // A move-intent action: hearts or the move command. Returns what happened, for logs/tests.
  move(id, steps, now = this.now) {
    const p = this.players.get(id);
    if (!p || p.state !== 'alive' || this.phase !== 'play') return 'ignored';
    if (this.light === 'red') {
      if (now - this.redSince < this.config.graceMs) return 'grace';
      if (p.shields > 0) {
        p.shields--;
        p.lastMoveAt = now;
        this.onEvent({ type: 'shield', id: p.id, nickname: p.nickname, number: p.number, left: p.shields });
        return 'shielded';
      }
      this.eliminate(p, 'moved', now);
      return 'out';
    }
    p.pos = clamp(p.pos + steps, 0, 100);
    p.lastMoveAt = now;
    if (p.pos >= 100) this.finish(p, now);
    return 'moved';
  }

  tap({ uniqueId, nickname, avatar }, count = 1, now = this.now) {
    if (this.phase === 'lobby') { this.join({ uniqueId, nickname, avatar }, now); return 'joined'; }
    const n = clamp(Number(count) || 1, 1, 1000);
    return this.move(uniqueId, Math.min(n * this.config.stepPerTap, this.config.maxStepPerEvent), now);
  }

  comment({ uniqueId, nickname, avatar, text }, now = this.now) {
    if (this.phase === 'lobby') { this.join({ uniqueId, nickname, avatar }, now); return 'joined'; }
    if (!isMoveCommand(text)) return 'ignored';
    return this.move(uniqueId, this.config.stepPerCommand, now);
  }

  // Gifts never eliminate: they give a shield and (only on green) a short dash.
  gift({ uniqueId, nickname, avatar, diamonds = 1 }, now = this.now) {
    let p = this.players.get(uniqueId);
    if (!p && this.phase === 'lobby') p = this.join({ uniqueId, nickname, avatar }, now);
    if (!p || p.state !== 'alive') return 'ignored';
    p.shields = Math.min(this.config.maxShields, p.shields + 1);
    this.onEvent({ type: 'gift', id: p.id, nickname: p.nickname, number: p.number, shields: p.shields });
    if (this.phase === 'play' && this.light !== 'red') {
      const dash = Math.min(this.config.maxGiftDash, Math.max(1, Number(diamonds) || 1) * this.config.giftDashPerDiamond);
      p.pos = clamp(p.pos + dash, 0, 100);
      p.lastMoveAt = now;
      if (p.pos >= 100) this.finish(p, now);
    }
    return 'shield';
  }

  eliminate(p, reason, now = this.now) {
    if (p.state !== 'alive') return;
    p.state = 'out';
    p.outReason = reason;
    p.outAt = now;
    this.onEvent({ type: 'out', id: p.id, nickname: p.nickname, number: p.number, reason });
  }

  finish(p, now = this.now) {
    if (p.state !== 'alive') return;
    p.state = 'finished';
    p.pos = 100;
    this.finishOrder.push(p.id);
    p.rank = this.finishOrder.length;
    p.finishedAt = now;
    this.onEvent({ type: 'finish', id: p.id, nickname: p.nickname, number: p.number, rank: p.rank });
  }

  // ---------- Flow ----------
  start(now = this.now) {
    if (this.phase !== 'lobby') throw Error('Trận đang diễn ra');
    if (this.players.size < 1) throw Error('Chưa có người chơi');
    this.phase = 'countdown';
    this.phaseEndsAt = now + this.config.countdownSeconds * 1000;
    this.lobbyEndsAt = 0;
    this.onEvent({ type: 'phase', phase: 'countdown' });
  }

  stop(now = this.now) {
    if (this.phase === 'play' || this.phase === 'countdown') this.endRound(now);
  }

  newLobby(now = this.now) {
    // Keep nobody: each round viewers re-join so the field reflects who is still watching.
    this.reset(now);
    this.onEvent({ type: 'phase', phase: 'lobby' });
  }

  randomBetween(lo, hi) { return lo + (hi - lo) * this.random(); }

  setLight(light, now) {
    this.light = light;
    if (light === 'green') this.lightEndsAt = now + this.randomBetween(this.config.greenMinMs, this.config.greenMaxMs);
    if (light === 'turning') this.lightEndsAt = now + this.config.turningMs;
    if (light === 'red') { this.redSince = now; this.lightEndsAt = now + this.randomBetween(this.config.redMinMs, this.config.redMaxMs); }
    this.onEvent({ type: 'light', light });
  }

  endRound(now) {
    for (const p of this.players.values()) if (p.state === 'alive') this.eliminate(p, 'time', now);
    const winners = this.finishOrder.map((id) => this.players.get(id)).filter(Boolean)
      .map((p) => ({ id: p.id, nickname: p.nickname, number: p.number, rank: p.rank, bot: p.bot }));
    this.lastResult = { winners, total: this.players.size };
    this.round++;
    this.phase = 'result';
    this.phaseEndsAt = now + this.config.resultSeconds * 1000;
    this.onEvent({ type: 'result', ...this.lastResult });
  }

  tickBots(now) {
    for (const p of this.players.values()) {
      if (!p.bot || p.state !== 'alive') continue;
      if (this.light === 'green' || this.light === 'turning') {
        if (this.random() < 0.35) this.move(p.id, this.config.stepPerTap * (1 + Math.floor(this.random() * 3)), now);
      } else if (now - this.redSince >= this.config.graceMs && this.random() < 0.004) {
        this.move(p.id, this.config.stepPerTap, now); // a careless bot
      }
    }
  }

  tick(now) {
    this.now = now;
    if (this.phase === 'lobby') {
      if (this.lobbyEndsAt && now >= this.lobbyEndsAt && this.players.size >= this.config.minPlayers) this.start(now);
      return;
    }
    if (this.phase === 'countdown') {
      if (now >= this.phaseEndsAt) {
        this.phase = 'play';
        this.roundEndsAt = now + this.config.roundSeconds * 1000;
        this.setLight('green', now);
        this.onEvent({ type: 'phase', phase: 'play' });
      }
      return;
    }
    if (this.phase === 'play') {
      if (now >= this.lightEndsAt) this.setLight(this.light === 'green' ? 'turning' : this.light === 'turning' ? 'red' : 'green', now);
      this.tickBots(now);
      let alive = 0;
      for (const p of this.players.values()) if (p.state === 'alive') alive++;
      if (alive === 0 || now >= this.roundEndsAt) this.endRound(now);
      return;
    }
    if (this.phase === 'result' && now >= this.phaseEndsAt) {
      this.newLobby(now);
      if (this.config.autoStart) this.addBots(0, now);
    }
  }

  snapshot(now = this.now) {
    const players = [...this.players.values()].map((p) => ({
      id: p.id, nickname: p.nickname, number: p.number, pos: Math.round(p.pos * 10) / 10,
      state: p.state, shields: p.shields, rank: p.rank, bot: p.bot, lane: p.lane, outReason: p.outReason,
      moving: now - p.lastMoveAt < 400
    }));
    const count = (s) => players.filter((p) => p.state === s).length;
    return {
      phase: this.phase,
      light: this.light,
      graceLeftMs: this.light === 'red' ? Math.max(0, this.config.graceMs - (now - this.redSince)) : 0,
      phaseLeftMs: Math.max(0, (this.phase === 'play' ? this.roundEndsAt : this.phase === 'lobby' ? this.lobbyEndsAt : this.phaseEndsAt) - now),
      players,
      counts: { total: players.length, alive: count('alive'), out: count('out'), finished: count('finished'), humans: players.filter((p) => !p.bot).length },
      result: this.lastResult,
      round: this.round,
      config: this.config
    };
  }
}
