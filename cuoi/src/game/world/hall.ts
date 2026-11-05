// Sảnh tiệc cưới 3D: sàn, thảm đỏ, bàn tròn trắng 10 ghế, sân khấu + cổng hoa, phông chữ.
// Đồ tĩnh gộp chung 1 khối mỗi màu để vẽ nhanh (ít lệnh vẽ).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat } from './chibi3d';

// ---------- Toạ độ (đơn vị ~ mét). Camera nhìn từ cổng (z dương) về sân khấu (z âm) ----------
export const GATE_Z = 9;
export const STAGE_Z = -22.5; // chỗ cô dâu chú rể đứng trên sân khấu
export const STAGE_Y = 0.6;
export const STAGE_FRONT = -19.6; // mép sân khấu
export const AISLE_HALF = 1.15;
const TABLE_XS = [-7.4, -3.5, 3.5, 7.4];
const TABLE_ZS = [5, 0.6, -3.8, -8.2, -12.6];
const SEATS_PER_TABLE = 10;
const CHAIR_R = 1.55;

export interface Seat {
  x: number;
  z: number;
  face: number; // góc quay nhìn vào bàn
  table: number;
  taken: string | null;
}

export const SEATS: Seat[] = [];
export const TABLES: { x: number; z: number }[] = [];
TABLE_ZS.forEach((z) =>
  TABLE_XS.forEach((x) => {
    const t = TABLES.length;
    TABLES.push({ x, z });
    for (let i = 0; i < SEATS_PER_TABLE; i++) {
      const a = (i / SEATS_PER_TABLE) * Math.PI * 2 + 0.31;
      const sx = x + Math.sin(a) * CHAIR_R;
      const sz = z + Math.cos(a) * CHAIR_R;
      SEATS.push({ x: sx, z: sz, face: Math.atan2(x - sx, z - sz), table: t, taken: null });
    }
  }),
);

/** Chỗ đứng khi hết ghế: dọc 2 bên tường */
export const STANDING: { x: number; z: number; taken: string | null }[] = [];
for (let z = 6; z > -16; z -= 1.1) for (const x of [-10.6, -11.6, 10.6, 11.6]) STANDING.push({ x, z, taken: null });

/** Trời đêm vẽ bằng canvas: xanh đen trên cao, tím than ở chân trời, sao, trăng và ánh đèn thành phố */
function nightTexture(withMoon: boolean) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#05060f');
  g.addColorStop(0.5, '#0d1030');
  g.addColorStop(0.85, '#22183f');
  g.addColorStop(1, '#3a2347');
  x.fillStyle = g;
  x.fillRect(0, 0, 1024, 512);
  // sao
  for (let i = 0; i < 160; i++) {
    const r = ((i * 7919) % 1000) / 1000;
    x.fillStyle = `rgba(255,255,255,${0.35 + r * 0.6})`;
    x.fillRect((i * 389) % 1024, (i * 211) % 330, r < 0.85 ? 2 : 3, r < 0.85 ? 2 : 3);
  }
  if (withMoon) {
    const s = x.createRadialGradient(780, 110, 6, 780, 110, 120);
    s.addColorStop(0, 'rgba(255,250,230,1)');
    s.addColorStop(0.28, 'rgba(255,245,215,0.95)');
    s.addColorStop(0.32, 'rgba(200,210,255,0.25)');
    s.addColorStop(1, 'rgba(200,210,255,0)');
    x.fillStyle = s;
    x.fillRect(0, 0, 1024, 512);
  }
  // ánh đèn thành phố xa ở chân trời
  for (let i = 0; i < 90; i++) {
    x.fillStyle = i % 3 ? 'rgba(255,214,140,0.7)' : 'rgba(255,170,200,0.55)';
    x.fillRect((i * 557) % 1024, 470 + ((i * 37) % 36), 3, 3);
  }
  // khung cửa kính
  x.strokeStyle = 'rgba(230,225,240,0.55)';
  x.lineWidth = 6;
  for (let i = 1; i < (withMoon ? 6 : 2); i++) {
    x.beginPath();
    x.moveTo((1024 / (withMoon ? 6 : 2)) * i, 0);
    x.lineTo((1024 / (withMoon ? 6 : 2)) * i, 512);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildHall(scene: THREE.Scene) {
  const parts = new Map<string, THREE.BufferGeometry[]>();
  const put = (color: string, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0) => {
    g = g.clone();
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    const list = parts.get(color) ?? [];
    list.push(g);
    parts.set(color, list);
  };

  // sàn đá kem + thảm đỏ + viền vàng
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 44), mat('#efe3d3'));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -6;
  scene.add(floor);
  put('#b3122e', new THREE.BoxGeometry(AISLE_HALF * 2, 0.02, GATE_Z - STAGE_FRONT + 1), 0, 0.01, (GATE_Z + STAGE_FRONT) / 2);
  for (const sx of [-1, 1]) put('#e6e9ef', new THREE.BoxGeometry(0.08, 0.025, GATE_Z - STAGE_FRONT + 1), sx * AISLE_HALF, 0.012, (GATE_Z + STAGE_FRONT) / 2);

  // tường xanh navy đêm + cột bạc + nẹp bạc (sang, không 1 tông hồng)
  put('#3e2747', new THREE.BoxGeometry(30, 9, 0.3), 0, 4.5, -27.5);
  for (const sx of [-1, 1]) {
    put('#4a2f52', new THREE.BoxGeometry(0.3, 9, 44), sx * 13.5, 4.5, -6);
    put('#dfe3ea', new THREE.BoxGeometry(0.1, 0.12, 44), sx * 13.3, 1.1, -6);
    put('#dfe3ea', new THREE.BoxGeometry(0.1, 0.12, 44), sx * 13.3, 7.6, -6);
    for (let z = 10; z > -27; z -= 4) put('#c4cad4', new THREE.BoxGeometry(0.2, 9, 0.35), sx * 13.3, 4.5, z);
  }
  for (const x of [-14, -9.5, 9.5, 14]) put('#c4cad4', new THREE.BoxGeometry(0.4, 9, 0.2), x, 4.5, -27.3);

  // bàn tròn trắng + 10 ghế trắng + đĩa + bình hoa
  const tableTop = new THREE.CylinderGeometry(1.05, 1.05, 0.05, 28);
  const cloth = new THREE.CylinderGeometry(1.08, 1.18, 0.72, 28, 1, true);
  const seat = new THREE.BoxGeometry(0.42, 0.06, 0.42);
  const back = new THREE.BoxGeometry(0.42, 0.5, 0.05);
  const leg = new THREE.CylinderGeometry(0.025, 0.025, 0.45, 5);
  const plate = new THREE.CylinderGeometry(0.13, 0.11, 0.02, 12);
  const charger = new THREE.CylinderGeometry(0.17, 0.17, 0.012, 14);
  const rim = new THREE.TorusGeometry(1.06, 0.03, 6, 40);
  const leaf = new THREE.SphereGeometry(0.09, 6, 5);
  const candle = new THREE.CylinderGeometry(0.03, 0.03, 0.1, 6);
  const vase = new THREE.CylinderGeometry(0.08, 0.12, 0.3, 10);
  const bloom = new THREE.SphereGeometry(0.1, 8, 6);
  const glass = new THREE.CylinderGeometry(0.035, 0.025, 0.12, 6);
  for (const t of TABLES) {
    put('#ffffff', tableTop, t.x, 0.75, t.z);
    put('#fdfbf7', cloth, t.x, 0.38, t.z);
    put('#dfe3ea', vase, t.x, 0.92, t.z);
    put('#dfe3ea', rim, t.x, 0.77, t.z, 0, Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      put('#5f8f4e', leaf, t.x + Math.sin(a) * 0.17, 1.04, t.z + Math.cos(a) * 0.17);
      put('#fff8e1', candle, t.x + Math.sin(a) * 0.42, 0.83, t.z + Math.cos(a) * 0.42);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      put(i % 2 ? '#ff8fab' : '#ffffff', bloom, t.x + Math.sin(a) * 0.12, 1.1 + (i % 3) * 0.03, t.z + Math.cos(a) * 0.12);
    }
    put('#ff4d6d', bloom, t.x, 1.18, t.z);
    for (let i = 0; i < SEATS_PER_TABLE; i++) {
      const a = (i / SEATS_PER_TABLE) * Math.PI * 2 + 0.31;
      put('#dfe3ea', charger, t.x + Math.sin(a) * 0.78, 0.778, t.z + Math.cos(a) * 0.78);
      put('#f4f1ea', plate, t.x + Math.sin(a) * 0.78, 0.792, t.z + Math.cos(a) * 0.78);
      put('#fff6cc', glass, t.x + Math.sin(a + 0.2) * 0.72, 0.84, t.z + Math.cos(a + 0.2) * 0.72);
    }
  }
  for (const s of SEATS) {
    // ghế quay lưng ra ngoài bàn
    const bx = s.x - Math.sin(s.face) * 0.22;
    const bz = s.z - Math.cos(s.face) * 0.22;
    put('#ffffff', seat, s.x, 0.45, s.z, s.face);
    put('#dfe3ea', back, bx, 0.72, bz, s.face);
    for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]])
      put('#c4cad4', leg, s.x + dx, 0.22, s.z + dz);
  }

  // sân khấu: mặt trắng, thân navy, viền bạc, bậc thềm
  put('#ffffff', new THREE.BoxGeometry(16, 0.08, 7.6), 0, STAGE_Y - 0.04, -23.4);
  put('#5b3156', new THREE.BoxGeometry(16, STAGE_Y - 0.08, 7.6), 0, (STAGE_Y - 0.08) / 2, -23.4);
  put('#dfe3ea', new THREE.BoxGeometry(16.1, 0.07, 0.1), 0, STAGE_Y - 0.04, STAGE_FRONT + 0.02);
  put('#dfe3ea', new THREE.BoxGeometry(16.1, 0.05, 0.1), 0, 0.06, STAGE_FRONT + 0.02);
  put('#ffffff', new THREE.BoxGeometry(3, 0.3, 0.7), 0, 0.15, STAGE_FRONT + 0.35);
  put('#dfe3ea', new THREE.BoxGeometry(3.05, 0.04, 0.05), 0, 0.3, STAGE_FRONT + 0.7);

  // cổng hoa trên sân khấu + cổng hoa ở lối vào: vòm + chùm hoa
  const flowers = (cz: number, cy: number, r: number, n: number) => {
    const arch = new THREE.TorusGeometry(r, 0.12, 8, 30, Math.PI);
    put('#dfe3ea', arch, 0, cy, cz);
    for (const sx of [-1, 1]) put('#dfe3ea', new THREE.CylinderGeometry(0.12, 0.14, cy, 8), sx * r, cy / 2, cz);
    const ball = new THREE.SphereGeometry(0.2, 8, 6);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI;
      const c = ['#ffffff', '#ff8fab', '#ffc2d1', '#ff4d6d', '#ffe5ec'][i % 5];
      put(c, ball, Math.cos(a) * r, cy + Math.sin(a) * r, cz + (i % 2 ? 0.08 : -0.08));
      if (i % 2 === 0) put('#5f8f4e', new THREE.SphereGeometry(0.13, 6, 5), Math.cos(a) * (r + 0.15), cy + Math.sin(a) * (r + 0.15), cz);
    }
    for (const sx of [-1, 1])
      for (let k = 0; k < 6; k++) put(['#ff8fab', '#ffffff', '#ffc2d1'][k % 3], ball, sx * r + (k % 2 ? 0.12 : -0.12), cy * (k / 6), cz);
  };
  flowers(-24.6, STAGE_Y + 2.2, 2.6, 26);
  flowers(GATE_Z, 2.6, 2.1, 22);

  // hoa dọc 2 bên thảm đỏ
  const stand = new THREE.CylinderGeometry(0.05, 0.1, 0.9, 6);
  const bunch = new THREE.SphereGeometry(0.26, 8, 6);
  for (let z = GATE_Z - 2; z > STAGE_FRONT + 1; z -= 3.3)
    for (const sx of [-1, 1]) {
      put('#e6e9ef', stand, sx * (AISLE_HALF + 0.3), 0.45, z);
      put(z % 2 ? '#ffffff' : '#ffc2d1', bunch, sx * (AISLE_HALF + 0.3), 1.02, z);
      put('#5f8f4e', leaf, sx * (AISLE_HALF + 0.3) + 0.18, 0.95, z + 0.1);
      put('#5f8f4e', leaf, sx * (AISLE_HALF + 0.3) - 0.18, 0.95, z - 0.1);
    }

  // ---------- sân khấu VIP: tường hoa, cột hoa, đèn chùm, chân nến, bánh cưới, tháp ly, loa, bàn DJ ----------
  const fball = new THREE.SphereGeometry(0.17, 7, 5);
  const FL = ['#ffffff', '#ffc2d1', '#ff8fab', '#ffe5ec', '#ffffff', '#f8f9fb'];
  // tường hoa sau cổng (2 mảng hai bên phông chữ)
  for (const sx of [-1, 1])
    for (let i = 0; i < 160; i++) {
      const x = sx * (5.2 + Math.random() * 3.6);
      const y = STAGE_Y + Math.random() * 5.2;
      put(FL[i % FL.length], fball, x, y, -26.9 + Math.random() * 0.2);
      if (i % 4 === 0) put('#5f8f4e', leaf, x + 0.15, y + 0.1, -26.8);
    }
  // 2 cột hoa cao 2 bên cổng
  for (const sx of [-1, 1]) {
    put('#dfe3ea', new THREE.CylinderGeometry(0.28, 0.34, 0.5, 14), sx * 3.6, STAGE_Y + 0.25, -24.4);
    put('#dfe3ea', new THREE.CylinderGeometry(0.1, 0.12, 2.6, 8), sx * 3.6, STAGE_Y + 1.6, -24.4);
    for (let k = 0; k < 26; k++) {
      const a = k * 2.4;
      put(FL[k % FL.length], fball, sx * 3.6 + Math.sin(a) * 0.35, STAGE_Y + 2.9 + Math.cos(a) * 0.3 + (k % 5) * 0.06, -24.4 + Math.cos(a * 1.3) * 0.3);
    }
    put('#5f8f4e', leaf, sx * 3.6, STAGE_Y + 3.4, -24.4);
  }
  // chân nến bạc dọc mép sân khấu
  for (const x of [-7.4, -5.2, 5.2, 7.4]) {
    put('#dfe3ea', new THREE.CylinderGeometry(0.04, 0.12, 1.4, 8), x, STAGE_Y + 0.7, STAGE_FRONT - 0.4);
    for (const dx of [-0.2, 0, 0.2]) put('#fff8e1', candle, x + dx, STAGE_Y + 1.5 + (dx ? 0 : 0.08), STAGE_FRONT - 0.4);
  }
  // bánh cưới 4 tầng (trái) + tháp ly (phải)
  const cakeX = -5.6;
  const cakeZ = -22;
  put('#dfe3ea', new THREE.CylinderGeometry(0.55, 0.6, 0.7, 16), cakeX, STAGE_Y + 0.35, cakeZ);
  ;[0.5, 0.4, 0.3, 0.2].forEach((r, i) => {
    put('#ffffff', new THREE.CylinderGeometry(r, r, 0.26, 20), cakeX, STAGE_Y + 0.83 + i * 0.26, cakeZ);
    put('#ffc2d1', new THREE.TorusGeometry(r, 0.025, 6, 20), cakeX, STAGE_Y + 0.71 + i * 0.26, cakeZ, 0, Math.PI / 2);
  });
  put('#ff4d6d', fball, cakeX, STAGE_Y + 1.88, cakeZ);
  const glassGeo = new THREE.ConeGeometry(0.07, 0.14, 8);
  put('#dfe3ea', new THREE.CylinderGeometry(0.55, 0.6, 0.7, 16), -cakeX, STAGE_Y + 0.35, cakeZ);
  for (let lvl = 0; lvl < 4; lvl++) {
    const n = (4 - lvl) * 4;
    const rr = (4 - lvl) * 0.1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      put('#fff3c4', glassGeo, -cakeX + Math.sin(a) * rr, STAGE_Y + 0.78 + lvl * 0.16, cakeZ + Math.cos(a) * rr, 0, Math.PI);
    }
  }
  // loa thùng 2 bên sân khấu
  const cone = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 16);
  for (const sx of [-1, 1]) {
    put('#151515', new THREE.BoxGeometry(0.9, 2.2, 0.8), sx * 8.6, STAGE_Y + 1.1, -21.2);
    put('#c4cad4', cone, sx * 8.6, STAGE_Y + 0.6, -20.79, 0, Math.PI / 2);
    put('#c4cad4', cone, sx * 8.6, STAGE_Y + 1.5, -20.79, 0, Math.PI / 2);
  }
  // bàn DJ (sau bên phải sân khấu)
  put('#101014', new THREE.BoxGeometry(1.8, 1.0, 0.8), 6.4, STAGE_Y + 0.5, -25.4);
  for (const dx of [-0.45, 0.45]) put('#2a2a30', new THREE.CylinderGeometry(0.25, 0.25, 0.04, 18), 6.4 + dx, STAGE_Y + 1.02, -25.4);
  // ống pháo giấy 2 góc sân khấu
  for (const sx of [-1, 1]) {
    put('#c4cad4', new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10), sx * 7, STAGE_Y + 0.35, STAGE_FRONT - 0.6);
    put('#ff4d6d', new THREE.TorusGeometry(0.17, 0.03, 6, 12), sx * 7, STAGE_Y + 0.7, STAGE_FRONT - 0.6, 0, Math.PI / 2);
  }

  // gộp
  for (const [color, list] of parts) scene.add(new THREE.Mesh(mergeGeometries(list), mat(color)));

  // dải LED đổi màu: mép sân khấu + mặt bàn DJ + khung phông chữ
  const ledMat = new THREE.MeshBasicMaterial({ color: '#ff4d9d' });
  const leds = [
    new THREE.Mesh(new THREE.BoxGeometry(16.1, 0.05, 0.04), ledMat),
    new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.02), ledMat),
    new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.06, 0.04), ledMat),
    new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.06, 0.04), ledMat),
  ];
  leds[0].position.set(0, STAGE_Y - 0.15, STAGE_FRONT + 0.08);
  leds[1].position.set(6.4, STAGE_Y + 0.5, -24.99);
  leds[2].position.set(0, STAGE_Y + 6.85, -27.15);
  leds[3].position.set(0, STAGE_Y + 2.35, -27.15);
  scene.add(...leds);

  // đèn chùm pha lê trên sân khấu
  const chand = new THREE.Group();
  const crystal = new THREE.MeshBasicMaterial({ color: '#f4f7ff' });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.05, 6, 32), mat('#dfe3ea'));
  ring1.rotation.x = Math.PI / 2;
  chand.add(ring1);
  const drop = new THREE.OctahedronGeometry(0.08);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const d = new THREE.Mesh(drop, crystal);
    d.position.set(Math.sin(a) * 1.1, -0.25 - (i % 3) * 0.15, Math.cos(a) * 1.1);
    chand.add(d);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const d = new THREE.Mesh(drop, crystal);
    d.position.set(Math.sin(a) * 0.5, -0.6 - (i % 2) * 0.2, Math.cos(a) * 0.5);
    chand.add(d);
  }
  chand.position.set(0, 7.6, STAGE_Z);
  scene.add(chand);

  // rèm đèn sau sân khấu (đèn nháy li ti)
  const lights = new THREE.BufferGeometry();
  const pts: number[] = [];
  for (let i = 0; i < 1400; i++) pts.push((Math.random() - 0.5) * 20, Math.random() * 8.5, -27.3 + Math.random() * 0.1);
  // dây đèn võng 2 bên tường
  for (const sx of [-1, 1])
    for (let i = 0; i < 700; i++) {
      const z = 10 - Math.random() * 37;
      pts.push(sx * 13.25, 6.4 - Math.abs(Math.sin(z * 0.8)) * 1.2 + (Math.random() - 0.5) * 0.15, z);
    }
  lights.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const fairy = new THREE.Points(lights, new THREE.PointsMaterial({ color: '#ffe9cf', size: 0.09 }));

  // cửa kính lớn sau sân khấu + 2 bên tường: trời đêm có trăng sao
  const sky = nightTexture(true);
  const skyWin = new THREE.Mesh(new THREE.PlaneGeometry(30, 9), new THREE.MeshBasicMaterial({ map: sky }));
  skyWin.position.set(0, 4.5, -27.34);
  scene.add(skyWin);
  const sideTex = nightTexture(false);
  for (const sx of [-1, 1]) {
    for (let z = 6; z > -24; z -= 8) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.4), new THREE.MeshBasicMaterial({ map: sideTex }));
      win.position.set(sx * 13.33, 4.4, z);
      win.rotation.y = -sx * Math.PI / 2;
      scene.add(win);
    }
  }
  scene.add(fairy);

  // phông chữ "Trăm Năm Hạnh Phúc" + tên cô dâu chú rể
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  board.position.set(0, STAGE_Y + 4.6, -27.2);
  scene.add(board);
  const setNames = (groom: string, bride: string) => {
    const c = cv.getContext('2d')!;
    c.clearRect(0, 0, 1024, 512);
    c.textAlign = 'center';
    c.fillStyle = '#ffffff';
    c.font = '800 120px "Be Vietnam Pro", serif';
    c.fillText('囍', 512, 140);
    c.font = '800 92px "Be Vietnam Pro", sans-serif';
    c.fillStyle = '#f2f4f8';
    c.fillText('Trăm Năm Hạnh Phúc', 512, 270);
    if (groom && bride) {
      const cut = (s: string) => (s.length > 14 ? s.slice(0, 13) + '…' : s);
      c.font = '700 66px "Be Vietnam Pro", sans-serif';
      c.fillStyle = '#ffc2d1';
      c.fillText(`${cut(groom)} ♥ ${cut(bride)}`, 512, 400);
    }
    tex.needsUpdate = true;
  };
  setNames('', '');

  return { setNames, fairy, ledMat, chand };
}
