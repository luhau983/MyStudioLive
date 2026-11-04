/*
 * LIVE BAR — pure game rules (no DOM, no three.js) so they can be unit-tested with node:test.
 * Ported from tiktok-live-bar (TikTokBridge/config/gifts.json, src/master/rules.js,
 * Unity PlayerManager / TikTokGameController / GiftEffectManager).
 */

export const ACTIONS = ['join', 'dance', 'jump', 'walk', 'change', 'grow', 'camera', 'medal', 'vip', 'topdj', 'fireworks'];

// Gifts matched by name first (aliases are compared after removing Vietnamese accents)
export const GIFT_BY_NAME = [
  { aliases: ['rose', 'hoa hong'], action: 'camera', durationMs: 4000, label: 'ZOOM CAMERA' },
  { aliases: ['tiktok', 'tik tok'], action: 'change', durationMs: 2500, label: 'ĐỔI NHÂN VẬT' },
  { aliases: ['finger heart', 'trai tim ngon tay', 'tim ngon tay'], action: 'walk', durationMs: 5000, label: 'ĐI VÒNG' },
  { aliases: ['rosa'], action: 'medal', durationMs: 60000, label: 'CÁNH VIP', variant: 'fire' },
  { aliases: ['portal', 'cong khong gian'], action: 'grow', durationMs: 8000, label: 'NHÂN VẬT KHỔNG LỒ' },
  { aliases: ['galaxy', 'interstellar', 'ngoi sao', 'tiktok universe', 'universe'], action: 'topdj', durationMs: 12000, label: 'TOP DJ', fireworkBursts: 6 }
];

// Otherwise matched by total diamonds of the gift (highest band first)
export const DIAMOND_BANDS = [
  { minimum: 1000, action: 'fireworks', durationMs: 15000, label: 'ĐẠI GIA MỞ TIỆC', fireworkBursts: 6 },
  { minimum: 500, action: 'fireworks', durationMs: 12000, label: 'MƯA PHÁO HOA', fireworkBursts: 4 },
  { minimum: 200, action: 'vip', durationMs: 10000, label: 'SIÊU VIP CAMERA' },
  { minimum: 100, action: 'vip', durationMs: 8000, label: 'VIP CAMERA' },
  { minimum: 50, action: 'medal', durationMs: 90000, label: 'VUA SÀN NHẢY', variant: 'fire' },
  { minimum: 20, action: 'camera', durationMs: 6000, label: 'CAMERA SÀN NHẢY' },
  { minimum: 5, action: 'dance', durationMs: 5000, label: 'NHẢY CỰC SUNG' },
  { minimum: 0, action: 'dance', durationMs: 3000, label: 'CẢM ƠN QUÀ' }
];

// Cumulative diamonds -> permanent look upgrade for the session
export const EVOLUTION_TIERS = [
  { minimum: 1000, tier: 4, label: 'CHỦ TỊCH SÀN QUẨY', variant: 'royal' },
  { minimum: 200, tier: 3, label: 'VUA SÀN NHẢY', variant: 'fire' },
  { minimum: 50, tier: 2, label: 'DÂN CHƠI NEON', variant: 'neon' },
  { minimum: 10, tier: 1, label: 'TÂN BINH SÀN QUẨY', variant: 'aura' }
];

export const VARIANT_COLORS = { aura: '#22d3ee', neon: '#e879f9', fire: '#fb923c', royal: '#facc15' };

export const COMBO_WINDOW_MS = 5000;
export const SPOTLIGHT_ACTIONS = new Set(['camera', 'vip', 'topdj', 'fireworks', 'medal']);
export const FOCUS_ACTIONS = new Set(['camera', 'walk', 'vip', 'topdj', 'fireworks', 'medal']);

export function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Gift -> effect rule. `total` is the diamond value of the whole gift (unit × repeat). */
export function resolveGift(giftName, total) {
  const name = normalize(giftName);
  const named = GIFT_BY_NAME.find((r) => r.aliases.includes(name));
  const { aliases, minimum, ...rule } = named || DIAMOND_BANDS.find((r) => (Number(total) || 0) >= r.minimum);
  return { variant: '', fireworkBursts: 0, ...rule };
}

/**
 * Chat text -> action, or null when the comment is not a command.
 * `joinKeyword` is the word viewers type to step onto the floor (default "hey").
 */
export function parseChat(text, joinKeyword = 'hey') {
  const t = normalize(text);
  if (!t) return null;
  const join = normalize(joinKeyword) || 'hey';
  if (t === join || t === 'hey' || t === 'vao san') return { action: 'join', durationMs: 2500 };
  if (t === 'jump' || t === 'nhay') return { action: 'jump', durationMs: 950 };
  if (t.includes('doi nv') || t.includes('doi nhan vat')) return { action: 'change', durationMs: 2500 };
  if (t.includes('di vong') || t === 'walk') return { action: 'walk', durationMs: 5000 };
  if (t.includes('dance') || t === 'quay' || t === 'lac') return { action: 'dance', durationMs: 5000 };
  return null;
}

export function evolutionFor(giftPower) {
  return EVOLUTION_TIERS.find((t) => (Number(giftPower) || 0) >= t.minimum) || null;
}

/** Party energy gained from one live event. */
export function energyFor(ev) {
  switch (ev?.type) {
    case 'chat': return 2;
    case 'gift': return Math.max(0, Number(ev.total) || 0) * 2;
    case 'like': return Math.max(0, Number(ev.count) || 0) * 0.08;
    case 'join': return 1;
    case 'follow': case 'share': return 5;
    default: return 0;
  }
}

/** Fills the party-energy meter; returns how many times it overflowed (each overflow = party burst). */
export function addEnergy(state, amount, goal = 1000) {
  const g = Math.max(10, Number(goal) || 1000);
  state.energy = (state.energy || 0) + Math.max(0, Number(amount) || 0);
  let bursts = 0;
  while (state.energy >= g) { state.energy -= g; bursts++; }
  return bursts;
}

/** Per-user combo counter: gifts sent within COMBO_WINDOW_MS of the previous one stack. */
export function bumpCombo(combos, userKey, now = Date.now()) {
  const prev = combos.get(userKey);
  const count = prev && now - prev.at <= COMBO_WINDOW_MS ? Math.min(99, prev.count + 1) : 1;
  combos.set(userKey, { count, at: now });
  return count;
}

/** Top N gifters by score from a Map(userKey -> {score, ...}). */
export function topDonors(donors, n = 3) {
  return [...donors.values()].filter((d) => d.score > 0).sort((a, b) => b.score - a.score).slice(0, n);
}

/**
 * Whether an event should put (or keep) the viewer on the dance floor.
 * keyword mode: only the join keyword, a gift, follow or share brings a new viewer in;
 * all mode: any interaction does.
 */
export function joinsFloor(ev, cmd, { joinMode = 'keyword', known = false } = {}) {
  if (known) return true;
  if (joinMode === 'all') return ['chat', 'gift', 'join', 'follow', 'share'].includes(ev.type);
  if (ev.type === 'gift' || ev.type === 'follow' || ev.type === 'share') return true;
  return ev.type === 'chat' && cmd?.action === 'join';
}

/**
 * Crowd grid: 24 columns × 17 rows staggered; picks a free slot spread away from others
 * (the spacing requirement relaxes as the floor fills up).
 */
export const CROWD_COLS = 24;
export const CROWD_ROWS = 17;
export function allocateSlot(occupied, rand = Math.random) {
  const cap = CROWD_COLS * CROWD_ROWS;
  const used = new Set(occupied);
  const free = [];
  for (let i = 0; i < cap; i++) if (!used.has(i)) free.push(i);
  if (!free.length) return Math.floor(rand() * cap);
  const n = used.size;
  const minD2 = n < 30 ? 9 : n < 80 ? 4 : n < 140 ? 2 : 1;
  const spread = free.filter((c) => [...used].every((o) => {
    const dr = Math.floor(c / CROWD_COLS) - Math.floor(o / CROWD_COLS);
    const dc = (c % CROWD_COLS) - (o % CROWD_COLS);
    return dr * dr + dc * dc >= minD2;
  }));
  const pool = spread.length ? spread : free;
  return pool[Math.floor(rand() * pool.length)];
}

/** Crowd size scale: fewer dancers -> bigger characters. */
export function crowdScale(count) {
  return count <= 30 ? 1 : count <= 80 ? 0.86 : count <= 140 ? 0.71 : count <= 200 ? 0.58 : count <= 280 ? 0.49 : 0.42;
}

export const NPC_NAMES = [
  'Bắp Rang', 'Cà Khịa', 'Tí Tởn', 'Tèo Teo', 'Bảy Bóng', 'Sáu Lắc', 'Năm Rung', 'Út Quẩy',
  'Cô Ba Lắc', 'Chú Tư Nhún', 'Anh Hai Quẩy', 'Bé Hột Mít', 'Mèo Mập', 'Gà Mơ', 'Vịt Lộn', 'Bánh Bao',
  'Trà Đá', 'Khoai Lang', 'Xoài Lắc', 'Ớt Hiểm', 'Dép Tổ Ong', 'Quần Hoa', 'Đầu Nấm', 'Thích Quẩy'
];
