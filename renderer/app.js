(() => {
  'use strict';
  const api = window.studio;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

  let settings = null;
  let server = { running: false, port: 3000 };
  let status = 'idle';
  let startedAt = 0;
  let feedFilter = 'all';

  // ---------- Toast nhỏ trong app ----------
  function notify(text, kind = 'ok') {
    const t = document.createElement('div');
    t.className = 'app-toast ' + kind;
    t.textContent = text;
    $('#toast-host').appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ---------- Điều hướng ----------
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => {
    $$('.nav-item').forEach((x) => x.classList.toggle('active', x === b));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + b.dataset.view));
    if (['ma', 'chua', 'rap', 'vua'].includes(b.dataset.view)) switchScene(b.dataset.view);
    if (b.dataset.view === 'vua') loadVuaControl();
    setPreviewSrc(false);
  }));

  // Cột cài đặt của tab cảnh: bọc thêm 1 lớp để chia 2 cột bên trong và cuộn dọc
  $$('.feature-controls').forEach((fc) => {
    const inner = document.createElement('div');
    inner.className = 'fc-inner';
    while (fc.firstChild) inner.appendChild(fc.firstChild);
    fc.appendChild(inner);
  });

  // ---------- Kết nối ----------
  const STATUS = {
    idle: ['Chưa kết nối', ''],
    connecting: ['Đang kết nối…', 'busy'],
    reconnecting: ['Đang kết nối lại…', 'busy'],
    live: ['ĐANG LIVE', 'live'],
    ended: ['Live đã kết thúc', ''],
    error: ['Lỗi kết nối', 'error']
  };

  function renderStatus(s) {
    status = s.status;
    $('#warn-connect').hidden = status === 'live';
    renderQuick();
    const [label, cls] = STATUS[status] || STATUS.idle;
    const pill = $('#status-pill');
    pill.className = 'status-pill ' + cls;
    $('#status-text').textContent = label + (status === 'live' && s.username ? ` · @${s.username}` : '');
    const msg = $('#status-msg');
    msg.textContent = status === 'live' ? '' : s.message || '';
    msg.classList.toggle('err', status === 'error');

    const busy = status === 'connecting' || status === 'reconnecting';
    const on = status === 'live' || busy;
    const btn = $('#btn-connect');
    btn.className = 'btn ' + (on ? 'danger' : 'primary');
    btn.querySelector('span').textContent = on ? (busy ? 'Huỷ' : 'Ngắt kết nối') : 'Kết nối';
    btn.querySelector('svg').innerHTML = on
      ? '<path d="M6 6h12v12H6z"/>'
      : '<path d="M8 5v14l11-7z"/>';
    $('#username').disabled = on;
  }

  $('#btn-connect').addEventListener('click', async () => {
    if (status === 'live' || status === 'connecting' || status === 'reconnecting') {
      await api.disconnect();
      return;
    }
    const u = $('#username').value.trim();
    if (!u) {
      $('#username').focus();
      notify('Nhập username kênh TikTok đang live', 'err');
      return;
    }
    clearFeed();
    const r = await api.connect(u);
    if (!r.ok) notify(r.message, 'err');
  });
  $('#username').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btn-connect').click();
  });

  // ---------- Thống kê ----------
  const statEls = ['viewers', 'likes', 'comments', 'gifts', 'diamonds', 'follows'];
  const prev = {};
  function renderStats(s) {
    for (const k of statEls) {
      const el = $('#s-' + k);
      if (prev[k] !== s[k]) {
        el.textContent = fmt(s[k]);
        if (prev[k] !== undefined && s[k] > prev[k]) {
          el.classList.remove('flash');
          void el.offsetWidth;
          el.classList.add('flash');
        }
        prev[k] = s[k];
      }
    }
    startedAt = s.startedAt || 0;
    renderLeader(s.topGifters || []);
  }

  function renderLeader(list) {
    const ol = $('#leader');
    ol.replaceChildren();
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'muted small leader-empty';
      li.textContent = 'Chưa có ai tặng quà';
      ol.appendChild(li);
      return;
    }
    for (const g of list) {
      const li = document.createElement('li');
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = g.nickname;
      const dm = document.createElement('span');
      dm.className = 'dm';
      dm.textContent = fmt(g.diamonds) + ' 💎';
      li.append(avatarEl(g.avatar), nm, dm);
      ol.appendChild(li);
    }
  }

  setInterval(() => {
    if (!startedAt || status !== 'live') return;
    const t = Math.floor((Date.now() - startedAt) / 1000);
    const p = (n) => String(n).padStart(2, '0');
    $('#uptime').textContent = `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
  }, 1000);

  // ---------- Feed ----------
  const feed = $('#feed');
  const MAX_FEED = 250;

  function avatarEl(url) {
    if (typeof url === 'string' && url.startsWith('https://')) {
      const img = document.createElement('img');
      img.className = 'av';
      img.referrerPolicy = 'no-referrer';
      img.src = url;
      img.onerror = () => { const d = avatarEl(''); img.replaceWith(d); };
      return img;
    }
    const d = document.createElement('div');
    d.className = 'av';
    d.textContent = '👻';
    return d;
  }

  function clearFeed() {
    $$('.item', feed).forEach((n) => n.remove());
    $('#feed-empty').style.display = '';
  }

  const GROUP = { chat: 'chat', gift: 'gift', follow: 'social', share: 'social' };
  const TAG = { chat: 'Chat', gift: 'Quà', follow: 'Theo dõi', share: 'Chia sẻ' };

  function addFeed(ev) {
    if (!GROUP[ev.type]) return; // like/join/streak không đưa vào feed để tránh spam
    $('#feed-empty').style.display = 'none';
    const item = document.createElement('div');
    item.className = 'item ' + ev.type;
    item.dataset.g = GROUP[ev.type];
    const body = document.createElement('div');
    body.className = 'body';
    const who = document.createElement('div');
    who.className = 'who';
    const name = document.createElement('span');
    name.textContent = ev.user?.nickname || 'Ẩn danh';
    const tag = document.createElement('span');
    tag.className = 'tag ' + (ev.test ? 'test' : ev.type);
    tag.textContent = ev.test ? 'Thử' : TAG[ev.type];
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = new Date(ev.ts || Date.now()).toLocaleTimeString('vi-VN');
    who.append(name, tag, time);
    const text = document.createElement('div');
    text.className = 'text';
    if (ev.type === 'chat') text.textContent = ev.text;
    else if (ev.type === 'gift') {
      text.append('Tặng ');
      const b = document.createElement('b');
      b.textContent = `${ev.giftName} x${ev.repeatCount}`;
      text.append(b, ` · ${fmt(ev.total)} 💎`);
    } else if (ev.type === 'follow') text.textContent = 'Đã theo dõi kênh';
    else if (ev.type === 'share') text.textContent = 'Đã chia sẻ buổi live';
    body.append(who, text);
    item.append(avatarEl(ev.user?.avatar), body);
    if (feedFilter !== 'all' && feedFilter !== item.dataset.g) item.style.display = 'none';

    const atTop = feed.scrollTop < 40;
    feed.prepend(item);
    const items = $$('.item', feed);
    for (let i = MAX_FEED; i < items.length; i++) items[i].remove();
    if (atTop) feed.scrollTop = 0;
  }

  $$('#feed-filter .chip').forEach((c) => c.addEventListener('click', () => {
    feedFilter = c.dataset.f;
    $$('#feed-filter .chip').forEach((x) => x.classList.toggle('active', x === c));
    $$('.item', feed).forEach((n) => { n.style.display = feedFilter === 'all' || n.dataset.g === feedFilter ? '' : 'none'; });
  }));

  // ---------- Đi Chùa Online ----------
  // Bắt đầu nhanh: đánh dấu các bước đã xong
  function renderQuick() {
    const mode = settings?.overlay?.mode;
    const live = status === 'live';
    const screens = server.running ? Math.max(0, (server.clients || 0) - 1) : 0;
    const set = (k, done) => $(`.qs [data-qs=${k}]`)?.classList.toggle('done', !!done);
    set('scene', !!mode);
    set('link', screens > 0);
    set('golive', live);
    set('connect', live);
    const sc = $('#qs-scene');
    if (sc) sc.textContent = mode === 'chua' ? 'Đang chọn: 🪷 Đi Chùa Online' : mode === 'rap' ? 'Đang chọn: 🎬 Rạp Phim Online' : mode === 'vua' ? 'Đang chọn: 👑 Vua Tiếng Việt' : 'Đang chọn: 👻 Live Ma Online';
  }
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => $(`.nav-item[data-view=${b.dataset.goto}]`).click()));
  $('#qs-copy').addEventListener('click', async () => {
    await api.copy(`http://lvh.me:${server.port}`);
    notify('Đã sao chép link cho TikTok LIVE Studio');
  });

  // Chấm LIVE cạnh tab đang chạy trên live
  function renderChuaNav(mode) {
    renderQuick();
    const live = mode === 'chua' ? 'chua' : mode === 'rap' ? 'rap' : mode === 'vua' ? 'vua' : 'ma';
    $$('[data-live-for]').forEach((d) => d.classList.toggle('on', d.dataset.liveFor === live));
    $$('[data-open-scene]').forEach((b) => {
      const on = b.dataset.openScene === live;
      b.classList.toggle('live', on);
      b.querySelector('small').textContent = on
        ? '● Đang phát cảnh này — bấm để mở màn hình phát'
        : ({ ma: 'Chuyển live sang Nhà Ma + mở màn hình phát', chua: 'Chuyển live sang chánh điện + mở màn hình phát', rap: 'Chuyển live sang rạp phim + mở màn hình phát', vua: 'Chuyển live sang giảng đường đoán chữ + mở màn hình phát' })[b.dataset.openScene];
    });
  }
  // Nút riêng cho từng cảnh: chuyển cảnh trên live rồi mở màn hình phát
  $$('[data-open-scene]').forEach((b) => b.addEventListener('click', () => {
    switchScene(b.dataset.openScene);
    api.openOutput();
  }));

  // Mở tab nào thì cảnh đó chạy trên live
  function switchScene(view) {
    if (!settings) return;
    const want = view === 'chua' ? 'chua' : view === 'rap' ? 'rap' : view === 'vua' ? 'vua' : 'game';
    if (settings.overlay.mode === want) return;
    settings.overlay.mode = want;
    renderSettings();
    save({ overlay: { mode: want } }, true);
    notify(view === 'chua' ? '🪷 Live đang chạy: Đi Chùa Online' : view === 'rap' ? '🎬 Live đang chạy: Rạp Phim Online' : view === 'vua' ? '👑 Live đang chạy: Vua Tiếng Việt' : '👻 Live đang chạy: Live Ma Online');
  }

  // ---------- Vua Tiếng Việt ----------
  // Bảng điều khiển gốc của game (server riêng) nhúng nguyên trong tab; chỉ nạp lần đầu mở tab để giữ trạng thái form
  let vua = { running: false, port: 0, error: '' };
  function loadVuaControl() {
    const frame = $('#vua-control');
    const err = $('#vua-error');
    err.hidden = vua.running;
    if (!vua.running) {
      err.textContent = 'Không khởi động được Vua Tiếng Việt: ' + (vua.error || 'lỗi không xác định');
      return;
    }
    const src = `http://127.0.0.1:${vua.port}/control.html`;
    if (frame.dataset.src !== src) { frame.dataset.src = src; frame.src = src; }
  }
  // Bấm "Mở overlay LIVE 9:16" trong bảng Vua Tiếng Việt
  api.onVuaGoLive(() => {
    switchScene('vua');
    api.openOutput();
  });
  $('#chua-name-save').addEventListener('click', () => {
    const name = $('#chua-name').value.trim();
    settings.overlay.chuaName = name;
    save({ overlay: { chuaName: name } }, true);
    notify(name ? `Đã lưu tên kênh: ${name}` : 'Đã xoá tên kênh (dùng tên mặc định)');
  });
  $('#chua-speak-btn').addEventListener('click', () => {
    const text = $('#chua-speak').value.trim();
    if (!text) return notify('Nhập câu cần đọc trước', 'err');
    api.chua('speak', { text });
    notify('Đã gửi câu cần đọc lên live');
  });
  $$('[data-chua]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.chua;
    api.chua(a, a === 'testLikes' ? { n: 100 } : {});
  }));

  // ---------- Rạp Phim Online ----------
  const ytIdOf = (u) => (String(u).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/i) || [])[1] || '';
  const movieName = (p) => {
    if (ytIdOf(p)) return '▶ YouTube · ' + ytIdOf(p);
    if (/^https?:\/\//i.test(p)) { try { const u = new URL(p); return '🔗 ' + u.hostname + decodeURIComponent(u.pathname).slice(0, 60); } catch { return '🔗 ' + p; } }
    return String(p || '').split(/[\\/]/).pop();
  };
  function renderMovies() {
    const list = settings.overlay.rapVideos || [];
    const cur = settings.overlay.rapIndex || 0;
    $('#rap-empty').hidden = list.length > 0;
    $('#rap-list').replaceChildren(...list.map((p, i) => {
      const li = document.createElement('li');
      li.className = i === cur ? 'on' : '';
      li.title = 'Bấm để chiếu phim này — ' + p;
      const n = document.createElement('span'); n.className = 'mv-n'; n.textContent = i === cur ? '▶' : i + 1;
      const nm = document.createElement('span'); nm.className = 'mv-name'; nm.textContent = movieName(p);
      const del = document.createElement('button'); del.className = 'mv-del'; del.textContent = '✕'; del.title = 'Xoá khỏi danh sách';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = list.filter((_, k) => k !== i);
        const idx = Math.min(cur > i ? cur - 1 : cur, Math.max(0, next.length - 1));
        settings.overlay.rapVideos = next; settings.overlay.rapIndex = idx;
        renderMovies();
        save({ overlay: { rapVideos: next, rapIndex: idx } }, true);
      });
      li.addEventListener('click', () => {
        settings.overlay.rapIndex = i;
        renderMovies();
        api.rap('index', { n: i });
      });
      li.append(n, nm, del);
      return li;
    }));
  }
  $$('#rap-theme button').forEach((b) => b.addEventListener('click', () => {
    settings.overlay.rapTheme = b.dataset.theme;
    renderSettings();
    save({ overlay: { rapTheme: b.dataset.theme } }, true);
  }));
  $('#rap-link-add').addEventListener('click', () => {
    const link = $('#rap-link').value.trim();
    if (!/^https?:\/\//i.test(link)) return notify('Link phải bắt đầu bằng http:// hoặc https://', 'err');
    if (!ytIdOf(link) && !/\.(mp4|webm|m4v|mov)(\?|#|$)/i.test(link)) {
      notify('Chỉ phát được link YouTube hoặc link trực tiếp tới file video (.mp4, .webm). Link trang web khác có thể không chạy.', 'err');
    }
    const next = [...(settings.overlay.rapVideos || []), link].slice(0, 100);
    const idx = next.length - 1;
    settings.overlay.rapVideos = next;
    settings.overlay.rapIndex = idx;
    $('#rap-link').value = '';
    renderMovies();
    // lưu danh sách rồi chiếu ngay link vừa thêm
    api.updateSettings({ overlay: { rapVideos: next, rapIndex: idx } }).then(() => setTimeout(() => api.rap('index', { n: idx }), 300));
    notify('Đã thêm link — đang chiếu');
  });
  $('#rap-link').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#rap-link-add').click(); });
  $('#rap-lights').addEventListener('click', () => {
    settings.overlay.rapLightsOff = !settings.overlay.rapLightsOff;
    renderSettings();
    save({ overlay: { rapLightsOff: settings.overlay.rapLightsOff } }, true);
  });
  $('#rap-add').addEventListener('click', async () => {
    const files = await api.pickVideos();
    if (!files.length) return;
    const before = (settings.overlay.rapVideos || []).length;
    const next = [...(settings.overlay.rapVideos || []), ...files].slice(0, 100);
    settings.overlay.rapVideos = next;
    settings.overlay.rapIndex = before;
    renderMovies();
    api.updateSettings({ overlay: { rapVideos: next, rapIndex: before } }).then(() => setTimeout(() => api.rap('index', { n: before }), 300));
    notify(`Đã thêm ${files.length} phim`);
  });
  $$('[data-rap]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.rap;
    if (a === 'next' || a === 'prev') {
      const n = (settings.overlay.rapVideos || []).length;
      if (n) {
        settings.overlay.rapIndex = ((settings.overlay.rapIndex || 0) + (a === 'next' ? 1 : -1) + n) % n;
        renderMovies();
        save({ overlay: { rapIndex: settings.overlay.rapIndex } });
      }
    }
    api.rap(a, a === 'testLikes' ? { n: 100 } : {});
  }));
  $('#rap-name-save').addEventListener('click', () => {
    const name = $('#rap-name').value.trim();
    settings.overlay.rapName = name;
    save({ overlay: { rapName: name } }, true);
    notify(name ? `Đã lưu tên rạp: ${name}` : 'Đã xoá tên rạp (dùng tên mặc định)');
  });
  $('#rap-speak-btn').addEventListener('click', () => {
    const text = $('#rap-speak').value.trim();
    if (!text) return notify('Nhập câu cần đọc trước', 'err');
    api.rap('speak', { text });
    notify('Đã gửi câu cần đọc lên live');
  });

  // ---------- Tạm dừng / chạy tiếp ----------
  function renderPause(p) {
    $$('[data-pause]').forEach((b) => {
      b.classList.toggle('paused', p);
      b.textContent = p ? '▶ Chạy tiếp' : '⏸ Tạm dừng';
    });
  }
  $$('[data-pause]').forEach((b) => b.addEventListener('click', async () => {
    const p = await api.setPaused();
    notify(p ? 'Đã tạm dừng cảnh: đứng hình, tắt tiếng, nhẹ máy' : 'Đã chạy tiếp');
  }));
  api.onPause(renderPause);

  // ---------- Màn hình phát live ----------
  let outputOpen = false;
  $$('[data-open-output]').forEach((b) => b.addEventListener('click', () => api.openOutput()));
  api.onOutput(({ open }) => {
    outputOpen = open;
    $$('[data-open-output]').forEach((b) => {
      b.classList.toggle('open', open);
      b.textContent = open ? '📺 Màn hình phát đang mở' : '📺 Mở màn hình phát live';
    });
    // tránh phát tiếng 2 lần: khi cửa sổ phát mở, khung xem trước tự tắt tiếng
    setPreviewSrc(false);
    if (open) notify('Đã mở màn hình phát. Trong TikTok LIVE Studio chọn “Chụp cửa sổ” → cửa sổ này.');
  });

  $$('#guide-tabs .chip').forEach((c) => c.addEventListener('click', () => {
    $$('#guide-tabs .chip').forEach((x) => x.classList.toggle('active', x === c));
    $$('.guide').forEach((g) => { g.hidden = g.dataset.guide !== c.dataset.g; });
  }));

  // ---------- Gửi thử ----------
  $$('[data-test]').forEach((b) => b.addEventListener('click', () => api.test(b.dataset.test)));

  // ---------- Server / Overlay ----------
  function renderServer(s) {
    server = s;
    const url = `http://localhost:${s.port}`;
    $('#srv-dot').className = 'dot ' + (s.running ? 'ok' : 'err');
    $('#srv-sub').textContent = s.running ? url : s.error || 'Không chạy';
    $('#overlay-url').textContent = url;
    $('#overlay-url-studio').textContent = `http://lvh.me:${s.port}`;
    $('#clients').textContent = s.running ? Math.max(0, (s.clients || 0) - 1) : 0; // trừ khung xem trước
    $('#qs-link').textContent = `http://lvh.me:${s.port}`;
    renderQuick();
    setPreviewSrc(false);
    if (settings) renderChuaNav(settings.overlay.mode);
    if (!s.running && s.error) notify(s.error, 'err');
  }

  $('#btn-copy-studio').addEventListener('click', async () => {
    await api.copy(`http://lvh.me:${server.port}`);
    notify('Đã sao chép link cho TikTok LIVE Studio');
  });
  $('#btn-copy-url').addEventListener('click', async () => {
    await api.copy(`http://localhost:${server.port}`);
    notify('Đã sao chép đường dẫn overlay');
  });
  $('#btn-reload-overlay').addEventListener('click', () => {
    api.reloadOverlay();
    notify('Đã gửi lệnh tải lại tới mọi overlay');
  });
  // Lưới vùng bị TikTok che trong khung xem trước (chỉ trong app, không ảnh hưởng live)
  let showSafe = false;
  $$('.preview-safe-cb').forEach((cb) => cb.addEventListener('change', (e) => {
    showSafe = e.target.checked;
    $$('.preview-safe-cb').forEach((x) => { x.checked = showSafe; });
    setPreviewSrc(true);
  }));
  $$('.preview-sound-cb').forEach((cb) => cb.addEventListener('change', (e) => {
    settings.previewSound = e.target.checked;
    $$('.preview-sound-cb').forEach((x) => { x.checked = e.target.checked; });
    save({ previewSound: e.target.checked }, true);
    setPreviewSrc(true);
  }));

  // Khung xem cảnh: chỉ khung ở tab đang mở được chạy, tab khác tắt hẳn cho nhẹ máy
  // Tự hồi phục khung xem: không nhận được nhịp "còn sống" 4 giây -> tải lại khung
  let lastAlive = Date.now();
  window.addEventListener('message', (e) => { if (e.data && e.data.studioAlive) lastAlive = Date.now(); });
  setInterval(() => {
    const vis = $$('.live-preview').some((f) => f.dataset.src && $('#view-' + f.dataset.for).classList.contains('active'));
    if (vis && !document.hidden && Date.now() - lastAlive > 4000) { lastAlive = Date.now(); setPreviewSrc(true); }
  }, 2000);
  // cửa sổ hiện lại sau khi thu nhỏ / máy ngủ dậy: tải lại khung cho chắc
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastAlive = Date.now(); setPreviewSrc(true); } });
  api.onPreviewReload(() => { lastAlive = Date.now(); setPreviewSrc(true); });
  $$('[data-reload-preview]').forEach((b) => b.addEventListener('click', () => { setPreviewSrc(true); notify('Đã tải lại khung xem'); }));

  function setPreviewSrc(force) {
    if (!server.running) return;
    const mute = (settings && !settings.previewSound) || outputOpen;
    const src = `http://127.0.0.1:${server.port}/?preview${mute ? '&mute=1' : ''}${showSafe ? '&safe=1' : ''}`;
    $$('.live-preview').forEach((iframe) => {
      const visible = $('#view-' + iframe.dataset.for).classList.contains('active');
      const want = visible ? src : '';
      if (force || iframe.dataset.src !== want) {
        iframe.dataset.src = want;
        iframe.src = want || 'about:blank';
      }
    });
  }

  // ---------- Cài đặt ----------
  let saveTimer = 0;
  let pending = {};
  function save(patch, immediate = false) {
    pending = deepMerge(pending, patch);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const p = pending;
      pending = {};
      const r = await api.updateSettings(p);
      settings = r.settings;
      renderServer(r.server);
    }, immediate ? 0 : 250);
  }
  function deepMerge(a, b) {
    const o = { ...a };
    for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' ? deepMerge(a[k] || {}, v) : v;
    return o;
  }

  function renderSettings() {
    const o = settings.overlay;
    $$('[data-o]').forEach((el) => {
      const k = el.dataset.o;
      if (el.type === 'checkbox') el.checked = !!o[k];
      else el.value = o[k];
    });
    updateLabels();
    $$('#bg-seg button').forEach((b) => b.classList.toggle('active', b.dataset.bg === o.background));
    renderChuaNav(o.mode);
    $$('#amb-grid button').forEach((b) => b.classList.toggle('active', b.dataset.amb === o.ambientPreset && !o.customAmbient));
    $('#amb-grid').classList.toggle('off', !o.ambient || !!o.customAmbient);
    $$('#swatches button').forEach((b) => b.classList.toggle('active', b.dataset.c === o.accent));
    $('#accent-custom').value = o.accent;
    const DEF = {
      customGiftSound: 'Mặc định: chuông chùa', customChatSound: 'Mặc định: ting', customJumpscare: 'Mặc định: 6 mặt ma ngẫu nhiên',
      customScareSound: 'Mặc định: 4 kiểu tiếng thét ngẫu nhiên', customAmbient: 'Mặc định: gió hú tự tạo'
    };
    for (const k of Object.keys(DEF)) {
      const def = DEF[k];
      $('#f-' + k).textContent = o[k] ? o[k].split(/[\\/]/).pop() : def;
      $('#f-' + k).title = o[k] || '';
    }
    $('#autoReconnect').checked = settings.autoReconnect;
    $$('.preview-sound-cb').forEach((x) => { x.checked = settings.previewSound; });
    $('#port').value = settings.port;
  }

  function updateLabels() {
    const o = settings.overlay;
    $('#v-chatDuration').textContent = o.chatDuration + ' giây';
    $('#v-maxCards').textContent = o.maxCards;
    $('#v-volume').textContent = Math.round(o.volume * 100) + '%';
    $('#v-roundEvery').textContent = o.roundEvery ? o.roundEvery + ' phút' : 'Tắt';
    $('#v-chuaRate').textContent = '×' + Number(o.chuaRate).toFixed(2);
    $('#v-rapVolume').textContent = Math.round(o.rapVolume * 100) + '%';
    $('#v-rapRate').textContent = '×' + Number(o.rapRate).toFixed(2);
    $('#v-rapIdleMin').textContent = o.rapIdleMin ? o.rapIdleMin + ' phút' : 'Không bao giờ';
    if (document.activeElement !== $('#rap-name')) $('#rap-name').value = o.rapName || '';
    renderMovies();
    $$('#rap-theme button').forEach((b) => b.classList.toggle('active', b.dataset.theme === (o.rapTheme || 'classic')));
    $('#rap-lights').textContent = o.rapLightsOff ? '💡 Bật đèn phòng' : '🌑 Tắt đèn phòng';
    $('#rap-lights').classList.toggle('on', !!o.rapLightsOff);
    $('#v-liveBoost').textContent = o.liveBoost ? '+' + o.liveBoost + '%' : 'Tắt';
    $('#v-chuaMusicVolume').textContent = Math.round(o.chuaMusicVolume * 100) + '%';
    if (document.activeElement !== $('#chua-name')) $('#chua-name').value = o.chuaName || '';
    $('#v-tutorialEvery').textContent = o.tutorialEvery ? o.tutorialEvery + ' phút' : 'Tắt';
    $('#v-ambientVolume').textContent = Math.round(o.ambientVolume * 100) + '%';
  }

  $$('[data-o]').forEach((el) => {
    const evt = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      const k = el.dataset.o;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if ('num' in el.dataset) v = Number(v) || 0;
      settings.overlay[k] = v;
      updateLabels();
      save({ overlay: { [k]: v } });
    });
  });

  $$('#bg-seg button').forEach((b) => b.addEventListener('click', () => {
    settings.overlay.background = b.dataset.bg;
    renderSettings();
    save({ overlay: { background: b.dataset.bg } }, true);
  }));
  $$('#amb-grid button').forEach((b) => b.addEventListener('click', () => {
    settings.overlay.ambientPreset = b.dataset.amb;
    settings.overlay.ambient = true;
    const patch = { ambientPreset: b.dataset.amb, ambient: true };
    if (settings.overlay.customAmbient) { settings.overlay.customAmbient = ''; patch.customAmbient = ''; }
    renderSettings();
    save({ overlay: patch }, true);
  }));

  const setAccent = (c) => {
    settings.overlay.accent = c;
    renderSettings();
    save({ overlay: { accent: c } });
  };
  $$('#swatches button').forEach((b) => b.addEventListener('click', () => setAccent(b.dataset.c)));
  $('#accent-custom').addEventListener('input', (e) => setAccent(e.target.value));

  $$('[data-pick]').forEach((b) => b.addEventListener('click', async () => {
    const file = await api.pickSound(b.dataset.kind);
    if (!file) return;
    settings.overlay[b.dataset.pick] = file;
    renderSettings();
    save({ overlay: { [b.dataset.pick]: file } }, true);
  }));
  $$('[data-clear]').forEach((b) => b.addEventListener('click', () => {
    settings.overlay[b.dataset.clear] = '';
    renderSettings();
    save({ overlay: { [b.dataset.clear]: '' } }, true);
  }));

  $('#btn-tt-login').addEventListener('click', () => api.tiktokLogin());
  $('#btn-tt-logout').addEventListener('click', async () => {
    await api.tiktokLogout();
    notify('Đã xoá phiên đăng nhập TikTok trên máy');
  });
  $('#autoReconnect').addEventListener('change', (e) => save({ autoReconnect: e.target.checked }, true));
  $('#btn-apply-port').addEventListener('click', async () => {
    const port = Number($('#port').value);
    if (!(port >= 1024 && port <= 65535)) return notify('Cổng phải từ 1024 đến 65535', 'err');
    const r = await api.updateSettings({ port });
    settings = r.settings;
    renderServer(r.server);
    if (r.server.running) notify(`Overlay chạy ở cổng ${port}. Nhớ cập nhật URL trong OBS.`);
  });

  // ---------- Khởi động ----------
  api.onStatus(renderStatus);
  api.onStats(renderStats);
  api.onEvent(addFeed);
  api.onServer(renderServer);

  api.init().then((init) => {
    settings = init.settings;
    vua = init.vua || vua;
    $('#username').value = settings.username;
    $('#ver').textContent = 'v' + init.version;
    renderSettings();
    renderServer(init.server);
    renderStatus({ status: init.live.status, username: init.live.username });
    renderPause(init.paused);
    renderStats({ ...init.live.stats, topGifters: init.live.topGifters });
  });
})();
