// Đánh Boss overlay: 9:16 canvas arena rendered from server state at 60fps.
(() => {
  const $ = (id) => document.getElementById(id);
  const W = 1080, H = 1920;
  const canvas = $('field');
  const g = canvas.getContext('2d');
  const audio = window.bossAudio;

  const fit = () => document.documentElement.style.setProperty('--s', Math.min(innerWidth / W, innerHeight / H));
  addEventListener('resize', fit); fit();

  const BOSS_X = 540, BOSS_Y = 760, GROUND_Y = 1080;
  const MAX_SHOWN = 60, PER_ROW = 10, ROW_Y0 = 1190, ROW_GAP = 82;

  let state = null;
  let lastPhase = '', lastSecond = -1, lastSlamState = 'idle';
  let hitFlash = 0, shakeUntil = 0, slamAt = 0, warnAt = 0;
  const effects = [];
  const projectiles = [];
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const ARMOR = ['#0ea5e9', '#f97316', '#a855f7', '#14b8a6', '#eab308', '#ec4899', '#22c55e', '#6366f1', '#f43f5e', '#84cc16'];
  const SKINS = ['#f8d3b0', '#eebb94', '#d9a07a', '#b97f5c', '#8d5a3c'];

  function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ---------- Arena ----------
  let stars = null;
  function drawArena(t) {
    const enraged = state?.boss.enraged && state.phase === 'play';
    const sky = g.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, enraged ? '#2a0606' : '#120a2a');
    sky.addColorStop(1, enraged ? '#7a1d0c' : '#3b1d5e');
    g.fillStyle = sky; g.fillRect(0, 0, W, GROUND_Y);
    if (!stars) stars = Array.from({ length: 70 }, (_, i) => ({ x: (hash('x' + i) % W), y: (hash('y' + i) % 900), r: 1 + (hash('r' + i) % 3) }));
    for (const s of stars) { g.globalAlpha = 0.4 + 0.4 * Math.sin(t / 700 + s.x); g.fillStyle = '#fff'; g.fillRect(s.x, s.y, s.r, s.r); }
    g.globalAlpha = 1;
    // jagged cliffs
    g.fillStyle = enraged ? '#3a0d0a' : '#24133d';
    g.beginPath(); g.moveTo(0, GROUND_Y);
    const peaks = [[0, 820], [120, 700], [220, 860], [300, 760], [380, 900], [700, 900], [780, 740], [880, 860], [960, 690], [1080, 820]];
    for (const [x, y] of peaks) g.lineTo(x, y);
    g.lineTo(W, GROUND_Y); g.fill();
    // stone floor
    const floor = g.createLinearGradient(0, GROUND_Y, 0, H);
    floor.addColorStop(0, enraged ? '#4a1a10' : '#3a2f4a'); floor.addColorStop(1, '#120d18');
    g.fillStyle = floor; g.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 3;
    for (let i = 1; i < 9; i++) { const y = GROUND_Y + i * i * 11; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(540 + i * 60, GROUND_Y); g.lineTo(540 + i * 260, H); g.stroke(); }
    // lava glow under the boss
    const lava = g.createRadialGradient(BOSS_X, GROUND_Y, 20, BOSS_X, GROUND_Y, 420);
    lava.addColorStop(0, enraged ? 'rgba(255,90,20,.55)' : 'rgba(168,85,247,.4)'); lava.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lava; g.fillRect(0, GROUND_Y - 300, W, 600);
  }

  // ---------- Boss: a stone golem with glowing magma cracks (original design) ----------
  function drawBoss(t) {
    if (!state) return;
    const dead = state.boss.hp <= 0 && state.phase === 'result';
    const enraged = state.boss.enraged;
    const warn = state.phase === 'play' && state.slam.state === 'warn';
    const sinceSlam = t - slamAt;
    const breathe = Math.sin(t / 500) * 6;
    const warnK = warn ? Math.min(1, (t - warnAt) / 600) : 0;
    const slamK = sinceSlam < 500 ? 1 - sinceSlam / 500 : 0;
    const glow = enraged ? '#ff5a1f' : '#c084fc';
    g.save();
    g.translate(BOSS_X, BOSS_Y + breathe + (dead ? 120 : 0));
    if (dead) { g.globalAlpha = 0.55; g.rotate(0.12); }
    else if (t - hitFlash < 70) g.filter = 'brightness(1.5)'; // flash when hit
    if (t - hitFlash < 90) g.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6);
    const sc = 1 + warnK * 0.06;
    g.scale(sc, sc);
    // shadow
    g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(0, GROUND_Y - BOSS_Y - 10, 300, 40, 0, 0, Math.PI * 2); g.fill();
    // legs
    g.fillStyle = '#4b4458';
    roundRect(-170, 150, 120, 180, 30); g.fill();
    roundRect(50, 150, 120, 180, 30); g.fill();
    // arms: raised during wind-up, smashing down on slam
    for (const side of [-1, 1]) {
      const raise = warnK * (1 - slamK);
      const ang = side * (0.35 - raise * 2.3) + (slamK ? side * 0.4 * slamK : 0);
      g.save(); g.translate(side * 190, -70); g.rotate(ang);
      g.fillStyle = '#5a5268'; roundRect(-50, 0, 100, 230, 40); g.fill();
      g.fillStyle = '#6b6380'; g.beginPath(); g.arc(0, 250, 78, 0, Math.PI * 2); g.fill(); // fist
      g.strokeStyle = glow; g.lineWidth = 6; g.globalAlpha = 0.7 + 0.3 * Math.sin(t / 200);
      g.beginPath(); g.moveTo(-20, 40); g.lineTo(10, 110); g.lineTo(-10, 170); g.stroke(); g.globalAlpha = dead ? 0.55 : 1;
      g.restore();
    }
    // torso
    g.fillStyle = '#625a73';
    g.beginPath(); g.moveTo(-230, -120); g.quadraticCurveTo(0, -210, 230, -120); g.lineTo(190, 190); g.quadraticCurveTo(0, 240, -190, 190); g.closePath(); g.fill();
    g.fillStyle = '#544c64'; g.beginPath(); g.ellipse(0, 40, 130, 110, 0, 0, Math.PI * 2); g.fill();
    // magma cracks
    g.shadowColor = glow; g.shadowBlur = 25; g.strokeStyle = glow; g.lineWidth = 8; g.lineCap = 'round';
    g.globalAlpha = (dead ? 0.2 : 0.75 + 0.25 * Math.sin(t / 180)) * (dead ? 0.55 : 1);
    g.beginPath(); g.moveTo(-90, -100); g.lineTo(-40, -20); g.lineTo(-70, 60); g.lineTo(-20, 140);
    g.moveTo(80, -110); g.lineTo(40, -30); g.lineTo(90, 50); g.moveTo(-40, -20); g.lineTo(30, 10); g.stroke();
    g.globalAlpha = dead ? 0.55 : 1; g.shadowBlur = 0;
    // head
    g.save(); g.translate(0, -230);
    for (const side of [-1, 1]) { // horns
      g.fillStyle = '#e7dcc8'; g.beginPath(); g.moveTo(side * 70, -40); g.quadraticCurveTo(side * 170, -90, side * 150, -190); g.quadraticCurveTo(side * 120, -110, side * 40, -70); g.fill();
    }
    g.fillStyle = '#6b6380'; roundRect(-110, -90, 220, 170, 50); g.fill();
    g.fillStyle = '#4b4458'; roundRect(-110, 10, 220, 70, 30); g.fill(); // jaw
    const eye = warn || enraged ? '#ff2d2d' : '#facc15';
    g.shadowColor = eye; g.shadowBlur = 30; g.fillStyle = dead ? '#555' : eye;
    for (const side of [-1, 1]) { g.beginPath(); g.moveTo(side * 70, -30); g.lineTo(side * 25, -10); g.lineTo(side * 70, 5); g.closePath(); g.fill(); }
    g.shadowBlur = 0;
    g.fillStyle = '#1b1324'; roundRect(-60, 30, 120, 26 + warnK * 20, 10); g.fill(); // mouth
    g.fillStyle = '#e7dcc8'; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-50 + i * 25, 30); g.lineTo(-38 + i * 25, 46); g.lineTo(-26 + i * 25, 30); g.fill(); }
    g.restore();
    g.restore();
    // wind-up aura
    if (warn) {
      const a = 0.25 + 0.2 * Math.sin(t / 80);
      const aura = g.createRadialGradient(BOSS_X, BOSS_Y, 100, BOSS_X, BOSS_Y, 520);
      aura.addColorStop(0, `rgba(255,40,40,${a})`); aura.addColorStop(1, 'rgba(255,40,40,0)');
      g.fillStyle = aura; g.fillRect(0, 200, W, 1100);
    }
    // shockwave
    if (sinceSlam < 900) {
      const k = sinceSlam / 900;
      g.strokeStyle = `rgba(255,200,120,${1 - k})`; g.lineWidth = 30 * (1 - k) + 4;
      g.beginPath(); g.ellipse(BOSS_X, GROUND_Y + 40, 120 + k * 700, 30 + k * 240, 0, 0, Math.PI * 2); g.stroke();
    }
  }

  // ---------- Warriors ----------
  function shownPlayers() {
    const list = [...state.players].sort((a, b) => (a.bot - b.bot) || (b.damage - a.damage) || (a.number - b.number)).slice(0, MAX_SHOWN);
    return list.sort((a, b) => a.number - b.number);
  }
  function placement(i) {
    const r = Math.floor(i / PER_ROW), c = i % PER_ROW;
    const spread = 880 + r * 30;
    return { x: 540 - spread / 2 + (c + 0.5) * (spread / PER_ROW) + (r % 2 ? 22 : -22), y: ROW_Y0 + r * ROW_GAP, s: 0.8 + r * 0.06 };
  }

  function drawWarrior(p, pl, t) {
    const h = hash(p.id);
    const down = p.state === 'down';
    const armor = down ? '#6b7280' : ARMOR[h % ARMOR.length];
    const skin = down ? '#9ca3af' : SKINS[(h >> 4) % SKINS.length];
    const k = pl.s;
    const hop = p.dodging && !down ? Math.abs(Math.sin(t / 110 + h)) * 40 : 0;
    const swing = p.attacking && !down ? Math.sin(t / 45 + h) : -0.4;
    g.save(); g.translate(pl.x, pl.y);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, 0, 30 * k, 9 * k, 0, 0, Math.PI * 2); g.fill();
    if (down) { g.rotate((h % 2 ? 1 : -1) * Math.PI / 2 * 0.9); g.translate(0, -10 * k); g.globalAlpha = 0.75; }
    g.translate(0, -hop * k); g.scale(k, k);
    if (p.dodging && !down) { g.globalAlpha = 0.85; }
    // legs
    g.fillStyle = '#1f2937'; roundRect(-16, -36, 12, 36, 5); g.fill(); roundRect(4, -36, 12, 36, 5); g.fill();
    // body (seen from behind, facing the boss)
    g.fillStyle = armor; roundRect(-24, -88, 48, 56, 14); g.fill();
    g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(-24, -50, 48, 8);
    // sword arm
    g.save(); g.translate(22, -78); g.rotate(swing);
    g.strokeStyle = armor; g.lineWidth = 11; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(14, -26); g.stroke();
    g.strokeStyle = '#e5e7eb'; g.lineWidth = 7; g.beginPath(); g.moveTo(14, -26); g.lineTo(26, -78); g.stroke();
    g.strokeStyle = '#a16207'; g.lineWidth = 8; g.beginPath(); g.moveTo(6, -24); g.lineTo(24, -30); g.stroke();
    g.restore();
    // shield arm
    g.fillStyle = '#94a3b8'; g.beginPath(); g.ellipse(-28, -62, 14, 20, 0, 0, Math.PI * 2); g.fill();
    // head + helmet
    g.fillStyle = skin; g.beginPath(); g.arc(0, -106, 20, 0, Math.PI * 2); g.fill();
    g.fillStyle = down ? '#4b5563' : '#cbd5e1'; g.beginPath(); g.arc(0, -110, 21, Math.PI, Math.PI * 2); g.fill(); g.fillRect(-21, -112, 42, 8);
    g.fillStyle = armor; g.fillRect(-3, -138, 6, 14);
    g.restore();
    // hearts
    if (!down && p.hp > 0) {
      g.font = `900 ${Math.round(20 * k)}px system-ui`; g.textAlign = 'center'; g.fillStyle = '#f43f5e';
      g.fillText('♥'.repeat(Math.min(p.hp, 5)), pl.x, pl.y - 150 * k - hop * k);
    } else if (down) {
      g.font = `900 ${Math.round(26 * k)}px system-ui`; g.textAlign = 'center'; g.fillText('💫', pl.x, pl.y - 60 * k);
    }
  }

  function drawLabel(p, pl) {
    if (p.bot) return;
    const k = pl.s;
    const text = p.nickname.length > 10 ? p.nickname.slice(0, 9) + '…' : p.nickname;
    g.font = `800 ${Math.round(20 * Math.max(0.85, k))}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(text).width + 14, ly = pl.y + 22;
    g.fillStyle = p.state === 'down' ? 'rgba(127,29,29,.85)' : 'rgba(10,8,20,.75)';
    roundRect(pl.x - w / 2, ly - 14, w, 28, 10); g.fill();
    g.fillStyle = '#fff'; g.fillText(text, pl.x, ly);
    g.textBaseline = 'alphabetic';
  }

  // ---------- Effects ----------
  function spawnText(x, y, text, color, size = 52) { effects.push({ kind: 'text', x, y, text, color, size, born: performance.now() }); if (effects.length > 120) effects.shift(); }
  function spawnBurst(x, y, colors, n = 16) {
    const now = performance.now();
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 7; effects.push({ kind: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, color: colors[i % colors.length], born: now }); }
    while (effects.length > 240) effects.shift();
  }
  function drawEffects(t) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i], k = (t - p.born) / 260;
      if (k >= 1) { projectiles.splice(i, 1); continue; }
      const x = p.x + (p.tx - p.x) * k, y = p.y + (p.ty - p.y) * k - Math.sin(k * Math.PI) * 80;
      g.fillStyle = p.color; g.beginPath(); g.arc(x, y, p.big ? 18 : 8, 0, Math.PI * 2); g.fill();
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i], age = t - e.born;
      if (age > 1300) { effects.splice(i, 1); continue; }
      g.globalAlpha = 1 - age / 1300;
      if (e.kind === 'text') {
        g.font = `900 ${e.size}px system-ui`; g.textAlign = 'center'; g.lineWidth = 8; g.strokeStyle = '#000';
        g.strokeText(e.text, e.x, e.y - age / 10); g.fillStyle = e.color; g.fillText(e.text, e.x, e.y - age / 10);
      } else {
        e.x += e.vx; e.y += e.vy; e.vy += 0.35;
        g.fillStyle = e.color; g.fillRect(e.x - 5, e.y - 5, 10, 10);
      }
      g.globalAlpha = 1;
    }
  }

  // ---------- Frame ----------
  let placed = new Map();
  function frame(t) {
    requestAnimationFrame(frame);
    g.save();
    if (t < shakeUntil) g.translate((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24);
    g.clearRect(-30, -30, W + 60, H + 60);
    drawArena(t);
    drawBoss(t);
    if (state) {
      const list = shownPlayers();
      placed = new Map();
      list.forEach((p, i) => placed.set(p.id, placement(i)));
      for (const p of list) drawWarrior(p, placed.get(p.id), t);
      for (const p of list) drawLabel(p, placed.get(p.id));
    }
    drawEffects(t);
    g.restore();
  }
  requestAnimationFrame(frame);

  // ---------- HUD ----------
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let lastBoardKey = '';

  function renderHud(s) {
    const pct = s.boss.max ? (s.boss.hp / s.boss.max) * 100 : 0;
    $('hp-fill').style.width = pct + '%'; $('hp-lag').style.width = pct + '%';
    $('boss-hp-text').textContent = `${s.boss.hp.toLocaleString('vi-VN')} / ${s.boss.max.toLocaleString('vi-VN')}`;
    document.querySelector('.boss-bar').classList.toggle('enraged', s.boss.enraged);
    $('boss-name').textContent = s.boss.enraged ? 'QUÁI VƯƠNG ĐÁ 😡 NỔI ĐIÊN' : 'QUÁI VƯƠNG ĐÁ';
    $('alive').textContent = s.counts.alive; $('down').textContent = s.counts.down;
    const timed = s.phase === 'play' || (s.phase === 'lobby' && s.phaseLeftMs > 0) || s.phase === 'countdown';
    $('timer').textContent = timed ? fmt(s.phaseLeftMs) : '--';
    $('timer-label').textContent = s.phase === 'lobby' ? 'BẮT ĐẦU SAU' : 'THỜI GIAN';

    const warn = s.phase === 'play' && s.slam.state === 'warn';
    $('warn').hidden = !warn;
    if (warn) $('warn-fill').style.width = Math.min(100, (s.slam.leftMs / s.config.slamWarnMs) * 100) + '%';
    if (warn && lastSlamState !== 'warn') { warnAt = performance.now(); audio.play('warn'); }
    lastSlamState = warn ? 'warn' : 'idle';

    const boardKey = s.top.map((p) => p.id + ':' + p.damage).join('|');
    if (boardKey !== lastBoardKey) {
      lastBoardKey = boardKey;
      $('board').innerHTML = s.top.map((p, i) => `<li><span>${['🥇', '🥈', '🥉'][i] || '⚔'}</span><span class="n">${esc(p.nickname)}</span><span class="d">${p.damage}</span></li>`).join('');
      document.querySelector('.board').hidden = !s.top.length;
    }

    const panel = $('center-panel');
    panel.className = 'center-panel';
    if (s.phase === 'lobby') {
      panel.hidden = false;
      panel.innerHTML = `<h2>ĐÁNH BOSS</h2><p>❤ Thả tim hoặc 💬 comment bất kỳ để vào trận</p><p><b style="color:#fde047">${s.counts.total}</b> chiến binh đã sẵn sàng</p>`;
    } else if (s.phase === 'countdown') {
      panel.hidden = false; panel.classList.add('countdown');
      panel.innerHTML = `<div class="big">${Math.max(1, Math.ceil(s.phaseLeftMs / 1000))}</div>`;
    } else if (s.phase === 'result' && s.result) {
      panel.hidden = false;
      const r = s.result;
      const medals = ['🥇', '🥈', '🥉'];
      panel.innerHTML = (r.win ? '<h2 class="win">🏆 HẠ GỤC BOSS!</h2>' : `<h2 class="lose">BOSS THẮNG</h2><p>Boss còn ${Math.ceil((r.bossHpLeft / r.bossMaxHp) * 100)}% máu</p>`)
        + (r.top.length ? `<ol>${r.top.slice(0, 5).map((p, i) => `<li><span class="medal">${medals[i] || '🏅'}</span><span class="name">${esc(p.nickname)}</span><span class="dmg">⚔ ${p.damage}</span></li>`).join('')}</ol>` : '');
    } else panel.hidden = true;

    if (s.phase === 'countdown') { const sec = Math.ceil(s.phaseLeftMs / 1000); if (sec !== lastSecond) { lastSecond = sec; audio.play('tick'); } } else lastSecond = -1;
    if (s.phase !== lastPhase) {
      if (s.phase === 'play') audio.play('go');
      if (s.phase === 'result') audio.play(s.result?.win ? 'win' : 'lose');
      if (s.phase === 'result' && s.result?.win) for (let i = 0; i < 5; i++) setTimeout(() => spawnBurst(200 + Math.random() * 680, 400 + Math.random() * 500, ['#facc15', '#22c55e', '#38bdf8', '#f472b6'], 30), i * 250);
      if (s.phase === 'lobby') { effects.length = 0; projectiles.length = 0; }
      lastPhase = s.phase;
    }
  }

  // ---------- Feed ----------
  function feed(text, kind) {
    const el = document.createElement('div');
    el.className = 'item ' + kind; el.textContent = text;
    const box = $('feed'); box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => el.remove(), 4500);
  }
  const tag = (ev) => `#${String(ev.number).padStart(3, '0')} ${ev.nickname}`;
  let hitSoundAt = 0;
  function onEvent(ev) {
    const now = performance.now();
    const pl = ev.id ? placed.get(ev.id) : null;
    if (ev.type === 'hit') {
      hitFlash = now;
      const crit = ev.kind === 'crit';
      const x = BOSS_X + (Math.random() - 0.5) * 360, y = BOSS_Y - 100 + (Math.random() - 0.5) * 300;
      if (pl && projectiles.length < 40) projectiles.push({ x: pl.x, y: pl.y - 100 * pl.s, tx: x, ty: y, born: now, color: crit ? '#facc15' : '#e0f2fe', big: crit });
      // small hits are frequent: cap their floating numbers so the boss stays readable
      if (crit || effects.filter((e) => e.kind === 'text').length < 12) spawnText(x, y, (crit ? 'CHÍ MẠNG ' : '-') + ev.damage, crit ? '#facc15' : '#fff', crit ? 76 : 44);
      if (crit) { spawnBurst(x, y, ['#facc15', '#fb923c', '#fff'], 24); feed(`💥 ${tag(ev)} chí mạng ${ev.damage}!`, 'crit'); audio.play('crit'); shakeUntil = now + 200; }
      else if (now - hitSoundAt > 70) { hitSoundAt = now; audio.play('hit'); }
    }
    if (ev.type === 'slam') {
      slamAt = now; shakeUntil = now + 600; audio.play('slam');
      feed(`🌋 Boss đập đất! ${ev.dodged} né được · ${ev.hurt} trúng đòn${ev.downed ? ` · ${ev.downed} gục` : ''}`, 'slam');
    }
    if (ev.type === 'dodge' && pl) { spawnText(pl.x, pl.y - 160 * pl.s, 'NÉ!', '#7dd3fc', 34); audio.play('dodge'); }
    if (ev.type === 'down') { feed(`☠ ${tag(ev)} đã gục — tặng quà để hồi sinh`, 'down'); audio.play('down'); }
    if (ev.type === 'revive') { feed(`✨ ${tag(ev)} hồi sinh!`, 'revive'); if (pl) spawnBurst(pl.x, pl.y - 60, ['#86efac', '#fff'], 18); audio.play('revive'); }
    if (ev.type === 'enrage') { feed('😡 Boss nổi điên — gồng chiêu nhanh hơn!', 'slam'); audio.play('enrage'); shakeUntil = now + 900; }
    if (ev.type === 'join' && !ev.bot) { feed(`👋 ${tag(ev)} vào trận`, 'join'); audio.play('join'); }
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
      if (m.type === 'state' && m.state) { state = m.state; renderHud(state); if (m.audio) audio.set(m.audio); }
      if (m.type === 'event' && m.event) onEvent(m.event);
      if (m.type === 'audio-test') audio.play('win');
    };
    socket.onclose = () => { $('connection').hidden = false; clearTimeout(retry); retry = setTimeout(connect, 2000); };
    socket.onerror = () => socket.close();
  }
  connect();
})();
