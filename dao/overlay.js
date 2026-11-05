// Đảo Sinh Tồn overlay: WebSocket client, HUD, kill feed, banners and TTS commentary.
import { createStage } from './stage.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const silent = params.get('silent') === '1' || params.get('mute') === '1';
const stage = createStage($('gl'), $('labels'));
if (!stage) $('no-webgl').hidden = false;

const PHASE = { lobby: 'CHỜ NHẢY DÙ', drop: 'ĐANG NHẢY DÙ', loot: 'NHẶT ĐỒ', storm: 'BÃO', final: 'CHUNG KẾT', result: 'KẾT QUẢ' };
const ZONE_NAMES = { bac: 'Bắc', nam: 'Nam', dong: 'Đông', tay: 'Tây' };
const CLASS_NAMES = { warrior: '⚔️ Chiến binh', archer: '🏹 Cung thủ', ninja: '🥷 Ninja' };
const EFFECT_TEXT = {
  heal: 'hồi máu', shield: 'bật khiên', airdrop: 'gọi hòm tiếp tế', revive: 'HỒI SINH', 'shield+heal': 'khiên + hồi máu',
  meteor: 'MƯA THIÊN THẠCH ☄️', 'final-locked': 'cổ vũ chung kết', dead: 'cổ vũ', 'revive-used': 'cổ vũ'
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let studioPort = 0, tts = true, last = null, lastPhaseKey = '';

// ---------- TTS (StudioLive /api/tts) ----------
const speech = [];
let speaking = false;
function say(text) {
  if (silent || !tts || !studioPort) return;
  if (speech.length > 3) speech.shift();
  speech.push(text); pump();
}
function pump() {
  if (speaking || !speech.length) return;
  speaking = true;
  const a = new Audio(`${location.protocol}//${location.hostname}:${studioPort}/api/tts?text=${encodeURIComponent(speech.shift())}&rate=1.1`);
  a.volume = 0.9;
  const done = () => { speaking = false; pump(); };
  a.onended = done; a.onerror = done;
  a.play().catch(done);
}

// ---------- HUD ----------
function fmt(ms) { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s); }

function help(f, ghost) {
  if (f.phase === 'lobby') return 'Comment <em>VÀO</em> để lên đảo <i>•</i> <em>CHIẾN</em>/<em>CUNG</em>/<em>NINJA</em> chọn lớp <i>•</i> <em>BẮC</em>/<em>NAM</em>/<em>ĐÔNG</em>/<em>TÂY</em> chọn nơi đáp';
  if (f.phase === 'result') return 'Ván mới sắp bắt đầu — comment <em>VÀO</em> để giữ chỗ';
  if (f.phase === 'storm' && !f.storm.shrinking) return 'Đã bị loại? Comment <em>BÃO 1</em>/<em>2</em>/<em>3</em> chọn tâm bão <i>•</i> Còn sống: <em>TRỐN</em> <em>XÔNG</em> <em>HỒI</em>';
  return 'Comment <em>TRỐN</em> <em>XÔNG</em> <em>HỒI</em> <i>•</i> ❤ thả tim hồi máu <i>•</i> 🎁 quà = khiên, tiếp tế, hồi sinh <i>•</i> <em>VỊ TRÍ</em> tìm mình';
}

function render(f) {
  last = f;
  $('round').textContent = `Ván ${f.round}`;
  const label = f.phase === 'storm' ? (f.storm.shrinking ? 'BÃO ĐANG ÉP' : 'BÃO SẮP ĐẾN') : PHASE[f.phase] || '';
  $('phase').textContent = f.paused ? 'TẠM DỪNG' : f.phase === 'lobby' && !f.enrolled ? 'CHỜ NGƯỜI CHƠI' : label;
  $('timer').textContent = f.phase === 'lobby' && !f.enrolled ? '--' : fmt(f.remainingMs);
  $('stage-label').textContent = f.phase === 'storm' ? `Vòng bão ${f.storm.stage + 1}/4` : f.queued ? `${f.queued} người chờ ván sau` : '';
  $('alive').textContent = f.phase === 'lobby' ? f.enrolled : f.alive;
  $('zombies').hidden = !f.zombies; $('zombies').textContent = `🧟 ${f.zombies}`;
  $('hype-fill').style.width = `${(100 * f.hype.value) / f.hype.max}%`;
  $('hype-text').textContent = `${f.hype.value}/${f.hype.max} ❤ → hòm tiếp tế`;
  $('help').innerHTML = help(f);
  feed.hidden = f.phase === 'lobby' || f.phase === 'result';
  renderLobby(f);
  renderResult(f);
  const key = `${f.round}:${f.phase}:${f.storm.stage}:${f.storm.shrinking}`;
  if (key !== lastPhaseKey) { onPhase(f, lastPhaseKey); lastPhaseKey = key; }
  stage?.setFrame(f);
}

let lastLobbyKey = '';
function renderLobby(f) {
  $('lobby').hidden = f.phase !== 'lobby';
  if (f.phase !== 'lobby' || !f.lobby) return;
  const key = JSON.stringify([f.enrolled, f.lobby]);
  if (key === lastLobbyKey) return;
  lastLobbyKey = key;
  $('lobby-count').textContent = f.enrolled;
  const bars = (obj, names) => { const max = Math.max(1, ...Object.values(obj)); return Object.entries(obj).map(([k, n]) => `<li><span>${names[k]}</span><i style="width:${(100 * n) / max}%"></i><b>${n}</b></li>`).join(''); };
  $('lobby-zones').innerHTML = bars(f.lobby.zones, ZONE_NAMES);
  $('lobby-classes').innerHTML = bars(f.lobby.classes, CLASS_NAMES);
  $('lobby-recent').innerHTML = f.lobby.recent.slice(-8).map((n) => `<span>${esc(n)}</span>`).join('');
}

function renderBoard(list) {
  $('board').innerHTML = (list || []).slice(0, 5).map((p) => `<li>${esc(p.nickname)} <span>🏆${p.wins} · ⚔${p.kills}</span></li>`).join('');
}

let resultRound = 0;
function renderResult(f) {
  $('result').hidden = f.phase !== 'result';
  if (f.phase !== 'result' || !f.result || resultRound === f.round) return;
  resultRound = f.round;
  const r = f.result;
  $('result-call').textContent = r.winner ? 'VÔ ĐỊCH!' : 'ĐẢO THẤT THỦ 🧟';
  const card = (p, i) => p ? `<div class="p p${i + 1}"><div class="rank">${['🥇', '🥈', '🥉'][i]}</div>${p.avatar ? `<img src="${esc(p.avatar)}" referrerpolicy="no-referrer" alt="">` : `<span class="ph">${esc(p.nickname.slice(0, 1).toUpperCase())}</span>`}<b>${esc(p.nickname)}</b><small>⚔ ${p.kills} hạ gục</small></div>` : '';
  $('podium').innerHTML = r.podium.map(card).join('');
  $('mvp').innerHTML = r.mvp && r.mvp.kills ? `⭐ MVP: <b>${esc(r.mvp.nickname)}</b> · ${r.mvp.kills} hạ gục` : '';
  if (r.winner) say(`Chúc mừng ${r.winner.nickname} đã vô địch Đảo Sinh Tồn với ${r.winner.kills} lần hạ gục!`);
  else say('Đảo đã thất thủ! Comment vào để chiến ván sau nhé.');
}

function banner(title, sub = '') {
  const b = $('banner');
  b.hidden = true; void b.offsetWidth;
  b.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  b.hidden = false;
  clearTimeout(banner.t); banner.t = setTimeout(() => { b.hidden = true; }, 2600);
}

function onPhase(f, prev) {
  if (!prev) return;
  if (f.phase === 'drop') { banner('NHẢY DÙ!', `${f.humansAtStart} người lên đảo`); say(`Ván ${f.round} bắt đầu! ${f.humansAtStart} người đang nhảy dù xuống đảo.`); }
  else if (f.phase === 'loot') banner('NHẶT ĐỒ!', 'Tìm hòm vũ khí trước khi bão đến');
  else if (f.phase === 'storm' && !f.storm.shrinking) { banner(`BÃO VÒNG ${f.storm.stage + 1}`, 'Hồn ma comment BÃO 1/2/3 để chọn tâm bão'); if (f.storm.stage === 0) say('Bão sắp đến! Các hồn ma hãy chọn tâm bão.'); }
  else if (f.phase === 'storm' && f.storm.shrinking) { banner('BÃO ĐANG ÉP VÀO!', `Còn ${f.alive} người`); say(`Bão đang ép vào! Còn ${f.alive} người sống sót.`); }
  else if (f.phase === 'final') { banner('CHUNG KẾT!', `${f.alive} người cuối cùng`); say(`Trận chung kết! Chỉ còn ${f.alive} người.`); }
}

// ---------- kill feed ----------
const feed = $('feed');
let killWindow = 0, killBurst = 0, burstEl = null;
function feedLine(html, cls = '') {
  const d = document.createElement('div');
  d.className = cls; d.innerHTML = html;
  feed.prepend(d);
  while (feed.children.length > 7) feed.lastChild.remove();
  setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 700); }, 6000);
  return d;
}
function onKill(ev) {
  const t = performance.now();
  if (t - killWindow > 1000) { killWindow = t; killBurst = 0; burstEl = null; }
  killBurst++;
  if (killBurst > 3) {
    const text = `💀 ${killBurst - 3} người nữa bị loại`;
    if (burstEl?.isConnected) burstEl.textContent = text; else burstEl = feedLine(esc(text), 'storm');
    return;
  }
  if (ev.victimZombie) { feedLine(`${esc(ev.killer || '?')} hạ 🧟 zombie`, 'zombie'); return; }
  if (ev.cause === 'storm') feedLine(`🌪️ Bão cuốn <b>${esc(ev.victim)}</b>`, 'storm');
  else if (ev.cause === 'meteor') feedLine(`☄️ <b>${esc(ev.victim)}</b> trúng thiên thạch`, 'storm');
  else if (ev.killerZombie) feedLine(`🧟 Zombie cắn <b>${esc(ev.victim)}</b>`, 'zombie');
  else feedLine(`<b>${esc(ev.killer)}</b> ⚔ ${esc(ev.victim)}`);
  if (last && last.phase !== 'lobby' && last.alive === 10 && !onKill.said10) { onKill.said10 = true; say('Chỉ còn mười người!'); }
}

let toastTimer;
function onEvent(ev) {
  if (ev.type === 'kill') onKill(ev);
  else if (ev.type === 'kills-hidden') feedLine(`💀 +${ev.count} người bị loại`, 'storm');
  else if (ev.type === 'gift') {
    const text = EFFECT_TEXT[ev.effect] || 'tặng quà';
    feedLine(`🎁 <b>${esc(ev.nickname)}</b> ${esc(text)}`, 'gift');
    if (ev.tier >= 4) {
      const t = $('gift-toast'); t.hidden = true; void t.offsetWidth;
      t.textContent = `🎁 ${ev.nickname} — ${text}!`; t.hidden = false;
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
      if (ev.effect === 'meteor') { banner('MƯA THIÊN THẠCH!', `Quà khủng từ ${ev.nickname}`); say(`Cảm ơn ${ev.nickname}! Mưa thiên thạch đang rơi!`); }
      else if (ev.effect === 'revive') say(`${ev.nickname} đã hồi sinh!`);
    }
  } else if (ev.type === 'supply') { banner('HÒM TIẾP TẾ!', 'Cả phòng thả tim đầy thanh hype'); feedLine('📦 Hòm tiếp tế đã thả xuống', 'gift'); }
  else if (ev.type === 'revive') feedLine(`✨ <b>${esc(ev.nickname)}</b> hồi sinh`, 'gift');
  else if (ev.type === 'position') stage?.focus(ev.uniqueId);
  else if (ev.type === 'phase' && ev.phase === 'lobby') { onKill.said10 = false; }
}

// ---------- socket ----------
function navigateToStudio(port) {
  if (!params.has('sl') || !Number.isInteger(port)) return;
  const q = new URLSearchParams(location.search); q.delete('sl'); q.delete('silent');
  const s = q.toString().replace(/=(&|$)/g, '$1');
  location.replace(`${location.protocol}//${location.hostname}:${port}/${s ? '?' + s : ''}`);
}
let retry;
function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => { $('connection').hidden = true; };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === 'frame') render(m.f);
    else if (m.type === 'roster') stage?.setRoster(m.roster);
    else if (m.type === 'event') onEvent(m.ev);
    else if (m.type === 'state') renderBoard(m.leaderboard);
    else if (m.type === 'hello') { studioPort = m.studioPort; tts = m.tts; }
    else if (m.type === 'navigate') navigateToStudio(m.port);
  };
  ws.onclose = () => { $('connection').hidden = false; clearTimeout(retry); retry = setTimeout(connect, 2000); };
  ws.onerror = () => ws.close();
}
connect();
