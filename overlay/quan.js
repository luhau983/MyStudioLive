/*
 * QUÁN VỈA HÈ — engine chung cho hai cảnh "Trà Đá Vỉa Hè" và "Đi Nhậu".
 *
 * Người xem bình luận -> đi vào quán, ngồi ghế nhựa quanh bàn (nhân vật chibi vẽ bằng canvas, mỗi người một kiểu
 * cố định theo tài khoản). Gõ tên món -> nhân viên quán bưng ra tận bàn. Quà -> máy quay áp sát + bảng tên + hiệu
 * ứng theo cảnh. Đủ tim -> sự kiện cả quán. Bảng xếp hạng: 1 điểm/bình luận, 2 điểm/món, 10 điểm/kim cương.
 *
 * Ảnh nền đường phố: Wikimedia Commons (xem docs/THIRD_PARTY_NOTICES.md), phần còn lại vẽ bằng code.
 */
(() => {
  'use strict';

  const W = 1080;
  const H = 1920;
  const FRAME_MS = 1000 / 30;
  const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
  const EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function hash(s) {
    let h = 2166136261;
    for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seeded(seed) {
    let a = seed || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mix(hexA, hexB, k) {
    const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
    const ch = (s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, clamp(k, 0, 1)));
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  // ---------------- Nhân vật chibi ----------------
  // Phong cách hoạt hình phẳng kiểu meme Việt: tỉ lệ người lớn, đầu oval, viền mảnh, mắt trắng chấm đen, màu phẳng.
  const SKINS = ['#f3d2b3', '#eac39f', '#e2b48c', '#d6a47c', '#c28e66'];
  const HAIRS = ['#1f1a17', '#2b211c', '#3d2c22', '#5b4034', '#6b4a3a'];
  const BOY_HAIRS = ['#1f1a17', '#2b211c', '#3d2c22', '#5b4034', '#5b4034', '#c9b28a', '#8b919c', '#7c3a1d'];
  const HOA = [['#0f766e', '#fde047'], ['#1e3a8a', '#f9a8d4'], ['#1f2937', '#f87171'], ['#7c2d12', '#fde68a'], ['#f8fafc', '#3b82f6'], ['#be123c', '#fef3c7']];
  const SHIRTS = ['#f8fafc', '#f8fafc', '#e5e7eb', '#ef4444', '#f97316', '#facc15', '#22c55e', '#0ea5e9', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#1f2937', '#475569', '#15803d', '#b45309'];
  const PANTS = ['#3b5b8c', '#2f4a73', '#4a6fa5', '#1f2937', '#374151', '#57534e', '#44403c', '#3f6212'];
  const CAPS = ['#dc2626', '#1d4ed8', '#111827', '#f59e0b', '#16a34a', '#f8fafc'];
  const SOLES = ['#2563eb', '#dc2626', '#16a34a', '#1f2937', '#f59e0b'];
  const INK = '#1f2328';

  function makeLook(key, opt = {}) {
    const r = seeded(hash(key));
    const female = opt.female ?? r() < 0.4;
    const pick2 = (a) => a[Math.floor(r() * a.length)];
    const look = {
      female,
      skin: pick2(SKINS),
      hair: pick2(HAIRS),
      style: female ? 3 + Math.floor(r() * 2) : pick2([0, 1, 2, 6, 7]),
      shirt: pick2(SHIRTS),
      pants: pick2(PANTS),
      sole: pick2(SOLES),
      outfit: 'tee',
      shorts: !female && r() < 0.3,
      collar: r() < 0.25,
      print: r() < 0.3,
      glasses: r() < 0.14,
      cap: !female && r() < 0.15 ? pick2(CAPS) : null,
      stripes: r() < 0.2,
      stache: !female && r() < 0.2,
      apron: false
    };
    if (!female) {
      look.hair = pick2(BOY_HAIRS);
      const ro = r();
      look.outfit = ro < 0.28 ? 'hoa' : ro < 0.48 ? 'tank' : 'tee';
      if (look.outfit === 'hoa') { const h = pick2(HOA); look.shirt = h[0]; look.flower = h[1]; look.stripes = look.print = look.collar = false; }
      if (look.outfit === 'tank') { look.shirt = pick2(['#f8fafc', '#f8fafc', '#1f2937', '#475569']); look.stripes = look.print = look.collar = false; }
      look.chain = r() < 0.4;
      look.earring = r() < 0.3;
      look.sneaker = r() < 0.35;
      look.tattoo = look.outfit !== 'tee' && r() < 0.45;
      look.shades = !look.cap && r() < 0.2;
      look.glasses = look.glasses && !look.shades;
      if (r() < 0.3) { // "dân chơi": tóc úp cạo mai, râu dê, dây chuyền thẻ bài, áo đại bàng, thắt lưng sọc, dép kẹp
        Object.assign(look, {
          comic: true, style: 8, outfit: 'tee', shirt: pick2(['#f8fafc', '#f8fafc', '#f8fafc', '#1f2937']),
          eagle: true, chain: 'gold', belt: true, goatee: r() < 0.85, stache: false, stripes: false, print: false, collar: false,
          shorts: false, sneaker: false, flipflop: true, shades: false, cap: null, glasses: false, tattoo: false,
          pants: pick2(['#3b5b8c', '#2f4a73', '#4a6fa5']), hair: pick2(['#5b4034', '#4a3329', '#3d2c22', '#6b4a3a'])
        });
      }
      if (look.sneaker) look.shorts = false;
    }
    Object.assign(look, opt);
    if (look.apron) Object.assign(look, { outfit: 'tee', comic: false, eagle: false, belt: false, goatee: false, stache: false, flipflop: false, chain: false, earring: false, tattoo: false, shades: false, sneaker: false, flower: null });
    return look;
  }

  const shade = (hex, k) => mix(hex, k > 0 ? '#ffffff' : '#000000', Math.abs(k));
  function ink(g, w = 2.2) { g.strokeStyle = INK; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; }
  function fillInk(g, color, w = 2.2) { g.fillStyle = color; g.fill(); ink(g, w); g.stroke(); }

  // Vẽ 1 nhân vật tại gốc toạ độ hiện tại (0,0 = mặt đất dưới chân), đơn vị đã nhân tỉ lệ bên ngoài.
  // o: { seated, walk (pha bước), arm: rest|table|drink|cheer|wave|carry|sleep, armK, hold, holdLevel, face, blink, red, daica, t }
  function paintChibi(g, look, o) {
    const seated = !!o.seated;
    const hipY = seated ? -40 : -82;
    const top = seated ? -102 : -144;   // vai
    const sw = look.female ? 19 : 22;   // nửa bề ngang vai
    const hw = look.female ? 19 : 18;   // nửa bề ngang hông
    const RX = 27, RY = 32;
    let hy = top - 34;                  // tâm đầu
    const red = clamp(o.red || 0, 0, 1);
    const sleeping = o.arm === 'sleep';
    const shin = look.shorts ? look.skin : look.pants;

    // ---------- chân ----------
    if (seated) {
      g.beginPath(); g.moveTo(-hw, hipY - 6); g.lineTo(hw, hipY - 6); g.lineTo(hw + 6, hipY + 10); g.lineTo(-hw - 6, hipY + 10); g.closePath(); fillInk(g, look.pants);
      for (const sd of [-1, 1]) {
        const x = sd * 15;
        g.beginPath(); g.moveTo(x - 8, hipY + 6); g.lineTo(x + 8, hipY + 6); g.lineTo(x + 8 - sd * 3, -4); g.lineTo(x - 8 - sd * 3, -4); g.closePath(); fillInk(g, shin);
        if (look.shorts) { g.beginPath(); rrPath(g, x - 9, hipY + 4, 18, 9, 3); fillInk(g, look.pants); }
        sandal(g, look, x - sd * 2, -2);
      }
    } else {
      const ph = o.walk || 0;
      for (const sd of [-1, 1]) {
        const s1 = Math.sin(ph) * sd;
        const lift = Math.max(0, s1) * 5;
        const x = sd * 9 + s1 * 6;
        g.beginPath(); g.moveTo(sd * 9 - 8, hipY); g.lineTo(sd * 9 + 8, hipY); g.lineTo(x + 9, -4 - lift); g.lineTo(x - 9, -4 - lift); g.closePath(); fillInk(g, shin);
        if (look.shorts) { g.beginPath(); g.moveTo(sd * 9 - 9, hipY - 2); g.lineTo(sd * 9 + 9, hipY - 2); g.lineTo(lerp(sd * 9, x, 0.4) + 10, hipY + 34); g.lineTo(lerp(sd * 9, x, 0.4) - 10, hipY + 34); g.closePath(); fillInk(g, look.pants); }
        sandal(g, look, x + s1 * 2, -2 - lift);
      }
      g.beginPath(); rrPath(g, -hw, hipY - 8, hw * 2, 14, 5); fillInk(g, look.pants);
    }

    // ---------- tóc sau gáy (nữ) ----------
    if (sleeping) hy += 14;
    const tiltHead = () => { if (sleeping) { g.translate(0, hy); g.rotate(0.3); g.translate(0, -hy); } };
    g.save(); tiltHead(); backHair(g, look, hy, RX, RY); g.restore();

    // ---------- cổ + thân ----------
    g.beginPath(); g.rect(-6, top - 10, 12, 14); fillInk(g, look.skin, 2);
    const torso = () => {
      g.beginPath();
      g.moveTo(-sw + 7, top);
      g.quadraticCurveTo(-sw - 1, top, -sw - 1, top + 10);
      g.lineTo(-hw, hipY + 4);
      g.lineTo(hw, hipY + 4);
      g.lineTo(sw + 1, top + 10);
      g.quadraticCurveTo(sw + 1, top, sw - 7, top);
      g.closePath();
    };
    const tank = look.outfit === 'tank';
    torso(); g.fillStyle = tank ? look.skin : look.shirt; g.fill();
    g.save(); torso(); g.clip();
    if (tank) {
      g.beginPath();
      g.moveTo(-sw + 8, top - 2); g.lineTo(-sw + 13, top - 2); g.quadraticCurveTo(-6, top + 16, 0, top + 15); g.quadraticCurveTo(6, top + 16, sw - 13, top - 2);
      g.lineTo(sw - 8, top - 2); g.quadraticCurveTo(sw - 4, top + 18, sw + 2, top + 22); g.lineTo(sw + 2, hipY + 10); g.lineTo(-sw - 2, hipY + 10); g.lineTo(-sw - 2, top + 22);
      g.quadraticCurveTo(-sw + 4, top + 18, -sw + 8, top - 2); g.closePath();
      g.fillStyle = look.shirt; g.fill(); ink(g, 1.8); g.stroke();
    }
    if (look.stripes) { g.fillStyle = 'rgba(255,255,255,.3)'; for (let y = top + 9; y < hipY + 6; y += 10) g.fillRect(-sw - 4, y, sw * 2 + 8, 4); }
    if (look.print && !look.apron) {
      g.fillStyle = shade(look.shirt, look.shirt === '#f8fafc' ? -0.45 : 0.5);
      g.beginPath(); g.arc(-5, top + 20, 6, 0, 6.283); g.fill();
      g.beginPath(); g.moveTo(0, top + 16); g.lineTo(10, top + 16); g.lineTo(5, top + 26); g.fill();
    }
    if (look.outfit === 'hoa') {
      g.fillStyle = look.flower;
      const fr = seeded(hash(look.shirt + look.flower));
      for (let i = 0; i < 9; i++) {
        const fx = -sw + fr() * sw * 2, fy = top + 3 + fr() * (hipY - top);
        for (let p = 0; p < 5; p++) { const a = p * 1.2566 + i; g.beginPath(); g.arc(fx + Math.cos(a) * 2.6, fy + Math.sin(a) * 2.6, 1.9, 0, 6.283); g.fill(); }
      }
      g.fillStyle = '#f8fafc'; g.beginPath(); g.moveTo(-7, top - 2); g.lineTo(7, top - 2); g.lineTo(5, hipY + 10); g.lineTo(-5, hipY + 10); g.closePath(); g.fill();
      ink(g, 1.8); g.beginPath(); g.moveTo(-7, top + 2); g.lineTo(-5, hipY + 6); g.moveTo(7, top + 2); g.lineTo(5, hipY + 6); g.stroke();
    }
    if (look.eagle) { // hình in đại bàng vàng nhạt
      g.fillStyle = 'rgba(234,179,8,.6)';
      for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(0, top + 18); g.quadraticCurveTo(sd * 14, top + 4, sd * 17, top + 15); g.quadraticCurveTo(sd * 11, top + 17, sd * 12, top + 24); g.quadraticCurveTo(sd * 6, top + 22, 0, top + 28); g.fill(); }
      g.fillStyle = 'rgba(250,204,21,.85)'; g.beginPath(); g.ellipse(0, top + 24, 4, 7, 0, 0, 6.283); g.fill();
      g.beginPath(); g.arc(0, top + 15, 3.2, 0, 6.283); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(sw * 0.35, top - 2, sw, hipY - top + 10);
    g.restore();
    torso(); ink(g); g.stroke();
    if (!tank && look.outfit !== 'hoa') { ink(g, 1.8); g.beginPath(); g.arc(0, top, 7, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); }
    if (look.outfit === 'hoa') for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * 7, top + 14); g.lineTo(sd * 15, top - 2); g.lineTo(sd * 17, top + 8); g.closePath(); fillInk(g, look.shirt, 1.8); }
    if (look.collar) for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(0, top + 9); g.lineTo(sd * 12, top - 2); g.lineTo(sd * 13, top + 6); g.closePath(); fillInk(g, shade(look.shirt, 0.2), 1.8); }
    if (look.belt) {
      const by = hipY - 3;
      g.beginPath(); rrPath(g, -hw, by, hw * 2, 6, 2); fillInk(g, '#15803d', 1.6);
      g.fillStyle = '#dc2626'; g.fillRect(-hw + 1, by + 2, hw * 2 - 2, 2);
      g.beginPath(); rrPath(g, 3, by - 1, 8, 8, 2); fillInk(g, '#facc15', 1.4);
    }
    if (look.apron) {
      g.beginPath(); rrPath(g, -sw + 6, top + 14, sw * 2 - 12, hipY - top + 2, 4); fillInk(g, '#fafaf9', 1.8);
      g.strokeStyle = '#fafaf9'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(-sw + 8, top + 16); g.lineTo(-6, top + 1); g.moveTo(sw - 8, top + 16); g.lineTo(6, top + 1); g.stroke();
      g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect(-6, top + 24, 12, 8);
    }
    if (o.daica || look.chain === 'gold') { // dây chuyền vàng to (+ thẻ bài)
      g.strokeStyle = '#ca8a04'; g.lineWidth = 3.4; g.setLineDash([3, 2]);
      g.beginPath(); g.arc(0, top - 3, 11, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke(); g.setLineDash([]);
      if (look.chain === 'gold') {
        g.beginPath(); rrPath(g, -6, top + 8, 12, 15, 2); fillInk(g, '#f59e0b', 1.5);
        g.strokeStyle = 'rgba(146,64,14,.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-3, top + 13); g.lineTo(3, top + 13); g.moveTo(-3, top + 17); g.lineTo(2, top + 20); g.stroke();
      } else { g.fillStyle = '#fde047'; g.beginPath(); g.arc(0, top + 9, 3, 0, 6.283); g.fill(); }
    } else if (look.chain) {
      g.strokeStyle = '#e5e7eb'; g.lineWidth = 2.2; g.setLineDash([2, 1.6]);
      g.beginPath(); g.arc(0, top - 2, 10, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); g.setLineDash([]);
    }

    // ---------- tay ----------
    const shL = { x: -sw + 3, y: top + 6 }, shR = { x: sw - 3, y: top + 6 };
    const k = o.armK ?? 1;
    const arm = o.arm || 'rest';
    let lh, le, rh, re;
    if (seated) { lh = { x: -14, y: hipY - 4 }; rh = { x: 14, y: hipY - 4 }; le = { x: -sw - 5, y: top + 30 }; re = { x: sw + 5, y: top + 30 }; }
    else { lh = { x: -sw - 3, y: hipY + 6 }; rh = { x: sw + 3, y: hipY + 6 }; le = { x: -sw - 3, y: top + 30 }; re = { x: sw + 3, y: top + 30 }; }
    if (arm === 'table') { lh = { x: -12, y: hipY - 14 }; rh = { x: 12, y: hipY - 14 }; }
    else if (arm === 'drink') { rh = { x: lerp(rh.x, 9, k), y: lerp(rh.y, hy + 20, k) }; re = { x: lerp(re.x, sw + 9, k), y: lerp(re.y, top + 16, k) }; }
    else if (arm === 'cheer') { rh = { x: lerp(rh.x, sw + 8, k), y: lerp(rh.y, hy - 30, k) }; re = { x: lerp(re.x, sw + 10, k), y: lerp(re.y, top - 12, k) }; }
    else if (arm === 'wave') { const w = Math.sin((o.t || 0) / 110) * 6; rh = { x: sw + 17 + w, y: hy - 6 }; re = { x: sw + 11, y: top + 4 }; }
    else if (arm === 'carry') { lh = { x: -13, y: top + 24 }; rh = { x: 13, y: top + 24 }; le = { x: -sw - 4, y: top + 26 }; re = { x: sw + 4, y: top + 26 }; }
    else if (arm === 'sleep') { lh = { x: -16, y: hy + 26 }; rh = { x: 16, y: hy + 26 }; le = { x: -sw - 3, y: top + 18 }; re = { x: sw + 3, y: top + 18 }; }
    const raised = arm === 'drink' || arm === 'cheer' || arm === 'wave';
    const drawArm = (s, e, h) => {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = INK; g.lineWidth = 12.5; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(e.x, e.y); g.lineTo(h.x, h.y); g.stroke();
      g.strokeStyle = look.skin; g.lineWidth = 8.5; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(e.x, e.y); g.lineTo(h.x, h.y); g.stroke();
      if (!tank) { // tay áo ngắn
        g.strokeStyle = INK; g.lineWidth = 14; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(lerp(s.x, e.x, 0.5), lerp(s.y, e.y, 0.5)); g.stroke();
        g.strokeStyle = look.shirt; g.lineWidth = 10; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(lerp(s.x, e.x, 0.5), lerp(s.y, e.y, 0.5)); g.stroke();
      }
      if (look.tattoo && s.x < 0) {
        g.strokeStyle = 'rgba(30,58,138,.7)'; g.lineWidth = 1.5;
        const mx = lerp(e.x, h.x, 0.45), my = lerp(e.y, h.y, 0.45);
        g.beginPath(); g.arc(mx, my, 2.4, 0, 6.283); g.moveTo(mx - 3, my + 4); g.quadraticCurveTo(mx, my + 2, mx + 3, my + 5); g.stroke();
      }
      g.beginPath(); g.arc(h.x, h.y, 5, 0, 6.283); fillInk(g, look.skin, 1.8);
    };
    if (!sleeping) drawArm(shL, le, lh);
    if (!raised && !sleeping) drawArm(shR, re, rh);

    // ---------- đầu ----------
    g.save(); tiltHead();
    for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * RX, hy + 3, 5, 7, 0, 0, 6.283); fillInk(g, look.skin, 2); }
    g.beginPath(); // mặt oval, cằm hơi vuông
    g.moveTo(0, hy - RY);
    g.bezierCurveTo(RX * 0.9, hy - RY, RX + 1, hy - RY * 0.45, RX, hy + 4);
    g.bezierCurveTo(RX - 1, hy + RY * 0.7, RX * 0.5, hy + RY, 0, hy + RY);
    g.bezierCurveTo(-RX * 0.5, hy + RY, -RX + 1, hy + RY * 0.7, -RX, hy + 4);
    g.bezierCurveTo(-RX - 1, hy - RY * 0.45, -RX * 0.9, hy - RY, 0, hy - RY);
    fillInk(g, red > 0.05 ? mix(look.skin, '#f87171', red * 0.35) : look.skin, 2.4);
    drawFace(g, look, o, hy, red);
    drawHair(g, look, hy, RX, RY);
    if (look.earring) { g.fillStyle = '#e5e7eb'; g.beginPath(); g.arc(RX + 1, hy + 10, 2, 0, 6.283); g.fill(); ink(g, 1); g.stroke(); }
    if (look.glasses && !o.daica) {
      ink(g, 1.8);
      g.beginPath(); g.arc(-10, hy - 1, 8, 0, 6.283); g.moveTo(18, hy - 1); g.arc(10, hy - 1, 8, 0, 6.283); g.moveTo(-2, hy - 2); g.lineTo(2, hy - 2); g.stroke();
    }
    if (look.shades && !o.daica) { // kính râm gác lên tóc
      g.fillStyle = '#111';
      g.beginPath(); rrPath(g, -19, hy - RY + 2, 16, 8, 3); g.fill(); g.beginPath(); rrPath(g, 3, hy - RY + 2, 16, 8, 3); g.fill(); g.fillRect(-4, hy - RY + 4, 8, 2);
    }
    if (o.daica) {
      g.fillStyle = '#0b0b0b';
      g.beginPath(); rrPath(g, -20, hy - 6, 17, 11, 4); g.fill(); g.beginPath(); rrPath(g, 3, hy - 6, 17, 11, 4); g.fill(); g.fillRect(-4, hy - 4, 8, 2.5);
      g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(-16, hy - 4, 5, 2); g.fillRect(7, hy - 4, 5, 2);
    }
    g.restore();
    if (sleeping) { drawArm(shL, le, lh); drawArm(shR, re, rh); }

    if (raised) {
      drawArm(shR, re, rh);
      if (o.hold) {
        g.save(); g.translate(rh.x + 1, rh.y + 11);
        if (arm === 'drink') g.rotate(-0.5 * k);
        drawItem(g, o.hold, 0, 0, 0.62, o.holdLevel ?? 1);
        g.restore();
        g.beginPath(); g.arc(rh.x, rh.y, 5, 0, 6.283); fillInk(g, look.skin, 1.8);
      }
    }
    if (arm === 'carry' && o.hold) {
      g.beginPath(); g.ellipse(0, top + 24, 32, 7, 0, 0, 6.283); fillInk(g, '#d4d4d8', 2);
      drawItem(g, o.hold, 0, top + 22, 0.7, 1);
    }
  }

  // Dép tổ ong / dép kẹp / giày
  function sandal(g, look, x, y) {
    if (look.sneaker) {
      g.beginPath(); rrPath(g, x - 10, y - 7, 20, 9, 4); fillInk(g, '#f8fafc', 1.8);
      g.fillStyle = look.sole; g.fillRect(x - 4, y - 5, 6, 2.4);
      return;
    }
    g.beginPath(); g.ellipse(x, y, 10, 4, 0, 0, 6.283); fillInk(g, look.flipflop ? '#1f2937' : look.sole, 1.8);
    g.beginPath(); g.ellipse(x, y - 2, 7, 3.6, 0, 0, 6.283); fillInk(g, look.skin, 1.5);
    if (look.flipflop) {
      for (const [c, w] of [['#15803d', 3.6], ['#dc2626', 1.3]]) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x - 7, y - 2); g.lineTo(x + 1, y - 6); g.lineTo(x + 7, y - 2); g.stroke(); }
    } else {
      g.strokeStyle = shade(look.sole, -0.2); g.lineWidth = 3;
      g.beginPath(); g.moveTo(x - 7, y - 3); g.quadraticCurveTo(x, y - 7, x + 7, y - 3); g.stroke();
    }
  }

  function backHair(g, look, hy, RX, RY) {
    const s = look.style;
    if (look.cap || (s !== 3 && s !== 4)) return;
    g.beginPath();
    if (s === 3) rrPath(g, -RX - 4, hy - 14, RX * 2 + 8, RY + 16, 12);
    else { g.moveTo(-RX - 3, hy - 8); g.quadraticCurveTo(-RX - 8, hy + 30, -RX + 2, hy + 48); g.lineTo(RX - 2, hy + 48); g.quadraticCurveTo(RX + 8, hy + 30, RX + 3, hy - 8); g.closePath(); }
    fillInk(g, look.hair, 2.2);
  }

  function drawFace(g, look, o, hy, red) {
    const face = o.face || 'normal';
    const ey = hy - 2;
    const happy = face === 'happy' || face === 'cheer';
    const closed = face === 'sleep' || o.blink;
    if (red > 0.05) { g.fillStyle = `rgba(239,68,68,${red * 0.45})`; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * 14, hy + 10, 6, 3.5, 0, 0, 6.283); g.fill(); } }
    else if (look.female) { g.fillStyle = 'rgba(244,114,182,.28)'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * 14, hy + 9, 5, 3, 0, 0, 6.283); g.fill(); } }
    // mắt
    for (const sd of [-1, 1]) {
      const ex = sd * 10;
      if (closed) { ink(g, 1.8); g.beginPath(); g.moveTo(ex - 6, ey + 1); g.quadraticCurveTo(ex, ey + 4, ex + 6, ey + 1); g.stroke(); continue; }
      if (happy) { ink(g, 2); g.beginPath(); g.moveTo(ex - 6, ey + 2); g.quadraticCurveTo(ex, ey - 5, ex + 6, ey + 2); g.stroke(); continue; }
      const big = look.comic ? 1.15 : 1;
      g.beginPath(); g.ellipse(ex, ey, 6.5 * big, 7.5 * big, 0, 0, 6.283); fillInk(g, '#ffffff', 1.6);
      g.fillStyle = '#111827'; g.beginPath(); g.arc(ex + 1.2, ey + 1, look.comic ? 3.8 : 3.2, 0, 6.283); g.fill();
      if (face === 'drunk') { // mí sụp
        g.save(); g.beginPath(); g.ellipse(ex, ey, 6.5 * big, 7.5 * big, 0, 0, 6.283); g.clip(); g.fillStyle = look.skin; g.fillRect(ex - 9, ey - 9, 18, 8); g.restore();
        ink(g, 1.6); g.beginPath(); g.moveTo(ex - 7, ey - 1); g.lineTo(ex + 7, ey - 1); g.stroke();
      }
      if (look.female) { ink(g, 1.6); g.beginPath(); g.moveTo(ex + sd * 5, ey - 5); g.lineTo(ex + sd * 9, ey - 8); g.stroke(); }
    }
    // lông mày
    const bu = happy ? -3 : 0;
    if (look.female) {
      g.strokeStyle = look.hair; g.lineWidth = 1.8;
      for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * 16, ey - 10 + bu); g.quadraticCurveTo(sd * 10, ey - 14 + bu, sd * 4, ey - 11 + bu); g.stroke(); }
    } else {
      g.fillStyle = look.comic ? '#1f2937' : shade(look.hair, -0.1);
      const th = look.comic ? 5 : 3.2;
      for (const sd of [-1, 1]) { // rậm, chụm vào giữa
        g.beginPath();
        g.moveTo(sd * 18, ey - 13 + bu); g.quadraticCurveTo(sd * 11, ey - 15 + bu, sd * 3, ey - 9 + bu);
        g.lineTo(sd * 4, ey - 9 + th + bu); g.quadraticCurveTo(sd * 11, ey - 13 + th + bu, sd * 18, ey - 13 + th * 0.6 + bu); g.closePath(); g.fill();
      }
    }
    // mũi
    ink(g, 1.6);
    g.beginPath(); g.moveTo(1, ey + 4); g.quadraticCurveTo(-3, ey + 10, -1, ey + 12); g.quadraticCurveTo(2, ey + 13, 4, ey + 11); g.stroke();
    if (look.comic) { for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * 9, hy + 10); g.quadraticCurveTo(sd * 13, hy + 14, sd * 11, hy + 19); g.stroke(); } }
    // ria mép
    if (look.stache) { g.fillStyle = shade(look.hair, -0.1); g.beginPath(); g.moveTo(-8, hy + 15); g.quadraticCurveTo(0, hy + 11, 8, hy + 15); g.quadraticCurveTo(0, hy + 14, -8, hy + 15); g.fill(); ink(g, 1); g.stroke(); }
    // miệng
    const my = hy + 18;
    ink(g, 1.8); g.fillStyle = '#7a2420';
    if (face === 'cheer') { g.beginPath(); g.moveTo(-7, my - 2); g.quadraticCurveTo(0, my + 9, 7, my - 2); g.closePath(); g.fill(); g.stroke(); }
    else if (face === 'talk') { g.beginPath(); g.ellipse(0, my, 4, 1.5 + Math.abs(Math.sin((o.t || 0) / 90)) * 3, 0, 0, 6.283); g.fill(); g.stroke(); }
    else if (face === 'sleep') { g.beginPath(); g.ellipse(0, my, 2.2, 2.6, 0, 0, 6.283); g.fill(); }
    else if (face === 'drunk') { g.beginPath(); g.moveTo(-6, my); g.quadraticCurveTo(-2, my - 3, 1, my); g.quadraticCurveTo(4, my + 3, 7, my - 1); g.stroke(); }
    else if (happy) { g.beginPath(); g.moveTo(-6, my - 1); g.quadraticCurveTo(0, my + 4, 6, my - 1); g.stroke(); }
    else if (look.female) { g.fillStyle = '#e11d48'; g.beginPath(); g.ellipse(0, my, 3.6, 1.8, 0, 0, 6.283); g.fill(); }
    else if (look.comic) { g.beginPath(); g.moveTo(-6, my); g.lineTo(6, my - 0.5); g.stroke(); }
    else { g.beginPath(); g.moveTo(-5, my); g.quadraticCurveTo(0, my + 2, 5, my - 1); g.stroke(); }
    // râu dê
    if (look.goatee) {
      g.fillStyle = '#1f2937';
      g.beginPath(); g.moveTo(-6, hy + 23); g.quadraticCurveTo(0, hy + 21, 6, hy + 23);
      g.quadraticCurveTo(7, hy + 32, 2, hy + 41); g.quadraticCurveTo(0, hy + 35, -2, hy + 38); g.quadraticCurveTo(-6, hy + 32, -6, hy + 23); g.fill();
    }
  }

  function drawHair(g, look, hy, RX, RY) {
    const s = look.style;
    const T = hy - RY;
    if (look.cap) {
      g.beginPath(); g.moveTo(-RX - 2, hy - 6); g.bezierCurveTo(-RX - 2, T - 12, RX + 2, T - 12, RX + 2, hy - 6); g.closePath(); fillInk(g, look.cap);
      g.beginPath(); g.ellipse(-RX * 0.3, hy - 7, RX + 8, 5, 0, Math.PI, Math.PI * 2); g.closePath(); fillInk(g, shade(look.cap, -0.2));
      g.beginPath(); g.rect(-RX + 1, hy - 4, 5, 10); g.fillStyle = look.hair; g.fill();
      return;
    }
    const dome = () => { g.beginPath(); g.moveTo(-RX - 2, hy + 2); g.bezierCurveTo(-RX - 4, T - 10, RX + 4, T - 10, RX + 2, hy + 2); };
    if (s === 0) { // đầu đinh / ngắn gọn
      dome(); g.lineTo(RX - 2, hy - 8); g.quadraticCurveTo(0, hy - 16, -RX + 2, hy - 8); g.closePath(); fillInk(g, look.hair);
    } else if (s === 1) { // ngắn, dựng nhẹ
      g.beginPath(); g.moveTo(-RX - 2, hy + 2);
      const n = 6;
      for (let i = 0; i <= n; i++) { const a = Math.PI * (1.05 + (i / n) * 0.9); g.lineTo(Math.cos(a) * (RX + 2), hy - 4 + Math.sin(a) * (RY + 2)); if (i < n) { const a2 = a + Math.PI * 0.075; g.lineTo(Math.cos(a2) * (RX + 9), hy - 4 + Math.sin(a2) * (RY + 9)); } }
      g.lineTo(RX + 2, hy + 2); g.lineTo(RX - 2, hy - 8); g.quadraticCurveTo(0, hy - 16, -RX + 2, hy - 8); g.closePath(); fillInk(g, look.hair);
    } else if (s === 2) { // rẽ ngôi, mái hất
      dome(); g.lineTo(RX - 2, hy - 6); g.quadraticCurveTo(6, hy - 8, -8, hy - 18); g.quadraticCurveTo(-16, hy - 10, -RX + 1, hy - 2); g.closePath(); fillInk(g, look.hair);
    } else if (s === 6) { // vuốt dựng phía trước
      dome(); g.lineTo(RX - 2, hy - 8); g.quadraticCurveTo(0, hy - 16, -RX + 2, hy - 8); g.closePath(); fillInk(g, look.hair);
      g.beginPath(); g.moveTo(-RX * 0.6, T + 4); g.quadraticCurveTo(-6, T - 14, RX * 0.5, T - 10); g.quadraticCurveTo(RX + 4, T - 6, RX - 2, T + 8); g.closePath(); fillInk(g, look.hair);
    } else if (s === 7) { // mái úp kín trán
      dome(); g.lineTo(RX - 2, hy - 6);
      for (const x of [RX - 8, 10, 2, -6, -14, -RX + 4]) g.lineTo(x, hy - (x % 4 ? 6 : 9));
      g.lineTo(-RX + 1, hy - 2); g.closePath(); fillInk(g, look.hair);
    } else if (s === 8) { // tóc úp mái bằng, cạo trọc một bên mai
      g.beginPath(); g.moveTo(-RX - 3, hy + 10); g.bezierCurveTo(-RX - 6, T - 12, RX + 6, T - 12, RX + 3, hy + 8);
      g.lineTo(RX - 1, hy + 8); g.lineTo(RX - 3, hy - 11); g.lineTo(-RX + 5, hy - 11); g.lineTo(-RX + 3, hy + 10); g.closePath(); fillInk(g, look.hair);
      ink(g, 1.4); for (const x of [-12, -2, 8]) { g.beginPath(); g.moveTo(x, hy - 11); g.lineTo(x + 0.5, hy - 15); g.stroke(); }
      g.beginPath(); g.moveTo(RX - 11, hy - 11); g.quadraticCurveTo(RX - 9, T + 4, RX - 2, T + 10); g.quadraticCurveTo(RX + 4, hy - 8, RX + 1, hy + 4); g.lineTo(RX - 4, hy + 4); g.closePath();
      g.fillStyle = mix(look.skin, look.hair, 0.25); g.fill(); ink(g, 1.6); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-16, T + 8); for (let i = 0; i < 6; i++) g.lineTo(-12 + i * 5, T + 8 - (i % 2 ? 3 : 0)); g.stroke();
    } else if (s === 3) { // bob, mái bằng
      dome(); g.lineTo(RX + 4, hy + 14); g.lineTo(RX - 4, hy + 14); g.lineTo(RX - 5, hy - 8); g.quadraticCurveTo(0, hy - 5, -RX + 5, hy - 8); g.lineTo(-RX + 4, hy + 14); g.lineTo(-RX - 4, hy + 14); g.closePath(); fillInk(g, look.hair);
    } else if (s === 4) { // tóc dài, mái lệch
      dome(); g.lineTo(RX + 2, hy + 14); g.lineTo(RX - 4, hy + 6); g.quadraticCurveTo(RX - 6, hy - 10, 2, hy - 12); g.quadraticCurveTo(-12, hy - 4, -RX + 3, hy + 10); g.lineTo(-RX - 2, hy + 14); g.closePath(); fillInk(g, look.hair);
    } else if (s === 5) { // búi tóc
      g.beginPath(); g.arc(0, T - 4, 10, 0, 6.283); fillInk(g, look.hair);
      dome(); g.lineTo(RX - 3, hy - 8); g.quadraticCurveTo(0, hy - 16, -RX + 3, hy - 8); g.closePath(); fillInk(g, look.hair);
    }
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.arc(0, hy - 2, RY - 4, Math.PI * 1.22, Math.PI * 1.42); g.stroke();
  }

  function rrPath(g, x, y, w, h, r) {
    if (h < 0) { y += h; h = -h; }
    r = Math.min(r, w / 2, h / 2);
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // ---------------- Đồ uống / món ăn (gốc = đáy giữa món) ----------------
  function glass(g, h, wB, wT, fill, level, ice) {
    const lv = clamp(level, 0, 1);
    g.fillStyle = 'rgba(220,240,255,.35)';
    g.beginPath(); g.moveTo(-wB / 2, 0); g.lineTo(wB / 2, 0); g.lineTo(wT / 2, -h); g.lineTo(-wT / 2, -h); g.closePath(); g.fill();
    if (lv > 0) {
      const fh = h * 0.9 * lv;
      const wf = lerp(wB, wT, fh / h);
      g.save();
      g.beginPath(); g.moveTo(-wB / 2 + 2, -2); g.lineTo(wB / 2 - 2, -2); g.lineTo(wf / 2 - 2, -fh); g.lineTo(-wf / 2 + 2, -fh); g.closePath(); g.clip();
      if (Array.isArray(fill)) {
        g.fillStyle = fill[0]; g.fillRect(-wT, -fh, wT * 2, fh);
        g.fillStyle = fill[1]; g.fillRect(-wT, -fh * 0.45, wT * 2, fh * 0.45);
      } else { g.fillStyle = fill; g.fillRect(-wT, -fh, wT * 2, fh); }
      if (ice) {
        g.fillStyle = 'rgba(235,250,255,.75)';
        for (const [x, y] of [[-5, 0.35], [5, 0.55], [-2, 0.8]]) if (y < lv + 0.1) { g.save(); g.translate(x, -h * 0.9 * y); g.rotate(0.4); g.fillRect(-5, -5, 10, 10); g.restore(); }
      }
      g.restore();
    }
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-wB / 2, 0); g.lineTo(-wT / 2, -h); g.moveTo(wB / 2, 0); g.lineTo(wT / 2, -h); g.stroke();
    g.beginPath(); g.ellipse(0, -h, wT / 2, 3, 0, 0, 6.283); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(-wT / 2 + 4, -h + 6, 3, h * 0.6);
  }
  function plate(g, w) {
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 1, w / 2 + 2, w / 6 + 2, 0, 0, 6.283); g.fill();
    g.fillStyle = '#f1f5f9'; g.beginPath(); g.ellipse(0, -2, w / 2, w / 6, 0, 0, 6.283); g.fill();
    g.fillStyle = '#cbd5e1'; g.beginPath(); g.ellipse(0, -2, w / 2.6, w / 8, 0, 0, 6.283); g.fill();
  }
  function emojiOn(g, ch, size, y = -6) {
    g.font = `${size}px ${EMOJI}`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillText(ch, 0, y);
  }
  function drawItem(g, id, x, y, s, level = 1) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    switch (id) {
      case 'tra': glass(g, 40, 22, 30, 'rgba(196,118,28,.9)', level, true); break;
      case 'chanh': glass(g, 40, 22, 30, 'rgba(214,226,86,.9)', level, true);
        g.fillStyle = '#a3e635'; g.beginPath(); g.arc(12, -38, 8, 0, 6.283); g.fill(); g.fillStyle = '#ecfccb'; g.beginPath(); g.arc(12, -38, 5, 0, 6.283); g.fill(); break;
      case 'cafe': glass(g, 40, 22, 30, ['#4a2a16', '#c9a173'], level, true); break;
      case 'coca':
        g.fillStyle = '#dc2626'; rr(g, -11, -40, 22, 40, 4); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-11, -18); g.quadraticCurveTo(0, -28, 11, -16); g.lineTo(11, -12); g.quadraticCurveTo(0, -24, -11, -14); g.fill();
        g.fillStyle = '#cbd5e1'; g.beginPath(); g.ellipse(0, -40, 11, 3, 0, 0, 6.283); g.fill(); break;
      case 'bohuc':
        g.fillStyle = '#b45309'; rr(g, -9, -34, 18, 34, 5); g.fill();
        g.fillStyle = '#fde047'; g.fillRect(-9, -24, 18, 12);
        g.fillStyle = '#dc2626'; g.beginPath(); g.arc(0, -18, 4, 0, 6.283); g.fill();
        g.fillStyle = '#ca8a04'; g.fillRect(-5, -42, 10, 8); g.fillStyle = '#dc2626'; g.fillRect(-6, -45, 12, 4); break;
      case 'bia':
        glass(g, 46, 26, 34, 'rgba(245,176,32,.92)', level, false);
        if (level > 0.05) { g.fillStyle = '#fffbeb'; for (const [dx, r] of [[-9, 6], [0, 7], [9, 6], [-4, 5], [5, 5]]) { g.beginPath(); g.arc(dx, -46 * 0.9 * clamp(level, 0, 1) - 2, r, 0, 6.283); g.fill(); } }
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3.5;
        g.beginPath(); g.moveTo(15, -36); g.quadraticCurveTo(28, -26, 15, -12); g.stroke(); break;
      case 'huongduong': plate(g, 46);
        g.fillStyle = '#1f2937';
        for (let i = 0; i < 14; i++) { const a = i * 2.4, r = (i % 5) * 3; g.save(); g.translate(Math.cos(a) * r, -5 + Math.sin(a) * r * 0.35); g.rotate(a); g.beginPath(); g.ellipse(0, 0, 3.4, 1.8, 0, 0, 6.283); g.fill(); g.restore(); }
        break;
      case 'lac': plate(g, 46);
        g.fillStyle = '#c2410c';
        for (let i = 0; i < 16; i++) { const a = i * 2.4, r = (i % 5) * 3; g.beginPath(); g.ellipse(Math.cos(a) * r, -5 + Math.sin(a) * r * 0.35 - (i > 10 ? 3 : 0), 3.6, 2.6, a, 0, 6.283); g.fill(); }
        break;
      case 'lau':
        g.fillStyle = '#334155'; g.beginPath(); g.ellipse(0, -4, 34, 10, 0, 0, 6.283); g.fill();
        g.fillStyle = '#9ca3af'; rr(g, -30, -26, 60, 22, 8); g.fill();
        g.fillStyle = '#b91c1c'; g.beginPath(); g.ellipse(0, -26, 30, 8, 0, 0, 6.283); g.fill();
        g.fillStyle = '#22c55e'; g.beginPath(); g.arc(-10, -27, 4, 0, 6.283); g.arc(8, -25, 3, 0, 6.283); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3;
        for (const dx of [-12, 2, 14]) { const t = performance.now() / 600 + dx; g.beginPath(); g.moveTo(dx, -34); g.quadraticCurveTo(dx + Math.sin(t) * 8, -48, dx, -60); g.stroke(); }
        break;
      case 'banhmi': plate(g, 44); emojiOn(g, '🥖', 30); break;
      case 'keo': plate(g, 40); emojiOn(g, '🍬', 26); break;
      case 'muc': plate(g, 48); emojiOn(g, '🦑', 30); break;
      case 'nem': plate(g, 46); emojiOn(g, '🍢', 30); break;
      case 'changa': plate(g, 48); emojiOn(g, '🍗', 30); break;
      case 'dua': plate(g, 44); emojiOn(g, '🥒', 28); break;
      case 'oc': plate(g, 48); emojiOn(g, '🐚', 28); break;
      default: emojiOn(g, '🍽️', 28, 0);
    }
    g.restore();
  }

  function rr(g, x, y, w, h, r) {
    if (h < 0) { y += h; h = -h; }
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // =====================================================================
  //                       ENGINE CHUNG CỦA MỘT QUÁN
  // =====================================================================
  function createScene(spec) {
    const K = spec.key;
    let cv, g, ui, sfx, cfg = {};
    let enabled = false;
    let pauseAt = 0;
    let pausedMs = 0;
    let last = 0;
    const clock = () => (pauseAt || performance.now()) - pausedMs;
    const opt = (name, def) => (cfg[K + name] ?? def);

    const people = new Map();
    const scores = new Map();
    const avatars = new Map();
    const orders = [];
    const fx = [];        // hạt: sparks / confetti / đá / tim
    const floaters = [];  // chữ bay
    const tables = [];
    const seats = [];
    const staff = [];
    let spotlight = null;
    const zoom = { k: 1, x: W / 2, y: H / 2 };
    let likeBase = -1;
    let likeCount = 0;
    let eventUntil = 0;
    let sold = 0;
    let openedAt = Date.now();
    let bgCanvas = null;
    let botSeq = 0;

    const scaleAt = (y) => clamp(spec.scale.s0 + (y - spec.scale.y0) * spec.scale.k, 0.5, 1.45);

    // ---------- bố cục bàn ghế ----------
    function buildLayout() {
      const T = spec.table;
      spec.tables.forEach((tb, ti) => {
        const s = scaleAt(tb.y);
        const w = T.w * s;
        const topF = tb.y - T.h * s;
        const topB = topF - T.d * s;
        const t = { i: ti, x: tb.x, y: tb.y, s, w, topF, topB, label: tb.label || `BÀN ${ti + 1}`, items: [], cheerAt: 0 };
        tables.push(t);
        const backY = tb.y - (T.h + T.d - 70) * s;
        const itemB = lerp(topB, topF, 0.45);
        const itemS = lerp(topB, topF, 0.75);
        const add = (slot, x, y, ix, iy, order, dir) => seats.push({ i: seats.length, table: ti, slot, x, y, s: scaleAt(y), ix, iy, order, dir, taken: null });
        add('bl', tb.x - w * 0.22, backY, tb.x - w * 0.22, itemB, ti * 10 + 0, 1);
        add('br', tb.x + w * 0.22, backY, tb.x + w * 0.22, itemB, ti * 10 + 1, -1);
        add('l', tb.x - w / 2 - 36 * s, tb.y + 6 * s, tb.x - w * 0.38, itemS, ti * 10 + 2, 1);
        add('r', tb.x + w / 2 + 36 * s, tb.y + 6 * s, tb.x + w * 0.38, itemS, ti * 10 + 3, -1);
      });
      (spec.solo || []).forEach(([x, y], i) => {
        const s = scaleAt(y);
        seats.push({ i: seats.length, table: -1, slot: 'solo', x, y, s, ix: x + 44 * s * (x < W / 2 ? 1 : -1), iy: y - 2, order: 500 + i, dir: x < W / 2 ? 1 : -1, taken: null });
      });
      seats.sort((a, b) => a.order - b.order);
      for (const st of spec.staff) {
        staff.push({
          ...st, look: makeLook('staff:' + st.name, st.look), x: st.home.x, y: st.home.y, state: 'idle', path: [], walk: 0,
          carry: null, order: null, bubble: null, talkAt: Date.now() + rnd(8000, 20000), flip: false
        });
      }
    }

    // ---------- khởi tạo ----------
    function init(o) {
      sfx = o.sfx;
      cv = document.createElement('canvas');
      cv.className = 'quan-canvas';
      cv.width = W; cv.height = H;
      g = cv.getContext('2d');
      o.stage.insertBefore(cv, o.before || null);
      ui = buildUi(o.stage, o.before);
      buildLayout();
      prepBackground();
      last = clock();
      requestAnimationFrame(loop);
      setInterval(tick1s, 1000);
      cv.addEventListener('contextlost', () => setTimeout(() => location.reload(), 300));
    }

    function buildUi(stage, before) {
      const root = document.createElement('div');
      root.className = 'quan-ui q-' + K;
      root.innerHTML = `
        <div class="q-head">
          <div class="q-title"></div>
          <div class="q-stats"><span class="q-chip q-sold"></span><span class="q-chip q-seats"></span><span class="q-chip q-clock"></span></div>
          <div class="q-like"><div class="q-like-fill"></div><span class="q-like-text"></span></div>
        </div>
        <div class="q-menu"><div class="qm-title"></div><div class="qm-list"></div></div>
        <div class="q-board"><div class="qb-title"></div><div class="qb-list"></div><div class="qb-empty">Bình luận để lên bảng</div></div>
        <div class="q-plate"><div class="np-av"></div><div><div class="np-name"></div><div class="np-gift"></div></div></div>
        <div class="q-banner"><div class="qbn-title"></div><div class="qbn-sub"></div></div>
        <div class="q-caption"></div>
        <div class="q-ticker"><span></span></div>`;
      stage.insertBefore(root, before || null);
      const $ = (c) => root.querySelector(c);
      $('.qm-title').textContent = spec.menuTitle;
      $('.qb-title').textContent = spec.boardTitle;
      for (const [key, desc, cls] of spec.menuBoard) {
        const r = document.createElement('div');
        r.className = 'qm-row' + (cls ? ' ' + cls : '');
        const k = document.createElement('span'); k.className = 'qm-key'; k.textContent = key;
        const d = document.createElement('span'); d.className = 'qm-desc'; d.textContent = desc;
        r.append(k, d);
        $('.qm-list').appendChild(r);
      }
      const tick = $('.q-ticker');
      if (spec.ticker) tick.firstChild.textContent = spec.ticker; else tick.remove();
      return {
        root, title: $('.q-title'), sold: $('.q-sold'), seats: $('.q-seats'), clock: $('.q-clock'),
        likeFill: $('.q-like-fill'), likeText: $('.q-like-text'), board: $('.qb-list'), boardEmpty: $('.qb-empty'),
        plate: $('.q-plate'), banner: $('.q-banner'), caption: $('.q-caption')
      };
    }

    function prepBackground() {
      const im = new Image();
      im.onload = () => {
        const b = spec.bg;
        const c = document.createElement('canvas');
        c.width = W; c.height = b.h;
        const x = c.getContext('2d');
        x.filter = b.filter || 'none';
        const [sx, sy, sw, sh] = b.crop;
        const pad = (b.blurPad || 0);
        x.drawImage(im, sx, sy, sw, sh, -pad, -pad, W + pad * 2, b.h + pad * 2);
        x.filter = 'none';
        bgCanvas = c;
      };
      im.src = spec.bg.src;
    }

    function setConfig(next) {
      cfg = next;
      const was = enabled;
      enabled = cfg.mode === K;
      cv.style.display = enabled ? 'block' : 'none';
      ui.root.style.display = enabled ? 'block' : 'none';
      ui.title.textContent = channelName().toUpperCase();
      if (enabled && !was) { openedAt = Date.now(); lastSpeechAt = Date.now(); }
      if (!enabled) voice.stop();
      updateLikeBar();
      updateHud();
    }
    const channelName = () => (cfg[K + 'Name'] || '').trim() || spec.defaultName;

    function setPaused(p) {
      if (p && !pauseAt) pauseAt = performance.now();
      else if (!p && pauseAt) {
        pausedMs += performance.now() - pauseAt;
        pauseAt = 0;
        last = clock();
        requestAnimationFrame(loop);
      }
      if (p) voice.stop();
    }

    // ---------- khách ----------
    function loadAvatar(url) {
      if (!url || !url.startsWith('https://')) return null;
      if (avatars.has(url)) return avatars.get(url);
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.src = url;
      avatars.set(url, img);
      if (avatars.size > 300) avatars.delete(avatars.keys().next().value);
      return img;
    }
    const keyOf = (u) => String(u?.id || u?.uniqueId || u?.nickname || '');
    function cleanName(n) {
      let s = String(n).replace(/[\u0000-\u001f]/g, '').trim();
      const words = String(cfg.filterWords || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
      for (const w of words) if (s.toLowerCase().includes(w)) s = 'Khách';
      return s.slice(0, 24) || 'Khách';
    }
    const scoreOf = (p) => {
      let sc = scores.get(p.key);
      if (!sc) { sc = { key: p.key, name: p.name, points: 0, beers: 0 }; scores.set(p.key, sc); }
      sc.name = p.name;
      return sc;
    };
    const seated = () => [...people.values()].filter((p) => p.state !== 'out');
    const realCount = () => seated().filter((p) => !p.bot).length;

    function getPerson(user, mode = 'evict') {
      const k = keyOf(user);
      if (!k) return null;
      let p = people.get(k);
      if (p && p.state === 'out') { people.delete(k); p = null; }
      if (!p) {
        if (mode === 'none') return null;
        const seat = pickSeat(mode === 'evict');
        if (!seat) return null;
        p = spawn(k, cleanName(user?.nickname || 'Khách'), seat, { img: loadAvatar(user?.avatar) });
      }
      p.active = Date.now();
      if (user?.avatar && !p.img) p.img = loadAvatar(user.avatar);
      return p;
    }

    function spawn(key, name, seat, extra = {}) {
      const fromLeft = seat.x < W / 2;
      const p = {
        key, name, seat, look: makeLook(key), x: fromLeft ? -70 : W + 70, y: seat.y, state: 'in', walk: 0,
        path: [{ x: seat.x, y: seat.y }], items: [], bubble: null, active: Date.now(), glowUntil: 0, phase: rnd(0, 6.28),
        blinkAt: clock() + rnd(1000, 4000), pose: null, drunk: 0, sleepUntil: 0, hicAt: 0, daica: false, bot: false,
        botAt: Date.now() + rnd(4000, 12000), label: null, ...extra
      };
      seat.taken = p;
      people.set(key, p);
      return p;
    }

    // Hết chỗ: khách giả lập nhường trước, sau đó tới người im lặng lâu nhất
    function pickSeat(evict) {
      const free = seats.find((s) => !s.taken);
      if (free) return free;
      if (!evict) {
        const bot = seated().find((p) => p.bot);
        if (!bot) return null;
        return leave(bot, true);
      }
      let victim = null;
      for (const p of seated()) {
        if (p === spotlight?.p || p.state !== 'sit') continue;
        if (!victim || (p.bot && !victim.bot) || (p.bot === victim.bot && p.active < victim.active)) victim = p;
      }
      return victim ? leave(victim, true) : null;
    }

    function leave(p, now = false) {
      const seat = p.seat;
      if (seat && seat.taken === p) seat.taken = null;
      p.state = 'out';
      p.pose = null;
      const toLeft = p.x < W / 2;
      p.path = [{ x: toLeft ? -90 : W + 90, y: p.y + (now ? 0 : 0) }];
      for (let i = orders.length - 1; i >= 0; i--) if (orders[i].p === p) orders.splice(i, 1);
      return seat;
    }

    // ---------- lời nói ----------
    function say(p, text, ms) {
      if (!p || !text) return;
      p.bubble = { text: fitBubble(String(text)), until: clock() + (ms || clamp(String(text).length * 120, 2600, 5200)) };
    }
    function fitBubble(s) { s = s.replace(/\s+/g, ' ').trim(); return s.length > 34 ? s.slice(0, 33) + '…' : s; }
    function floater(text, x, y, opt = {}) {
      floaters.push({ text, x, y, t0: clock(), dur: opt.dur || 1600, size: opt.size || 34, color: opt.color || '#fff', rise: opt.rise ?? 90 });
      if (floaters.length > 40) floaters.shift();
    }
    function burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, 6.28), sp = rnd(2, 6);
        fx.push({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: rnd(0.5, 1.1), age: 0, color });
      }
    }
    function confetti(n = 120) {
      const cols = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#facc15', '#fff'];
      for (let i = 0; i < n; i++) fx.push({ type: 'conf', x: rnd(0, W), y: rnd(-400, -10), vx: rnd(-1, 1), vy: rnd(3, 6), r: rnd(0, 6), vr: rnd(-0.2, 0.2), color: pick(cols), w: rnd(8, 16), h: rnd(5, 9), age: 0, life: 9 });
    }
    function iceRain(ms) {
      const until = clock() + ms;
      const drop = () => {
        if (clock() > until || !enabled) return;
        for (let i = 0; i < 4; i++) fx.push({ type: 'ice', x: rnd(0, W), y: rnd(-80, -10), vx: rnd(-0.6, 0.6), vy: rnd(5, 9), r: rnd(0, 6), vr: rnd(-0.1, 0.1), s: rnd(14, 26), age: 0, life: 6 });
        setTimeout(drop, 120);
      };
      drop();
    }
    function banner(title, sub, ms = 4200) {
      const b = ui.banner;
      b.querySelector('.qbn-title').textContent = title;
      b.querySelector('.qbn-sub').textContent = sub || '';
      b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
      clearTimeout(banner.t);
      banner.t = setTimeout(() => b.classList.remove('on'), ms);
    }

    // ---------- gọi món ----------
    function order(p, id, o = {}) {
      const it = spec.menu[id];
      if (!p || !it || p.state === 'out') return;
      if (!o.silent) say(p, o.say || pick(it.say));
      if (!o.free) { scoreOf(p).points += 2; }
      spec.onOrder?.(api, p, id, o);
      orders.push({ p, id });
      pumpOrders();
      updateHud();
    }

    function pumpOrders() {
      // khách gọi dồn dập: các món dư ra lên bàn ngay, không bắt cả quán chờ
      while (orders.length > 6) deliver(orders.shift(), true);
      for (const s of staff) {
        if (s.state !== 'idle' || !orders.length) continue;
        let o = null;
        while (orders.length && !o) { const c = orders.shift(); if (people.has(c.p.key) && c.p.state !== 'out') o = c; }
        if (!o) return;
        s.state = 'go';
        s.order = o;
        s.carry = o.id;
        s.path = [servePoint(o.p)];
      }
    }
    function servePoint(p) {
      const st = p.seat;
      if (st.table < 0) return { x: st.x + 70 * st.s * st.dir, y: st.y + 14 };
      const t = tables[st.table];
      return { x: clamp(st.x, t.x - t.w / 2 + 30, t.x + t.w / 2 - 30), y: t.y + 46 * t.s };
    }
    function deliver(o, instant) {
      const p = o.p;
      if (!people.has(p.key) || p.state === 'out') return;
      const it = spec.menu[o.id];
      const now = clock();
      const item = { id: o.id, level: 1, t0: now, sipAt: now + rnd(2500, 6000), life: it.drink ? 0 : (it.life || 90000) };
      if (it.shared && p.seat.table >= 0) {
        const t = tables[p.seat.table];
        t.items = t.items.filter((x) => x.id !== o.id);
        t.items.push(item);
      } else {
        p.items.push(item);
        while (p.items.length > 2) p.items.shift();
      }
      const at = itemPos(p, p.items.length - 1);
      burst(at.x, at.y - 20, '#fde68a', instant ? 10 : 6);
      if (p.cheerOnDeliver && it.drink) { p.cheerOnDeliver = false; setTimeout(() => cheerTable(p), 350); }
      if (it.drink) sfx.play(o.id === 'bia' ? 'pour' : 'ice'); else sfx.play('pop');
    }

    function itemPos(p, idx) {
      const st = p.seat;
      const n = Math.max(1, p.items.length);
      const gap = 30 * st.s;
      const off = (idx - (n - 1) / 2) * gap * (st.slot === 'l' || st.slot === 'r' ? 0.6 : 1);
      if (st.table < 0) return { x: st.ix + off, y: st.iy };
      return { x: st.ix + off, y: st.iy + (st.slot === 'l' || st.slot === 'r' ? (idx - (n - 1) / 2) * 6 * st.s : 0) };
    }

    // ---------- cụng ly (dùng cho quán nhậu) ----------
    function cheerTable(p, o = {}) {
      if (!p || p.seat.table < 0) { if (p) { pose(p, 'cheer', 1400); sfx.play('clink', 1); } return; }
      const t = tables[p.seat.table];
      const now = clock();
      if (!o.force && now - t.cheerAt < 3500) { pose(p, 'cheer', 1200); p.cheerDrink = true; return; }
      t.cheerAt = now;
      const mates = seated().filter((m) => m.seat.table === t.i && m.state === 'sit');
      for (const m of mates) {
        if (m.sleepUntil > now) continue;
        pose(m, 'cheer', 1500);
        m.cheerDrink = true;
      }
      floater(o.text || 'DZÔ!', t.x, t.topB - 150 * t.s, { size: 64, color: '#fde047', dur: 1500 });
      sfx.play('dzo', Math.min(3, mates.length));
      if (o.say !== false) say(p, o.say || pick(['Dzô!', '1, 2, 3 dzô!', 'Trăm phần trăm!', 'Cạn ly!']));
    }
    function massCheer(text) {
      const now = clock();
      for (const t of tables) t.cheerAt = now;
      for (const m of seated()) {
        if (m.state !== 'sit') continue;
        m.sleepUntil = 0;
        pose(m, 'cheer', 1800);
        m.cheerDrink = true;
      }
      const busy = new Set(seated().map((m) => m.seat.table));
      for (const t of tables) if (busy.has(t.i)) floater(text || 'DZÔ!', t.x, t.topB - 150 * t.s, { size: 56, color: '#fde047', dur: 1800 });
      sfx.play('dzo', 3);
    }

    // đang làm đúng động tác đó thì không bắt đầu lại (tránh spam "dzô" làm cụng ly mãi không uống)
    function pose(p, arm, ms) { if (p.pose?.arm !== arm) p.pose = { arm, t0: clock(), ms }; }

    // ---------- giọng đọc ----------
    const speakName = (n) => String(n).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim() || 'bạn';
    let lastSpeechAt = Date.now();
    let duck = false;
    const voice = {
      q: [], pq: [], busy: false, audio: null,
      say(text, priority) {
        if (!opt('Voice', true) || !text) return;
        (priority ? this.pq : this.q).push(text);
        if (this.q.length > 5) this.q.splice(0, this.q.length - 5);
        if (this.pq.length > 12) this.pq.splice(0, this.pq.length - 12);
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
        const a = new Audio(`/api/tts?rate=${opt('Rate', 1.05)}&text=${encodeURIComponent(text)}`);
        a.volume = Math.min(1, (cfg.volume ?? 0.7) + 0.25);
        this.audio = a;
        setDuck(true);
        a.onended = done;
        a.onerror = () => this.fallback(text, done);
        a.play().catch(() => this.fallback(text, done));
      },
      fallback(text, done) {
        const ss = window.speechSynthesis;
        const v = ss && ss.getVoices().find((x) => /^vi/i.test(x.lang));
        if (!v) { done(); return; }
        const u = new SpeechSynthesisUtterance(text);
        u.voice = v; u.lang = v.lang; u.rate = 1.05;
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
    function setDuck(d) { if (duck !== d) { duck = d; sfx.duck(d); } }

    const greetQ = [];
    let lastGreet = 0;
    function greetTick() {
      if (!opt('Greet', true) || !greetQ.length || Date.now() - lastGreet < 7000) return;
      lastGreet = Date.now();
      const names = greetQ.splice(0, 3).map(speakName);
      const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' và ' + names.at(-1) : names[0];
      voice.say(spec.lines.greet(list, channelName()), false);
    }
    const shareReminder = () => voice.say(spec.lines.share(channelName()), false);

    // ---------- API cho từng cảnh ----------
    const api = {
      order, say, floater, burst, confetti, iceRain, banner, cheerTable, massCheer, pose, leave,
      sfx: (n, ...a) => sfx.play(n, ...a),
      speak: (t, prio = true) => voice.say(t, prio),
      name: () => channelName(),
      speakName,
      score: scoreOf,
      addSold: (n = 1) => { sold += n; updateHud(); },
      everyone: (fn) => seated().filter((p) => p.state !== 'out').forEach(fn),
      mates: (p) => (p.seat.table < 0 ? [p] : seated().filter((m) => m.seat.table === p.seat.table && m.state !== 'out')),
      tableOf: (p) => (p.seat.table >= 0 ? tables[p.seat.table] : null),
      clock,
      big: () => Math.max(1, cfg.bigGiftDiamonds || 30)
    };

    // ---------- sự kiện live ----------
    function onEvent(ev) {
      if (!enabled || !ev || pauseAt) return;
      switch (ev.type) {
        case 'chat': {
          const raw = String(ev.text || '');
          const n = norm(raw);
          const p = getPerson(ev.user);
          if (!p) return;
          scoreOf(p).points += 1;
          if (/^(tinh tien|ve thoi|ve nha|ve day|di ve|bye|pp|tam biet)\b/.test(n)) {
            say(p, pick(['Tính tiền em ơi!', 'Thôi về đây!', 'Mai lại ra nhé!']));
            sfx.play('cash');
            const pp = p;
            setTimeout(() => { if (people.get(pp.key) === pp && pp.state === 'sit') leave(pp); }, 2600);
            return;
          }
          if (spec.onCommand?.(api, p, n, raw)) return;
          const hits = [];
          for (const [id, it] of Object.entries(spec.menu)) if (it.re.test(n) && hits.length < 2) hits.push(id);
          if (hits.length) { hits.forEach((id, i) => order(p, id, i ? { silent: true } : {})); return; }
          say(p, raw);
          return;
        }
        case 'join': {
          const k = keyOf(ev.user);
          if (people.has(k)) return;
          greetQ.push(cleanName(ev.user?.nickname || 'bạn'));
          if (greetQ.length > 30) greetQ.splice(0, greetQ.length - 30);
          setTimeout(() => { const p = getPerson(ev.user, 'free'); if (p) say(p, pick(spec.lines.hello)); }, 3500);
          return;
        }
        case 'gift': onGift(ev); return;
        case 'follow': {
          const p = getPerson(ev.user);
          if (p) { scoreOf(p).points += 5; p.glowUntil = clock() + 4000; say(p, 'Đã follow quán! ❤️'); pose(p, 'wave', 1600); }
          return;
        }
        case 'share': {
          const p = getPerson(ev.user, 'free');
          if (p) { scoreOf(p).points += 5; say(p, 'Đã rủ bạn bè ra quán! 🔗'); pose(p, 'wave', 1600); }
          return;
        }
        case 'like': {
          const p = people.get(keyOf(ev.user));
          if (p && p.state !== 'out' && Math.random() < 0.5) fx.push({ type: 'heart', x: p.x + rnd(-20, 20), y: p.y - 230 * p.seat.s, t0: clock(), dur: 1600 });
          return;
        }
      }
    }

    function onGift(ev) {
      const p = getPerson(ev.user);
      if (!p) return;
      const coins = Math.max(1, Number(ev.total || ev.diamonds || 1));
      scoreOf(p).points += coins * 10;
      p.glowUntil = clock() + 9000;
      if (!spotlight || clock() > spotlight.until - 2000) {
        spotlight = { p, until: clock() + 7000 };
        showNameplate(p, ev);
      }
      burst(p.x, p.y - 160 * p.seat.s, '#facc15', 18);
      spec.onGift(api, p, coins, ev);
      updateHud();
    }

    function showNameplate(p, ev) {
      const n = ui.plate;
      n.querySelector('.np-name').textContent = p.name;
      n.querySelector('.np-gift').textContent = `đã tặng ${ev.giftName || 'quà'}${ev.repeatCount > 1 ? ' x' + ev.repeatCount : ''}`;
      const av = n.querySelector('.np-av');
      av.replaceChildren();
      if (p.img) { const im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = p.img.src; av.appendChild(im); }
      else av.textContent = (p.name[0] || '?').toUpperCase();
      n.classList.remove('on'); void n.offsetWidth; n.classList.add('on');
      clearTimeout(showNameplate.t);
      showNameplate.t = setTimeout(() => n.classList.remove('on'), 6500);
    }

    // ---------- tim ----------
    function onStats(s) {
      if (!enabled || !s) return;
      if (likeBase < 0) likeBase = s.likes || 0;
      likeCount = (s.likes || 0) - likeBase;
      checkLikes();
    }
    function addLikes(n) { likeCount += n; checkLikes(); }
    const likeGoal = () => Math.max(10, opt('LikeGoal', 500));
    function checkLikes() {
      const goal = likeGoal();
      if (likeCount >= goal) {
        // tim dồn một lúc (vừa chuyển cảnh, mất kết nối…) chỉ tính 1 lần, bỏ phần dư nguyên vòng
        const over = likeCount - goal;
        likeBase += goal + Math.floor(over / goal) * goal;
        likeCount = over % goal;
        if (clock() > eventUntil) likeEvent();
      }
      updateLikeBar();
    }
    function likeEvent() {
      eventUntil = clock() + 20000;
      spec.onLikeGoal(api);
      updateLikeBar();
    }
    function updateLikeBar() {
      if (!ui) return;
      const goal = likeGoal();
      const on = clock() < eventUntil;
      ui.likeFill.style.width = (on ? 100 : clamp((likeCount / goal) * 100, 0, 100)) + '%';
      ui.likeText.textContent = spec.likeText(Math.max(0, likeCount), goal, on);
    }

    function updateHud() {
      if (!ui) return;
      ui.sold.textContent = spec.soldText(sold);
      ui.seats.textContent = `🪑 ${seated().filter((p) => p.state === 'sit' || p.state === 'in').length}/${seats.length} ${spec.seatWord}`;
    }
    function updateClock() {
      const s = Math.floor((Date.now() - openedAt) / 1000);
      const hh = String(Math.floor(s / 3600)).padStart(2, '0'), mm = String(Math.floor(s / 60) % 60).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
      ui.clock.textContent = `⏱ ${hh}:${mm}:${ss}`;
    }

    // ---------- lệnh từ app ----------
    function command(c) {
      if (!enabled || !c) return;
      const a = c.action;
      if (a === 'speak' && c.text) voice.say(String(c.text).slice(0, 400), true);
      else if (a === 'share') shareReminder();
      else if (a === 'testLikes') addLikes(Number(c.n) || 100);
      else if (a === 'event') likeEvent();
      else if (a === 'reset') { scores.clear(); sold = 0; renderBoard(); updateHud(); }
      else if (a === 'clear') { for (const p of seated()) leave(p); updateHud(); }
      else spec.onAppCommand?.(api, a, c);
    }

    // ---------- khách giả lập ----------
    function botTick() {
      const want = opt('Bots', true) ? clamp(spec.botTarget - realCount(), 0, spec.botMax) : 0;
      const bots = seated().filter((p) => p.bot);
      if (bots.length < want && Math.random() < 0.35) {
        const seat = seats.find((s) => !s.taken);
        if (seat) {
          const name = spec.bots.names[botSeq++ % spec.bots.names.length];
          const p = spawn('bot:' + name, name, seat, { bot: true });
          p.look = makeLook('bot:' + name);
        }
      } else if (bots.length > want && Math.random() < 0.2) {
        const b = bots.filter((p) => p.state === 'sit').sort((x, y) => x.active - y.active)[0];
        if (b) { say(b, pick(['Thôi về đây!', 'Mai gặp lại nhé!'])); setTimeout(() => b.state === 'sit' && leave(b), 1800); }
      }
      const now = Date.now();
      for (const b of bots) {
        if (b.state !== 'sit' || now < b.botAt) continue;
        b.botAt = now + rnd(9000, 22000);
        spec.bots.act(api, b);
      }
    }

    // ---------- mỗi giây ----------
    function tick1s() {
      if (!enabled || pauseAt) return;
      greetTick();
      botTick();
      renderBoard();
      updateLikeBar();
      updateHud();
      updateClock();
      const now = Date.now();
      for (const s of staff) {
        if (now > s.talkAt) { s.talkAt = now + rnd(15000, 35000); if (s.state === 'idle') sayStaff(s, pick(s.lines)); }
      }
      if (spec.drunk) {
        const c = clock();
        for (const p of seated()) {
          p.drunk = Math.max(0, p.drunk - 1 / 100);
          if (p.drunk >= 9 && p.sleepUntil < c && p.state === 'sit') { p.sleepUntil = c + 18000; p.drunk = 6.5; say(p, 'Zzz… say rồi…', 4000); }
          if (p.drunk >= 5 && p.sleepUntil < c && c > p.hicAt && p.state === 'sit') {
            p.hicAt = c + rnd(9000, 20000);
            say(p, pick(['Hức!', 'Hức… chưa say!', 'Uống tiếp!', 'Anh em mình… hức!']), 2200);
            sfx.play('hiccup');
          }
        }
      }
      if (opt('Voice', true) && now - lastSpeechAt > 100000 && !voice.busy) shareReminder();
    }
    function sayStaff(s, t) { s.bubble = { text: fitBubble(t), until: clock() + 3200 }; }

    function renderBoard() {
      const top = [...scores.values()].filter((s) => !String(s.key).startsWith('bot:') && (s.points > 0 || s.beers > 0))
        .sort(spec.boardSort || ((a, b) => b.points - a.points)).slice(0, 5);
      ui.board.replaceChildren(...top.map((s, i) => {
        const r = document.createElement('div');
        r.className = 'qb-row';
        const a = document.createElement('span'); a.className = 'qb-rank'; a.textContent = i + 1;
        const n = document.createElement('span'); n.className = 'qb-name'; n.textContent = s.name;
        const v = document.createElement('span'); v.className = 'qb-pts'; v.textContent = spec.boardValue(s);
        r.append(a, n, v);
        return r;
      }));
      ui.boardEmpty.style.display = top.length ? 'none' : '';
    }

    // ---------- vòng lặp ----------
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

    function walkTo(o, dt, speed) {
      const tgt = o.path[0];
      if (!tgt) return true;
      const dx = tgt.x - o.x, dy = tgt.y - o.y;
      const d = Math.hypot(dx, dy);
      const sp = speed * dt;
      if (Math.abs(dx) > 2) o.flip = dx < 0;
      o.walk += dt * 11;
      if (d <= sp) { o.x = tgt.x; o.y = tgt.y; o.path.shift(); return !o.path.length; }
      o.x += (dx / d) * sp; o.y += (dy / d) * sp;
      return false;
    }

    function update(dt, t) {
      for (const p of [...people.values()]) {
        if (p.state === 'in') {
          if (walkTo(p, dt, 300 * p.seat.s)) { p.state = 'sit'; sfx.play('pop'); }
        } else if (p.state === 'out') {
          if (walkTo(p, dt, 320 * p.seat.s)) { people.delete(p.key); continue; }
        } else if (p.state === 'sit') {
          sitUpdate(p, t);
        }
        if (p.bubble && t > p.bubble.until) p.bubble = null;
      }
      for (const s of staff) {
        if (s.bubble && t > s.bubble.until) s.bubble = null;
        if (s.state === 'go') {
          if (!people.has(s.order.p.key) || s.order.p.state === 'out') { s.state = 'back'; s.carry = null; s.path = [{ ...s.home }]; continue; }
          if (walkTo(s, dt, 330 * scaleAt(s.y))) {
            deliver(s.order, false);
            sayStaff(s, pick(spec.serveLines));
            s.state = 'back'; s.carry = null; s.order = null;
            s.path = [{ ...s.home }];
          }
        } else if (s.state === 'back') {
          if (walkTo(s, dt, 330 * scaleAt(s.y))) { s.state = 'idle'; s.flip = false; pumpOrders(); }
        }
      }
      for (const tb of tables) tb.items = tb.items.filter((it) => !it.life || t - it.t0 < it.life);

      // máy quay áp sát người tặng quà
      let tk = 1, tx = W / 2, ty = H / 2;
      if (spotlight && t < spotlight.until && people.has(spotlight.p.key) && spotlight.p.state !== 'out') {
        const p = spotlight.p;
        tk = 1.32; tx = clamp(p.x, W / 2 / 1.32, W - W / 2 / 1.32); ty = p.y - 130 * p.seat.s;
      } else if (spotlight && t >= spotlight.until) spotlight = null;
      const k = Math.min(1, dt * 2.4);
      zoom.k += (tk - zoom.k) * k; zoom.x += (tx - zoom.x) * k; zoom.y += (ty - zoom.y) * k;

      for (let i = fx.length - 1; i >= 0; i--) {
        const e = fx[i];
        if (e.type === 'heart') { if (t - e.t0 > e.dur) fx.splice(i, 1); continue; }
        e.age += dt;
        e.x += e.vx; e.y += e.vy;
        if (e.type === 'spark') e.vy += 0.15;
        if (e.r !== undefined) e.r += e.vr;
        if (e.age > e.life || e.y > H + 60) fx.splice(i, 1);
      }
      for (let i = floaters.length - 1; i >= 0; i--) if (t - floaters[i].t0 > floaters[i].dur) floaters.splice(i, 1);
      if (fx.length > 700) fx.splice(0, fx.length - 700);
    }

    function sitUpdate(p, t) {
      if (t > p.blinkAt) { p.blinkUntil = t + 140; p.blinkAt = t + rnd(2200, 5200); }
      // món ăn hết hạn thì dọn
      p.items = p.items.filter((it) => (spec.menu[it.id].drink ? it.level > 0.001 : t - it.t0 < it.life));
      if (p.pose) {
        const e = t - p.pose.t0;
        if (e > p.pose.ms) {
          if (p.pose.arm === 'drink' && p.pose.item) {
            const it = p.pose.item;
            it.level -= spec.menu[it.id].sip || 0.25;
            if (it.level <= 0.001) { it.level = 0; spec.onFinish?.(api, p, it.id); }
          }
          if (p.pose.arm === 'cheer' && p.cheerDrink) {
            p.cheerDrink = false;
            const it = p.items.find((x) => spec.menu[x.id].drink && x.level > 0);
            if (it) { it.level = 0; spec.onFinish?.(api, p, it.id, true); }
          }
          p.pose = null;
        }
        return;
      }
      if (p.sleepUntil > t) return;
      const drink = p.items.find((it) => spec.menu[it.id].drink && it.level > 0);
      if (drink && t > drink.sipAt) {
        drink.sipAt = t + rnd(5000, 12000) / (spec.drunk ? 1 + p.drunk * 0.05 : 1);
        p.pose = { arm: 'drink', t0: t, ms: 1700, item: drink };
      }
    }

    // ---------- vẽ ----------
    function draw(t) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = spec.sky;
      g.fillRect(0, 0, W, H);
      g.setTransform(zoom.k, 0, 0, zoom.k, W / 2 - zoom.x * zoom.k, H / 2 - zoom.y * zoom.k);
      if (bgCanvas) g.drawImage(bgCanvas, 0, spec.bg.y || 0);
      spec.drawGround(g, t, tables);
      spec.drawBackdrop?.(g, t, channelName());

      // sắp theo chiều sâu: bàn nằm giữa hàng ghế sau và ghế hai bên
      const list = [];
      // ghế sau đặt ở y - (h+d-70)*s, ghế hai bên ở y + 6*s -> bàn chen giữa ở y - 2*s
      for (const tb of tables) list.push({ y: tb.y - 2 * tb.s, f: () => drawTable(tb, t) });
      for (const p of people.values()) list.push({ y: p.y, f: () => drawPerson(p, t) });
      for (const s of staff) list.push({ y: s.y, f: () => drawStaff(s, t) });
      list.sort((a, b) => a.y - b.y);
      for (const d of list) d.f();
      spec.drawFront?.(g, t);

      for (const p of people.values()) drawTag(p);
      for (const p of people.values()) if (p.bubble) drawBubble(p.x, tagTop(p) - 8, p.bubble.text, p.seat.s);
      for (const s of staff) {
        const sc = scaleAt(s.y);
        drawStaffTag(s, sc);
        if (s.bubble) drawBubble(s.x, s.y - 240 * sc - 44, s.bubble.text, sc, true);
      }
      drawFx(t);
      g.setTransform(1, 0, 0, 1, 0, 0);
      drawScreenFx(t);
    }

    function drawStool(x, y, s, col) {
      g.save(); g.translate(x, y); g.scale(s, s);
      g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(0, 0, 34, 9, 0, 0, 6.283); g.fill();
      g.fillStyle = col;
      g.beginPath(); g.moveTo(-26, -50); g.lineTo(26, -50); g.lineTo(30, 0); g.lineTo(18, 0); g.lineTo(15, -36); g.lineTo(-15, -36); g.lineTo(-18, 0); g.lineTo(-30, 0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(-26, -50, 52, 5);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(-15, -36, 30, 4);
      g.restore();
    }

    function drawTable(tb, t) {
      const T = spec.table;
      const s = tb.s;
      const w = tb.w, wb = w * 0.92;
      g.save();
      // bóng
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath(); g.ellipse(tb.x, tb.y + 2, w * 0.55, 16 * s, 0, 0, 6.283); g.fill();
      // chân bàn
      g.fillStyle = T.leg;
      const lw = 14 * s;
      for (const sx of [-1, 1]) {
        g.fillRect(tb.x + sx * (wb / 2 - 18 * s) - lw / 2, tb.topB, lw, tb.y - 10 * s - tb.topB);
        g.fillRect(tb.x + sx * (w / 2 - 12 * s) - lw / 2, tb.topF, lw, tb.y - tb.topF);
      }
      // mặt bàn
      g.fillStyle = T.top;
      g.beginPath(); g.moveTo(tb.x - wb / 2, tb.topB); g.lineTo(tb.x + wb / 2, tb.topB); g.lineTo(tb.x + w / 2, tb.topF); g.lineTo(tb.x - w / 2, tb.topF); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.14)';
      g.beginPath(); g.moveTo(tb.x - wb / 2 + 10 * s, tb.topB + 6 * s); g.lineTo(tb.x + wb / 2 - 10 * s, tb.topB + 6 * s); g.lineTo(tb.x + w / 2 - 14 * s, tb.topF - 6 * s); g.lineTo(tb.x - w / 2 + 14 * s, tb.topF - 6 * s); g.closePath(); g.fill();
      g.fillStyle = T.side;
      g.fillRect(tb.x - w / 2, tb.topF, w, 12 * s);
      if (spec.tableLabels) {
        g.fillStyle = '#facc15';
        g.font = `800 ${Math.round(12 * s)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(tb.label, tb.x, tb.topF + 6.5 * s);
      }
      g.restore();
      // đồ chung trên bàn (lẩu…) + đồ của từng khách
      for (const it of tb.items) drawItem(g, it.id, tb.x, lerp(tb.topB, tb.topF, 0.55), s, 1);
      const onTable = [...people.values()].filter((p) => p.seat.table === tb.i && p.state === 'sit').sort((a, b) => a.seat.iy - b.seat.iy);
      for (const p of onTable) p.items.forEach((it, i) => { if (p.pose?.item !== it) { const at = itemPos(p, i); drawItem(g, it.id, at.x, at.y, s * 0.95, it.level); } });
    }

    function personOpts(p, t) {
      const o = { seated: p.state === 'sit', walk: p.walk, t, red: spec.drunk ? clamp(p.drunk / 9, 0, 1) : 0, daica: p.daica };
      if (p.state !== 'sit') { o.arm = 'rest'; o.face = p.bubble ? 'talk' : 'normal'; return o; }
      o.arm = p.seat.slot === 'bl' || p.seat.slot === 'br' ? 'table' : 'rest';
      o.face = p.bubble ? 'talk' : spec.drunk && p.drunk >= 5 ? 'drunk' : 'normal';
      if (p.blinkUntil > t) o.blink = true;
      if (p.sleepUntil > t) { o.arm = 'sleep'; o.face = 'sleep'; return o; }
      if (p.pose) {
        const e = (t - p.pose.t0) / p.pose.ms;
        const k = e < 0.25 ? ease(e / 0.25) : e > 0.8 ? ease((1 - e) / 0.2) : 1;
        o.arm = p.pose.arm; o.armK = k;
        if (p.pose.arm === 'drink') { o.hold = p.pose.item.id; o.holdLevel = p.pose.item.level; o.face = 'normal'; }
        if (p.pose.arm === 'cheer') { const d = p.items.find((x) => spec.menu[x.id].drink && x.level > 0); o.hold = d ? d.id : null; o.holdLevel = d ? d.level : 0; o.face = 'cheer'; }
        if (p.pose.arm === 'wave') o.face = 'happy';
      }
      return o;
    }

    function drawPerson(p, t) {
      const s = p.seat.s;
      const st = p.seat;
      if (p.state === 'sit' && st.slot !== 'bl' && st.slot !== 'br') drawStool(st.x, st.y, s, spec.stools[st.i % spec.stools.length]);
      if (p.state === 'sit' && (st.slot === 'bl' || st.slot === 'br')) drawStool(st.x, st.y, s * 0.92, spec.stools[st.i % spec.stools.length]);
      g.save();
      g.translate(p.x, p.y);
      g.scale(s, s);
      // hào quang khi vừa tặng quà
      if (p.glowUntil > t) {
        g.save(); g.globalCompositeOperation = 'lighter';
        g.globalAlpha = Math.min(1, (p.glowUntil - t) / 1500) * 0.7;
        const gr = g.createRadialGradient(0, -120, 8, 0, -120, 200);
        gr.addColorStop(0, 'rgba(255,214,120,.95)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
        g.fillStyle = gr; g.fillRect(-210, -330, 420, 400);
        g.restore();
      }
      if (p.state !== 'sit') { g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 0, 30, 8, 0, 0, 6.283); g.fill(); }
      const o = personOpts(p, t);
      if (o.arm === 'sleep') { g.translate(0, 24); }
      else if (spec.drunk && p.drunk >= 4 && p.state === 'sit') g.rotate(Math.sin(t / 650 + p.phase) * 0.03 * (p.drunk - 3));
      if (p.state !== 'sit' && p.flip) g.scale(-1, 1);
      else if (p.state === 'sit' && st.dir < 0 && st.slot !== 'bl' && st.slot !== 'br') g.scale(-1, 1);
      paintChibi(g, p.look, o);
      g.restore();
      if (st.table < 0 && p.state === 'sit') p.items.forEach((it, i) => { if (p.pose?.item !== it) { const at = itemPos(p, i); drawItem(g, it.id, at.x, at.y, s * 0.95, it.level); } });
      if (o.arm === 'sleep' && Math.floor(t / 600) % 2 === 0) {
        g.font = `800 ${Math.round(26 * s)}px ${FONT}`; g.fillStyle = '#e0f2fe'; g.textAlign = 'center';
        g.fillText('Z z z', p.x + 40 * s, p.y - 200 * s);
      }
    }

    function drawStaff(s, t) {
      const sc = scaleAt(s.y);
      g.save();
      g.translate(s.x, s.y); g.scale(sc, sc);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 0, 30, 8, 0, 0, 6.283); g.fill();
      if (s.flip) g.scale(-1, 1);
      const moving = s.state !== 'idle';
      paintChibi(g, s.look, {
        seated: false, walk: moving ? s.walk : 0, t,
        arm: s.carry ? 'carry' : (s.bubble ? 'wave' : 'rest'), hold: s.carry, face: s.bubble ? 'talk' : 'happy',
        blink: Math.floor(t / 2900) % 7 === 0 && (t % 2900) < 140
      });
      g.restore();
    }

    const tagTop = (p) => p.y - (p.state === 'sit' ? (p.sleepUntil > clock() ? 175 : 200) : 214) * p.seat.s - 34 * clamp(p.seat.s / 0.9, 0.7, 1.2);

    function drawTag(p) {
      if (p.state === 'out') return;
      const s = p.seat.s;
      const f = clamp(s / 0.9, 0.72, 1.2);
      const r = 14 * f;
      const fs = Math.round(17 * f);
      const y = p.y - (p.state === 'sit' ? (p.sleepUntil > clock() ? 175 : 200) : 214) * s;
      g.save();
      g.font = `700 ${fs}px ${FONT}`;
      const pre = spec.tagPrefix ? spec.tagPrefix(p) : '';
      const label = p.label || (p.label = fitText((pre ? pre + ' · ' : '') + p.name, 170));
      const tw = g.measureText(label).width;
      const w = tw + r * 2 + 18;
      const h = Math.max(r * 2 + 6, fs + 12);
      const gold = p === spotlight?.p || p.daica;
      g.fillStyle = gold ? 'rgba(120,53,15,.94)' : p.bot ? 'rgba(30,41,59,.72)' : 'rgba(15,23,42,.84)';
      rr(g, p.x - w / 2, y - h, w, h, h / 2); g.fill();
      if (gold) { g.strokeStyle = '#fbbf24'; g.lineWidth = 2; g.stroke(); }
      const ax = p.x - w / 2 + r + 4, ay = y - h / 2;
      if (p.img && p.img.complete && p.img.naturalWidth) {
        g.save(); g.beginPath(); g.arc(ax, ay, r, 0, 6.283); g.clip(); g.drawImage(p.img, ax - r, ay - r, r * 2, r * 2); g.restore();
      } else {
        g.fillStyle = p.look.shirt; g.beginPath(); g.arc(ax, ay, r, 0, 6.283); g.fill();
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `800 ${Math.round(r)}px system-ui`; g.fillText((p.name[0] || '?').toUpperCase(), ax, ay + 1);
        g.font = `700 ${fs}px ${FONT}`;
      }
      g.fillStyle = gold ? '#fde68a' : '#f8fafc';
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(label, ax + r + 6, ay + 1);
      g.restore();
    }
    function drawStaffTag(s, sc) {
      const f = clamp(sc / 0.9, 0.72, 1.2);
      const fs = Math.round(16 * f);
      g.save();
      g.font = `800 ${fs}px ${FONT}`;
      const w = g.measureText(s.name).width + 22, h = fs + 12, y = s.y - 228 * sc;
      g.fillStyle = spec.staffTag || 'rgba(190,18,60,.9)';
      rr(g, s.x - w / 2, y - h, w, h, h / 2); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(s.name, s.x, y - h / 2 + 1);
      g.restore();
    }

    function drawBubble(x, y, text, s, staffBubble) {
      const f = clamp(s / 0.9, 0.75, 1.2);
      const fs = Math.round(18 * f);
      g.save();
      g.font = `700 ${fs}px ${FONT}`;
      const w = Math.min(320, g.measureText(text).width + 26);
      const h = fs + 16;
      const bx = clamp(x - w / 2, 8, W - w - 8);
      g.fillStyle = staffBubble ? '#fef3c7' : '#ffffff';
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
      rr(g, bx, y - h, w, h, 12); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(x - 8, y - 1); g.lineTo(x + 8, y - 1); g.lineTo(x, y + 10); g.closePath(); g.fill();
      g.fillStyle = '#111827'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, bx + w / 2, y - h / 2 + 1, w - 16);
      g.restore();
    }

    function drawFx(t) {
      for (const e of fx) {
        if (e.type === 'spark') {
          g.globalAlpha = Math.max(0, 1 - e.age / e.life);
          g.fillStyle = e.color; g.beginPath(); g.arc(e.x, e.y, 4, 0, 6.283); g.fill();
          g.globalAlpha = 1;
        } else if (e.type === 'heart') {
          const k = (t - e.t0) / e.dur;
          g.globalAlpha = Math.max(0, 1 - k);
          g.font = `28px ${EMOJI}`; g.textAlign = 'center';
          g.fillText('❤️', e.x + Math.sin(k * 8) * 10, e.y - k * 90);
          g.globalAlpha = 1;
        }
      }
      for (const f of floaters) {
        const k = (t - f.t0) / f.dur;
        g.save();
        g.globalAlpha = k < 0.15 ? k / 0.15 : k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
        g.translate(f.x, f.y - f.rise * ease(Math.min(1, k)));
        const sc = k < 0.2 ? 0.6 + ease(k / 0.2) * 0.5 : 1.1 - Math.min(0.1, (k - 0.2));
        g.scale(sc, sc);
        g.font = `900 ${f.size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(f.text, 0, 0);
        g.fillStyle = f.color; g.fillText(f.text, 0, 0);
        g.restore();
      }
    }
    function drawScreenFx() {
      for (const e of fx) {
        if (e.type === 'conf') {
          g.save(); g.translate(e.x, e.y); g.rotate(e.r); g.fillStyle = e.color; g.fillRect(-e.w / 2, -e.h / 2, e.w, e.h); g.restore();
        } else if (e.type === 'ice') {
          g.save(); g.translate(e.x, e.y); g.rotate(e.r);
          g.fillStyle = 'rgba(224,242,254,.85)'; rr(g, -e.s / 2, -e.s / 2, e.s, e.s, 4); g.fill();
          g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2; g.stroke();
          g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(-e.s / 2 + 3, -e.s / 2 + 3, e.s / 3, 3);
          g.restore();
        }
      }
    }
    function fitText(s, max) {
      g.save(); g.font = `700 17px ${FONT}`;
      if (g.measureText(s).width > max) { while (s.length > 1 && g.measureText(s + '…').width > max) s = s.slice(0, -1); s += '…'; }
      g.restore();
      return s;
    }

    return { init, setConfig, onEvent, onStats, command, setPaused, isOn: () => enabled };
  }

  // =====================================================================
  //                         CẢNH 1: TRÀ ĐÁ VỈA HÈ
  // =====================================================================
  const TRADA = {
    key: 'trada',
    defaultName: 'Trà Đá Vỉa Hè',
    menuTitle: '📋 GÕ VÀO BÌNH LUẬN',
    boardTitle: '👑 ĐẠI CA VỈA HÈ',
    seatWord: 'khách',
    sky: '#7a8a7d',
    bg: { src: 'trada-assets/street.jpg', crop: [250, 0, 720, 960], y: 0, h: 1440, filter: 'blur(1.4px) saturate(1.18) brightness(1.04)', blurPad: 6 },
    scale: { y0: 900, s0: 0.9, k: 0.0008 },
    table: { w: 230, h: 58, d: 34, top: '#2f6fd6', side: '#1f4fa8', leg: '#1d4594' },
    stools: ['#e53935', '#1e63d6', '#e53935', '#f59e0b'],
    tables: [{ x: 320, y: 1120 }, { x: 770, y: 1120 }, { x: 300, y: 1395 }, { x: 790, y: 1395 }],
    solo: [[190, 1640], [420, 1660], [660, 1660], [890, 1640]],
    staff: [{
      name: 'Bà chủ', home: { x: 470, y: 975 },
      look: { female: true, style: 5, hair: '#8a8a8a', shirt: '#b45309', pants: '#3f3f46', skin: '#e2ad86', apron: true, glasses: false, cap: null, stripes: false },
      lines: ['Trà đá đây!', 'Ai làm cốc nữa không?', 'Hướng dương mới rang!', 'Nắng thế này phải trà đá!', 'Ngồi đi cháu, trà đá mát lắm!']
    }],
    serveLines: ['Của cháu đây!', 'Trà đá mát lạnh!', 'Đây, uống đi cho mát!', 'Có ngay có ngay!'],
    menu: {
      chanh: { re: /tra chanh/, drink: true, sip: 0.25, say: ['Cho cốc trà chanh!', 'Làm cốc trà chanh bà ơi!'] },
      tra: { re: /\btra ?da\b|^tra$|^trada$|\b(coc|ly) tra\b|\btd\b/, drink: true, sip: 0.25, say: ['Cho cốc trà đá!', 'Bà ơi 1 trà đá!', 'Trà đá cho mát nào!', 'Thêm cốc trà đá nữa!'] },
      cafe: { re: /ca ?phe|cafe|\bcf\b|nau da|bac xiu|cofee|coffee/, drink: true, sip: 0.25, say: ['Cho ly nâu đá!', '1 cà phê sữa đá!', 'Làm ly cà phê cho tỉnh!'] },
      coca: { re: /coca|\bcoke\b|pepsi|nuoc ngot|7 ?up|fanta/, drink: true, sip: 0.25, say: ['Cho lon coca ướp lạnh!', 'Lon nước ngọt bà ơi!'] },
      bohuc: { re: /bo huc|red ?bull|sting|tang luc|number ?1/, drink: true, sip: 0.34, say: ['Cho chai bò húc!', 'Bò húc cho khỏe!'] },
      huongduong: { re: /huong duong|hat duong|hat huong|\bhd\b|hat bi|^hat!*$/, life: 90000, say: ['Cho đĩa hướng dương!', 'Cắn tí hướng dương!'] },
      banhmi: { re: /banh mi/, life: 60000, say: ['Có bánh mì không bà?', 'Cho cái bánh mì!'] },
      keo: { re: /keo lac|keo vung|^keo!*$/, life: 60000, say: ['Cho cái kẹo lạc!'] }
    },
    menuBoard: [
      ['trà đá', '🧊 cốc trà đá'], ['trà chanh', '🍋 trà chanh'], ['cà phê', '☕ nâu đá'], ['coca · bò húc', '🥤 nước ngọt'],
      ['hướng dương', '🌻 cắn hạt'], ['bánh mì', '🥖 ăn lót dạ'], ['tính tiền', '💸 đứng dậy về'], ['🎁 quà', '😎 đại ca bao quán', 'gift']
    ],
    soldText: (n) => `🧊 Đã bán: ${n.toLocaleString('vi-VN')} ly`,
    likeText: (n, goal, on) => (on ? '🧊 Bà chủ khao cả quán trà đá mát lạnh!' : `❤️ ${n}/${goal} tim — đủ tim bà chủ khao cả quán`),
    boardValue: (s) => `${s.points}`,
    onOrder: (api, p, id) => api.addSold(1),
    onGift(api, p, coins, ev) {
      const n = api.speakName(p.name);
      if (coins >= api.big()) {
        p.daica = true;
        api.banner(`ĐẠI CA ${p.name.toUpperCase()}`, 'BAO CẢ QUÁN TRÀ ĐÁ! 😎', 5200);
        api.say(p, 'Hôm nay anh bao cả quán!', 5000);
        api.everyone((m) => { if (m !== p) setTimeout(() => api.order(m, 'tra', { free: true, silent: true }), Math.random() * 1500); });
        api.order(p, 'bohuc', { free: true, silent: true });
        api.order(p, 'huongduong', { free: true, silent: true });
        api.confetti(160);
        api.sfx('cash');
        api.speak(`Đại ca ${n} tặng ${ev.giftName || 'quà'}, bao cả quán trà đá! Cả quán cảm ơn đại ca!`);
      } else if (coins >= 10) {
        api.order(p, 'bohuc', { free: true, say: 'Cho chai bò húc với cái bánh mì!' });
        api.order(p, 'banhmi', { free: true, silent: true });
        api.mates(p).forEach((m) => m !== p && api.order(m, 'tra', { free: true, silent: true }));
        api.speak(`Cảm ơn ${n} đã tặng ${ev.giftName || 'quà'}! Bà chủ mời cả bàn trà đá nhé.`);
      } else {
        api.order(p, 'tra', { free: true, say: 'Bà ơi cốc trà đá!' });
        api.order(p, 'huongduong', { free: true, silent: true });
        api.speak(`Cảm ơn ${n} đã tặng ${ev.giftName || 'quà'}! Mời bạn cốc trà đá mát lạnh.`);
      }
    },
    onLikeGoal(api) {
      api.banner('BÀ CHỦ KHAO CẢ QUÁN!', 'Cảm ơn cả nhà thả tim — mỗi người một cốc trà đá 🧊', 5000);
      api.everyone((m) => setTimeout(() => api.order(m, 'tra', { free: true, silent: true }), Math.random() * 2000));
      api.iceRain(9000);
      api.sfx('ice');
      api.speak(`Cảm ơn cả nhà đã thả tim! ${api.name()} khao cả quán mỗi người một cốc trà đá mát lạnh!`, false);
    },
    onAppCommand(api, a) {
      if (a === 'treat') this.onLikeGoal(api);
    },
    botTarget: 6,
    botMax: 4,
    bots: {
      names: ['Chú Tư xe ôm', 'Anh Ba shipper', 'Bác Hai bảo vệ', 'Anh Hùng sửa xe', 'Cô Sáu bán xôi', 'Thằng Tèo'],
      act(api, b) {
        const r = Math.random();
        if (r < 0.45) api.order(b, pick(['tra', 'tra', 'tra', 'cafe', 'huongduong', 'coca']), { free: true });
        else api.say(b, pick(['Nắng như đổ lửa!', 'Trà đá vỉa hè là nhất!', 'Hôm nay đường tắc quá', 'Tối qua xem bóng chưa?', 'Chém gió tí cho vui!', 'Cho xin tí hướng dương', 'Giá xăng lại lên rồi…', 'Làm ván cờ không?']));
      }
    },
    lines: {
      hello: ['Chào cả quán!', 'Cho ngồi ké với!', 'Nóng quá, vào làm cốc!'],
      greet: (list, name) => `${name} xin chào ${list}, ghé ngồi làm cốc trà đá cho mát nhé!`,
      share: (name) => `Trà đá vỉa hè ${name} đây! Ai đi ngang ghé ngồi chơi, gõ trà đá để gọi, thả tim và chia sẻ live giúp quán nhé.`
    },
    staffTag: 'rgba(180,83,9,.92)',

    // nền đất vỉa hè: gạch lục giác phối cảnh, nối mềm vào ảnh nền
    drawGround(g, t) {
      const y0 = 985;
      const gr = g.createLinearGradient(0, y0 - 40, 0, H);
      gr.addColorStop(0, 'rgba(170,150,128,0)'); gr.addColorStop(0.05, '#ab9a85'); gr.addColorStop(1, '#7d6c5c');
      g.fillStyle = gr; g.fillRect(0, y0 - 40, W, H - y0 + 40);
      g.save();
      g.beginPath(); g.rect(0, y0, W, H - y0); g.clip();
      g.strokeStyle = 'rgba(70,55,45,.32)'; g.lineWidth = 2;
      let y = y0, row = 0;
      while (y < H) {
        const hgt = 22 + (y - y0) * 0.055;
        const sw = hgt * 1.9;
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
        for (let x = (row % 2) * sw / 2 - sw; x < W + sw; x += sw) {
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + (x - W / 2) * 0.04, y + hgt); g.stroke();
        }
        y += hgt; row++;
      }
      g.restore();
      // vệt nắng xuyên lá
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const x = (i * 173 + Math.sin(t / 3000 + i) * 18) % W, yy = 1050 + (i * 211) % 560;
        const rg = g.createRadialGradient(x, yy, 4, x, yy, 70);
        rg.addColorStop(0, 'rgba(255,240,190,.10)'); rg.addColorStop(1, 'rgba(255,240,190,0)');
        g.fillStyle = rg; g.fillRect(x - 70, yy - 70, 140, 140);
      }
      g.restore();
    },
    drawBackdrop(g) {
      // biển "TRÀ ĐÁ" bìa các-tông dựng cạnh quầy
      g.save();
      g.translate(150, 950);
      g.rotate(-0.05);
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-82, -4, 176, 10);
      g.fillStyle = '#c8a26b'; rr(g, -86, -122, 172, 118, 6); g.fill();
      g.strokeStyle = '#8b6a3e'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#b91c1c'; g.font = `900 46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('TRÀ ĐÁ', 0, -82);
      g.fillStyle = '#1e3a8a'; g.font = `800 24px ${FONT}`;
      g.fillText('Hướng dương · Kẹo', 0, -38);
      g.restore();
    }
  };

  // =====================================================================
  //                             CẢNH 2: ĐI NHẬU
  // =====================================================================
  // "dzô" và các cách gõ khác; từ ngắn dễ trùng ("vô", "uống") chỉ tính khi cả bình luận chỉ có từ đó
  const DZO_RE = /^(1 ?2 ?3 |mot hai ba )?(d?zo+|vo+|100 ?%|uong|uong thoi|cheers)$|\b(dzo+|zoo+|voo+|tram phan tram|can ly|cung ly|nang ly)\b|100 ?%/;
  const NHAU = {
    key: 'nhau',
    defaultName: 'Quán Nhậu Vui Vẻ',
    menuTitle: '📋 GÕ VÀO BÌNH LUẬN',
    boardTitle: '🍺 BẢNG VÀNG BỢM NHẬU',
    seatWord: 'đang nhậu',
    sky: '#0b0806',
    drunk: true,
    tableLabels: true,
    bg: { src: 'nhau-assets/street.jpg', crop: [0, 30, 700, 933], y: 0, h: 1440, filter: 'blur(7px) brightness(.5) saturate(1.35) sepia(.25)', blurPad: 30 },
    scale: { y0: 900, s0: 0.78, k: 0.0007 },
    table: { w: 252, h: 66, d: 38, top: '#d42a20', side: '#9f1810', leg: '#8a140d' },
    stools: ['#1e63d6', '#1e63d6', '#d42a20'],
    tables: [{ x: 300, y: 1075 }, { x: 780, y: 1075 }, { x: 300, y: 1280 }, { x: 780, y: 1280 }, { x: 300, y: 1488 }, { x: 780, y: 1488 }],
    solo: [],
    staff: [
      { name: 'Anh phục vụ', home: { x: 540, y: 965 }, look: { female: false, style: 0, shirt: '#111827', pants: '#1f2937', apron: true, cap: null, glasses: false, stripes: false }, lines: ['Bàn nào gọi thêm bia không?', 'Bia lạnh đây!', 'Mồi mới ra lò!', 'Có ngay anh ơi!'] },
      { name: 'Chị chủ quán', home: { x: 120, y: 975 }, look: { female: true, style: 4, shirt: '#be123c', pants: '#1f2937', apron: true, glasses: false, stripes: false }, lines: ['Uống vui thôi nhé cả nhà!', 'Lẩu nóng đây!', 'Ai gọi mồi không?'] }
    ],
    serveLines: ['Bia đây anh ơi!', 'Có ngay!', 'Mồi lên đây!', 'Mời bàn mình!', 'Ướp lạnh rồi nhé!'],
    tagPrefix: (p) => (p.seat.table >= 0 ? `Bàn ${p.seat.table + 1}` : ''),
    menu: {
      bia: { re: /\bbia\b|\bbeer\b|\bken\b|\btiger\b|\bvai coc\b|\bcoc nua\b|\bmot coc\b/, drink: true, sip: 0.5, say: ['Cho thêm cốc bia nữa!', 'Em ơi bia!', 'Bia ra đây!', 'Thêm bia em ơi!'] },
      lac: { re: /lac rang|dau phong|dia lac|^lac!*$/, life: 120000, say: ['Cho đĩa lạc rang!', 'Lạc rang em ơi!'] },
      muc: { re: /muc nuong|muc kho|muc chien|con muc|^muc!*$/, life: 100000, say: ['Cho con mực nướng!', 'Mực nướng em ơi!'] },
      nem: { re: /\bnem\b/, life: 100000, say: ['Cho đĩa nem chua!', 'Nem chua rán em ơi!'] },
      changa: { re: /chan ga/, life: 100000, say: ['Cho đĩa chân gà!'] },
      dua: { re: /dua chuot|dua leo|dua xao|dua muoi|^dua!*$/, life: 100000, say: ['Cho đĩa dưa chuột!'] },
      oc: { re: /oc luoc|oc xao|dia oc|^oc!*$/, life: 100000, say: ['Cho đĩa ốc luộc!'] },
      lau: { re: /noi lau|goi lau|an lau|lau (thai|de|ga|bo|ca|hai san|nam)|^lau!*$/, shared: true, life: 150000, say: ['Cho nồi lẩu cả bàn!', 'Lẩu đi anh em!'] }
    },
    menuBoard: [
      ['bia', '🍺 vào bàn + 1 cốc'], ['dzô', '🥂 cả bàn cụng ly'], ['lạc · mực · nem', '🥜 gọi mồi'], ['chân gà · ốc', '🍗 mồi thêm'],
      ['lẩu', '🍲 lẩu cả bàn'], ['tính tiền', '💸 về nhà'], ['🎁 quà', '💰 bao cả quán', 'gift']
    ],
    ticker: '🚫 Đã uống rượu bia — không lái xe. Cảnh vui trên live thôi, ngoài đời uống có chừng mực nhé! 🍻',
    soldText: (n) => `🍺 Đã uống: ${n.toLocaleString('vi-VN')} cốc`,
    likeText: (n, goal, on) => (on ? '🍻 DZÔ 100% CẢ QUÁN — cảm ơn cả nhà thả tim!' : `❤️ ${n}/${goal} tim — đủ tim cả quán dzô 100%`),
    boardValue: (s) => `${s.beers} 🍺`,
    boardSort: (a, b) => b.beers - a.beers || b.points - a.points,
    staffTag: 'rgba(17,24,39,.92)',
    onCommand(api, p, n) {
      if (DZO_RE.test(n.replace(/[^a-z0-9% ]/g, '').replace(/\s+/g, ' ').trim())) {
        // chưa có bia thì gọi bia, bưng tới nơi là cụng luôn
        if (!p.items.some((x) => x.id === 'bia' && x.level > 0)) { p.cheerOnDeliver = true; api.order(p, 'bia', { silent: true }); api.say(p, 'Bia đâu, dzô nào!'); }
        else api.cheerTable(p);
        return true;
      }
      return false;
    },
    onFinish(api, p, id, bottomUp) {
      if (id !== 'bia') return;
      const sc = api.score(p);
      sc.beers += 1;
      p.drunk += 1;
      api.addSold(1);
      api.floater(bottomUp ? '100%! 🍺' : '+1 🍺', p.x, p.y - 240 * p.seat.s, { size: 26, color: '#fde047', dur: 1300, rise: 60 });
    },
    onGift(api, p, coins, ev) {
      const n = api.speakName(p.name);
      if (coins >= api.big()) {
        p.daica = true;
        api.banner(`${p.name.toUpperCase()} BAO CẢ QUÁN!`, '🍻 MỖI BÀN MỘT KÉT — DZÔ 100%!', 5200);
        api.say(p, 'Hôm nay tôi bao! Dzô!', 5000);
        api.everyone((m) => setTimeout(() => api.order(m, 'bia', { free: true, silent: true }), Math.random() * 1200));
        api.confetti(200);
        api.sfx('cash');
        setTimeout(() => api.massCheer('DZÔ 100%!'), 2600);
        api.speak(`Đại gia ${n} tặng ${ev.giftName || 'quà'}, bao cả quán! Cả quán, một hai ba, dzô!`);
      } else if (coins >= 10) {
        api.order(p, 'lau', { free: true, say: 'Lẩu cho cả bàn!' });
        api.mates(p).forEach((m) => api.order(m, 'bia', { free: true, silent: true }));
        setTimeout(() => api.cheerTable(p, { force: true, text: 'DZÔ CẢ BÀN!' }), 2400);
        api.speak(`Cảm ơn ${n} đã tặng ${ev.giftName || 'quà'}! Lẩu nóng cho cả bàn, dzô!`);
      } else {
        api.order(p, pick(['muc', 'nem', 'changa', 'lac']), { free: true, say: 'Cho đĩa mồi ngon!' });
        api.order(p, 'bia', { free: true, silent: true });
        setTimeout(() => api.cheerTable(p, { force: true }), 2200);
        api.speak(`Cảm ơn ${n} đã tặng ${ev.giftName || 'quà'}! Dzô!`);
      }
    },
    onLikeGoal(api) {
      api.banner('DZÔ 100% CẢ QUÁN!', 'Cảm ơn cả nhà thả tim 🍻', 5000);
      api.everyone((m) => { if (!m.items.some((x) => x.id === 'bia' && x.level > 0)) api.order(m, 'bia', { free: true, silent: true }); });
      api.confetti(140);
      setTimeout(() => api.massCheer('DZÔ!'), 2000);
      api.speak(`Cảm ơn cả nhà đã thả tim! Cả quán ${api.name()}, một hai ba, dzô!`, false);
    },
    onAppCommand(api, a) {
      if (a === 'cheerAll') { api.everyone((m) => { if (!m.items.some((x) => x.id === 'bia' && x.level > 0)) api.order(m, 'bia', { free: true, silent: true }); }); setTimeout(() => api.massCheer('DZÔ!'), 1800); }
    },
    botTarget: 8,
    botMax: 6,
    bots: {
      names: ['Anh Tuấn công trình', 'Chú Ba xe ôm', 'Hùng béo', 'Thắng râu', 'Anh Dũng IT', 'Chị Mai kế toán', 'Long cận', 'Bác Tư hàng xóm'],
      act(api, b) {
        const r = Math.random();
        const hasBeer = b.items.some((x) => x.id === 'bia' && x.level > 0);
        if (!hasBeer && r < 0.55) api.order(b, 'bia', { free: true });
        else if (r < 0.7 && hasBeer) api.cheerTable(b);
        else if (r < 0.8) api.order(b, pick(['lac', 'muc', 'nem', 'changa', 'dua']), { free: true });
        else api.say(b, pick(['Hôm nay anh mời!', 'Uống đi, chưa say đâu!', 'Một hai ba dzô!', 'Mồi ngon thật!', 'Ai về trước là thua!', 'Kể chuyện đi ông!', 'Em ơi thêm đá!']));
      }
    },
    lines: {
      hello: ['Chào anh em!', 'Cho ngồi chung với!', 'Có bàn trống không?', 'Hôm nay không say không về!'],
      greet: (list, name) => `${name} chào ${list}! Vào bàn làm vài cốc nào, gõ bia để gọi nhé!`,
      share: (name) => `${name} đang đông vui! Cả nhà thả tim, chia sẻ live, gõ bia để vào bàn, gõ dzô để cụng ly nhé!`
    },

    drawGround(g, t, tables) {
      const y0 = 930;
      const gr = g.createLinearGradient(0, y0 - 60, 0, H);
      gr.addColorStop(0, 'rgba(30,22,18,0)'); gr.addColorStop(0.07, '#2a201b'); gr.addColorStop(1, '#120d0b');
      g.fillStyle = gr; g.fillRect(0, y0 - 60, W, H - y0 + 60);
      // vạch gạch vỉa hè mờ
      g.strokeStyle = 'rgba(255,220,180,.05)'; g.lineWidth = 2;
      for (let y = y0 + 20, h = 26; y < H; y += h, h *= 1.06) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      // vũng đèn vàng dưới mỗi bàn
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const tb of tables) {
        const fl = 0.9 + Math.sin(t / 400 + tb.i) * 0.04;
        const rg = g.createRadialGradient(tb.x, tb.y - 40, 10, tb.x, tb.y - 40, 300 * tb.s);
        rg.addColorStop(0, `rgba(255,170,80,${0.26 * fl})`); rg.addColorStop(1, 'rgba(255,150,60,0)');
        g.fillStyle = rg; g.fillRect(tb.x - 320, tb.y - 360, 640, 640);
      }
      g.restore();
    },
    drawBackdrop(g, t) {
      // biển QUÁN NHẬU phát sáng
      const x = 540, y = 600;
      const fl = Math.random() < 0.015 ? 0.55 : 1;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const rg = g.createRadialGradient(x, y, 30, x, y, 330);
      rg.addColorStop(0, `rgba(255,190,90,${0.35 * fl})`); rg.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = rg; g.fillRect(x - 340, y - 340, 680, 680);
      g.restore();
      // rộng 360 (x 360–720): chừa chỗ cho bảng lệnh / bảng vàng hai bên trong lề an toàn 110px
      g.fillStyle = '#3b0d07'; rr(g, x - 180, y - 62, 360, 124, 14); g.fill();
      g.strokeStyle = `rgba(250,204,21,${fl})`; g.lineWidth = 6; g.stroke();
      g.fillStyle = `rgba(254,240,138,${fl})`;
      g.font = `900 66px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = 'rgba(251,191,36,.9)'; g.shadowBlur = 18 * fl;
      g.fillText('BIA HƠI', x, y - 10);
      g.shadowBlur = 0;
      g.fillStyle = '#fed7aa'; g.font = `800 21px ${FONT}`;
      g.fillText('MỒI NGON · LẨU NÓNG · NƯỚNG', x, y + 40);
      // dây đèn bóng tròn chăng ngang
      const strands = [[[-20, 640], [1100, 610], 70], [[-20, 760], [1100, 790], 60]];
      strands.forEach(([a, b, sag], si) => {
        g.strokeStyle = 'rgba(20,14,10,.9)'; g.lineWidth = 3;
        const pt = (k) => ({ x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k) + Math.sin(k * Math.PI) * sag + Math.sin(t / 1600 + si) * 3 });
        g.beginPath(); for (let k = 0; k <= 1.0001; k += 0.02) { const p = pt(k); k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); } g.stroke();
        for (let i = 1; i < 18; i++) {
          const p = pt(i / 18);
          const on = 0.75 + 0.25 * Math.sin(t / 300 + i * 1.7 + si);
          g.save(); g.globalCompositeOperation = 'lighter';
          const bg = g.createRadialGradient(p.x, p.y + 10, 1, p.x, p.y + 10, 46);
          bg.addColorStop(0, `rgba(255,200,110,${0.55 * on})`); bg.addColorStop(1, 'rgba(255,160,60,0)');
          g.fillStyle = bg; g.fillRect(p.x - 46, p.y - 36, 92, 92);
          g.restore();
          g.fillStyle = `rgba(255,236,170,${0.85 + 0.15 * on})`;
          g.beginPath(); g.ellipse(p.x, p.y + 10, 7, 9, 0, 0, 6.283); g.fill();
        }
      });
    }
  };

  window.QuanArt = { paintChibi, makeLook, drawItem }; // dùng cho trang xem thử nhân vật
  window.TraDaScene = createScene(TRADA);
  window.NhauScene = createScene(NHAU);
})();
