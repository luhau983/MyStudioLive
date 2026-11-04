// Thả Bi overlay: 9:16 plinko board. The server sends each ball's full bounce path; the overlay animates it so the
// ball reaches its slot exactly when the server scores it.
(() => {
  const $ = (id) => document.getElementById(id);
  const W = 1080, H = 1920;
  const canvas = $('field');
  const g = canvas.getContext('2d');
  const audio = window.thabiAudio;

  const fit = () => document.documentElement.style.setProperty('--s', Math.min(innerWidth / W, innerHeight / H));
  addEventListener('resize', fit); fit();

  // ---------- Board geometry ----------
  const CX = 540, PEG_TOP = 400, SLOT_TOP = 1380, SLOT_H = 110, BOARD_W = 940;
  let geo = null;
  function geometry(rows) {
    if (geo && geo.rows === rows) return geo;
    const dx = BOARD_W / (rows + 1);
    const dy = (SLOT_TOP - 40 - PEG_TOP) / Math.max(1, rows - 1);
    const pegR = Math.max(6, Math.min(11, dx * 0.12));
    const ballR = Math.max(12, Math.min(22, dx * 0.24));
    const pegs = [];
    for (let r = 0; r < rows; r++) for (let j = 0; j < r + 3; j++) pegs.push({ x: CX + (j - (r + 2) / 2) * dx, y: PEG_TOP + r * dy, hit: 0 });
    geo = { rows, dx, dy, pegR, ballR, pegs };
    return geo;
  }
  const pegAt = (r, j) => { let i = 0; for (let k = 0; k < r; k++) i += k + 3; return geo.pegs[i + j]; };

  let state = null;
  let lastPhase = '', lastSecond = -1;
  const balls = new Map();   // id -> { ...ball, t0 }
  const slotFlash = new Map(); // slot -> { at, color }
  const effects = [];
  let pegSounds = 0;

  function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const BALL_COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf', '#f87171', '#818cf8'];
  const slotColor = (m) => m >= 50 ? '#facc15' : m >= 10 ? '#f97316' : m >= 5 ? '#ec4899' : m >= 2 ? '#a855f7' : m >= 1 ? '#6366f1' : '#334155';

  // ---------- Background ----------
  function drawBackground(t) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b1030'); bg.addColorStop(0.55, '#1e1150'); bg.addColorStop(1, '#090616');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // soft moving light spots
    for (let i = 0; i < 4; i++) {
      const x = 540 + Math.sin(t / 3000 + i * 1.7) * 380, y = 800 + Math.cos(t / 3700 + i) * 420;
      const s = g.createRadialGradient(x, y, 0, x, y, 360);
      s.addColorStop(0, i % 2 ? 'rgba(34,211,238,.10)' : 'rgba(168,85,247,.12)'); s.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = s; g.fillRect(0, 0, W, H);
    }
    // board frame
    g.fillStyle = 'rgba(255,255,255,.04)'; roundRect(40, PEG_TOP - 80, W - 80, SLOT_TOP + SLOT_H - PEG_TOP + 100, 40); g.fill();
    g.strokeStyle = 'rgba(103,232,249,.35)'; g.lineWidth = 4; g.stroke();
  }

  function drawPegs(t) {
    const G = geometry(state?.rows ?? 12);
    for (const p of G.pegs) {
      const lit = Math.max(0, 1 - (t - p.hit) / 300);
      g.fillStyle = lit > 0 ? `rgba(${200 + 55 * lit},${240},${255},1)` : '#cbd5e1';
      if (lit > 0) { g.shadowColor = '#67e8f9'; g.shadowBlur = 25 * lit; }
      g.beginPath(); g.arc(p.x, p.y, G.pegR * (1 + 0.4 * lit), 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
    }
  }

  function drawSlots(t) {
    const G = geometry(state?.rows ?? 12);
    const mults = state?.multipliers ?? [];
    for (let i = 0; i <= G.rows; i++) {
      const x = CX + (i - G.rows / 2) * G.dx, w = G.dx - 6;
      const m = mults[i] ?? 1;
      const f = slotFlash.get(i);
      const k = f ? Math.max(0, 1 - (t - f.at) / 700) : 0;
      g.save(); g.translate(x, SLOT_TOP + 8 - k * 14);
      g.fillStyle = slotColor(m); roundRect(-w / 2, 0, w, SLOT_H - 20, 14); g.fill();
      if (k > 0) { g.fillStyle = `rgba(255,255,255,${0.6 * k})`; roundRect(-w / 2, 0, w, SLOT_H - 20, 14); g.fill(); }
      g.fillStyle = m >= 50 ? '#1f1300' : '#fff';
      g.font = `900 ${Math.round(Math.min(34, G.dx * 0.42))}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('×' + (m < 1 ? '½' : m), 0, (SLOT_H - 20) / 2);
      g.restore();
    }
    g.textBaseline = 'alphabetic';
  }

  // ---------- Ball animation ----------
  // Waypoint s: 0 = spawn above the board, 1..rows = resting on top of peg row s-1, rows+1 = inside the slot.
  function waypoint(b, s) {
    const G = geo;
    if (s <= 0) return { x: CX + ((hash(b.id) % 7) - 3) * 3, y: PEG_TOP - 140 };
    if (s > G.rows) return { x: CX + (b.slot - G.rows / 2) * G.dx, y: SLOT_TOP + SLOT_H / 2 - 10 };
    const r = s - 1;
    let right = 0; for (let k = 0; k < r; k++) right += b.path[k];
    const peg = pegAt(r, right + 1);
    return { x: peg.x, y: peg.y - G.pegR - G.ballR + 2, peg };
  }

  function ballPos(b, t) {
    const G = geo;
    const segMs = b.durationMs / (G.rows + 2);
    const el = Math.max(0, t - b.t0);
    const seg = Math.min(G.rows + 1, Math.floor(el / segMs));
    const u = Math.min(1, (el - seg * segMs) / segMs);
    const a = waypoint(b, seg), c = waypoint(b, seg + 1);
    if (seg >= G.rows + 1) return { x: c.x, y: c.y, seg, done: true };
    // a peg lights up when the ball arrives on it
    if (c.peg && u > 0.92 && b.litSeg !== seg) { b.litSeg = seg; c.peg.hit = t; if (pegSounds < 3) { pegSounds++; audio.play('peg'); } }
    const hop = seg === 0 ? 0 : G.dy * 0.35;
    const ease = seg === 0 ? u * u : u;
    return { x: a.x + (c.x - a.x) * u, y: a.y + (c.y - a.y) * ease - Math.sin(u * Math.PI) * hop, seg };
  }

  function drawBalls(t) {
    if (!geo) return;
    for (const [id, b] of balls) {
      if (t - b.t0 > b.durationMs + 900) { balls.delete(id); continue; }
      if (b.rows !== geo.rows) { balls.delete(id); continue; }
      const p = ballPos(b, t);
      const R = geo.ballR * (b.gold ? 1.25 : 1);
      const col = b.gold ? '#fbbf24' : BALL_COLORS[hash(b.owner) % BALL_COLORS.length];
      if (b.gold) { g.shadowColor = '#fde047'; g.shadowBlur = 30; }
      const grad = g.createRadialGradient(p.x - R * 0.35, p.y - R * 0.35, R * 0.1, p.x, p.y, R);
      grad.addColorStop(0, '#fff'); grad.addColorStop(0.3, col); grad.addColorStop(1, b.gold ? '#92400e' : '#0f172a');
      g.fillStyle = grad; g.beginPath(); g.arc(p.x, p.y, R, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = b.gold ? '#1f1300' : '#fff'; g.font = `900 ${Math.round(R * 0.8)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(b.number % 1000), p.x, p.y + 1);
      g.textBaseline = 'alphabetic';
      if (p.seg <= 1 && !b.bot) {
        const name = b.nickname.length > 12 ? b.nickname.slice(0, 11) + '…' : b.nickname;
        g.font = '800 24px system-ui'; const w = g.measureText(name).width + 16;
        g.fillStyle = 'rgba(8,10,30,.8)'; roundRect(p.x - w / 2, p.y - R - 42, w, 30, 10); g.fill();
        g.fillStyle = '#fff'; g.fillText(name, p.x, p.y - R - 19);
      }
    }
  }

  // ---------- Effects ----------
  function spawnText(x, y, text, color, size = 46) { effects.push({ kind: 'text', x, y, text, color, size, born: performance.now() }); if (effects.length > 120) effects.shift(); }
  function spawnBurst(x, y, colors, n = 16) {
    const now = performance.now();
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 8; effects.push({ kind: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, color: colors[i % colors.length], born: now }); }
    while (effects.length > 300) effects.shift();
  }
  function drawEffects(t) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i], age = t - e.born;
      if (age > 1500) { effects.splice(i, 1); continue; }
      g.globalAlpha = 1 - age / 1500;
      if (e.kind === 'text') {
        g.font = `900 ${e.size}px system-ui`; g.textAlign = 'center'; g.lineWidth = 8; g.strokeStyle = '#000';
        g.strokeText(e.text, e.x, e.y - age / 9); g.fillStyle = e.color; g.fillText(e.text, e.x, e.y - age / 9);
      } else {
        e.x += e.vx; e.y += e.vy; e.vy += 0.35;
        g.fillStyle = e.color; g.fillRect(e.x - 5, e.y - 5, 10, 10);
      }
      g.globalAlpha = 1;
    }
  }

  function frame(t) {
    requestAnimationFrame(frame);
    pegSounds = 0;
    g.clearRect(0, 0, W, H);
    drawBackground(t);
    geometry(state?.rows ?? 12);
    drawSlots(t);
    drawPegs(t);
    drawBalls(t);
    drawEffects(t);
  }
  requestAnimationFrame(frame);

  // ---------- HUD ----------
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let lastBoardKey = null;

  function trackBall(b) {
    if (balls.has(b.id)) return;
    balls.set(b.id, { ...b, rows: state?.rows ?? b.path.length, bot: String(b.owner).startsWith('bot_'), t0: performance.now() - (b.ageMs || 0) });
  }

  function renderHud(s) {
    $('total').textContent = s.counts.total; $('landed').textContent = s.counts.landed;
    const timed = s.phase === 'play' || (s.phase === 'lobby' && s.phaseLeftMs > 0);
    $('timer').textContent = timed ? fmt(s.phaseLeftMs) : '--';
    $('timer-label').textContent = s.phase === 'lobby' ? 'BẮT ĐẦU SAU' : 'THỜI GIAN';
    $('likes-per-ball').textContent = s.config.likesPerBall;
    $('gold-x').textContent = s.config.goldMultiplier;
    for (const b of s.balls) trackBall(b);

    const boardKey = s.top.map((p) => p.id + ':' + p.score).join('|');
    if (boardKey !== lastBoardKey) {
      lastBoardKey = boardKey;
      $('board').innerHTML = s.top.length
        ? s.top.map((p, i) => `<li><span>${['🥇', '🥈', '🥉'][i] || '🏅'}</span><span class="n">${esc(p.nickname)}</span><span class="d">${p.score.toLocaleString('vi-VN')}</span></li>`).join('')
        : '<li class="empty">Chưa có điểm — comment THẢ!</li>';
    }

    const panel = $('center-panel');
    if (s.phase === 'lobby') {
      panel.hidden = false;
      panel.innerHTML = `<h2>THẢ BI</h2><p>Sắp bắt đầu — comment <b style="color:#fde047">THẢ</b> hoặc thả tim để vào chơi</p><p><b style="color:#67e8f9">${s.counts.total}</b> người đã sẵn sàng</p>`;
    } else if (s.phase === 'result' && s.result) {
      panel.hidden = false;
      const top = s.result.top;
      const medals = ['🥇', '🥈', '🥉'];
      panel.innerHTML = `<h2>🏆 KẾT QUẢ</h2>` + (top.length
        ? `<p>${s.result.landed} viên bi đã rơi</p><ol>${top.map((p, i) => `<li><span class="medal">${medals[i] || '🏅'}</span><span class="name">${esc(p.nickname)}</span><span class="pts">${p.score.toLocaleString('vi-VN')}</span></li>`).join('')}</ol>`
        : '<p class="none">Chưa ai ghi điểm</p>');
    } else panel.hidden = true;

    if (s.phase === 'play' && s.phaseLeftMs <= 10000) { const sec = Math.ceil(s.phaseLeftMs / 1000); if (sec !== lastSecond) { lastSecond = sec; audio.play('tick'); } } else lastSecond = -1;
    if (s.phase !== lastPhase) {
      if (s.phase === 'play') audio.play('go');
      if (s.phase === 'result') { audio.play('win'); for (let i = 0; i < 5; i++) setTimeout(() => spawnBurst(200 + Math.random() * 680, 500 + Math.random() * 600, ['#facc15', '#22d3ee', '#f472b6', '#a3e635'], 30), i * 250); }
      if (s.phase === 'lobby') { balls.clear(); effects.length = 0; slotFlash.clear(); }
      lastPhase = s.phase;
    }
  }

  // ---------- Feed ----------
  function feed(text, kind) {
    const el = document.createElement('div');
    el.className = 'item ' + kind; el.textContent = text;
    const box = $('feed'); box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => el.remove(), 5000);
  }
  const tag = (ev) => `#${String(ev.number).padStart(3, '0')} ${ev.nickname}`;
  let landSoundAt = 0;
  function onEvent(ev) {
    const now = performance.now();
    if (ev.type === 'drop' && ev.ball) { trackBall(ev.ball); if (ev.ball.gold) audio.play('gold'); else audio.play('drop'); }
    if (ev.type === 'land') {
      const G = geometry(state?.rows ?? 12);
      const x = CX + (ev.slot - G.rows / 2) * G.dx;
      slotFlash.set(ev.slot, { at: now });
      spawnText(x, SLOT_TOP - 20, '+' + ev.points, ev.gold ? '#fde047' : '#fff', ev.jackpot ? 70 : ev.gold ? 54 : 40);
      if (ev.jackpot) {
        spawnBurst(x, SLOT_TOP, ['#facc15', '#fff', '#f97316'], 40);
        feed(`💰 ${tag(ev)} trúng JACKPOT +${ev.points}!`, 'jackpot');
        audio.play('jackpot');
      } else {
        if (ev.multiplier >= 5 || ev.gold) spawnBurst(x, SLOT_TOP, ev.gold ? ['#fde047', '#fbbf24'] : ['#f472b6', '#c084fc'], 14);
        if (ev.multiplier >= 10 || (ev.gold && ev.multiplier >= 2)) feed(`${ev.gold ? '🟡' : '✨'} ${tag(ev)} ×${ev.multiplier} +${ev.points}`, 'gold');
        if (now - landSoundAt > 60) { landSoundAt = now; audio.play('land', ev.multiplier); }
      }
    }
    if (ev.type === 'gift') feed(`🎁 ${tag(ev)} thả ${ev.balls} bi vàng!`, 'gold');
    if (ev.type === 'join' && !ev.bot) { feed(`👋 ${tag(ev)} vào chơi`, 'join'); audio.play('join'); }
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
      if (m.type === 'audio-test') audio.play('jackpot');
    };
    socket.onclose = () => { $('connection').hidden = false; clearTimeout(retry); retry = setTimeout(connect, 2000); };
    socket.onerror = () => socket.close();
  }
  connect();
})();
