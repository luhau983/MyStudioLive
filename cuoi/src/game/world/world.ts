// Thế giới 3D (Three.js, ngoài React): khách đi lại, ngồi bàn, cặp đôi lên lễ đường, camera lia, hiệu ứng.
import * as THREE from 'three';
import { Chibi, guestLook, npcLook, weddingLook, type Look, type Pose, type WeddingSet } from './chibi3d';
import { Pets } from './pets3d';
import { AISLE_HALF, buildHall, GATE_Z, SEATS, STAGE_FRONT, STAGE_Y, STAGE_Z, STANDING, TABLES, type Seat } from './hall';
import { bubble, nameTag } from './tags';

export const W = 1080;
export const H = 1920;
const NPC_COUNT = 70; // khách đệm (không tên) cho rạp đông
const MAX_REAL = 160;
const HEMI_I = 1.15; // buổi tối: tối hơn bản gốc (1.6)
const SUN_I = 0.85;
const TAGS_MAX = 36; // bảng tên tối đa mỗi khung hình (đông quá thì chỉ hiện người vừa tương tác)

type V3 = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface Guest {
  id: string;
  name: string;
  real: boolean;
  c: Chibi;
  shadow: THREE.Mesh;
  avatar: HTMLImageElement | null;
  seat: Seat | null;
  spot: (typeof STANDING)[number] | null;
  path: V3[];
  speed: number;
  face: number | null; // hướng nhìn khi đứng yên
  action: { pose: Pose; until: number } | null;
  hold: { what: Parameters<Chibi['hold']>[0]; until: number } | null;
  title: { text: string; gold: boolean } | null;
  tag: HTMLCanvasElement | null;
  bubble: { cv: HTMLCanvasElement; until: number } | null;
  active: number; // lần cuối tương tác (để chọn bảng tên nào hiện)
  wedding: Look | null; // đang mặc đồ cưới
  baseLook: Look;
  role: 'groom' | 'bride' | null; // đang là cô dâu / chú rể trên lễ đường
  busy?: boolean;
  passer?: boolean;
  tagRole?: 'groom' | 'bride' | null; // vai lúc vẽ bảng tên // người chỉ lướt vào live, chưa comment: hết chỗ thì nhường ghế cho người comment // đang làm Nguyệt Lão / đi đấm người / ra sàn quẩy: không bị bốc trêu, mai mối
  onArrive?: () => void;
  move?: Pose; // động tác riêng của thành viên đội nhảy
}

type CamMode = 'wide' | 'gate' | 'aisle' | 'stage';

export interface WorldEvents {
  coupleAtGate?: () => void;
  coupleOnStage?: () => void;
  /** đánh nhau ở bàn: id người thật (null nếu khách đệm), số bàn */
  fight?: (a: string | null, b: string | null, table: number) => void;
}

class World {
  events: WorldEvents = {};
  private renderer: THREE.WebGLRenderer | null = null;
  private overlay: CanvasRenderingContext2D | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, W / H, 0.1, 120);
  private camPos = v(0, 10.5, 12.5);
  private camLook = v(0, 0, -15);
  private hemi = new THREE.HemisphereLight('#ffe6d2', '#8a6c9a', HEMI_I);
  private sun = new THREE.DirectionalLight('#ffd2a8', SUN_I);
  private guests = new Map<string, Guest>();
  private npcs: Guest[] = [];
  private mcM: Chibi;
  private mcF: Chibi;
  private speaker: 'M' | 'F' | null = null;
  private hall: ReturnType<typeof buildHall>;
  private raf = 0;
  private last = 0;
  private t = 0;
  private base: CamMode = 'wide';
  private shot = { kind: 0, t0: 0, until: 0, dir: 1 };
  private djFxAt = 0;
  private camCut = false;
  private camWasClose = false;
  private carParked = false;
  private carOnArrive: (() => void) | null = null;
  private carCamUntil = 0;
  private focus: { id: string | null; mode: CamMode | null; until: number; point?: V3; close?: boolean } = { id: null, mode: null, until: 0 };
  private couple: { groom: string | null; bride: string | null; mode: 'none' | 'gate' | 'walk' | 'stage' } = { groom: null, bride: null, mode: 'none' };
  private partyUntil = 0;
  private fx: Particles;
  private hearts: Particles;
  private ring: THREE.Mesh;
  private ringAnim: { from: V3; to: V3; t0: number } | null = null;
  private shadowGeo = new THREE.CircleGeometry(0.32, 16);
  private shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.16, depthWrite: false });
  private glow: THREE.Mesh;
  private beams: THREE.Mesh[] = [];
  private smoke: Smoke;
  private pets: Pets;
  private waiters: (Guest & { job: 'rest' | 'go' | 'serve' | 'back'; until: number })[] = [];
  private dancers: { g: Guest; home: V3; spot: V3 }[] = [];
  private danceUntil = 0;
  private crew: Guest[] = [];
  private stageDancers: { g: Guest; home: V3; spot: V3 }[] = [];
  private car: THREE.Group | null = null;
  private roses: Particles;
  private roseAcc = 0;
  private balloons: { m: THREE.Mesh; vy: number; life: number; sway: number }[] = [];
  private lasers: THREE.Mesh[] = [];
  private disco: THREE.Mesh;
  private djUntil = 0;
  private djCrew: Guest[] = [];
  private carPath: V3[] = [];
  private stageDanceOn = false;
  private dj: Guest;
  private hired: (Guest & { job: 'rest' | 'go' | 'serve' | 'back'; until: number; oldLook: Look; hireKind: 'waiter' | 'dancer' })[] = [];
  private anticAcc = 0;
  /** 1 = đủ hiệu ứng; máy chậm (dưới ~40 khung/giây) thì tự hạ xuống tới 0.4, mượt lại thì tăng dần */
  quality = 1;
  private slow = 0;
  private debugFps = typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1';
  private frameTimes: number[] = [];
  private nguyet: Chibi;
  private nguyetOn = false;
  private thread: { a: string; b: string; until: number; mesh: THREE.Mesh | null } | null = null;
  private threadMat = new THREE.MeshBasicMaterial({ color: '#ff2d55' });
  private fountainUntil = 0;
  private smokeAcc = 0;
  private glitter = 0;
  private lastCannon = 0;

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color('#120c1e');
    s.fog = new THREE.Fog('#120c1e', 34, 70);
    s.add(this.hemi);
    const sun = this.sun; // buổi tối: đèn trần ấm thay cho nắng chiều
    sun.position.set(4, 12, 10);
    s.add(sun);
    this.hall = buildHall(s);

    // 2 MC: anh MC vest đen nơ đỏ, chị MC áo dài hồng
    this.mcM = new Chibi({ ...guestLook('mc-nam'), body: 'suit', main: '#16161c', pants: '#16161c', accent: '#111111', hair: '#1b1512', longHair: false, hairStyle: 'sidePart', hat: 'none', flower: true }, 1.15);
    this.mcF = new Chibi({ ...guestLook('mc-nu'), body: 'aodaiF', main: '#ff8fab', pants: '#ffffff', accent: '#f6c453', hair: '#2b1d16', longHair: true, hairStyle: 'long', hat: 'none' }, 1.15);
    this.mcM.root.position.set(-4.2, STAGE_Y, -21.2);
    this.mcF.root.position.set(4.2, STAGE_Y, -21.2);
    this.mcM.root.rotation.y = 0.35;
    this.mcF.root.rotation.y = -0.35;
    this.mcM.hold('mic');
    this.mcF.hold('mic');
    s.add(this.mcM.root, this.mcF.root);

    this.fx = new Particles(4000, 0.3, squareTex());
    this.roses = new Particles(900, 0.42, petalTex());
    s.add(this.roses.points);
    // bóng bay bay lên (dùng lại 40 quả)
    const bGeo = new THREE.SphereGeometry(0.28, 12, 10);
    bGeo.scale(1, 1.2, 1);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(bGeo, new THREE.MeshLambertMaterial({ color: ['#ff4d6d', '#ffffff', '#ffc2d1', '#b388ff', '#7ec8e3'][i % 5] }));
      m.visible = false;
      s.add(m);
      this.balloons.push({ m, vy: 0, life: 0, sway: Math.random() * 6 });
    }
    // laser từ bàn DJ + quả cầu disco, chỉ bật lúc quẩy DJ
    const laserGeo = new THREE.CylinderGeometry(0.025, 0.025, 30, 6);
    laserGeo.translate(0, 15, 0);
    for (let i = 0; i < 8; i++) {
      const l = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: ['#ff2d95', '#29f0ff', '#7dff5a', '#ffe14d'][i % 4], transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      l.position.set(6.4 + (i % 2 ? 0.3 : -0.3), STAGE_Y + 1.1, -25.4);
      l.visible = false;
      this.lasers.push(l);
      s.add(l);
    }
    this.disco = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), new THREE.MeshLambertMaterial({ color: '#e6ecff', flatShading: true, emissive: '#555577' }));
    this.disco.position.set(0, 7, -17);
    this.disco.visible = false;
    s.add(this.disco);
    this.hearts = new Particles(500, 0.5, heartTex());
    s.add(this.fx.points, this.hearts.points);

    this.smoke = new Smoke(60);
    s.add(this.smoke.group);
    this.pets = new Pets(s);

    // DJ đeo tai nghe sau bàn DJ
    this.dj = this.makeGuest('dj', 'DJ Tèo Teo', false, { ...guestLook('dj', false), body: 'shirt', main: '#111111', hair: '#d6332f', longHair: false, hairStyle: 'short', hat: 'headphones' });
    this.dj.c.root.position.set(6.4, STAGE_Y, -26.1);
    this.dj.title = { text: '🎧 DJ', gold: false };

    // nhân viên bưng món: vest đen nơ đen, đứng chờ ở cửa bếp 2 bên
    for (let i = 0; i < 5; i++) {
      const g = this.makeGuest(`waiter${i}`, '', false, { ...guestLook(`waiter${i}`), body: 'suit', main: '#1a1a1a', pants: '#1a1a1a', accent: '#111111', hat: 'none', longHair: false });
      const side = i % 2 ? 1 : -1;
      g.c.root.position.set(side * 12.2, 0, -14 + i * 1.2);
      g.name = ['Anh Tèo Phục Vụ', 'Chị Hoa Bưng Mâm', 'Anh Tũn Chạy Bàn', 'Chị Mơ Phục Vụ', 'Anh Bin Bưng Bê'][i];
      g.title = { text: '🍽 Phục vụ', gold: false };
      this.waiters.push(Object.assign(g, { job: 'rest' as const, until: Date.now() + i * 1500 }));
    }

    // đội pháo hoa: đứng cạnh ống pháo 2 góc sân khấu, đội mũ
    for (const sx of [-1, 1]) {
      const g = this.makeGuest(`crew${sx}`, '', false, { ...guestLook(`crew${sx}`), body: 'shirt', main: '#2b2d42', accent: '#ff4d6d', hat: 'cap', longHair: false });
      g.c.root.position.set(sx * 8.3, 0, STAGE_FRONT + 1.2);
      g.face = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.name = sx < 0 ? 'Anh Hùng Pháo' : 'Anh Dũng Pháo';
      g.title = { text: '🎆 Đội pháo', gold: false };
      this.crew.push(g);
    }

    // đội nhảy 14 người, 2 hàng trước sân khấu: váy bạc, vest trắng, thêm vài thành viên "phi lý" cho hài
    // (bà cụ, em bé, anh quần đùi dép tổ ong, chú mặc đồ cô dâu)
    const spots: [number, number][] = [];
    for (const x of [-7, -5.6, -4.2, -2.8, 2.8, 4.2, 5.6, 7]) spots.push([x, -17.6]);
    for (const x of [-6.3, -4.9, -3.5, 3.5, 4.9, 6.3]) spots.push([x, -16.3]);
    spots.forEach(([x, z], i) => {
      const d = guestLook(`dancer${i}`);
      const looks: Look[] = [
        { ...d, body: 'dress', main: '#cfd6e6', accent: '#ff8fab', hair: '#141010', longHair: true, hat: 'none' },
        { ...d, body: 'suit', main: '#f2f2f2', pants: '#f2f2f2', accent: '#ff4d6d', hair: '#141010', longHair: false, hat: 'none' },
      ];
      let look = looks[i % 2];
      if (i === 3) look = { ...d, age: 'old', body: 'aodaiF', main: '#7b4b94', pants: '#2b2b2b', hair: '#d9d9d9', longHair: false, hat: 'bun' };
      if (i === 9) look = { ...d, age: 'kid', body: 'shirt', main: '#ffd166', hair: '#141010', longHair: false, hat: 'cap', accent: '#ff4d6d' };
      if (i === 6) look = { ...d, body: 'shorts', main: '#ff8a3d', pants: '#2a6fdb', accent: '#d62828', shoes: '#2a6fdb', longHair: false, hat: 'none' };
      if (i === 12) look = { ...d, body: 'gown', main: '#ffffff', accent: '#ffc2d1', hair: '#141010', longHair: false, hat: 'veil' };
      const g = this.makeGuest(`dancer${i}`, '', false, look);
      const home = v(Math.sign(x) * (11.6 - (i % 4) * 0.6), 0, -15.4 - (i % 4) * 0.9);
      g.c.root.position.copy(home);
      g.face = 0;
      g.name = ['Mai', 'Bin', 'Ly', 'Bà Nội Quẩy', 'Trang', 'Tú', 'Anh Dép Lào', 'Ngân', 'Kem', 'Bé Bi', 'Hà', 'Long', 'Chú Váy Cưới', 'Vy'][i] ?? `Vũ công ${i}`;
      g.title = { text: '💃 Đội nhảy', gold: false };
      this.dancers.push({ g, home, spot: v(x, 0, z) });
    });

    // 4 vũ công nữ váy ngắn kim sa: chờ trong cánh gà, cô dâu chú rể lên sân khấu / cả sảnh quẩy thì ra nhảy phía sau
    const STAGE_DANCE = ['#ff4d9d', '#b388ff', '#ff4d9d', '#b388ff'];
    [-2.3, -0.8, 0.8, 2.3].forEach((x, i) => {
      const look: Look = { ...guestLook(`vucong${i}`), body: 'shortGown', main: STAGE_DANCE[i], accent: '#e6e9ef', shoes: '#e6e9ef', hair: '#141010', longHair: true, hat: i % 2 ? 'tiara' : 'none' };
      const g = this.makeGuest(`vucong${i}`, '', false, look);
      const home = v(Math.sign(x) * (7.6 + (i % 2) * 0.5), STAGE_Y, -25.2);
      g.c.root.position.copy(home);
      g.face = 0;
      g.name = ['Vũ công Mai Anh', 'Vũ công Thảo', 'Vũ công Linh', 'Vũ công Yến'][i];
      g.title = { text: '💃 Vũ công', gold: false };
      this.stageDancers.push({ g, home, spot: v(x, STAGE_Y, STAGE_Z - 1.7) });
    });

    // Nguyệt Lão: áo đỏ, tóc râu bạc, chỉ hiện lúc se duyên
    this.nguyet = new Chibi({ ...guestLook('nguyet-lao'), body: 'aodaiM', main: '#c8102e', pants: '#fff1e0', accent: '#f6c453', hair: '#f4f4f4', longHair: false, hat: 'khanXep', beard: true }, 1.3);
    this.nguyet.root.position.set(0, STAGE_Y, STAGE_Z - 1.4);
    this.nguyet.root.visible = false;
    this.nguyet.hold('bouquet');
    s.add(this.nguyet.root);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 10, 24), new THREE.MeshLambertMaterial({ color: '#ffd166', emissive: '#7a5a00' }));
    this.ring.visible = false;
    s.add(this.ring);

    // vòng sáng dưới chân cặp đôi
    this.glow = new THREE.Mesh(new THREE.RingGeometry(0.5, 1.4, 32), new THREE.MeshBasicMaterial({ color: '#ffd6e0', transparent: true, opacity: 0.35, depthWrite: false }));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.visible = false;
    s.add(this.glow);

    // đèn rọi quét từ trần (cột sáng mờ, cộng sáng)
    const beamGeo = new THREE.CylinderGeometry(0.12, 2.4, 13, 24, 1, true);
    beamGeo.translate(0, -6.5, 0); // gốc ở đỉnh để xoay quanh đèn
    for (const [x, z, c] of [[-10, 4, '#e6ecff'], [10, 4, '#e6ecff'], [-10, -8, '#ffd1e6'], [10, -8, '#ffd1e6'], [-6, -18, '#fff4d6'], [6, -18, '#fff4d6']] as const) {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(x, 11, z);
      this.beams.push(m);
      s.add(m);
    }

    for (let i = 0; i < NPC_COUNT; i++) this.addNpc(i);
  }

  // ---------- gắn vào trang ----------
  attach(gl: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.overlay = overlay.getContext('2d');
    this.last = performance.now();
    const loop = (now: number) => {
      // LIVE Studio's browser can drop to a few fps: catch up in small steps so walking keeps pace with the
      // Date.now() timers and the MC voice instead of running in slow motion (cap 1 s after a stall)
      let left = Math.min(1, Math.max(0, (now - this.last) / 1000));
      this.adaptQuality(left);
      this.last = now;
      if (this.debugFps) this.frameTimes.push(now);
      while (left > 0.05) {
        this.step(0.05, false);
        left -= 0.05;
      }
      this.step(left, true);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  detach() {
    cancelAnimationFrame(this.raf);
    this.renderer?.dispose();
    this.renderer = null;
    this.overlay = null;
  }

  // ---------- khách ----------
  private makeGuest(id: string, name: string, real: boolean, look: Look): Guest {
    const c = new Chibi(look);
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(c.root, shadow);
    return {
      id, name, real, c, shadow, avatar: null, seat: null, spot: null, path: [], speed: 2.2, face: null, action: null, hold: null,
      title: null, tag: null, bubble: null, active: 0, wedding: null, baseLook: look, role: null,
    };
  }

  private addNpc(i: number) {
    const free = SEATS.filter((s) => !s.taken);
    if (!free.length) return;
    const seat = free[Math.floor(Math.random() * free.length)];
    const g = this.makeGuest(`npc${i}-${Math.random()}`, '', false, npcLook(`npc-${i}-${Math.random()}`));
    seat.taken = g.id;
    g.seat = seat;
    g.c.root.position.set(seat.x, 0, seat.z);
    this.npcs.push(g);
  }

  private removeGuest(g: Guest) {
    this.scene.remove(g.c.root, g.shadow);
    if (g.seat) g.seat.taken = null;
    if (g.spot) g.spot.taken = null;
  }

  has(id: string) {
    return this.guests.has(id);
  }

  get count() {
    return this.guests.size;
  }

  ids() {
    return [...this.guests.keys()];
  }

  nameOf(id: string) {
    return this.guests.get(id)?.name ?? id;
  }

  /** Người xem comment: vào từ cổng hoa, đi tìm ghế */
  ensure(id: string, name: string, avatarUrl = '', passer = false, fem?: boolean) {
    let g = this.guests.get(id);
    if (g) {
      if (!passer) g.passer = false; // người lướt qua giờ đã comment: thành khách chính thức
      if (!passer) g.active = Date.now();
      if (name !== g.name) {
        g.name = name;
        g.tag = null;
      }
    } else {
      if (this.guests.size >= MAX_REAL) {
        // đầy: mời người lướt qua lâu nhất ra trước, hết người lướt qua mới tới người comment im lâu nhất
        const pool = [...this.guests.values()].filter((x) => !x.role && !x.busy);
        const old = (pool.some((x) => x.passer) ? pool.filter((x) => x.passer) : passer ? [] : pool).sort((a, b) => a.active - b.active)[0];
        if (!old && passer) return; // người lướt qua không được đẩy người comment ra
        if (old) {
          this.removeGuest(old);
          this.guests.delete(old.id);
        }
      }
      g = this.makeGuest(id, name, true, guestLook(id, fem));
      g.passer = passer;
      g.active = Date.now();
      g.c.root.position.set((Math.random() - 0.5) * 1.2, 0, GATE_Z + 2.5);
      this.guests.set(id, g);
      this.takePlace(g);
    }
    if (avatarUrl && !g.avatar) {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      const guest = g;
      img.onload = () => {
        guest.avatar = img;
        guest.tag = null;
      };
      img.src = avatarUrl;
    }
  }

  /** Tìm ghế (mời bớt khách đệm nếu hết), hết ghế thì đứng dọc tường */
  private takePlace(g: Guest) {
    let seat = SEATS.find((s) => !s.taken) ?? null;
    if (!seat && this.npcs.length) {
      const npc = this.npcs.splice(Math.floor(Math.random() * this.npcs.length), 1)[0];
      seat = npc.seat;
      this.poof(npc.c.root.position, 20);
      this.removeGuest(npc);
    }
    if (!seat && !g.passer) {
      const p = [...this.guests.values()].filter((x) => x.passer && x.seat && !x.role && !x.busy).sort((a, b) => a.active - b.active)[0];
      if (p) {
        seat = p.seat;
        this.poof(p.c.root.position, 20);
        this.removeGuest(p);
        this.guests.delete(p.id);
      }
    }
    if (seat) {
      seat.taken = g.id;
      g.seat = seat;
    } else {
      const spot = STANDING.find((p) => !p.taken);
      if (spot) {
        spot.taken = g.id;
        g.spot = spot;
      }
    }
    this.goHome(g);
  }

  /** Đi về ghế: xuống sân khấu nếu đang ở trên, theo thảm đỏ, rẽ vào lối giữa 2 hàng bàn */
  private goHome(g: Guest) {
    const p = g.c.root.position;
    const path: V3[] = [];
    if (p.z < STAGE_FRONT) path.push(v(Math.sign(p.x) * 0.4, STAGE_Y, STAGE_FRONT - 0.2), v(Math.sign(p.x) * 0.4, 0, STAGE_FRONT + 0.8));
    const home = g.seat ?? g.spot;
    if (home) {
      const table = g.seat ? TABLES[g.seat.table] : null;
      const lane = table ? table.z + 2.2 : home.z;
      if (Math.abs(p.x) > AISLE_HALF + 0.2) path.push(v(p.x, 0, lane), v(home.x, 0, lane));
      else path.push(v(p.x * 0.3, 0, lane), v(home.x, 0, lane));
      path.push(v(home.x, 0, home.z));
    }
    g.path = path;
    g.face = g.seat ? g.seat.face : g.spot ? (g.spot.x < 0 ? Math.PI / 2 : -Math.PI / 2) : 0;
  }

  say(id: string, text: string, ms = 5000) {
    const g = this.guests.get(id);
    if (!g) return;
    const now = Date.now();
    g.active = now;
    // live đông (hàng trăm comment/giây): mỗi giây vẽ tối đa 12 bong bóng mới, để máy không giật vì dựng chữ liên tục
    if (now - this.bubbleSec >= 1000) {
      this.bubbleSec = now;
      this.bubbleCount = 0;
    }
    if (++this.bubbleCount > 12) return;
    g.bubble = { cv: bubble(text), until: now + ms };
  }

  private bubbleSec = 0;
  private bubbleCount = 0;

  setTitle(id: string, title: { text: string; gold: boolean } | null) {
    const g = this.guests.get(id);
    if (!g) return;
    g.title = title;
    g.tag = null;
  }

  act(id: string, pose: Pose, ms = 3000) {
    const g = this.guests.get(id);
    if (g) g.action = { pose, until: Date.now() + ms };
  }

  /** gõ ZÔ: nâng ly */
  zo(id: string) {
    const g = this.guests.get(id);
    if (!g || g.role) return;
    g.action = { pose: g.seat && !g.path.length ? 'zo' : 'cheer', until: Date.now() + 3500 };
    g.hold = { what: 'glass', until: Date.now() + 3500 };
    g.c.hold('glass');
  }

  // ---------- camera ----------
  /** Lia camera tới 1 người / 1 cảnh trong `ms` rồi về cảnh chính */
  look(target: string | CamMode, ms = 4000) {
    // đang chờ trả lời ở cổng hoa: giữ máy quay ở người đang quỳ, không lia đi chỗ khác
    if (this.couple.mode === 'gate' && target !== 'gate') return;
    // chủ kênh chốt: không quay cận từng khách / từng bàn, chỉ cận cô dâu chú rể
    const isGuest = target !== 'wide' && target !== 'gate' && target !== 'aisle' && target !== 'stage';
    if (isGuest && target !== this.couple.groom && target !== this.couple.bride) return;
    if (target === 'wide' || target === 'gate' || target === 'aisle' || target === 'stage') this.focus = { id: null, mode: target, until: Date.now() + ms };
    else if (this.guests.has(target)) this.focus = { id: target, mode: null, until: Date.now() + ms };
  }

  /** Người vừa gõ quẩy: quay cận người đó (ngoại lệ của luật "không quay cận khách lẻ"; useGame lo lúc nào được quay) */
  spotlightDancer(id: string, ms = 5000) {
    if (!this.guests.has(id) || this.couple.mode === 'gate') return false;
    this.focus = { id, mode: null, until: Date.now() + ms, close: true };
    this.camCut = true; // cắt cảnh thẳng vào mặt, không bay ngang cả sảnh
    return true;
  }

  /** Zoom vào 1 điểm (1 bàn khách) */
  lookPoint(_p: V3, _ms = 6000) {
    // đã bỏ quay cận từng bàn (chủ kênh chốt): giữ hàm cho chỗ gọi cũ, không làm gì
  }

  /** 2 khách thật để MC mai mối: ưu tiên 2 người cùng bàn. Trả kèm chỗ để zoom camera. */
  pickPair(): { a: string; b: string; at: V3 } | null {
    const idle = [...this.guests.values()].filter((g) => g.real && !g.role && !g.busy && !g.path.length);
    if (idle.length < 2) return null;
    const byTable = new Map<number, Guest[]>();
    for (const g of idle) if (g.seat) byTable.set(g.seat.table, [...(byTable.get(g.seat.table) ?? []), g]);
    const tables = [...byTable.entries()].filter(([, l]) => l.length >= 2);
    let a: Guest, b: Guest, at: V3;
    if (tables.length) {
      const [t, list] = tables[Math.floor(Math.random() * tables.length)];
      [a, b] = list.sort(() => Math.random() - 0.5);
      at = v(TABLES[t].x, 0, TABLES[t].z);
    } else {
      [a, b] = idle.sort(() => Math.random() - 0.5);
      at = a.c.root.position.clone().add(b.c.root.position).multiplyScalar(0.5);
    }
    return { a: a.id, b: b.id, at };
  }

  /** 2 người được gọi tên đứng dậy hò reo, tim bay */
  cheerPair(a: string, b: string, ms = 6000) {
    for (const id of [a, b]) {
      this.act(id, 'cheer', ms);
      this.heartsAt(id, 24);
    }
  }

  setBaseCamera(mode: CamMode) {
    this.base = mode;
  }

  private updateCamera(dt: number) {
    const now = Date.now();
    let mode: CamMode | null = this.base;
    let gid: string | null = null;
    let point: V3 | null = null;
    if (now < this.focus.until) {
      mode = this.focus.mode;
      gid = this.focus.id;
      point = this.focus.point ?? null;
    }
    const pos = v(0, 0, 0);
    const look = v(0, 0, 0);
    const g = gid ? this.guests.get(gid) : null;
    const mc = this.mcM.root.position;
    if (this.car?.visible && now < this.carCamUntil) {
      // động phòng: máy quay chếch sau bên phải, bám theo xe hoa
      const c = this.car.position;
      // ra khỏi cổng thì máy quay đứng lại nhìn xe khuất sau cổng hoa (không bay theo ra ngoài trời tối)
      pos.set(c.x + 3.2, 3.6, Math.min(c.z + 6.5, GATE_Z - 3));
      look.set(c.x, 0.8, Math.min(c.z, GATE_Z + 2));
    } else if (this.sing.on) {
      // MC hát: máy quay trước mặt, hơi thấp, nhích chậm
      pos.set(mc.x + Math.sin(this.t * 0.3) * 0.8, mc.y + 2.2, mc.z + 6.5);
      look.set(mc.x, mc.y + 1.3, mc.z);
    } else if (point) {
      // zoom vào bàn: hơi chếch, xoay nhẹ cho có cảm giác máy quay
      // cao hơn + nhìn chúc xuống để cả bàn và bảng tên nằm dưới phần chữ phía trên
      pos.set(point.x * 0.8 + Math.sin(this.t * 0.5) * 0.8, 6, point.z + 6.2);
      look.set(point.x, 0.2, point.z - 1);
    } else if (g && this.focus.close) {
      // quay cận người gõ quẩy: đứng trước mặt người đó (theo hướng đang quay mặt, kể cả lúc đi ra sàn), lắc nhẹ theo nhạc
      const p = g.c.root.position;
      const ry = g.c.root.rotation.y;
      const sway = Math.sin(this.t * 0.8) * 0.6;
      pos.set(p.x + Math.sin(ry) * 3.2 + Math.cos(ry) * sway, p.y + 1.9, p.z + Math.cos(ry) * 3.2 - Math.sin(ry) * sway);
      look.set(p.x, p.y + 1.0, p.z);
    } else if (g) {
      const p = g.c.root.position;
      pos.set(p.x * 0.85, p.y + 2.6, p.z + 4.8);
      look.set(p.x, p.y + 0.85, p.z);
    } else if (mode === 'gate') {
      // đứng phía sân khấu nhìn ra cổng hoa: thấy mặt 2 người
      pos.set(Math.sin(this.t * 0.3) * 0.5, 3.2, GATE_Z - 7.5);
      look.set(0, 0.8, GATE_Z - 1.6);
    } else if (mode === 'aisle') {
      const m = this.coupleMid() ?? v(0, 0, 0);
      // lùi trước mặt cặp đôi như quay phim đám cưới thật
      pos.set(m.x + 1.2, m.y + 2.8, m.z - 6.5);
      look.set(m.x, m.y + 0.8, m.z + 0.5);
    } else if (mode === 'stage') {
      const m = this.couple.mode === 'stage' ? this.coupleMid() : null;
      // cô dâu chú rể trên sân khấu: đổi góc mỗi 7 giây (toàn sân khấu, cận cạnh bục trái, cận chính diện, cận cạnh bục phải)
      const seg = m ? Math.floor(this.t / 7) % 4 : 0;
      if (m && seg === 1) {
        pos.set(-3.6, m.y + 1.7, m.z + 2.6);
        look.set(m.x, m.y + 1.1, m.z);
      } else if (m && seg === 2) {
        pos.set(m.x + Math.sin(this.t * 0.4) * 0.5, m.y + 1.9, m.z + 4);
        look.set(m.x, m.y + 1.1, m.z);
      } else if (m && seg === 3) {
        pos.set(3.6, m.y + 1.7, m.z + 2.6);
        look.set(m.x, m.y + 1.1, m.z);
      } else {
        pos.set(Math.sin(this.t * 0.25) * 1.2, STAGE_Y + 3.2, STAGE_Z + 8.5);
        look.set(0, STAGE_Y + 1.3, STAGE_Z);
      }
    } else {
      this.wideShot(now, pos, look);
    }
    // vừa vào / vừa hết cảnh quay cận người gõ quẩy: cắt thẳng (bay qua cả sảnh sẽ lướt qua toàn thảm đỏ)
    const close = now < this.focus.until && !!this.focus.close;
    if (this.camWasClose && !close) this.camCut = true;
    this.camWasClose = close;
    if (this.camCut) {
      this.camCut = false;
      this.camPos.copy(pos);
      this.camLook.copy(look);
    }
    const k = 1 - Math.exp(-dt * 2.2);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  /** Cảnh toàn lúc rảnh: đổi kiểu máy quay mỗi 9–14 giây (toàn cảnh, bay vòng trên cao, zoom vào/ra, cần cẩu, nhìn từ trên xuống) */
  private wideShot(now: number, pos: V3, look: V3) {
    const sh = this.shot;
    if (now > sh.until) {
      // toàn cảnh, bay vòng, zoom từ cổng vào bục lễ, zoom lùi ra: góc nào cũng thấy lễ đường trên sân khấu
      // (bỏ kiểu cần cẩu số 4 lướt sát bàn và kiểu số 5 nhìn thẳng từ trên xuống)
      const kinds = [0, 1, 2, 2, 3].filter((k) => k !== sh.kind);
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      this.shot = { kind, t0: this.t, until: now + 9000 + Math.random() * 5000, dir: Math.random() < 0.5 ? 1 : -1 };
    }
    const { kind, t0, until, dir } = this.shot;
    const dur = Math.max(1, (until - now) / 1000 + (this.t - t0));
    const u = Math.min(1, (this.t - t0) / dur);
    const e = u * u * (3 - 2 * u); // nhanh dần rồi chậm dần
    const lerp = (a: number, b: number) => a + (b - a) * e;
    switch (kind) {
      case 1: {
        // bay vòng ngang phía trên sảnh, luôn nhìn về sân khấu (thấy lễ đường)
        const a = dir * (-0.9 + 1.8 * u);
        pos.set(Math.sin(a) * 14, 10, -8 + Math.cos(a) * 17);
        look.set(0, 1, -16);
        break;
      }
      case 2: // zoom từ cổng vào tới sân khấu
        pos.set(dir * lerp(0, 1.5), lerp(10.5, 5.5), lerp(12.5, -6));
        look.set(0, lerp(0, 1.5), lerp(-15, -21));
        break;
      case 3: // zoom từ sân khấu lùi ra toàn sảnh
        pos.set(dir * lerp(1.5, 0), lerp(5.5, 11), lerp(-6, 13));
        look.set(0, lerp(1.5, 0), lerp(-21, -14));
        break;
      case 4: // cần cẩu bên hông: thấp lướt qua bàn rồi nâng lên cao
        pos.set(dir * 10, lerp(3.2, 9.5), lerp(4, -4));
        look.set(0, 0.6, -9);
        break;
      case 5: // từ trên xuống, xoay chậm
        pos.set(Math.sin(this.t * 0.15) * 3 * dir, 18, -3);
        look.set(0, 0, -7.5);
        break;
      default:
        pos.set(Math.sin(this.t * 0.08) * 1.8, 10.5, 12.5);
        look.set(0, 0, -15);
    }
  }

  private coupleMid() {
    const a = this.couple.groom ? this.guests.get(this.couple.groom) : null;
    const b = this.couple.bride ? this.guests.get(this.couple.bride) : null;
    if (a && b) return a.c.root.position.clone().add(b.c.root.position).multiplyScalar(0.5);
    return (a ?? b)?.c.root.position.clone() ?? null;
  }

  // ---------- lễ cưới ----------
  get coupleIds() {
    return { ...this.couple };
  }

  private gateSpot(role: 'groom' | 'bride') {
    return v(role === 'groom' ? -0.65 : 0.65, 0, GATE_Z - 1.6);
  }

  private walkTo(g: Guest, path: V3[], face: number, speed = 2.2) {
    g.path = path;
    g.face = face;
    g.speed = speed;
  }

  /** Cầu hôn: người gõ ra cổng hoa quỳ chờ; người kia (nếu đang trong tiệc) ra đứng đối diện */
  proposal(proposer: string, proposerRole: 'groom' | 'bride', target: string | null) {
    this.clearStage();
    const a = this.guests.get(proposer);
    if (!a) return;
    this.couple = { groom: null, bride: null, mode: 'gate' };
    this.couple[proposerRole] = proposer;
    a.role = proposerRole;
    this.walkTo(a, [v(a.c.root.position.x * 0.3, 0, a.c.root.position.z), this.gateSpot(proposerRole)], proposerRole === 'groom' ? Math.PI / 2 : -Math.PI / 2, 3);
    a.action = { pose: 'kneel', until: Date.now() + 60_000 };
    a.c.hold('ring');
    a.hold = { what: 'ring', until: Date.now() + 60_000 };
    if (target) this.targetCome(target, proposerRole === 'groom' ? 'bride' : 'groom');
    this.base = 'gate';
  }

  /** người được hỏi bước ra cổng hoa */
  targetCome(id: string, role: 'groom' | 'bride') {
    const b = this.guests.get(id);
    if (!b || b.role) return;
    this.couple[role] = id;
    b.role = role;
    this.walkTo(b, [v(b.c.root.position.x * 0.3, 0, b.c.root.position.z), this.gateSpot(role)], role === 'groom' ? Math.PI / 2 : -Math.PI / 2, 3);
  }

  /**
   * Đồng ý: đứng dậy, tim bay. Thay đồ (`dressCouple`) và đi thảm đỏ (`startWalk`) do useGame gọi đúng lúc
   * MC bắt đầu đọc câu tương ứng, để lời nói khớp hình.
   */
  accept(set: WeddingSet) {
    this.pendingSet = set;
    for (const id of [this.couple.groom, this.couple.bride]) {
      const g = id ? this.guests.get(id) : null;
      if (!g) continue;
      g.action = null;
      g.hold = null;
      g.c.hold(null);
    }
    this.hearts.burst(this.gateSpot('groom').add(v(0.65, 1.4, 0)), 40, ['#ff4d6d', '#ff8fab', '#ffffff'], 2.5, -1);
  }

  private pendingSet: WeddingSet | null = null;

  dressCouple() {
    const set = this.pendingSet;
    if (!set) return;
    this.pendingSet = null;
    for (const id of [this.couple.groom, this.couple.bride]) {
      const g = id ? this.guests.get(id) : null;
      if (g) this.dress(g, set);
    }
  }

  startWalk() {
    if (this.couple.mode !== 'gate') return;
    this.dressCouple(); // phòng câu thay đồ bị bỏ
    this.walkAisle();
  }

  private dress(g: Guest, set: WeddingSet) {
    if (!g.role) return;
    g.wedding = weddingLook(g.baseLook, g.role === 'groom' ? set.groom : set.bride);
    g.c.setLook(g.wedding);
    this.poof(g.c.root.position, 50);
  }

  private walkAisle() {
    this.couple.mode = 'walk';
    this.base = 'aisle';
    for (const role of ['groom', 'bride'] as const) {
      const id = this.couple[role];
      const g = id ? this.guests.get(id) : null;
      if (!g) continue;
      const x = role === 'groom' ? -0.38 : 0.38;
      this.walkTo(g, [v(x, 0, GATE_Z - 2), v(x, 0, STAGE_FRONT + 0.8), v(x, 0.3, STAGE_FRONT + 0.3), v(x, STAGE_Y, STAGE_FRONT - 0.4), v(x * 1.4, STAGE_Y, STAGE_Z)], 0, 1.5);
    }
  }

  /** Cướp: người mới chạy tới thế chỗ, người cũ bị hất ngã rồi khóc về chỗ */
  steal(oldId: string, newId: string) {
    const o = this.guests.get(oldId);
    const n = this.guests.get(newId);
    if (!o || !n || !o.role) return;
    const role = o.role;
    if (n.role) return;
    this.couple[role] = newId;
    n.role = role;
    if (o.wedding) {
      n.wedding = { ...o.wedding, skin: n.baseLook.skin, hair: n.baseLook.hair };
      n.c.setLook(n.wedding);
    }
    // người mới chạy thật nhanh tới chỗ người cũ, rồi đi tiếp đúng đường người cũ đang đi
    n.path = [o.c.root.position.clone(), ...o.path.map((p) => p.clone())];
    n.face = o.face;
    n.speed = 6;
    if (o.action?.pose === 'kneel') {
      n.action = { ...o.action };
      n.hold = o.hold;
      if (o.hold) n.c.hold(o.hold.what);
    }
    setTimeout(() => (n.speed = this.couple.mode === 'walk' ? 1.5 : 3), 1800);
    // người cũ: văng ra, ngã, khóc, về chỗ (đồ cưới bị lột)
    o.role = null;
    o.path = [];
    o.hold = null;
    o.c.hold(null);
    o.action = { pose: 'fall', until: Date.now() + 2200 };
    o.c.root.position.x += role === 'groom' ? -1.4 : 1.4;
    o.bubble = { cv: bubble('😭 Trả người yêu đây!'), until: Date.now() + 6000 };
    setTimeout(() => {
      if (o.role) return;
      o.wedding = null;
      o.c.setLook(o.baseLook);
      o.action = { pose: 'cry', until: Date.now() + 2500 };
      setTimeout(() => !o.role && this.goHome(o), 2500);
    }, 2200);
    this.look('aisle', 4000);
  }

  /** Từ chối / hết giờ: người cầu hôn khóc về chỗ */
  reject() {
    const ids = [this.couple.groom, this.couple.bride];
    this.couple = { groom: null, bride: null, mode: 'none' };
    this.base = 'wide';
    for (const id of ids) {
      const g = id ? this.guests.get(id) : null;
      if (!g) continue;
      g.role = null;
      g.hold = null;
      g.c.hold(null);
      g.action = { pose: 'cry', until: Date.now() + 3000 };
      setTimeout(() => !g.role && this.goHome(g), 3000);
    }
  }

  ringExchange() {
    const m = this.coupleMid();
    if (!m) return;
    this.ring.visible = true;
    this.ringAnim = { from: this.mcM.root.position.clone().add(v(0.3, 1.2, 0)), to: m.clone().add(v(0, 1.0, 0.3)), t0: this.t };
  }

  /** cô dâu chú rể ôm nhau, tim bay */
  hug(ms = 5000) {
    for (const id of [this.couple.groom, this.couple.bride]) {
      const g = id ? this.guests.get(id) : null;
      if (!g) continue;
      g.action = { pose: 'hug', until: Date.now() + ms };
      g.c.root.position.x *= 0.55;
    }
    const m = this.coupleMid();
    if (m) this.hearts.burst(m.add(v(0, 1.4, 0)), 60, ['#ff4d6d', '#ff8fab', '#ffffff'], 2.5, -1);
  }

  /**
   * Quay người chuẩn bị bái: 'heaven' quay ra cổng lạy trời đất, 'parents' quay vào ba mẹ phía sau sân khấu,
   * 'each' quay mặt vào nhau. Chắp tay đứng chờ tới khi MC hô "Bái!" (`bowNow`).
   */
  bowFace(kind: 'heaven' | 'parents' | 'each') {
    for (const role of ['groom', 'bride'] as const) {
      const id = this.couple[role];
      const g = id ? this.guests.get(id) : null;
      if (!g) continue;
      g.face = kind === 'heaven' ? 0 : kind === 'parents' ? Math.PI : role === 'groom' ? Math.PI / 2 : -Math.PI / 2;
      g.action = { pose: 'bow', until: Date.now() + 20_000 };
    }
  }

  /** MC hô "Bái!": cả hai cúi xuống 1 cái cùng lúc */
  bowNow() {
    for (const id of [this.couple.groom, this.couple.bride]) {
      const g = id ? this.guests.get(id) : null;
      if (!g) continue;
      if (g.action?.pose !== 'bow') g.action = { pose: 'bow', until: Date.now() + 20_000 };
      g.c.bowStart = this.t;
    }
    const m = this.coupleMid();
    if (m) this.hearts.burst(m.add(v(0, 1.6, 0)), 24, ['#ff4d6d', '#ffd166', '#ffffff'], 1.8, -1);
  }

  /**
   * Ba mẹ hai bên đứng sau sân khấu cho "nhị bái cao đường".
   * `real` = [người xem làm phụ huynh nhà trai, nhà gái] (tặng quà chúc phúc cao nhất): đi lên sân khấu đứng thật;
   * ô nào trống thì dùng ông bà tóc bạc của chương trình.
   */
  showParents(real: [string | null, string | null] = [null, null]) {
    const looks: [string, string, Partial<Look>][] = [
      ['ev-pa1', 'Ba mẹ chú rể', { age: 'old', body: 'suit', main: '#3a2a20', hair: '#d9d9d9', longHair: false, hat: 'none' }],
      ['ev-pa2', 'Ba mẹ cô dâu', { age: 'old', body: 'aodaiF', main: '#7b2d3b', hair: '#d9d9d9', longHair: true, hairStyle: 'bun', hat: 'none' }],
    ];
    looks.forEach(([id, name, look], i) => {
      const spot = v(i ? 1.3 : -1.3, STAGE_Y, STAGE_Z - 2.4);
      const r = real[i] ? this.guests.get(real[i]!) : null;
      if (r && !r.role) {
        r.busy = true;
        r.action = null;
        const p = r.c.root.position;
        r.path = [v(p.x, 0, TABLES[r.seat?.table ?? 0].z + 2.2), v(0, 0, -14.4), v(0, 0, STAGE_FRONT + 0.8), v(0, STAGE_Y, STAGE_FRONT - 0.4), spot];
        r.speed = 5;
        r.face = 0;
        this.stageParents.push(r.id);
        return;
      }
      if (this.guests.has(id)) return;
      const g = this.makeGuest(id, name, true, { ...guestLook(id), ...look });
      g.busy = true;
      g.c.root.position.copy(spot);
      g.face = 0;
      this.guests.set(id, g);
    });
  }

  hideParents() {
    this.remove('ev-pa1');
    this.remove('ev-pa2');
    for (const id of this.stageParents) {
      const g = this.guests.get(id);
      if (!g) continue;
      g.busy = false;
      this.goHome(g);
    }
    this.stageParents = [];
  }

  private stageParents: string[] = [];

  /** nhân vật nữ hay nam (theo tóc dài) — để gọi "ba" hay "mẹ" */
  isFem(id: string) {
    return !!this.guests.get(id)?.c.look.longHair;
  }

  /**
   * Đưa vào động phòng: xe hoa chạy theo thảm đỏ vào tới trước sân khấu, cô dâu chú rể xuống lên xe,
   * xe phóng ra cổng. Xong thì 2 người hiện lại ở cổng rồi về chỗ, gọi `done`.
   */
  dongPhong(done: () => void) {
    this.hideParents();
    this.weddingCar();
    const car = this.car!;
    car.position.set(0, 0, GATE_Z + 9);
    const stop = v(0, 0, STAGE_FRONT + 2.8);
    this.carPath = [v(0, 0, GATE_Z - 1), stop];
    this.carParked = true;
    this.carCamUntil = Date.now() + 40_000;
    const ids = [this.couple.groom, this.couple.bride].filter((x): x is string => !!x);
    const couple = ids.map((id) => this.guests.get(id)).filter((g): g is Guest => !!g);
    this.carOnArrive = () => {
      let boarded = 0;
      for (const g of couple) {
        const x = g.c.root.position.x < 0 ? -0.4 : 0.4;
        g.action = null;
        g.path = [v(x, STAGE_Y, STAGE_FRONT - 0.4), v(x, 0, STAGE_FRONT + 0.8), v(x * 1.5, 0, stop.z - 0.2)];
        g.speed = 2.2;
        g.onArrive = () => {
          g.c.root.visible = false;
          g.shadow.visible = false;
          if (++boarded < couple.length) return;
          this.hearts.burst(car.position.clone().add(v(0, 1.6, 0)), 60, ['#ff4d6d', '#ff8fab', '#ffffff'], 2.5, -1);
          setTimeout(() => {
            this.carParked = false;
            this.carPath = [v(0, 0, GATE_Z + 2), v(0, 0, GATE_Z + 24)];
            this.cannons(80);
            this.confetti(160);
          }, 900);
          setTimeout(() => {
            this.carCamUntil = 0;
            couple.forEach((g, i) => {
              g.c.root.position.set(i ? 0.7 : -0.7, 0, GATE_Z + 2);
              g.c.root.visible = true;
              g.shadow.visible = true;
              g.role = null;
              this.goHome(g);
            });
            this.couple = { groom: null, bride: null, mode: 'none' };
            this.base = 'wide';
            done();
          }, 7000);
        };
      }
      if (!couple.length) {
        this.carParked = false;
        this.carCamUntil = 0;
        done();
      }
    };
  }

  /** Cặp đôi đứng vẫy tay trên sân khấu tới khi có đám mới */
  wave(ms = 8000) {
    for (const id of [this.couple.groom, this.couple.bride]) if (id) this.act(id, 'wave', ms);
  }

  /** Đám cũ xuống sân khấu về chỗ (vẫn mặc đồ cưới) */
  clearStage() {
    for (const id of [this.couple.groom, this.couple.bride]) {
      const g = id ? this.guests.get(id) : null;
      if (!g) continue;
      g.role = null;
      g.action = null;
      this.goHome(g);
    }
    this.couple = { groom: null, bride: null, mode: 'none' };
    this.base = 'wide';
  }

  setNames(groom: string, bride: string) {
    this.hall.setNames(groom, bride);
  }

  setSpeaker(who: 'M' | 'F' | null) {
    this.speaker = who;
  }

  // ---------- hiệu ứng ----------
  confetti(n = 200) {
    for (let i = 0; i < n; i++)
      this.fx.add(v((Math.random() - 0.5) * 22, 7 + Math.random() * 4, -22 + Math.random() * 30), v(0, -1.2, 0), randColor(), 7, 0.7);
  }

  petals(n = 200) {
    for (let i = 0; i < n; i++)
      this.fx.add(v((Math.random() - 0.5) * 22, 7 + Math.random() * 4, -22 + Math.random() * 30), v(0, -0.8, 0), Math.random() < 0.6 ? '#ff8fab' : '#ffffff', 9, 1.2);
  }

  goldRain(n = 300) {
    for (let i = 0; i < n; i++)
      this.fx.add(v((Math.random() - 0.5) * 22, 7 + Math.random() * 5, -24 + Math.random() * 32), v(0, -2, 0), Math.random() < 0.7 ? '#ffd166' : '#fff3b0', 6, 0.3);
  }

  fireworks(n = 4) {
    for (let k = 0; k < n; k++)
      setTimeout(() => {
        const at = v((Math.random() - 0.5) * 12, 6 + Math.random() * 2.5, -24 + Math.random() * 10);
        const c = randColor();
        this.fx.burst(at, 90, [c, '#ffffff', c], 4.5, 3);
      }, k * 450);
  }

  heartsAt(id: string, n = 20) {
    const g = this.guests.get(id);
    if (g) this.hearts.burst(g.c.root.position.clone().add(v(0, 1.4, 0)), n, ['#ff4d6d', '#ff8fab'], 1.8, -1);
  }

  heartsRain(n = 80) {
    for (let i = 0; i < n; i++)
      this.hearts.add(v((Math.random() - 0.5) * 20, 7 + Math.random() * 3, -20 + Math.random() * 26), v(0, -1, 0), Math.random() < 0.5 ? '#ff4d6d' : '#ff8fab', 7, 0.5);
  }

  /** pháo giấy bắn từ 2 góc sân khấu lên trời rồi rơi xuống */
  cannons(n = 140) {
    for (const sx of [-1, 1]) {
      const at = v(sx * 7, STAGE_Y + 0.3, STAGE_FRONT - 0.6);
      for (let k = 0; k < n; k++) {
        const c = ['#ffffff', '#dfe3ea', '#ff8fab', '#ff4d6d', '#ffc2d1', '#bde0fe'][k % 6];
        this.fx.add(at, v(-sx * (0.5 + Math.random() * 2.5), 7 + Math.random() * 4, 1 + Math.random() * 4), c, 7, 0.9, 3.2);
      }
    }
    this.lastCannon = this.t;
  }

  /** Nguyệt Lão hiện / ẩn trên sân khấu */
  nguyetLao(on: boolean) {
    this.nguyetOn = on;
    this.nguyet.root.visible = on;
    this.poof(this.nguyet.root.position, 60);
    if (on) this.smokeBurst(18);
  }

  /** sợi tơ hồng võng giữa 2 người trong `ms` */
  redThread(a: string, b: string, ms = 25000) {
    if (this.thread?.mesh) this.scene.remove(this.thread.mesh);
    this.thread = { a, b, until: Date.now() + ms, mesh: null };
  }

  posOf(id: string) {
    return this.guests.get(id)?.c.root.position.clone() ?? null;
  }

  /** pháo sáng phun tia lửa ở mép sân khấu trong `ms` */
  fountains(ms = 5000) {
    this.fountainUntil = Math.max(this.fountainUntil, Date.now() + ms);
  }

  /** khói sân khấu (đá khô). where: 'stage' | 'aisle' | 'hall' */
  smokeBurst(n = 12, where: 'stage' | 'aisle' | 'hall' = 'stage') {
    for (let i = 0; i < n; i++) {
      const at =
        where === 'stage'
          ? v((Math.random() - 0.5) * 14, STAGE_Y + 0.2, STAGE_FRONT - Math.random() * 4)
          : where === 'aisle'
            ? v((Math.random() - 0.5) * 2.5, 0.2, GATE_Z - Math.random() * (GATE_Z - STAGE_FRONT))
            : v((Math.random() - 0.5) * 20, 0.2, -18 + Math.random() * 24);
      this.smoke.emit(at);
    }
  }

  /** quà bay: tim + kim tuyến bay từ người tặng lên sân khấu */
  giftTrail(id: string, n = 50) {
    const g = this.guests.get(id);
    if (!g) return;
    const from = g.c.root.position.clone().add(v(0, 1.6, 0));
    const to = v(0, STAGE_Y + 2.2, STAGE_Z + 1);
    for (let i = 0; i < n; i++) {
      const T = 1.4 + Math.random() * 0.8;
      const vel = to.clone().sub(from).multiplyScalar(1 / T).add(v((Math.random() - 0.5) * 0.8, 1.5, (Math.random() - 0.5) * 0.8));
      const c = ['#ff4d6d', '#ff8fab', '#ffffff', '#ffd166'][i % 4];
      if (i % 2) this.hearts.add(from, vel, c, T);
      else this.fx.add(from, vel, c, T);
    }
  }

  private poof(at: V3, n: number) {
    this.fx.burst(at.clone().add(v(0, 0.8, 0)), n, ['#ffffff', '#ffe5ec', '#ffd166'], 2.2, 0);
  }

  /** cả sảnh đứng dậy nhảy, đèn đổi màu, đội nhảy ra sân */
  partyAll(ms = 10000) {
    this.partyUntil = Date.now() + ms;
    this.dance(ms);
  }

  /** Mưa cánh hồng đỏ / hồng phấn lả tả khắp sảnh */
  roseRain(n = 260) {
    for (let i = 0; i < n; i++)
      this.roses.add(v((Math.random() - 0.5) * 24, 8 + Math.random() * 4, -24 + Math.random() * 32), v(0, -0.7, 0), ['#d90429', '#ff4d6d', '#c9184a', '#ff8fab', '#ffccd5'][i % 5], 12, 1.1);
  }

  /** Bóng bay bay lên từ sàn */
  balloonsUp(n = 24) {
    let k = 0;
    for (const b of this.balloons) {
      if (k >= n) break;
      if (b.life > 0) continue;
      b.m.visible = true;
      b.m.position.set((Math.random() - 0.5) * 22, 0.5, -20 + Math.random() * 26);
      b.vy = 1 + Math.random() * 0.8;
      b.life = 11;
      k++;
    }
  }

  /** Màn quẩy DJ: khách thật + dàn khách quen + bớt khách đệm kéo hết lên sân khấu và sàn trước sân khấu nhảy */
  djParty(ms = 25000) {
    const now = Date.now();
    this.djUntil = Math.max(this.djUntil, now + ms);
    this.partyAll(ms);
    if (this.djCrew.length) return;
    const real = [...this.guests.values()].filter((g) => !g.role && !g.busy && !g.id.startsWith('ev-'));
    const npc = this.npcs.filter((g) => !g.busy).sort(() => Math.random() - 0.5).slice(0, Math.max(0, Math.round(46 * this.quality) - real.length));
    const spots: V3[] = [];
    for (let z = STAGE_Z + 1.2; z >= STAGE_Z - 2.2; z -= 1.1) for (let x = -6.6; x <= 6.6; x += 1.1) if (Math.abs(x) > 1.2 || z < STAGE_Z - 0.5) spots.push(v(x, STAGE_Y, z));
    for (let z = -14.8; z >= -18.6; z -= 1.1) for (let x = -10; x <= 10; x += 1.1) if (Math.abs(x) > 1.4) spots.push(v(x, 0, z));
    const crew = [...real, ...npc].slice(0, spots.length);
    crew.forEach((g, i) => {
      const spot = spots[i].clone().add(v((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3));
      const p = g.c.root.position;
      const lane = TABLES[g.seat?.table ?? 0].z + 2.2;
      g.busy = true;
      // ra lối giữa 2 hàng bàn, men theo mép thảm đỏ xuống sàn trước sân khấu (không cắt chéo qua bàn)
      const ax = (spot.x < 0 ? -1 : 1) * (AISLE_HALF + 0.5);
      const base = [v(p.x, 0, lane), v(ax, 0, lane), v(ax, 0, -14.4)];
      g.path =
        spot.y > 0
          ? [...base, v(spot.x, 0, -14.4), v(spot.x, 0, STAGE_FRONT + 0.7), v(spot.x, STAGE_Y, STAGE_FRONT - 0.3), spot]
          : [...base, v(spot.x, 0, -14.4), spot];
      g.speed = 3.2 + Math.random();
      g.face = 0;
      g.onArrive = () => (g.action = { pose: (['dance', 'dance', 'jump', 'spin', 'dance'] as Pose[])[Math.floor(Math.random() * 5)], until: this.djUntil });
    });
    this.djCrew = crew;
    this.roseRain(200);
    this.balloonsUp(20);
  }

  get djOn() {
    return Date.now() < this.djUntil;
  }

  /** Xe hoa rước dâu: chạy ngang trước dãy bàn đầu, rồi vòng qua sàn trước sân khấu */
  weddingCar() {
    // xe hoa đang đón cô dâu chú rể về động phòng: không chạy vòng trang trí đè lên
    if (this.carParked || Date.now() < this.carCamUntil) return;
    if (!this.car) {
      const c = new THREE.Group();
      const m = (g: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => {
        const me = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
        me.position.set(x, y, z);
        c.add(me);
        return me;
      };
      m(new THREE.BoxGeometry(2.8, 0.55, 1.3), '#ffffff', 0, 0.55, 0);
      m(new THREE.BoxGeometry(1.5, 0.5, 1.15), '#f4f6fb', -0.2, 1.05, 0);
      m(new THREE.BoxGeometry(1.4, 0.38, 1.18), '#9ec9ff', -0.2, 1.06, 0);
      const wheel = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 14);
      for (const [x, z] of [[-0.9, 0.62], [0.9, 0.62], [-0.9, -0.62], [0.9, -0.62]]) m(wheel, '#1a1a1a', x, 0.28, z).rotation.x = Math.PI / 2;
      const bloom = new THREE.SphereGeometry(0.16, 8, 6);
      for (let i = 0; i < 9; i++) m(bloom, ['#ff4d6d', '#ffffff', '#ffc2d1'][i % 3], 0.9 + (i % 3) * 0.12, 0.9, -0.35 + Math.floor(i / 3) * 0.35);
      m(new THREE.BoxGeometry(0.05, 0.05, 1.32), '#ff4d9d', 1.1, 0.83, 0);
      this.scene.add(c);
      this.car = c;
    }
    this.car.visible = true;
    this.car.position.set(-16, 0, 8.4);
    this.carPath = [v(16, 0, 8.4), v(16.5, 0, -15.6), v(-16, 0, -15.6)];
    this.cannons(80);
  }

  /** Nhân vật của sự kiện (mẹ chồng, người yêu cũ): đi từ cổng lên sân khấu tới cạnh cặp đôi, làm trò rồi bỏ về */
  visit(id: string, name: string, look: Partial<Look>, pose: Pose, stayMs: number, say: string) {
    if (this.guests.has(id)) return;
    const mid = this.coupleMid() ?? v(0, STAGE_Y, STAGE_Z);
    const g = this.makeGuest(id, name, true, { ...guestLook(id), ...look });
    g.busy = true;
    g.c.root.position.set(0, 0, GATE_Z + 3);
    this.guests.set(id, g);
    const to = v(mid.x + 1.1, STAGE_Y, mid.z + 0.5);
    g.path = [v(0, 0, GATE_Z - 1), v(0, 0, STAGE_FRONT + 0.8), v(0, STAGE_Y, STAGE_FRONT - 0.4), to];
    g.speed = 4.5;
    g.face = -Math.PI / 2;
    g.onArrive = () => {
      g.action = { pose, until: Date.now() + stayMs };
      this.say(id, say, stayMs);
      setTimeout(() => {
        g.path = [v(0, STAGE_Y, STAGE_FRONT - 0.4), v(0, 0, STAGE_FRONT + 0.8), v(0, 0, GATE_Z + 4)];
        g.onArrive = () => this.remove(id);
      }, stayMs);
    };
    this.look(id, 5000);
  }

  remove(id: string) {
    const g = this.guests.get(id);
    if (!g) return;
    this.removeGuest(g);
    this.guests.delete(id);
  }

  /** Người xem được "tuyển" làm nhân viên bưng mâm hoặc vũ công trên sân khấu trong `ms`, mặc đồng phục, có danh hiệu */
  hire(id: string, kind: 'waiter' | 'dancer', ms = 90_000) {
    const g = this.guests.get(id);
    if (!g || g.role || g.busy) return false;
    const fem = !!g.c.look.longHair;
    const oldLook = g.c.look;
    g.busy = true;
    if (kind === 'waiter') {
      g.c.setLook({ ...oldLook, body: 'suit', main: '#1a1a1a', pants: '#1a1a1a', accent: '#111111', hat: 'none' });
      g.title = { text: '🍽 Nhân viên bưng mâm', gold: true };
      // đi ra cửa bếp gần nhất rồi bắt đầu chạy bàn
      const side = g.c.root.position.x < 0 ? -1 : 1;
      const lane = TABLES[g.seat?.table ?? 0].z + 2.2;
      g.path = [v(g.c.root.position.x, 0, lane), v(side * 12, 0, lane)];
      g.speed = 2.6;
      this.hired.push(Object.assign(g, { job: 'back' as const, until: Date.now(), oldLook, hireKind: kind }));
    } else {
      g.c.setLook(fem ? { ...oldLook, body: 'shortGown', main: '#ff4d9d', accent: '#e6e9ef', shoes: '#e6e9ef', hat: 'tiara' } : { ...oldLook, body: 'suit', main: '#f2f2f2', pants: '#f2f2f2', accent: '#ff4d6d', hat: 'none' });
      g.title = { text: '💃 Vũ công', gold: true };
      const spot = v((Math.random() < 0.5 ? -1 : 1) * 3.1, STAGE_Y, STAGE_Z - 1.1); // cạnh hàng vũ công, tránh cột hoa
      const p = g.c.root.position;
      const lane = TABLES[g.seat?.table ?? 0].z + 2.2;
      const ax = (spot.x < 0 ? -1 : 1) * (AISLE_HALF + 0.5);
      g.path = [v(p.x, 0, lane), v(ax, 0, lane), v(ax, 0, -14.4), v(spot.x, 0, STAGE_FRONT + 0.7), v(spot.x, STAGE_Y, STAGE_FRONT - 0.3), spot];
      g.speed = 3.2;
      g.face = 0;
      this.hired.push(Object.assign(g, { job: 'rest' as const, until: Infinity, oldLook, hireKind: kind }));
    }
    g.tag = null;
    this.poof(g.c.root.position, 30);
    setTimeout(() => {
      this.hired = this.hired.filter((h) => h !== g);
      if (!this.guests.has(id)) return;
      g.c.hold(null);
      g.c.setLook(g.wedding ?? oldLook);
      g.title = null;
      g.tag = null;
      g.busy = false;
      g.action = null;
      this.goHome(g);
    }, ms);
    return true;
  }

  /** đội nhảy chạy ra trước sân khấu nhảy đều trong `ms` rồi về chỗ */
  dance(ms = 8000) {
    const fresh = Date.now() > this.danceUntil;
    this.danceUntil = Math.max(this.danceUntil, Date.now() + ms);
    if (!fresh) return;
    for (const d of this.dancers) {
      d.g.path = [v(d.g.c.root.position.x, 0, d.spot.z), d.spot.clone()];
      d.g.speed = 3.5;
      d.g.face = 0;
      d.g.c.sync(0);
      // phần lớn nhảy đều, vài người tự ý lộn nhào / xoay / nhảy cao cho phi lý
      const r = Math.random();
      d.g.move = r < 0.55 ? 'dance' : r < 0.7 ? 'flip' : r < 0.85 ? 'spin' : 'jump';
    }
  }

  /** khách gõ QUẨY: ra sàn trước sân khấu nhảy cùng đội nhảy rồi về chỗ */
  joinDance(id: string, ms = 9000) {
    const g = this.guests.get(id);
    if (!g || g.role || g.busy) return;
    g.busy = true;
    const p = g.c.root.position;
    const spot = v((Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random() * 5), 0, -15 - Math.random() * 0.8);
    const lane = TABLES[g.seat?.table ?? 0].z + 2.2;
    const ax = (spot.x < 0 ? -1 : 1) * (AISLE_HALF + 0.5);
    g.path = [v(p.x, 0, lane), v(ax, 0, lane), v(ax, 0, -14.4), v(spot.x, 0, -14.6), spot];
    g.speed = 3;
    g.face = 0;
    g.onArrive = () => {
      g.action = { pose: (['dance', 'spin', 'jump', 'dance'] as Pose[])[Math.floor(Math.random() * 4)], until: Date.now() + ms };
      setTimeout(() => {
        g.busy = false;
        this.goHome(g);
      }, ms);
    };
    this.dance(ms);
  }

  /** gõ ĐẤM / TRÊU @tên: chạy tới người kia, đấm (hoặc chọc), rồi về chỗ */
  attack(aId: string, bId: string, kind: 'punch' | 'poke') {
    const a = this.guests.get(aId);
    const b = this.guests.get(bId);
    if (!a || !b || a === b || a.role || b.role || a.busy) return false;
    a.busy = true;
    const bp = b.c.root.position;
    const side = bp.x > a.c.root.position.x ? -1 : 1;
    const at = v(bp.x + side * 0.55, bp.y, bp.z + 0.1);
    const p = a.c.root.position;
    a.path = [v(p.x, 0, TABLES[a.seat?.table ?? 0].z + 2.2), v(at.x, 0, TABLES[b.seat?.table ?? 0].z + 2.2), at];
    a.speed = 4;
    a.face = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    a.onArrive = () => {
      const until = Date.now() + 2600;
      a.c.lean = -side;
      b.c.lean = side;
      a.action = { pose: kind, until };
      b.action = { pose: kind === 'punch' ? 'hit' : 'laugh', until };
      if (kind === 'punch') setTimeout(() => this.fx.burst(bp.clone().add(v(0, 1.5, 0)), 18, ['#ffd166', '#ffffff', '#ffe066'], 2, 2), 400);
      this.say(b.id, kind === 'punch' ? ['😵 Ui da!', '🤕 Đánh thật hả!', '😭 Mách mẹ!'][Math.floor(Math.random() * 3)] : ['🤣 Nhột!', '😆 Thôi đi mà!'][Math.floor(Math.random() * 2)], 3000);
      setTimeout(() => {
        a.busy = false;
        this.goHome(a);
      }, 2600);
    };
    return true;
  }

  /** người tặng quà lên sân khấu đóng vai Nguyệt Lão (râu bạc áo đỏ); null = trả lại vai cho Nguyệt Lão có sẵn */
  matchmaker(id: string | null) {
    for (const g of this.guests.values())
      if (g.busy && g.c.look.beard) {
        g.c.setLook(g.wedding ?? g.baseLook);
        g.busy = false;
        this.goHome(g);
      }
    if (!id) return;
    const g = this.guests.get(id);
    if (!g || g.role) return;
    g.busy = true;
    this.nguyet.root.visible = false;
    g.c.setLook({ ...g.baseLook, body: 'aodaiM', main: '#c8102e', pants: '#fff1e0', accent: '#f6c453', hair: '#f4f4f4', longHair: false, hat: 'khanXep', beard: true });
    this.poof(g.c.root.position, 60);
    const p = g.c.root.position;
    g.path = [v(p.x, 0, TABLES[g.seat?.table ?? 0].z + 2.2), v(0, 0, -14.4), v(0, 0, STAGE_FRONT + 0.8), v(0, STAGE_Y, STAGE_FRONT - 0.4), v(0, STAGE_Y, STAGE_Z - 1.2)];
    g.speed = 4;
    g.face = 0;
    g.onArrive = () => (g.action = { pose: 'wave', until: Date.now() + 60_000 });
    this.look(id, 4000);
  }

  /** trêu nhau ở bàn: 2 người ngồi cạnh nhau chọc / đấm / cười (hài, không máu me) */
  private antic() {
    const all = [...this.guests.values(), ...this.npcs].filter((g) => !g.role && !g.busy && !g.path.length && !g.action && g.seat);
    if (all.length < 2) return;
    const a = all[Math.floor(Math.random() * all.length)];
    const i = SEATS.indexOf(a.seat!);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const per = 10; // ghế mỗi bàn
    const j = a.seat!.table * per + ((i % per) + dir + per) % per;
    const bid = SEATS[j]?.taken;
    const b = bid ? this.guests.get(bid) ?? this.npcs.find((n) => n.id === bid) : null;
    if (!b || b.role || b.path.length || b.action) return;
    const until = Date.now() + 2600;
    a.c.lean = dir;
    b.c.lean = -dir;
    const r = Math.random();
    // không còn đấm nhau (chủ kênh chốt): chỉ chọc cười, cười với nhau
    if (r < 0.6) {
      a.action = { pose: 'poke', until };
      b.action = { pose: 'laugh', until };
      if (a.real) this.say(a.id, ['😜 Trêu tí', '👉 Ê ê', '🤭 Hihi'][Math.floor(Math.random() * 3)], 2500);
      if (b.real) this.say(b.id, ['🤣 Nhột!', '😆 Thôi đi!', '🙄 Hứ!'][Math.floor(Math.random() * 3)], 2500);
    } else {
      a.action = { pose: 'laugh', until };
      b.action = { pose: 'laugh', until };
    }
  }

  // ---------- tiết mục MC hát: ra giữa sân khấu, đèn rọi, cả sảnh tắt đèn ----------
  private sing = { on: false, k: 0, flashUntil: 0 };
  private spot = new THREE.SpotLight('#ffe9c7', 0, 30, 0.26, 0.7, 0);
  private spotCone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 1.5, 12, 32, 1, true).translate(0, -6, 0),
    new THREE.MeshBasicMaterial({ color: '#fff6e6', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );

  get singing() {
    return this.sing.on;
  }

  singStart() {
    if (!this.spot.parent) {
      this.spot.target = this.mcM.root;
      this.scene.add(this.spot, this.spotCone);
    }
    this.sing.on = true;
    this.sing.flashUntil = Date.now() + 1400; // nháy flash vài cái lúc MC bước ra
  }

  singEnd() {
    this.sing.on = false;
  }

  /** trả về true khi MC đang đi ra / đi về */
  private stepSing(dt: number, now: number) {
    const sg = this.sing;
    sg.k += ((sg.on ? 1 : 0) - sg.k) * Math.min(1, dt * 2.5);
    this.hemi.intensity = HEMI_I * (1 - 0.92 * sg.k);
    this.sun.intensity = SUN_I * (1 - 0.95 * sg.k);
    const mc = this.mcM.root;
    const to = sg.on ? v(0, STAGE_Y, STAGE_FRONT - 0.9) : v(-4.2, STAGE_Y, -21.2);
    const d = Math.hypot(to.x - mc.position.x, to.z - mc.position.z);
    const walking = d > 0.05;
    if (walking) {
      const step = Math.min(d, 2.4 * dt);
      mc.position.x += ((to.x - mc.position.x) / d) * step;
      mc.position.z += ((to.z - mc.position.z) / d) * step;
      mc.rotation.y = Math.atan2(to.x - mc.position.x, to.z - mc.position.z);
    } else mc.rotation.y = sg.on ? 0 : 0.35;
    const lit = sg.k > 0.02;
    this.spotCone.visible = lit;
    if (lit) {
      this.spot.position.set(mc.position.x, 12, mc.position.z + 1.5);
      this.spotCone.position.set(mc.position.x, 12, mc.position.z);
      const flash = now < sg.flashUntil && Math.random() < 0.5;
      // dịu cho khỏi cháy trắng sàn sân khấu khi quay cận (chủ kênh chê chói)
      this.spot.intensity = flash ? 3 : 1.5 * sg.k;
      (this.spotCone.material as THREE.MeshBasicMaterial).opacity = (flash ? 0.14 : 0.07) * sg.k;
    } else this.spot.intensity = 0;
    return walking;
  }

  // ---------- mỗi khung hình ----------
  // tự cân hiệu ứng theo tốc độ máy: chậm 2 giây liền thì giảm, nhanh 6 giây liền thì tăng lại (dt = 1 khung thật)
  private adaptQuality(dt: number) {
    this.slow = dt > 1 / 40 ? this.slow + dt : Math.max(0, this.slow - dt / 3);
    if (this.slow > 2 && this.quality > 0.4) {
      this.quality = Math.max(0.4, this.quality - 0.2);
      this.slow = 0;
      this.renderer?.setPixelRatio(this.quality < 0.7 ? 0.75 : 1);
      this.renderer?.setSize(W, H, false);
    } else if (this.slow === 0 && dt < 1 / 55 && Math.random() < dt / 6 && this.quality < 1) {
      this.quality = Math.min(1, this.quality + 0.2);
      this.renderer?.setPixelRatio(this.quality < 0.7 ? 0.75 : 1);
      this.renderer?.setSize(W, H, false);
    }
  }

  private step(dt: number, draw: boolean) {
    this.t += dt;
    const now = Date.now();
    const party = now < this.partyUntil;
    if (party) this.hemi.color.setHSL((this.t * 0.25) % 1, 0.8, 0.75);
    else this.hemi.color.set('#ffe6d2');

    const all = [...this.guests.values(), ...this.npcs];
    for (const g of all) this.stepGuest(g, dt, now, party);

    // MC
    const walking = this.stepSing(dt, now);
    for (const [mc, who] of [[this.mcM, 'M'], [this.mcF, 'F']] as const) {
      mc.pose = mc === this.mcM && walking ? 'walk' : this.speaker === who ? 'talk' : party ? 'dance' : 'stand';
      mc.update(this.t, false);
    }

    // vòng sáng dưới cặp đôi
    const mid = this.couple.mode !== 'none' ? this.coupleMid() : null;
    this.glow.visible = !!mid;
    if (mid) {
      this.glow.position.set(mid.x, mid.y + 0.03, mid.z);
      this.glow.scale.setScalar(1 + Math.sin(this.t * 3) * 0.08);
    }

    // nhẫn bay
    if (this.ringAnim) {
      const k = Math.min(1, (this.t - this.ringAnim.t0) / 1.8);
      this.ring.position.lerpVectors(this.ringAnim.from, this.ringAnim.to, k);
      this.ring.position.y += Math.sin(k * Math.PI) * 1.5;
      this.ring.rotation.y += dt * 8;
      if (k >= 1) {
        this.hearts.burst(this.ring.position.clone(), 40, ['#ffd166', '#ff8fab', '#ffffff'], 2.2, -1);
        this.ring.visible = false;
        this.ringAnim = null;
      }
    }

    // Nguyệt Lão vẫy tay; tơ hồng vẽ lại theo vị trí 2 người
    if (this.nguyetOn) {
      this.nguyet.pose = this.speaker ? 'wave' : 'stand';
      this.nguyet.update(this.t, false);
    }
    if (this.thread) {
      const a = this.posOf(this.thread.a);
      const b = this.posOf(this.thread.b);
      if (this.thread.mesh) {
        this.scene.remove(this.thread.mesh);
        this.thread.mesh.geometry.dispose();
        this.thread.mesh = null;
      }
      if (!a || !b || now > this.thread.until) this.thread = null;
      else {
        a.y += 1.3;
        b.y += 1.3;
        const mid = a.clone().add(b).multiplyScalar(0.5);
        mid.y += 2.2 + Math.sin(this.t * 3) * 0.2;
        const tube = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 30, 0.035, 5);
        this.thread.mesh = new THREE.Mesh(tube, this.threadMat);
        this.scene.add(this.thread.mesh);
        if (Math.random() < dt * 8) this.hearts.add(mid, v(0, 0.6, 0), '#ff4d6d', 1.5);
      }
    }

    // trêu nhau ở bàn ~mỗi 1,5 giây 1 cặp
    this.anticAcc += dt;
    if (this.anticAcc > 1.5) {
      this.anticAcc = 0;
      this.antic();
    }
    this.stepStaff(now);
    for (const g of [...this.waiters, ...this.crew, ...this.dancers.map((d) => d.g), ...this.stageDancers.map((d) => d.g)]) this.stepGuest(g, dt, now, false);
    this.pets.update(dt, this.t, now < this.djUntil);
    // hoa hồng rơi nhẹ liên tục + bóng bay + màn quẩy DJ
    this.roseAcc += dt * 3 * this.quality;
    while (this.roseAcc >= 1) {
      this.roseAcc--;
      this.roses.add(v((Math.random() - 0.5) * 22, 9, -22 + Math.random() * 28), v(0, -0.6, 0), Math.random() < 0.6 ? '#ff4d6d' : '#ffccd5', 14, 1);
    }
    this.roses.update(dt);
    for (const b of this.balloons) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.m.position.y += b.vy * dt;
      b.m.position.x += Math.sin(this.t * 1.5 + b.sway) * dt * 0.4;
      if (b.life <= 0) b.m.visible = false;
    }
    const dj = now < this.djUntil;
    if (dj) {
      // nhảy DJ: đèn nháy theo nhịp (~120 BPM), cứ 2,5–5 giây bắn thêm 1–2 hiệu ứng ngẫu nhiên
      const beat = Math.abs(Math.sin(this.t * Math.PI * 2));
      this.hemi.intensity = HEMI_I * (0.6 + 0.5 * beat);
      if (now > this.djFxAt) {
        this.djFxAt = now + 2500 + Math.random() * 2500;
        const fx = [
          () => this.cannons(70),
          () => this.confetti(140),
          () => this.smokeBurst(14, 'stage'),
          () => this.smokeBurst(10, 'hall'),
          () => this.fountains(3500),
          () => this.fireworks(2),
          () => this.goldRain(160),
          () => this.heartsRain(40),
          () => this.balloonsUp(10),
          () => this.petals(120),
        ];
        for (let k = Math.random() < 0.5 ? 1 : 2; k > 0; k--) fx[Math.floor(Math.random() * fx.length)]();
      }
    }
    for (const [i, l] of this.lasers.entries()) {
      l.visible = dj;
      if (dj) {
        l.rotation.z = Math.sin(this.t * 1.7 + i) * 1.1 + (i - 4) * 0.12;
        l.rotation.x = 0.9 + Math.sin(this.t * 1.3 + i * 2) * 0.35;
      }
    }
    this.disco.visible = dj;
    if (dj) this.disco.rotation.y += dt * 2;
    if (!dj && this.djCrew.length) {
      for (const g of this.djCrew) {
        g.busy = false;
        g.action = null;
        g.onArrive = undefined;
        this.goHome(g);
      }
      this.djCrew = [];
    }

    // xe hoa chạy theo đường, kéo theo tim và kim tuyến
    if (this.car?.visible) {
      const to = this.carPath[0];
      if (!to) {
        // xe hoa đậu chờ cô dâu chú rể lên xe; không đậu thì chạy hết đường là biến mất
        const cb = this.carOnArrive;
        this.carOnArrive = null;
        cb?.();
        if (!this.carParked) this.car.visible = false;
      } else {
        const p = this.car.position;
        const d = Math.hypot(to.x - p.x, to.z - p.z);
        if (d < 0.2) this.carPath.shift();
        else {
          p.x += ((to.x - p.x) / d) * Math.min(d, 6 * dt);
          p.z += ((to.z - p.z) / d) * Math.min(d, 6 * dt);
          this.car.rotation.y = Math.atan2(to.x - p.x, to.z - p.z) - Math.PI / 2;
          if (Math.random() < dt * 20) this.hearts.add(p.clone().add(v(0, 1.4, 0)), v(0, 1, 0), Math.random() < 0.5 ? '#ff4d6d' : '#ffffff', 1.6);
        }
      }
    }
    this.dj.action = { pose: 'dj', until: now + 1000 };
    this.stepGuest(this.dj, dt, now, false);
    this.hall.ledMat.color.setHSL((this.t * 0.15) % 1, 0.9, 0.62);
    this.hall.chand.rotation.y += dt * 0.15;

    // pháo sáng: 4 vòi tia lửa ở mép sân khấu
    if (now < this.fountainUntil)
      for (const x of [-6, -2.6, 2.6, 6])
        for (let k = 0; k < 3; k++)
          this.fx.add(v(x, STAGE_Y + 0.05, STAGE_FRONT - 0.3), v((Math.random() - 0.5) * 0.9, 5.5 + Math.random() * 2.5, (Math.random() - 0.5) * 0.9), Math.random() < 0.6 ? '#fff6d8' : '#ffd166', 1.3, 0, 7);
    // khói nhẹ trên sân khấu lúc nào cũng có, có cặp đôi thì dày hơn
    this.smokeAcc += dt * (this.couple.mode === 'none' ? 0.6 : 2.5) * this.quality;
    while (this.smokeAcc >= 1) {
      this.smokeAcc--;
      this.smokeBurst(1, this.couple.mode === 'walk' ? 'aisle' : 'stage');
    }
    this.smoke.update(dt);

    // kim tuyến bạc rơi lấp lánh liên tục
    this.glitter += dt * 14 * this.quality;
    while (this.glitter >= 1) {
      this.glitter--;
      this.fx.add(v((Math.random() - 0.5) * 24, 9 + Math.random() * 2, -24 + Math.random() * 34), v(0, -0.55, 0), Math.random() < 0.7 ? '#ffffff' : '#dfe8ff', 16, 0.35);
    }
    // pháo giấy sân khấu mỗi 40 giây cho cảnh luôn có điểm nhấn
    if (this.t - this.lastCannon > 40) this.cannons(90);
    // đèn rọi quét chỉ bật lúc highlight (cả sảnh quẩy, DJ), bình thường tắt cho khỏi trắng xóa người trên sân khấu
    const beamsOn = (party || dj) && this.sing.k < 0.5;
    this.beams.forEach((b, i) => {
      b.visible = beamsOn;
      if (!beamsOn) return;
      b.rotation.z = Math.sin(this.t * 0.5 + i * 1.3) * 0.45;
      b.rotation.x = Math.cos(this.t * 0.4 + i) * 0.25;
      const m = b.material as THREE.MeshBasicMaterial;
      m.opacity = 0.09;
      if (party) m.color.setHSL((this.t * 0.3 + i * 0.15) % 1, 0.9, 0.7);
      else m.color.set(i < 2 ? '#e6ecff' : i < 4 ? '#ffd1e6' : '#fff4d6');
    });

    this.fx.update(dt);
    this.hearts.update(dt);
    (this.hall.fairy.material as THREE.PointsMaterial).size = 0.08 + Math.abs(Math.sin(this.t * 2)) * 0.04;

    this.updateCamera(dt);
    if (!draw) return;
    this.renderer?.render(this.scene, this.camera);
    this.drawOverlay(now);
    if (this.debugFps && this.overlay) {
      // ?view=stage&debug=1: số khung/giây thật để soi máy trong LIVE Studio
      const cut = performance.now() - 1000;
      while (this.frameTimes.length && this.frameTimes[0] < cut) this.frameTimes.shift();
      this.overlay.fillStyle = 'rgba(0,0,0,0.75)';
      this.overlay.fillRect(0, 0, 420, 70);
      this.overlay.fillStyle = '#a3e635';
      this.overlay.font = 'bold 40px monospace';
      this.overlay.fillText(`${this.frameTimes.length} fps  q${this.quality.toFixed(1)}`, 16, 50);
    }
  }

  private stepGuest(g: Guest, dt: number, now: number, party: boolean) {
    const r = g.c.root;
    let moving = false;
    const target = g.path[0];
    if (target) {
      const dx = target.x - r.position.x;
      const dz = target.z - r.position.z;
      const dist = Math.hypot(dx, dz);
      const stepLen = g.speed * dt;
      if (dist <= Math.max(stepLen, 0.02)) {
        r.position.copy(target);
        g.path.shift();
        if (!g.path.length) {
          const cb = g.onArrive;
          g.onArrive = undefined;
          cb?.();
          this.arrived(g);
        }
      } else {
        r.position.x += (dx / dist) * stepLen;
        r.position.z += (dz / dist) * stepLen;
        r.position.y += (target.y - r.position.y) * Math.min(1, stepLen / dist);
        r.rotation.y = turn(r.rotation.y, Math.atan2(dx, dz), dt * 10);
        moving = true;
      }
    } else if (g.face !== null) r.rotation.y = turn(r.rotation.y, g.face, dt * 6);

    if (g.action && now > g.action.until) g.action = null;
    if (g.hold && now > g.hold.until) {
      g.hold = null;
      g.c.hold(null);
    }
    const home = !g.path.length && !g.role && !!g.seat && Math.hypot(r.position.x - g.seat.x, r.position.z - g.seat.z) < 0.05;
    g.c.seated = home;
    let pose: Pose = g.action?.pose ?? (home ? 'sit' : 'stand');
    if (party && !g.action && !g.role) pose = home ? 'zo' : 'dance';
    if (party && g.role && !g.action) pose = 'dance';
    g.c.pose = pose;
    g.c.update(this.t, moving);
    g.shadow.position.set(r.position.x, r.position.y + 0.015, r.position.z);
    if (g.bubble && now > g.bubble.until) g.bubble = null;
  }

  /** nhân viên bưng món đi tới bàn rồi về bếp; đội nhảy về chỗ khi hết giờ; đội pháo reo khi bắn */
  private stepStaff(now: number) {
    for (const h of this.hired)
      if (h.hireKind === 'dancer' && !h.path.length) h.action = { pose: this.stageDanceOn ? 'dance' : 'wave', until: now + 500 };
    for (const w of [...this.waiters, ...this.hired.filter((h) => h.hireKind === 'waiter')]) {
      if (w.path.length) continue;
      if (w.job === 'rest' && now > w.until) {
        const p = w.c.root.position;
        const mine = TABLES.filter((x) => Math.sign(x.x) === Math.sign(p.x));
        const t = mine[Math.floor(Math.random() * mine.length)];
        const lane = t.z + 2.2;
        const side = t.x > 0 ? -1 : 1;
        w.path = [v(p.x * 0.95, 0, lane), v(t.x + side * 1.1, 0, lane)];
        w.speed = 1.6;
        w.face = Math.atan2(t.x - (t.x + side * 1.1), t.z - lane);
        w.job = 'go';
        w.c.hold('tray');
        w.action = { pose: 'carry', until: now + 60_000 };
      } else if (w.job === 'go') {
        w.job = 'serve';
        w.until = now + 1800;
        w.action = { pose: 'stand', until: now + 1800 };
        w.c.hold(null);
      } else if (w.job === 'serve' && now > w.until) {
        const p = w.c.root.position;
        const side = w.id.endsWith('1') || w.id.endsWith('3') ? 1 : -1;
        w.path = [v(side * 11.8, 0, p.z), v(side * 12.2, 0, -14 + Math.random() * 5)];
        w.face = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        w.job = 'back';
      } else if (w.job === 'back') {
        w.job = 'rest';
        w.until = now + 2000 + Math.random() * 5000;
      }
    }
    if (now > this.danceUntil)
      for (const d of this.dancers) {
        const r = d.g.c.root.position;
        if (!d.g.path.length && r.distanceTo(d.home) > 0.1) {
          d.g.path = [v(r.x, 0, r.z), d.home.clone()];
          d.g.face = 0;
        }
      }
    for (const d of this.dancers) d.g.action = now < this.danceUntil && !d.g.path.length ? { pose: d.g.move ?? 'dance', until: this.danceUntil } : null;
    // vũ công trên sân khấu: ra nhảy khi cặp đôi đứng sân khấu hoặc cả sảnh quẩy (không lúc Nguyệt Lão)
    const want = !this.nguyetOn && (this.couple.mode === 'stage' || now < this.partyUntil);
    if (want !== this.stageDanceOn) {
      this.stageDanceOn = want;
      for (const d of this.stageDancers) {
        const to = want ? d.spot : d.home;
        d.g.path = [v(to.x, STAGE_Y, d.g.c.root.position.z), to.clone()];
        d.g.speed = 3;
        d.g.face = 0;
        d.g.c.sync(0);
      }
    }
    this.stageDancers.forEach((d, i) => {
      d.g.action = want && !d.g.path.length ? { pose: Math.floor(this.t / 4 + i) % 3 === 0 ? 'spin' : 'dance', until: now + 500 } : null;
    });
    const firing = this.t - this.lastCannon < 2.5;
    for (const c of this.crew) c.action = firing ? { pose: 'cheer', until: now + 500 } : null;
  }

  private arrived(g: Guest) {
    if (!g.role) return;
    const c = this.couple;
    const others = [c.groom, c.bride].map((id) => (id ? this.guests.get(id) : null));
    if (others.some((o) => !o || o.path.length)) return;
    if (c.mode === 'gate' && others.every((o) => o && Math.abs(o.c.root.position.z - (GATE_Z - 1.6)) < 0.1)) this.events.coupleAtGate?.();
    if (c.mode === 'walk') {
      c.mode = 'stage';
      this.base = 'stage';
      this.events.coupleOnStage?.();
    }
  }

  // ---------- bảng tên + bong bóng (lớp 2D phủ trên cảnh 3D) ----------
  private drawOverlay(now: number) {
    const ctx = this.overlay;
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (this.sing.k > 0.5) return; // tắt đèn: không hiện bảng tên
    const cam = this.camera;
    const list: { g: Guest; x: number; y: number; d: number }[] = [];
    const p = new THREE.Vector3();
    const staff = [...this.waiters, ...this.crew, this.dj, ...this.dancers.map((d) => d.g), ...this.stageDancers.map((d) => d.g)];
    for (const g of [...this.guests.values(), ...staff]) {
      if (!g.c.root.visible) continue; // đang ngồi trong xe hoa
      g.c.headTop(p);
      const d = p.distanceTo(cam.position);
      p.project(cam);
      if (p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1) continue;
      const y = ((1 - p.y) / 2) * H;
      if (y < 600 && !g.role) continue; // không đè lên tiêu đề + bảng hướng dẫn
      list.push({ g, x: ((p.x + 1) / 2) * W, y, d });
    }
    // đông quá: ưu tiên cô dâu chú rể, người đang nói, người vừa tương tác
    const score = (e: (typeof list)[number]) => (e.g.role ? 1e13 : 0) + (e.g.bubble ? 1e12 : 0) + e.g.active;
    const shown = list.length > TAGS_MAX ? [...list].sort((a, b) => score(b) - score(a)).slice(0, TAGS_MAX) : list;
    shown.sort((a, b) => b.d - a.d); // xa vẽ trước, gần đè lên
    for (const { g, x, y, d } of shown) {
      const s = Math.max(0.5, Math.min(1.1, 10 / d)) * (g.role ? 1.25 : 1);
      if (g.tag && g.tagRole !== g.role) g.tag = null; // đổi vai (bị cướp, từ chối, xuống sân khấu) thì vẽ lại bảng tên
      if (!g.tag) {
        g.tagRole = g.role;
        const title = g.role ? { text: g.role === 'groom' ? '🤵 CHÚ RỂ' : '👰 CÔ DÂU', gold: true } : g.title;
        g.tag = nameTag(g.name, g.avatar, g.role ? '#c9184a' : '#7a2e43', title);
      }
      const tw = g.tag.width * 0.5 * s;
      const th = g.tag.height * 0.5 * s;
      ctx.drawImage(g.tag, x - tw / 2, y - th, tw, th);
      if (g.bubble) {
        const bw = g.bubble.cv.width * 0.5 * Math.max(0.6, s);
        const bh = g.bubble.cv.height * 0.5 * Math.max(0.6, s);
        ctx.drawImage(g.bubble.cv, Math.max(110, Math.min(W - 110 - bw, x - bw / 2)), y - th - bh - 6, bw, bh);
      }
      void now;
    }
  }

  /** gán lại bảng tên khi đổi vai (cô dâu/chú rể) */
  refreshTag(id: string) {
    const g = this.guests.get(id);
    if (g) g.tag = null;
  }

  someGuests(n: number) {
    const ids = [...this.guests.values()].filter((g) => !g.role && !g.busy).map((g) => g.id);
    const out: string[] = [];
    while (out.length < n && ids.length) out.push(ids.splice(Math.floor(Math.random() * ids.length), 1)[0]);
    return out;
  }

  reset() {
    for (const g of this.guests.values()) this.removeGuest(g);
    this.guests.clear();
    this.couple = { groom: null, bride: null, mode: 'none' };
    this.base = 'wide';
    for (const n of this.npcs) this.removeGuest(n);
    this.npcs = [];
    for (let i = 0; i < NPC_COUNT; i++) this.addNpc(i);
  }
}

// ---------- khói: các mảng mờ trôi chậm, to dần rồi tan ----------
class Smoke {
  group = new THREE.Group();
  private items: { s: THREE.Sprite; vel: V3; life: number; max: number; size: number }[] = [];
  private next = 0;

  constructor(n: number) {
    const tex = smokeTex();
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#e9edff', transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false;
      this.group.add(s);
      this.items.push({ s, vel: v(0, 0, 0), life: 0, max: 1, size: 1 });
    }
  }

  emit(at: V3) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    it.s.position.copy(at);
    it.vel.set((Math.random() - 0.5) * 0.5, 0.05 + Math.random() * 0.08, 0.15 + Math.random() * 0.35);
    it.max = it.life = 7 + Math.random() * 5;
    it.size = 2 + Math.random() * 2;
    it.s.material.rotation = Math.random() * Math.PI * 2;
    it.s.visible = true;
  }

  update(dt: number) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) {
        it.s.visible = false;
        continue;
      }
      const k = 1 - it.life / it.max; // 0 -> 1
      it.s.position.addScaledVector(it.vel, dt);
      it.s.scale.setScalar(it.size * (0.6 + k * 1.4));
      it.s.material.opacity = Math.sin(k * Math.PI) * 0.18; // khói mỏng, không làm trắng cô dâu chú rể
    }
  }
}

function smokeTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------- hạt: pháo giấy, pháo hoa, tim ----------
class Particles {
  points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private sway: Float32Array;
  private grav: Float32Array;
  private n = 0;
  private next = 0;

  constructor(private max: number, size: number, map: THREE.Texture) {
    this.pos = new Float32Array(max * 3).fill(-999);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.sway = new Float32Array(max);
    this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size, map, vertexColors: true, transparent: true, alphaTest: 0.3, depthWrite: false }));
    this.points.frustumCulled = false;
  }

  add(p: V3, vel: V3, color: string, life: number, sway = 0, grav = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.n = Math.max(this.n, this.next === 0 ? this.max : this.next);
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([vel.x + (Math.random() - 0.5) * 0.3, vel.y * (0.7 + Math.random() * 0.6), vel.z + (Math.random() - 0.5) * 0.3], i * 3);
    const c = new THREE.Color(color);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.life[i] = life * (0.7 + Math.random() * 0.5);
    this.sway[i] = sway;
    this.grav[i] = grav;
  }

  /** nổ tung từ 1 điểm. grav > 0 rơi xuống, < 0 bay lên */
  burst(at: V3, n: number, colors: string[], speed: number, grav: number) {
    for (let k = 0; k < n; k++) {
      const d = v(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      this.add(at, d, colors[k % colors.length], 2.2, 0, grav);
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -999;
        continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const s = this.sway[i] ? Math.sin(this.life[i] * 3 + i) * this.sway[i] : 0;
      this.pos[i * 3] += (this.vel[i * 3] + s) * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02 && this.grav[i] >= 0) this.vel.set([0, 0, 0], i * 3); // nằm trên sàn
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

function turn(from: number, to: number, k: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * Math.min(1, k);
}

const COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585', '#ffffff', '#b5179e', '#ff9f1c'];
const randColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

function squareTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(6, 9, 20, 14);
  return new THREE.CanvasTexture(c);
}

function petalTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.beginPath();
  x.ellipse(32, 32, 26, 15, 0.6, 0, Math.PI * 2);
  x.fill();
  return new THREE.CanvasTexture(c);
}

function heartTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.font = '56px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('♥', 32, 36);
  return new THREE.CanvasTexture(c);
}

export const world = new World();
// để kiểm tra trong DevTools
(window as unknown as { cw: World }).cw = world;
