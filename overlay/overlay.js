(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const params = new URLSearchParams(location.search);
  const isPreview = params.get('mute') === '1';
  let paused = false; // tạm dừng toàn bộ cảnh (bấm từ app)
  if (params.get('safe') === '1') document.body.classList.add('show-safe'); // lưới vùng bị TikTok che // khung xem trước trong app có thể tắt tiếng

  let cfg = {
    showChat: true, showGifts: true, showFollows: true, showShares: true, showJoins: false,
    showLikeCounter: true, showViewerCounter: true, showTopGifter: true,
    background: 'transparent', accent: '#3b82f6', chatDuration: 4.5, maxCards: 6,
    bigGiftDiamonds: 30, sound: true, volume: 0.7, chatSound: false,
    customGiftSound: '', customChatSound: '', customJumpscare: '', filterWords: '',
    mode: 'game', roundEvery: 3, bots: true, chuaName: '', chuaVoice: true, chuaRate: 1, chuaLikeGoal: 666, chuaMusic: true, chuaMusicVolume: 0.45, chuaGreet: true, rapName: '', rapVoice: true, rapGreet: true, rapRate: 1, rapVolume: 0.8, rapLikeGoal: 500, rapVideos: [], rapIndex: 0, rapLoop: true, rapTheme: 'classic', rapLightsOff: false, rapIdleMin: 0, ambient: true, ambientVolume: 0.5, ambientPreset: 'drone',
    customScareSound: '', customAmbient: '', tutorialEvery: 2
  };

  // ---------- Scale sân khấu 1080x1920 cho vừa khung ----------
  function fit() {
    const s = Math.min(innerWidth / 1080, innerHeight / 1920);
    stage.style.transform = `translate(${(innerWidth - 1080 * s) / 2}px, ${(innerHeight - 1920 * s) / 2}px) scale(${s})`;
  }
  addEventListener('resize', fit);
  fit();

  // ---------- Tiện ích DOM an toàn (không dùng innerHTML với dữ liệu người xem) ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  const GHOST_SVG = (hue = 90) => `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="g${hue}" cx="50%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#ffffff"/><stop offset="70%" stop-color="hsl(${hue},60%,88%)"/><stop offset="100%" stop-color="hsl(${hue},40%,70%)"/>
      </radialGradient></defs>
      <path d="M50 6C29 6 16 22 16 44v44l9-7 8 8 9-8 8 8 8-8 9 8 8-8 9 7V44C84 22 71 6 50 6z" fill="url(#g${hue})"/>
      <ellipse cx="38" cy="42" rx="6" ry="9" fill="#111"/><ellipse cx="62" cy="42" rx="6" ry="9" fill="#111"/>
      <ellipse cx="50" cy="62" rx="7" ry="9" fill="#222"/>
      <circle cx="36" cy="39" r="2" fill="#fff"/><circle cx="60" cy="39" r="2" fill="#fff"/>
    </svg>`;

  function svgNode(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function avatar(url, cls = 'ava') {
    if (typeof url === 'string' && url.startsWith('https://')) {
      const img = el('img');
      img.referrerPolicy = 'no-referrer';
      img.src = url;
      img.onerror = () => img.replaceWith(ghostAva(cls));
      return img;
    }
    return ghostAva(cls);
  }
  function ghostAva(cls) {
    const d = el('div', cls);
    d.style.cssText = 'display:flex;align-items:center;justify-content:center;background:#141a20;border-radius:50%;overflow:hidden';
    const s = svgNode(GHOST_SVG(Math.floor(Math.random() * 360)));
    s.style.cssText = 'width:78%;height:78%';
    d.appendChild(s);
    return d;
  }

  const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

  function bump(node) {
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
  }

  function blocked(text) {
    const words = cfg.filterWords.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
    if (!words.length) return false;
    const t = String(text || '').toLowerCase();
    return words.some((w) => t.includes(w));
  }

  // ---------- Âm thanh: tự tổng hợp bằng WebAudio, hoặc file tuỳ chỉnh ----------


  // Màn hình jumpscare
  let noiseRaf = 0;
  let lastFaceKey = '';
  function runJumpscare(text) {
    const el = $('g-jumpscare');
    const img = el.querySelector('img.js-media');
    const vid = el.querySelector('video.js-media');
    el.classList.remove('on', 'custom', 'img', 'vid');
    const custom = cfg.customJumpscare;
    const isVid = /\.(mp4|webm|mov)$/i.test(custom || '');
    if (custom) {
      const src = '/media/jumpscare?v=' + encodeURIComponent(custom);
      el.classList.add('custom', isVid ? 'vid' : 'img');
      if (isVid) {
        if (!vid.src.endsWith(src)) vid.src = src;
        vid.currentTime = 0;
        vid.muted = !cfg.sound || isPreview;
        vid.volume = cfg.volume;
        vid.play().catch(() => {});
      } else if (!img.src.endsWith(src)) img.src = src;
    }
    const face = window.ScareFaces.pick();
    lastFaceKey = face.key;
    el.querySelector('.js-face').innerHTML = face.svg; // SVG tĩnh trong faces.js
    el.querySelector('.js-text').textContent = text ? `${face.title}\n${text}` : face.title;
    void el.offsetWidth;
    el.classList.add('on');
    if (!(custom && isVid)) gameSfx.jumpscare(lastFaceKey);
    // nhiễu sóng TV
    const nc = el.querySelector('.js-noise');
    const n2 = nc.getContext('2d');
    const imgData = n2.createImageData(nc.width, nc.height);
    const end = performance.now() + 2400;
    cancelAnimationFrame(noiseRaf);
    const frame = () => {
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 255;
        d[i] = v; d[i + 1] = v * 0.9; d[i + 2] = v * 0.9; d[i + 3] = 255;
      }
      n2.putImageData(imgData, 0, 0);
      if (performance.now() < end) noiseRaf = requestAnimationFrame(frame);
      else { vid.pause(); el.classList.remove('on'); }
    };
    frame();
  }

  // Ma ló mặt bất ngờ (ở mép màn hình, cửa sổ nhà ma hoặc từ dưới lên)
  let peekBusy = false;
  function runPeek() {
    if (peekBusy) return;
    peekBusy = true;
    const el = $('g-peek');
    const pos = ['left', 'right', 'window', 'bottom'][Math.floor(Math.random() * 4)];
    el.className = '';
    el.querySelector('.pk-face').innerHTML = window.ScareFaces.pick().svg;
    void el.offsetWidth;
    el.className = 'on ' + pos;
    gameSfx[['whisper', 'childLaugh', 'creak', 'wail'][Math.floor(Math.random() * 4)]]();
    setTimeout(() => { el.className = ''; peekBusy = false; }, 1900);
  }

  // Thanh lệnh dòng 2 luân phiên giới thiệu lệnh khác
  // mỗi lần chỉ giới thiệu 1 lệnh phụ, chữ to cho dễ đọc trên điện thoại
  const ROT = [
    [['bùa', 'đóng băng người khác']],
    [['gọi hồn', 'gọi ma hiện về']],
    [['tắt đèn', 'cúp điện cả nhà']],
    [['ôm', 'ôm một con ma']],
    [['nhảy', 'nhảy múa · cười · khóc']],
    [['🎁', 'quà lớn gọi BÀ MA']]
  ];
  let rotIdx = 0;
  function rotateCmds() {
    const row = $('cmd-rot');
    row.classList.add('swap');
    setTimeout(() => {
      row.replaceChildren(...ROT[rotIdx].map(([k, d]) => {
        const c = el('div', 'cmd' + (k === '🎁' ? ' gift' : ''));
        c.append(el('span', 'key', k), d);
        return c;
      }));
      row.classList.remove('swap');
      rotIdx = (rotIdx + 1) % ROT.length;
    }, 400);
  }
  rotateCmds();
  setInterval(rotateCmds, 6000);

  // Âm thanh trò chơi: dùng bộ âm thanh HauntAudio, riêng tiếng bị hù có thể thay bằng file
  window.HauntAudio.init(() => cfg, isPreview);
  const gameSfx = new Proxy({}, {
    get: (_t, name) => (...args) => {
      if (name === 'scream' && cfg.customScareSound) return play('scare', () => window.HauntAudio.play('scream', ...args));
      window.HauntAudio.play(name, ...args);
    }
  });

  // Nhạc nền tuỳ chọn (file của bạn) thay cho nhạc nền tự tạo
  const ambientEl = new Audio();
  ambientEl.loop = true;
  function syncAmbientFile() {
    const want = !['chua', 'trada', 'nhau'].includes(cfg.mode) && cfg.customAmbient && cfg.ambient && cfg.sound && !isPreview;
    if (want) {
      const src = '/media/ambient?v=' + encodeURIComponent(cfg.customAmbient);
      if (!ambientEl.src.endsWith(src)) ambientEl.src = src;
      ambientEl.volume = cfg.volume * cfg.ambientVolume;
      ambientEl.play().catch(() => {});
    } else ambientEl.pause();
  }

  // Bảng CÁCH CHƠI
  const HOWTO = [
    ['👻', 'hù', 'Hù một con ma khác', '+1 điểm · gõ “hù tên” để hù đúng người'],
    ['🤫', 'trốn', 'Nấp sau mộ, cây, quan tài', 'Bà Ma đi tìm sẽ không thấy bạn'],
    ['🔦', 'tìm', 'Soi đèn pin tìm ma đang trốn', '+2 điểm mỗi con tìm ra'],
    ['📜', 'bùa', 'Dán bùa đóng băng người khác', 'gõ “bùa tên” để chọn người'],
    ['🕯️', 'gọi hồn', 'Gọi một con ma hiện về', 'cả phòng sẽ giật mình'],
    ['🌑', 'tắt đèn', 'Cúp điện cả nhà ma', 'chỉ còn những đôi mắt đỏ…'],
    ['💃', 'nhảy', 'Cho con ma của bạn nhảy múa', 'Còn có: “cười” · “khóc” · “ôm tên” · “chạy”'],
    ['🎁', 'Tặng quà', 'Nhận bùa hộ mệnh, không ai hù được', 'Quà lớn: triệu hồi BÀ MA bắt cả phòng!']
  ];
  // Thẻ CÁCH CHƠI: mỗi lần 1 lệnh, tự chuyển, tự ẩn khi có quà / thông báo lớn
  let howtoTimer = 0;
  let howtoIdx = 0;
  function showHowto() {
    // không hiện thẻ to giữa màn hình nữa: chỉ cho khung hướng dẫn bên phải nháy sáng gây chú ý
    const box = $('g-cmd');
    box.classList.remove('pulse');
    void box.offsetWidth;
    box.classList.add('pulse');
    clearTimeout(howtoTimer);
    howtoTimer = setTimeout(() => box.classList.remove('pulse'), 6000);
  }


  const fileSounds = {};
  function play(kind, fallback) {
    if (!cfg.sound || isPreview) return;
    const custom = kind === 'gift' ? cfg.customGiftSound : kind === 'chat' ? cfg.customChatSound : '';
    if (custom) {
      const a = (fileSounds[kind] ||= new Audio());
      const src = `/media/${kind}?v=${encodeURIComponent(custom)}`;
      if (!a.src.endsWith(src)) a.src = src;
      a.volume = cfg.volume;
      a.currentTime = 0;
      a.play().catch(() => fallback && fallback());
      return;
    }
    try { fallback && fallback(); } catch { /* audio chưa được phép */ }
  }

  // ---------- Thẻ chat ----------
  const chatZone = $('chat-zone');
  const chatQueue = [];
  let lane = 0;

  function queueChat(ev) {
    chatQueue.push(ev);
    if (chatQueue.length > 40) chatQueue.splice(0, chatQueue.length - 40); // chống spam
    pumpChat();
  }

  // Giãn cách nhẹ khi chat dồn dập để mắt kịp đọc
  let lastSpawn = 0;
  let pumpTimer = 0;
  function pumpChat() {
    clearTimeout(pumpTimer);
    if (!chatQueue.length) return;
    const wait = lastSpawn + 350 - Date.now();
    if (wait > 0) { pumpTimer = setTimeout(pumpChat, wait); return; }
    lastSpawn = Date.now();
    showChat(chatQueue.shift());
    if (chatQueue.length) pumpTimer = setTimeout(pumpChat, 350);
  }

  function dismiss(card) {
    if (card.classList.contains('out')) return;
    clearTimeout(card._timer);
    card.classList.add('out');
    card.addEventListener('animationend', () => card.remove(), { once: true });
    setTimeout(() => card.remove(), 900);
  }

  const scale = () => stage.getBoundingClientRect().width / 1080 || 1;

  function showChat(ev) {
    const card = el('div', 'ghost-card');
    const wrap = el('div', 'avatar-wrap');
    wrap.appendChild(avatar(ev.user?.avatar));
    const body = el('div', 'body');
    body.appendChild(el('div', 'name', ev.user?.nickname || 'Ẩn danh'));
    body.appendChild(el('div', 'msg', ev.text));
    card.append(wrap, body);

    const lanes = [0, 70, 20, 110, 45];
    lane = (lane + 1) % lanes.length;
    card.style.marginLeft = lanes[lane] + 'px';

    // FLIP: ghi lại vị trí thẻ cũ -> thêm thẻ mới -> trượt thẻ cũ lên mượt mà
    const olds = [...chatZone.children];
    const before = olds.map((n) => n.getBoundingClientRect().top);
    chatZone.appendChild(card);
    const sc = scale();
    olds.forEach((n, i) => {
      const dy = (before[i] - n.getBoundingClientRect().top) / sc;
      if (dy) n.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
    });

    // Quá số thẻ tối đa -> thẻ cũ nhất tan biến
    const alive = [...chatZone.children].filter((n) => !n.classList.contains('out'));
    alive.slice(0, Math.max(0, alive.length - cfg.maxCards)).forEach(dismiss);

    card._timer = setTimeout(() => dismiss(card), cfg.chatDuration * 1000);
    if (cfg.chatSound) play('chat', () => window.HauntAudio.play('pop'));
  }

  // ---------- Quà ----------
  const giftZone = $('gift-zone');
  const giftQueue = [];
  let giftBusy = false;

  function queueGift(ev) {
    giftQueue.push(ev);
    if (giftQueue.length > 25) giftQueue.splice(0, giftQueue.length - 25);
    if (!giftBusy) nextGift();
  }

  function nextGift() {
    const ev = giftQueue.shift();
    if (!ev) { giftBusy = false; return; }
    giftBusy = true;
    const big = Number(ev.total || 0) >= cfg.bigGiftDiamonds && cfg.bigGiftDiamonds > 0;
    const hold = big ? 4.8 : Math.max(2.2, 3.6 - giftQueue.length * 0.4);

    const box = el('div', 'gift-alert' + (big ? ' big' : ''));
    box.style.setProperty('--hold', hold + 's');
    const visual = el('div', 'g-visual');
    if (ev.giftImage && ev.giftImage.startsWith('https://')) {
      const img = el('img');
      img.src = ev.giftImage;
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => img.replaceWith(svgNode(GHOST_SVG(big ? 48 : 350)));
      visual.appendChild(img);
    } else {
      visual.appendChild(svgNode(GHOST_SVG(big ? 48 : 350)));
    }
    const user = el('div', 'g-user');
    user.append(avatar(ev.user?.avatar), el('div', 'g-name', ev.user?.nickname || 'Ẩn danh'));
    const text = el('div', 'g-text');
    text.append('đã triệu hồi ', el('b', null, ev.giftName || 'Quà'));
    box.append(visual, user, text);
    if (ev.repeatCount > 1) box.appendChild(el('div', 'g-count', 'x' + ev.repeatCount));
    if (ev.total) box.appendChild(el('div', 'g-coins', `+${fmt(ev.total)} 💎`));
    giftZone.appendChild(box);

    if (big) {
      stage.classList.remove('shake');
      void stage.offsetWidth;
      stage.classList.add('shake');
      const flash = el('div', 'flash');
      giftZone.appendChild(flash);
      setTimeout(() => flash.remove(), 1300);
      spiritBurst(14);
      play('gift', () => { window.HauntAudio.play('gong'); window.HauntAudio.play('bellToll', 2); });
    } else {
      spiritBurst(4);
      play('gift', () => window.HauntAudio.play('gong'));
    }

    setTimeout(() => {
      box.remove();
      nextGift();
    }, (hold + 0.6) * 1000);
  }

  function spiritBurst(n) {
    for (let i = 0; i < n; i++) {
      const s = svgNode(GHOST_SVG(Math.floor(Math.random() * 360)));
      const wrap = el('div', 'spirit');
      wrap.appendChild(s);
      const ang = Math.random() * Math.PI * 2;
      const dist = 350 + Math.random() * 450;
      wrap.style.left = 540 - 60 + 'px';
      wrap.style.top = 700 + 'px';
      wrap.style.setProperty('--tx', Math.cos(ang) * dist + 'px');
      wrap.style.setProperty('--ty', Math.sin(ang) * dist - 200 + 'px');
      wrap.style.setProperty('--s', (0.6 + Math.random()).toFixed(2));
      wrap.style.setProperty('--r', (Math.random() * 60 - 30).toFixed(0) + 'deg');
      wrap.style.setProperty('--d', (2.2 + Math.random() * 1.6).toFixed(2) + 's');
      giftZone.appendChild(wrap);
      setTimeout(() => wrap.remove(), 4000);
    }
  }

  // Combo quà đang bấm liên tục
  const streakZone = $('streak-zone');
  const streaks = new Map();
  function showStreak(ev) {
    const key = (ev.user?.id || ev.user?.nickname) + ':' + ev.giftName;
    let s = streaks.get(key);
    if (!s) {
      const node = el('div', 'streak');
      const count = el('span', 'count');
      const gimg = ev.giftImage?.startsWith('https://') ? Object.assign(el('img', 'gimg'), { src: ev.giftImage, referrerPolicy: 'no-referrer' }) : el('span', null, '🎁');
      node.append(avatar(ev.user?.avatar), el('span', null, `${ev.user?.nickname || 'Ẩn danh'} · ${ev.giftName}`), gimg, count);
      streakZone.appendChild(node);
      s = { node, count, timer: 0 };
      streaks.set(key, s);
      while (streakZone.children.length > 4) streakZone.firstChild.remove();
    }
    s.count.textContent = 'x' + ev.repeatCount;
    s.node.classList.remove('pop');
    void s.node.offsetWidth;
    s.node.classList.add('pop');
    clearTimeout(s.timer);
    s.timer = setTimeout(() => {
      s.node.style.opacity = '0';
      setTimeout(() => s.node.remove(), 400);
      streaks.delete(key);
    }, 3500);
  }

  // ---------- Toast ----------
  const toasts = $('toasts');
  function toast(kind, ev, label) {
    const t = el('div', 'toast ' + kind);
    const txt = el('span');
    txt.append(el('b', null, ev.user?.nickname || 'Ẩn danh'), ' ' + label);
    t.append(avatar(ev.user?.avatar), txt);
    toasts.appendChild(t);
    while (toasts.children.length > 2) toasts.firstChild.remove();
    setTimeout(() => t.remove(), 3800);
  }

  // ---------- HUD ----------
  let accentRgb = '59, 130, 246';
  let lastLikes = -1;
  let lastViewers = -1;
  let lastTop = '';
  function updateStats(s) {
    if (!s) return;
    if (s.likes !== lastLikes) {
      $('likes').textContent = fmt(s.likes);
      if (lastLikes >= 0) bump($('pill-likes'));
      lastLikes = s.likes;
    }
    if (s.viewers !== lastViewers) {
      $('viewers').textContent = fmt(s.viewers);
      lastViewers = s.viewers;
    }
    const top = s.topGifters?.[0];
    const tg = $('top-gifter');
    if (top && cfg.showTopGifter) {
      tg.classList.remove('hidden');
      $('tg-name').textContent = top.nickname;
      $('tg-coins').textContent = fmt(top.diamonds);
      const key = top.id + top.avatar;
      if (key !== lastTop) {
        lastTop = key;
        const a = $('tg-avatar');
        if (top.avatar?.startsWith('https://')) { a.src = top.avatar; a.referrerPolicy = 'no-referrer'; } else a.removeAttribute('src');
      }
    } else {
      tg.classList.add('hidden');
    }
  }

  function applyConfig(next) {
    cfg = { ...cfg, ...next };
    const hex = cfg.accent.replace('#', '');
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
    document.documentElement.style.setProperty('--accent', cfg.accent);
    document.documentElement.style.setProperty('--accent-rgb', rgb);
    accentRgb = rgb;
    document.body.classList.toggle('haunted', cfg.background === 'haunted');
    document.body.classList.toggle('game', cfg.mode === 'game');
    document.body.classList.toggle('mode-chua', cfg.mode === 'chua');
    document.body.classList.toggle('mode-rap', cfg.mode === 'rap');
    document.body.classList.toggle('mode-quan', cfg.mode === 'trada' || cfg.mode === 'nhau');
    // Bù màu: TikTok nén video làm màu nhạt và tối đi, tăng nhẹ độ tươi / tương phản / sáng
    const b = Math.max(0, Math.min(40, Number(cfg.liveBoost ?? 15))) / 100;
    stage.style.filter = b ? `saturate(${(1 + b).toFixed(3)}) contrast(${(1 + b * 0.3).toFixed(3)}) brightness(${(1 + b * 0.25).toFixed(3)})` : '';
    window.HauntGame.setConfig(cfg);
    window.TempleScene.setConfig(cfg);
    window.RapScene.setConfig(cfg);
    window.TraDaScene.setConfig(cfg);
    window.NhauScene.setConfig(cfg);
    window.HauntAudio.update();
    syncAmbientFile();
    ensureFx();
    $('pill-likes').style.display = cfg.showLikeCounter ? '' : 'none';
    $('pill-viewers').style.display = cfg.showViewerCounter ? '' : 'none';
    if (!cfg.showTopGifter) $('top-gifter').classList.add('hidden');
    pumpChat();
  }

  // ---------- Hạt linh hồn bay lơ lửng trên nền ----------
  const canvas = $('fx');
  const c2d = canvas.getContext('2d');
  canvas.width = 1080;
  canvas.height = 1920;
  const motes = Array.from({ length: 60 }, () => ({
    x: Math.random() * 1080, y: Math.random() * 1920,
    r: 1 + Math.random() * 3.5, v: 0.2 + Math.random() * 0.7, p: Math.random() * Math.PI * 2
  }));
  // Lớp hạt bụi chỉ dùng ở chế độ thẻ bình luận + nền nhà ma; còn lại tắt hẳn
  let fxRaf = 0;
  const fxNeeded = () => !paused && cfg.mode !== 'game' && cfg.background === 'haunted';
  function ensureFx() { if (!fxRaf && fxNeeded()) fxRaf = requestAnimationFrame(drawFx); }
  function drawFx() {
    fxRaf = 0;
    if (!fxNeeded()) return;
    fxRaf = requestAnimationFrame(drawFx);
    c2d.clearRect(0, 0, 1080, 1920);
    for (const m of motes) {
      m.y -= m.v;
      m.p += 0.02;
      if (m.y < -10) { m.y = 1930; m.x = Math.random() * 1080; }
      const x = m.x + Math.sin(m.p) * 14;
      const a = 0.35 + Math.sin(m.p * 1.7) * 0.25;
      c2d.beginPath();
      c2d.fillStyle = `rgba(${accentRgb}, ${a})`;
      c2d.arc(x, m.y, m.r, 0, Math.PI * 2);
      c2d.fill();
    }
  }
  ensureFx();

  // ---------- Tạm dừng / chạy tiếp ----------
  function setPausedAll(p) {
    if (p === paused) return;
    paused = p;
    document.body.classList.toggle('paused', p);
    window.HauntGame.setPaused(p);
    window.TempleScene.setPaused(p);
    window.RapScene.setPaused(p);
    window.TraDaScene.setPaused(p);
    window.NhauScene.setPaused(p);
    window.HauntAudio.setPaused(p);
    if (p) ambientEl.pause(); else syncAmbientFile();
    ensureFx();
    document.querySelectorAll('video').forEach((v) => p && v.pause());
  }

  // ---------- Trò chơi Nhà Ma ----------
  window.HauntGame.init({
    canvas: $('game'),
    sfx: gameSfx,
    ui: {
      root: $('game-ui'), board: $('g-board'), feed: $('g-feed'),
      banner: $('g-banner'), onJumpscare: (t) => runJumpscare(t), onPeek: () => runPeek(), onHowto: () => showHowto()
    }
  });

  // ---------- Đi Chùa ----------
  window.TempleScene.init({
    canvas: $('temple'),
    sfx: {
      mo: (n) => window.HauntAudio.play('mo', n),
      bell: () => window.HauntAudio.play('gong'),
      duck: (d) => window.HauntAudio.duck(d),
      muted: () => !cfg.sound || isPreview
    },
    ui: {
      root: $('temple-ui'),
      title: document.querySelector('.t-title'),
      likeFill: document.querySelector('.t-like-fill'),
      likeText: document.querySelector('.t-like-text'),
      board: document.querySelector('.tb-list'),
      boardEmpty: document.querySelector('.tb-empty'),
      plate: document.querySelector('.t-plate'),
      caption: document.querySelector('.t-caption')
    }
  });

  // ---------- Rạp Phim Online ----------
  window.RapScene.init({
    canvas: $('rap'),
    sfx: { play: (n, a) => window.HauntAudio.play(n, a), muted: () => !cfg.sound || isPreview },
    ui: {
      root: $('rap-ui'),
      title: document.querySelector('.r-title'),
      now: document.querySelector('.r-now'),
      likeFill: document.querySelector('.r-like-fill'),
      likeText: document.querySelector('.r-like-text'),
      board: document.querySelector('.rb-list'),
      boardEmpty: document.querySelector('.rb-empty'),
      plate: document.querySelector('.r-plate'),
      caption: document.querySelector('.r-caption')
    }
  });

  // ---------- Trà Đá Vỉa Hè & Đi Nhậu (chung engine quan.js) ----------
  const quanSfx = {
    play: (n, ...a) => window.HauntAudio.play(n, ...a),
    duck: (d) => window.HauntAudio.duck(d),
    muted: () => !cfg.sound || isPreview
  };
  window.TraDaScene.init({ stage, before: $('hud'), sfx: quanSfx });
  window.NhauScene.init({ stage, before: $('hud'), sfx: quanSfx });

  // ---------- Kết nối tới app MyStudioLive ----------
  const socket = io({ reconnectionDelayMax: 3000 });
  socket.on('connect', () => $('offline').classList.add('hidden'));
  socket.on('disconnect', () => $('offline').classList.remove('hidden'));
  socket.on('config', applyConfig);
  socket.on('stats', (st) => { updateStats(st); window.HauntGame.onStats(st); window.TempleScene.onStats(st); window.RapScene.onStats(st); window.TraDaScene.onStats(st); window.NhauScene.onStats(st); });
  socket.on('game', (a) => window.HauntGame.command(a));
  socket.on('reload', () => location.reload());

  // Khung xem trong app: báo "còn sống" mỗi giây để app tự tải lại nếu khung bị treo/đen
  if (window.parent !== window) {
    setInterval(() => { try { window.parent.postMessage({ studioAlive: true }, '*'); } catch { /* bỏ qua */ } }, 1000);
  }
  // Card đồ hoạ mất ngữ cảnh (thu nhỏ cửa sổ, đổi màn hình, máy ngủ dậy…) -> canvas đen: tải lại trang
  document.querySelectorAll('canvas').forEach((c) => c.addEventListener('contextlost', () => setTimeout(() => location.reload(), 300)));
  socket.on('pause', (p) => setPausedAll(!!p));
  socket.on('chua', (c) => window.TempleScene.command(c));
  socket.on('rap', (c) => window.RapScene.command(c));
  socket.on('trada', (c) => window.TraDaScene.command(c));
  socket.on('nhau', (c) => window.NhauScene.command(c));

  socket.on('live', (ev) => {
    if (!ev || !ev.type || paused) return; // đang tạm dừng: bỏ qua sự kiện
    if (cfg.mode === 'rap') {
      if (ev.type === 'chat' && blocked(ev.text)) return;
      window.RapScene.onEvent(ev);
      return;
    }
    if (cfg.mode === 'trada' || cfg.mode === 'nhau') {
      if (ev.type === 'chat' && blocked(ev.text)) return;
      (cfg.mode === 'trada' ? window.TraDaScene : window.NhauScene).onEvent(ev);
      return;
    }
    if (cfg.mode === 'chua') {
      if (ev.type === 'chat' && blocked(ev.text)) return;
      window.TempleScene.onEvent(ev);
      return;
    }
    const game = cfg.mode === 'game';
    if (game) {
      if (ev.type === 'chat' && (blocked(ev.text) || blocked(ev.user?.nickname))) return;
      const show = { chat: cfg.showChat, join: true, follow: cfg.showFollows, share: cfg.showShares, gift: cfg.showGifts }[ev.type];
      if (show) window.HauntGame.onEvent(ev);
      if (ev.type === 'gift' && cfg.showGifts) {
        const big = cfg.bigGiftDiamonds > 0 && Number(ev.total || 0) >= cfg.bigGiftDiamonds;
        setTimeout(() => queueGift(ev), big ? 1700 : 0);
      }
      if (ev.type === 'giftStreak' && cfg.showGifts) showStreak(ev);
      return;
    }
    switch (ev.type) {
      case 'chat':
        if (cfg.showChat && !blocked(ev.text) && !blocked(ev.user?.nickname)) queueChat(ev);
        break;
      case 'gift':
        if (cfg.showGifts) queueGift(ev);
        break;
      case 'giftStreak':
        if (cfg.showGifts) showStreak(ev);
        break;
      case 'follow':
        if (cfg.showFollows) { toast('follow', ev, 'đã theo dõi 💜'); play('follow', () => window.HauntAudio.play('chime')); }
        break;
      case 'share':
        if (cfg.showShares) toast('share', ev, 'đã chia sẻ live 🔗');
        break;
      case 'join':
        if (cfg.showJoins) toast('join', ev, 'vừa bước vào nhà ma 👻');
        break;
    }
  });
})();
