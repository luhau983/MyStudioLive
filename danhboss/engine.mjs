// Đánh Boss — pure game logic. No timers, no I/O: the server drives it with tick(now).
//
// Phases: lobby -> countdown -> play -> result -> lobby.
// A co-op raid: viewers join by commenting or tapping hearts, then hearts (and the "đánh" command) deal damage.
// Every few seconds the boss winds up a slam; players who comment "né" during the wind-up (plus a grace window that
// absorbs TikTok's event delay) dodge it, everybody else loses a heart. At 0 hearts a player is knocked down and
// can only be revived by a gift. Gifts also land a critical hit. Beat the boss before the timer ends to win.

export const DEFAULT_CONFIG = Object.freeze({
  countdownSeconds: 3,
  roundSeconds: 150,
  resultSeconds: 12,
  bossHp: 3000,
  damagePerTap: 1,
  maxTapDamagePerEvent: 15,
  damagePerCommand: 4,
  commandCooldownMs: 700,
  critPerDiamond: 25,
  maxCrit: 1500,
  playerHp: 3,
  slamMinMs: 9000,
  slamMaxMs: 15000,
  slamWarnMs: 3500,
  graceMs: 1500,
  enrageAt: 30,          // % boss hp left when the boss enrages: slams come faster
  enrageSpeed: 0.6,
  maxPlayers: 120,
  minPlayers: 1,
  autoStart: 0,
  lobbySeconds: 30,
  botCount: 10
});

const normalize = (s) => String(s ?? '').trim().toLowerCase().replace(/[!.?\s]+/g, ' ').trim();
export const ATTACK_COMMANDS = ['đánh', 'danh', 'chém', 'chem', 'hit', 'attack', 'đấm', 'dam'];
export const DODGE_COMMANDS = ['né', 'ne', 'dodge', 'nhảy', 'nhay', 'tránh', 'tranh', 'jump'];
export const isAttackCommand = (text) => ATTACK_COMMANDS.includes(normalize(text));
export const isDodgeCommand = (text) => DODGE_COMMANDS.includes(normalize(text));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Engine {
  constructor({ config = {}, random = Math.random, onEvent = () => {} } = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.random = random;
    this.onEvent = onEvent;
    this.round = 0;
    this.reset(0);
  }

  configure(config) {
    this.config = { ...this.config, ...config };
    if (this.phase === 'lobby') {
      this.bossHp = this.bossMaxHp = this.config.bossHp;
      for (const p of this.players.values()) p.hp = this.config.playerHp;
    }
  }

  reset(now = this.now ?? 0) {
    this.now = now;
    this.phase = 'lobby';
    this.phaseEndsAt = 0;
    this.roundEndsAt = 0;
    this.lobbyEndsAt = 0;
    this.bossHp = this.config.bossHp;
    this.bossMaxHp = this.config.bossHp;
    this.enraged = false;
    this.slam = 'idle';        // idle -> warn -> (resolve at warnEndsAt + grace) -> idle
    this.slamAt = 0;           // when the next wind-up starts
    this.warnStartedAt = 0;
    this.warnEndsAt = 0;
    this.slamCount = 0;
    this.players = new Map();
    this.nextNumber = 1;
    this.lastResult = null;
  }

  // ---------- Players ----------
  canJoin() { return this.phase === 'lobby' || this.phase === 'countdown' || this.phase === 'play'; }

  join({ uniqueId, nickname, avatar = '', bot = false }, now = this.now) {
    if (!uniqueId) return null;
    const existing = this.players.get(uniqueId);
    if (existing) return existing;
    if (!this.canJoin() || this.players.size >= this.config.maxPlayers) return null;
    const p = {
      id: uniqueId,
      nickname: String(nickname || 'Người chơi').slice(0, 24),
      avatar: String(avatar || ''),
      number: this.nextNumber++,
      hp: this.config.playerHp,
      state: 'alive',
      damage: 0,
      dodgedAt: 0,
      lastCommandAt: -Infinity,
      lastHitAt: 0,
      bot,
      slot: this.random(),
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

  // ---------- Actions from LIVE ----------
  hit(p, amount, kind, now) {
    if (!p || p.state !== 'alive' || this.phase !== 'play' || this.bossHp <= 0) return 'ignored';
    const dmg = Math.max(1, Math.round(Math.min(amount, this.bossHp)));
    this.bossHp -= dmg;
    p.damage += dmg;
    p.lastHitAt = now;
    this.onEvent({ type: 'hit', id: p.id, number: p.number, nickname: p.nickname, damage: dmg, kind });
    if (!this.enraged && this.bossHp > 0 && this.bossHp <= this.bossMaxHp * this.config.enrageAt / 100) {
      this.enraged = true;
      this.onEvent({ type: 'enrage' });
    }
    if (this.bossHp <= 0) this.endRound(now, true);
    return 'hit';
  }

  tap(u, count = 1, now = this.now) {
    let p = this.players.get(u.uniqueId);
    if (!p) { p = this.join(u, now); return p ? 'joined' : 'ignored'; }
    const n = clamp(Number(count) || 1, 1, 1000);
    return this.hit(p, Math.min(n * this.config.damagePerTap, this.config.maxTapDamagePerEvent), 'tap', now);
  }

  comment(u, now = this.now) {
    let p = this.players.get(u.uniqueId);
    if (!p) { p = this.join(u, now); if (!p) return 'ignored'; if (this.phase !== 'play') return 'joined'; }
    if (isDodgeCommand(u.text)) return this.dodge(p, now);
    if (isAttackCommand(u.text)) {
      if (now - p.lastCommandAt < this.config.commandCooldownMs) return 'cooldown';
      p.lastCommandAt = now;
      return this.hit(p, this.config.damagePerCommand, 'command', now);
    }
    return 'ignored';
  }

  dodge(p, now = this.now) {
    if (p.state !== 'alive' || this.phase !== 'play' || this.slam !== 'warn') return 'ignored';
    if (p.dodgedAt >= this.warnStartedAt) return 'dodged';
    p.dodgedAt = now;
    this.onEvent({ type: 'dodge', id: p.id, number: p.number, nickname: p.nickname });
    return 'dodged';
  }

  // Gifts never hurt: they revive a knocked-down player, or land a critical hit.
  gift(u, now = this.now) {
    let p = this.players.get(u.uniqueId);
    if (!p) p = this.join(u, now);
    if (!p) return 'ignored';
    if (p.state === 'down') {
      if (this.phase !== 'play') return 'ignored';
      p.state = 'alive';
      p.hp = this.config.playerHp;
      this.onEvent({ type: 'revive', id: p.id, number: p.number, nickname: p.nickname });
      return 'revived';
    }
    if (this.phase !== 'play') return 'joined';
    const diamonds = Math.max(1, Number(u.diamonds) || 1);
    return this.hit(p, Math.min(this.config.maxCrit, diamonds * this.config.critPerDiamond), 'crit', now) === 'hit' ? 'crit' : 'ignored';
  }

  // ---------- Boss slams ----------
  scheduleSlam(now) {
    const speed = this.enraged ? this.config.enrageSpeed : 1;
    const lo = this.config.slamMinMs * speed, hi = Math.max(lo, this.config.slamMaxMs * speed);
    this.slamAt = now + lo + (hi - lo) * this.random();
  }

  resolveSlam(now) {
    const hurt = [], downed = [];
    let dodged = 0;
    for (const p of this.players.values()) {
      if (p.state !== 'alive') continue;
      if (p.dodgedAt >= this.warnStartedAt) { dodged++; continue; }
      p.hp--;
      hurt.push(p.id);
      if (p.hp <= 0) { p.hp = 0; p.state = 'down'; downed.push(p.id); this.onEvent({ type: 'down', id: p.id, number: p.number, nickname: p.nickname }); }
    }
    this.slam = 'idle';
    this.slamCount++;
    this.onEvent({ type: 'slam', hurt: hurt.length, dodged, downed: downed.length });
    this.scheduleSlam(now);
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
    if (this.phase === 'play' || this.phase === 'countdown') this.endRound(now, false);
  }

  newLobby(now = this.now) {
    this.reset(now);
    this.onEvent({ type: 'phase', phase: 'lobby' });
  }

  ranking() {
    return [...this.players.values()].filter((p) => p.damage > 0).sort((a, b) => b.damage - a.damage || a.number - b.number);
  }

  endRound(now, win) {
    const top = this.ranking().slice(0, 5).map((p) => ({ id: p.id, nickname: p.nickname, number: p.number, damage: p.damage, bot: p.bot }));
    this.lastResult = { win, top, total: this.players.size, bossHpLeft: Math.max(0, this.bossHp), bossMaxHp: this.bossMaxHp };
    this.round++;
    this.phase = 'result';
    this.slam = 'idle';
    this.phaseEndsAt = now + this.config.resultSeconds * 1000;
    this.onEvent({ type: 'result', ...this.lastResult });
  }

  tickBots(now) {
    for (const p of this.players.values()) {
      if (!p.bot || p.state !== 'alive') continue;
      if (this.random() < 0.3) this.hit(p, this.config.damagePerTap * (1 + Math.floor(this.random() * 3)), 'tap', now);
      if (this.phase !== 'play') return;
      if (this.slam === 'warn' && p.dodgedAt < this.warnStartedAt && this.random() < 0.08) this.dodge(p, now);
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
        this.scheduleSlam(now);
        this.onEvent({ type: 'phase', phase: 'play' });
      }
      return;
    }
    if (this.phase === 'play') {
      if (this.slam === 'idle' && now >= this.slamAt) {
        this.slam = 'warn';
        this.warnStartedAt = now;
        this.warnEndsAt = now + this.config.slamWarnMs;
        this.onEvent({ type: 'warn', ms: this.config.slamWarnMs });
      } else if (this.slam === 'warn' && now >= this.warnEndsAt + this.config.graceMs) {
        this.resolveSlam(now);
      }
      this.tickBots(now);
      if (this.phase !== 'play') return; // a bot may have finished the boss
      let alive = 0;
      for (const p of this.players.values()) if (p.state === 'alive') alive++;
      if (now >= this.roundEndsAt || (alive === 0 && this.players.size > 0)) this.endRound(now, false);
      return;
    }
    if (this.phase === 'result' && now >= this.phaseEndsAt) this.newLobby(now);
  }

  snapshot(now = this.now) {
    const players = [...this.players.values()].map((p) => ({
      id: p.id, nickname: p.nickname, number: p.number, hp: p.hp, state: p.state, damage: p.damage, bot: p.bot, slot: p.slot,
      dodging: this.slam === 'warn' && p.dodgedAt >= this.warnStartedAt,
      attacking: now - p.lastHitAt < 350
    }));
    const count = (s) => players.filter((p) => p.state === s).length;
    return {
      phase: this.phase,
      boss: { hp: Math.max(0, this.bossHp), max: this.bossMaxHp, enraged: this.enraged },
      slam: { state: this.slam, leftMs: this.slam === 'warn' ? Math.max(0, this.warnEndsAt - now) : 0, count: this.slamCount },
      phaseLeftMs: Math.max(0, (this.phase === 'play' ? this.roundEndsAt : this.phase === 'lobby' ? this.lobbyEndsAt : this.phaseEndsAt) - now),
      players,
      top: this.ranking().slice(0, 5).map((p) => ({ id: p.id, nickname: p.nickname, number: p.number, damage: p.damage })),
      counts: { total: players.length, alive: count('alive'), down: count('down'), humans: players.filter((p) => !p.bot).length },
      result: this.lastResult,
      round: this.round,
      config: this.config
    };
  }
}
