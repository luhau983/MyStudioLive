// Chó mèo 3D chạy lăng xăng quanh tiệc; chó thỉnh thoảng rượt mèo.
import * as THREE from 'three';
import { mat } from './chibi3d';
import { GATE_Z, TABLES } from './hall';

type Kind = 'dog' | 'cat';

interface Pet {
  kind: Kind;
  root: THREE.Group;
  legs: THREE.Mesh[];
  tail: THREE.Mesh;
  target: THREE.Vector3;
  speed: number;
  rest: number; // ngồi nghỉ thêm bao lâu
  chase: Pet | null;
  phase: number;
  danceSpot?: THREE.Vector3 | null; // chỗ nhảy lúc DJ
}

const DOGS = ['#c68642', '#f2d3a0', '#3b2a20', '#ffffff'];
const CATS = ['#f4a259', '#9aa0a6', '#2b2b2b', '#fff3e0'];

// chỗ chó mèo hay chạy tới: lối giữa các hàng bàn, cổng, trước sân khấu
const SPOTS: THREE.Vector3[] = [];
for (const t of TABLES) SPOTS.push(new THREE.Vector3(t.x + (Math.random() - 0.5) * 2, 0, t.z + 2.2));
for (let x = -10; x <= 10; x += 2.5) SPOTS.push(new THREE.Vector3(x, 0, GATE_Z - 1), new THREE.Vector3(x, 0, -16));

const randSpot = () => SPOTS[Math.floor(Math.random() * SPOTS.length)].clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8));

function build(kind: Kind, color: string) {
  const root = new THREE.Group();
  const s = kind === 'dog' ? 1 : 0.75;
  const m = mat(color);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13 * s, 0.32 * s, 4, 8), m);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.3 * s;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14 * s, 10, 8), m);
  head.position.set(0, 0.42 * s, 0.26 * s);
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.08, 0.13], [0.08, 0.13], [-0.08, -0.13], [0.08, -0.13]]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.03 * s, 0.22 * s, 6), m);
    l.geometry.translate(0, -0.11 * s, 0);
    l.position.set(x * s, 0.22 * s, z * s);
    legs.push(l);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * s, 0.015 * s, 0.25 * s, 5), m);
  tail.geometry.translate(0, 0.125 * s, 0);
  tail.position.set(0, 0.36 * s, -0.25 * s);
  tail.rotation.x = kind === 'cat' ? -0.3 : -0.9;
  const earGeo = kind === 'cat' ? new THREE.ConeGeometry(0.05 * s, 0.1 * s, 4) : new THREE.SphereGeometry(0.06 * s, 6, 5);
  for (const x of [-0.08, 0.08]) {
    const e = new THREE.Mesh(earGeo, kind === 'dog' ? mat('#5a3d2b') : m);
    e.position.set(x * s, 0.55 * s, 0.24 * s);
    if (kind === 'dog') e.scale.set(0.7, 1.4, 0.5);
    root.add(e);
  }
  for (const x of [-0.05, 0.05]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022 * s, 6, 4), mat('#111111'));
    eye.position.set(x * s, 0.45 * s, 0.38 * s);
    root.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03 * s, 6, 4), mat(kind === 'dog' ? '#111111' : '#ff8fab'));
  nose.position.set(0, 0.4 * s, 0.4 * s);
  root.add(body, head, nose, tail, ...legs);
  return { root, legs, tail };
}

export class Pets {
  private list: Pet[] = [];

  constructor(scene: THREE.Scene, dogs = 4, cats = 4) {
    for (let i = 0; i < dogs + cats; i++) {
      const kind: Kind = i < dogs ? 'dog' : 'cat';
      const { root, legs, tail } = build(kind, kind === 'dog' ? DOGS[i % 4] : CATS[i % 4]);
      root.position.copy(randSpot());
      scene.add(root);
      this.list.push({ kind, root, legs, tail, target: randSpot(), speed: kind === 'dog' ? 1.4 : 1, rest: Math.random() * 3, chase: null, phase: Math.random() * 10 });
    }
  }

  update(dt: number, t: number, dance = false) {
    this.list.forEach((p, i) => {
      if (dance) return this.dance(p, i, dt, t);
      if (p.danceSpot) {
        // hết nhạc: về chạy lăng xăng như cũ
        p.danceSpot = null;
        p.chase = null;
        p.rest = 0;
        p.root.rotation.z = 0;
        p.target = randSpot();
      }
      this.wander(p, dt, t);
    });
  }

  /** nhảy DJ: chạy ra sàn trước sân khấu rồi nhún nhảy, xoay vòng, đứng 2 chân */
  private dance(p: Pet, i: number, dt: number, t: number) {
    const r = p.root.position;
    if (!p.danceSpot) p.danceSpot = new THREE.Vector3(-3.5 + (i % 4) * 2.3 + (Math.random() - 0.5), 0, -15.6 + Math.floor(i / 4) * 1.4);
    const dx = p.danceSpot.x - r.x;
    const dz = p.danceSpot.z - r.z;
    const dist = Math.hypot(dx, dz);
    const ph = p.phase + t;
    if (dist > 0.1) {
      const step = Math.min(dist, 3 * dt);
      r.x += (dx / dist) * step;
      r.z += (dz / dist) * step;
      p.root.rotation.y = Math.atan2(dx, dz);
      r.y = Math.abs(Math.sin(ph * 14)) * 0.04;
      p.legs.forEach((l, k) => (l.rotation.x = Math.sin(ph * 14 + (k % 2 ? Math.PI : 0)) * 0.6));
      return;
    }
    // nhún theo nhịp, chó xoay vòng, mèo lắc lư đứng 2 chân
    r.y = Math.abs(Math.sin(t * Math.PI * 2 + i)) * 0.28;
    if (p.kind === 'dog') p.root.rotation.y += dt * (i % 2 ? 4 : -4);
    else {
      p.root.rotation.y = Math.sin(t * 2 + i) * 0.8;
      p.root.rotation.z = Math.sin(t * Math.PI * 2) * 0.25;
    }
    p.legs.forEach((l, k) => (l.rotation.x = Math.sin(t * 12 + k) * 0.9));
    p.tail.rotation.z = Math.sin(t * 16) * 0.8;
  }

  private wander(p: Pet, dt: number, t: number) {
    {
      const r = p.root.position;
      if (p.chase) p.target.copy(p.chase.root.position);
      const dx = p.target.x - r.x;
      const dz = p.target.z - r.z;
      const dist = Math.hypot(dx, dz);
      let moving = false;
      if (p.rest > 0) p.rest -= dt;
      else if (dist < 0.15) {
        // tới nơi: nghỉ chút rồi chọn chỗ mới; chó đôi khi rượt mèo
        p.chase = null;
        p.speed = p.kind === 'dog' ? 1.4 : 1;
        p.rest = 1 + Math.random() * 4;
        p.target = randSpot();
        if (p.kind === 'dog' && Math.random() < 0.3) {
          const cats = this.list.filter((c) => c.kind === 'cat');
          const cat = cats[Math.floor(Math.random() * cats.length)];
          p.chase = cat;
          p.speed = 2.6;
          cat.target = randSpot();
          cat.speed = 2.4;
          cat.rest = 0;
          p.rest = 0;
          setTimeout(() => {
            p.chase = null;
            p.target = randSpot();
          }, 4000);
        }
      } else {
        const step = Math.min(dist, p.speed * dt);
        r.x += (dx / dist) * step;
        r.z += (dz / dist) * step;
        p.root.rotation.y = Math.atan2(dx, dz);
        moving = true;
      }
      const ph = p.phase + t;
      p.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(ph * 14 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 : 0));
      p.tail.rotation.z = Math.sin(ph * (p.kind === 'dog' ? 14 : 3)) * 0.5;
      r.y = moving ? Math.abs(Math.sin(ph * 14)) * 0.03 : 0;
    }
  }
}
