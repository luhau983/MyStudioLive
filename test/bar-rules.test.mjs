import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  resolveGift, parseChat, evolutionFor, energyFor, addEnergy, bumpCombo, topDonors, joinsFloor,
  allocateSlot, normalize, CROWD_COLS, CROWD_ROWS, COMBO_WINDOW_MS
} from '../overlay/bar/rules.mjs';

const require = createRequire(import.meta.url);

test('normalize strips Vietnamese accents and đ', () => {
  assert.equal(normalize('  Đổi   NV '), 'doi nv');
  assert.equal(normalize('Hoa Hồng'), 'hoa hong');
});

test('named gifts win over diamond bands', () => {
  assert.equal(resolveGift('Hoa hồng', 1).action, 'camera');
  assert.equal(resolveGift('Rose', 999).action, 'camera');
  assert.equal(resolveGift('TikTok', 1).action, 'change');
  assert.equal(resolveGift('Portal', 99).action, 'grow');
  const galaxy = resolveGift('Galaxy', 1000);
  assert.equal(galaxy.action, 'topdj');
  assert.equal(galaxy.fireworkBursts, 6);
  assert.equal('aliases' in galaxy, false);
});

test('unknown gifts fall into the highest matching diamond band', () => {
  assert.equal(resolveGift('X', 1).action, 'dance');
  assert.equal(resolveGift('X', 5).label, 'NHẢY CỰC SUNG');
  assert.equal(resolveGift('X', 20).action, 'camera');
  assert.equal(resolveGift('X', 50).action, 'medal');
  assert.equal(resolveGift('X', 100).action, 'vip');
  assert.equal(resolveGift('X', 499).label, 'SIÊU VIP CAMERA');
  assert.equal(resolveGift('X', 500).action, 'fireworks');
  assert.equal(resolveGift('X', 5000).label, 'ĐẠI GIA MỞ TIỆC');
  assert.equal(resolveGift('X', 0).action, 'dance');
  assert.equal('minimum' in resolveGift('X', 0), false);
});

test('chat commands', () => {
  assert.equal(parseChat('hey').action, 'join');
  assert.equal(parseChat('HEY ').action, 'join');
  assert.equal(parseChat('vào sàn').action, 'join');
  assert.equal(parseChat('quẩy lên', 'quẩy lên').action, 'join');
  assert.equal(parseChat('nhảy').action, 'jump');
  assert.equal(parseChat('jump').action, 'jump');
  assert.equal(parseChat('dance đi').action, 'dance');
  assert.equal(parseChat('đi vòng').action, 'walk');
  assert.equal(parseChat('đổi nhân vật').action, 'change');
  assert.equal(parseChat('chào cả nhà'), null);
  assert.equal(parseChat(''), null);
});

test('evolution tiers by cumulative diamonds', () => {
  assert.equal(evolutionFor(9), null);
  assert.equal(evolutionFor(10).tier, 1);
  assert.equal(evolutionFor(199).variant, 'neon');
  assert.equal(evolutionFor(200).variant, 'fire');
  assert.equal(evolutionFor(1000).label, 'CHỦ TỊCH SÀN QUẨY');
});

test('party energy overflows into bursts and keeps the remainder', () => {
  const s = { energy: 0 };
  assert.equal(energyFor({ type: 'gift', total: 300 }), 600);
  assert.equal(energyFor({ type: 'like', count: 100 }), 8);
  assert.equal(energyFor({ type: 'chat' }), 2);
  assert.equal(addEnergy(s, 900, 1000), 0);
  assert.equal(addEnergy(s, 2150, 1000), 3);
  assert.equal(s.energy, 50);
});

test('gift combo stacks inside the window only', () => {
  const m = new Map();
  assert.equal(bumpCombo(m, 'u', 0), 1);
  assert.equal(bumpCombo(m, 'u', 1000), 2);
  assert.equal(bumpCombo(m, 'u', 1000 + COMBO_WINDOW_MS), 3);
  assert.equal(bumpCombo(m, 'u', 2000 + COMBO_WINDOW_MS * 2 + 1), 1);
});

test('top donors sorted, zero scores ignored', () => {
  const d = new Map([['a', { key: 'a', score: 5 }], ['b', { key: 'b', score: 50 }], ['c', { key: 'c', score: 0 }], ['d', { key: 'd', score: 9 }], ['e', { key: 'e', score: 1 }]]);
  assert.deepEqual(topDonors(d).map((x) => x.key), ['b', 'd', 'a']);
});

test('keyword join mode: only keyword, gift, follow or share bring new viewers', () => {
  const chat = { type: 'chat' };
  assert.equal(joinsFloor(chat, null, {}), false);
  assert.equal(joinsFloor(chat, { action: 'join' }, {}), true);
  assert.equal(joinsFloor(chat, { action: 'dance' }, {}), false);
  assert.equal(joinsFloor({ type: 'gift' }, null, {}), true);
  assert.equal(joinsFloor({ type: 'join' }, null, {}), false);
  assert.equal(joinsFloor(chat, null, { known: true }), true);
  assert.equal(joinsFloor({ type: 'join' }, null, { joinMode: 'all' }), true);
  assert.equal(joinsFloor({ type: 'like' }, null, { joinMode: 'all' }), false);
});

test('crowd slots stay unique and inside the grid until it is full', () => {
  const used = [];
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < CROWD_COLS * CROWD_ROWS; i++) used.push(allocateSlot(used, rand));
  assert.equal(new Set(used).size, used.length);
  assert.ok(used.every((s) => s >= 0 && s < CROWD_COLS * CROWD_ROWS));
  const extra = allocateSlot(used, rand);
  assert.ok(extra >= 0 && extra < CROWD_COLS * CROWD_ROWS);
});

test('first dancers are spread apart', () => {
  const a = allocateSlot([]);
  const b = allocateSlot([a]);
  const dr = Math.floor(a / CROWD_COLS) - Math.floor(b / CROWD_COLS);
  const dc = (a % CROWD_COLS) - (b % CROWD_COLS);
  assert.ok(dr * dr + dc * dc >= 9);
});

test('avatar proxy only accepts TikTok image CDNs over https', () => {
  const { isAvatarUrl } = require('../src/server.js');
  assert.equal(isAvatarUrl('https://p16-sign-va.tiktokcdn.com/abc~tplv.webp?x=1'), true);
  assert.equal(isAvatarUrl('https://p77-sign.tiktokcdn-us.com/a.jpeg'), true);
  assert.equal(isAvatarUrl('https://sf16.ibyteimg.com/a.png'), true);
  assert.equal(isAvatarUrl('http://p16-sign-va.tiktokcdn.com/a.webp'), false);
  assert.equal(isAvatarUrl('https://tiktokcdn.com.evil.example/a.png'), false);
  assert.equal(isAvatarUrl('https://eviltiktokcdn.com/a.png'), false);
  assert.equal(isAvatarUrl('https://127.0.0.1/a.png'), false);
  assert.equal(isAvatarUrl('https://user:pw@p16.tiktokcdn.com/a.png'), false);
  assert.equal(isAvatarUrl('https://p16.tiktokcdn.com:8443/a.png'), false);
  assert.equal(isAvatarUrl('not a url'), false);
});

test('master rules: gift id first, then name; chat by keyword; disabled ignored', async () => {
  const { matchRule } = await import('../overlay/bar/rules.mjs');
  const rules = [
    { id: 'a', enabled: true, source: 'gift', trigger: 'hoa hồng, rose', giftId: '', match: 'exact', action: 'camera' },
    { id: 'b', enabled: true, source: 'gift', trigger: 'zzz', giftId: '5655', match: 'exact', action: 'vip' },
    { id: 'c', enabled: true, source: 'chat', trigger: 'phao hoa', giftId: '', match: 'contains', action: 'fireworks' },
    { id: 'd', enabled: false, source: 'chat', trigger: 'xin chao', giftId: '', match: 'exact', action: 'dance' }
  ];
  assert.equal(matchRule(rules, { type: 'gift', giftId: '5655', giftName: 'Hoa Hồng' }).id, 'b');
  assert.equal(matchRule(rules, { type: 'gift', giftId: '1', giftName: 'Hoa Hồng' }).id, 'a');
  assert.equal(matchRule(rules, { type: 'gift', giftName: 'Hoa' }), null);
  assert.equal(matchRule(rules, { type: 'chat', text: 'bắn PHÁO HOA đi' }).id, 'c');
  assert.equal(matchRule(rules, { type: 'chat', text: 'xin chào' }), null);
  assert.equal(matchRule(rules, { type: 'like' }), null);
  assert.equal(matchRule(undefined, { type: 'chat', text: 'x' }), null);
});

test('master rules are sanitized when saved', () => {
  const { sanitizeBarRules, DEFAULT_BAR_RULES } = require('../src/bar-rules.js');
  assert.ok(DEFAULT_BAR_RULES.length >= 5);
  assert.deepEqual(sanitizeBarRules(null).map((r) => r.id), DEFAULT_BAR_RULES.map((r) => r.id));
  const [r] = sanitizeBarRules([{ id: 'x<script>', source: 'evil', action: 'rm -rf', giftId: '12ab34', durationMs: 1e9, fireworkBursts: 99, variant: 'gold', label: 'A\u0000B', match: 'regex' }]);
  assert.equal(r.id, 'xscript');
  assert.equal(r.source, 'gift');
  assert.equal(r.action, 'dance');
  assert.equal(r.giftId, '1234');
  assert.equal(r.durationMs, 300000);
  assert.equal(r.fireworkBursts, 12);
  assert.equal(r.variant, '');
  assert.equal(r.label, 'AB');
  assert.equal(r.match, 'exact');
  const dup = sanitizeBarRules([{ id: 'same' }, { id: 'same' }]);
  assert.notEqual(dup[0].id, dup[1].id);
  assert.equal(sanitizeBarRules(Array.from({ length: 150 }, () => ({}))).length, 100);
});

test('settings keep the bar scene and its rules valid', () => {
  const os = require('os'); const fs = require('fs'); const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-settings-'));
  const { Settings } = require('../src/settings.js');
  const s = new Settings(dir);
  assert.ok(Array.isArray(s.get().overlay.barRules));
  let o = s.update({ overlay: { mode: 'bar', barNpc: 99, barBpm: 10, barJoinKeyword: '  ', barRules: [{ source: 'chat', trigger: 'quẩy', action: 'dance' }] } }).overlay;
  assert.equal(o.mode, 'bar');
  assert.equal(o.barNpc, 40);
  assert.equal(o.barBpm, 70);
  assert.equal(o.barJoinKeyword, 'hey');
  assert.equal(o.barRules.length, 1);
  o = new Settings(dir).get().overlay; // reload from disk
  assert.equal(o.barRules[0].trigger, 'quẩy');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('character pack lists only image files directly in the chosen folder', () => {
  const os = require('os'); const fs = require('fs'); const path = require('path');
  const { listCharacterFiles } = require('../src/server.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-chars-'));
  for (const f of ['b.gif', 'a.PNG', 'c.webp', 'notes.txt', 'x.mp4']) fs.writeFileSync(path.join(dir, f), 'x');
  fs.mkdirSync(path.join(dir, 'sub.gif'));
  assert.deepEqual(listCharacterFiles(dir), ['a.PNG', 'b.gif', 'c.webp']);
  assert.deepEqual(listCharacterFiles(''), []);
  assert.deepEqual(listCharacterFiles(path.join(dir, 'missing')), []);
  assert.ok(!listCharacterFiles(dir).includes('../secret.gif'));
  fs.rmSync(dir, { recursive: true, force: true });
});
