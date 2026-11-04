// Đèn Xanh Đèn Đỏ overlay: 9:16 canvas field rendered from server state at 60fps.
(() => {
  const $ = (id) => document.getElementById(id);
  const W = 1080, H = 1920;
  const canvas = $('field');
  const g = canvas.getContext('2d');
  const audio = window.denxanhAudio;

  // ---------- Fit the fixed stage into the window ----------
  const fit = () => document.documentElement.style.setProperty('--s', Math.min(innerWidth / W, innerHeight / H));
  addEventListener('resize', fit); fit();

  // ---------- Perspective: pos 0 = start line (near), 100 = finish line (far) ----------
  const START_Y = 1640, FINISH_Y = 720, DEPTH = 1.4;
  const HORIZON = (FINISH_Y * (1 + DEPTH) - START_Y) / DEPTH;
  const zOf = (pos) => 1 + DEPTH * (pos / 100);
  const yOf = (pos) => HORIZON + (START_Y - HORIZON) / zOf(pos);
  const halfWidth = (pos) => 520 / zOf(pos);

  let state = null;
  let lastLight = '', lastPhase = '', lastSecond = -1;
  const shown = new Map(); // id -> displayed position, smoothed
  const effects = [];      // floating texts / particles
  let redFlash = 0, lightChangedAt = 0;

  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const OUTFITS = ['#0ea5e9', '#f97316', '#a855f7', '#14b8a6', '#eab308', '#ec4899', '#22c55e', '#6366f1', '#f43f5e', '#84cc16'];
  const SKINS = ['#f8d3b0', '#eebb94', '#d9a07a', '#b97f5c', '#8d5a3c'];
  const HAIRS = ['#1f1b16', '#3b2a1f', '#5a3a22', '#8a5a2b', '#111827', '#7c2d12'];

  // ---------- Background ----------
  function drawBackground(t) {
    const sky = g.createLinearGradient(0, 0, 0, FINISH_Y);
    const red = state?.light === 'red' && state.phase === 'play';
    sky.addColorStop(0, red ? '#4a1016' : '#4f8fd6');
    sky.addColorStop(1, red ? '#9a3b2c' : '#bcdcf5');
    g.fillStyle = sky; g.fillRect(0, 0, W, FINISH_Y + 20);
    // bare tree behind the watcher
    drawTree(red);
    // dry golden grain field on the horizon
    const wheat = g.createLinearGradient(0, 600, 0, FINISH_Y);
    wheat.addColorStop(0, red ? '#8a4a1c' : '#d9a53a'); wheat.addColorStop(1, red ? '#6b3512' : '#b88424');
    g.fillStyle = wheat;
    g.beginPath(); g.moveTo(0, 620);
    for (let x = 0; x <= W; x += 30) g.lineTo(x, 612 - 10 * Math.sin(x / 90) - 6 * Math.sin(x / 23));
    g.lineTo(W, FINISH_Y); g.lineTo(0, FINISH_Y); g.fill();
    g.strokeStyle = red ? 'rgba(60,20,8,.35)' : 'rgba(120,80,20,.35)'; g.lineWidth = 2;
    for (let x = 4; x < W; x += 9) { const h = 14 + (hash(x) % 18); g.beginPath(); g.moveTo(x, FINISH_Y - 4); g.lineTo(x + Math.sin(t / 900 + x) * 3, FINISH_Y - 4 - h); g.stroke(); }
    // dry grass on both sides
    g.fillStyle = red ? '#5a3214' : '#c9a24e'; g.fillRect(0, FINISH_Y, W, H - FINISH_Y);
    // dusty dirt field trapezoid, extended past start line
    const far = 100;
    g.fillStyle = red ? '#9c6b3c' : '#e6d2a8';
    g.beginPath();
    g.moveTo(540 - halfWidth(far) - 30, yOf(far)); g.lineTo(540 + halfWidth(far) + 30, yOf(far));
    g.lineTo(540 + halfWidth(0) * 1.15 + 40, H); g.lineTo(540 - halfWidth(0) * 1.15 - 40, H); g.fill();
    // depth stripes every 10%
    g.strokeStyle = 'rgba(120, 80, 30, .25)'; g.lineWidth = 3;
    for (let p = 10; p < 100; p += 10) { const y = yOf(p), hw = halfWidth(p); g.beginPath(); g.moveTo(540 - hw, y); g.lineTo(540 + hw, y); g.stroke(); }
    // start line
    g.fillStyle = '#ffffff'; const ys = yOf(0); g.fillRect(540 - halfWidth(0) - 20, ys - 5, (halfWidth(0) + 20) * 2, 10);
    g.font = '900 30px system-ui'; g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText('XUẤT PHÁT', 540 - halfWidth(0) - 10, ys + 40);
    // finish line: checkered tape
    const yf = yOf(100), hwf = halfWidth(100) + 30, cells = 24, cw = (hwf * 2) / cells;
    for (let i = 0; i < cells; i++) for (let r = 0; r < 2; r++) { g.fillStyle = (i + r) % 2 ? '#111' : '#fff'; g.fillRect(540 - hwf + i * cw, yf - 10 + r * 8, cw, 8); }
  }

  // A leafless tree drawn once into an offscreen canvas (branches are random but fixed per page load).
  let treeCanvas = null;
  function drawTree(red) {
    if (!treeCanvas) {
      treeCanvas = document.createElement('canvas'); treeCanvas.width = W; treeCanvas.height = FINISH_Y;
      const c = treeCanvas.getContext('2d');
      c.strokeStyle = '#3b2f28'; c.lineCap = 'round';
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const branch = (x, y, len, ang, w, depth) => {
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (rnd() - .5) * len * .3, (y + y2) / 2, x2, y2); c.stroke();
        if (depth <= 0 || w < 1.5) return;
        const n = 2 + (rnd() < .4 ? 1 : 0);
        for (let i = 0; i < n; i++) branch(x2, y2, len * (0.62 + rnd() * .2), ang + (rnd() - .5) * 1.3, w * 0.62, depth - 1);
      };
      const tx = 840;
      c.lineWidth = 40; c.beginPath(); c.moveTo(tx + 12, FINISH_Y - 60); c.lineTo(tx, 420); c.stroke();
      branch(tx, 430, 150, -Math.PI / 2 - 0.9, 24, 6);
      branch(tx, 420, 150, -Math.PI / 2 + 0.8, 24, 6);
      branch(tx + 2, 420, 110, -Math.PI / 2 - 0.1, 20, 5);
    }
    g.save(); g.globalAlpha = red ? 0.75 : 1; if (red) g.filter = 'brightness(.55)'; g.drawImage(treeCanvas, 0, 0); g.restore();
  }

  // ---------- The watcher: "Bác Đèn", a lantern-headed signal robot ----------
  function drawWatcher(t) {
    const light = state?.phase === 'play' ? state.light : 'green';
    const cx = 540, cy = 470, R = 100, baseY = 705, bodyY = 580;
    const sinceChange = t - lightChangedAt;
    // facing: 0 = back to the field (green), 1 = facing the field (red)
    let facing = light === 'red' ? Math.min(1, sinceChange / 350) : light === 'turning' ? 0 : Math.max(0, 1 - sinceChange / 350);
    if (lastLight === 'turning' && light === 'turning') facing = 0;
    const sx = Math.cos(facing * Math.PI); // 1 -> -1, drawn mirrored
    const front = facing > 0.5;
    // post and base
    g.fillStyle = '#3f2814'; g.beginPath(); g.ellipse(cx, baseY, 80, 16, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5b3a1e'; g.fillRect(cx - 16, bodyY + 60, 32, baseY - bodyY - 60);
    // arms with signal flags: green flag up on green, red flag up when facing the field
    const flagUp = light === 'red' && front ? 'red' : light === 'green' ? 'green' : 'none';
    const wave = Math.sin(t / 160) * 0.12;
    for (const side of [-1, 1]) {
      const raised = (side === 1 && flagUp === 'green') || (side === -1 && flagUp === 'red');
      const sx0 = cx + side * 66, sy0 = bodyY + 18;
      const ang = raised ? -0.95 + wave : 0.75; // angle from horizontal, outward
      const ex = sx0 + side * Math.cos(ang) * 95, ey = sy0 + Math.sin(ang) * 95;
      g.strokeStyle = '#334155'; g.lineWidth = 14; g.lineCap = 'round';
      g.beginPath(); g.moveTo(sx0, sy0); g.lineTo(ex, ey); g.stroke();
      g.fillStyle = '#94a3b8'; g.beginPath(); g.arc(ex, ey, 11, 0, Math.PI * 2); g.fill();
      if (raised) {
        g.strokeStyle = '#e2e8f0'; g.lineWidth = 6; g.beginPath(); g.moveTo(ex, ey + 12); g.lineTo(ex, ey - 82); g.stroke();
        g.fillStyle = side === 1 ? '#22c55e' : '#ef4444';
        const flap = Math.sin(t / 120) * 6;
        g.beginPath(); g.moveTo(ex, ey - 82); g.lineTo(ex + side * 74, ey - 64 + flap); g.lineTo(ex, ey - 40); g.closePath(); g.fill();
      }
    }
    // body box
    g.fillStyle = '#475569'; roundRect(cx - 70, bodyY - 10, 140, 80, 18); g.fill();
    g.fillStyle = '#facc15'; for (let i = 0; i < 4; i++) g.fillRect(cx - 60 + i * 34, bodyY + 48, 18, 10);
    // neck
    g.fillStyle = '#334155'; g.fillRect(cx - 14, cy + R - 4, 28, bodyY - (cy + R) + 4);
    // head (squashed horizontally while turning)
    g.save(); g.translate(cx, cy); g.scale(Math.max(0.06, Math.abs(sx)), 1);
    const lamp = light === 'red' ? '#ef4444' : light === 'turning' ? '#facc15' : '#22c55e';
    g.shadowColor = lamp; g.shadowBlur = 60;
    g.fillStyle = lamp; g.beginPath(); g.arc(0, 0, R + 14, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#1e293b'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    if (!front) {
      // back panel: bolts and vents
      g.fillStyle = '#334155'; roundRect(-62, -50, 124, 100, 16); g.fill();
      g.fillStyle = '#0f172a'; for (let i = 0; i < 4; i++) g.fillRect(-44, -32 + i * 20, 88, 8);
      g.fillStyle = '#94a3b8'; for (const [bx, by] of [[-85, 0], [85, 0], [0, -85], [0, 85]]) { g.beginPath(); g.arc(bx, by, 7, 0, Math.PI * 2); g.fill(); }
    } else {
      // front: one big scanning lens
      const scan = Math.sin(t / 300) * 26;
      g.fillStyle = '#fee2e2'; g.beginPath(); g.arc(0, -6, 66, 0, Math.PI * 2); g.fill();
      const iris = g.createRadialGradient(scan, -6, 4, scan, -6, 40);
      iris.addColorStop(0, '#fff'); iris.addColorStop(0.25, '#f87171'); iris.addColorStop(1, '#7f1d1d');
      g.fillStyle = iris; g.beginPath(); g.arc(scan, -6, 38, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0f172a'; g.beginPath(); g.arc(scan, -6, 14, 0, Math.PI * 2); g.fill();
      // brow
      g.strokeStyle = '#0f172a'; g.lineWidth = 10; g.beginPath(); g.moveTo(-70, -78); g.lineTo(70, -68); g.stroke();
    }
    g.restore();
    // cap on top
    g.fillStyle = '#0f172a'; roundRect(cx - 50, cy - R - 34, 100, 30, 10); g.fill();
    // scanning beam while red
    if (light === 'red' && front && state.phase === 'play') {
      const sweep = Math.sin(t / 650);
      const tx = 540 + sweep * 420, ty = START_Y - 60;
      const beam = g.createLinearGradient(cx, cy, tx, ty);
      beam.addColorStop(0, 'rgba(255,60,60,.45)'); beam.addColorStop(1, 'rgba(255,60,60,0)');
      g.fillStyle = beam; g.beginPath(); g.moveTo(cx - 10, cy); g.lineTo(tx - 170, ty); g.lineTo(tx + 170, ty); g.lineTo(cx + 10, cy); g.fill();
    }
  }

  function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ---------- Runners (seen from behind: they run toward the watcher) ----------
  function placement(p, t) {
    const h = hash(p.id);
    let pos = shown.get(p.id) ?? p.pos;
    if (state.phase === 'lobby' || state.phase === 'countdown') pos = -((h % 5) * 1.6) - 1; // staggered rows behind the line
    if (p.state === 'finished') pos = 104 + (p.rank % 3) * 1.5;
    const z = zOf(pos);
    const x = 540 + (p.lane * 2 - 1) * (halfWidth(Math.max(0, pos)) - 20) * (p.state === 'finished' ? 1.1 : 1);
    return { x, y: yOf(pos), s: 1 / z, h, pos };
  }

  function drawRunner(p, pl, t) {
    const { x, y, s, h } = pl;
    const k = 1.25 * s; // overall size
    const out = p.state === 'out';
    const fin = p.state === 'finished';
    const outfit = out ? '#6b7280' : OUTFITS[h % OUTFITS.length];
    const skin = out ? '#9ca3af' : SKINS[(h >> 4) % SKINS.length];
    const hair = out ? '#4b5563' : HAIRS[(h >> 8) % HAIRS.length];
    const run = p.moving && !out ? Math.sin(t / 70 + (h % 10)) : 0;
    const hop = fin ? Math.abs(Math.sin(t / 180 + (h % 7))) * 18 : Math.abs(run) * 6;
    g.save(); g.translate(x, y);
    // shadow
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 0, 30 * k, 9 * k, 0, 0, Math.PI * 2); g.fill();
    if (out) { g.globalAlpha = Math.max(0.35, 1 - (t - (p.outSeen || t)) / 4000); g.rotate((h % 2 ? 1 : -1) * Math.PI / 2 * 0.95); g.translate(0, -8 * k); }
    g.translate(0, -hop * k);
    g.scale(k, k);
    // legs
    g.fillStyle = '#1f2937';
    g.save(); g.translate(-10, -38); g.rotate(run * 0.5); roundRect(-7, 0, 14, 38, 6); g.fill(); g.restore();
    g.save(); g.translate(10, -38); g.rotate(-run * 0.5); roundRect(-7, 0, 14, 38, 6); g.fill(); g.restore();
    // arms
    g.strokeStyle = outfit; g.lineWidth = 12; g.lineCap = 'round';
    const armUp = fin ? -1 : 0;
    for (const side of [-1, 1]) {
      g.beginPath(); g.moveTo(side * 22, -78);
      if (fin) g.lineTo(side * 34, -78 - 40 + armUp);
      else g.lineTo(side * 30, -50 + side * run * 14);
      g.stroke();
    }
    // torso + bib (back view)
    g.fillStyle = outfit; roundRect(-26, -92, 52, 58, 14); g.fill();
    g.fillStyle = '#fff'; roundRect(-19, -84, 38, 26, 5); g.fill();
    g.fillStyle = '#111'; g.font = '900 20px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(p.number).padStart(3, '0'), 0, -70);
    // head from behind: hair covers most of it
    g.fillStyle = skin; g.beginPath(); g.arc(0, -114, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = hair; g.beginPath(); g.arc(0, -118, 22, Math.PI * 0.95, Math.PI * 2.05); g.fill(); g.fillRect(-22, -118, 44, 10);
    // ears
    g.fillStyle = skin; g.beginPath(); g.arc(-22, -110, 5, 0, Math.PI * 2); g.arc(22, -110, 5, 0, Math.PI * 2); g.fill();
    // shield bubble
    if (p.shields > 0 && !out) {
      g.strokeStyle = 'rgba(56,189,248,.9)'; g.lineWidth = 5; g.fillStyle = 'rgba(56,189,248,.15)';
      g.beginPath(); g.ellipse(0, -66, 46, 76, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      if (p.shields > 1) { g.fillStyle = '#38bdf8'; g.font = '900 22px system-ui'; g.fillText('×' + p.shields, 38, -140); }
    }
    g.restore();
    if (out) {
      g.save(); g.translate(x, y - 30 * k); g.strokeStyle = '#ef4444'; g.lineWidth = 7 * k; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-16 * k, -16 * k); g.lineTo(16 * k, 16 * k); g.moveTo(16 * k, -16 * k); g.lineTo(-16 * k, 16 * k); g.stroke(); g.restore();
    }
  }

  function drawLabel(p, pl) {
    if (p.bot || p.state === 'out') return;
    const { x, y, s } = pl;
    const k = 1.25 * s;
    const text = p.nickname.length > 12 ? p.nickname.slice(0, 11) + '…' : p.nickname;
    g.font = `800 ${Math.round(24 * Math.max(0.75, k))}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(text).width + 18, ly = y - 160 * k;
    g.fillStyle = p.state === 'finished' ? 'rgba(22,163,74,.9)' : 'rgba(10,14,30,.75)';
    roundRect(x - w / 2, ly - 16, w, 32, 12); g.fill();
    g.fillStyle = '#fff'; g.fillText(text, x, ly);
  }

  // ---------- Effects ----------
  function spawnText(x, y, text, color) { effects.push({ kind: 'text', x, y, text, color, born: performance.now() }); }
  function spawnBurst(x, y, colors, n = 16) {
    const now = performance.now();
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 6; effects.push({ kind: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, color: colors[i % colors.length], born: now }); }
  }
  function drawEffects(t) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i], age = t - e.born;
      if (age > 1600) { effects.splice(i, 1); continue; }
      const a = 1 - age / 1600;
      g.globalAlpha = a;
      if (e.kind === 'text') {
        g.font = '900 52px system-ui'; g.textAlign = 'center'; g.lineWidth = 8; g.strokeStyle = '#000';
        g.strokeText(e.text, e.x, e.y - age / 12); g.fillStyle = e.color; g.fillText(e.text, e.x, e.y - age / 12);
      } else {
        e.x += e.vx; e.y += e.vy; e.vy += 0.35;
        g.fillStyle = e.color; g.fillRect(e.x - 5, e.y - 5, 10, 10);
      }
      g.globalAlpha = 1;
    }
  }

  // ---------- Frame ----------
  function frame(t) {
    requestAnimationFrame(frame);
    g.clearRect(0, 0, W, H);
    drawBackground(t);
    drawWatcher(t);
    if (state) {
      const players = state.players;
      for (const p of players) {
        const cur = shown.get(p.id);
        shown.set(p.id, cur == null ? p.pos : cur + (p.pos - cur) * 0.18);
      }
      const placed = players.map((p) => ({ p, pl: placement(p, t) })).sort((a, b) => a.pl.y - b.pl.y);
      for (const { p, pl } of placed) drawRunner(p, pl, t);
      for (const { p, pl } of placed) drawLabel(p, pl);
    }
    drawEffects(t);
    if (redFlash > 0) {
      const a = Math.max(0, 1 - (t - redFlash) / 600);
      if (a <= 0) redFlash = 0;
      const v = g.createRadialGradient(540, 960, 300, 540, 960, 1100);
      v.addColorStop(0, 'rgba(239,68,68,0)'); v.addColorStop(1, `rgba(239,68,68,${0.55 * a})`);
      g.fillStyle = v; g.fillRect(0, 0, W, H);
    }
  }
  requestAnimationFrame(frame);

  // ---------- HUD ----------
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function renderHud(s) {
    const banner = $('light-banner');
    let cls = 'idle', main = 'CHỜ VÀO TRẬN', sub = 'THẢ TIM HOẶC COMMENT ĐỂ VÀO CHƠI';
    if (s.phase === 'countdown') { main = 'CHUẨN BỊ'; sub = 'SẮP BẮT ĐẦU!'; }
    if (s.phase === 'play') {
      if (s.light === 'green') { cls = 'green'; main = 'ĐÈN XANH'; sub = 'THẢ TIM ĐỂ CHẠY!'; }
      if (s.light === 'turning') { cls = 'turning'; main = 'SẮP ĐỎ!'; sub = 'DỪNG TAY NGAY!'; }
      if (s.light === 'red') { cls = 'red'; main = 'ĐÈN ĐỎ'; sub = 'ĐỨNG IM! CỬ ĐỘNG LÀ LOẠI'; }
    }
    if (s.phase === 'result') { main = 'KẾT THÚC'; sub = 'VÁN SAU SẮP BẮT ĐẦU'; }
    banner.className = 'light-banner ' + cls;
    $('light-text').textContent = main; $('light-sub').textContent = sub;
    $('alive').textContent = s.counts.alive; $('finished').textContent = s.counts.finished; $('out').textContent = s.counts.out;
    const timed = s.phase === 'play' || (s.phase === 'lobby' && s.phaseLeftMs > 0) || s.phase === 'countdown';
    $('timer').textContent = timed ? fmt(s.phaseLeftMs) : '--';
    $('timer-label').textContent = s.phase === 'lobby' ? 'BẮT ĐẦU SAU' : 'THỜI GIAN';

    const panel = $('center-panel');
    panel.className = 'center-panel';
    if (s.phase === 'lobby') {
      panel.hidden = false;
      panel.innerHTML = `<h2>ĐÈN XANH<br>ĐÈN ĐỎ</h2><p>❤ Thả tim hoặc 💬 comment bất kỳ để vào chơi</p><p><b style="color:#fde047">${s.counts.total}</b> người đã vào sân</p>`;
    } else if (s.phase === 'countdown') {
      panel.hidden = false; panel.classList.add('countdown');
      panel.innerHTML = `<div class="big">${Math.max(1, Math.ceil(s.phaseLeftMs / 1000))}</div>`;
    } else if (s.phase === 'result' && s.result) {
      panel.hidden = false;
      const w = s.result.winners;
      const medals = ['🥇', '🥈', '🥉'];
      panel.innerHTML = `<h2>${w.length ? '🏁 VỀ ĐÍCH' : 'KHÔNG AI SỐNG SÓT'}</h2>` + (w.length
        ? `<p>${w.length}/${s.result.total} người vượt qua</p><ol>${w.slice(0, 5).map((p, i) => `<li><span class="medal">${medals[i] || '🏅'}</span><span class="num">#${String(p.number).padStart(3, '0')}</span><span class="name">${esc(p.nickname)}</span></li>`).join('')}</ol>`
        : `<p class="none">Tất cả ${s.result.total} người đã bị loại</p>`);
    } else panel.hidden = true;

    // countdown beeps
    if (s.phase === 'countdown') { const sec = Math.ceil(s.phaseLeftMs / 1000); if (sec !== lastSecond) { lastSecond = sec; audio.play('tick'); } } else lastSecond = -1;
    if (s.phase !== lastPhase) {
      if (s.phase === 'play') audio.play('go');
      if (s.phase === 'result') audio.play('win');
      if (s.phase === 'lobby') { shown.clear(); effects.length = 0; }
      lastPhase = s.phase;
    }
    if (s.phase === 'play' && s.light !== lastLight) {
      lightChangedAt = performance.now();
      audio.play(s.light);
      if (s.light === 'red') redFlash = performance.now();
    }
    lastLight = s.phase === 'play' ? s.light : '';
  }

  // ---------- Feed ----------
  let outSoundAt = 0;
  function feed(text, kind) {
    const el = document.createElement('div');
    el.className = 'item ' + kind; el.textContent = text;
    const box = $('feed'); box.prepend(el);
    while (box.children.length > 5) box.lastChild.remove();
    setTimeout(() => el.remove(), 4500);
  }
  const tag = (ev) => `#${String(ev.number).padStart(3, '0')} ${ev.nickname}`;
  function onEvent(ev) {
    const p = state?.players.find((x) => x.id === ev.id);
    const pl = p ? placement(p, performance.now()) : null;
    if (ev.type === 'out') {
      if (ev.reason === 'moved') feed(`💥 ${tag(ev)} cử động khi đèn đỏ!`, 'out');
      if (p) p.outSeen = performance.now();
      if (pl && ev.reason === 'moved') { spawnText(pl.x, pl.y - 120 * pl.s, 'LOẠI!', '#f87171'); spawnBurst(pl.x, pl.y - 60 * pl.s, ['#9ca3af', '#f87171', '#fff'], 12); }
      const now = performance.now();
      if (ev.reason === 'moved' && now - outSoundAt > 150) { outSoundAt = now; audio.play('out'); }
    }
    if (ev.type === 'finish') {
      feed(`🏁 ${tag(ev)} về đích hạng ${ev.rank}!`, 'finish');
      spawnBurst(540 + (Math.random() - 0.5) * 300, FINISH_Y - 40, ['#facc15', '#22c55e', '#38bdf8', '#f472b6'], 24);
      audio.play('finish');
    }
    if (ev.type === 'shield') { feed(`🛡 ${tag(ev)} được khiên cứu!`, 'shield'); if (pl) spawnText(pl.x, pl.y - 120 * pl.s, 'KHIÊN!', '#7dd3fc'); audio.play('shield'); }
    if (ev.type === 'gift') feed(`🎁 ${tag(ev)} nhận khiên (${ev.shields})`, 'gift');
    if (ev.type === 'join' && !ev.bot) { feed(`👋 ${tag(ev)} vào sân`, 'join'); audio.play('join'); }
  }

  // ---------- Socket ----------
  let socket, retry;
  function navigateToStudio(port) {
    const q = new URLSearchParams(location.search);
    if (!q.has('sl') || !Number.isInteger(port)) return;
    q.delete('sl'); q.delete('silent');
    const s = q.toString().replace(/=(&|$)/g, '$1');
    location.replace(`${location.protocol}//${location.hostname}:${port}/${s ? '?' + s : ''}`);
  }
  function connect() {
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    socket.onopen = () => { $('connection').hidden = true; };
    socket.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'navigate') return navigateToStudio(m.port);
      if (m.type === 'state' && m.state) {
        // keep client-only marks across updates
        const prev = new Map((state?.players || []).map((p) => [p.id, p.outSeen]));
        for (const p of m.state.players) if (prev.get(p.id)) p.outSeen = prev.get(p.id);
        state = m.state; renderHud(state);
        if (m.audio) audio.set(m.audio);
      }
      if (m.type === 'event' && m.event) onEvent(m.event);
      if (m.type === 'audio-test') audio.play('win');
    };
    socket.onclose = () => { $('connection').hidden = false; clearTimeout(retry); retry = setTimeout(connect, 2000); };
    socket.onerror = () => socket.close();
  }
  connect();
})();
