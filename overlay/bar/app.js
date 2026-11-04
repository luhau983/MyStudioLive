/*
 * LIVE BAR — glue between MyStudioLive live events (socket.io) and the 3D club scene.
 * Game flow ported from tiktok-live-bar: keyword join ("hey"), chat commands, gift rules,
 * evolution tiers, top-3 podium, combo banner, party energy, camera focus and spotlights.
 */
import { createBarScene } from './scene.js';
import {
  parseChat, resolveGift, evolutionFor, energyFor, addEnergy, bumpCombo, topDonors, joinsFloor,
  allocateSlot, SPOTLIGHT_ACTIONS, FOCUS_ACTIONS, NPC_NAMES, VARIANT_COLORS
} from './rules.mjs';

const $ = (s) => document.querySelector(s);
const stage = $('#stage');
const params = new URLSearchParams(location.search);
const isPreview = params.get('mute') === '1';
if (params.get('safe') === '1') document.body.classList.add('show-safe');

const MAX_PLAYERS = 400;
const PLAYER_TTL_MS = 10 * 60 * 1000;

let cfg = {
  barName: '', barJoinMode: 'keyword', barJoinKeyword: 'hey', barNpc: 5, barEnergyGoal: 1000, barBpm: 128,
  barChroma: false, barMusic: '', barMusicVolume: 0.35, barFireworkSound: true, sound: true, volume: 0.7, filterWords: '', liveBoost: 15
};
let paused = false;

function fit() {
  const s = Math.min(innerWidth / 1080, innerHeight / 1920);
  stage.style.transform = `translate(${(innerWidth - 1080 * s) / 2}px, ${(innerHeight - 1920 * s) / 2}px) scale(${s})`;
}
addEventListener('resize', fit);
fit();

const club = createBarScene($('#club'));
if (params.has('debug')) window.liveBar = club;
$('#club').addEventListener('webglcontextlost', () => setTimeout(() => location.reload(), 300));

// ---------------------------------------------------------------- audio
let actx = null;
function ctx() {
  if (!actx) { try { actx = new AudioContext(); } catch { return null; } }
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  return actx;
}
const muted = () => !cfg.sound || isPreview;
function crackle(delay = 0) {
  const a = ctx();
  if (!a) return;
  const len = a.sampleRate * 0.9;
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4) * (Math.random() < 0.08 ? 1 : 0.35);
  const src = a.createBufferSource(); src.buffer = buf;
  const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
  const g = a.createGain(); g.gain.value = 0.5 * cfg.volume;
  src.connect(hp).connect(g).connect(a.destination);
  src.start(a.currentTime + delay);
  // boom
  const o = a.createOscillator(); const og = a.createGain();
  o.frequency.setValueAtTime(120, a.currentTime + delay); o.frequency.exponentialRampToValueAtTime(35, a.currentTime + delay + 0.5);
  og.gain.setValueAtTime(0.7 * cfg.volume, a.currentTime + delay); og.gain.exponentialRampToValueAtTime(0.001, a.currentTime + delay + 0.6);
  o.connect(og).connect(a.destination); o.start(a.currentTime + delay); o.stop(a.currentTime + delay + 0.7);
}
club.setSfx((name) => {
  if (name === 'fireworks' && !muted() && cfg.barFireworkSound) for (let i = 0; i < 4; i++) crackle(i * 0.72);
});
const music = new Audio();
music.loop = true;
function syncMusic() {
  if (cfg.barMusic && !muted() && !paused) {
    const src = '/media/barMusic?v=' + encodeURIComponent(cfg.barMusic);
    if (!music.src.endsWith(src)) music.src = src;
    music.volume = Math.min(1, cfg.volume * cfg.barMusicVolume * 1.4);
    music.play().catch(() => {});
  } else music.pause();
}

// ---------------------------------------------------------------- HUD
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const feed = $('.b-feed');
function addFeed(parts, color = '#fff') {
  const it = el('div', 'it');
  it.style.setProperty('--c', color);
  for (const p of parts) it.append(typeof p === 'string' ? p : el('b', null, p.b));
  feed.append(it);
  while (feed.children.length > 6) feed.firstChild.remove();
  setTimeout(() => it.classList.add('out'), 8000);
  setTimeout(() => it.remove(), 8700);
}
let bannerTimer = 0;
function banner(text, combo, seconds) {
  const b = $('.b-banner');
  $('.bb-text').textContent = text;
  $('.bb-combo').textContent = combo > 1 ? `COMBO x${combo}` : '';
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('on'), Math.min(10, Math.max(3, seconds)) * 1000);
}
const energyState = { energy: 0 };
function renderEnergy() {
  const v = energyState.energy / Math.max(10, cfg.barEnergyGoal);
  $('.b-energy-fill').style.width = (Math.min(1, v) * 100).toFixed(1) + '%';
  club.setEnergy(v);
}
function renderTop() {
  const top = topDonors(donors, 3);
  $('.b-top').classList.toggle('has', top.length > 0);
  $('.bt-list').replaceChildren(...top.map((d, i) => {
    const li = el('li');
    li.append(el('span', 'rk', String(i + 1)), el('span', 'nm', d.nickname), el('span', 'sc', fmt(d.score) + ' 💎'));
    return li;
  }));
  club.ranks(top.map((d) => d.key));
}
const GUIDE = [
  ['dance', 'nhảy cực sung'], ['nhảy', 'bật nhảy'], ['đi vòng', 'dạo quanh sàn'], ['đổi nv', 'đổi nhân vật'],
  ['🎁 Hoa hồng', 'zoom camera'], ['🎁 100💎', 'VIP camera'], ['🎁 500💎', 'mưa pháo hoa']
];
let guideIdx = 0;
function rotateGuide() {
  const row = $('.bg-row.rot');
  row.classList.add('swap');
  setTimeout(() => {
    const [k, d] = GUIDE[guideIdx];
    row.replaceChildren(el('span', 'key' + (k.startsWith('🎁') ? ' gift' : ''), k), d);
    row.classList.remove('swap');
    guideIdx = (guideIdx + 1) % GUIDE.length;
  }, 350);
}
rotateGuide();
setInterval(rotateGuide, 5000);

// ---------------------------------------------------------------- players
const players = new Map(); // key -> { key, user, npc, slot, giftPower, tier, lastActive }
const donors = new Map();  // key -> { key, nickname, score }
const combos = new Map();
const keyOf = (u) => String(u?.id || u?.uniqueId || u?.nickname || '').slice(0, 80);

function blocked(text) {
  const words = String(cfg.filterWords || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  const t = String(text || '').toLowerCase();
  return words.some((w) => t.includes(w));
}

function addPlayer(user, npc = false) {
  const key = npc ? user.key : keyOf(user);
  let p = players.get(key);
  if (p) {
    p.user = { ...p.user, ...user, avatar: user.avatar || p.user.avatar };
    p.lastActive = Date.now();
    club.upsert({ key, ...p.user });
    return p;
  }
  if (!npc) {
    removeOneNpc();
    if ([...players.values()].filter((x) => !x.npc).length >= MAX_PLAYERS) removeOldest();
  }
  const slot = allocateSlot([...players.values()].map((x) => x.slot));
  p = { key, user, npc, slot, giftPower: 0, tier: 0, lastActive: Date.now() };
  players.set(key, p);
  club.upsert({ key, ...user }, { npc, slot });
  const d = donors.get(key);
  if (d) { p.giftPower = d.score; applyEvolution(p, false); renderTop(); }
  return p;
}
function removePlayer(key) {
  players.delete(key);
  club.remove(key);
}
function removeOldest() {
  const top = new Set(topDonors(donors, 3).map((d) => d.key));
  const old = [...players.values()].filter((p) => !p.npc && !top.has(p.key)).sort((a, b) => a.lastActive - b.lastActive)[0];
  if (old) removePlayer(old.key);
}
function removeOneNpc() {
  const npc = [...players.values()].reverse().find((p) => p.npc);
  if (npc) removePlayer(npc.key);
}
function ensureNpcs() {
  const real = [...players.values()].filter((p) => !p.npc).length;
  const want = Math.max(0, Math.min(Number(cfg.barNpc) || 0, 40) - real);
  const npcs = [...players.values()].filter((p) => p.npc);
  for (let i = npcs.length; i < want; i++) {
    const free = NPC_NAMES.findIndex((n, j) => !players.has('npc-' + j));
    if (free < 0) break;
    addPlayer({ key: 'npc-' + free, nickname: NPC_NAMES[free], avatar: '' }, true);
  }
  for (let i = npcs.length - 1; i >= want; i--) removePlayer(npcs[i].key);
}
setInterval(() => {
  const cut = Date.now() - PLAYER_TTL_MS;
  const top = new Set(topDonors(donors, 3).map((d) => d.key));
  let removed = false;
  for (const p of [...players.values()]) if (!p.npc && p.lastActive < cut && !top.has(p.key)) { removePlayer(p.key); removed = true; }
  if (removed) setTimeout(ensureNpcs, 30000); // fill the floor again a bit later
}, 10000);

function applyEvolution(p, announce = true) {
  const t = evolutionFor(p.giftPower);
  if (!t || t.tier <= p.tier) return;
  p.tier = t.tier;
  club.variant(p.key, t.variant);
  if (announce) {
    club.title(p.key, t.label, t.variant, 6);
    addFeed([{ b: p.user.nickname }, ' lên cấp ', { b: t.label }], VARIANT_COLORS[t.variant]);
  }
}

function applyAction(key, action, seconds, label, variant) {
  if (action === 'join') return;
  const s = ['camera', 'vip', 'topdj', 'fireworks', 'medal'].includes(action) ? Math.min(15, Math.max(2.5, seconds))
    : ['dance'].includes(action) ? Math.min(10, Math.max(2, seconds)) : seconds;
  club.act(key, ['camera', 'vip', 'topdj', 'fireworks', 'medal'].includes(action) ? 'celebrate' : action, s);
  if (label && ['medal', 'vip', 'topdj'].includes(action)) club.title(key, label, variant || (action === 'medal' ? 'fire' : 'royal'), Math.max(3, seconds));
}

function party() {
  club.danceAll(7);
  club.fireworks(5);
  club.drop();
  banner('PARTY ENERGY MAX — CẢ SÀN CÙNG QUẨY', 0, 6);
  $('.b-energy').classList.remove('full'); void $('.b-energy').offsetWidth; $('.b-energy').classList.add('full');
}
function gainEnergy(ev) {
  const bursts = addEnergy(energyState, energyFor(ev), cfg.barEnergyGoal);
  if (bursts) party();
  renderEnergy();
}

// ---------------------------------------------------------------- live events
function onLive(ev) {
  if (!ev || !ev.type || paused) return;
  if (ev.type === 'giftStreak') return; // wait for the final gift event of a combo
  if (ev.type === 'chat' && (blocked(ev.text) || blocked(ev.user?.nickname))) return;
  gainEnergy(ev);
  const key = keyOf(ev.user);
  if (!key) return;
  const cmd = ev.type === 'chat' ? parseChat(ev.text, cfg.barJoinKeyword) : null;
  const known = players.has(key) && !players.get(key).npc;
  if (ev.type === 'chat') addFeed([{ b: ev.user.nickname }, ': ' + String(ev.text).slice(0, 60)], '#e2e8f0');
  if (!joinsFloor(ev, cmd, { joinMode: cfg.barJoinMode, known })) return;
  const p = addPlayer(ev.user);
  const joinedNow = !known;

  switch (ev.type) {
    case 'chat':
      if (cmd?.action === 'join') {
        if (joinedNow) { club.welcome(key, 2.5); addFeed([{ b: ev.user.nickname }, ' vào sàn 🎉'], '#67e8f9'); } else club.act(key, 'celebrate', 2);
      } else if (cmd) applyAction(key, cmd.action, cmd.durationMs / 1000);
      else if (joinedNow) club.welcome(key, 2.5);
      break;
    case 'join':
      if (joinedNow) club.welcome(key, 2.5);
      break;
    case 'follow':
    case 'share':
      club.act(key, 'celebrate', 4);
      club.welcome(key, 2);
      addFeed([{ b: ev.user.nickname }, ev.type === 'follow' ? ' đã theo dõi 💜' : ' đã chia sẻ live 🔗'], '#fde68a');
      break;
    case 'gift': {
      const total = Math.max(0, Number(ev.total ?? (ev.diamonds || 0) * (ev.repeatCount || 1)) || 0);
      const rule = resolveGift(ev.giftName, total);
      const seconds = rule.durationMs / 1000;
      p.giftPower += total;
      const d = donors.get(key) || { key, nickname: ev.user.nickname, score: 0 };
      d.nickname = ev.user.nickname || d.nickname; d.score += total;
      donors.set(key, d);
      const combo = bumpCombo(combos, key);
      const gift = (ev.repeatCount > 1 ? `${ev.repeatCount}× ` : '') + (ev.giftName || 'Quà');
      banner(`${ev.user.nickname} đã tặng ${gift} cho anh em bar!`, combo, seconds);
      addFeed([{ b: ev.user.nickname }, ` tặng ${gift} (+${fmt(total)} 💎)`], '#f0abfc');
      applyAction(key, rule.action, seconds, rule.label, rule.variant);
      applyEvolution(p);
      renderTop();
      if (SPOTLIGHT_ACTIONS.has(rule.action) && total >= 20) club.spotlight(key, seconds, total >= 100);
      if (rule.action === 'fireworks' || rule.action === 'topdj' || total >= 500) club.fireworks(Math.max(4, rule.fireworkBursts || 4));
      if (FOCUS_ACTIONS.has(rule.action)) {
        const opts = rule.action === 'fireworks' ? { sky: true }
          : rule.action === 'walk' ? { wide: true }
            : { close: rule.action === 'vip' || rule.action === 'topdj' || total >= 100 };
        club.focus(key, rule.action === 'fireworks' ? Math.max(6, seconds) : seconds, opts);
      }
      break;
    }
  }
}

// ---------------------------------------------------------------- dashboard commands
let demoN = 0;
const DEMO_NAMES = ['Minh Anh', 'Tuấn Kiệt', 'Bảo Ngọc', 'Gia Huy', 'Khánh Linh', 'Quốc Bảo', 'Thảo Vy', 'Đức Anh', 'Hải Yến', 'Phúc Lâm'];
function demoUser() {
  demoN++;
  const n = DEMO_NAMES[demoN % DEMO_NAMES.length] + ' ' + demoN;
  return { id: 'demo-bar-' + demoN, uniqueId: 'demo' + demoN, nickname: n, avatar: '' };
}
function onCommand(c) {
  if (!c || paused) return;
  switch (c.action) {
    case 'party': party(); break;
    case 'fireworks': club.fireworks(6); break;
    case 'drop': club.drop(); break;
    case 'crowd': {
      const n = Math.min(400, Math.max(1, Number(c.n) || 30));
      let i = 0;
      const t = setInterval(() => {
        if (i++ >= n) return clearInterval(t);
        onLive({ type: 'chat', user: demoUser(), text: cfg.barJoinKeyword || 'hey' });
      }, n > 60 ? 25 : 120);
      break;
    }
    case 'reset':
      for (const p of [...players.values()]) removePlayer(p.key);
      donors.clear(); combos.clear(); energyState.energy = 0;
      renderTop(); renderEnergy(); feed.replaceChildren();
      ensureNpcs();
      break;
  }
}

// ---------------------------------------------------------------- config
function applyConfig(next) {
  const prevNpc = cfg.barNpc;
  cfg = { ...cfg, ...next };
  const title = cfg.barName || 'LIVE BAR';
  $('#guide-join').textContent = cfg.barJoinMode === 'all' ? 'bình luận' : (cfg.barJoinKeyword || 'hey');
  club.setTitle(title, cfg.barJoinMode === 'all' ? 'BÌNH LUẬN ĐỂ VÀO SÀN' : `GÕ "${cfg.barJoinKeyword || 'hey'}" ĐỂ VÀO SÀN`);
  club.setBpm(cfg.barBpm);
  club.setChroma(!!cfg.barChroma);
  document.body.classList.toggle('chroma', !!cfg.barChroma);
  const b = Math.max(0, Math.min(40, Number(cfg.liveBoost ?? 15))) / 100;
  $('#club').style.filter = b && !cfg.barChroma ? `saturate(${(1 + b).toFixed(3)}) contrast(${(1 + b * 0.3).toFixed(3)}) brightness(${(1 + b * 0.25).toFixed(3)})` : '';
  if (prevNpc !== cfg.barNpc || players.size === 0) ensureNpcs();
  renderEnergy();
  syncMusic();
}

function setPaused(p) {
  paused = !!p;
  document.body.classList.toggle('paused', paused);
  club.setPaused(paused);
  syncMusic();
}

// ---------------------------------------------------------------- socket
const socket = window.io({ reconnectionDelayMax: 3000 });
socket.on('connect', () => $('#offline').classList.add('hidden'));
socket.on('disconnect', () => $('#offline').classList.remove('hidden'));
socket.on('config', applyConfig);
socket.on('pause', setPaused);
socket.on('live', onLive);
socket.on('bar', onCommand);
socket.on('stats', (s) => {
  // seed the podium after a reload with the session's top gifters
  if (donors.size || !Array.isArray(s?.topGifters)) return;
  for (const g of s.topGifters) {
    const key = keyOf(g);
    if (key && g.diamonds > 0) donors.set(key, { key, nickname: g.nickname || 'Ẩn danh', score: g.diamonds });
  }
  renderTop();
});
// mode changed in the app: go back through "/" so the server serves the right scene
socket.on('reload', () => location.replace('/' + location.search));
if (window.parent !== window) {
  setInterval(() => { try { window.parent.postMessage({ studioAlive: true }, '*'); } catch { /* ignore */ } }, 1000);
}
addEventListener('pointerdown', () => ctx());
ensureNpcs();
renderTop();
