import { nextSquad,SQUAD_SIZE } from './lineup-flow.mjs';
const defaults = { inactivitySeconds: 300, idleSeconds: 30, lobbySeconds: 5, countdownSeconds: 3, pullSeconds: 45, resultSeconds: 10, transitionSeconds: 2, overtimeSeconds: 10, pvpThreshold: 6, giftMultiplier: 50, likesPerSecond: 15, earlyWinShare: 0.7, earlyWinMinScore: 200, earlyWinMinSeconds: 15, doubleSeconds: 10, botsEnabled: 1, autoJoinLimit: 50, autoStart: 1, minPlayers: 2, heartStartPlayers: 4 };
const nonnegative = n =>Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : 0;

export class GameEngine {
  constructor({ config = {}, onResult = () => {}, onPresence = () => {}, now = Date.now, random = Math.random, maxPlayers = 1000, maxTrackedGifts = 10000 } = {}) {
    this.now = now; this.random = random; this.onResult = onResult; this.onPresence = onPresence; this.config = {...defaults}; this.configure(config);
    this.maxPlayers = Math.max(1, Math.floor(maxPlayers)); this.maxTrackedGifts = Math.max(1, Math.floor(maxTrackedGifts)); this.gifts = new Map(); this.round = 0;
    this.enrollmentSequence=0;this.pausedAt = null; this.players = new Map(); this.running = true; this.mode = null; this.phase = 'lobby'; this.endsAt = now() + this.config.lobbySeconds * 1000; this.clearRound();this.fillBots();
  }
  configure(config = {}) {
    for (const [key, value] of Object.entries(config)) {
      if (key === 'autoJoinLimit' && Number.isInteger(Number(value)) && Number(value) >= 0) this.config.autoJoinLimit = Number(value);
      else if (key === 'autoStart') this.config.autoStart = Number(value) ? 1 : 0;
      else if (key === 'botsEnabled') { this.config.botsEnabled = Number(value) ? 1 : 0; if (this.players) this.fillBots(); }
      else if (key === 'earlyWinPercent' && Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 100) this.config.earlyWinShare = Number(value) / 100;
      else if (key in defaults && Number.isFinite(Number(value)) && Number(value) > 0) this.config[key] = Number(value);
    }
    return {...this.config};
  }
  // Waiting players get the next turn; completed pullers rejoin the FIFO tail.
  // Diamond priority sorts within each cohort, never starves the waiting squad.
  rankPlayers() {
    for (const team of ['red','blue']) {
      const players = [...this.players.values()].filter(p => p.team === team)
        .sort((a,b) => (a.rotationTier||0)-(b.rotationTier||0) || b.priorityDiamonds-a.priorityDiamonds || (a.queueOrder??0)-(b.queueOrder??0));
      // TikTok sends no leave event, so a puller silent for idleSeconds of their own turn is treated as gone: they walk
      // to the stands (even if that leaves a slot empty) until they comment or tap again. Viewers waiting in the stands
      // are expected to be quiet, so their silence never costs them the next turn.
      const at=this.now();
      if (this.phase==='pull') for (const p of players) if (!p.away && p.lineupRank<=SQUAD_SIZE && at-Math.max(p.lastActivity??at,p.turnStart??at)>=this.config.idleSeconds*1000) { p.away=true; delete p.quiet; this.onPresence({type:'away',player:this.publicPlayer(p)}); }
      const active=players.filter(p=>!p.away);
      active.forEach((p,i) => { p.lineupRank = i + 1; });
      players.filter(p=>p.away).forEach((p,i) => { p.lineupRank = Math.max(active.length,SQUAD_SIZE) + i + 1; });
    }
  }
  clearRound({carryPriority = false, resetPriority = false} = {}) {
    this.round++;this.exhibition=this.players.size===0;this.demo=false;this.score = {red: 0, blue: 0}; this.mvp = {red: null, blue: null}; this.overtime = false; this.bots = []; this.likes = []; this.mana = {red:{value:0, buffUntil:null}, blue:{value:0, buffUntil:null}};
    let switched=false;
    for (const p of this.players.values()) {
      // Team requests made mid-match take effect at the next round boundary.
      if (p.pendingTeam) { switched ||= p.team !== p.pendingTeam; p.team = p.pendingTeam; delete p.pendingTeam; }
      if (carryPriority) { p.rotationTier=p.lineupRank<=SQUAD_SIZE?1:0; if(p.rotationTier===1)p.queueOrder=this.enrollmentSequence++; p.priorityDiamonds = p.giftDiamonds; }
      if (resetPriority) { p.rotationTier=0; p.priorityDiamonds = 0; }
      p.points = 0; p.giftDiamonds = 0; p.lastLike = null;
    }
    if (carryPriority || resetPriority || switched) this.rankPlayers();
  }
  // Without bots the lobby auto-starts at minPlayers real players; the host can start from two.
  // lock() splits a one-sided lobby either way.
  activeCount(){ let n=0; for (const p of this.players.values()) if (!p.away) n++; return n; }
  // The host may start with anyone listed; auto-start waits for players who are still active.
  // Bots only fill a squad around real players: an empty room never plays a bot-only match.
  canStart(manual=false){ const count=manual ? this.players.size : this.activeCount(); return this.config.botsEnabled ? count>=1 : count >= (manual ? 2 : Math.max(2,this.config.minPlayers)); }
  // Bots are always named as bots, so the room never shows more viewers than it has.
  fillBots(){
    this.demo=this.players.size===0;this.mode=this.demo?'demo':'pvp';
    if(!this.config.botsEnabled||this.demo){ this.bots=[]; return; }
    const existing=new Map(this.bots.map(b=>[b.uniqueId,b]));
    this.bots=['red','blue'].flatMap(team=>{
      const humans=Math.min(SQUAD_SIZE,[...this.players.values()].filter(p=>p.team===team&&p.lineupRank<=SQUAD_SIZE).length);
      return Array.from({length:SQUAD_SIZE-humans},(_,i)=>{
        const slot=humans+i+1,id=`bot-${team}-${slot}`,nickname=`BOT ${team==='red'?'ĐỎ':'XANH'} ${slot}`;
        const kept=existing.get(id);if(kept){kept.nickname=nickname;return kept;}
        return {uniqueId:id,nickname,team,points:0,bot:true,isBot:true,lineupRank:slot};
      });
    });
  }
  start() { this.running = true; if (this.phase === 'waiting' || this.phase === 'result') { this.clearRound({carryPriority:true}); this.phase = 'lobby'; this.endsAt = this.now() + this.config.lobbySeconds * 1000; } else if (this.phase === 'transition') { this.phase = 'lobby'; this.endsAt = this.now() + this.config.lobbySeconds * 1000; } if (this.phase === 'lobby' && this.canStart(true)) this.lock(this.now()); return this.snapshot(); }
  // Replay the current match: the same squad goes straight back to the countdown with the score, mana and points of
  // this round wiped. No rotation happens, and nothing is recorded. Outside a match it simply starts one.
  replay() { if (!['countdown','pull','result','transition'].includes(this.phase)) return this.start(); this.running = true; this.lock(this.now()); return this.snapshot(); }
  stop() { this.running = false; this.phase = 'waiting'; this.endsAt = null; return this.snapshot(); }
  reset({clearPlayers = false} = {}) { if (clearPlayers) { this.players.clear(); this.gifts.clear(); } this.clearRound({resetPriority:true});this.fillBots(); this.phase = 'lobby'; this.running = true; this.endsAt = this.now() + this.config.lobbySeconds * 1000; return this.snapshot(); }
  // A squad member silent for idleSeconds in any phase is flagged quiet (maybe left the live) for the operator only:
  // it never moves them. The waiting queue is never tracked, since waiting viewers are expected to be quiet.
  markQuiet(at) {
    for (const p of this.players.values()) {
      if (p.lineupRank>SQUAD_SIZE) { delete p.quiet; continue; }
      if (!p.away && !p.quiet && at-(p.lastActivity??at)>=this.config.idleSeconds*1000) { p.quiet=true; this.onPresence({type:'quiet',player:this.publicPlayer(p)}); }
    }
  }
  pruneInactive(at) {
    let removed=false;
    // Viewers queued in the stands are kept however long the queue takes; only pullers who went quiet are dropped.
    for (const [id,p] of this.players) if (at - p.lastActivity >= this.config.inactivitySeconds * 1000 && (p.away || p.lineupRank <= SQUAD_SIZE)) {this.players.delete(id);removed=true;this.onPresence({type:'removed',player:this.publicPlayer(p)});}
    if(['lobby','waiting'].includes(this.phase))this.rankPlayers();
    this.fillBots();
  }
  lock(at) {
    this.pruneInactive(at);
    this.clearRound(); this.mode = this.players.size?'pvp':'demo';
    if (this.mode === 'pvp' && this.players.size > 1) { const players=[...this.players.values()]; if (players.every(p=>p.team===players[0].team)) { const target=players[0].team==='red'?'blue':'red'; for (const p of players.slice(-Math.floor(players.length/2))) p.team=target; } }
    this.rankPlayers();
    this.fillBots();
    for (const p of this.players.values()) if (p.lineupRank<=SQUAD_SIZE) p.turnStart = at;
    this.phase = 'countdown'; this.endsAt = at + this.config.countdownSeconds * 1000;
  }
  pause() { if (this.pausedAt !== null) return; this.tick(); this.pausedAt = this.now(); }
  resume() { if (this.pausedAt === null) return; const delta=Math.max(0,this.now()-this.pausedAt); for (const key of ['endsAt','pullStarted','nextBotAt']) if (Number.isFinite(this[key])) this[key]+=delta; for (const p of this.players.values()) { if (Number.isFinite(p.lastActivity)) p.lastActivity+=delta; if (Number.isFinite(p.turnStart)) p.turnStart+=delta; if (p.lastLike !== null && Number.isFinite(p.lastLike)) p.lastLike+=delta; } for (const like of this.likes) like.at+=delta; for (const m of Object.values(this.mana)) if (m.buffUntil !== null) m.buffUntil+=delta; this.pausedAt=null; }
  player(event, requested) {
    if (!event || !event.uniqueId) return null;
    let p = this.players.get(event.uniqueId);
    if (!p) {
      // Never evict a participant (or their earned points) during a match.
      if (['lobby','waiting'].includes(this.phase)) this.pruneInactive(this.now());
      if (this.players.size >= this.maxPlayers) return null;
      const counts = {red:0, blue:0}; for (const other of this.players.values()) counts[other.team]++;
      // Mid-match, a requested team is honored while it still has a bot slot to take over; otherwise balance.
      const open = requested && (['lobby','waiting'].includes(this.phase) || counts[requested] < SQUAD_SIZE);
      const team = this.mode === 'pve' && !['lobby','waiting'].includes(this.phase) ? 'red' : (open && requested) || (counts.red <= counts.blue ? 'red' : 'blue');
      p = {uniqueId:event.uniqueId, nickname:event.nickname || event.uniqueId, avatar:event.avatar || '', team, points:0, giftDiamonds:0, priorityDiamonds:0, rotationTier:2, queueOrder:this.enrollmentSequence++, lineupRank:1 + Math.max(0,...[...this.players.values()].filter(p=>p.team===team).map(p=>p.lineupRank)), lastLike:null}; this.players.set(p.uniqueId,p);
    } else { if (event.nickname) p.nickname = event.nickname; if (event.avatar) p.avatar = event.avatar; if (requested && p.team === requested) delete p.pendingTeam; else if (requested && ['lobby','waiting'].includes(this.phase)) { p.team = requested; delete p.pendingTeam; this.rankPlayers(); } else if (requested) p.pendingTeam = requested; }
    p.lastActivity = this.now(); if (p.away || p.quiet) { delete p.away; delete p.quiet; this.onPresence({type:'back',player:this.publicPlayer(p)}); }
    if (['lobby','waiting'].includes(this.phase)) this.rankPlayers();
    // One real participant replaces one bot on their team, keeping the current
    // clock, team score and everyone else's lineup intact.
    this.fillBots();
    if(['lobby','waiting','transition','countdown'].includes(this.phase))this.exhibition=false;
    if (this.phase === 'waiting' && this.running) { this.phase = 'lobby'; this.endsAt = this.now() + this.config.lobbySeconds * 1000; }
    return p;
  }
  comment(event) {
    if (this.pausedAt !== null) return; this.tick({snapshot:false}); const text = String(event?.comment || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z\s]/g,'').trim().replace(/\s+/g,' ');
    if (text === 'vi tri') return;
    const team = text === 'do' ? 'red' : text === 'xanh' ? 'blue' : null;
    if (team || this.players.has(event?.uniqueId) || this.canAutoJoin()) this.player(event, team);
  }
  // Until autoJoinLimit players are in, entering the room, liking or any comment joins a balanced team;
  // past it only an ĐỎ/XANH comment enrolls someone new.
  // A non-game command (VỊ TRÍ) still proves presence: refresh an existing player, never enroll.
  touch(event) { if (this.pausedAt !== null || !this.players.has(event?.uniqueId)) return; this.tick({snapshot:false}); this.player({uniqueId:event.uniqueId}); }
  canAutoJoin() { return this.players.size < this.config.autoJoinLimit; }
  member(event) { if (this.pausedAt !== null) return; this.tick({snapshot:false}); if (this.players.has(event?.uniqueId) || this.canAutoJoin()) this.player(event); }
  like(event) {
    if (this.pausedAt !== null) return; this.tick({snapshot:false}); if (!this.players.has(event?.uniqueId) && !this.canAutoJoin()) return; const p = this.player(event);
    // With heartStartPlayers active real players in the lobby, any of their hearts skips the lobby wait (and minPlayers).
    if (p && this.phase === 'lobby' && this.running && this.config.autoStart && this.activeCount() >= this.config.heartStartPlayers) { this.lock(this.now()); return; }
    if (!p || this.phase !== 'pull') return;
    // Every real heart counts once; likesPerSecond is kept only so older saved configs still load.
    const at = this.now(); p.lastLike = at;
    const base = nonnegative(event.likeCount);
    this.add(p,base); this.chargeMana(p.team,base/100,at); this.likes.push({at, points:base}); this.checkEarly(at);
  }
  gift(event) {
    if (this.pausedAt !== null) return 'paused';
    this.tick({snapshot:false});
    const p = this.player(event);
    if (event.live) {
      const status = this.trackGift(event);
      if (status !== 'ready') return status;
    }
    if (!p) return 'roster-full';
    if (this.phase !== 'pull' || (event.streakable && !event.repeatEnd)) return 'pending';
    const diamonds = nonnegative(event.diamondCount) * nonnegative(event.repeatCount ?? 1);
    p.giftDiamonds += diamonds;
    const points = diamonds * this.config.giftMultiplier;
    p.points += points;
    this.score[p.team] += points;
    const at = this.now();
    this.chargeMana(p.team,diamonds,at);
    this.checkEarly(at);
    return 'credited';
  }
  // Connector 2.5.0 emits v3 protobufs unchanged (dist/lib-*.js,
  // WebcastGiftMessage branch). Its README documents cumulative repeatCount,
  // including a second event for a single type-1 gift. Message IDs can change
  // between updates: use sender + gift + groupId for a streak, common.msgId for
  // a non-streak gift. Never convert 64-bit identifier strings to Number.
  // Assumes groupId is stable within a sender/gift streak; the installed schema
  // supplies the field but does not guarantee uniqueness or event delivery.
  // Final-only scoring is preserved. First observation owns the streak, even
  // outside pull; a late completion cannot move its value into another match.
  // A completion with no observed start is rejected, not assigned by arrival.
  // LIMITATION: no reliable per-repeat timestamps, so unfinished boundary
  // streaks are not apportioned. Missing IDs/conflicts are rejected explicitly.
  // Keep tombstones across rounds/reset/reconnect. At 10,000 identities fail
  // closed rather than evict and risk replay credit; a source clear resets it.
  // Dropped/reordered progress can hide the true start; first observation is a
  // conservative local policy, not proof of purchase time. This is in-memory
  // protection, not durable exactly-once payment accounting.
  trackGift(event) {
    const id = value => typeof value === 'string' && value !== '' && value !== '0' && value.length <= 128 ? value : null;
    const identity = event.streakable ? id(event.groupId) : id(event.msgId);
    if (typeof event.streakable !== 'boolean' || !id(event.uniqueId) || !id(event.giftId) || !identity) return 'unidentified';
    const count = Number(event.repeatCount), value = Number(event.diamondCount);
    if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(value) || value < 1 || !Number.isSafeInteger(count * value)) return 'invalid-value';
    const key = JSON.stringify([event.streakable ? 'streak' : 'single', event.uniqueId, event.giftId, identity]);
    let record = this.gifts.get(key);
    if (!record) {
      if (this.gifts.size >= this.maxTrackedGifts) return 'capacity';
      record = {round:this.phase === 'pull' ? this.round : null, count:0, value, done:false};
      this.gifts.set(key,record);
      if (event.streakable && event.repeatEnd) { record.round = null; return 'unobserved-start'; }
    }
    if (record.round !== this.round || this.phase !== 'pull') return 'cross-round';
    if (record.value !== value || (record.done && count !== record.count) || (event.repeatEnd && count < record.count)) return 'conflict';
    if (record.done) return 'duplicate';
    record.count = Math.max(record.count,count);
    if (event.streakable && !event.repeatEnd) return 'pending';
    record.done = true;
    return 'ready';
  }
  updateMana(at) { for (const m of Object.values(this.mana)) { if (m.buffUntil !== null && at >= m.buffUntil) { const expiry=m.buffUntil; m.buffUntil=null; if (m.value >= 100) { m.value=0; m.buffUntil=expiry+5000; if (at >= m.buffUntil) m.buffUntil=null; } } } }
  chargeMana(team, amount, at) { const m=this.mana[team]; this.updateMana(at); m.value=Math.min(100,m.value+amount); if (m.value >= 100 && m.buffUntil === null) { m.value=0; m.buffUntil=at+5000; } }
  add(p,base) { const mult = ((!this.overtime && this.endsAt - this.now() <= this.config.doubleSeconds * 1000) || (this.mana[p.team].buffUntil !== null && this.now() < this.mana[p.team].buffUntil)) ? 2 : 1; const points = base * mult; p.points += points; this.score[p.team] += points; }
  checkEarly(at) {
    if (this.phase !== 'pull' || this.overtime || at - this.pullStarted < this.config.earlyWinMinSeconds * 1000) return;
    const total = this.score.red + this.score.blue;
    if (total >= this.config.earlyWinMinScore && Math.max(this.score.red,this.score.blue) / total >= this.config.earlyWinShare) this.finish(at);
  }
  finish(at) {
    for (const team of ['red','blue']) { const candidates = [...this.players.values()].filter(p=>p.team === team && p.points > 0).sort((a,b)=>b.points-a.points); this.mvp[team] = candidates.length ? this.publicPlayer(candidates[0]) : null; }
    for (const m of Object.values(this.mana)) m.buffUntil=null; this.phase = 'result'; this.endsAt = at + this.config.resultSeconds * 1000;
    const winner = this.score.red === this.score.blue ? 'draw' : this.score.red > this.score.blue ? 'red' : 'blue';
    this.onResult({...this.snapshot(), winner});
  }
  tick({snapshot=true}={}) {
    if (!this.running || this.pausedAt !== null) return snapshot?this.snapshot():undefined; const now = this.now(); this.markQuiet(now);
    for (let guard=0; guard<1000; guard++) {
      if (this.phase === 'lobby') {
        this.pruneInactive(Math.min(now, this.endsAt));
      } else if (this.phase !== 'waiting' && this.players.size) {
        // Someone who left mid-match walks off to the stands; their points stay with the team.
        this.rankPlayers(); this.fillBots();
      }
      if (this.phase === 'pull' && this.bots.length) {
        const until = Math.min(now,this.endsAt);
        while (this.nextBotAt <= until && this.phase === 'pull') {
          const at = this.nextBotAt; this.nextBotAt += 1000;
          for(const bot of this.bots){
            const momentum=.85+.3*Math.sin(at/2700+this.round+(bot.team==='red'?0:Math.PI));
            const points=4*this.random()*momentum;bot.points+=points;this.score[bot.team]+=points;
          }
          this.checkEarly(at);
        }
      }
      if (this.phase === 'pull') { this.updateMana(Math.min(now,this.endsAt)); this.checkEarly(Math.min(now,this.endsAt)); }
      if (this.endsAt === null || now < this.endsAt) break;
      const at = this.endsAt;
      // With autoStart off the lobby holds until the host presses start.
      if (this.phase === 'lobby') { if (this.canStart() && this.config.autoStart) this.lock(at); else this.endsAt = at + this.config.lobbySeconds*1000; }
      else if (this.phase === 'countdown') { this.phase = 'pull'; this.pullStarted = at; this.endsAt = at + this.config.pullSeconds*1000; this.nextBotAt = at+1000; }
      else if (this.phase === 'pull') {
        if (!this.overtime && this.score.red === this.score.blue) { this.overtime = true; this.endsAt = at + this.config.overtimeSeconds*1000; }
        else this.finish(at);
      } else if (this.phase === 'result') { this.pruneInactive(at); this.clearRound({carryPriority:true});this.fillBots(); this.phase = 'transition'; this.endsAt = at + this.config.transitionSeconds*1000; }
      else if (this.phase === 'transition') { this.phase = 'lobby'; this.endsAt = at + this.config.lobbySeconds*1000; }
      else break;
    }
    return snapshot?this.snapshot():undefined;
  }
  publicPlayer(p) { const {uniqueId,nickname,avatar,team,points,giftDiamonds,priorityDiamonds,lineupRank,queueOrder,pendingTeam} = p; return {uniqueId,nickname,avatar,team,points,giftDiamonds,priorityDiamonds,lineupRank,queueOrder,away:!!p.away,quiet:!!p.quiet,...(pendingTeam?{pendingTeam}:{})}; }
  snapshot() { const total = this.score.red+this.score.blue; return {squadSize:SQUAD_SIZE,autoJoinOpen:this.canAutoJoin(),waitingForPlayers:this.phase==='lobby'&&!this.canStart(),playersNeeded:this.phase==='lobby'&&!this.config.botsEnabled?Math.max(0,Math.max(2,this.config.minPlayers)-this.activeCount()):0,waitingForHost:this.phase==='lobby'&&this.canStart()&&!this.config.autoStart,upNext:{red:nextSquad([...this.players.values()].filter(p=>p.team==='red')).map(p=>p.uniqueId),blue:nextSquad([...this.players.values()].filter(p=>p.team==='blue')).map(p=>p.uniqueId)},phase:this.phase,mode:this.mode,demo:this.demo,exhibition:this.exhibition,endsAt:this.endsAt,paused:this.pausedAt !== null,pausedAt:this.pausedAt,mana:{red:{...this.mana.red},blue:{...this.mana.blue}},score:{...this.score},players:[...this.players.values()].map(p=>this.publicPlayer(p)),bots:this.bots.map(b=>({...b})),mvp:{red:this.mvp.red && {...this.mvp.red},blue:this.mvp.blue && {...this.mvp.blue}},config:{...this.config},position:total ? (this.score.red-this.score.blue)/total : 0,overtime:this.overtime}; }
}
