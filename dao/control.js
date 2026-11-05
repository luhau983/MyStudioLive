'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const PHASE = { lobby: 'Chờ nhảy dù', drop: 'Nhảy dù', loot: 'Nhặt đồ', storm: 'Bão', final: 'Chung kết', result: 'Kết quả' };
  const CLS = { warrior: 'Chiến binh', archer: 'Cung thủ', ninja: 'Ninja' };
  const ZONE = { bac: 'Bắc', nam: 'Nam', dong: 'Đông', tay: 'Tây' };
  const LIVE = { connected: '🔴 Đang live', connecting: 'Đang kết nối…', reconnecting: 'Đang kết nối lại…', disconnected: 'Chưa kết nối live — kết nối ở Bảng điều khiển StudioLive' };
  let ws, configLoaded = false, lastPlayers = '';

  const send = (m) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); };
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`; };

  function render(m) {
    const s = m.state;
    $('#live').textContent = (LIVE[m.live.status] || m.live.status) + (m.live.username ? ` @${m.live.username}` : '') + (m.practice ? ' · 🧪 luyện tập' : m.simulated ? ' · giả lập' : '');
    $('#phase').textContent = s.paused ? 'Tạm dừng' : s.phase === 'storm' ? `Bão ${s.storm.stage + 1}/4${s.storm.shrinking ? ' · đang ép' : ''}` : PHASE[s.phase];
    $('#s-round').textContent = s.round;
    $('#s-timer').textContent = s.phase === 'lobby' && !s.enrolled ? '--' : fmt(s.remainingMs);
    $('#s-enrolled').textContent = s.enrolled;
    $('#s-alive').textContent = s.alive;
    $('#s-zombies').textContent = s.zombies;
    $('#s-queued').textContent = s.queued;
    $('#practice').checked = m.practice;
    const offline = m.live.status !== 'disconnected';
    document.querySelectorAll('[data-sim], #practice').forEach((b) => { b.disabled = offline; });
    if (!configLoaded) {
      configLoaded = true;
      for (const el of $('#config').elements) {
        if (!el.name) continue;
        if (el.type === 'checkbox') el.checked = !!m.config[el.name]; else el.value = m.config[el.name];
      }
    }
    const players = [...s.players].sort((a, b) => (b.alive === true) - (a.alive === true) || b.kills - a.kills).slice(0, 80);
    const key = JSON.stringify(players);
    if (key !== lastPlayers) {
      lastPlayers = key;
      $('#p-count').textContent = s.players.length ? `(${s.players.length})` : '';
      $('#players').innerHTML = players.map((p) => `<tr class="${p.alive === false ? 'dead' : ''}"><td>${esc(p.nickname)}</td><td>${CLS[p.cls] || ''}</td><td>${ZONE[p.zone] || ''}</td><td>${p.hp ?? '—'}</td><td>${p.kills}</td><td><button data-kick="${esc(p.uniqueId)}" title="Loại khỏi phiên live này">Loại</button></td></tr>`).join('');
    }
    $('#board').innerHTML = m.leaderboard.map((p) => `<li>${esc(p.nickname)} <span>· 🏆${p.wins} · top3 ${p.top3} · ⚔${p.kills}</span></li>`).join('') || '<li class="muted">Chưa có dữ liệu</li>';
    $('#season-since').textContent = m.seasonStartedAt ? `Từ ${new Date(m.seasonStartedAt).toLocaleDateString('vi-VN')}` : '';
    $('#log').innerHTML = [...m.logs].reverse().map((l) => `<li><time>${new Date(l.at).toLocaleTimeString('vi-VN')}</time>${esc(l.msg)}</li>`).join('');
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cmd) send({ type: b.dataset.cmd });
    if (b.dataset.sim) send({ type: 'simulate', event: b.dataset.sim, count: Number(b.dataset.n) });
    if (b.dataset.kick && confirm('Loại người này khỏi phiên live? Họ sẽ không vào lại được cho tới khi khởi động lại app.')) send({ type: 'kick', uniqueId: b.dataset.kick });
    if (b.id === 'season-reset' && confirm('Xoá toàn bộ bảng xếp hạng mùa?')) send({ type: 'season-reset' });
  });
  $('#practice').addEventListener('change', (e) => send({ type: 'practice', on: e.target.checked }));
  $('#config').addEventListener('submit', (e) => {
    e.preventDefault();
    const config = {};
    for (const el of e.target.elements) if (el.name) config[el.name] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : Math.round(Number(el.value));
    send({ type: 'config', config });
    $('#saved').textContent = 'Đã lưu';
    setTimeout(() => { $('#saved').textContent = ''; }, 2000);
  });

  function connect() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'state') render(m);
      if (m.type === 'error') { const el = $('#error'); el.textContent = m.message; el.hidden = false; clearTimeout(connect.t); connect.t = setTimeout(() => { el.hidden = true; }, 4000); }
    };
    ws.onclose = () => setTimeout(connect, 2000);
  }
  connect();
})();
