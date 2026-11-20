// The Bell farm, built for a 1997 console: textures drawn in code, props from boxes and cylinders,
// five sets (exterior, cornfield, interior, graveyard, face). film.js directs: each set's
// update(t, u, o) reads only its knobs `o` and time, and sets everything it shows.
import { THREE, mat, tex, speckle, boxUV, plane, mesh, paint, camera, look, lights, U } from '../lib/ps1.js';
import * as M from '../lib/motion.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const { clamp, lerp, noise1, hash01, mulberry32, TAU, E } = M;
const shade = (hex, k) => { const [r, g, b] = M.hexRgb(hex); return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`; };
const dummy = new THREE.Object3D();
const V3 = (a) => new THREE.Vector3(...a);

// ---------------------------------------------------------------- textures

export const TX = {};
function makeTextures() {
  TX.logs = tex(128, 128, (c, w, h) => {
    c.fillStyle = '#1c130c'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      const y0 = i * 32;
      c.fillStyle = '#77705f'; c.fillRect(0, y0, w, 5);            // chinking
      for (let y = 5; y < 32; y++) { c.fillStyle = shade('#6a4a30', 0.35 + 0.65 * Math.sin(((y - 5) / 27) * Math.PI)); c.fillRect(0, y0 + y, w, 1); }
    }
    speckle(c, w, h, ['#3a281a', '#7a5638', '#22170e', '#5c5548'], 11, 0.3);
    const r = mulberry32(5);
    for (let k = 0; k < 26; k++) { c.fillStyle = '#1a110a'; c.fillRect(Math.floor(r() * w), Math.floor(r() * 4) * 32 + 10 + Math.floor(r() * 14), 8 + Math.floor(r() * 30), 1); }
  });
  TX.planks = tex(128, 128, (c, w, h) => {
    for (let i = 0; i < 4; i++) {
      c.fillStyle = ['#4b3423', '#563c28', '#45301f', '#5a4029'][i]; c.fillRect(i * 32, 0, 32, h);
      c.fillStyle = '#160e08'; c.fillRect(i * 32, 0, 2, h);
    }
    speckle(c, w, h, ['#3a281a', '#6a4a30', '#2a1c12'], 21, 0.22);
    const r = mulberry32(8);
    for (let k = 0; k < 60; k++) { c.fillStyle = '#2b1d12'; c.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 6 + Math.floor(r() * 20)); }
    for (let i = 0; i < 8; i++) { c.fillStyle = '#120b06'; c.fillRect((i % 4) * 32 + 6 + Math.floor(r() * 18), Math.floor(r() * h), 3, 3); }
  });
  TX.door = tex(64, 128, (c, w, h) => {
    for (let i = 0; i < 4; i++) { c.fillStyle = ['#4f3725', '#5a3f2a', '#4a3322', '#553b27'][i]; c.fillRect(i * 16, 0, 16, h); c.fillStyle = '#140c07'; c.fillRect(i * 16, 0, 1, h); }
    speckle(c, w, h, ['#3a281a', '#6a4a30', '#2a1c12'], 4, 0.3);
    const r = mulberry32(44);
    for (let k = 0; k < 30; k++) { c.fillStyle = '#2b1d12'; c.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 6 + Math.floor(r() * 16)); }
    c.fillStyle = '#2e2016'; c.fillRect(0, 20, w, 8); c.fillRect(0, 100, w, 8);       // battens
    c.fillStyle = '#0e0e10'; c.fillRect(44, 60, 14, 5); c.fillRect(46, 56, 4, 13);     // latch
    c.fillStyle = '#5a5a5e'; c.fillRect(45, 60, 2, 2);
  });
  TX.dirt = tex(32, 32, (c, w, h) => { c.fillStyle = '#2b2219'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#3a2e22', '#1f1812', '#463829', '#2e3a22'], 31, 0.7); });
  TX.grass = tex(32, 32, (c, w, h) => { c.fillStyle = '#1d2216'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#2a3220', '#141810', '#38402a', '#3a3424'], 41, 0.8); });
  TX.stone = tex(64, 64, (c, w, h) => {
    c.fillStyle = '#2a2826'; c.fillRect(0, 0, w, h);
    const r = mulberry32(51);
    for (let y = 0; y < h; y += 10) for (let x = -((y / 10) % 2) * 8; x < w; x += 16) {
      c.fillStyle = shade('#6b665e', 0.55 + r() * 0.45); c.fillRect(x + 1, y + 1, 14 - Math.floor(r() * 3), 8);
    }
    speckle(c, w, h, ['#3d3a36', '#7c776d', '#1e1c1a'], 52, 0.25);
  });
  TX.shingle = tex(32, 32, (c, w, h) => {
    for (let y = 0; y < h; y += 8) for (let x = -((y / 8) % 2) * 4; x < w; x += 8) { c.fillStyle = shade('#3a2a1e', 0.6 + hash01(x * 7 + y, 3) * 0.4); c.fillRect(x, y, 7, 7); c.fillStyle = '#120c08'; c.fillRect(x, y + 7, 8, 1); }
  });
  TX.corn = tex(32, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#6e6a3c'; c.fillRect(15, 6, 2, 58);
    const r = mulberry32(61);
    for (let k = 0; k < 9; k++) {
      const y = 8 + k * 6 + Math.floor(r() * 3), dir = k % 2 ? 1 : -1, len = 9 + Math.floor(r() * 7);
      for (let i = 0; i < len; i++) { c.fillStyle = ['#7d7444', '#8c814c', '#5f5a33', '#a39159'][Math.floor(r() * 4)]; c.fillRect(16 + dir * (1 + i), y + Math.floor(i * i * 0.05) - 1, 1, 2); }
    }
    c.fillStyle = '#b19c5c'; c.fillRect(14, 0, 4, 7);               // tassel
    c.fillStyle = '#a58c4c'; c.fillRect(17, 26, 3, 9);              // an ear
  });
  TX.quilt = tex(32, 32, (c, w, h) => {
    const cols = ['#7a2a26', '#c9b58f', '#2e3a52', '#8a6a3a', '#5a2a3a', '#b9a27a'];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { c.fillStyle = cols[(x * 3 + y * 5 + x * y) % cols.length]; c.fillRect(x * 8, y * 8, 8, 8); c.fillStyle = 'rgba(20,12,8,0.6)'; c.fillRect(x * 8, y * 8, 8, 1); c.fillRect(x * 8, y * 8, 1, 8); }
    speckle(c, w, h, ['rgba(0,0,0,0.25)', 'rgba(255,240,220,0.12)'], 71, 0.3);
  });
  TX.cloth = tex(16, 16, (c, w, h) => { c.fillStyle = '#2a2420'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#1e1a16', '#3a322a', '#24201c'], 81, 0.8); });
  TX.wood = tex(32, 32, (c, w, h) => { c.fillStyle = '#4a3020'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#3a2416', '#5a3c26', '#2a1a10'], 91, 0.5); for (let y = 0; y < h; y += 4) { c.fillStyle = 'rgba(20,10,5,0.4)'; c.fillRect(0, y, w, 1); } });
  TX.skin = tex(64, 64, (c, w, h) => { c.fillStyle = '#9a9a86'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#8d8f7c', '#a1a08a', '#7a7a6a', '#8a7a6a', '#6a6a5c'], 101, 0.7); const r = mulberry32(102); for (let k = 0; k < 14; k++) { let x = r() * w, y = r() * h; c.fillStyle = 'rgba(70,40,50,0.5)'; for (let i = 0; i < 14; i++) { x += (r() - 0.5) * 3; y += 1; c.fillRect(Math.floor(x), Math.floor(y) % h, 1, 1); } } });
  // 4 flame frames side by side; the frame is picked with a material's uUvT
  TX.flame = tex(64, 32, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    for (let f = 0; f < 4; f++) {
      const r = mulberry32(200 + f);
      for (let y = 0; y < h; y++) {
        const k = y / h;                                           // 0 top .. 1 bottom
        const half = (k ** 0.8) * 7 * (0.7 + 0.3 * r()) + 0.5;
        const cx = f * 16 + 8 + Math.sin(k * 6 + f * 2) * (1 - k) * 2.5;
        for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
          const d = Math.abs(x - cx) / half;
          if (r() < 0.12 * (1 - k)) continue;
          c.fillStyle = d < 0.35 && k > 0.35 ? '#fff6c8' : d < 0.7 ? '#ffb43c' : '#d4501a';
          c.fillRect(x, y, 1, 1);
        }
      }
    }
  });
  TX.smoke = tex(16, 16, (c, w, h) => { c.clearRect(0, 0, w, h); const r = mulberry32(7); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - 7.5, y - 7.5) / 8; if (d < 1 && r() > d * 0.9) { c.fillStyle = shade('#8a8a86', 0.6 + 0.4 * r()); c.fillRect(x, y, 1, 1); } } });
  TX.moon = tex(32, 32, (c, w, h) => { c.clearRect(0, 0, w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - 15.5, y - 15.5); if (d < 14) { c.fillStyle = shade('#e9e0c9', 0.82 + 0.18 * hash01(x * 31 + y, 9) - (Math.hypot(x - 10, y - 12) < 4 || Math.hypot(x - 19, y - 19) < 3 ? 0.18 : 0)); c.fillRect(x, y, 1, 1); } } });
  TX.iron = tex(8, 8, (c, w, h) => { c.fillStyle = '#3a3836'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#5a5450', '#2a2220', '#6a4a30'], 111, 0.5); });
  TX.glass = tex(16, 16, (c, w, h) => { c.fillStyle = '#10140f'; c.fillRect(0, 0, w, h); c.fillStyle = '#4a5a48'; c.fillRect(3, 2, 2, 10); c.fillStyle = '#9fb59a'; c.fillRect(4, 3, 1, 3); });
  TX.window = tex(32, 32, (c, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - 16, y - 20) / 22; c.fillStyle = shade('#f2bc66', 1.05 - d * 0.55); c.fillRect(x, y, 1, 1); } c.fillStyle = '#1a120a'; c.fillRect(15, 0, 2, h); c.fillRect(0, 15, w, 2); c.fillRect(0, 0, w, 1); c.fillRect(0, h - 1, w, 1); c.fillRect(0, 0, 1, h); c.fillRect(w - 1, 0, 1, h); });
  TX.coldwin = tex(16, 16, (c, w, h) => { c.fillStyle = '#5a6a8a'; c.fillRect(0, 0, w, h); c.fillStyle = '#0c0e14'; c.fillRect(7, 0, 2, h); c.fillRect(0, 7, w, 2); speckle(c, w, h, ['#6a7a9a', '#48587a'], 131, 0.3); });
  TX.hair = tex(8, 32, (c, w, h) => { c.clearRect(0, 0, w, h); const r = mulberry32(141); for (let x = 0; x < w; x++) { const len = h - Math.floor(r() * 10); for (let y = 0; y < len; y++) { c.fillStyle = r() < 0.5 ? '#0c0b0a' : '#1c1a17'; c.fillRect(x, y, 1, 1); } } });
}

// ---------------------------------------------------------------- builders

function sky(top, mid, horizon, r = 120) {
  const g = new THREE.SphereGeometry(r, 16, 12);
  const cols = [top, mid, horizon].map((h) => new THREE.Color(h));
  paint(g, (x, y) => {
    const k = clamp(y / r);
    const c = k > 0.35 ? cols[1].clone().lerp(cols[0], (k - 0.35) / 0.65) : cols[2].clone().lerp(cols[1], k / 0.35);
    return [c.r, c.g, c.b];
  });
  const m = mesh(g, mat({ vertexColors: true, lit: 0, fog: 0, side: THREE.BackSide, warp: 0 }));
  m.userData.cols = cols;
  return m;
}
function recolorSky(m, top, mid, horizon) {
  const cols = [top, mid, horizon].map((h) => (h instanceof THREE.Color ? h : new THREE.Color(h)));
  const p = m.geometry.attributes.position, c = m.geometry.attributes.color, r = m.geometry.parameters.radius;
  for (let i = 0; i < p.count; i++) {
    const k = clamp(p.getY(i) / r);
    const cc = k > 0.35 ? cols[1].clone().lerp(cols[0], (k - 0.35) / 0.65) : cols[2].clone().lerp(cols[1], k / 0.35);
    c.setXYZ(i, cc.r, cc.g, cc.b);
  }
  c.needsUpdate = true;
}
function billboardQuad(w, h, m) {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(0, h / 2, 0);
  return new THREE.Mesh(g, m);
}
function faceCam(o, cam, yOnly = true) {
  if (yOnly) o.rotation.set(0, Math.atan2(cam.position.x - o.position.x, cam.position.z - o.position.z), 0);
  else o.quaternion.copy(cam.quaternion);
}

function bareTree(seed, h = 6) {
  const r = mulberry32(seed), parts = [];
  function branch(p, dir, len, rad, depth) {
    const g = new THREE.CylinderGeometry(rad * 0.6, rad, len, 5);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    g.applyQuaternion(q); g.translate(p.x, p.y, p.z);
    parts.push(g);
    if (depth <= 0) return;
    const end = p.clone().add(dir.clone().normalize().multiplyScalar(len));
    const n = depth > 2 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const d = dir.clone().normalize().add(new THREE.Vector3((r() - 0.5) * 1.6, 0.25 + r() * 0.4, (r() - 0.5) * 1.6)).normalize();
      branch(end.clone().add(dir.clone().normalize().multiplyScalar(-len * 0.15 * r())), d, len * (0.55 + r() * 0.2), rad * 0.6, depth - 1);
    }
  }
  branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3((r() - 0.5) * 0.2, 1, (r() - 0.5) * 0.2), h * 0.45, 0.22, 4);
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  return g;
}

// a person: 16 boxes. pose(o) sets walk phase, arm lifts, head turn. Returns group + pose().
export function figure({ coat = '#2a2420', skin = '#8c7a66', hat = true, dress = false, scale = 1, rifle = false, eyes = false } = {}) {
  const grp = new THREE.Group();
  const mc = mat({ map: TX.cloth, color: coat }), ms = mat({ color: skin, map: TX.skin }), mh = mat({ map: TX.cloth, color: '#18140f' });
  const hip = new THREE.Group(); hip.position.y = 0.95; grp.add(hip);
  const legs = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(0.11 * s, 0, 0); hip.add(p); mesh(boxUV(0.14, 0.95, 0.16, 0.5).translate(0, -0.47, 0), mh, [0, 0, 0], p); return p; });
  const torso = mesh(dress ? new THREE.CylinderGeometry(0.2, 0.42, 1.2, 7).translate(0, 0.2, 0) : boxUV(0.44, 0.7, 0.26, 0.5).translate(0, 0.35, 0), mc, [0, dress ? -0.25 : 0, 0], hip);
  if (dress) legs.forEach((l) => (l.visible = false));
  const chest = new THREE.Group(); chest.position.y = 0.66; hip.add(chest);
  const arms = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(0.27 * s, 0, 0); chest.add(p); mesh(boxUV(0.12, 0.66, 0.13, 0.5).translate(0, -0.33, 0), mc, [0, 0, 0], p); mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1).translate(0, -0.68, 0), ms, [0, 0, 0], p); return p; });
  const neck = new THREE.Group(); neck.position.y = 0.08; chest.add(neck);
  const head = mesh(new THREE.SphereGeometry(0.15, 6, 5).scale(1, 1.15, 1), ms, [0, 0.16, 0], neck);
  if (eyes) { const em = mat({ color: '#f2eedc', lit: 0, fog: 0.5 }); for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.045, 0.03, 0.02), em, [0.055 * s, 0.18, 0.14], neck); }
  if (hat && !dress) { mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 8), mh, [0, 0.3, 0], neck); mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.2, 7), mh, [0, 0.4, 0], neck); }
  if (dress) mesh(new THREE.SphereGeometry(0.19, 7, 5, 0, TAU, 0, Math.PI * 0.6).scale(1, 1.1, 1.15), mh, [0, 0.19, -0.02], neck);   // bonnet
  let gun = null;
  if (rifle) { gun = new THREE.Group(); arms[1].add(gun); mesh(new THREE.BoxGeometry(0.05, 0.05, 1.25).translate(0, 0, 0.35), mat({ map: TX.wood, color: '#5a3a24' }), [0, -0.62, 0], gun); mesh(new THREE.BoxGeometry(0.035, 0.035, 0.7).translate(0, 0.04, 0.6), mat({ map: TX.iron }), [0, -0.62, 0], gun); }
  grp.scale.setScalar(scale);
  const pose = ({ walk = 0, stride = 0, armL = 0, armR = 0, aim = 0, headYaw = 0, headPitch = 0, sit = 0, bob = true } = {}) => {
    const s = Math.sin(walk * TAU) * stride;
    legs[0].rotation.x = s * 0.5 - sit * 1.5; legs[1].rotation.x = -s * 0.5 - sit * 1.5;
    arms[0].rotation.x = -s * 0.4 - armL; arms[1].rotation.x = s * 0.4 - armR - aim * 1.45;
    arms[1].rotation.z = aim * 0.25;
    if (gun) gun.rotation.x = -0.15 + aim * 0.0;
    hip.position.y = 0.95 - sit * 0.45 + (bob ? Math.abs(Math.cos(walk * TAU)) * 0.03 * stride : 0);
    neck.rotation.set(headPitch, headYaw, 0);
  };
  pose();
  return { group: grp, pose, head, neck };
}

function creature() {
  const g = new THREE.Group();
  const m = mat({ map: TX.cloth, color: '#100c0a', fog: 0.45 });
  mesh(boxUV(0.34, 0.36, 1.05, 0.5), m, [0, 0.72, 0], g).rotation.x = -0.12;
  for (const [x, z] of [[-0.13, 0.4], [0.13, 0.4], [-0.13, -0.4], [0.13, -0.4]]) mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07).translate(0, -0.31, 0), m, [x, 0.66, z], g);
  const neck = new THREE.Group(); neck.position.set(0, 0.86, 0.5); g.add(neck);
  mesh(new THREE.BoxGeometry(0.16, 0.38, 0.16).translate(0, 0.17, 0.05), m, [0, 0, 0], neck).rotation.x = 0.5;
  const head = new THREE.Group(); head.position.set(0, 0.34, 0.2); neck.add(head);
  mesh(new THREE.BoxGeometry(0.22, 0.2, 0.3), m, [0, 0, 0.05], head);
  mesh(new THREE.BoxGeometry(0.12, 0.1, 0.16), m, [0, -0.04, 0.26], head);
  for (const s of [-1, 1]) { const e = mesh(new THREE.BoxGeometry(0.05, 0.55, 0.09).translate(0, 0.27, 0), m, [0.07 * s, 0.08, -0.04], head); e.rotation.set(-0.25, 0, 0.18 * s); }
  const eyeM = mat({ color: '#ff3a22', lit: 0, fog: 0 });
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.07, 0.05, 0.03), eyeM, [0.075 * s, 0.03, 0.21], head);
  mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5).translate(0, 0, -0.25), m, [0, 0.82, -0.52], g).rotation.x = 0.7;
  g.scale.setScalar(1.35);
  return { group: g, head, neck };
}

function cat() {
  const g = new THREE.Group();
  const m = mat({ map: TX.cloth, color: '#151210' });
  const body = new THREE.Group(); g.add(body);
  mesh(boxUV(0.14, 0.14, 0.36, 0.3), m, [0, 0.17, 0], body);
  for (const [x, z] of [[-0.05, 0.13], [0.05, 0.13], [-0.05, -0.13], [0.05, -0.13]]) mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), m, [x, 0.06, z], body);
  const head = new THREE.Group(); head.position.set(0, 0.28, 0.2); body.add(head);
  mesh(new THREE.BoxGeometry(0.13, 0.11, 0.11), m, [0, 0, 0], head);
  for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(0.035, 0.07, 4), m, [0.04 * s, 0.08, 0], head);
  const eyeM = mat({ color: '#c8d06a', lit: 0 });
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.025, 0.02, 0.01), eyeM, [0.03 * s, 0.01, 0.056], head);
  const tail = new THREE.Group(); tail.position.set(0, 0.2, -0.18); body.add(tail);
  mesh(new THREE.BoxGeometry(0.03, 0.03, 0.3).translate(0, 0, -0.15), m, [0, 0, 0], tail);
  return { group: g, body, head, tail };
}

// ---------------------------------------------------------------- EXTERIOR: the Bell cabin at night

export function exteriorSet() {
  const scene = new THREE.Scene(), cam = camera(50);
  const skyM = sky('#05060b', '#141a2a', '#2b3140');
  scene.add(skyM);
  const moon = billboardQuad(9, 9, mat({ map: TX.moon, lit: 0, fog: 0, warp: 0 }));
  moon.position.set(-40, 38, -70); scene.add(moon);
  mesh(plane(160, 160, 60, 60, 3).rotateX(-Math.PI / 2), mat({ map: TX.grass }), [0, 0, 0], scene);
  mesh(plane(14, 9, 6, 4, 0.7).rotateX(-Math.PI / 2), mat({ map: TX.dirt }), [0, 0.01, 3], scene);

  // the cabin: 7 x 5, logs, shingle roof, stone chimney on the east gable
  const cabin = new THREE.Group(); scene.add(cabin);
  const logM = mat({ map: TX.logs }), H = 2.7;
  mesh(boxUV(7, H, 0.3, 1.6), logM, [0, H / 2, -2.5], cabin);
  mesh(boxUV(0.3, H, 5, 1.6), logM, [-3.5, H / 2, 0], cabin);
  mesh(boxUV(0.3, H, 5, 1.6), logM, [3.5, H / 2, 0], cabin);
  // front wall with a door hole (x -1.6..-0.6) and a window hole (x 1.2..2.2, y 1.1..1.9)
  mesh(boxUV(1.9, H, 0.3, 1.6), logM, [-2.55, H / 2, 2.5], cabin);
  mesh(boxUV(1.8, H, 0.3, 1.6), logM, [0.3, H / 2, 2.5], cabin);
  mesh(boxUV(1.3, H, 0.3, 1.6), logM, [2.85, H / 2, 2.5], cabin);
  mesh(boxUV(1.0, 0.75, 0.3, 1.6), logM, [-1.1, 2.33, 2.5], cabin);
  mesh(boxUV(1.0, 1.1, 0.3, 1.6), logM, [1.7, 0.55, 2.5], cabin);
  mesh(boxUV(1.0, 0.8, 0.3, 1.6), logM, [1.7, 2.3, 2.5], cabin);
  for (const s of [-1, 1]) mesh(boxUV(0.2, 2.0, 5.1, 1.6), logM, [3.5 * s, H + 0.85, 0], cabin).scale.set(1, 1, 1);
  // gables as triangles
  const gable = new THREE.BufferGeometry();
  gable.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -2.6, 0, 0, 2.6, 0, 2.0, 0], 3));
  gable.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 3, 0, 1.5, 1.2], 2));
  gable.computeVertexNormals();
  for (const s of [-1, 1]) { const gm = mesh(gable.clone(), mat({ map: TX.logs, side: THREE.DoubleSide }), [3.52 * s, H, 0], cabin); }
  const roofM = mat({ map: TX.shingle, side: THREE.DoubleSide });
  for (const s of [-1, 1]) { const r = mesh(uvScale(new THREE.PlaneGeometry(7.8, 3.4), 7, 3), roofM, [0, H + 1.0, 1.3 * s], cabin); r.rotation.x = -Math.PI / 2 + s * (Math.PI / 2 - 0.66) * 1; r.rotation.x = s > 0 ? -0.66 - Math.PI / 2 + Math.PI : 0.66 + Math.PI / 2 - Math.PI; }
  // fix roof orientation explicitly: two planes leaning on the ridge
  cabin.children.slice(-2).forEach((r, i) => { const s = i ? 1 : -1; r.rotation.set(-Math.PI / 2 + s * -0.72, 0, 0); r.position.set(0, H + 0.92, 1.25 * s); });
  const chim = new THREE.Group(); chim.position.set(3.95, 0, 0); cabin.add(chim);
  const stoneM = mat({ map: TX.stone });
  mesh(boxUV(1.2, 3.2, 1.4, 1), stoneM, [0, 1.6, 0], chim);
  mesh(boxUV(0.8, 2.8, 0.9, 1), stoneM, [0, 4.6, 0], chim);
  const door = new THREE.Group(); door.position.set(-1.6, 0, 2.5); cabin.add(door);
  mesh(boxUV(1.0, 1.95, 0.08).translate(0.5, 0.975, 0), mat({ map: TX.door }), [0, 0, 0], door);
  const winM = mat({ map: TX.window, lit: 0, color: '#ffffff' });
  const win = mesh(new THREE.PlaneGeometry(1.0, 0.8), winM, [1.7, 1.5, 2.42], cabin);
  // something behind the glass: a pale long face, drawn once, faded in by o.ghost
  const gt = tex(32, 32, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot((x - 15.5) / 9, (y - 17) / 14);
      if (d > 1) continue;
      const eye = Math.hypot(x - 11.5, y - 13) < 2.3 || Math.hypot(x - 19.5, y - 13) < 2.3;
      const mouth = Math.hypot((x - 15.5) / 3, (y - 24) / 3.6) < 1;
      c.fillStyle = eye || mouth ? '#050404' : shade('#c9c6b2', 0.75 + 0.25 * hash01(x + y * 32, 5) - d * 0.3);
      c.fillRect(x, y, 1, 1);
    }
  });
  const ghostM = mat({ map: gt, lit: 0, fog: 0.4, alphaTest: 0.5, color: '#000000' });
  const ghostFace = mesh(new THREE.PlaneGeometry(0.42, 0.62), ghostM, [1.6, 1.47, 2.428], cabin);
  mesh(boxUV(1.2, 0.1, 0.4, 0.5), mat({ map: TX.wood }), [1.7, 1.08, 2.62], cabin);
  // porch posts + a lantern by the door
  for (const x of [-3.2, -0.4]) mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 5), mat({ map: TX.wood }), [x, 1.2, 3.6], cabin);
  mesh(uvScale(new THREE.PlaneGeometry(3.4, 1.4), 3, 1), roofM, [-1.8, 2.45, 3.1], cabin).rotation.x = -Math.PI / 2 - 0.35;
  const lantern = mesh(new THREE.BoxGeometry(0.16, 0.24, 0.16), mat({ color: '#ffcc66', lit: 0 }), [-0.3, 1.85, 2.75], cabin);
  // split-rail fence
  const railM = mat({ map: TX.wood, color: '#8a7a6a' });
  for (let i = 0; i < 16; i++) {
    const x = -14 + i * 1.9, z = 7 + (i % 2) * 0.5;
    mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), railM, [x, 0.55, z], scene);
    for (const y of [0.45, 0.85]) { const r = mesh(new THREE.BoxGeometry(2.1, 0.07, 0.07), railM, [x + 0.95, y, z + 0.25 - (i % 2) * 0.5], scene); r.rotation.y = i % 2 ? 0.26 : -0.26; }
  }
  // trees
  const treeM = mat({ color: '#141210' });
  for (let i = 0; i < 9; i++) { const r = mulberry32(300 + i); const t = mesh(bareTree(400 + i, 6 + r() * 4), treeM, [(r() - 0.5) * 50, 0, -12 - r() * 25], scene); if (Math.abs(t.position.x) < 8) t.position.x += 12 * Math.sign(t.position.x || 1); }
  mesh(bareTree(77, 9), treeM, [-7.5, 0, -1], scene);
  mesh(bareTree(78, 7), treeM, [8.5, 0, 3], scene);
  // the corn beyond the fence
  const corn = cornPatch(-30, 30, -34, -10, 1.1, 1.0, 909);
  scene.add(corn);
  // blue fire out of the chimney: flame cards
  const blueM = mat({ map: TX.flame, lit: 0, color: '#9ff0ff', fog: 0.2, side: THREE.DoubleSide, warp: 0 });
  const flames = [0, 1, 2, 3].map((i) => { const f = billboardQuad(2.4, 6.5, blueM.clone()); f.material.uniforms.uUvT.value.set(0.25, 1, i * 0.25, 0); f.position.set(3.95 + (i - 1.5) * 0.15, 6.0, 0); scene.add(f); return f; });
  const smokeM = mat({ map: TX.smoke, color: '#5a5e66', alphaTest: 0.5, side: THREE.DoubleSide });
  const smoke = [0, 1, 2, 3, 4, 5].map(() => { const s = billboardQuad(1, 1, smokeM); scene.add(s); return s; });

  return {
    scene, camera: cam, door, cabin,
    update(t, u, o = {}) {
      const c = o.cam || [[0, 1.7, 14], [0, 1.4, 0], 50, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 50);
      const winOn = o.window ?? 1, blue = o.blue ?? 0;
      winM.uniforms.uColor.value.setScalar(lerp(0.06, 1, winOn) * (1 - 0.15 * Math.max(0, noise1(t * 9, 4))));
      lantern.visible = (o.lantern ?? 1) > 0.5;
      const gh = clamp(o.ghost ?? 0);
      ghostFace.visible = gh > 0.01;
      ghostM.uniforms.uColor.value.setScalar(gh * 0.9);
      // door shudder on a knock: o.knock = beats since the last knock
      const kk = o.knock != null ? Math.exp(-o.knock * 7) : 0;
      door.rotation.y = -kk * 0.06 * Math.sin((o.knock ?? 0) * 60);
      door.position.z = 2.5 + kk * 0.03;
      const fl = 1 + 0.25 * noise1(t * 7, 3);
      lights({
        amb: [0.07, 0.08, 0.12], dir: [0.5, -0.6, 0.6], dirCol: [0.22, 0.26, 0.4],
        points: [
          { pos: [1.7, 1.5, 3.5], col: [1.2 * winOn * fl, 0.75 * winOn * fl, 0.35 * winOn * fl], r: 7 },
          { pos: [-0.3, 1.85, 3.2], col: lantern.visible ? [1.3 * fl, 0.85 * fl, 0.4 * fl] : [0, 0, 0], r: 6 },
          { pos: [3.95, 6.5, 0], col: [0.6 * blue, 2.2 * blue, 2.8 * blue], r: 16 },
        ],
        fog: o.fogCol || [0.11, 0.13, 0.18], near: o.near ?? 6, far: o.far ?? 46,
      });
      U.uWind.value = 0.04;
      flames.forEach((f, i) => {
        f.visible = blue > 0.01;
        const k = (blue * (1.3 + 0.5 * noise1(t * 10 + i * 3, 7)));
        f.scale.set(k, k * (1.4 + 0.6 * noise1(t * 6 + i, 2)), k);
        f.material.uniforms.uUvT.value.set(0.25, 1, ((Math.floor(t * 14) + i) % 4) * 0.25, 0);
        faceCam(f, cam);
      });
      // chimney smoke (normal nights): slow puffs
      smoke.forEach((s, i) => {
        const ph = ((t * 0.12 + i / smoke.length) % 1);
        s.visible = (o.smoke ?? 1) > 0.5 && blue < 0.05;
        s.position.set(3.95 + ph * 2.5 + Math.sin(i + ph * 3) * 0.3, 6.1 + ph * 5, ph * -1.5);
        s.scale.setScalar(0.6 + ph * 2.2);
        faceCam(s, cam);
      });
      faceCam(moon, cam);
      if (o.sky) recolorSky(skyM, ...o.sky);
    },
  };
}
function uvScale(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }

// corn stalks: two crossed cards each, instanced, swaying with uWind
function cornPatch(x0, x1, z0, z1, dx, dz, seed, { rowGap = null, h = 2.3 } = {}) {
  const card = new THREE.PlaneGeometry(1.0, h).translate(0, h / 2, 0);
  const g = mergeGeometries([card, card.clone().rotateY(Math.PI / 2)]);
  const m = mat({ map: TX.corn, side: THREE.DoubleSide, sway: 0.55, alphaTest: 0.5 });
  const pts = [];
  const r = mulberry32(seed);
  for (let x = x0; x <= x1; x += dx) for (let z = z0; z <= z1; z += dz) {
    if (rowGap && Math.abs(x - rowGap[0]) < rowGap[1]) continue;
    pts.push([x + (r() - 0.5) * 0.35, z + (r() - 0.5) * 0.35, r() * TAU, 0.8 + r() * 0.4]);
  }
  const im = new THREE.InstancedMesh(g, m, pts.length);
  pts.forEach(([x, z, a, s], i) => { dummy.position.set(x, 0, z); dummy.rotation.set(0, a, 0); dummy.scale.set(s, s * (0.9 + 0.2 * hash01(i, 5)), s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
  im.instanceMatrix.needsUpdate = true;
  im.frustumCulled = false;
  return im;
}

// ---------------------------------------------------------------- CORNFIELD: dusk, John Bell, the creature

export function cornSet() {
  const scene = new THREE.Scene(), cam = camera(50);
  const skyM = sky('#120d18', '#3a1f22', '#8a4a26');
  scene.add(skyM);
  mesh(plane(200, 200, 80, 80, 4).rotateX(-Math.PI / 2), mat({ map: TX.dirt }), [0, 0, 0], scene);
  // rows run along -z; the camera's row is x = 0 (kept clear)
  scene.add(cornPatch(-14, 14, -90, 8, 1.0, 0.9, 1201, { rowGap: [0, 0.6], h: 2.4 }));
  const treeM = mat({ color: '#0d0b0a' });
  for (let i = 0; i < 10; i++) { const r = mulberry32(500 + i); mesh(bareTree(600 + i, 7 + r() * 5), treeM, [(r() - 0.5) * 60, 0, -95 - r() * 20], scene); }
  const sun = billboardQuad(14, 14, mat({ map: TX.moon, lit: 0, fog: 0, color: '#d06a3a', warp: 0 }));
  sun.position.set(0, -2, -150); scene.add(sun);
  const farmer = figure({ coat: '#3a2c20', rifle: true });
  scene.add(farmer.group);
  const beast = creature();
  scene.add(beast.group);
  const flashM = mat({ color: '#fff0b0', lit: 0, fog: 0, side: THREE.DoubleSide, warp: 0 });
  const flash = new THREE.Mesh(new THREE.CircleGeometry(0.35, 7), flashM); scene.add(flash);
  const smokeM = mat({ map: TX.smoke, color: '#9a968e', side: THREE.DoubleSide });
  const puffs = [0, 1, 2, 3, 4, 5, 6, 7].map(() => { const s = billboardQuad(1, 1, smokeM); scene.add(s); return s; });

  return {
    scene, camera: cam, farmer, beast,
    update(t, u, o = {}) {
      const c = o.cam || [[0, 1.6, 6], [0, 1.4, -10], 50, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 50);
      // farmer
      const f = o.farmer || { x: 0, z: -2, walk: 0, stride: 0 };
      farmer.group.visible = f.visible ?? true;
      farmer.group.position.set(f.x, 0, f.z);
      farmer.group.rotation.y = f.yaw ?? Math.PI;
      farmer.pose({ walk: f.walk, stride: f.stride ?? 0, aim: f.aim ?? 0, armL: (f.aim ?? 0) * 1.2, headYaw: f.headYaw ?? 0 });
      if (f.recoil) farmer.group.position.z += f.recoil * 0.08;
      // creature
      const b = o.beast || { visible: false };
      beast.group.visible = !!b.visible;
      beast.group.position.set(b.x ?? 0, 0, b.z ?? -16);
      beast.group.rotation.y = b.yaw ?? 0;
      beast.head.rotation.set(0.15 * noise1(t * 3, 8) + (b.look ?? 0), 0.5 * Math.max(0, noise1(t * 1.3, 2)) * (b.twitch ?? 1), 0.6 * Math.max(0, noise1(t * 5, 9)) ** 3);
      // muzzle flash + smoke
      const fl = o.flash ?? 0;
      flash.visible = fl > 0.02;
      if (flash.visible) { const p = o.flashAt || [0, 1.5, -3]; flash.position.set(...p); flash.scale.setScalar(0.4 + fl * 1.6); flash.quaternion.copy(cam.quaternion); }
      const sm = o.smoke ?? -1;
      puffs.forEach((s, i) => {
        s.visible = sm >= 0;
        const p = o.flashAt || [0, 1.5, -3];
        const k = Math.max(0, sm - i * 0.03);
        s.position.set(p[0] + Math.sin(i * 2.1) * (0.2 + k * 0.5), p[1] - 0.3 + k * 0.6 + Math.cos(i) * 0.1, p[2] - 0.3 - k * (1.2 + i * 0.25));
        s.scale.setScalar(0.3 + k * 1.3 + i * 0.05);
        faceCam(s, cam);
      });
      // sky: dusk -> night -> day (the flyback cycles it)
      const skyK = o.sky ?? 0;
      if (o.skyCols) recolorSky(skyM, ...o.skyCols);
      faceCam(sun, cam);
      const day = o.day ?? 0;
      lights({
        amb: [lerp(0.12, 0.35, day), lerp(0.08, 0.33, day), lerp(0.1, 0.3, day)], dir: [0, -0.35, -1], dirCol: [lerp(0.8, 0.5, day), lerp(0.36, 0.5, day), lerp(0.18, 0.45, day)],
        points: [{ pos: o.flashAt || [0, 1.5, -3], col: [3 * fl, 2.4 * fl, 1.2 * fl], r: 14 }],
        fog: o.fog || [0.32, 0.18, 0.14], near: o.near ?? 3, far: o.far ?? 34,
      });
      U.uWind.value = o.wind ?? 0.08;
      sun.visible = skyK < 0.5;
    },
  };
}

// ---------------------------------------------------------------- INTERIOR: one room, many nights

export function interiorSet() {
  const scene = new THREE.Scene(), cam = camera(55);
  const W2 = 3.6, D2 = 2.6, H = 2.7;
  const logM = mat({ map: TX.logs });
  mesh(plane(W2 * 2, D2 * 2, 5, 4, 0.4).rotateX(-Math.PI / 2), mat({ map: TX.planks }), [0, 0, 0], scene);
  mesh(plane(W2 * 2, D2 * 2, 5, 4, 0.6).rotateX(Math.PI / 2), mat({ map: TX.planks, color: '#6a6a6a' }), [0, H, 0], scene);
  const back = mesh(boxUV(W2 * 2, H, 0.2, 1.4, 0.35), logM, [0, H / 2, -D2 - 0.1], scene);
  mesh(boxUV(W2 * 2, H, 0.2, 1.4, 0.35), logM, [0, H / 2, D2 + 0.1], scene);
  mesh(boxUV(0.2, H, D2 * 2, 1.4, 0.35), logM, [-W2 - 0.1, H / 2, 0], scene);
  // right wall with a window hole (z -0.4..0.6, y 1.1..1.9)
  mesh(boxUV(0.2, H, 2.2, 1.4, 0.35), logM, [W2 + 0.1, H / 2, -1.5], scene);
  mesh(boxUV(0.2, H, 2.0, 1.4, 0.35), logM, [W2 + 0.1, H / 2, 1.6], scene);
  mesh(boxUV(0.2, 1.1, 1.0, 1.4), logM, [W2 + 0.1, 0.55, 0.1], scene);
  mesh(boxUV(0.2, 0.8, 1.0, 1.4), logM, [W2 + 0.1, 2.3, 0.1], scene);
  const idoor = new THREE.Group(); idoor.position.set(-1.1, 0, D2 - 0.005); scene.add(idoor);
  mesh(plane(1.0, 1.95, 1, 1, 0.3).rotateY(Math.PI).translate(0, 0.975, 0), mat({ map: TX.door }), [0, 0, 0], idoor);
  const gapM = mat({ color: '#ffc870', lit: 0, fog: 0 });
  const gap = mesh(new THREE.PlaneGeometry(1.0, 0.025).rotateY(Math.PI), gapM, [0, 0.012, -0.004], idoor);
  const winM = mat({ map: TX.coldwin, lit: 0 });
  mesh(new THREE.PlaneGeometry(1.0, 0.8).rotateY(-Math.PI / 2), winM, [W2 + 0.05, 1.5, 0.1], scene);
  for (let x = -3; x <= 3; x += 1.5) mesh(boxUV(0.18, 0.18, D2 * 2, 0.6), mat({ map: TX.wood }), [x, H - 0.09, 0], scene);

  // the hearth on the back wall, centre x = 0.6
  const hx = 0.6, stoneM = mat({ map: TX.stone });
  const hearth = new THREE.Group(); hearth.position.set(hx, 0, -D2 + 0.25); scene.add(hearth);
  mesh(boxUV(0.45, 1.2, 0.6, 0.8), stoneM, [-0.75, 0.6, 0], hearth);
  mesh(boxUV(0.45, 1.2, 0.6, 0.8), stoneM, [0.75, 0.6, 0], hearth);
  const lintel = mesh(boxUV(1.95, 0.5, 0.62, 0.8), stoneM, [0, 1.45, 0], hearth);
  mesh(boxUV(1.5, 1.0, 0.5, 0.8), stoneM, [0, 2.2, -0.05], hearth);
  mesh(boxUV(2.2, 0.12, 0.75, 0.8), mat({ map: TX.wood }), [0, 1.74, 0.05], hearth);
  mesh(new THREE.PlaneGeometry(1.1, 1.2), mat({ color: '#070504', lit: 0 }), [0, 0.6, -0.25], hearth);
  mesh(boxUV(1.4, 0.06, 0.7, 0.6), stoneM, [0, 0.03, 0.2], hearth);
  // the mouth: stone teeth that grow down from the lintel when the room breathes
  const toothM = mat({ map: TX.stone, color: '#b0a89a' });
  const teeth = [];
  for (let i = 0; i < 8; i++) { const tth = mesh(new THREE.ConeGeometry(0.075, 0.42, 4).rotateX(Math.PI).translate(0, -0.21, 0), toothM, [-0.47 + i * 0.135, 1.2, 0.2], hearth); teeth.push(tth); }
  for (let i = 0; i < 7; i++) { const tth = mesh(new THREE.ConeGeometry(0.07, 0.36, 4).translate(0, 0.18, 0), toothM, [-0.4 + i * 0.135, 0.06, 0.25], hearth); teeth.push(tth); }
  for (const [x, z, r] of [[-0.2, 0, 0.3], [0.15, 0.05, -0.4]]) mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 5).rotateZ(Math.PI / 2), mat({ map: TX.wood }), [x, 0.12, z], hearth).rotation.y = r;
  const fireM = [0, 1, 2].map(() => mat({ map: TX.flame, lit: 0, fog: 0.3, side: THREE.DoubleSide, warp: 0 }));
  const flames = fireM.map((m, i) => { const f = billboardQuad(0.55, 0.8, m); f.position.set(-0.22 + i * 0.22, 0.1, 0.05); hearth.add(f); return f; });

  // the children's bed, west wall
  const bed = new THREE.Group(); bed.position.set(-2.5, 0, -0.6); scene.add(bed);
  const woodM = mat({ map: TX.wood });
  const posts = [];
  for (const [x, z] of [[-0.55, -1.0], [0.55, -1.0], [-0.55, 1.0], [0.55, 1.0]]) posts.push(mesh(new THREE.CylinderGeometry(0.05, 0.06, z < 0 ? 1.3 : 0.9, 6).translate(0, z < 0 ? 0.65 : 0.45, 0), woodM, [x, 0, z], bed));
  mesh(boxUV(1.1, 0.1, 2.0, 0.5), woodM, [0, 0.38, 0], bed);
  mesh(boxUV(1.0, 0.16, 1.9, 0.5), mat({ color: '#c8bca0', map: TX.cloth }), [0, 0.5, 0], bed);
  mesh(boxUV(1.1, 0.5, 0.06, 0.5), woodM, [0, 0.95, -1.0], bed);
  mesh(new THREE.BoxGeometry(0.5, 0.12, 0.28), mat({ color: '#d8cfb8' }), [0, 0.64, -0.75], bed);
  // the quilt: a 10x10 grid whose vertices are placed from the slide amount each frame
  const QN = 10, quiltG = new THREE.PlaneGeometry(1.3, 1.6, QN, QN);
  uvScale(quiltG, 2, 2.4);
  const quilt = mesh(quiltG, mat({ map: TX.quilt, side: THREE.DoubleSide }), [0, 0, 0], bed);
  const qBase = Float32Array.from(quiltG.attributes.position.array);
  // chips from the gnawed bedpost
  const chipM = mat({ color: '#b08a5a' });
  const chips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.015, 0.02), chipM, 24); chips.frustumCulled = false; bed.add(chips);
  const gnawPost = posts[2];
  const gnawMark = mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.12, 6), mat({ color: '#c09a6a' }), [-0.55, 0.62, 1.0], bed);

  // candle on a stool by the bed
  const stool = new THREE.Group(); stool.position.set(-1.6, 0, 0.75); scene.add(stool);
  mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 7), woodM, [0, 0.55, 0], stool);
  for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(0.04, 0.55, 0.04), woodM, [Math.cos(i * 2.1) * 0.14, 0.27, Math.sin(i * 2.1) * 0.14], stool);
  mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.18, 6), mat({ color: '#e0d6b8' }), [0, 0.67, 0], stool);
  const candleM = mat({ map: TX.flame, lit: 0, side: THREE.DoubleSide, warp: 0 });
  const candle = billboardQuad(0.08, 0.14, candleM); candle.position.set(0, 0.76, 0); stool.add(candle);
  const wispM = mat({ map: TX.smoke, color: '#8a8680', side: THREE.DoubleSide });
  const wisps = [0, 1, 2, 3].map(() => { const s = billboardQuad(0.12, 0.12, wispM); stool.add(s); return s; });

  // rocking chair by the hearth, and John Bell in it
  const chair = new THREE.Group(); chair.position.set(1.9, 0, -0.9); chair.rotation.y = -2.3; scene.add(chair);
  const rock = new THREE.Group(); chair.add(rock);
  mesh(boxUV(0.55, 0.06, 0.5, 0.5), woodM, [0, 0.45, 0], rock);
  for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(0.05, 0.75, 0.03), woodM, [-0.22 + i * 0.11, 0.85, -0.24], rock).rotation.x = -0.15;
  mesh(new THREE.BoxGeometry(0.6, 0.06, 0.05), woodM, [0, 1.22, -0.29], rock);
  for (const s of [-1, 1]) {
    for (const z of [-0.2, 0.2]) mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), woodM, [0.25 * s, 0.24, z], rock);
    for (let k = 0; k < 5; k++) { const a = (k - 2) * 0.18; mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), woodM, [0.25 * s, 0.05 + 0.25 * (1 - Math.cos(a)), Math.sin(a) * 1.2 * 0.5], rock).rotation.x = a; }
    mesh(new THREE.BoxGeometry(0.05, 0.05, 0.45), woodM, [0.27 * s, 0.68, 0.02], rock);
  }
  const bell = figure({ coat: '#2f2a24', hat: false, skin: '#8c7c68' });
  bell.group.position.set(0, 0.0, 0.02); rock.add(bell.group);

  // the cupboard, east of the hearth, with the vial
  const cup = new THREE.Group(); cup.position.set(2.75, 0, -2.25); scene.add(cup);
  mesh(boxUV(1.1, 1.9, 0.5, 0.6), woodM, [0, 0.95, 0], cup);
  mesh(plane(0.96, 1.2, 2, 2, 0.15), mat({ map: TX.planks, color: '#6a5a50' }), [0, 1.2, -0.2], cup);
  mesh(boxUV(0.96, 0.04, 0.4, 0.6), woodM, [0, 1.15, 0.05], cup);
  const doors = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(0.5 * s, 1.2, 0.26); cup.add(p); mesh(boxUV(0.5, 1.22, 0.04, 0.6).translate(-0.25 * s, 0, 0.02), mat({ map: TX.planks }), [0, 0, 0], p); return { p, s }; });
  for (let i = 0; i < 4; i++) mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 6), mat({ color: ['#5a5a4a', '#6a4a2a', '#3a4a3a', '#7a6a5a'][i] }), [-0.35 + i * 0.12 + (i > 1 ? 0.25 : 0), 1.25, 0.08], cup);
  const vial = new THREE.Group(); vial.scale.setScalar(1.7); scene.add(vial);
  const vialM = mat({ map: TX.glass, color: '#ffffff' });
  mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.14, 6), vialM, [0, 0.07, 0], vial);
  mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.05, 5), vialM, [0, 0.165, 0], vial);
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.025, 5), mat({ color: '#6a4a2a' }), [0, 0.2, 0], vial);
  const glint = mesh(new THREE.BoxGeometry(0.006, 0.03, 0.006), mat({ color: '#e8f0e0', lit: 0 }), [0.03, 0.1, 0.035], vial);
  mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.09, 6), mat({ color: '#1e3a1c', emissive: '#0a1a08', lit: 0.6 }), [0, 0.05, 0], vial);
  const drop = mesh(new THREE.SphereGeometry(0.018, 4, 3).scale(1, 1.5, 1), mat({ color: '#0e1a0c', lit: 0.5 }), [0, 0, 0], scene);
  const kitty = cat(); kitty.group.position.set(-0.4, 0, -1.5); kitty.group.rotation.y = 0.4; scene.add(kitty.group);

  // chains: 36 links dragged along the floor toward the hearth
  const linkG = new THREE.TorusGeometry(0.07, 0.022, 4, 8);
  const chain = new THREE.InstancedMesh(linkG, mat({ map: TX.iron, color: '#9a8a7a' }), 36); chain.frustumCulled = false; scene.add(chain);

  // scratch decal on the back wall, west of the hearth: claw rakes that turn out to spell KATE
  const scr = tex(256, 96, () => {});
  const scrM = mat({ map: scr, alphaTest: 0.5, lit: 1 });
  const scratchPlane = mesh(plane(2.6, 0.98, 1, 1, 0.2), scrM, [-1.75, 1.55, -D2 + 0.005], scene);
  const strokes = kateStrokes();
  let scrLast = -1;
  // the shadows on the east wall by the fire
  const sh = tex(128, 96, () => {});
  const shM = mat({ map: sh, alphaTest: 0.5, lit: 0, fog: 1, color: '#ffffff', transparent: true, opacity: 0.85 });
  const shadowPlane = mesh(new THREE.PlaneGeometry(2.6, 1.95).rotateY(-Math.PI / 2), shM, [W2 - 0.005, 1.25, -1.1], scene);
  let shLast = '';

  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      const c = o.cam || [[0, 1.6, 2.3], [0, 1.2, -2], 55, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 55);
      const fire = o.fire ?? 1, blue = o.blue ?? 0, cand = o.candle ?? 1;
      const flick = 1 + 0.22 * noise1(t * 8, 1) + 0.1 * noise1(t * 23, 2);
      // fire: orange, or erupting blue
      flames.forEach((f, i) => {
        f.visible = fire > 0.02 || blue > 0.02;
        const k = fire * (0.8 + 0.3 * noise1(t * 9 + i * 4, 3)) + blue * (2.6 + 0.8 * noise1(t * 14 + i, 5));
        f.scale.set(0.8 + blue * 1.2, k, 1);
        f.position.y = 0.1;
        fireM[i].uniforms.uUvT.value.set(0.25, 1, ((Math.floor(t * 12) + i * 2) % 4) * 0.25, 0);
        fireM[i].uniforms.uColor.value.setRGB(lerp(1, 0.45, blue), lerp(1, 1.0, blue), lerp(1, 1.4, blue));
        faceCam(f, cam);
      });
      const mouth = o.mouth ?? 0;
      teeth.forEach((tt, i) => { tt.visible = mouth > 0.02; tt.scale.set(1, mouth * (0.8 + 0.4 * hash01(i, 4)), 1); });
      hearth.scale.set(1 + mouth * 0.12, 1 + mouth * 0.35, 1);
      // knock: the back wall jumps
      const kk = o.knock != null ? Math.exp(-o.knock * 9) : 0;
      const kz = kk * 0.05 * Math.sin((o.knock ?? 0) * 70);
      const dk = o.doorKnock != null ? Math.exp(-o.doorKnock * 8) : 0;
      idoor.position.z = D2 - 0.005 - dk * 0.04 * Math.abs(Math.sin((o.doorKnock ?? 0) * 50));
      gapM.uniforms.uColor.value.setScalar(o.doorGap ?? 0.0);
      back.position.z = -D2 - 0.1 + kz;
      scratchPlane.position.z = -D2 + 0.005 + kz;
      // quilt slide: s in 0..1 moves it off the east side of the bed and onto the floor
      const qs = E.inOutCubic(clamp(o.quilt ?? 0)) * 1.9, pa = quiltG.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const lx = qBase[i * 3], lz = -qBase[i * 3 + 1];
        let x = lx + qs, y = 0.62, z = lz;
        const edge = 0.58;
        if (x > edge) { const over = x - edge; if (over < 0.6) { x = edge + 0.02 + over * 0.12; y = 0.62 - over; } else { x = edge + 0.09 + (over - 0.6); y = 0.02; } }
        else if (x < -0.58) { const over = -0.58 - x; x = -0.6 - over * 0.1; y = 0.62 - Math.min(over, 0.4); }
        y += 0.015 * Math.sin(lx * 9 + lz * 7);
        pa.setXYZ(i, x, y, z);
      }
      pa.needsUpdate = true; quiltG.computeVertexNormals();
      // gnawing: chips spit from the footpost
      const gn = o.gnaw ?? -1;
      gnawMark.visible = gn >= 0;
      for (let i = 0; i < 24; i++) {
        const t0 = i * 0.07, a = gn - t0;
        if (gn < 0 || a < 0 || a > 0.9) { dummy.scale.setScalar(0); }
        else {
          const r1 = hash01(i, 11), r2 = hash01(i, 12);
          dummy.position.set(-0.55 + (r1 - 0.5) * 0.4 * a * 3, 0.62 + a * (1.4 - 4.9 * a) * 0.5 + 0.0, 1.0 + 0.05 + r2 * 0.5 * a * 2);
          if (dummy.position.y < 0.01) dummy.position.y = 0.01;
          dummy.rotation.set(a * 20 * r1, a * 13, a * 9 * r2); dummy.scale.setScalar(1);
        }
        dummy.updateMatrix(); chips.setMatrixAt(i, dummy.matrix);
      }
      chips.instanceMatrix.needsUpdate = true;
      // candle + snuff wisps
      candle.visible = cand > 0.5;
      candleM.uniforms.uUvT.value.set(0.25, 1, (Math.floor(t * 10) % 4) * 0.25, 0);
      faceCam(candle, cam);
      wisps.forEach((w, i) => {
        const s = o.snuff ?? -1, a = s - i * 0.12;
        w.visible = s >= 0 && a > 0 && a < 1.6;
        w.position.set(Math.sin(a * 3 + i) * 0.04, 0.78 + a * 0.35, 0);
        w.scale.setScalar(0.6 + a * 1.2); faceCam(w, cam);
      });
      // chair + Bell
      rock.rotation.x = (o.rock ?? 0) * Math.sin(t * 2.4);
      bell.group.visible = (o.bell ?? 1) > 0.5;
      bell.pose({ sit: 1, armL: -0.3, armR: -0.3, headPitch: 0.25, bob: false });
      // cupboard + vial
      const op = E.outBack(clamp(o.cupboard ?? 0), 1.2);
      doors.forEach(({ p, s }) => (p.rotation.y = s * op * 1.9));
      const v = o.vial || { pos: [2.75, 1.26, -2.02] };
      vial.visible = v.visible ?? true;
      vial.position.set(...v.pos);
      vial.rotation.set(...(v.rot || [0, 0, 0]));
      glint.visible = (Math.floor(t * 6) % 5) === 0 || (o.glint ?? 0) > 0.5;
      drop.visible = o.drop != null && o.drop >= 0 && o.drop <= 1;
      if (drop.visible) { const d = o.dropFrom || [-0.25, 0.9, -1.25]; drop.position.set(d[0], d[1] - (o.drop ** 2) * (d[1] - 0.3), d[2]); }
      // cat
      kitty.group.visible = (o.cat ?? 0) > 0.5;
      const down = clamp(o.catDown ?? 0);
      kitty.body.rotation.z = E.inCubic(down) * 1.45;
      kitty.body.position.y = -down * 0.06;
      kitty.head.rotation.x = 0.2 * noise1(t * 0.7, 3) * (1 - down) + down * 0.4;
      kitty.tail.rotation.x = 0.6 + 0.4 * Math.sin(t * 1.5) * (1 - down) - down * 0.6;
      // chains: drag = how far the chain has crawled
      const dr = o.chain ?? -1;
      chain.visible = dr >= 0;
      for (let i = 0; i < 36; i++) {
        const s = i * 0.11 - 3.0 + dr * 3.2;
        const x = -2.0 + s, z = 1.4 + Math.sin(s * 1.7) * 0.25;
        dummy.position.set(x, 0.03 + (i % 2 ? 0.02 : 0), z);
        dummy.rotation.set(i % 2 ? 0 : Math.PI / 2, Math.atan2(0.42 * Math.cos(s * 1.7), 1) - Math.PI / 2, i % 2 ? Math.PI / 2 : 0);
        dummy.scale.setScalar(s < -1.6 ? 0 : 1);
        dummy.updateMatrix(); chain.setMatrixAt(i, dummy.matrix);
      }
      chain.instanceMatrix.needsUpdate = true;
      // the claw marks, redrawn only when their progress changes
      const sp = Math.round(clamp(o.scratch ?? 0) * 400) / 400;
      scratchPlane.visible = sp > 0;
      if (sp !== scrLast) { drawScratches(scr, strokes, sp); scrLast = sp; }
      // the shadows
      const shK = `${(o.shadow ?? 0).toFixed(3)}|${Math.round(flick * 40)}|${(o.rock ?? 0).toFixed(2)}|${Math.round(t * 15)}`;
      shadowPlane.visible = (o.shadow ?? -1) >= 0;
      if (shadowPlane.visible && shK !== shLast) { drawShadows(sh, o.shadow, flick, (o.rock ?? 0) * Math.sin(t * 2.4), t); shLast = shK; }
      // light
      const fi = fire * flick, bl = blue * (1 + 0.3 * noise1(t * 20, 4));
      const mo = o.moon ?? 1;
      lights({
        amb: [0.07 + 0.15 * bl, 0.07 + 0.3 * bl, 0.1 + 0.45 * bl], dir: [-1, -0.4, 0.1], dirCol: [0.16 * mo, 0.2 * mo, 0.34 * mo],
        points: [
          { pos: [hx, 0.8, -D2 + 1.1], col: [2.0 * fi + 0.6 * bl, 1.05 * fi + 2.6 * bl, 0.4 * fi + 3.4 * bl], r: 7.5 + bl * 4 },
          { pos: [-1.6, 0.9, 0.75], col: cand > 0.5 ? [1.5 * flick, 1.0 * flick, 0.5 * flick] : [0, 0, 0], r: 4.2 },
          { pos: [W2 - 0.6, 1.6, 0.1], col: [0.35 * mo, 0.42 * mo, 0.7 * mo], r: 6 },
          ...(o.extra ? [o.extra] : []),
        ],
        fog: o.fogCol || [0.02, 0.02, 0.03], near: o.near ?? 2.5, far: o.far ?? 9,
      });
      U.uWarp.value = o.warp ?? 0;
      winM.uniforms.uColor.value.setScalar(0.55 * (o.moon ?? 1));
    },
  };
}

// claw-rake strokes for K A T E in a 4 x 1 box (each stroke a list of points), raked by 3 claws
function kateStrokes() {
  const L = [
    [[[0.1, 0.05], [0.12, 0.95]], [[0.75, 0.05], [0.18, 0.5]], [[0.22, 0.48], [0.8, 0.95]]],                          // K
    [[[1.05, 0.95], [1.4, 0.05]], [[1.4, 0.05], [1.78, 0.95]], [[1.17, 0.62], [1.68, 0.6]]],                          // A
    [[[1.95, 0.08], [2.75, 0.06]], [[2.35, 0.08], [2.37, 0.97]]],                                                       // T
    [[[3.05, 0.05], [3.07, 0.95]], [[3.05, 0.06], [3.8, 0.08]], [[3.07, 0.5], [3.6, 0.5]], [[3.07, 0.93], [3.85, 0.92]]], // E
  ];
  return L.flat();
}
function drawScratches(T, strokes, p) {
  const c = T.ctx, w = T.cv.width, h = T.cv.height;
  c.clearRect(0, 0, w, h);
  const n = strokes.length, per = 1 / n;
  strokes.forEach(([a, b], k) => {
    const q = clamp((p - k * per) / per);
    if (q <= 0) return;
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    for (let claw = -1; claw <= 1; claw++) {
      const r = mulberry32(k * 31 + claw + 50);
      const steps = 22;
      let px = null, py = null;
      for (let i = 0; i <= steps * q; i++) {
        const s = i / steps;
        const x = ((a[0] + dx * s) / 4 + nx * claw * 0.012) * (w - 16) + 8 + (r() - 0.5) * 2.2;
        const y = ((a[1] + dy * s) + ny * claw * 0.05) * (h - 12) + 6 + (r() - 0.5) * 2.2;
        if (px != null) {
          c.strokeStyle = '#1a0f08'; c.lineWidth = 4; c.beginPath(); c.moveTo(px, py + 1); c.lineTo(x, y + 1); c.stroke();
          c.strokeStyle = '#ecd2a2'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke();
        }
        px = x; py = y;
      }
    }
  });
  T.needsUpdate = true;
}
function drawShadows(T, k, flick, rockA, t) {
  const c = T.ctx, w = T.cv.width, h = T.cv.height;
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(4,2,2,1)';
  c.save(); c.translate(w * 0.62, h); c.scale(1 + 0.04 * flick, 1 + 0.08 * flick);
  // the chair and the man, rocking
  c.rotate(rockA * 0.5);
  c.fillRect(-14, -46, 28, 6); c.fillRect(-12, -78, 4, 34); c.fillRect(10, -78, 4, 34); c.fillRect(-12, -80, 26, 4);
  c.beginPath(); c.ellipse(0, -58, 9, 14, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(0, -76, 7, 0, TAU); c.fill();
  c.restore();
  if (k > 0) {
    // the other one: tall, hunched, long fingers, leaning in over him
    c.save(); c.translate(w * 0.3, h + 8); c.rotate(0.2 + 0.25 * E.outCubic(clamp(k)) + 0.02 * noise1(t * 2, 5)); c.scale(1 + 0.05 * flick, 1.05 + 0.1 * flick);
    c.beginPath(); c.moveTo(-14, 0); c.lineTo(-10, -60); c.quadraticCurveTo(-8, -92, 8, -98); c.quadraticCurveTo(26, -96, 22, -80); c.lineTo(16, -58); c.lineTo(14, 0); c.closePath(); c.fill();
    c.beginPath(); c.ellipse(14, -100, 8, 10, 0.4, 0, TAU); c.fill();
    const reach = E.outCubic(clamp(k));
    c.lineWidth = 3; c.strokeStyle = 'rgba(4,2,2,1)';
    for (let f = 0; f < 4; f++) { c.beginPath(); c.moveTo(18, -74); c.quadraticCurveTo(30 + reach * 20, -80 + f * 3, 34 + reach * 30 + f * 2, -66 + f * 5); c.stroke(); }
    c.restore();
  }
  T.needsUpdate = true;
}

// ---------------------------------------------------------------- GRAVEYARD

export function graveSet() {
  const scene = new THREE.Scene(), cam = camera(50);
  const skyM = sky('#05060a', '#161c26', '#2e3440');
  scene.add(skyM);
  const moon = billboardQuad(7, 7, mat({ map: TX.moon, lit: 0, fog: 0, warp: 0 }));
  moon.position.set(25, 30, -60); scene.add(moon);
  mesh(plane(120, 120, 50, 50, 2.5).rotateX(-Math.PI / 2), mat({ map: TX.grass }), [0, 0, 0], scene);
  // the open grave + mound + coffin
  mesh(new THREE.PlaneGeometry(1.0, 2.2).rotateX(-Math.PI / 2), mat({ color: '#050403', lit: 0 }), [0, 0.012, 0], scene);
  const mound = mesh(new THREE.SphereGeometry(1, 8, 5, 0, TAU, 0, Math.PI / 2).scale(0.9, 0.5, 1.3), mat({ map: TX.dirt }), [1.3, 0, 0], scene);
  const coffin = mesh(boxUV(0.6, 0.35, 1.9, 0.5), mat({ map: TX.wood, color: '#8a7a6a' }), [0, -0.5, 0], scene);
  // stones + crosses
  const stoneM = mat({ map: TX.stone, color: '#a8a49a' }), woodM = mat({ map: TX.wood, color: '#7a6a5a' });
  const r = mulberry32(777);
  for (let i = 0; i < 26; i++) {
    const x = (r() - 0.5) * 28, z = -3 - r() * 22;
    if (Math.abs(x) < 2.5 && z > -5) continue;
    if (r() < 0.5) mesh(boxUV(0.6, 0.8 + r() * 0.5, 0.14, 0.5), stoneM, [x, 0.4, z], scene).rotation.set((r() - 0.5) * 0.2, (r() - 0.5) * 0.4, (r() - 0.5) * 0.25);
    else { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.set(0, (r() - 0.5) * 0.4, (r() - 0.5) * 0.3); scene.add(g); mesh(new THREE.BoxGeometry(0.1, 1.2, 0.08), woodM, [0, 0.6, 0], g); mesh(new THREE.BoxGeometry(0.6, 0.08, 0.08), woodM, [0, 0.9, 0], g); }
  }
  const treeM = mat({ color: '#0e0d0c' });
  for (let i = 0; i < 8; i++) { const q = mulberry32(880 + i); mesh(bareTree(890 + i, 7 + q() * 5), treeM, [(q() - 0.5) * 40, 0, -8 - q() * 25], scene); }
  const bigTree = mesh(bareTree(42, 10), treeM, [-4.5, 0, -2.5], scene);
  // mourners in a ring on the far side of the grave
  const mourners = [];
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.85 + (i / 8) * Math.PI * 0.7, rr = 2.2 + hash01(i, 3) * 0.6;
    const f = figure({ coat: ['#1c1a18', '#221e1a', '#181614'][i % 3], dress: i % 3 === 1, hat: true, scale: 0.92 + hash01(i, 7) * 0.15, eyes: true });
    f.group.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr - 0.3);
    f.group.rotation.y = Math.atan2(-f.group.position.x, -f.group.position.z);
    f.base = f.group.rotation.y;
    scene.add(f.group); mourners.push(f);
  }
  const shovel = new THREE.Group(); scene.add(shovel);
  mesh(new THREE.BoxGeometry(0.04, 1.2, 0.04), woodM, [0, 0.6, 0], shovel);
  mesh(new THREE.BoxGeometry(0.22, 0.28, 0.02), mat({ map: TX.iron }), [0, 0.05, 0], shovel);
  const digger = figure({ coat: '#2a241e' });
  digger.group.position.set(1.6, 0, 1.3); digger.group.rotation.y = -2.2; scene.add(digger.group);
  shovel.position.set(1.25, 0.25, 0.9);
  const lanternM = mat({ color: '#ffcc66', lit: 0 });
  const lantern = mesh(new THREE.BoxGeometry(0.12, 0.18, 0.12), lanternM, [0, 0, 0], scene);

  return {
    scene, camera: cam, mourners,
    update(t, u, o = {}) {
      const c = o.cam || [[0, 2.2, 7], [0, 0.8, 0], 50, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 50);
      const turn = clamp(o.turn ?? 0);
      mourners.forEach((f, i) => {
        // heads hang; on the song they all snap to the camera at once
        const k = E.outBack(clamp((turn - hash01(i, 13) * 0.08) / 0.92), 2.2);
        const want = Math.atan2(cam.position.x - f.group.position.x, cam.position.z - f.group.position.z) - f.group.rotation.y;
        const wr = Math.atan2(Math.sin(want), Math.cos(want));
        const hy = 1.62 * f.group.scale.y, dx = cam.position.x - f.group.position.x, dz = cam.position.z - f.group.position.z;
        const up = -Math.atan2(cam.position.y - hy, Math.hypot(dx, dz));
        f.pose({ headPitch: lerp(0.45, Math.max(-1.1, up), k), headYaw: wr * k, armL: 0.1, armR: 0.1, bob: false });
        f.group.rotation.z = 0.02 * noise1(t * 0.5 + i, 4);
      });
      const dg = o.dig ?? -1;
      const ph = dg >= 0 ? (dg * 0.9) % 1 : 0;
      digger.pose({ armL: 0.9 + 0.6 * Math.sin(ph * TAU), armR: 0.9 + 0.6 * Math.sin(ph * TAU), headPitch: 0.4, bob: false });
      shovel.rotation.set(0.5 + 0.6 * Math.sin(ph * TAU), -2.2, 0);
      mound.scale.set(0.9, 0.5 * (1 - 0.3 * clamp(o.dirt ?? 0)), 1.3);
      coffin.visible = (o.dirt ?? 0) < 0.8;
      const lp = mourners[6].group.position;
      lantern.position.set(lp.x + 0.25, 0.75, lp.z + 0.1);
      const fl = 1 + 0.2 * noise1(t * 7, 6);
      lights({
        amb: [0.09, 0.1, 0.14], dir: [-0.3, -0.5, 0.8], dirCol: [0.34, 0.4, 0.6],
        points: [{ pos: [lp.x + 0.25, 0.9, lp.z + 0.3], col: [1.8 * fl, 1.15 * fl, 0.55 * fl], r: 6 }, { pos: [0, 1.4, 1.6], col: [0.5 * fl, 0.32 * fl, 0.16 * fl], r: 4.5 }],
        fog: [0.12, 0.14, 0.18], near: o.near ?? 3, far: o.far ?? 30,
      });
      U.uWarp.value = o.warp ?? 0;
      faceCam(moon, cam);
    },
  };
}

// ---------------------------------------------------------------- THE FACE

export function faceSet() {
  const scene = new THREE.Scene(), cam = camera(45);
  const g = new THREE.SphereGeometry(1, 22, 18);
  const base = Float32Array.from(g.attributes.position.array);
  const colA = new Float32Array(base.length);
  g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  const head = mesh(g, mat({ map: TX.skin, vertexColors: true, warp: 0.3 }), [0, 0, 0], scene);
  const eyeM = mat({ color: '#fffbe8', lit: 0, fog: 0 });
  const eyes = [-1, 1].map((s) => mesh(new THREE.SphereGeometry(0.045, 4, 3), eyeM, [0.29 * s, 0.19, 0.6], head));
  // teeth along the upper lip
  const toothM = mat({ color: '#b8ae86' });
  const teeth = [];
  for (let i = 0; i < 7; i++) teeth.push(mesh(new THREE.ConeGeometry(0.035, 0.12, 4).rotateX(Math.PI), toothM, [-0.17 + i * 0.057, -0.36, 0.78], head));
  // hair: strands hanging from the scalp
  const hairM = mat({ map: TX.hair, side: THREE.DoubleSide, alphaTest: 0.5, sway: 0.2 });
  const strands = [];
  for (let i = 0; i < 46; i++) {
    // around the sides and back only (a = 0 is the face), hanging from the crown
    const a = Math.PI * 0.42 + (i / 45) * Math.PI * 1.16, len = 1.6 + hash01(i, 21) * 1.2;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.22, len, 1, 3).translate(0, -len / 2, 0), hairM);
    s.position.set(Math.sin(a) * 0.78, 0.95 + Math.cos(a) * -0.1, Math.cos(a) * 0.75 - 0.05);
    s.rotation.y = a; s.userData.a = a;
    head.add(s); strands.push(s);
  }
  const bg = mesh(new THREE.PlaneGeometry(40, 30), mat({ color: '#030304', lit: 0, fog: 0 }), [0, 0, -12], scene);

  function sculpt(mouth) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      let dark = 0;
      const front = Math.max(0, z);
      // long skull, narrow jaw
      x *= 0.74 - Math.max(0, -y) * 0.12; y *= 1.18; z *= 0.84;
      for (const s of [-1, 1]) {
        const d = Math.hypot(x - 0.29 * s, y - 0.2, (z - 0.72) * 0.6);
        if (d < 0.3 && front > 0.3) { const k = (1 - d / 0.3) ** 1.2; z -= k * 0.36; dark = Math.max(dark, Math.min(1, k * 1.6)); }
        const ch = Math.hypot(x - 0.42 * s, y + 0.18);
        if (ch < 0.25 && front > 0.2) z -= (1 - ch / 0.25) ** 2 * 0.12;
        const br = Math.hypot(x - 0.28 * s, y - 0.42);
        if (br < 0.2 && front > 0.4) z += (1 - br / 0.2) * 0.06;
      }
      const nose = Math.hypot(x * 1.8, y + 0.02);
      if (nose < 0.18 && front > 0.5) { z += (1 - nose / 0.18) * 0.12; }
      // the mouth: an oval that tears open downward
      const mh = 0.07 + mouth * 0.5, my = -0.42 - mouth * 0.24;
      const mx = x / (0.21 + mouth * 0.1), myy = (y - my) / mh;
      const md = Math.hypot(mx, myy);
      if (md < 1.5 && front > 0.3) {
        if (md < 1) { z -= (1 - md) * (0.35 + mouth * 0.6); dark = Math.max(dark, 1 - md * 0.6); }
        if (y < my) y -= mouth * 0.35 * clamp(1.5 - md);
      }
      if (y < -0.5) y -= mouth * 0.3 * clamp((-0.5 - y) * 2);
      p.setXYZ(i, x, y, z);
      const n = 0.85 + 0.25 * hash01(i, 33);
      colA[i * 3] = (0.9 * n) * (1 - dark * 0.92) + dark * 0.05; colA[i * 3 + 1] = (0.92 * n) * (1 - dark * 0.95); colA[i * 3 + 2] = (0.82 * n) * (1 - dark * 0.95);
    }
    p.needsUpdate = true; g.attributes.color.needsUpdate = true; g.computeVertexNormals();
  }

  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      const L = clamp(o.lunge ?? 0), mouth = clamp(o.mouth ?? 0);
      sculpt(mouth);
      const c = o.cam || [[0, 0, 3.2], [0, -0.05, 0], 45, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 45);
      head.position.set(0.04 * noise1(t * 30, 2) * L, -0.1 + 0.04 * noise1(t * 27, 3) * L, lerp(-9, 1.15, E.outExpo(L)));
      head.rotation.set(-0.1 + 0.15 * mouth, 0.08 * noise1(t * 4, 5), 0.25 * noise1(t * 3, 9) * (1 - L * 0.5));
      strands.forEach((s, i) => { s.rotation.x = -0.35 * E.outCubic(L) + 0.08 * noise1(t * 2 + i, 7); s.rotation.z = 0.15 * noise1(t + i * 0.3, 8); });
      eyes.forEach((e) => (e.visible = (o.eyes ?? 1) > 0.5));
      teeth.forEach((tt, i) => { tt.position.y = -0.36 - mouth * 0.05; tt.scale.y = 0.6 + mouth * 1.2 * (0.7 + 0.6 * hash01(i, 2)); });
      const fl = 1 + 0.3 * noise1(t * 11, 6);
      lights({
        amb: [0.03, 0.03, 0.04], dir: [0, 1, -0.3], dirCol: [0.05, 0.05, 0.06],
        points: [{ pos: [0.2, -1.8, 3.0], col: [2.6 * fl, 1.2 * fl, 0.8 * fl], r: 6.5 }, { pos: [-2.4, 2, -0.5], col: [0.5, 0.6, 1.0], r: 5 }, { pos: [2.2, 0.6, 0.5], col: [0.6, 0.15, 0.1], r: 4 }],
        fog: [0.01, 0.01, 0.015], near: 2, far: 11,
      });
      U.uSnap.value = o.snap ?? 1.6;
      U.uWarp.value = o.warp ?? 0;
    },
  };
}

export function initWorld() { makeTextures(); }
