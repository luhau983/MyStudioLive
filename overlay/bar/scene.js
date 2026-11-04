/*
 * LIVE BAR — 3D club scene (three.js) for a 1080×1920 portrait TikTok LIVE.
 * Ported from the Unity project of tiktok-live-bar: LED dance floor, DJ booth, LED wall,
 * moving-head beams, lasers on the drop, disco ball, cold-spark fountains, fireworks,
 * a crowd of billboard characters (viewers) with avatar, name, title, crown and aura.
 * Characters are drawn in code (no third-party sprite sheets).
 */
import * as THREE from '/three.module.js';
import { CROWD_COLS, CROWD_ROWS, VARIANT_COLORS } from './rules.mjs';

const W = 1080;
const H = 1920;
const FLOOR_W = 9.6;
const FLOOR_D = 8.4;
const FRONT_Z = 3.5;
const BACK_Z = -3.3;
const CHAR_H = 1.3; // world height of a character at scale 1
const RANK_COLORS = ['#facc15', '#cbd5e1', '#fb923c'];
const FONT = '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// ---------------------------------------------------------------- textures drawn in code
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const SKINS = ['#f1c7a5', '#e8b48f', '#d79f7a', '#c68863', '#a86b47', '#f6d5bc'];
const HAIRS = ['#1a1412', '#2b1d16', '#5a3b24', '#8a5a33', '#d8b26e', '#6b2e2e', '#7c3aed', '#ec4899', '#22d3ee', '#e5e7eb'];
const TOPS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f8fafc', '#111827', '#0ea5e9'];
const PANTS = ['#1e3a8a', '#111827', '#334155', '#3f3f46', '#57534e', '#e5e7eb', '#7c2d12'];
const HAIR_STYLES = ['short', 'long', 'bun', 'spiky', 'cap', 'afro', 'buzz', 'pony'];
const LOOK_COUNT = 28;

function makeLook(i) {
  return {
    skin: SKINS[i % SKINS.length], hair: HAIRS[(i * 7) % HAIRS.length], style: HAIR_STYLES[(i * 5) % HAIR_STYLES.length],
    top: TOPS[(i * 3) % TOPS.length], pants: PANTS[(i * 11) % PANTS.length], glasses: i % 4 === 1, stripe: i % 3 === 0
  };
}

// Chibi dancer, frame 0 = arms out, frame 1 = arms up (swapped on the beat)
function drawDancer(g, w, h, L, up) {
  const cx = w / 2;
  g.lineJoin = 'round'; g.lineCap = 'round';
  const outline = 'rgba(10,6,25,.9)';
  // legs
  g.strokeStyle = outline; g.lineWidth = 22;
  g.beginPath(); g.moveTo(cx - 14, h * 0.7); g.lineTo(cx - 18 - (up ? 6 : 0), h * 0.92); g.moveTo(cx + 14, h * 0.7); g.lineTo(cx + 18 + (up ? 6 : 0), h * 0.92); g.stroke();
  g.strokeStyle = L.pants; g.lineWidth = 16;
  g.beginPath(); g.moveTo(cx - 14, h * 0.7); g.lineTo(cx - 18 - (up ? 6 : 0), h * 0.92); g.moveTo(cx + 14, h * 0.7); g.lineTo(cx + 18 + (up ? 6 : 0), h * 0.92); g.stroke();
  g.fillStyle = '#f8fafc';
  g.beginPath(); g.ellipse(cx - 20 - (up ? 6 : 0), h * 0.94, 14, 7, 0, 0, 7); g.ellipse(cx + 20 + (up ? 6 : 0), h * 0.94, 14, 7, 0, 0, 7); g.fill();
  // arms
  const sh = h * 0.5;
  const arm = (dir) => {
    const hx = cx + dir * (up ? 34 : 52);
    const hy = up ? h * 0.3 : h * 0.62;
    g.strokeStyle = outline; g.lineWidth = 18; g.beginPath(); g.moveTo(cx + dir * 24, sh); g.lineTo(hx, hy); g.stroke();
    g.strokeStyle = L.top; g.lineWidth = 12; g.beginPath(); g.moveTo(cx + dir * 24, sh); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = L.skin; g.beginPath(); g.arc(hx, hy, 8, 0, 7); g.fill();
  };
  arm(-1); arm(1);
  // torso
  g.fillStyle = outline; g.beginPath(); g.roundRect(cx - 31, h * 0.45, 62, h * 0.29, 18); g.fill();
  g.fillStyle = L.top; g.beginPath(); g.roundRect(cx - 27, h * 0.46, 54, h * 0.27, 15); g.fill();
  if (L.stripe) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(cx - 27, h * 0.55, 54, 7); }
  // head
  const hy = h * 0.29;
  g.fillStyle = outline; g.beginPath(); g.arc(cx, hy, 37, 0, 7); g.fill();
  g.fillStyle = L.skin; g.beginPath(); g.arc(cx, hy, 33, 0, 7); g.fill();
  g.fillStyle = L.hair;
  switch (L.style) {
    case 'long': g.beginPath(); g.arc(cx, hy - 4, 35, Math.PI * 0.95, Math.PI * 2.05); g.fill(); g.fillRect(cx - 35, hy - 6, 12, 42); g.fillRect(cx + 23, hy - 6, 12, 42); break;
    case 'bun': g.beginPath(); g.arc(cx, hy - 6, 34, Math.PI, 0); g.fill(); g.beginPath(); g.arc(cx, hy - 42, 14, 0, 7); g.fill(); break;
    case 'spiky': g.beginPath(); for (let i = 0; i <= 6; i++) { const a = Math.PI + (i / 6) * Math.PI; g.lineTo(cx + Math.cos(a) * (i % 2 ? 46 : 32), hy - 6 + Math.sin(a) * (i % 2 ? 46 : 32)); } g.fill(); break;
    case 'cap': g.beginPath(); g.arc(cx, hy - 6, 35, Math.PI, 0); g.fill(); g.fillRect(cx - 4, hy - 12, 50, 9); break;
    case 'afro': g.beginPath(); g.arc(cx, hy - 14, 44, Math.PI * 0.9, Math.PI * 2.1); g.fill(); break;
    case 'buzz': g.beginPath(); g.arc(cx, hy - 2, 34, Math.PI * 1.05, Math.PI * 1.95); g.fill(); break;
    case 'pony': g.beginPath(); g.arc(cx, hy - 5, 35, Math.PI, 0); g.fill(); g.beginPath(); g.ellipse(cx + 38, hy + 6, 9, 22, -0.3, 0, 7); g.fill(); break;
    default: g.beginPath(); g.arc(cx, hy - 5, 35, Math.PI * 1.02, Math.PI * 1.98); g.fill();
  }
  // face
  g.fillStyle = '#111';
  g.beginPath(); g.ellipse(cx - 12, hy + 4, 4, 6, 0, 0, 7); g.ellipse(cx + 12, hy + 4, 4, 6, 0, 0, 7); g.fill();
  if (L.glasses) { g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(cx - 21, hy - 3, 17, 13); g.strokeRect(cx + 4, hy - 3, 17, 13); g.beginPath(); g.moveTo(cx - 4, hy + 2); g.lineTo(cx + 4, hy + 2); g.stroke(); }
  g.strokeStyle = '#7f1d1d'; g.lineWidth = 3;
  g.beginPath(); if (up) g.arc(cx, hy + 14, 8, 0.1, Math.PI - 0.1); else g.arc(cx, hy + 12, 7, 0.2, Math.PI - 0.2); g.stroke();
  g.fillStyle = 'rgba(244,114,182,.45)'; g.beginPath(); g.arc(cx - 20, hy + 14, 5, 0, 7); g.arc(cx + 20, hy + 14, 5, 0, 7); g.fill();
}

function drawDJ(g, w, h, up) {
  drawDancer(g, w, h, { skin: '#e8b48f', hair: '#111827', style: 'cap', top: '#111827', pants: '#111827', glasses: true, stripe: true }, up);
  // headphones
  g.strokeStyle = '#22d3ee'; g.lineWidth = 7;
  g.beginPath(); g.arc(w / 2, h * 0.29, 40, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  g.fillStyle = '#22d3ee'; g.beginPath(); g.roundRect(w / 2 - 46, h * 0.27, 13, 24, 5); g.roundRect(w / 2 + 33, h * 0.27, 13, 24, 5); g.fill();
}

function glowTex(color = '#ffffff', soft = 0.5) {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, color); gr.addColorStop(soft, color.length === 7 ? color + '55' : color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
}

function labelTex(text, { bg = 'rgba(8,6,24,.78)', fg = '#fff', border = 'rgba(255,255,255,.25)', size = 34, bold = 800 } = {}) {
  const g0 = document.createElement('canvas').getContext('2d');
  g0.font = `${bold} ${size}px ${FONT}`;
  const tw = Math.min(560, Math.ceil(g0.measureText(text).width));
  const w = tw + size * 1.2;
  const h = Math.round(size * 1.6);
  const tex = canvasTex(w, h, (g) => {
    g.font = `${bold} ${size}px ${FONT}`;
    g.fillStyle = bg; g.strokeStyle = border; g.lineWidth = 3;
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, h / 2 - 2); g.fill(); g.stroke();
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 1, w - size);
  });
  tex.userData = { aspect: w / h };
  return tex;
}

function crownTex() {
  return canvasTex(128, 96, (g) => {
    g.fillStyle = '#facc15'; g.strokeStyle = '#78350f'; g.lineWidth = 6; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(14, 82); g.lineTo(8, 22); g.lineTo(40, 50); g.lineTo(64, 10); g.lineTo(88, 50); g.lineTo(120, 22); g.lineTo(114, 82); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ef4444'; g.beginPath(); g.arc(64, 62, 9, 0, 7); g.fill();
  });
}

// ---------------------------------------------------------------- avatars (proxied same-origin so WebGL can use them)
const avatarCache = new Map();
function avatarTexture(url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) return Promise.resolve(null);
  if (avatarCache.has(url)) return avatarCache.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve(canvasTex(128, 128, (g) => {
        g.beginPath(); g.arc(64, 64, 60, 0, 7); g.closePath(); g.save(); g.clip();
        g.drawImage(img, 4, 4, 120, 120); g.restore();
        g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.stroke();
      }));
    };
    img.onerror = () => resolve(null);
    img.src = '/bar/avatar?u=' + encodeURIComponent(url);
  });
  avatarCache.set(url, p);
  if (avatarCache.size > 600) avatarCache.delete(avatarCache.keys().next().value);
  return p;
}

// ---------------------------------------------------------------- character pack (GIF / PNG / WEBP from a folder the user picks)
// Animated GIFs are decoded frame by frame with WebCodecs ImageDecoder (frames come out fully composited);
// frames are downscaled and capped so a big pack stays cheap on the GPU.
const PACK_MAX_H = 160;
const PACK_MAX_FRAMES = 24;
// Many dance GIFs have a solid (often white) background. When all four corners are opaque and the
// same colour, flood-fill that colour from the edges to transparent; already transparent GIFs are untouched.
function keyBackground(g, w, h) {
  const img = g.getImageData(0, 0, w, h); const d = img.data;
  const at = (x, y) => (y * w + x) * 4;
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  if (corners.some((i) => d[i + 3] < 250)) return;
  const [r0, g0, b0] = [d[corners[0]], d[corners[0] + 1], d[corners[0] + 2]];
  const near = (i, tol) => Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) <= tol;
  if (!corners.every((i) => near(i, 60))) return;
  const seen = new Uint8Array(w * h); const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    if (!near(p * 4, 90)) continue;
    d[p * 4 + 3] = 0;
    const x = p % w; const y = (p / w) | 0;
    if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w); if (y < h - 1) stack.push(p + w);
  }
  g.putImageData(img, 0, 0);
}
async function decodeCharacter(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0];
    const buf = await res.arrayBuffer();
    const toTex = (src, w, h) => {
      const s = Math.min(1, PACK_MAX_H / h);
      return canvasTex(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), (g, cw, ch) => { g.drawImage(src, 0, 0, cw, ch); keyBackground(g, cw, ch); });
    };
    if (type === 'image/gif' && 'ImageDecoder' in window) {
      const dec = new ImageDecoder({ data: buf, type });
      await dec.tracks.ready;
      const n = dec.tracks.selectedTrack.frameCount || 1;
      const step = Math.max(1, Math.ceil(n / PACK_MAX_FRAMES));
      const frames = []; let total = 0; let w = 1; let h = 1;
      for (let i = 0; i < n; i += step) {
        const { image } = await dec.decode({ frameIndex: i });
        w = image.displayWidth; h = image.displayHeight;
        total += ((image.duration || 100000) / 1000) * step;
        frames.push(toTex(image, w, h));
        image.close();
      }
      dec.close();
      return { frames, frameMs: Math.max(30, total / frames.length), aspect: w / h };
    }
    const bmp = await createImageBitmap(new Blob([buf], { type }));
    const tex = toTex(bmp, bmp.width, bmp.height);
    const aspect = bmp.width / bmp.height;
    bmp.close();
    return { frames: [tex], frameMs: 1000, aspect };
  } catch { return null; }
}

// ---------------------------------------------------------------- scene
export function createBarScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const BG = new THREE.Color('#07031a');
  scene.background = BG;
  scene.fog = new THREE.FogExp2('#0c0526', 0.045);
  const camera = new THREE.PerspectiveCamera(56, W / H, 0.1, 100);
  const CAM_HOME = new THREE.Vector3(0, 9.6, 13.4);
  const LOOK_HOME = new THREE.Vector3(0, 0.9, -2.4);
  camera.position.copy(CAM_HOME);
  const look = LOOK_HOME.clone();
  camera.lookAt(look);

  const env = new THREE.Group(); // everything hidden in chroma mode
  scene.add(env);
  const additive = (color, opacity = 0.2) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });

  // lights
  env.add(new THREE.HemisphereLight('#6d5bd0', '#120626', 1.1));
  const key = new THREE.DirectionalLight('#ffffff', 1.2); key.position.set(2, 10, 8); env.add(key);
  const pulseLights = ['#ec4899', '#22d3ee', '#a855f7', '#f59e0b'].map((c, i) => {
    const l = new THREE.PointLight(c, 8, 12, 1.6);
    l.position.set([-4, 4, -4, 4][i], 3.2, [-3, -3, 2.5, 2.5][i]);
    env.add(l);
    return l;
  });

  // LED dance floor: one instanced tile per cell, colors driven by the beat
  const TILE = 0.6;
  const tx = Math.round(FLOOR_W / TILE);
  const tz = Math.round(FLOOR_D / TILE);
  const tileGeo = new THREE.BoxGeometry(TILE * 0.94, 0.06, TILE * 0.94);
  const tileMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const tiles = new THREE.InstancedMesh(tileGeo, tileMat, tx * tz);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < tx; i++) for (let j = 0; j < tz; j++) {
    m4.makeTranslation((i - (tx - 1) / 2) * TILE, 0, (j - (tz - 1) / 2) * TILE + 0.1);
    tiles.setMatrixAt(i * tz + j, m4);
    tiles.setColorAt(i * tz + j, new THREE.Color('#1e1b4b'));
  }
  env.add(tiles);
  const base = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: '#0d0a1c', roughness: 0.35, metalness: 0.6 }));
  base.rotation.x = -Math.PI / 2; base.position.y = -0.04; env.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 4), additive('#22d3ee', 0.9));
  rim.rotation.set(Math.PI / 2, 0, Math.PI / 4); rim.scale.set(FLOOR_W * 0.71, FLOOR_D * 0.71, 1); rim.position.y = 0.05; env.add(rim);

  // back wall + LED screen
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.MeshStandardMaterial({ color: '#120a2a', roughness: 0.8 }));
  wall.position.set(0, 6, -8.5); env.add(wall);
  const ledCanvas = document.createElement('canvas'); ledCanvas.width = 1024; ledCanvas.height = 512;
  const ledG = ledCanvas.getContext('2d');
  const ledTex = new THREE.CanvasTexture(ledCanvas); ledTex.colorSpace = THREE.SRGBColorSpace;
  const led = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.1), new THREE.MeshBasicMaterial({ map: ledTex, fog: false }));
  led.position.set(0, 4.6, -8.4); env.add(led);
  const ledFrame = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 3.4), additive('#a855f7', 0.5));
  ledFrame.position.set(0, 4.6, -8.45); env.add(ledFrame);

  // DJ booth + DJ
  const booth = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 1.1), new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.4, metalness: 0.7 }));
  booth.position.set(0, 0.55, -5.4); env.add(booth);
  const boothStrip = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.16), new THREE.MeshBasicMaterial({ color: '#22d3ee', fog: false }));
  boothStrip.position.set(0, 0.85, -4.84); env.add(boothStrip);
  const boothLogo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshBasicMaterial({ transparent: true, fog: false }));
  boothLogo.position.set(0, 0.42, -4.84); env.add(boothLogo);
  const djTex = [canvasTex(192, 256, (g, w, h) => drawDJ(g, w, h, false)), canvasTex(192, 256, (g, w, h) => drawDJ(g, w, h, true))];
  const dj = new THREE.Sprite(new THREE.SpriteMaterial({ map: djTex[0] }));
  dj.scale.set(1.35, 1.8, 1); dj.position.set(0, 1.55, -5.95); env.add(dj);
  // speaker stacks
  for (const x of [-4.4, 4.4]) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.6, 1), new THREE.MeshStandardMaterial({ color: '#0b0b12', roughness: 0.6 }));
    sp.position.set(x, 1.3, -5.6); env.add(sp);
    for (const y of [0.7, 1.9]) {
      const cone = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), new THREE.MeshStandardMaterial({ color: '#1f2937', emissive: '#4c1d95', emissiveIntensity: 0.6 }));
      cone.position.set(x, y, -5.09); cone.userData.speaker = true; env.add(cone);
    }
  }

  // top-3 podium in front of the booth
  const PODIUM = [{ x: 0, h: 0.5 }, { x: -1.35, h: 0.34 }, { x: 1.35, h: 0.22 }].map((p, i) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, p.h, 28), new THREE.MeshStandardMaterial({ color: '#1f1147', emissive: RANK_COLORS[i], emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.3 }));
    m.position.set(p.x, p.h / 2, -4.25); env.add(m);
    return { x: p.x, y: p.h, z: -4.25 };
  });

  // truss + moving-head beams
  const truss = new THREE.Mesh(new THREE.BoxGeometry(11, 0.18, 0.18), new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.8, roughness: 0.3 }));
  truss.position.set(0, 7, -2.6); env.add(truss);
  const BEAM_COLORS = ['#ec4899', '#22d3ee', '#a855f7', '#facc15', '#22c55e', '#f97316'];
  const beams = BEAM_COLORS.map((c, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(-4.5 + i * 1.8, 6.9, -2.6);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.15, 8, 24, 1, true), additive(c, 0.11));
    cone.position.y = -4; pivot.add(cone);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: c, fog: false }));
    pivot.add(head);
    env.add(pivot);
    return { pivot, cone, head, phase: i * 1.1 };
  });

  // lasers fanning from the back wall (only on the drop)
  const lasers = [];
  for (let i = 0; i < 10; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 22, 6, 1, true), additive(i % 2 ? '#22c55e' : '#ef4444', 0.75));
    l.geometry.translate(0, 11, 0);
    const p = new THREE.Group(); p.position.set(i < 5 ? -3.8 : 3.8, 7.6, -8.2); p.add(l); env.add(p);
    lasers.push({ p, l, phase: i * 0.6 });
  }

  // disco ball
  const disco = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 2), new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 1, roughness: 0.15, flatShading: true, emissive: '#312e81', emissiveIntensity: 0.4 }));
  disco.position.set(0, 8.6, 3.6); env.add(disco);
  const discoGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#ffffff', 0.25), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35, fog: false }));
  discoGlow.scale.set(3, 3, 1); disco.add(discoGlow);

  // strobe (full-screen flash on the drop)
  const strobe = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthTest: false, fog: false }));
  strobe.position.z = -0.5; strobe.renderOrder = 999; camera.add(strobe); scene.add(camera);

  // ---------------------------------------------------------------- particles (fireworks + cold sparks)
  const MAXP = 5000;
  const pPos = new Float32Array(MAXP * 3);
  const pCol = new Float32Array(MAXP * 3);
  const pVel = new Float32Array(MAXP * 3);
  const pLife = new Float32Array(MAXP);
  const pMax = new Float32Array(MAXP);
  const pBase = new Float32Array(MAXP * 3);
  const pGrav = new Float32Array(MAXP);
  let pNext = 0;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.16, map: glowTex('#ffffff', 0.3), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  points.frustumCulled = false;
  scene.add(points);
  for (let i = 0; i < MAXP; i++) pPos[i * 3 + 1] = -100;
  const tmpC = new THREE.Color();
  function emit(x, y, z, vx, vy, vz, life, color, grav = 3) {
    const i = pNext; pNext = (pNext + 1) % MAXP;
    pPos.set([x, y, z], i * 3); pVel.set([vx, vy, vz], i * 3);
    tmpC.set(color); pBase.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
    pLife[i] = life; pMax[i] = life; pGrav[i] = grav;
  }
  function burst(x, y, z, color) {
    const n = 110;
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1; const a = Math.random() * Math.PI * 2; const s = rnd(2.6, 4.2);
      const r = Math.sqrt(1 - u * u);
      emit(x, y, z, r * Math.cos(a) * s, u * s, r * Math.sin(a) * s, rnd(0.9, 1.5), Math.random() < 0.2 ? '#ffffff' : color, 2.2);
    }
  }
  const fountains = [];
  function coldSparks(seconds = 5) {
    const xs = [-3.9, -2.5, -1.15, 1.15, 2.5, 3.9];
    xs.forEach((x, i) => fountains.push({ x, z: -3.75, until: clock + seconds - Math.abs(i - 2.5) * 0.25, start: clock + Math.abs(i - 2.5) * 0.3 }));
  }
  const fwQueue = [];
  function fireworks(waves = 4) {
    const n = clamp(waves, 2, 8);
    for (let w = 0; w < n; w++) fwQueue.push(clock + w * 0.72);
    coldSparks(5.4);
    sfxHook && sfxHook('fireworks');
  }

  // ---------------------------------------------------------------- crowd
  let charPack = []; // [{ frames: CanvasTexture[], frameMs, aspect }] from the user's character folder
  let charKey = '';
  const lookTex = [];
  for (let i = 0; i < LOOK_COUNT; i++) {
    const L = makeLook(i);
    lookTex.push([canvasTex(128, 176, (g, w, h) => drawDancer(g, w, h, L, false)), canvasTex(128, 176, (g, w, h) => drawDancer(g, w, h, L, true))]);
  }
  const auraTex = Object.fromEntries(Object.entries(VARIANT_COLORS).map(([k, c]) => [k, glowTex(c, 0.35)]));
  const ringTex = canvasTex(128, 128, (g) => { g.strokeStyle = '#fff'; g.lineWidth = 10; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke(); });
  const crown = crownTex();
  const crowd = new THREE.Group();
  scene.add(crowd);
  const actors = new Map();

  class Actor {
    constructor(user, opts) {
      this.id = user.key;
      this.npc = !!opts.npc;
      this.look = Math.floor(Math.random() * LOOK_COUNT);
      this.charIdx = Math.floor(Math.random() * 1e6);
      this.root = new THREE.Group();
      this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: auraTex.aura, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      this.aura.scale.set(1.5, 1.9, 1); this.aura.position.y = CHAR_H * 0.5;
      this.body = new THREE.Sprite(new THREE.SpriteMaterial({ map: lookTex[this.look][0], transparent: true, alphaTest: 0.05 }));
      this.body.center.set(0.5, 0.04);
      this.body.scale.set(CHAR_H * 128 / 176, CHAR_H, 1);
      this.ring = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.06;
      this.avatar = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0 }));
      this.avatar.scale.set(0.42, 0.42, 1);
      this.avatar.position.y = CHAR_H * 0.71;
      this.name = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      this.title = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
      this.crown = new THREE.Sprite(new THREE.SpriteMaterial({ map: crown, transparent: true, opacity: 0 }));
      this.crown.scale.set(0.42, 0.32, 1);
      this.spot = null;
      this.root.add(this.ring, this.aura, this.body, this.avatar, this.name, this.title, this.crown);
      crowd.add(this.root);
      this.slot = new THREE.Vector3(); this.scale = 1;
      this.action = 'idle'; this.actionUntil = 0; this.actionStart = 0;
      this.growUntil = 0; this.alpha = 1; this.alphaTarget = 1;
      this.rank = 0; this.variant = ''; this.titleUntil = 0;
      this.phase = Math.random() * 10;
      this.walkFrom = new THREE.Vector3();
      this.setUser(user);
      this.root.position.set(rnd(-1, 1), 0, FRONT_Z + 2.5); // walks in from the front
      this.entering = true;
    }
    setUser(user) {
      const name = String(user.nickname || 'Ẩn danh').slice(0, 22);
      if (name !== this.nameText) {
        this.nameText = name;
        this.name.material.map?.dispose();
        const t = labelTex(name, { size: 30, bg: this.npc ? 'rgba(8,6,24,.55)' : 'rgba(8,6,24,.82)' });
        this.name.material.map = t; this.name.material.needsUpdate = true;
        this.name.scale.set(0.2 * t.userData.aspect, 0.2, 1);
      }
      if (user.avatar && user.avatar !== this.avatarUrl) {
        this.avatarUrl = user.avatar;
        avatarTexture(user.avatar).then((t) => {
          if (!t || this.dead) return;
          this.avatar.material.map = t; this.avatar.material.needsUpdate = true; this.hasAvatar = true;
        });
      }
    }
    setTitle(text, variant, seconds) {
      this.title.material.map?.dispose();
      const c = VARIANT_COLORS[variant] || '#f472b6';
      const t = labelTex(text, { size: 30, bg: 'rgba(20,6,30,.9)', fg: c, border: c });
      this.title.material.map = t; this.title.material.needsUpdate = true;
      this.title.scale.set(0.22 * t.userData.aspect, 0.22, 1);
      this.titleUntil = clock + seconds;
    }
    setVariant(v) {
      this.variant = v || '';
      if (this.variant && auraTex[this.variant]) { this.aura.material.map = auraTex[this.variant]; this.aura.material.needsUpdate = true; }
    }
    change() {
      this.look = (this.look + 1 + Math.floor(Math.random() * (LOOK_COUNT - 1))) % LOOK_COUNT;
      this.charIdx += 1 + Math.floor(Math.random() * Math.max(1, charPack.length - 1));
      this.flash = clock + 0.5;
    }
    act(action, seconds) {
      if (action === 'change') { this.change(); action = 'celebrate'; }
      if (action === 'grow') { this.growUntil = clock + seconds; action = 'celebrate'; }
      if (action === 'walk') this.walkFrom.copy(this.slot);
      this.action = action; this.actionStart = clock; this.actionUntil = clock + seconds;
    }
    dispose() {
      this.dead = true;
      crowd.remove(this.root);
      [this.name, this.title].forEach((s) => s.material.map?.dispose());
      [this.name, this.title, this.avatar, this.body, this.aura, this.crown].forEach((s) => s.material.dispose());
      this.ring.geometry.dispose(); this.ring.material.dispose();
    }
    update(dt) {
      const s = this.scale * (this.rank ? 1.25 : 1) * (clock < this.growUntil ? 2.4 : 1);
      this.curScale = lerp(this.curScale || s, s, Math.min(1, dt * 5));
      const k = this.curScale;
      let target = this.rank ? new THREE.Vector3(PODIUM[this.rank - 1].x, PODIUM[this.rank - 1].y, PODIUM[this.rank - 1].z) : this.slot;
      let y = 0; let frame = 0; let rot = 0; let sq = 1;
      const act = clock < this.actionUntil ? this.action : 'idle';
      const prog = clamp((clock - this.actionStart) / Math.max(0.01, this.actionUntil - this.actionStart), 0, 1);
      const beatPhase = beatT % 1;
      switch (act) {
        case 'dance':
          y = Math.abs(Math.sin(beatT * Math.PI)) * 0.22 * k; frame = Math.floor(beatT) % 2; rot = Math.sin(beatT * Math.PI) * 0.18; sq = 1 + (beatPhase < 0.15 ? -0.08 : 0.04);
          break;
        case 'jump':
          y = Math.sin(prog * Math.PI) * 1.1 * k; frame = 1; sq = prog < 0.1 || prog > 0.9 ? 0.85 : 1.06;
          break;
        case 'celebrate':
          y = Math.abs(Math.sin(clock * 9)) * 0.18 * k; frame = 1; sq = 1 + Math.sin(clock * 17) * 0.06;
          break;
        case 'walk': {
          const a = prog * Math.PI * 2;
          target = new THREE.Vector3(Math.sin(a) * 3.2, 0, lerp(0.4, 0.4, prog) + Math.cos(a) * 2.4 - 0.4);
          y = Math.abs(Math.sin(clock * 10)) * 0.08; frame = Math.floor(clock * 4) % 2; rot = Math.sin(clock * 10) * 0.08;
          break;
        }
        default:
          // idle: everyone nods to the beat, NPCs a bit more lively
          y = Math.abs(Math.sin((beatT + this.phase) * Math.PI)) * (this.npc ? 0.06 : 0.04) * k;
          frame = (Math.floor(beatT / 2 + this.phase) % 4 === 0) ? 1 : 0; rot = Math.sin((beatT + this.phase) * Math.PI * 0.5) * 0.06;
      }
      const follow = act === 'walk' ? Math.min(1, dt * 6) : Math.min(1, dt * (this.entering ? 2.2 : 4));
      this.root.position.x = lerp(this.root.position.x, target.x, follow);
      this.root.position.z = lerp(this.root.position.z, target.z, follow);
      this.root.position.y = lerp(this.root.position.y, target.y || 0, Math.min(1, dt * 6));
      if (this.entering && this.root.position.distanceToSquared(target) < 0.01) this.entering = false;
      if (this.entering) { y = Math.abs(Math.sin(clock * 10)) * 0.08; frame = Math.floor(clock * 4) % 2; }
      // GIF character pack (like CharacterLibrary/GifPlayer of the original): the GIF itself is the dance
      const ch = charPack.length ? charPack[this.charIdx % charPack.length] : null;
      let aspect = 128 / 176;
      if (ch) {
        const n = ch.frames.length;
        this.body.material.map = ch.frames[n > 1 ? Math.floor((clock + this.phase) * 1000 / ch.frameMs) % n : 0];
        aspect = ch.aspect;
        rot *= 0.5;
      } else this.body.material.map = lookTex[this.look][frame];
      this.body.material.rotation = rot;
      this.body.position.y = y;
      this.body.scale.set(CHAR_H * aspect * k * (2 - sq), CHAR_H * k * sq, 1);
      // own character drawn in code: avatar sits on the face; GIF character: avatar badge above the head
      this.avatar.position.set(0, y + CHAR_H * k * (ch ? 1.12 : 0.97), 0);
      this.avatar.scale.set(0.36 * k, 0.36 * k, 1);
      this.avatar.visible = !!this.hasAvatar;
      const top = y + CHAR_H * k * (this.hasAvatar ? (ch ? 1.36 : 1.22) : 1.04);
      this.name.position.set(0, top, 0);
      this.name.visible = crowdSize <= 25 || !!this.rank || !!this.focused || this.entering || act !== 'idle' || clock < this.titleUntil;
      const titled = clock < this.titleUntil;
      this.title.position.set(0, top + 0.24, 0);
      this.title.material.opacity = lerp(this.title.material.opacity, titled ? this.alpha : 0, Math.min(1, dt * 6));
      this.crown.position.set(0, top + (titled ? 0.5 : 0.25), 0);
      this.crown.material.opacity = lerp(this.crown.material.opacity, this.rank === 1 ? this.alpha : 0, Math.min(1, dt * 6));
      this.crown.material.rotation = Math.sin(clock * 3) * 0.12;
      const auraOn = !!this.variant || clock < (this.flash || 0);
      this.aura.position.y = y + CHAR_H * k * 0.5;
      this.aura.scale.set(1.3 * k * (1 + Math.sin(clock * 6) * 0.06), 1.7 * k, 1);
      this.aura.material.opacity = lerp(this.aura.material.opacity, auraOn ? 0.75 * this.alpha : 0, Math.min(1, dt * 5));
      const ringColor = this.rank ? RANK_COLORS[this.rank - 1] : this.focused ? '#f472b6' : null;
      if (ringColor) this.ring.material.color.set(ringColor);
      this.ring.scale.setScalar(k * (1 + Math.sin(clock * 5) * 0.08));
      this.ring.material.opacity = lerp(this.ring.material.opacity, ringColor ? 0.9 * this.alpha : 0, Math.min(1, dt * 5));
      this.alpha = lerp(this.alpha, this.alphaTarget, Math.min(1, dt * 4));
      this.body.material.opacity = this.alpha;
      this.avatar.material.opacity = this.alpha;
      this.name.material.opacity = this.alpha;
    }
  }

  let crowdSize = 0;
  function reflow() {
    crowdSize = actors.size;
    const k = actors.size <= 30 ? 1 : actors.size <= 80 ? 0.86 : actors.size <= 140 ? 0.71 : actors.size <= 200 ? 0.58 : actors.size <= 280 ? 0.49 : 0.42;
    const xs = FLOOR_W * 0.9 / (CROWD_COLS - 1);
    const zs = (FRONT_Z - BACK_Z) / (CROWD_ROWS - 1);
    for (const a of actors.values()) {
      const row = Math.floor(a.slotIndex / CROWD_COLS);
      const col = a.slotIndex % CROWD_COLS;
      const stagger = row % 2 ? xs * 0.5 : 0;
      a.slot.set((col - (CROWD_COLS - 1) / 2) * xs + stagger - xs * 0.25, 0, FRONT_Z - row * zs);
      a.scale = k * lerp(1.06, 0.86, row / (CROWD_ROWS - 1));
    }
  }

  // ---------------------------------------------------------------- camera director
  let shot = null; // { pos, look, until }
  const welcomeQueue = [];
  function focusShot(actor, seconds, { close = false, wide = false, sky = false } = {}) {
    if (!actor) return;
    const p = actor.root.position;
    let pos; let lk;
    if (sky) { pos = new THREE.Vector3(p.x * 0.3, 5.2, p.z + 9.5); lk = new THREE.Vector3(0, 4.2, -3); }
    else if (wide) { pos = new THREE.Vector3(0, 7.6, 11.5); lk = new THREE.Vector3(0, 0.8, 0); }
    else {
      const d = close ? 2.8 : 4.2;
      pos = new THREE.Vector3(p.x * 0.85, p.y + (close ? 1.5 : 2.3), p.z + d);
      lk = new THREE.Vector3(p.x, p.y + 0.85 * (actor.curScale || 1), p.z);
    }
    shot = { actor, pos, look: lk, until: clock + clamp(seconds, 2, 15), close, wide, sky, orbit: close };
  }

  // ---------------------------------------------------------------- spotlights following gifted actors
  const spots = [];
  const coneGeo = new THREE.ConeGeometry(1, 1, 32, 1, true);
  coneGeo.translate(0, -0.5, 0);
  function spotlight(actor, seconds, strong) {
    if (!actor) return;
    const color = strong ? '#f472b6' : '#22d3ee';
    const cone = new THREE.Mesh(coneGeo, additive(color, strong ? 0.22 : 0.16));
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), additive(color, 0.45));
    pool.rotation.x = -Math.PI / 2;
    scene.add(cone, pool);
    spots.push({ actor, cone, pool, until: clock + clamp(seconds, 3, 12) });
  }

  // ---------------------------------------------------------------- LED wall drawing
  let wallTitle = 'LIVE BAR';
  let wallSub = 'GÕ "hey" ĐỂ VÀO SÀN';
  let energy = 0;
  const eq = Array.from({ length: 32 }, () => Math.random());
  // User media on the LED wall (image or looping muted video), cover-fitted to the 2:1 screen
  const screen = { src: '', tex: null, video: null };
  function coverFit(tex, w, h) {
    const a = w / h; const pa = 2;
    tex.repeat.set(a > pa ? pa / a : 1, a > pa ? 1 : a / pa);
    tex.offset.set((1 - tex.repeat.x) / 2, (1 - tex.repeat.y) / 2);
  }
  function setScreen(src, isVideo) {
    if (src === screen.src) return;
    if (screen.video) { screen.video.pause(); screen.video.removeAttribute('src'); screen.video.load(); }
    screen.tex?.dispose();
    Object.assign(screen, { src: src || '', tex: null, video: null });
    led.material.map = ledTex; led.material.needsUpdate = true;
    if (!src) return;
    if (isVideo) {
      const v = Object.assign(document.createElement('video'), { src, loop: true, muted: true, playsInline: true, crossOrigin: 'anonymous' });
      v.addEventListener('loadedmetadata', () => { if (screen.video === v && screen.tex) coverFit(screen.tex, v.videoWidth, v.videoHeight); });
      v.play().catch(() => {});
      const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace;
      Object.assign(screen, { tex: t, video: v });
      led.material.map = t; led.material.needsUpdate = true;
    } else {
      new THREE.TextureLoader().load(src, (t) => {
        if (screen.src !== src) { t.dispose(); return; }
        t.colorSpace = THREE.SRGBColorSpace; coverFit(t, t.image.width, t.image.height);
        screen.tex = t; led.material.map = t; led.material.needsUpdate = true;
      });
    }
  }

  function drawLed() {
    const g = ledG;
    const grad = g.createLinearGradient(0, 0, 1024, 512);
    const hue = (clock * 20) % 360;
    grad.addColorStop(0, `hsl(${hue},80%,14%)`); grad.addColorStop(1, `hsl(${(hue + 80) % 360},80%,10%)`);
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
    // equalizer
    for (let i = 0; i < eq.length; i++) {
      eq[i] = lerp(eq[i], Math.random() * (beatT % 1 < 0.2 ? 1 : 0.6), 0.35);
      const h = 40 + eq[i] * 200;
      g.fillStyle = `hsl(${(hue + i * 9) % 360},90%,60%)`;
      g.fillRect(16 + i * 31.5, 500 - h, 24, h);
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#f0abfc'; g.shadowBlur = 24;
    g.fillStyle = '#fff';
    g.font = `900 112px ${FONT}`;
    g.fillText(wallTitle, 512, 150, 980);
    g.shadowBlur = 0;
    g.font = `800 44px ${FONT}`;
    g.fillStyle = '#67e8f9';
    g.fillText(wallSub, 512, 250, 960);
    ledTex.needsUpdate = true;
  }
  function drawBoothLogo() {
    boothLogo.material.map?.dispose();
    boothLogo.material.map = canvasTex(520, 100, (g) => {
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 64px ${FONT}`;
      g.shadowColor = '#22d3ee'; g.shadowBlur = 18; g.fillStyle = '#e0f2fe'; g.fillText(wallTitle, 260, 52, 500);
    });
    boothLogo.material.needsUpdate = true;
  }
  drawBoothLogo();

  // ---------------------------------------------------------------- beat clock
  let bpm = 128;
  let beatT = 0; // beats since start (float)
  let dropUntil = -1;
  const isDrop = () => beatT < dropUntil;

  // ---------------------------------------------------------------- loop
  let clock = 0;
  let last = performance.now();
  let paused = false;
  let chroma = false;
  let raf = 0;
  let ledAcc = 0;
  let sfxHook = null;
  const tileColor = new THREE.Color();
  const FLOOR_PAL = ['#ec4899', '#a855f7', '#22d3ee', '#3b82f6', '#facc15', '#22c55e'];

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (paused) return;
    clock += dt;
    const prevBeat = Math.floor(beatT);
    beatT += dt * bpm / 60;
    const beat = Math.floor(beatT);
    const onBeat = beat !== prevBeat;
    // drop: 2 bars every 8 bars
    if (onBeat && beat % 32 === 0) dropUntil = beat + 8;
    const drop = isDrop();
    const bp = beatT % 1;
    const pump = Math.pow(1 - bp, 3);

    // floor
    const pattern = Math.floor(beat / 16) % 4;
    for (let i = 0; i < tx; i++) for (let j = 0; j < tz; j++) {
      let v;
      const cx = i - (tx - 1) / 2; const cz = j - (tz - 1) / 2;
      if (pattern === 0) v = ((i + j + beat) % 4 === 0) ? 1 : 0.15;
      else if (pattern === 1) v = Math.abs(Math.sin(Math.hypot(cx, cz) * 0.8 - beatT * Math.PI)) ** 4;
      else if (pattern === 2) v = ((i + beat) % 2 === (j % 2)) ? 0.9 : 0.1;
      else v = ((Math.abs(cx) + Math.abs(cz) + beat) % 5 < 1) ? 1 : 0.12;
      const c = FLOOR_PAL[(i + j + Math.floor(beat / 4)) % FLOOR_PAL.length];
      tileColor.set(c).multiplyScalar(0.18 + v * (0.55 + pump * 0.5) * (drop ? 1.2 : 0.85));
      tiles.setColorAt(i * tz + j, tileColor);
    }
    tiles.instanceColor.needsUpdate = true;

    // lights
    pulseLights.forEach((l, i) => { l.intensity = 4 + pump * (drop ? 18 : 9) * ((beat + i) % 2 ? 1 : 0.6); });
    beams.forEach((b, i) => {
      const sp = drop ? 2.4 : 0.9;
      b.pivot.rotation.z = Math.sin(clock * sp + b.phase) * 0.65;
      b.pivot.rotation.x = 0.25 + Math.cos(clock * sp * 0.8 + b.phase) * 0.35;
      b.cone.material.opacity = (drop ? 0.16 : 0.09) * (0.6 + pump * 0.6);
      if (onBeat && beat % 8 === 0) { const c = FLOOR_PAL[(i + beat / 8) % FLOOR_PAL.length]; b.cone.material.color.set(c); b.head.material.color.set(c); }
    });
    lasers.forEach((L, i) => {
      L.p.visible = drop;
      if (drop) { L.p.rotation.z = (i < 5 ? -1 : 1) * (0.5 + Math.sin(clock * 2.2 + L.phase) * 0.45); L.p.rotation.x = 1.2 + Math.cos(clock * 1.7 + L.phase) * 0.2; }
    });
    strobe.material.opacity = drop && bp < 0.08 && beat % 2 === 0 ? 0.18 : 0;
    disco.rotation.y += dt * 0.6;
    discoGlow.material.opacity = 0.25 + pump * 0.35;
    dj.material.map = djTex[Math.floor(beatT) % 2];
    dj.position.y = 1.55 + pump * 0.06;
    boothStrip.material.color.setHSL((clock * 0.15) % 1, 0.9, 0.55);
    env.children.forEach((o) => { if (o.userData.speaker) o.scale.setScalar(1 + pump * 0.12); });

    ledAcc += dt;
    if (ledAcc > 1 / 20 && !screen.src) { ledAcc = 0; drawLed(); }

    // fireworks + fountains
    while (fwQueue.length && fwQueue[0] <= clock) {
      fwQueue.shift();
      const n = Math.random() < 0.35 ? 2 : 1;
      for (let i = 0; i < n; i++) burst(rnd(-3.5, 3.5), rnd(5, 8), rnd(-6, -1), new THREE.Color().setHSL(Math.random(), 0.85, 0.6).getStyle());
    }
    for (let f = fountains.length - 1; f >= 0; f--) {
      const fo = fountains[f];
      if (clock > fo.until) { fountains.splice(f, 1); continue; }
      if (clock < fo.start) continue;
      for (let k = 0; k < 6; k++) emit(fo.x + rnd(-0.04, 0.04), 0.1, fo.z, rnd(-0.35, 0.35), rnd(5, 7.5), rnd(-0.35, 0.35), rnd(0.6, 1), Math.random() < 0.5 ? '#fff7d6' : '#ffd166', 9);
    }
    for (let i = 0; i < MAXP; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      const o = i * 3;
      if (pLife[i] <= 0) { pPos[o + 1] = -100; continue; }
      pVel[o + 1] -= pGrav[i] * dt;
      pVel[o] *= 0.985; pVel[o + 1] *= 0.985; pVel[o + 2] *= 0.985;
      pPos[o] += pVel[o] * dt; pPos[o + 1] += pVel[o + 1] * dt; pPos[o + 2] += pVel[o + 2] * dt;
      const fade = Math.min(1, pLife[i] / pMax[i] * 1.6);
      pCol[o] = pBase[o] * fade; pCol[o + 1] = pBase[o + 1] * fade; pCol[o + 2] = pBase[o + 2] * fade;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;

    // crowd
    for (const a of actors.values()) a.update(dt);

    // spotlights
    for (let i = spots.length - 1; i >= 0; i--) {
      const s = spots[i];
      if (clock > s.until || s.actor.dead) { scene.remove(s.cone, s.pool); s.cone.material.dispose(); s.pool.geometry.dispose(); s.pool.material.dispose(); spots.splice(i, 1); continue; }
      const p = s.actor.root.position;
      const top = new THREE.Vector3(p.x * 0.6, 7, p.z - 1.5);
      const h = top.distanceTo(p);
      s.cone.position.copy(top);
      s.cone.scale.set(0.9, h, 0.9);
      s.cone.lookAt(p); s.cone.rotateX(Math.PI / 2);
      s.pool.position.set(p.x, 0.07, p.z);
    }

    // camera
    let tPos = CAM_HOME.clone().add(new THREE.Vector3(Math.sin(clock * 0.12) * 0.8, Math.sin(clock * 0.2) * 0.25, 0));
    let tLook = LOOK_HOME;
    let speed = 1.6;
    if (shot && (clock > shot.until || shot.actor.dead)) { endFocus(); shot = null; }
    if (!shot && welcomeQueue.length) {
      const w = welcomeQueue.shift();
      if (!w.actor.dead) focusShot(w.actor, w.seconds, {});
    }
    if (shot) {
      if (!shot.sky && !shot.wide) {
        const p = shot.actor.root.position;
        const kk = shot.actor.curScale || 1;
        const d = (shot.close ? 4.4 : 5.6) * Math.max(1, kk * 0.7);
        const orb = shot.orbit ? Math.sin(clock * 0.5) * 0.9 : 0;
        shot.pos.set(p.x * 0.85 + orb, p.y + (shot.close ? 2.6 : 3.3) * Math.max(1, kk * 0.6), p.z + d);
        shot.look.set(p.x, p.y + 0.8 * kk, p.z);
      }
      tPos = shot.pos; tLook = shot.look; speed = 2.4;
    }
    const kc = Math.min(1, dt * speed);
    camera.position.lerp(tPos, kc);
    look.lerp(tLook, kc);
    camera.lookAt(look);

    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  function endFocus() {
    for (const a of actors.values()) { a.alphaTarget = 1; a.focused = false; }
  }

  // ---------------------------------------------------------------- public API
  return {
    setSfx(fn) { sfxHook = fn; },
    setTitle(title, sub) {
      wallTitle = String(title || 'LIVE BAR').slice(0, 28).toUpperCase();
      if (sub) wallSub = sub;
      drawBoothLogo();
    },
    setEnergy(v) { energy = v; },
    setBpm(v) { bpm = clamp(Number(v) || 128, 60, 200); },
    setPaused(p) {
      paused = !!p; last = performance.now();
      if (screen.video) { if (paused) screen.video.pause(); else screen.video.play().catch(() => {}); }
    },
    setScreen,
    // Replace the character pack (empty list = characters drawn in code). Last call wins.
    async setCharacters(urls) {
      const key = (urls || []).join('|');
      if (key === charKey) return charPack.length;
      charKey = key;
      const loaded = (await Promise.all((urls || []).map(decodeCharacter))).filter(Boolean);
      if (charKey !== key) { loaded.forEach((c) => c.frames.forEach((t) => t.dispose())); return charPack.length; }
      const old = charPack;
      charPack = loaded;
      old.forEach((c) => c.frames.forEach((t) => t.dispose()));
      return charPack.length;
    },
    setChroma(on) {
      chroma = !!on;
      env.visible = !chroma;
      scene.fog = chroma ? null : new THREE.FogExp2('#0c0526', 0.045);
      scene.background = chroma ? new THREE.Color('#00ff00') : BG;
    },
    upsert(user, opts = {}) {
      let a = actors.get(user.key);
      if (a) { a.setUser(user); return a; }
      a = new Actor(user, opts);
      a.slotIndex = opts.slot;
      actors.set(user.key, a);
      reflow();
      if (shot && shot.actor !== a) a.alphaTarget = a.npc ? 0.14 : 0.22;
      return a;
    },
    remove(key) {
      const a = actors.get(key);
      if (!a) return;
      a.dispose();
      actors.delete(key);
      reflow();
    },
    has: (key) => actors.has(key),
    act(key, action, seconds) { actors.get(key)?.act(action, seconds); },
    title(key, text, variant, seconds) { actors.get(key)?.setTitle(text, variant, seconds); },
    variant(key, v) { actors.get(key)?.setVariant(v); },
    ranks(keys) {
      for (const a of actors.values()) a.rank = 0;
      keys.forEach((k, i) => { const a = actors.get(k); if (a && !a.npc) a.rank = i + 1; });
    },
    danceAll(seconds) { for (const a of actors.values()) a.act('dance', seconds); },
    focus(key, seconds, opts = {}) {
      const a = actors.get(key);
      if (!a) return;
      focusShot(a, seconds, opts);
      for (const o of actors.values()) { o.focused = o === a; o.alphaTarget = o === a ? 1 : o.rank ? 0.4 : o.npc ? 0.14 : 0.22; }
    },
    welcome(key, seconds) {
      const a = actors.get(key);
      if (!a) return;
      if (welcomeQueue.length < 6) welcomeQueue.push({ actor: a, seconds });
    },
    spotlight(key, seconds, strong) { spotlight(actors.get(key), seconds, strong); },
    fireworks,
    drop() { dropUntil = Math.floor(beatT) + 8; },
    count: () => actors.size,
    debug: () => ({ shot: shot && { id: shot.actor.id, left: shot.until - clock }, actors: [...actors.values()].map((a) => ({ id: a.id, alpha: +a.alpha.toFixed(2), target: a.alphaTarget, op: +a.body.material.opacity.toFixed(2), entering: a.entering, z: +a.root.position.z.toFixed(2), sz: +a.slot.z.toFixed(2), slot: a.slotIndex, nameVis: a.name.visible })) }),
    destroy() { cancelAnimationFrame(raf); renderer.dispose(); }
  };
}
