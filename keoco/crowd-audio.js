// Call enable() directly from a user gesture. State setters are safe before enable.
export class CrowdAudio {
  constructor({ contextFactory = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(), fetch: fetcher = globalThis.fetch, url = './assets/stadium-crowd-03.wav', volume = 0.18, fadeSeconds = 0.25 } = {}) {
    this.contextFactory = contextFactory;
    this.fetcher = fetcher;
    this.url = url;
    this.volume = Math.max(0, Math.min(1, Number(volume) || 0));
    this.fadeSeconds = Math.max(0, Number(fadeSeconds) || 0);
    this.pulling = false;
    this.muted = false;
    this.paused = false;
    this.enabled = false;
    this.destroyed = false;
    this.voices = [];
    this.loading = null;
    this.cueBuffers = new Map();
    this.cueLoads = new Map();
    this.cues = new Set();
    this.cueEpoch = 0;
  }

  async enable() {
    if (this.destroyed) return false;
    try {
      if (!this.context) this.context = this.contextFactory();
      const ctx = this.context;
      // Resume before awaiting the network, while the gesture is still active.
      await ctx.resume();
      if (ctx.state !== 'running') return false;
      if (!this.loading) this.loading = (async () => {
        const fetcher = this.fetcher;
        const response = await fetcher(this.url);
        if (!response.ok) throw new Error(`Crowd audio request failed: ${response.status}`);
        return ctx.decodeAudioData(await response.arrayBuffer());
      })();
      this.buffer = await this.loading;
      if (this.destroyed) return false;
      this.enabled = true;
      this.update();
      return true;
    } catch (error) {
      this.loading = null;
      this.enabled = false;
      this.lastError = error;
      return false;
    }
  }

  setPulling(value) { this.pulling = Boolean(value); this.update(); }
  setMuted(value) { this.muted = Boolean(value); this.update(); }
  setPaused(value) { this.paused = Boolean(value); this.update(); }
  setVolume(value) { if (Number.isFinite(value)) this.volume = Math.max(0, Math.min(1, value)); this.update(); }

  async loadCue(url) {
    if (this.cueBuffers.has(url)) return this.cueBuffers.get(url);
    if (!this.cueLoads.has(url)) this.cueLoads.set(url, (async () => {
      const fetcher = this.fetcher, response = await fetcher(url);
      if (!response.ok) throw new Error(`Crowd cue request failed: ${response.status}`);
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      this.cueBuffers.set(url, buffer); return buffer;
    })());
    try { return await this.cueLoads.get(url); }
    finally { this.cueLoads.delete(url); }
  }

  async preloadCues(urls) {
    if (!this.enabled || this.destroyed) return;
    return Promise.allSettled(urls.map(url => this.loadCue(url)));
  }

  async playCue(url, {gain = 1.4, delaySeconds = 0, expiresAt = Infinity} = {}) {
    if (!this.enabled || this.destroyed || this.muted || this.paused || !this.volume) return false;
    const epoch = this.cueEpoch, ctx = this.context;
    try {
      const buffer = await this.loadCue(url);
      if (Date.now() >= expiresAt || epoch !== this.cueEpoch || !this.enabled || this.destroyed || this.muted || this.paused || !this.volume) return false;
      const source = ctx.createBufferSource(), node = ctx.createGain(), cue = {source, gain:node, factor:Math.max(0, Math.min(2, gain))};
      source.buffer = buffer; source.loop = false; node.gain.value = this.volume * cue.factor;
      source.connect(node); node.connect(ctx.destination); this.cues.add(cue);
      source.onended = () => { source.disconnect(); node.disconnect(); this.cues.delete(cue); };
      source.start(ctx.currentTime + Math.max(0, delaySeconds)); return true;
    } catch (error) { this.lastCueError = error; return false; }
  }

  stopCues() {
    this.cueEpoch++;
    for (const cue of this.cues) { try { cue.source.stop(); } catch {} cue.source.disconnect(); cue.gain.disconnect(); }
    this.cues.clear();
  }

  update() {
    if (!this.enabled || this.destroyed) return;
    if (this.muted || this.paused || !this.volume) this.stopCues();
    else for (const cue of this.cues) cue.gain.gain.value = this.volume * cue.factor;
    const active = this.pulling && !this.muted && !this.paused && this.volume > 0;
    if (active && !this.voices.length) this.startVoices();
    if (!this.gain) return;
    const now = this.context.currentTime;
    const param = this.gain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(active ? this.volume : 0, now + this.fadeSeconds);
    if (!active && this.voices.length) {
      const oldGain = this.gain;
      for (const { source, panner } of this.voices) {
        source.onended = () => { source.disconnect(); panner?.disconnect(); oldGain.disconnect(); };
        source.stop(now + this.fadeSeconds);
      }
      this.voices = [];
      this.gain = null;
    }
  }

  startVoices() {
    const ctx = this.context;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(ctx.destination);
    for (let i = 0; i < 2; i++) {
      const source = ctx.createBufferSource();
      source.buffer = this.buffer;
      source.loop = true;
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) { panner.pan.value = i ? 0.75 : -0.75; source.connect(panner); panner.connect(this.gain); }
      else source.connect(this.gain);
      source.start(0, i ? this.buffer.duration / 2 : 0);
      this.voices.push({ source, panner });
    }
  }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopCues();
    for (const { source, panner } of this.voices) {
      try { source.stop(); } catch {};
      source.disconnect(); panner?.disconnect();
    }
    this.voices = [];
    this.gain?.disconnect();
    if (this.context && this.context.state !== 'closed') await this.context.close();
  }
}
