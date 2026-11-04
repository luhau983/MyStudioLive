/*
 * ĐI CHÙA ONLINE — không gian thư giãn tương tác cho MyStudioLive.
 * Hình ảnh chánh điện, nhân vật, hiệu ứng và nhạc nền lấy từ dự án "Chánh Điện Online" (MIT; ảnh tạo bằng Google Flow,
 * nhạc tạo bằng Gemini — xem README dự án gốc trước khi dùng thương mại).
 *
 * Người xem vào phòng / bình luận -> đi vào chánh điện, ngồi bồ đoàn đọc kinh.
 * Gõ "adidaphat" -> đi lên bàn thờ, quỳ lạy, thắp hương rồi về chỗ (tối đa 5 người, mỗi người 1 lần/phút).
 * Gõ đúng một từ nam / nữ / bà / sư / ni / tiểu -> đổi nhân vật.
 * Tặng quà -> máy quay áp sát, bảng tên, sen vàng, cánh sen rơi, giọng đọc cảm ơn.
 * Đủ số tim -> mưa hoa sen 60 giây. Bảng TOP THÀNH TÂM: 1 điểm/bình luận, 10 điểm/kim cương.
 */
(() => {
  'use strict';

  const W = 1080;
  const H = 1920;
  // Dời cả cảnh lên: phần trần nhà vốn bị thanh trên của TikTok che, hàng bồ đoàn dưới thoát khỏi vùng bình luận
  const SCENE_DY = -190;
  const FRAME_MS = 1000 / 30;
  const BASE = 'chua-assets/';
  const ALTAR = { x: 540, y: 965 };                 // lư hương trên bàn thờ trong ảnh nền
  const AISLE_X = 540;
  const OFFER_COOLDOWN = 60 * 1000;
  const RAIN_MS = 60 * 1000;
  const SEAT_AFTER_JOIN_MS = 6000;

  // Dải hình động 8 khung: 0-3 đi bộ, 4 đứng, 5-6 quỳ xuống, 7 ngồi đọc kinh
  const ANIM = { man: { fw: 212, fh: 300, seatH: 210 }, woman: { fw: 212, fh: 300, seatH: 220 }, granny: { fw: 195, fh: 300, seatH: 222 } };
  const TORSO = { man: 172, woman: 175, granny: 178 };
  const SKIN_WORDS = { nam: 'man', 'nữ': 'woman', nu: 'woman', 'bà': 'granny', ba: 'granny', 'sư': 'monk', su: 'monk', ni: 'nun', 'tiểu': 'child', tieu: 'child' };

  const BLESSINGS = [
    'Chúc bạn và gia đình luôn mạnh khỏe, bình an.',
    'Chúc bạn một ngày nhẹ nhàng, tâm luôn an vui.',
    'Chúc mọi điều tốt lành sẽ đến với bạn.',
    'Chúc bạn công việc suôn sẻ, gia đạo êm ấm.',
    'Chúc bạn ngủ ngon và luôn bình yên trong lòng.',
    'Chúc bạn gặp nhiều may mắn và niềm vui.',
    'Chúc bạn sức khỏe dồi dào, vạn sự như ý.',
    'Chúc bạn luôn được yêu thương và che chở.'
  ];
  const WISHES = [
    [/thi|đỗ|đậu|học/, 'Chúc {n} học hành tấn tới, thi cử đỗ đạt như ý.'],
    [/sức khỏe|sức khoẻ|ốm|bệnh|khỏe|khoẻ|đau/, 'Chúc {n} và người thân mau khỏe, luôn mạnh khỏe bình an.'],
    [/tình duyên|người yêu|người thương|cưới|vợ|chồng|crush/, 'Chúc {n} sớm gặp được người thương, tình cảm êm đẹp.'],
    [/công việc|việc làm|xin việc|thăng chức/, 'Chúc {n} công việc thuận lợi, mọi việc hanh thông.'],
    [/tiền|làm ăn|buôn bán|kinh doanh|giàu|tài lộc/, 'Chúc {n} làm ăn thuận lợi, an tâm vững vàng.'],
    [/gia đình|bố|mẹ|ba|má|con/, 'Chúc gia đình {n} luôn đầm ấm, hạnh phúc.'],
    [/bình an|an lành|bình yên|buồn|mệt|stress/, 'Chúc {n} lòng nhẹ nhàng, mọi muộn phiền sớm qua.']
  ];

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // ---------------- Hình ảnh ----------------
  const IMG = {};
  ['hall', 'c_man', 'c_woman', 'c_granny', 'c_monk', 'c_nun', 'c_child', 'anim_man', 'anim_woman', 'anim_granny',
    'fx_lotus', 'fx_halo', 'fx_bell', 'fx_incense', 'fx_petal', 'fx_mo'].forEach((k) => {
    const im = new Image();
    im.src = BASE + k + (k === 'hall' ? '.jpg' : '.png');
    IMG[k] = im;
  });
  const ok = (im) => im && im.complete && im.naturalWidth > 0;
  const hasAnim = (skin) => ANIM[skin] && ok(IMG['anim_' + skin]);

  let cv, g, ui, sfx, cfg = {};
  let enabled = false;
  let pauseAt = 0;
  let pausedMs = 0;
  const clock = () => (pauseAt || performance.now()) - pausedMs;
  let last = 0;

  // ---------------- Chỗ ngồi: đúng 16 bồ đoàn vẽ trong ảnh nền ----------------
  // [x tâm, y mép dưới, bề ngang] đo trực tiếp trên hall.jpg, xếp từ hàng trên (gần bàn thờ) xuống
  // Thứ tự ngồi: các chỗ nằm trong vùng an toàn TikTok trước; chỗ sát mép (bị cắt trên điện thoại dài)
  // và hàng cuối (bị bình luận che) chỉ dùng khi đông người
  const CUSHIONS = [
    [428, 1266, 100], [652, 1266, 100], [258, 1266, 100], [822, 1266, 100],
    [403, 1338, 122], [678, 1338, 122], [195, 1338, 120], [886, 1338, 122],
    [368, 1436, 148], [712, 1436, 150],
    [316, 1578, 188], [765, 1578, 188]
  ];
  const EXTRA = [[240, 1500], [840, 1500], [117, 1436], [963, 1436], [250, 1773], [832, 1773], [455, 1690], [625, 1690]];
  // tỉ lệ nhân vật theo chiều sâu, khớp với độ to của bồ đoàn trong ảnh
  const scaleAt = (y) => clamp(0.44 + (y - 1266) * 0.00117, 0.3, 1.15);
  const SEATS = [
    ...CUSHIONS.map(([x, y, w], i) => ({ x, y, s: w / 228, order: i, taken: null })),
    ...EXTRA.map(([x, y], i) => ({ x, y, s: scaleAt(y), order: 100 + i, taken: null }))
  ];
  const FRONT = [-150, -75, 0, 75, 150].map((dx) => ({ x: ALTAR.x + dx, y: 1205, busy: null }));
  // Nhìn về tượng Phật: hình gốc nghiêng sang phải, nên người ngồi bên phải lối đi được lật lại
  const facesLeft = (x) => x > AISLE_X + 10;

  const people = new Map();
  const avatars = new Map();
  const queue = [];
  const effects = [];
  const petals = [];
  let incenseUntil = 0;
  let spotlight = null;
  let rainUntil = 0;
  let likeBase = -1;
  let likeCount = 0;
  const zoom = { k: 1, x: W / 2, y: H / 2 };

  // ---------------- Nhạc nền (mp3) ----------------
  const TRACKS = [BASE + 'music1.mp3', BASE + 'music2.mp3'];
  let music = null;
  let trackIdx = Math.floor(Math.random() * TRACKS.length);
  let duck = false;
  function syncMusic() {
    const want = enabled && cfg.chuaMusic && cfg.sound !== false && !pauseAt && !sfx.muted();
    if (!want) { if (music) music.pause(); return; }
    if (!music) {
      music = new Audio(TRACKS[trackIdx]);
      music.addEventListener('ended', () => {
        trackIdx = (trackIdx + 1) % TRACKS.length;
        music.src = TRACKS[trackIdx];
        music.play().catch(() => {});
      });
    }
    music.volume = clamp((cfg.volume ?? 0.7) * (cfg.chuaMusicVolume ?? 0.45) * (duck ? 0.35 : 1), 0, 1);
    if (music.paused) music.play().catch(() => {});
  }

  // ---------------- Khởi tạo ----------------
  function init(opts) {
    cv = opts.canvas;
    cv.width = W;
    cv.height = H;
    g = cv.getContext('2d');
    ui = opts.ui;
    sfx = opts.sfx;
    last = clock();
    requestAnimationFrame(loop);
    setInterval(tick1s, 1000);
  }

  function setConfig(next) {
    cfg = next;
    const was = enabled;
    enabled = cfg.mode === 'chua';
    cv.style.display = enabled ? 'block' : 'none';
    ui.root.style.display = enabled ? 'block' : 'none';
    ui.title.textContent = channelName().toUpperCase();
    updateLikeBar();
    if (enabled && !was) lastSpeechAt = Date.now();
    if (!enabled) voice.stop();
    syncMusic();
  }

  const channelName = () => (cfg.chuaName || '').trim() || 'Tâm An';

  function setPaused(p) {
    if (p && !pauseAt) pauseAt = performance.now();
    else if (!p && pauseAt) {
      pausedMs += performance.now() - pauseAt;
      pauseAt = 0;
      last = clock();
      requestAnimationFrame(loop);
    }
    if (p) voice.stop();
    syncMusic();
  }

  // ---------------- Người xem ----------------
  function loadAvatar(url) {
    if (!url || !url.startsWith('https://')) return null;
    if (avatars.has(url)) return avatars.get(url);
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = url;
    avatars.set(url, img);
    return img;
  }

  const keyOf = (u) => String(u?.id || u?.uniqueId || u?.nickname || '');
  const randomSkin = () => pick(['man', 'woman', 'woman', 'man', 'granny']);

  function getPerson(user, create = true) {
    const k = keyOf(user);
    if (!k) return null;
    let p = people.get(k);
    if (!p && create) {
      const seat = pickSeat();
      if (!seat) return null;
      p = {
        key: k, name: cleanName(user?.nickname || 'Bạn'), img: loadAvatar(user?.avatar),
        skin: randomSkin(), seat, x: AISLE_X, y: H + 40, state: 'walk', after: 'sit',
        path: [{ x: AISLE_X, y: seat.y }, { x: seat.x, y: seat.y }],
        frame: 0, ft: 0, t0: clock(), fade: 0, phase: rnd(0, 6.28), bowAt: clock() + rnd(4000, 20000),
        points: 0, lastOffer: 0, active: Date.now(), spot: null, flip: false
      };
      seat.taken = p;
      if (!hasAnim(p.skin)) { p.state = 'sit'; p.x = seat.x; p.y = seat.y; }
      people.set(k, p);
    }
    if (p) {
      p.active = Date.now();
      if (user?.avatar && !p.img) p.img = loadAvatar(user.avatar);
    }
    return p;
  }

  // Hết chỗ: người im lặng lâu nhất (đang ngồi, không phải người đang được quay) nhường chỗ
  function pickSeat() {
    const free = SEATS.filter((s) => !s.taken).sort((a, b) => a.order - b.order)[0];
    if (free) return free;
    let oldest = null;
    for (const p of people.values()) {
      if (p.state !== 'sit' || p === spotlight?.p) continue;
      if (!oldest || p.active < oldest.active) oldest = p;
    }
    if (!oldest) return null;
    people.delete(oldest.key);
    oldest.seat.taken = null;
    return oldest.seat;
  }

  function cleanName(n) {
    let s = String(n).replace(/[\u0000-\u001f]/g, '').trim();
    const words = String(cfg.filterWords || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
    for (const w of words) if (s.toLowerCase().includes(w)) s = 'Bạn';
    return s.slice(0, 24) || 'Bạn';
  }

  // ---------------- Thắp hương ----------------
  function requestOffering(p, fromGift = false) {
    if (!p) return;
    const now = Date.now();
    if (!fromGift && now - p.lastOffer < OFFER_COOLDOWN) return;
    if (queue.includes(p) || p.spot) return;
    p.lastOffer = now;
    queue.push(p);
    pumpQueue();
  }

  function pumpQueue() {
    while (queue.length) {
      const free = FRONT.filter((f) => !f.busy);
      if (!free.length) return;
      const p = queue.shift();
      if (!people.has(p.key)) continue;
      const spot = p === spotlight?.p && !FRONT[2].busy ? FRONT[2] : free[Math.floor(free.length / 2)];
      spot.busy = p;
      p.spot = spot;
      if (hasAnim(p.skin)) {
        p.state = 'walk';
        p.after = 'offer';
        p.path = [{ x: AISLE_X, y: p.y }, { x: AISLE_X, y: spot.y + 20 }, { x: spot.x, y: spot.y }];
      } else {
        // nhân vật không có hình động: hiện mờ dần ở trước bàn thờ
        p.x = spot.x; p.y = spot.y; p.fade = 0;
        startOffer(p);
      }
    }
  }

  function startOffer(p) {
    p.state = 'offer';
    p.t0 = clock();
    p.lit = false;
    sfx.mo(1);
  }

  function finishOffer(p) {
    if (p.spot) p.spot.busy = null;
    p.spot = null;
    const s = p.seat;
    if (hasAnim(p.skin)) {
      p.state = 'walk';
      p.after = 'sit';
      p.path = [{ x: AISLE_X, y: p.y + 20 }, { x: AISLE_X, y: s.y }, { x: s.x, y: s.y }];
    } else {
      p.x = s.x; p.y = s.y; p.fade = 0; p.state = 'sit';
    }
    pumpQueue();
  }

  function lightIncense() {
    incenseUntil = Math.max(incenseUntil, clock()) + 20000;
    effects.push({ type: 'sprite', img: 'fx_incense', x: ALTAR.x, y: ALTAR.y - 40, s: 0.55, t0: clock(), dur: 2600, rise: 60, glow: true });
    burst(ALTAR.x, ALTAR.y - 40, '#fbbf24', 10);
  }

  // ---------------- Quà ----------------
  function onGift(ev) {
    const p = getPerson(ev.user);
    if (!p) return;
    const coins = Number(ev.total || ev.diamonds || 1);
    p.points += coins * 10;
    p.glowUntil = clock() + 8000;
    const tier = coins >= 99 ? 3 : coins >= 10 ? 2 : 1;
    const fx = tier >= 3 ? 'fx_bell' : tier >= 2 ? 'fx_lotus' : 'fx_incense';
    const ps = p.state === 'sit' ? p.seat.s : scaleAt(p.y);
    effects.push({ type: 'sprite', img: fx, x: p.x, y: p.y - 300 * ps, s: (0.5 + tier * 0.15) * ps, t0: clock(), dur: 4000, rise: 120 * ps, glow: true });
    // sen vàng trước tượng, quà càng lớn càng to
    effects.push({ type: 'lotus', t0: clock(), dur: 6500, size: clamp(0.8 + Math.log10(coins + 1) * 0.5, 0.8, 2) });
    petalBurst(Math.min(200, 25 + coins * 5), Math.min(12000, 4000 + coins * 250));
    if (!spotlight || clock() > spotlight.until - 2000) {
      spotlight = { p, t0: clock(), until: clock() + 9000 };
      showNameplate(p, ev);
    }
    requestOffering(p, true);
    voice.say(`${channelName()} cảm ơn bạn ${speakName(p.name)} đã gửi tặng ${ev.giftName || 'quà'}. ${pick(BLESSINGS)}`, true);
    sfx.bell();
  }

  function showNameplate(p, ev) {
    const n = ui.plate;
    n.querySelector('.np-name').textContent = p.name;
    n.querySelector('.np-gift').textContent = `đã gửi tặng ${ev.giftName || 'quà'}${ev.repeatCount > 1 ? ' x' + ev.repeatCount : ''}`;
    const av = n.querySelector('.np-av');
    av.replaceChildren();
    if (p.img) { const im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = p.img.src; av.appendChild(im); }
    else av.textContent = (p.name[0] || '?').toUpperCase();
    n.classList.remove('on');
    void n.offsetWidth;
    n.classList.add('on');
    clearTimeout(showNameplate.t);
    showNameplate.t = setTimeout(() => n.classList.remove('on'), 8500);
  }

  // ---------------- Tim & mưa hoa sen ----------------
  function onStats(s) {
    if (!enabled || !s) return;
    if (likeBase < 0) likeBase = s.likes || 0;
    likeCount = (s.likes || 0) - likeBase;
    checkLikes();
  }

  function addLikes(n) { likeCount += n; checkLikes(); }

  function checkLikes() {
    const goal = Math.max(10, cfg.chuaLikeGoal || 666);
    if (likeCount >= goal) { likeBase += goal; likeCount -= goal; startRain(); }
    updateLikeBar();
  }

  function updateLikeBar() {
    if (!ui) return;
    const goal = Math.max(10, cfg.chuaLikeGoal || 666);
    const raining = clock() < rainUntil;
    ui.likeFill.style.width = (raining ? 100 : clamp((likeCount / goal) * 100, 0, 100)) + '%';
    ui.likeText.textContent = raining
      ? '🌸 Mưa hoa sen — cảm ơn cả nhà đã thả tim!'
      : `❤️ ${Math.max(0, likeCount)}/${goal} tim — đủ tim sẽ mưa hoa sen`;
  }

  function startRain() {
    rainUntil = clock() + RAIN_MS;
    sfx.bell();
    voice.say(`Cảm ơn cả nhà đã thả tim. ${channelName()} gửi tặng mọi người cơn mưa hoa sen, chúc cả nhà bình an.`, false);
    updateLikeBar();
  }

  function petalBurst(n, ms) {
    for (let i = 0; i < n; i++) petals.push(newPetal(clock() + rnd(0, ms * 0.6)));
  }

  function newPetal(born) {
    return { x: rnd(-40, W + 40), y: rnd(-200, -20), vx: rnd(-0.6, 0.6), vy: rnd(1.4, 2.8), r: rnd(0, 6.28), vr: rnd(-0.04, 0.04), s: rnd(0.09, 0.17), born };
  }

  // ---------------- Giọng đọc ----------------
  const speakName = (n) => String(n).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim() || 'bạn';
  let lastSpeechAt = Date.now();

  const voice = {
    q: [], pq: [], busy: false, audio: null,
    say(text, priority) {
      if (!cfg.chuaVoice || !text) return;
      (priority ? this.pq : this.q).push(text);
      if (this.q.length > 6) this.q.splice(0, this.q.length - 6);
      if (this.pq.length > 15) this.pq.splice(0, this.pq.length - 15);
      this.next();
    },
    next() {
      if (this.busy || pauseAt || !enabled) return;
      const text = this.pq.shift() || this.q.shift();
      if (!text) return;
      this.busy = true;
      lastSpeechAt = Date.now();
      const done = () => { this.busy = false; this.audio = null; setDuck(false); setTimeout(() => this.next(), 500); };
      ui.caption.textContent = text;
      ui.caption.classList.add('on');
      clearTimeout(this.capT);
      this.capT = setTimeout(() => ui.caption.classList.remove('on'), Math.max(4000, text.length * 85));
      if (sfx.muted()) { setTimeout(done, Math.max(2500, text.length * 70)); return; }
      const a = new Audio(`/api/tts?rate=${cfg.chuaRate || 1}&text=${encodeURIComponent(text)}`);
      a.volume = Math.min(1, (cfg.volume ?? 0.7) + 0.25);
      this.audio = a;
      setDuck(true);
      a.onended = done;
      a.onerror = () => this.fallback(text, done);
      a.play().catch(() => this.fallback(text, done));
    },
    // Không có mạng: dùng giọng tiếng Việt có sẵn trên máy (nếu có)
    fallback(text, done) {
      const ss = window.speechSynthesis;
      const v = ss && ss.getVoices().find((x) => /^vi/i.test(x.lang));
      if (!v) { done(); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.voice = v; u.lang = v.lang; u.rate = cfg.chuaRate || 1;
      u.onend = done; u.onerror = done;
      ss.speak(u);
    },
    stop() {
      if (this.audio) { this.audio.pause(); this.audio = null; }
      window.speechSynthesis?.cancel();
      this.busy = false;
      setDuck(false);
    }
  };

  function setDuck(d) {
    duck = d;
    if (sfx) { sfx.duck(d); syncMusic(); }
  }

  // Chào người mới: gom mỗi 6 giây, tối đa 3 tên một câu
  const greetQ = [];
  let lastGreet = 0;
  function greetTick() {
    if (!cfg.chuaGreet || !greetQ.length || Date.now() - lastGreet < 6000) return;
    lastGreet = Date.now();
    const names = greetQ.splice(0, 3).map(speakName);
    const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' và ' + names.at(-1) : names[0];
    voice.say(`A Di Đà Phật, ${channelName()} xin chào ${list} vừa ghé vào.`, false);
  }

  const wishSeen = new Map();
  let lastWish = 0;
  function maybeWish(p, text) {
    const t = String(text).toLowerCase();
    const hit = WISHES.find(([re]) => re.test(t));
    if (!hit || Date.now() - lastWish < 15000 || Date.now() - (wishSeen.get(p.key) || 0) < 180000) return;
    lastWish = Date.now();
    wishSeen.set(p.key, lastWish);
    voice.say(hit[1].replace('{n}', speakName(p.name)), false);
  }

  function shareReminder() {
    voice.say(`Cảm ơn mọi người đã ghé ${channelName()}. ${pick(BLESSINGS)} Ai thấy lòng nhẹ nhàng thì bấm chia sẻ live giúp ${channelName()} nhé.`, false);
  }

  // ---------------- Sự kiện ----------------
  const isOffering = (text) => /^(a ?di ?da ?phat|adidaphat|nam ?mo|🙏)/.test(norm(text).trim());

  function onEvent(ev) {
    if (!enabled || !ev || pauseAt) return;
    switch (ev.type) {
      case 'chat': {
        const p = getPerson(ev.user);
        if (!p) return;
        p.points += 1;
        const word = String(ev.text || '').trim().toLowerCase();
        if (SKIN_WORDS[word]) { changeSkin(p, SKIN_WORDS[word]); return; }
        if (isOffering(ev.text)) requestOffering(p);
        else maybeWish(p, ev.text);
        return;
      }
      case 'join': {
        const k = keyOf(ev.user);
        if (people.has(k)) return;
        greetQ.push(cleanName(ev.user?.nickname || 'bạn'));
        if (greetQ.length > 30) greetQ.splice(0, greetQ.length - 30);
        setTimeout(() => getPerson(ev.user), SEAT_AFTER_JOIN_MS);
        return;
      }
      case 'gift': onGift(ev); return;
      case 'follow': {
        const p = getPerson(ev.user);
        if (p) { p.points += 5; p.glowUntil = clock() + 4000; }
        return;
      }
      case 'like': {
        const p = people.get(keyOf(ev.user));
        if (p && Math.random() < 0.5) effects.push({ type: 'heart', x: p.x + rnd(-20, 20), y: p.y - 240 * scaleAt(p.y), t0: clock(), dur: 1600 });
        return;
      }
    }
  }

  function changeSkin(p, skin) {
    if (p.skin === skin || p.state !== 'sit') return;
    p.skin = skin;
    p.fade = 0;
    burst(p.x, p.y - 120 * p.seat.s, '#fde68a', 8);
  }

  function command(c) {
    if (!enabled || !c) return;
    const a = c.action;
    if (a === 'speak' && c.text) voice.say(String(c.text).slice(0, 400), true);
    else if (a === 'bell') {
      sfx.bell();
      effects.push({ type: 'sprite', img: 'fx_bell', x: 240, y: 1080, s: 0.6, t0: clock(), dur: 3000, swing: true, glow: true });
      effects.push({ type: 'halo', t0: clock(), dur: 3000 });
    } else if (a === 'mo') {
      sfx.mo(3);
      effects.push({ type: 'sprite', img: 'fx_mo', x: 840, y: 1080, s: 0.55, t0: clock(), dur: 2000, knock: true });
    } else if (a === 'share') shareReminder();
    else if (a === 'testLikes') addLikes(Number(c.n) || 100);
    else if (a === 'rain') startRain();
    else if (a === 'reset') { for (const p of people.values()) p.points = 0; renderBoard(); }
  }

  // ---------------- Mỗi giây ----------------
  function tick1s() {
    if (!enabled || pauseAt) return;
    greetTick();
    renderBoard();
    updateLikeBar();
    syncMusic();
    if (cfg.chuaVoice && Date.now() - lastSpeechAt > 90000 && !voice.busy) shareReminder();
  }

  function renderBoard() {
    const top = [...people.values()].filter((p) => p.points > 0).sort((a, b) => b.points - a.points).slice(0, 5);
    ui.board.replaceChildren(...top.map((p, i) => {
      const r = document.createElement('div');
      r.className = 'tb-row';
      const a = document.createElement('span'); a.className = 'tb-rank'; a.textContent = i + 1;
      const n = document.createElement('span'); n.className = 'tb-name'; n.textContent = p.name;
      const s = document.createElement('span'); s.className = 'tb-pts'; s.textContent = p.points;
      r.append(a, n, s);
      return r;
    }));
    ui.boardEmpty.style.display = top.length ? 'none' : '';
  }

  // ---------------- Vòng lặp ----------------
  function loop(rt) {
    if (pauseAt) return;
    requestAnimationFrame(loop);
    const t = rt - pausedMs;
    if (t - last < FRAME_MS - 2) return;
    const dt = Math.min(0.06, (t - last) / 1000);
    last = t;
    if (!enabled) return;
    update(dt, t);
    draw(t);
  }

  function update(dt, t) {
    for (const p of people.values()) {
      p.fade = Math.min(1, p.fade + dt * 2);
      if (p.state === 'walk') {
        const tgt = p.path[0];
        if (!tgt) { arrive(p, t); continue; }
        const dx = tgt.x - p.x, dy = tgt.y - p.y;
        const d = Math.hypot(dx, dy);
        const sp = (120 + 300 * scaleAt(p.y)) * dt;
        p.flip = Math.abs(dx) > Math.abs(dy) && dx < 0;
        if (d <= sp) { p.x = tgt.x; p.y = tgt.y; p.path.shift(); if (!p.path.length) arrive(p, t); }
        else { p.x += (dx / d) * sp; p.y += (dy / d) * sp; }
        p.ft += dt;
        if (p.ft > 0.15) { p.ft = 0; p.frame = (p.frame + 1) % 4; }
      } else if (p.state === 'kneel') {
        // đứng -> quỳ xuống -> ngồi (khung 4 -> 7); trước bàn thờ thì dừng ở tư thế quỳ (khung 6)
        const k = (t - p.t0) / 1000;
        const toOffer = p.after === 'offer';
        p.frame = Math.min(toOffer ? 6 : 7, 4 + Math.floor(k / 0.22));
        if (k > 0.9) {
          if (toOffer) startOffer(p);
          else { p.state = 'sit'; p.frame = 7; }
        }
      } else if (p.state === 'offer') {
        const k = (t - p.t0) / 1000;
        p.frame = 6;
        if (k > 1.8 && !p.lit) { p.lit = true; lightIncense(); }
        if (k > 8) finishOffer(p);
      } else if (p.state === 'sit') {
        p.frame = 7;
        if (t > p.bowAt) { p.bowStart = t; p.bowAt = t + rnd(14000, 30000); }
      }
    }

    // máy quay áp sát người tặng quà
    let tk = 1, tx = W / 2, ty = H / 2;
    if (spotlight && t < spotlight.until && people.has(spotlight.p.key)) {
      const p = spotlight.p;
      tk = 1.45; tx = p.x; ty = p.y - 160 * scaleAt(p.y) + SCENE_DY;
    } else if (spotlight && t >= spotlight.until) spotlight = null;
    const k = Math.min(1, dt * 2.2);
    zoom.k += (tk - zoom.k) * k;
    zoom.x += (tx - zoom.x) * k;
    zoom.y += (ty - zoom.y) * k;

    const raining = t < rainUntil;
    if (raining && petals.length < 160 && Math.random() < 0.6) petals.push(newPetal(t));
    for (let i = petals.length - 1; i >= 0; i--) {
      const f = petals[i];
      if (t < f.born) continue;
      f.x += f.vx + Math.sin((t + i * 300) / 600) * 0.6;
      f.y += f.vy;
      f.r += f.vr;
      if (f.y > H + 30) petals.splice(i, 1);
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      if (e.type === 'spark') { e.age += dt; e.x += e.vx; e.y += e.vy; e.vy += 0.12; if (e.age > e.life) effects.splice(i, 1); }
      else if (t - e.t0 > e.dur) effects.splice(i, 1);
    }
    if (!raining && ui.likeFill.dataset.r === '1') { ui.likeFill.dataset.r = ''; updateLikeBar(); }
    if (raining) ui.likeFill.dataset.r = '1';
  }

  function arrive(p, t) {
    if (p.after !== 'offer') { p.x = p.seat.x; p.y = p.seat.y; }
    p.state = 'kneel';
    p.t0 = t;
    p.flip = p.after === 'offer' ? false : facesLeft(p.x);
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.28), s = rnd(1.5, 5);
      effects.push({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: rnd(0.6, 1.3), age: 0, color });
    }
  }

  // ---------------- Vẽ ----------------
  function sprite(im, x, y, s, ay = 1) {
    if (!ok(im)) return;
    const w = im.naturalWidth * s, h = im.naturalHeight * s;
    g.drawImage(im, x - w / 2, y - h * ay, w, h);
  }

  function draw(t) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1a0a04';
    g.fillRect(0, 0, W, H);
    g.setTransform(zoom.k, 0, 0, zoom.k, W / 2 - zoom.x * zoom.k, H / 2 - zoom.y * zoom.k);
    g.translate(0, SCENE_DY);
    if (ok(IMG.hall)) {
      g.drawImage(IMG.hall, 0, 0, W, H);
      // kéo dài sàn gỗ xuống phần trống phía dưới
      g.drawImage(IMG.hall, 0, IMG.hall.naturalHeight - 6, IMG.hall.naturalWidth, 6, 0, H - 1, W, -SCENE_DY + 2);
    }
    drawLights(t);
    drawSmoke(t);
    drawLotus(t);
    const list = [...people.values()].sort((a, b) => a.y - b.y);
    for (const p of list) drawPerson(p, t);
    drawEffects(t);
    g.setTransform(1, 0, 0, 1, 0, 0);
    drawPetals(t);
  }

  // Hào quang sau tượng + đèn nến lung linh (cộng sáng lên ảnh nền)
  function drawLights(t) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const extra = effects.some((e) => e.type === 'halo') ? 0.35 : 0;
    g.globalAlpha = clamp(0.12 + 0.05 * Math.sin(t / 1300) + extra, 0, 1);
    sprite(IMG.fx_halo, 540, 720, 1.6);
    g.globalAlpha = 1;
    for (const [x, y, ph] of [[466, 912, 0], [614, 912, 1.3], [295, 868, 2.1], [785, 868, 3.3], [372, 752, 4.1], [708, 752, 5.2]]) {
      const f = 0.5 + 0.25 * Math.sin(t / 180 + ph) + Math.random() * 0.08;
      const gr = g.createRadialGradient(x, y, 2, x, y, 70);
      gr.addColorStop(0, `rgba(255,200,110,${0.32 * f})`); gr.addColorStop(1, 'rgba(255,150,50,0)');
      g.fillStyle = gr; g.fillRect(x - 70, y - 70, 140, 140);
    }
    g.restore();
  }

  function drawSmoke(t) {
    const strong = t < incenseUntil;
    g.save();
    g.fillStyle = '#efe3cc';
    const n = strong ? 22 : 12;
    for (let i = 0; i < n; i++) {
      const a = (t * (strong ? 0.00011 : 0.00008) + i / n) % 1;
      g.globalAlpha = (strong ? 0.34 : 0.22) * (1 - a);
      g.beginPath();
      g.arc(ALTAR.x + Math.sin(a * 7 + i) * 22 * a, ALTAR.y - 30 - a * (strong ? 360 : 260), 4 + a * 16, 0, 6.28);
      g.fill();
    }
    g.restore();
  }

  function drawLotus(t) {
    for (const e of effects) {
      if (e.type !== 'lotus') continue;
      const k = (t - e.t0) / e.dur;
      const open = ease(Math.min(1, k * 2.5));
      const fade = k > 0.8 ? (1 - k) / 0.2 : 1;
      g.save();
      g.globalAlpha = Math.max(0, fade);
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(540, 700, 10, 540, 700, 330 * e.size);
      gr.addColorStop(0, 'rgba(255,225,140,.75)'); gr.addColorStop(1, 'rgba(255,190,80,0)');
      g.fillStyle = gr; g.fillRect(540 - 340 * e.size, 700 - 340 * e.size, 680 * e.size, 680 * e.size);
      g.globalCompositeOperation = 'source-over';
      sprite(IMG.fx_lotus, 540, 880 - open * 40, (0.6 + open * 0.5) * e.size);
      g.restore();
    }
  }

  function drawPerson(p, t) {
    const anim = hasAnim(p.skin);
    const seated = p.state === 'sit' || (p.state === 'kneel' && p.after === 'sit');
    const ws = seated ? p.seat.s : scaleAt(p.y);
    // phát sáng khi vừa tặng quà
    if (p.glowUntil && t < p.glowUntil) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = Math.min(1, (p.glowUntil - t) / 1500) * 0.7;
      const gr = g.createRadialGradient(p.x, p.y - 110 * ws, 8, p.x, p.y - 110 * ws, 220 * ws);
      gr.addColorStop(0, 'rgba(255,205,120,.95)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
      g.fillStyle = gr; g.fillRect(p.x - 240 * ws, p.y - 340 * ws, 480 * ws, 420 * ws);
      g.restore();
    }
    // lạy: thân cúi xuống
    let bowK = 0;
    if (p.state === 'offer' && !hasAnim(p.skin)) { const k = (t - p.t0) / 1000; if (k < 7.5) bowK = Math.max(0, Math.sin(((k % 2.4) / 2.4) * Math.PI)) * 0.16; }
    else if (p.state === 'sit' && p.bowStart && t - p.bowStart < 2400) bowK = Math.sin(((t - p.bowStart) / 2400) * Math.PI) * 0.08;
    const breathe = p.state === 'sit' ? Math.sin(t / 900 + p.phase) * 2 * ws : 0;
    g.save();
    g.globalAlpha = p.fade;
    g.translate(p.x, p.y);
    if (bowK) g.transform(1, 0, 0, 1 - bowK, 0, 0);
    let topY;
    const atAltar = anim && (p.state === 'offer' || (p.state === 'kneel' && p.after === 'offer'));
    if (atAltar) {
      // Quỳ thẳng hướng 12 giờ vào tượng: dựng từ khung đứng nhìn thẳng sau lưng (khung 4)
      const a = ANIM[p.skin];
      const k = (ws * 1.05 * 260) / a.seatH;
      const sinceKneel = p.state === 'kneel' ? (t - p.t0) / 1000 : 9;
      if (sinceKneel < 0.35) {
        g.drawImage(IMG['anim_' + p.skin], 4 * a.fw, 0, a.fw, a.fh, (-a.fw * k) / 2, -a.fh * k, a.fw * k, a.fh * k);
        topY = a.fh * 0.97 * k;
      } else {
        const torso = TORSO[p.skin] || 175;
        const dip = Math.min(1, (sinceKneel - 0.35) / 0.25); // hạ người xuống quỳ
        // bồ đoàn
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.beginPath(); g.ellipse(0, -2 * k, 78 * k, 16 * k, 0, 0, 6.28); g.fill();
        g.fillStyle = '#6b3a1f';
        g.beginPath(); g.ellipse(0, -8 * k, 74 * k, 18 * k, 0, 0, 6.28); g.fill();
        g.fillStyle = '#7f4726';
        g.beginPath(); g.ellipse(0, -12 * k, 64 * k, 12 * k, 0, 0, 6.28); g.fill();
        // ống quần + hai bàn chân lộ ra sau gót
        g.fillStyle = '#8b9097';
        g.beginPath(); g.ellipse(0, -14 * k, 44 * k, 11 * k, 0, 0, 6.28); g.fill();
        g.fillStyle = '#d9b394';
        g.beginPath(); g.ellipse(-20 * k, -9 * k, 11 * k, 7 * k, -0.25, 0, 6.28); g.fill();
        g.beginPath(); g.ellipse(20 * k, -9 * k, 11 * k, 7 * k, 0.25, 0, 6.28); g.fill();
        // thân trên (đầu -> hông) ngồi trên gót; lạy thì lưng cúi, đầu hạ thấp
        const h0 = torso * k;
        const lift = (1 - dip) * 60 * k;
        let squash = 1;
        if (p.state === 'offer') { const kk = (t - p.t0) / 1000; if (kk < 7.5) squash = 1 - Math.max(0, Math.sin(((kk % 2.4) / 2.4) * Math.PI)) * 0.32; }
        const hh = h0 * squash;
        g.drawImage(IMG['anim_' + p.skin], 4 * a.fw, 0, a.fw, torso, (-a.fw * k) / 2, -14 * k - hh - lift, a.fw * k, hh);
        topY = 14 * k + h0 + 4 * k;
      }
    } else if (anim) {
      const a = ANIM[p.skin];
      const k = (ws * 1.05 * 260) / a.seatH;
      if (p.flip) g.scale(-1, 1);
      g.drawImage(IMG['anim_' + p.skin], p.frame * a.fw, 0, a.fw, a.fh, (-a.fw * k) / 2, -a.fh * k + breathe, a.fw * k, a.fh * k);
      topY = (p.frame === 7 ? a.seatH : p.frame >= 5 ? a.fh * 0.8 : a.fh * 0.97) * k;
    } else {
      if (facesLeft(p.x)) g.scale(-1, 1);
      sprite(IMG['c_' + p.skin] || IMG.c_man, 0, breathe, ws * 1.05);
      topY = 260 * ws * 1.05;
    }
    g.restore();
    drawTag(p, p.x, p.y - topY - 8 * (ws / 0.4), ws);
  }

  function drawTag(p, x, y, ws) {
    const f = clamp(ws / 0.62, 0.6, 1.15); // hàng xa nhỏ hơn để bảng tên không chồng nhau
    const r = 15 * f;
    const fs = Math.round(17 * f);
    g.save();
    g.font = `700 ${fs}px "Be Vietnam Pro", system-ui, sans-serif`;
    const label = p.label || (p.label = fitText(p.name, 130));
    const tw = g.measureText(label).width;
    const w = tw + r * 2 + 18;
    const h = Math.max(r * 2 + 6, fs + 12);
    const gold = p === spotlight?.p || p.points >= 990;
    g.fillStyle = gold ? 'rgba(120,53,15,.92)' : 'rgba(30,12,5,.78)';
    roundRect(x - w / 2, y - h, w, h, h / 2); g.fill();
    if (gold) { g.strokeStyle = '#fbbf24'; g.lineWidth = 2; g.stroke(); }
    const ax = x - w / 2 + r + 4, ay = y - h / 2;
    if (p.img && ok(p.img)) {
      g.save(); g.beginPath(); g.arc(ax, ay, r, 0, 6.28); g.clip(); g.drawImage(p.img, ax - r, ay - r, r * 2, r * 2); g.restore();
    } else {
      g.fillStyle = '#92400e'; g.beginPath(); g.arc(ax, ay, r, 0, 6.28); g.fill();
      g.fillStyle = '#fde68a'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `800 ${Math.round(r)}px system-ui`; g.fillText((p.name[0] || '?').toUpperCase(), ax, ay + 1);
      g.font = `700 ${fs}px "Be Vietnam Pro", system-ui, sans-serif`;
    }
    g.fillStyle = gold ? '#fde68a' : '#fef3c7';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(label, ax + r + 6, ay + 1);
    g.restore();
  }

  function drawEffects(t) {
    for (const e of effects) {
      if (e.type === 'spark') {
        g.globalAlpha = Math.max(0, 1 - e.age / e.life);
        g.fillStyle = e.color;
        g.beginPath(); g.arc(e.x, e.y, 3.5, 0, 6.28); g.fill();
        g.globalAlpha = 1;
      } else if (e.type === 'sprite') {
        const k = (t - e.t0) / e.dur;
        const a = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
        g.save();
        g.globalAlpha = Math.max(0, a);
        g.translate(e.x, e.y - (e.rise || 0) * k);
        if (e.swing) g.rotate(Math.sin(k * 18) * 0.25 * (1 - k));
        if (e.knock) g.rotate(Math.sin(k * 30) * 0.12);
        if (e.glow) {
          g.globalCompositeOperation = 'lighter';
          const gr = g.createRadialGradient(0, -60, 5, 0, -60, 140);
          gr.addColorStop(0, 'rgba(255,215,130,.6)'); gr.addColorStop(1, 'rgba(255,170,60,0)');
          g.fillStyle = gr; g.fillRect(-150, -210, 300, 300);
          g.globalCompositeOperation = 'source-over';
        }
        sprite(IMG[e.img], 0, 0, e.s);
        g.restore();
      } else if (e.type === 'heart') {
        const k = (t - e.t0) / e.dur;
        g.globalAlpha = Math.max(0, 1 - k);
        g.font = '28px system-ui'; g.textAlign = 'center';
        g.fillText('❤️', e.x + Math.sin(k * 8) * 10, e.y - k * 90);
        g.globalAlpha = 1;
      }
    }
  }

  function drawPetals(t) {
    const im = IMG.fx_petal;
    for (const f of petals) {
      if (t < f.born) continue;
      g.save();
      g.translate(f.x, f.y); g.rotate(f.r);
      if (ok(im)) { const w = im.naturalWidth * f.s, h = im.naturalHeight * f.s; g.drawImage(im, -w / 2, -h / 2, w, h); }
      else { g.fillStyle = '#f9a8d4'; g.beginPath(); g.ellipse(0, 0, 6, 12, 0, 0, 6.28); g.fill(); }
      g.restore();
    }
  }

  // ---------------- Tiện ích ----------------
  function roundRect(x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function fitText(s, max) {
    g.font = '700 17px system-ui';
    if (g.measureText(s).width <= max) return s;
    while (s.length > 1 && g.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s + '…';
  }

  window.TempleScene = { init, setConfig, onEvent, onStats, command, setPaused, isOn: () => enabled };
})();
