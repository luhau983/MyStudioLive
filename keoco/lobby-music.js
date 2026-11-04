// Waiting-room music synthesized in the overlay's own AudioContext: no recorded track,
// so nothing on the stream can be claimed as copyrighted music.
const TEMPO = 112, EIGHTH = 60 / TEMPO / 2, LOOKAHEAD = 0.3;
// I–V–vi–IV in C, one bar each, eight eighth-note steps per bar.
const CHORDS = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
const ARP = [0, 2, 1, 2, 0, 2, 1, 2];
const hz = midi => 440 * 2 ** ((midi - 69) / 12);

export class LobbyMusic {
  constructor({ volume = 0.18 } = {}) {
    this.ctx = null; this.active = false; this.muted = false; this.volume = volume;
    this.step = 0; this.nextTime = 0; this.timer = null; this.stopTimer = null;
  }

  attach(ctx) {
    if (this.ctx || !ctx) return;
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate), data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = noise;
    this.apply();
  }

  // A real track (assets/lobby-music.mp3) replaces the synth loop when it loads.
  useTrack(buffer) {
    if (!this.ctx || !buffer) return;
    this.track = buffer; this.stopTrack();
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.apply();
  }

  stopTrack() { if (this.source) { try { this.source.stop(); } catch {} this.source.disconnect(); this.source = null; } }

  setActive(value) { if (Boolean(value) !== this.active) { this.active = Boolean(value); this.apply(); } }
  setMuted(value) { this.muted = Boolean(value); this.apply(); }
  setVolume(value) { if (Number.isFinite(value)) { this.volume = Math.max(0, Math.min(1, value)); this.apply(); } }

  apply() {
    if (!this.ctx) return;
    const on = this.active && !this.muted && this.volume > 0, t = this.ctx.currentTime, gain = this.master.gain;
    gain.cancelScheduledValues(t); gain.setValueAtTime(gain.value, t); gain.linearRampToValueAtTime(on ? this.volume * (this.track ? 1.2 : 0.6) : 0, t + 0.6);
    clearTimeout(this.stopTimer); this.stopTimer = null;
    if (this.track) {
      if (on && !this.source) { this.source = this.ctx.createBufferSource(); this.source.buffer = this.track; this.source.loop = true; this.source.connect(this.master); this.source.start(t); }
      if (!on && this.source) this.stopTimer = setTimeout(() => this.stopTrack(), 700);
      return;
    }
    if (on && !this.timer) { this.nextTime = t + 0.05; this.timer = setInterval(() => this.schedule(), 100); }
    // Keep scheduling through the fade so it ends smoothly, then stop.
    if (!on && this.timer) this.stopTimer = setTimeout(() => { clearInterval(this.timer); this.timer = null; }, 700);
  }

  schedule() {
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.play(this.step, this.nextTime);
      this.nextTime += EIGHTH; this.step = (this.step + 1) % (CHORDS.length * 8);
    }
  }

  play(step, t) {
    const chord = CHORDS[Math.floor(step / 8)], beat = step % 8;
    this.tone('triangle', hz(chord[ARP[beat]] + 12), t, 0.22, 0.16);
    if (beat % 4 === 0) this.tone('sine', hz(chord[0] - 12), t, 0.38, 0.32);
    if (beat === 0 || beat === 4) this.kick(t);
    if (beat % 2 === 1) this.hat(t);
  }

  tone(type, freq, t, length, level) {
    const ctx = this.ctx, osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(level, t + 0.008); env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(env); env.connect(this.master); osc.start(t); osc.stop(t + length + 0.02);
    osc.onended = () => { osc.disconnect(); env.disconnect(); };
  }

  kick(t) {
    const ctx = this.ctx, osc = ctx.createOscillator(), env = ctx.createGain();
    osc.frequency.setValueAtTime(130, t); osc.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    env.gain.setValueAtTime(0.45, t); env.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(env); env.connect(this.master); osc.start(t); osc.stop(t + 0.18);
    osc.onended = () => { osc.disconnect(); env.disconnect(); };
  }

  hat(t) {
    const ctx = this.ctx, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), env = ctx.createGain();
    src.buffer = this.noise; filter.type = 'highpass'; filter.frequency.value = 7000;
    env.gain.setValueAtTime(0.05, t); env.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(filter); filter.connect(env); env.connect(this.master); src.start(t); src.stop(t + 0.05);
    src.onended = () => { src.disconnect(); filter.disconnect(); env.disconnect(); };
  }

  destroy() {
    clearInterval(this.timer); clearTimeout(this.stopTimer); this.timer = null; this.stopTrack();
    if (this.master) this.master.disconnect();
    this.ctx = null;
  }
}

// Music plays only while viewers wait for a round, never during the pull.
export const lobbyMusicActive = (state, connected) => connected && !state?.paused && ['lobby', 'transition'].includes(state?.phase);
