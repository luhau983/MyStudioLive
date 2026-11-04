// Synthesised sound effects (WebAudio, no files). Original short motifs only.
(() => {
  const silent = new URLSearchParams(location.search).has('silent');
  let ctx = null, master = null, volume = 0.8, muted = false;

  function ensure() {
    if (silent) return null;
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.connect(ctx.destination);
        applyGain();
      } catch { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function applyGain() { if (master) master.gain.value = muted ? 0 : volume * 0.5; }

  function tone(freq, start, dur, { type = 'square', gain = 0.25, slide = 0 } = {}) {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + start;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(start, dur, gain = 0.3, freq = 800) {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + start;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = gain;
    src.connect(f).connect(g).connect(master);
    src.start(t);
  }

  const sfx = {
    hit() { noise(0, 0.06, 0.18, 2400); tone(220, 0, 0.06, { type: 'square', gain: 0.08, slide: -80 }); },
    crit() { noise(0, 0.25, 0.4, 4000); [880, 1320, 1760].forEach((f, i) => tone(f, i * 0.04, 0.18, { type: 'triangle', gain: 0.22 })); },
    warn() { [330, 330, 330].forEach((f, i) => tone(f, i * 0.3, 0.2, { type: 'sawtooth', gain: 0.22 })); },
    slam() { noise(0, 0.7, 0.6, 300); tone(70, 0, 0.7, { type: 'sine', gain: 0.5, slide: -30 }); },
    dodge() { tone(900, 0, 0.1, { type: 'sine', gain: 0.15, slide: 500 }); },
    down() { tone(300, 0, 0.4, { type: 'square', gain: 0.2, slide: -220 }); },
    revive() { [523, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.2, { type: 'sine', gain: 0.25 })); },
    enrage() { tone(110, 0, 1.2, { type: 'sawtooth', gain: 0.35, slide: 60 }); noise(0, 1, 0.25, 500); },
    tick() { tone(1000, 0, 0.08, { type: 'square', gain: 0.2 }); },
    go() { tone(1400, 0, 0.35, { type: 'square', gain: 0.25 }); },
    win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.22, { type: 'triangle', gain: 0.28 })); },
    lose() { [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.25, 0.3, { type: 'triangle', gain: 0.28 })); },
    join() { tone(660, 0, 0.08, { type: 'sine', gain: 0.15 }); }
  };

  window.bossAudio = {
    play(name) { try { sfx[name]?.(); } catch {} },
    set({ volume: v, muted: m } = {}) { if (Number.isFinite(v)) volume = v / 100; muted = !!m; applyGain(); },
    unlock: ensure
  };
  addEventListener('pointerdown', ensure, { once: true });
})();
