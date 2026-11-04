/*
 * BỘ ÂM THANH NHÀ MA — tự tổng hợp bằng WebAudio, không cần file.
 * Mọi tiếng đi qua: bus chính -> vang phòng (reverb) -> nén (compressor) -> loa.
 * Có nhạc nền rùng rợn (gió + tiếng trầm + tiếng động xa) và giới hạn tần suất để không bị loạn khi spam lệnh.
 */
(() => {
  'use strict';

  let getCfg = () => ({ sound: true, volume: 0.7, ambient: true, ambientVolume: 0.5 });
  let muted = false;
  let paused = false;
  let ducked = false;
  let ac = null;
  let master, dry, wet, comp, ambGain;
  const lastPlay = {};

  const rnd = (a, b) => a + Math.random() * (b - a);

  function ctx() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      comp.connect(ac.destination);
      master = ac.createGain();
      master.connect(comp);
      dry = ac.createGain();
      dry.gain.value = 0.85;
      dry.connect(master);
      const conv = ac.createConvolver();
      conv.buffer = impulse(3.2, 2.6);
      wet = ac.createGain();
      wet.gain.value = 0.45;
      wet.connect(conv).connect(master);
      ambGain = ac.createGain();
      ambGain.gain.value = 0;
      ambGain.connect(comp);
      applyVolume();
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }

  // Tiếng vang phòng trống, tạo bằng nhiễu tắt dần
  function impulse(seconds, decay) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  let noiseBuf = null;
  function noiseBuffer() {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function applyVolume() {
    if (!ac) return;
    const c = getCfg();
    const on = c.sound && !muted;
    master.gain.setTargetAtTime(on ? c.volume : 0, ac.currentTime, 0.05);
    const ambOn = c.mode === 'chua' ? c.chuaMusic : (c.mode === 'trada' || c.mode === 'nhau') ? c.quanAmbient : c.ambient;
    ambGain.gain.setTargetAtTime(on && ambOn ? c.volume * c.ambientVolume * 0.6 * (ducked ? 0.35 : 1) : 0, ac.currentTime, 0.6);
  }

  // ---------- Khối dựng âm ----------
  function out(reverb = 0.5) {
    const g = ac.createGain();
    const d = ac.createGain();
    const w = ac.createGain();
    d.gain.value = 1 - reverb * 0.5;
    w.gain.value = reverb;
    g.connect(d).connect(dry);
    g.connect(w).connect(wet);
    return g;
  }

  function env(g, t, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }

  function osc(type, f, t, dur, peak, dest, opt = {}) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t + (opt.glide || dur));
    if (opt.detune) o.detune.value = opt.detune;
    const g = ac.createGain();
    env(g, t, opt.a ?? 0.01, peak, opt.hold ?? 0, opt.rel ?? dur);
    let node = o;
    if (opt.vib) {
      const l = ac.createOscillator();
      const lg = ac.createGain();
      l.frequency.value = opt.vib;
      lg.gain.value = opt.vibDepth || f * 0.03;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.5);
    }
    if (opt.filter) {
      const f2 = ac.createBiquadFilter();
      f2.type = opt.filter.type || 'lowpass';
      f2.frequency.value = opt.filter.f;
      f2.Q.value = opt.filter.q || 1;
      node.connect(f2);
      node = f2;
    }
    node.connect(g).connect(dest);
    o.start(t);
    o.stop(t + (opt.a ?? 0.01) + (opt.hold ?? 0) + (opt.rel ?? dur) + 0.1);
    return o;
  }

  function noise(t, dur, peak, dest, f = {}) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuffer();
    s.loop = true;
    const fl = ac.createBiquadFilter();
    fl.type = f.type || 'bandpass';
    fl.frequency.setValueAtTime(f.f || 1000, t);
    if (f.to) fl.frequency.exponentialRampToValueAtTime(f.to, t + dur);
    fl.Q.value = f.q || 1;
    const g = ac.createGain();
    env(g, t, f.a ?? 0.01, peak, f.hold ?? 0, f.rel ?? dur);
    s.connect(fl).connect(g).connect(dest);
    s.start(t, Math.random() * 2);
    s.stop(t + (f.a ?? 0.01) + (f.hold ?? 0) + (f.rel ?? dur) + 0.1);
  }

  // Giọng người (tiếng thét/khóc/cười) = nguồn răng cưa qua các bộ lọc formant nguyên âm
  const VOWELS = { a: [800, 1150, 2900], o: [450, 800, 2830], e: [400, 1700, 2600], i: [300, 2200, 3000], u: [325, 700, 2530] };
  function voice(t, dur, f0, toF, vowel, peak, dest, opt = {}) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    if (toF) o.frequency.exponentialRampToValueAtTime(toF, t + dur);
    const l = ac.createOscillator();
    const lg = ac.createGain();
    l.frequency.value = opt.vib || 6;
    lg.gain.value = f0 * (opt.vibDepth || 0.025);
    l.connect(lg).connect(o.frequency);
    const g = ac.createGain();
    env(g, t, opt.a ?? 0.03, peak, opt.hold ?? dur * 0.6, opt.rel ?? dur * 0.4);
    const sum = ac.createGain();
    VOWELS[vowel].forEach((fr, i) => {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fr;
      bp.Q.value = 6 + i * 2;
      const bg = ac.createGain();
      bg.gain.value = [1, 0.6, 0.25][i] * 3;
      o.connect(bp).connect(bg).connect(sum);
    });
    if (opt.breath) noise(t, dur, peak * opt.breath, g, { f: VOWELS[vowel][1], q: 2 });
    sum.connect(g).connect(dest);
    o.start(t); l.start(t);
    const end = t + (opt.a ?? 0.03) + (opt.hold ?? dur * 0.6) + (opt.rel ?? dur * 0.4) + 0.1;
    o.stop(end); l.stop(end);
  }

  // ---------- Thư viện tiếng ----------
  const S = {
    // Tiếng thét: 4 kiểu khác nhau, chọn ngẫu nhiên
    scream(k = 1) {
      const t = ac.currentTime, d = out(0.55);
      const kind = Math.floor(Math.random() * 4);
      if (kind === 0) { // nữ thét chói
        voice(t, 1.1, 900, 1250, 'a', 0.5 * k, d, { vib: 9, vibDepth: 0.04, breath: 0.4 });
        voice(t + 0.02, 1.0, 1300, 1500, 'e', 0.25 * k, d, { vib: 11, breath: 0.3 });
      } else if (kind === 1) { // nam la hoảng
        voice(t, 0.8, 260, 420, 'a', 0.55 * k, d, { vib: 7, breath: 0.5 });
        voice(t + 0.75, 0.5, 380, 300, 'o', 0.35 * k, d, { vib: 7 });
      } else if (kind === 2) { // trẻ con hét "Áaa"
        voice(t, 0.9, 700, 1000, 'a', 0.45 * k, d, { vib: 10, vibDepth: 0.05 });
      } else { // tiếng rú đứt quãng
        [0, 0.22, 0.44].forEach((o, i) => voice(t + o, 0.2, 800 + i * 120, 950 + i * 120, 'e', 0.4 * k, d, { a: 0.01, hold: 0.08, rel: 0.1, breath: 0.4 }));
      }
    },
    boo() { // ma "hùuuu"
      const t = ac.currentTime, d = out(0.8);
      voice(t, 1.3, 180, 120, 'u', 0.5, d, { vib: 4, vibDepth: 0.06, breath: 0.7, a: 0.15 });
      noise(t, 1.3, 0.12, d, { f: 400, to: 200, q: 1.5, a: 0.2 });
    },
    whoosh() { const t = ac.currentTime; noise(t, 0.6, 0.25, out(0.4), { f: 300, to: 2400, q: 1.2, a: 0.15 }); },
    creak() { // cửa gỗ kẽo kẹt
      const t = ac.currentTime, d = out(0.5);
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      const base = rnd(70, 110);
      for (let i = 0; i <= 24; i++) o.frequency.setValueAtTime(base * (1 + Math.sin(i * 1.3) * 0.25 + Math.random() * 0.25), t + i * 0.045);
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 4;
      const g = ac.createGain(); env(g, t, 0.05, 0.35, 0.9, 0.2);
      o.connect(bp).connect(g).connect(d); o.start(t); o.stop(t + 1.3);
    },
    footsteps(n = 4, gap = 0.32) {
      const t = ac.currentTime, d = out(0.45);
      for (let i = 0; i < n; i++) {
        const s = t + i * gap * rnd(0.9, 1.1);
        noise(s, 0.09, 0.5, d, { type: 'lowpass', f: 380, q: 1, rel: 0.09 });
        osc('sine', 80, s, 0.12, 0.35, d, { to: 45 });
      }
    },
    heartbeat(beats = 4, bpm = 95) {
      const t = ac.currentTime, d = out(0.15);
      for (let i = 0; i < beats; i++) {
        const s = t + i * 60 / bpm;
        osc('sine', 60, s, 0.15, 0.7, d, { to: 38 });
        osc('sine', 55, s + 0.16, 0.18, 0.5, d, { to: 34 });
      }
    },
    flashlight() { const t = ac.currentTime, d = out(0.2); noise(t, 0.03, 0.4, d, { f: 4000, q: 3 }); osc('square', 2000, t, 0.03, 0.08, d); },
    gong() { // chuông chùa
      const t = ac.currentTime, d = out(0.7);
      [[110, 0.5], [220.5, 0.25], [331, 0.18], [442, 0.1], [587, 0.06]].forEach(([f, v]) => osc('sine', f, t, 4, v, d, { rel: 4, detune: rnd(-6, 6) }));
    },
    bellToll(times = 3) {
      const t = ac.currentTime, d = out(0.75);
      for (let i = 0; i < times; i++) [[196, 0.4], [392.5, 0.2], [588, 0.12], [940, 0.05]].forEach(([f, v]) => osc('sine', f, t + i * 1.2, 2.4, v, d, { rel: 2.4 }));
    },
    talisman() { const t = ac.currentTime; noise(t, 0.35, 0.3, out(0.3), { f: 1800, to: 600, q: 1 }); setTimeout(() => S.gong(), 380); },
    choir() { // dàn hợp xướng ma
      const t = ac.currentTime, d = out(0.9);
      [[220, 'o'], [261.6, 'a'], [311.1, 'u'], [370, 'o']].forEach(([f, v], i) => voice(t + i * 0.12, 2.6, f, f * 0.97, v, 0.16, d, { vib: 5, a: 0.6, breath: 0.6 }));
    },
    whisper() {
      const t = ac.currentTime, d = out(0.7);
      for (let i = 0; i < 5; i++) noise(t + i * 0.18, 0.25, 0.22, d, { f: rnd(1800, 4000), q: 6, a: 0.05 });
      voice(t, 1.2, 140, 110, 'i', 0.08, d, { breath: 2 });
    },
    powerDown() {
      const t = ac.currentTime, d = out(0.3);
      noise(t, 0.12, 0.6, d, { f: 3000, q: 1 });
      osc('sawtooth', 120, t, 1.2, 0.3, d, { to: 25, filter: { f: 600 } });
      osc('sine', 60, t, 1.4, 0.25, d, { to: 20 });
    },
    chime() { const t = ac.currentTime, d = out(0.6); [659.3, 784, 987.8, 1318.5].forEach((f, i) => osc('sine', f, t + i * 0.09, 1.2, 0.12, d)); },
    musicBox() { // hộp nhạc giọng thứ, hơi lệch tông cho rợn
      const t = ac.currentTime, d = out(0.6);
      const notes = [659.3, 587.3, 523.3, 493.9, 523.3, 440, 493.9, 415.3];
      notes.forEach((f, i) => { osc('triangle', f, t + i * 0.28, 0.9, 0.18, d, { detune: rnd(-25, 25) }); osc('sine', f * 2, t + i * 0.28, 0.5, 0.05, d); });
    },
    childLaugh() {
      const t = ac.currentTime, d = out(0.7);
      [0, 0.17, 0.34, 0.5, 0.66].forEach((o, i) => voice(t + o, 0.14, 520 - i * 25, 470 - i * 25, i % 2 ? 'i' : 'e', 0.32, d, { a: 0.01, hold: 0.05, rel: 0.09, vib: 12, breath: 0.6 }));
    },
    evilLaugh() {
      const t = ac.currentTime, d = out(0.6);
      [0, 0.24, 0.48, 0.72].forEach((o, i) => voice(t + o, 0.2, 140 - i * 6, 120 - i * 6, 'a', 0.4, d, { a: 0.01, hold: 0.08, rel: 0.12, breath: 0.5 }));
    },
    sob() {
      const t = ac.currentTime, d = out(0.7);
      [0, 0.45, 0.8, 1.35].forEach((o, i) => voice(t + o, 0.32, 420 + i * 10, 330, 'u', 0.28, d, { vib: 8, vibDepth: 0.05, breath: 0.6, a: 0.04 }));
    },
    wail() { const t = ac.currentTime; voice(t, 2.2, 500, 380, 'o', 0.35, out(0.9), { vib: 5, vibDepth: 0.07, breath: 0.5, a: 0.4 }); },
    growl() { // Bà Ma gầm gừ + xích sắt
      const t = ac.currentTime, d = out(0.5);
      voice(t, 2.2, 70, 55, 'o', 0.6, d, { vib: 22, vibDepth: 0.15, breath: 1 });
      osc('sawtooth', 48, t, 2.4, 0.3, d, { filter: { f: 300 }, vib: 30, vibDepth: 6 });
      for (let i = 0; i < 6; i++) { const s = t + 0.6 + i * 0.13; osc('square', rnd(2500, 4200), s, 0.06, 0.05, d); noise(s, 0.05, 0.15, d, { f: 5000, q: 4 }); }
    },
    thunder() {
      const t = ac.currentTime, d = out(0.6);
      noise(t, 0.25, 0.9, d, { type: 'lowpass', f: 3000, to: 400 });
      noise(t + 0.1, 2.8, 0.8, d, { type: 'lowpass', f: 220, to: 60, a: 0.2, q: 0.7 });
    },
    pop() { const t = ac.currentTime; osc('sine', 700, t, 0.15, 0.15, out(0.3), { to: 1100 }); },
    mo(n = 1) { // mõ gỗ
      const t = ac.currentTime, d = out(0.5);
      for (let i = 0; i < n; i++) {
        const s = t + i * 0.55;
        osc('sine', 780, s, 0.12, 0.5, d, { to: 640, a: 0.002, rel: 0.12 });
        osc('sine', 1560, s, 0.05, 0.12, d, { a: 0.002, rel: 0.05 });
        noise(s, 0.03, 0.25, d, { f: 1800, q: 3, a: 0.001, rel: 0.03 });
      }
    },
    templeBell() { S.gong(); },
    // ---- Trà đá / Đi nhậu ----
    clink(n = 1) { // cụng ly thủy tinh: vài tiếng "keng" cao, lệch nhau một chút
      const t = ac.currentTime, d = out(0.35);
      for (let i = 0; i < Math.min(6, n); i++) {
        const s = t + i * rnd(0.03, 0.08), f = rnd(2300, 3400);
        [1, 2.76, 5.4].forEach((m, k) => osc('sine', f * m, s, 0.5 - k * 0.12, [0.11, 0.05, 0.025][k], d));
        noise(s, 0.02, 0.08, d, { type: 'highpass', f: 5000, q: 0.7, a: 0.001, rel: 0.02 });
      }
    },
    ice() { // đá lạnh lắc trong cốc
      const t = ac.currentTime, d = out(0.2);
      for (let i = 0; i < 7; i++) {
        const s = t + i * rnd(0.04, 0.09);
        osc('sine', rnd(1800, 3200), s, 0.08, 0.05, d);
        noise(s, 0.03, 0.1, d, { type: 'bandpass', f: rnd(3000, 6000), q: 3, a: 0.001, rel: 0.03 });
      }
    },
    pour() { // rót nước / bia
      const t = ac.currentTime, d = out(0.25);
      noise(t, 1.1, 0.16, d, { type: 'bandpass', f: 900, to: 1900, q: 2.5, a: 0.08 });
      for (let i = 0; i < 10; i++) osc('sine', rnd(500, 900), t + i * 0.1, 0.06, 0.03, d, { to: rnd(900, 1400) });
    },
    dzo(level = 1) { // cả bàn hô "dzô!"
      const t = ac.currentTime, d = out(0.5);
      const voices = 2 + level * 2;
      for (let v = 0; v < voices; v++) {
        const f = rnd(140, 330), s = rnd(0, 0.12);
        voice(t + s, 0.5, f * 1.15, f * 0.85, 'o', 0.2 / Math.sqrt(voices) * 2, d, { a: 0.02, hold: 0.25, rel: 0.2, breath: 0.4 });
      }
      setTimeout(() => S.clink(2 + level), 380);
    },
    hiccup() { const t = ac.currentTime; voice(t, 0.12, 320, 520, 'i', 0.22, out(0.3), { a: 0.005, hold: 0.04, rel: 0.06, breath: 0.6 }); },
    cash() { const t = ac.currentTime, d = out(0.4); osc('sine', 1568, t, 0.25, 0.12, d); osc('sine', 2093, t + 0.08, 0.5, 0.12, d); },
    // ---- Rạp phim ----
    applause(level = 1) { // tiếng vỗ tay: nhiều cú vỗ ngẫu nhiên, càng đông càng dày
      const t = ac.currentTime, d = out(0.45);
      const dur = 1.6 + level * 0.8;
      const n = Math.floor(18 + level * 26);
      for (let i = 0; i < n; i++) {
        const s = t + Math.random() * dur * (0.6 + Math.random() * 0.4);
        noise(s, 0.035, rnd(0.12, 0.3), d, { f: rnd(1200, 3200), q: 1.4, a: 0.002, rel: 0.035 });
      }
    },
    crowdLaugh(level = 1) { // cả rạp cười "ha ha"
      const t = ac.currentTime, d = out(0.6);
      const voices = 2 + level * 2;
      for (let v = 0; v < voices; v++) {
        const f = rnd(170, 420), start = rnd(0, 0.4);
        for (let i = 0; i < 4; i++) voice(t + start + i * rnd(0.17, 0.22), 0.14, f * (1 - i * 0.03), f * 0.9, 'a', 0.16 / Math.sqrt(voices) * 2, d, { a: 0.01, hold: 0.05, rel: 0.08, breath: 0.7 });
      }
    },
    wow() { const t = ac.currentTime, d = out(0.5); voice(t, 0.7, 200, 320, 'o', 0.3, d, { a: 0.05, breath: 0.4 }); voice(t + 0.05, 0.6, 290, 420, 'o', 0.16, d, { a: 0.05 }); },
    crunch() { const t = ac.currentTime, d = out(0.2); for (let i = 0; i < 6; i++) noise(t + i * rnd(0.06, 0.11), 0.05, rnd(0.15, 0.3), d, { type: 'highpass', f: 2200, q: 0.7, a: 0.002, rel: 0.05 }); },
    jumpscare(face = '') { // tiếng hét lớn + đập + méo, khác nhau theo mặt ma
      const t = ac.currentTime, d = out(0.35);
      const shaper = ac.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 5); }
      shaper.curve = curve;
      shaper.connect(d);
      const pitch = { manu: 1.2, skull: 0.8, demon: 0.5, doll: 1.5, jiangshi: 0.9, stretch: 1 }[face] || 1;
      voice(t, 1.6, 700 * pitch, 900 * pitch, 'a', 0.9, shaper, { vib: 9, vibDepth: 0.05, breath: 0.6, a: 0.01 });
      voice(t, 1.6, 520 * pitch, 700 * pitch, 'e', 0.6, shaper, { vib: 13, breath: 0.4, a: 0.01 });
      noise(t, 0.4, 1, d, { f: 2500, q: 0.6 });
      osc('sine', 45, t, 1.6, 1, d, { to: 28 });
      osc('sawtooth', 90 * pitch, t, 1.4, 0.35, shaper, { to: 50 });
      if (face === 'doll') setTimeout(() => S.musicBox(), 1500);
      if (face === 'demon') setTimeout(() => S.growl(), 900);
    },
    // Giữ tên cũ cho tương thích
    bell() { S.bellToll(1); },
    laugh() { S.childLaugh(); },
    click() { S.flashlight(); },
    blackout() { S.powerDown(); },
    freeze() { S.talisman(); },
    boss() { S.growl(); }
  };

  // ---------- Nhạc nền: nhiều kiểu để chọn ----------
  // Mỗi kiểu dựng các nguồn âm nối vào bus riêng; đổi kiểu thì bus cũ mờ dần rồi dừng.
  let amb = null; // { key, bus, sources: [], timers: [] }

  function loopNoise(dest, type, f, q, gain) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    const fl = ac.createBiquadFilter();
    fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ac.createGain();
    g.gain.value = gain;
    src.connect(fl).connect(g).connect(dest);
    src.start(ac.currentTime, Math.random() * 2);
    return { src, fl, g };
  }

  function lfo(param, rate, depth, a) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = rate;
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start();
    a.sources.push(o);
    return o;
  }

  function tonal(dest, type, f, gain, a, filt) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ac.createGain();
    g.gain.value = gain;
    let n = o;
    if (filt) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filt; n.connect(fl); n = fl; }
    n.connect(g).connect(dest);
    o.start();
    a.sources.push(o);
    return { o, g };
  }

  // Lặp lại một việc sau khoảng thời gian ngẫu nhiên, tự huỷ khi đổi nhạc nền
  function every(a, minMs, maxMs, fn) {
    const tick = () => {
      if (amb !== a) return;
      if (playable()) { try { fn(); } catch { /* bỏ qua */ } }
      a.timers.push(setTimeout(tick, rnd(minMs, maxMs)));
    };
    a.timers.push(setTimeout(tick, rnd(minMs, maxMs)));
  }

  // Xe máy chạy ngang: tiếng máy răng cưa lọc thấp, to dần rồi nhỏ dần, lệch trái/phải
  function motorbike(a, vol = 1) {
    const t = ac.currentTime, dur = rnd(2.2, 3.6), f = rnd(55, 85);
    const pan = ac.createStereoPanner(); pan.pan.setValueAtTime(rnd(-1, -0.4), t); pan.pan.linearRampToValueAtTime(rnd(0.4, 1), t + dur); pan.connect(a.bus);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.connect(pan);
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.15, t + dur * 0.5); o.frequency.linearRampToValueAtTime(f * 0.92, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * vol, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(lp); o.start(t); o.stop(t + dur + 0.1);
  }
  function honk(a) { // còi xe máy "bíp bíp" xa
    const t = ac.currentTime, dest = ambOut(a, 0.6), f = rnd(380, 470);
    [0, 0.22].forEach((s) => { osc('square', f, t + s, 0.14, 0.025, dest); osc('square', f * 1.26, t + s, 0.14, 0.018, dest); });
  }

  // Phát một tiếng ngắn vào bus nhạc nền (đi qua vang phòng)
  function ambOut(a, reverb = 0.7) {
    const g = ac.createGain();
    const w = ac.createGain();
    w.gain.value = reverb;
    g.connect(a.bus);
    g.connect(w).connect(wet);
    return g;
  }

  const AMBIENTS = {
    drone(a) { // U ám
      const d = a.bus;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 4; lp.connect(d);
      lfo(lp.frequency, 0.03, 140, a);
      tonal(lp, 'sawtooth', 55, 0.16, a);
      tonal(lp, 'sawtooth', 58.27, 0.1, a); // lệch nửa cung -> nghịch tai
      tonal(lp, 'triangle', 82.41, 0.08, a);
      const hi = tonal(ambOut(a, 0.9), 'sine', 932.3, 0.012, a); // tiếng ngân cao rợn
      lfo(hi.o.frequency, 0.2, 6, a);
      lfo(hi.g.gain, 0.05, 0.01, a);
      loopNoise(d, 'lowpass', 180, 0.7, 0.08);
      every(a, 14000, 30000, () => (Math.random() < 0.5 ? S.whisper() : S.wail()));
    },
    wind(a) { // Gió hú
      const base = loopNoise(a.bus, 'lowpass', 500, 1, 0.45);
      lfo(base.fl.frequency, 0.06, 320, a);
      lfo(base.g.gain, 0.09, 0.2, a);
      const howl = loopNoise(ambOut(a, 0.6), 'bandpass', 650, 14, 0.5); // tiếng rít
      lfo(howl.fl.frequency, 0.045, 260, a);
      lfo(howl.g.gain, 0.07, 0.35, a);
      const howl2 = loopNoise(a.bus, 'bandpass', 980, 18, 0.25);
      lfo(howl2.fl.frequency, 0.033, 300, a);
      every(a, 15000, 35000, () => S.creak());
    },
    rain(a) { // Mưa đêm
      const r = loopNoise(a.bus, 'highpass', 1400, 0.5, 0.18);
      const r2 = loopNoise(a.bus, 'bandpass', 5000, 0.6, 0.1);
      lfo(r2.g.gain, 0.15, 0.04, a);
      loopNoise(a.bus, 'lowpass', 300, 0.7, 0.12);
      every(a, 60, 260, () => { // giọt nước
        const t = ac.currentTime;
        const o = ac.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(rnd(1800, 4200), t);
        o.frequency.exponentialRampToValueAtTime(rnd(700, 1200), t + 0.05);
        const g = ac.createGain(); env(g, t, 0.002, rnd(0.01, 0.035), 0, 0.06);
        o.connect(g).connect(a.bus); o.start(t); o.stop(t + 0.1);
      });
      every(a, 20000, 45000, () => { // sấm rền xa
        const t = ac.currentTime;
        noise(t, 4, 0.35, ambOut(a, 0.8), { type: 'lowpass', f: 160, to: 50, a: 0.6, q: 0.6 });
      });
      void r;
    },
    church(a) { // Nhà thờ hoang
      const pad = ac.createGain(); pad.gain.value = 0.9; pad.connect(a.bus);
      const w = ac.createGain(); w.gain.value = 1; pad.connect(w).connect(wet);
      const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [146.83, 174.61, 220], [164.81, 207.65, 246.94]]; // Am F Dm E
      const voices = [0, 1, 2].map(() => {
        const o1 = ac.createOscillator(); o1.type = 'triangle';
        const o2 = ac.createOscillator(); o2.type = 'sine';
        const g = ac.createGain(); g.gain.value = 0.05;
        o1.connect(g); o2.connect(g); g.connect(pad);
        o1.start(); o2.start();
        a.sources.push(o1, o2);
        return { o1, o2 };
      });
      let ci = 0;
      const setChord = () => {
        const t = ac.currentTime;
        chords[ci % chords.length].forEach((f, i) => {
          voices[i].o1.frequency.setTargetAtTime(f, t, 0.8);
          voices[i].o2.frequency.setTargetAtTime(f * 2.003, t, 0.8);
        });
        ci++;
      };
      setChord();
      every(a, 7000, 9000, setChord);
      tonal(pad, 'sine', 55, 0.08, a);
      every(a, 25000, 45000, () => S.bellToll(1));
    },
    heartbeat(a) { // Hồi hộp
      tonal(a.bus, 'sine', 41.2, 0.12, a);
      loopNoise(a.bus, 'lowpass', 220, 0.8, 0.05);
      const beat = () => {
        const t = ac.currentTime;
        const out = a.bus;
        [[0, 0.7], [0.18, 0.45]].forEach(([o, v]) => {
          const osc = ac.createOscillator(); osc.type = 'sine';
          osc.frequency.setValueAtTime(62, t + o);
          osc.frequency.exponentialRampToValueAtTime(36, t + o + 0.16);
          const g = ac.createGain(); env(g, t + o, 0.01, v, 0, 0.2);
          osc.connect(g).connect(out); osc.start(t + o); osc.stop(t + o + 0.3);
        });
      };
      every(a, 820, 900, beat);
      every(a, 9000, 16000, () => noise(ac.currentTime, 1.4, 0.06, ambOut(a, 0.4), { f: 900, q: 1.2, a: 0.5 }));
    },
    musicbox(a) { // Hộp nhạc ma
      const crackle = () => {
        const t = ac.currentTime;
        noise(t, 0.01, rnd(0.02, 0.06), a.bus, { type: 'highpass', f: 3000, q: 0.5, a: 0.001, rel: 0.01 });
      };
      every(a, 40, 220, crackle);
      loopNoise(a.bus, 'bandpass', 1200, 0.4, 0.015);
      const melody = [659.3, 587.3, 523.3, 493.9, 440, 493.9, 523.3, 440, 415.3, 440, 493.9, 329.6];
      const playTune = () => {
        const t = ac.currentTime;
        const slow = rnd(0.38, 0.5);
        const dest = ambOut(a, 0.8);
        melody.forEach((f, i) => {
          const o = ac.createOscillator(); o.type = 'triangle';
          o.frequency.value = f * (1 + rnd(-0.012, 0.012));
          const g = ac.createGain(); env(g, t + i * slow, 0.005, 0.07, 0, 1.2);
          o.connect(g).connect(dest); o.start(t + i * slow); o.stop(t + i * slow + 1.4);
        });
      };
      playTune();
      every(a, 9000, 12000, playTune);
    },
    whispers(a) { // Thì thầm
      loopNoise(a.bus, 'bandpass', 700, 0.6, 0.05);
      tonal(a.bus, 'sine', 49, 0.06, a);
      every(a, 2500, 6500, () => {
        const pan = ac.createStereoPanner();
        pan.pan.value = rnd(-1, 1);
        const dest = ac.createGain();
        dest.connect(pan).connect(a.bus);
        const w = ac.createGain(); w.gain.value = 0.7; dest.connect(w).connect(wet);
        const t = ac.currentTime;
        const n = Math.floor(rnd(3, 7));
        for (let i = 0; i < n; i++) noise(t + i * rnd(0.12, 0.22), rnd(0.12, 0.25), rnd(0.08, 0.16), dest, { f: rnd(1800, 4500), q: rnd(4, 9), a: 0.03 });
      });
      every(a, 25000, 50000, () => S.childLaugh());
    },
    forest(a) { // Rừng đêm
      const wind = loopNoise(a.bus, 'lowpass', 380, 0.8, 0.12);
      lfo(wind.fl.frequency, 0.05, 150, a);
      every(a, 900, 2200, () => { // dế kêu
        const t = ac.currentTime;
        const f = rnd(4200, 4800);
        const pan = ac.createStereoPanner(); pan.pan.value = rnd(-0.8, 0.8); pan.connect(a.bus);
        for (let i = 0; i < 3; i++) {
          const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
          const g = ac.createGain(); env(g, t + i * 0.07, 0.005, 0.025, 0.02, 0.03);
          o.connect(g).connect(pan); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.08);
        }
      });
      every(a, 12000, 26000, () => { // cú kêu "hù… hù hù"
        const t = ac.currentTime;
        const dest = ambOut(a, 0.9);
        [[0, 0.45], [0.7, 0.25], [1.0, 0.35]].forEach(([o, d]) => {
          const os = ac.createOscillator(); os.type = 'sine';
          os.frequency.setValueAtTime(410, t + o);
          os.frequency.exponentialRampToValueAtTime(370, t + o + d);
          const g = ac.createGain(); env(g, t + o, 0.05, 0.1, d * 0.5, d * 0.5);
          os.connect(g).connect(dest); os.start(t + o); os.stop(t + o + d + 0.2);
        });
      });
    },
    temple(a) { // Thiền: tiếng trầm êm + sáo ngũ cung chậm + chuông xa
      tonal(a.bus, 'sine', 73.42, 0.12, a);   // D2
      tonal(a.bus, 'sine', 110, 0.06, a);     // A2
      const pad = tonal(ambOut(a, 0.9), 'triangle', 146.83, 0.03, a);
      lfo(pad.g.gain, 0.05, 0.02, a);
      const scale = [293.66, 329.63, 369.99, 440, 493.88, 587.33]; // D E F# A B D
      const flute = () => {
        const t = ac.currentTime;
        const dest = ambOut(a, 1);
        let at = t;
        const n = Math.floor(rnd(3, 6));
        let idx = Math.floor(rnd(0, scale.length));
        for (let i = 0; i < n; i++) {
          idx = clampI(idx + Math.floor(rnd(-2, 3)), 0, scale.length - 1);
          const f = scale[idx];
          const dur = rnd(0.9, 1.8);
          const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
          const l = ac.createOscillator(); const lg = ac.createGain(); l.frequency.value = 5; lg.gain.value = f * 0.012;
          l.connect(lg).connect(o.frequency);
          const g = ac.createGain(); env(g, at, 0.25, 0.06, dur * 0.5, dur * 0.5);
          o.connect(g).connect(dest); o.start(at); l.start(at); o.stop(at + dur + 0.5); l.stop(at + dur + 0.5);
          noise(at, dur, 0.012, dest, { f: f * 2, q: 4, a: 0.2 });
          at += dur * rnd(0.85, 1.05);
        }
      };
      flute();
      every(a, 9000, 16000, flute);
      every(a, 40000, 70000, () => S.gong());
    },
    street(a) { // Vỉa hè ban ngày: xe cộ ù ù, xe máy chạy qua, còi xa, chim sẻ
      const hum = loopNoise(a.bus, 'lowpass', 260, 0.6, 0.22);
      lfo(hum.g.gain, 0.07, 0.08, a);
      loopNoise(a.bus, 'bandpass', 1200, 0.4, 0.025);
      every(a, 2500, 7000, () => motorbike(a));
      every(a, 9000, 22000, () => honk(a));
      every(a, 5000, 14000, () => { // chim sẻ ríu rít
        const t = ac.currentTime, dest = ambOut(a, 0.3);
        for (let i = 0; i < 4; i++) {
          const s = t + i * rnd(0.08, 0.14), f = rnd(3600, 5200);
          const o = ac.createOscillator(); o.type = 'sine';
          o.frequency.setValueAtTime(f, s); o.frequency.exponentialRampToValueAtTime(f * 1.25, s + 0.05);
          const g = ac.createGain(); env(g, s, 0.005, 0.02, 0.02, 0.04);
          o.connect(g).connect(dest); o.start(s); o.stop(s + 0.1);
        }
      });
    },
    pub(a) { // Quán nhậu buổi tối: tiếng người rì rầm, xe xa, cụng ly lác đác
      const hum = loopNoise(a.bus, 'lowpass', 220, 0.6, 0.16);
      lfo(hum.g.gain, 0.05, 0.05, a);
      const chatter = loopNoise(a.bus, 'bandpass', 700, 1.8, 0.07); // tiếng nói chuyện lẫn lộn
      lfo(chatter.fl.frequency, 0.3, 220, a);
      lfo(chatter.g.gain, 0.4, 0.035, a);
      every(a, 5000, 12000, () => motorbike(a, 0.5));
      every(a, 4000, 11000, () => { // bàn khác cụng ly
        const t = ac.currentTime, dest = ambOut(a, 0.5);
        const n = Math.floor(rnd(2, 5));
        for (let i = 0; i < n; i++) osc('sine', rnd(2300, 3300), t + i * rnd(0.03, 0.07), 0.35, 0.025, dest);
      });
      every(a, 8000, 18000, () => { // tiếng cười xa
        const t = ac.currentTime, dest = ambOut(a, 0.8), f = rnd(180, 300);
        for (let i = 0; i < 3; i++) voice(t + i * 0.2, 0.13, f, f * 0.9, 'a', 0.03, dest, { a: 0.01, hold: 0.05, rel: 0.07, breath: 0.7 });
      });
    },
    none() {}
  };
  const clampI = (v, a, b) => Math.max(a, Math.min(b, v));

  function stopAmbient() {
    if (!amb) return;
    const old = amb;
    amb = null;
    old.timers.forEach(clearTimeout);
    old.bus.gain.setTargetAtTime(0, ac.currentTime, 0.5);
    setTimeout(() => {
      old.sources.forEach((s) => { try { s.stop(); } catch { /* đã dừng */ } });
      try { old.bus.disconnect(); } catch { /* đã ngắt */ }
    }, 2500);
  }

  // Bật đúng kiểu nhạc nền theo cài đặt (file riêng của người dùng thì tắt nhạc tự tạo)
  function syncAmbient() {
    const c = getCfg();
    let key;
    if (c.mode === 'chua' || c.mode === 'rap') key = 'none'; // chùa: nhạc mp3 riêng; rạp: tiếng của phim
    else if (c.mode === 'trada' || c.mode === 'nhau') key = !c.sound || muted || !c.quanAmbient ? 'none' : c.mode === 'trada' ? 'street' : 'pub';
    else key = !c.sound || muted || !c.ambient || c.customAmbient ? 'none' : (AMBIENTS[c.ambientPreset] ? c.ambientPreset : 'drone');
    if ((amb?.key || 'none') === key) return;
    stopAmbient();
    if (key === 'none') return;
    const bus = ac.createGain();
    bus.gain.value = 0;
    bus.connect(ambGain);
    bus.gain.setTargetAtTime(1, ac.currentTime, 1);
    const a = { key, bus, sources: [], timers: [] };
    amb = a;
    // nguồn noise lặp (loopNoise) không nằm trong sources -> gom lại bằng cách bọc start
    const origCreate = ac.createBufferSource.bind(ac);
    ac.createBufferSource = () => { const n = origCreate(); a.sources.push(n); return n; };
    try { AMBIENTS[key](a); } finally { ac.createBufferSource = origCreate; }
  }

  const playable = () => { const c = getCfg(); return ac && c.sound && !muted; };

  // ---------- API ----------
  // Giới hạn tần suất mỗi tiếng để không ồn khi người xem spam lệnh
  const MIN_GAP = { clink: 120, ice: 250, pour: 500, dzo: 600, hiccup: 400, cash: 150, applause: 700, crowdLaugh: 900, wow: 500, crunch: 300, scream: 350, boo: 500, whoosh: 300, footsteps: 600, pop: 150, creak: 800, jumpscare: 1500, thunder: 3000 };

  function play(name, ...args) {
    const c = getCfg();
    if (!c.sound || muted || paused || !S[name]) return;
    const now = performance.now();
    if (now - (lastPlay[name] || 0) < (MIN_GAP[name] ?? 400)) return;
    lastPlay[name] = now;
    try {
      ctx();
      syncAmbient();
      S[name](...args);
    } catch { /* trình duyệt chặn âm thanh */ }
  }

  window.HauntAudio = {
    init(cfgGetter, isMuted) { getCfg = cfgGetter; muted = !!isMuted; },
    duck(d) { ducked = !!d; applyVolume(); },
    setPaused(p) {
      paused = !!p;
      if (ac) (paused ? ac.suspend() : ac.resume()).catch(() => {});
    },
    update() {
      const c = getCfg();
      if (!ac && c.sound && !muted && (c.mode === 'chua' ? c.chuaMusic : (c.mode === 'trada' || c.mode === 'nhau') ? c.quanAmbient : c.ambient)) { try { ctx(); } catch { return; } }
      if (ac) { applyVolume(); syncAmbient(); }
    },
    play,
    names: Object.keys(S)
  };
})();
