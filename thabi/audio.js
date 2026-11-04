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
    peg() { tone(1800 + Math.random() * 900, 0, 0.04, { type: 'sine', gain: 0.05 }); },
    drop() { tone(500, 0, 0.12, { type: 'triangle', gain: 0.15, slide: 400 }); },
    gold() { [988, 1319, 1568, 1976].forEach((f, i) => tone(f, i * 0.05, 0.16, { type: 'triangle', gain: 0.2 })); },
    land(mult = 1) { const f = mult >= 10 ? 1047 : mult >= 2 ? 784 : 523; tone(f, 0, 0.18, { type: 'square', gain: 0.14 }); },
    jackpot() { [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.07, 0.25, { type: 'triangle', gain: 0.28 })); },
    tick() { tone(1000, 0, 0.08, { type: 'square', gain: 0.2 }); },
    go() { tone(1400, 0, 0.35, { type: 'square', gain: 0.25 }); },
    win() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.22, { type: 'triangle', gain: 0.28 })); },
    join() { tone(660, 0, 0.08, { type: 'sine', gain: 0.15 }); }
  };

  window.thabiAudio = {
    play(name, arg) { try { sfx[name]?.(arg); } catch {} },
    set({ volume: v, muted: m } = {}) { if (Number.isFinite(v)) volume = v / 100; muted = !!m; applyGain(); },
    unlock: ensure
  };
  addEventListener('pointerdown', ensure, { once: true });
})();
