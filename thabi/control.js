(() => {
  const $ = (s) => document.querySelector(s);
  let socket, retry, formFilled = false, lastPlayersKey = '';
  const PHASES = { lobby: 'Đang chờ bắt đầu', play: 'Đang thả bi', result: 'Kết quả' };
  const send = (m) => socket?.readyState === 1 && socket.send(JSON.stringify(m));
  const toast = (text) => { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3500); };
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`; };

  document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => send({ type: b.dataset.cmd })));
  document.querySelectorAll('[data-sim]').forEach((b) => b.addEventListener('click', () => {
    const n = Number($('#sim-number').value);
    send({ type: 'simulate', event: b.dataset.sim, ...(n ? { number: n } : {}) });
  }));
  $('#audio-test').addEventListener('click', () => send({ type: 'audio-test' }));
  const sendAudio = () => send({ type: 'audio', volume: Number($('#volume').value), muted: $('#muted').checked });
  $('#volume').addEventListener('change', sendAudio);
  $('#muted').addEventListener('change', sendAudio);
  $('#config').addEventListener('submit', (e) => {
    e.preventDefault();
    const config = {};
    for (const input of e.target.querySelectorAll('input')) config[input.name] = Number(input.value);
    send({ type: 'config', config });
  });

  function render(m) {
    const s = m.state;
    $('#phase').textContent = PHASES[s.phase] || s.phase;
    $('#live').textContent = m.standalone ? 'Chạy độc lập (chỉ giả lập)'
      : m.live.status === 'connected' ? `TikTok: @${m.live.username} đang live` : m.live.status === 'connecting' ? 'TikTok: đang kết nối…' : 'TikTok: chưa kết nối — kết nối ở Bảng điều khiển StudioLive';
    $('#total').textContent = s.counts.total; $('#onboard').textContent = s.counts.onBoard; $('#landed').textContent = s.counts.landed;
    $('#leader').textContent = s.top[0] ? `${s.top[0].nickname} · ${s.top[0].score}` : '—';
    $('#timer').textContent = s.phaseLeftMs > 0 ? fmt(s.phaseLeftMs) : '--';
    if (!formFilled) {
      for (const input of $('#config').querySelectorAll('input')) input.value = s.config[input.name];
      $('#volume').value = m.audio.volume; $('#muted').checked = m.audio.muted;
      formFilled = true;
    }
    const players = [...s.players].sort((a, b) => b.score - a.score || a.number - b.number);
    const key = players.map((p) => p.id + ':' + p.score).join('|');
    if (key !== lastPlayersKey) {
      lastPlayersKey = key;
      const box = $('#players'); box.textContent = '';
      for (const p of players.slice(0, 200)) {
        const el = document.createElement('span');
        el.className = 'chip';
        el.textContent = `#${String(p.number).padStart(3, '0')} ${p.nickname} `;
        const b = document.createElement('b'); b.textContent = `${p.score}đ · ${p.balls} bi`; el.append(b);
        box.append(el);
      }
      if (!players.length) box.textContent = 'Chưa có ai.';
    }
  }

  function connect() {
    socket = new WebSocket(`ws://${location.host}/ws`);
    socket.onopen = () => { $('#socket').textContent = '● Đã kết nối server'; $('#socket').className = 'status on'; };
    socket.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'state') render(m);
      if (m.type === 'error') toast(m.message);
    };
    socket.onclose = () => { $('#socket').textContent = '● Mất kết nối server'; $('#socket').className = 'status off'; clearTimeout(retry); retry = setTimeout(connect, 2000); };
  }
  connect();
})();
