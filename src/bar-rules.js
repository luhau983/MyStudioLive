'use strict';
/*
 * Live Bar "Master Rules": host-defined chat/gift -> action rules, checked before the built-in gift table.
 * Ported from tiktok-live-bar (TikTokBridge/src/master/rules.js, config/master.json). MIT.
 * This module only validates what is stored in settings; matching runs in overlay/bar/rules.mjs.
 */
const crypto = require('crypto');

const BAR_ACTIONS = ['join', 'dance', 'jump', 'walk', 'change', 'grow', 'camera', 'medal', 'vip', 'topdj', 'fireworks'];
const BAR_VARIANTS = ['', 'aura', 'neon', 'fire', 'royal'];
const MAX_RULES = 100;

const DEFAULT_BAR_RULES = [
  { id: 'gift-rose-camera', source: 'gift', trigger: 'hoa hồng, rose', giftId: '5655', action: 'camera', durationMs: 4000, label: 'ZOOM CAMERA' },
  { id: 'gift-rosa-wings', source: 'gift', trigger: 'rosa', giftId: '8913', action: 'medal', durationMs: 60000, label: 'CÁNH VIP', variant: 'fire' },
  { id: 'gift-tiktok-change', source: 'gift', trigger: 'tiktok, tik tok', giftId: '5269', action: 'change', durationMs: 2500, label: 'ĐỔI NHÂN VẬT' },
  { id: 'gift-finger-heart-walk', source: 'gift', trigger: 'finger heart, trái tim ngón tay', giftId: '5487', action: 'walk', durationMs: 5000, label: 'ĐI VÒNG' },
  { id: 'gift-travel-ticket-fireworks', source: 'gift', trigger: 'vé hành trình, travel ticket', action: 'fireworks', durationMs: 8000, label: 'PHÁO HOA', fireworkBursts: 4 },
  { id: 'gift-heart-grow', source: 'gift', trigger: 'tim, heart', action: 'grow', durationMs: 8000, label: 'BIG TO LÊN' },
  { id: 'gift-electro-topdj', source: 'gift', trigger: 'electro mãi đỉnh', action: 'topdj', durationMs: 12000, label: 'ON TOP DJ', variant: 'royal', fireworkBursts: 6 }
].map(sanitizeBarRule);

// function declarations (hoisted): DEFAULT_BAR_RULES above is sanitized at load time
function clean(v, n) { return String(v ?? '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, n); }
function num(v, lo, hi, def) { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def; }

function sanitizeBarRule(input = {}) {
  const id = String(input.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'rule-' + crypto.randomUUID().slice(0, 8);
  return {
    id,
    enabled: input.enabled !== false,
    source: input.source === 'chat' ? 'chat' : 'gift',
    trigger: clean(input.trigger, 300),
    giftId: clean(input.giftId, 40).replace(/[^0-9]/g, ''),
    match: input.match === 'contains' ? 'contains' : 'exact',
    action: BAR_ACTIONS.includes(input.action) ? input.action : 'dance',
    durationMs: num(input.durationMs, 500, 300000, 3000),
    label: clean(input.label, 40),
    variant: BAR_VARIANTS.includes(input.variant) ? input.variant : '',
    fireworkBursts: num(input.fireworkBursts, 0, 12, 0)
  };
}

function sanitizeBarRules(list) {
  if (!Array.isArray(list)) return DEFAULT_BAR_RULES.map((r) => ({ ...r }));
  const seen = new Set();
  return list.slice(0, MAX_RULES).map(sanitizeBarRule).map((r) => {
    if (seen.has(r.id)) r.id = 'rule-' + crypto.randomUUID().slice(0, 8);
    seen.add(r.id);
    return r;
  });
}

module.exports = { BAR_ACTIONS, BAR_VARIANTS, DEFAULT_BAR_RULES, sanitizeBarRule, sanitizeBarRules };
