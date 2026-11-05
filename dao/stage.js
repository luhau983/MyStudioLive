// Đảo Sinh Tồn 3D renderer. Entities are drawn with InstancedMesh (one draw call per part), so
// hundreds of avatars stay cheap. Name tags, HP bars and TikTok avatars go on a 2D canvas on top.
import * as THREE from './three.module.js';

const ISLAND = 60;
const MAX = 1200;
const CLASS_COLORS = [0xef4444, 0x22c55e, 0x8b5cf6];
const ZOMBIE_COLOR = 0x84cc16;
const CLASS_LABEL_COLORS = ['#fca5a5', '#86efac', '#c4b5fd'];
const FLAG = { zombie: 1, shield: 2, hide: 4, charge: 8, heal: 16, drop: 32, donor: 64, follower: 128 };

function seeded(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

export function createStage(container, labelCanvas) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
  catch { return null; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b3a5a);
  scene.fog = new THREE.Fog(0x0b3a5a, 140, 320);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 800);
  scene.add(new THREE.HemisphereLight(0xdff3ff, 0x2a4a2a, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(40, 80, 30); scene.add(sun);

  // ---------- island ----------
  const water = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshStandardMaterial({ color: 0x0e7490, roughness: 0.35, metalness: 0.1 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.6; scene.add(water);
  const foam = new THREE.Mesh(new THREE.RingGeometry(ISLAND + 1, ISLAND + 4, 96), new THREE.MeshBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.45 }));
  foam.rotation.x = -Math.PI / 2; foam.position.y = -0.5; scene.add(foam);
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND + 1, ISLAND + 3, 1.2, 96), new THREE.MeshStandardMaterial({ color: 0xf2d39b, roughness: 0.95 }));
  sand.position.y = -0.6; scene.add(sand);
  const grass = new THREE.Mesh(new THREE.CircleGeometry(ISLAND - 6, 96), new THREE.MeshStandardMaterial({ color: 0x4d9a3b, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = 0.01; scene.add(grass);
  const rnd = seeded(2026);
  // a few darker meadow patches for texture
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * (ISLAND - 18);
    const patch = new THREE.Mesh(new THREE.CircleGeometry(4 + rnd() * 7, 24), new THREE.MeshStandardMaterial({ color: rnd() < 0.5 ? 0x3f8a32 : 0x5fae45, roughness: 1 }));
    patch.rotation.x = -Math.PI / 2; patch.position.set(Math.cos(a) * d, 0.02, Math.sin(a) * d); scene.add(patch);
  }
  // palm trees + rocks (instanced, static)
  const TREES = 70;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 4, 6), new THREE.MeshStandardMaterial({ color: 0x8b5a2b, transparent: true }), TREES);
  const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 2.2, 7), new THREE.MeshStandardMaterial({ color: 0x166534, transparent: true }), TREES);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < TREES; i++) {
    const a = rnd() * Math.PI * 2, d = 8 + rnd() * (ISLAND - 12), s = 0.7 + rnd() * 0.6;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    m4.compose(v.set(x, 2 * s, z), q.identity(), sc.set(s, s, s)); trunks.setMatrixAt(i, m4);
    m4.compose(v.set(x, 4.6 * s, z), q.identity(), sc.set(s, s, s)); leaves.setMatrixAt(i, m4);
  }
  scene.add(trunks, leaves);
  const ROCKS = 30;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1), new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 1 }), ROCKS);
  for (let i = 0; i < ROCKS; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * (ISLAND - 4), s = 0.5 + rnd() * 1.3;
    m4.compose(v.set(Math.cos(a) * d, s * 0.3, Math.sin(a) * d), q.setFromEuler(new THREE.Euler(rnd(), rnd(), rnd())), sc.set(s, s * 0.7, s)); rocks.setMatrixAt(i, m4);
  }
  scene.add(rocks);

  // ---------- storm ----------
  const stormMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { center: { value: new THREE.Vector2() }, radius: { value: 999 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vXZ; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec2 center; uniform float radius; uniform float time; varying vec2 vXZ;
      void main(){ float d = distance(vXZ, center); if (d < radius) discard;
        float edge = smoothstep(radius, radius + 3.0, d);
        float swirl = 0.5 + 0.5 * sin(d * 0.35 - time * 2.0 + atan(vXZ.y - center.y, vXZ.x - center.x) * 3.0);
        gl_FragColor = vec4(mix(vec3(0.55,0.2,0.85), vec3(0.3,0.1,0.55), swirl), 0.25 + 0.3 * edge); }`
  });
  const stormPlane = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), stormMat);
  stormPlane.rotation.x = -Math.PI / 2; stormPlane.position.y = 0.4; stormPlane.renderOrder = 2; scene.add(stormPlane);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 18, 96, 1, true), new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  wall.position.y = 9; wall.renderOrder = 3; scene.add(wall);
  const circlePts = Array.from({ length: 129 }, (_, i) => { const a = (i / 128) * Math.PI * 2; return new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); });
  const circleGeo = new THREE.BufferGeometry().setFromPoints(circlePts);
  const nextRing = new THREE.Line(circleGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
  nextRing.position.y = 0.5; nextRing.visible = false; scene.add(nextRing);
  const candRings = [0xfbbf24, 0x38bdf8, 0xf472b6].map((c) => { const l = new THREE.Line(circleGeo, new THREE.LineDashedMaterial({ color: c, dashSize: 0.04, gapSize: 0.03 })); l.computeLineDistances(); l.position.y = 0.55; l.visible = false; scene.add(l); return l; });

  // ---------- entities ----------
  const bodyGeo = new THREE.CapsuleGeometry(0.45, 0.8, 4, 8);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), MAX);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.38, 12, 10), new THREE.MeshStandardMaterial({ roughness: 0.7 }), MAX);
  const shields = new THREE.InstancedMesh(new THREE.SphereGeometry(1.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.3, depthWrite: false }), MAX);
  const chutes = new THREE.InstancedMesh(new THREE.SphereGeometry(1.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }), MAX);
  const shadows = new THREE.InstancedMesh(new THREE.CircleGeometry(0.6, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }), MAX);
  for (const m of [bodies, heads, shields, chutes, shadows]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; scene.add(m); }
  bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  heads.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  chutes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);

  const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshStandardMaterial({ roughness: 0.5 }), 400);
  crates.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(400 * 3), 3);
  crates.count = 0; crates.frustumCulled = false; scene.add(crates);
  const warn = new THREE.InstancedMesh(new THREE.RingGeometry(3.4, 4, 32), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }), 64);
  const rocksFall = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.2), new THREE.MeshBasicMaterial({ color: 0xff7a18 }), 64);
  for (const m of [warn, rocksFall]) { m.count = 0; m.frustumCulled = false; scene.add(m); }

  // ---------- state ----------
  const ents = new Map();     // id -> { px,pz,x,z,y,hp,max,flags,weapon,kills,seen }
  let roster = new Map();     // id -> { name, avatar, cls, zombie }
  let frame = null, frameAt = 0;
  const avatars = new Map();
  const color = new THREE.Color(), WHITE = new THREE.Color(0xffffff);
  const LIE = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), spinQ = new THREE.Quaternion(), spinE = new THREE.Euler();
  let camR = ISLAND * 1.15, camX = 0, camZ = 0, spin = 0;

  function setRoster(list) {
    roster = new Map(list.map(([id, name, avatar, cls, zombie, uniqueId]) => [id, { name, avatar, cls, zombie: !!zombie, uniqueId }]));
  }

  function setFrame(f) {
    const t = performance.now();
    const seen = new Set();
    for (const [id, x, z, hp, max, flags, y, weapon, kills] of f.ents) {
      seen.add(id);
      let e = ents.get(id);
      if (!e) { e = { px: x / 10, pz: z / 10, x: x / 10, z: z / 10, py: y / 10, y: y / 10 }; ents.set(id, e); }
      else { e.px = e.rx ?? e.x; e.pz = e.rz ?? e.z; e.py = e.ry ?? e.y; e.x = x / 10; e.z = z / 10; e.y = y / 10; }
      if (e.hp > hp && hp > 0) e.hitAt = t;
      Object.assign(e, { hp, max, flags, weapon, kills });
    }
    for (const id of ents.keys()) if (!seen.has(id)) ents.delete(id);
    frame = f; frameAt = t;
  }

  function avatarImg(url) {
    if (!url) return null;
    let img = avatars.get(url);
    if (!img) {
      img = new Image(); img.referrerPolicy = 'no-referrer'; img.decoding = 'async'; img.src = url;
      img.onerror = () => { img.failed = true; };
      avatars.set(url, img);
      if (avatars.size > 400) avatars.delete(avatars.keys().next().value);
    }
    return img.complete && !img.failed && img.naturalWidth ? img : null;
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    labelCanvas.width = w * dpr; labelCanvas.height = h * dpr;
    labelCanvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize); resize();

  const proj = new THREE.Vector3();
  function toScreen(x, y, z) {
    proj.set(x, y, z).project(camera);
    return { x: (proj.x + 1) / 2 * container.clientWidth, y: (1 - proj.y) / 2 * container.clientHeight, visible: proj.z < 1 };
  }

  function updateCamera(dt) {
    let targetR = ISLAND * 1.15, tx = 0, tz = 0;
    if (frame && ['loot', 'storm', 'final'].includes(frame.phase)) {
      const s = frame.storm, r = Math.min(s.r, ISLAND);
      targetR = Math.max(16, r * 1.25 + 6); tx = s.x * 0.8; tz = s.z * 0.8;
      if (frame.phase === 'final' || frame.alive <= 3) {
        // frame the survivors
        const alive = [...ents.values()].filter((e) => e.hp > 0 && !(e.flags & FLAG.zombie));
        if (alive.length) { tx = alive.reduce((a, e) => a + e.x, 0) / alive.length; tz = alive.reduce((a, e) => a + e.z, 0) / alive.length; targetR = Math.max(18, Math.min(targetR, 26)); }
      }
      spin += (0 - spin) * Math.min(1, dt * 0.5);
    } else spin += dt * 0.06;
    const k = Math.min(1, dt * 1.5);
    camR += (targetR - camR) * k; camX += (tx - camX) * k; camZ += (tz - camZ) * k;
    // Portrait screens are narrow: fit the circle to the width.
    const fitW = camR / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect);
    const dist = fitW * 0.95, tilt = THREE.MathUtils.degToRad(68);
    camera.position.set(camX + Math.sin(spin) * Math.cos(tilt) * dist, Math.sin(tilt) * dist, camZ + Math.cos(spin) * Math.cos(tilt) * dist);
    camera.lookAt(camX, 0, camZ + camR * 0.08);
    // Trees fade when the camera zooms in so they never hide the fighters.
    const treeAlpha = Math.max(0.25, Math.min(1, (camR - 18) / 30));
    trunks.material.opacity = leaves.material.opacity = treeAlpha; trunks.material.depthWrite = leaves.material.depthWrite = treeAlpha > 0.95;
    scene.fog.near = dist * 1.1; scene.fog.far = dist * 2.6; camera.far = dist * 3;
    camera.updateProjectionMatrix();
  }

  function updateStorm(time) {
    if (!frame) return;
    const s = frame.storm, active = ['loot', 'storm', 'final'].includes(frame.phase) && s.stage >= 0;
    stormPlane.visible = active || frame.phase === 'final'; wall.visible = stormPlane.visible;
    stormMat.uniforms.center.value.set(s.x, s.z); stormMat.uniforms.radius.value = active ? s.r : 999; stormMat.uniforms.time.value = time;
    wall.position.x = s.x; wall.position.z = s.z; wall.scale.set(Math.max(0.1, s.r), 1, Math.max(0.1, s.r));
    if (s.to && frame.phase === 'storm') { nextRing.visible = true; nextRing.position.set(s.to.x, 0.5, s.to.z); nextRing.scale.setScalar(Math.max(0.1, s.to.r)); }
    else nextRing.visible = false;
    candRings.forEach((ring, i) => {
      const c = s.candidates[i];
      ring.visible = !!c;
      if (c) { ring.position.set(c[0], 0.55, c[1]); ring.scale.setScalar(Math.max(1, c[2])); }
    });
  }

  function updateEntities(now, time) {
    const a = Math.min(1, (now - frameAt) / 100);
    let n = 0, sh = 0, ch = 0;
    const k = Math.max(1, Math.min(2.6, camR / 22));
    for (const [id, e] of ents) {
      if (n >= MAX) break;
      e.rx = e.px + (e.x - e.px) * a; e.rz = e.pz + (e.z - e.pz) * a; e.ry = e.py + (e.y - e.py) * a;
      const dead = e.hp <= 0, zombie = e.flags & FLAG.zombie, hide = e.flags & FLAG.hide;
      const r = roster.get(id);
      const bob = dead ? 0 : Math.abs(Math.sin(time * 6 + id)) * 0.12;
      const y = e.ry + 0.85 * k + bob;
      if (dead) m4.compose(v.set(e.rx, 0.35 * k, e.rz), LIE, sc.set(k, k, k));
      else m4.compose(v.set(e.rx, y, e.rz), q.identity(), sc.set(k, k * (hide ? 0.6 : 1), k));
      bodies.setMatrixAt(n, m4);
      if (dead) color.set(0x555555);
      else if (zombie) color.set(ZOMBIE_COLOR);
      else color.set(CLASS_COLORS[r?.cls ?? 0] ?? 0xffffff);
      if (e.hitAt && now - e.hitAt < 150) color.lerp(WHITE, 0.6);
      if (hide) color.multiplyScalar(0.55);
      bodies.setColorAt(n, color);
      m4.compose(v.set(e.rx, dead ? 0.35 * k : y + 0.85 * k * (hide ? 0.6 : 1), dead ? e.rz + 0.9 * k : e.rz), q.identity(), sc.set(k, k, k));
      heads.setMatrixAt(n, m4);
      heads.setColorAt(n, color.set(zombie ? 0x65a30d : dead ? 0x666666 : 0xffd7b0));
      m4.compose(v.set(e.rx, 0.03, e.rz), FLAT, sc.set(k, k, k));
      shadows.setMatrixAt(n, m4);
      if (!dead && (e.flags & FLAG.shield)) { m4.compose(v.set(e.rx, y + 0.4 * k, e.rz), q.identity(), sc.set(k, k, k)); shields.setMatrixAt(sh++, m4); }
      if (!dead && e.ry > 0.3) {
        m4.compose(v.set(e.rx, y + 3.2 * k, e.rz), q.identity(), sc.set(k, 0.8 * k, k)); chutes.setMatrixAt(ch, m4);
        chutes.setColorAt(ch++, color.set(CLASS_COLORS[r?.cls ?? 0] ?? 0xffffff).lerp(WHITE, 0.5));
      }
      n++;
    }
    bodies.count = heads.count = shadows.count = n; shields.count = sh; chutes.count = ch;
    for (const m of [bodies, heads, shadows, shields, chutes]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

    let c = 0;
    if (frame) for (const [, x, z, tier] of frame.crates) {
      if (c >= 400) break;
      m4.compose(v.set(x / 10, 0.7 * k + Math.sin(time * 3 + c) * 0.15, z / 10), spinQ.setFromEuler(spinE.set(0, time + c, 0)), sc.set(k, k, k));
      crates.setMatrixAt(c, m4); crates.setColorAt(c, color.set(tier >= 3 ? 0xfbbf24 : 0x38bdf8)); c++;
    }
    crates.count = c; crates.instanceMatrix.needsUpdate = true; if (crates.instanceColor) crates.instanceColor.needsUpdate = true;

    let w = 0, f = 0;
    if (frame) for (const [x, z, ms] of frame.meteors) {
      if (w >= 64) break;
      const left = Math.max(0, ms - (now - frameAt));
      m4.compose(v.set(x / 10, 0.6, z / 10), FLAT, sc.setScalar(1 + 0.1 * Math.sin(time * 20)));
      warn.setMatrixAt(w++, m4);
      const h = (left / 1500) * 40;
      m4.compose(v.set(x / 10 + h * 0.3, h + 1, z / 10), q.identity(), sc.set(1, 1, 1));
      rocksFall.setMatrixAt(f++, m4);
    }
    warn.count = w; rocksFall.count = f; warn.instanceMatrix.needsUpdate = true; rocksFall.instanceMatrix.needsUpdate = true;
  }

  // Name tags: everyone when few are alive, otherwise donors, top killers and highest HP first.
  function drawLabels(now) {
    const ctx = labelCanvas.getContext('2d');
    const W = container.clientWidth, H = container.clientHeight, u = Math.min(W / 100, H / 177.8);
    ctx.clearRect(0, 0, W, H);
    if (!frame) return;
    const list = [];
    for (const [id, e] of ents) { if (e.hp <= 0 || (e.flags & FLAG.zombie)) continue; const r = roster.get(id); if (r) list.push([id, e, r]); }
    const limit = list.length <= 20 ? list.length : 28;
    const taken = [];
    let drawn = 0;
    list.sort((a, b) => ((b[1].flags & FLAG.donor) - (a[1].flags & FLAG.donor)) || b[1].kills - a[1].kills || b[1].hp - a[1].hp);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const fs = Math.max(10, 2.1 * u);
    ctx.font = `700 ${fs}px "Be Vietnam Pro","Segoe UI",sans-serif`;
    list.forEach(([id, e, r]) => {
      if (drawn >= limit) return;
      const p = toScreen(e.rx, e.ry + 2.6 * Math.max(1, Math.min(2.6, camR / 22)), e.rz);
      if (!p.visible || p.x < -50 || p.x > W + 50 || p.y < 0 || p.y > H) return;
      const box = [p.x - 6 * u, p.y - (drawn < 12 ? 7.5 : 3) * u, p.x + 6 * u, p.y + u];
      if (list.length > 12 && taken.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return;
      taken.push(box); const i = drawn++;
      const name = r.name.length > 14 ? r.name.slice(0, 13) + '…' : r.name;
      const bw = 7 * u, bh = Math.max(3, 0.7 * u);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(p.x - bw / 2, p.y, bw, bh);
      const share = Math.max(0, Math.min(1, e.hp / e.max));
      ctx.fillStyle = share > 0.5 ? '#22c55e' : share > 0.25 ? '#f59e0b' : '#ef4444'; ctx.fillRect(p.x - bw / 2, p.y, bw * share, bh);
      ctx.lineWidth = Math.max(2, 0.45 * u); ctx.strokeStyle = 'rgba(0,0,0,.75)';
      const label = (e.flags & FLAG.donor ? '🎁 ' : '') + name + (e.kills ? ` ⚔${e.kills}` : '');
      ctx.strokeText(label, p.x, p.y - 0.3 * u); ctx.fillStyle = e.flags & FLAG.donor ? '#fde68a' : CLASS_LABEL_COLORS[r.cls] || '#fff'; ctx.fillText(label, p.x, p.y - 0.3 * u);
      if (i < 12) {
        const img = avatarImg(r.avatar), s = 4 * u, ay = p.y - fs - 0.6 * u - s;
        ctx.save(); ctx.beginPath(); ctx.arc(p.x, ay + s / 2, s / 2, 0, Math.PI * 2); ctx.closePath();
        ctx.fillStyle = '#334155'; ctx.fill(); ctx.lineWidth = Math.max(2, 0.4 * u); ctx.strokeStyle = '#fff'; ctx.stroke();
        if (img) { ctx.clip(); ctx.drawImage(img, p.x - s / 2, ay, s, s); }
        else { ctx.fillStyle = '#fff'; ctx.font = `800 ${s * 0.5}px sans-serif`; ctx.textBaseline = 'middle'; ctx.fillText(r.name.slice(0, 1).toUpperCase(), p.x, ay + s / 2); ctx.textBaseline = 'bottom'; ctx.font = `700 ${fs}px "Be Vietnam Pro","Segoe UI",sans-serif`; }
        ctx.restore();
      }
    });
    // Zone labels in the lobby, storm candidates during the vote
    ctx.font = `900 ${3.2 * u}px "Be Vietnam Pro","Segoe UI",sans-serif`; ctx.textBaseline = 'middle';
    if (frame.phase === 'lobby' || frame.phase === 'drop') {
      const zones = { BẮC: [0, -32], NAM: [0, 32], ĐÔNG: [32, 0], TÂY: [-32, 0] };
      for (const [name, [x, z]] of Object.entries(zones)) {
        const p = toScreen(x, 1, z); if (!p.visible) continue;
        const count = frame.lobby?.zones?.[name === 'BẮC' ? 'bac' : name === 'NAM' ? 'nam' : name === 'ĐÔNG' ? 'dong' : 'tay'];
        ctx.lineWidth = Math.max(3, 0.6 * u); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(name, p.x, p.y); ctx.fillStyle = '#fff'; ctx.fillText(name, p.x, p.y);
        if (count != null) { ctx.font = `700 ${2.4 * u}px sans-serif`; ctx.strokeText(`${count} người`, p.x, p.y + 3.2 * u); ctx.fillText(`${count} người`, p.x, p.y + 3.2 * u); ctx.font = `900 ${3.2 * u}px "Be Vietnam Pro","Segoe UI",sans-serif`; }
      }
    }
    frame.storm.candidates.forEach(([x, z], i) => {
      const p = toScreen(x, 1, z); if (!p.visible) return;
      const text = `BÃO ${i + 1} · ${frame.storm.votes[i]}`;
      ctx.lineWidth = Math.max(3, 0.6 * u); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(text, p.x, p.y);
      ctx.fillStyle = ['#fbbf24', '#38bdf8', '#f472b6'][i]; ctx.fillText(text, p.x, p.y);
    });
  }

  const clock = new THREE.Clock();
  let focus = null;
  function loop() {
    const dt = Math.min(0.1, clock.getDelta()), time = clock.elapsedTime, now = performance.now();
    updateCamera(dt);
    updateStorm(time);
    updateEntities(now, time);
    renderer.render(scene, camera);
    drawLabels(now);
    if (focus && now < focus.until) {
      const e = [...roster.entries()].find(([, r]) => r.uniqueId === focus.uniqueId);
      const ent = e && ents.get(e[0]);
      if (ent) {
        const p = toScreen(ent.rx, ent.ry + 1, ent.rz), ctx = labelCanvas.getContext('2d'), u = container.clientWidth / 100;
        ctx.beginPath(); ctx.lineWidth = 0.6 * u; ctx.strokeStyle = '#fbbf24'; ctx.arc(p.x, p.y, (3 + Math.sin(time * 8)) * u, 0, Math.PI * 2); ctx.stroke();
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return { setRoster, setFrame, focus(uniqueId) { focus = { uniqueId, until: performance.now() + 5000 }; } };
}
