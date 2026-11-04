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

  const sfx = {
    green() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.16, { type: 'triangle', gain: 0.3 })); },
    turning() { [880, 740].forEach((f, i) => tone(f, i * 0.12, 0.12, { type: 'square', gain: 0.18 })); },
    red() { tone(180, 0, 0.55, { type: 'sawtooth', gain: 0.32 }); tone(90, 0, 0.55, { type: 'square', gain: 0.2 }); },
    out() { tone(420, 0, 0.3, { type: 'square', gain: 0.25, slide: -340 }); },
    finish() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.06, 0.2, { type: 'triangle', gain: 0.25 })); },
    shield() { tone(1200, 0, 0.18, { type: 'sine', gain: 0.25 }); tone(1600, 0.08, 0.2, { type: 'sine', gain: 0.2 }); },
    tick() { tone(1000, 0, 0.08, { type: 'square', gain: 0.2 }); },
    go() { tone(1400, 0, 0.35, { type: 'square', gain: 0.25 }); },
    win() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.22, { type: 'triangle', gain: 0.28 })); },
    join() { tone(660, 0, 0.08, { type: 'sine', gain: 0.15 }); }
  };

  window.denxanhAudio = {
    play(name) { try { sfx[name]?.(); } catch {} },
    set({ volume: v, muted: m } = {}) { if (Number.isFinite(v)) volume = v / 100; muted = !!m; applyGain(); },
    unlock: ensure
  };
  // Browsers need a gesture before audio; the output window/OBS usually allow it already.
  addEventListener('pointerdown', ensure, { once: true });
})();
