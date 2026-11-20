// The Wow! signal, built for a 1997 console: Big Ear at night, a 1977 computer room, Ehman's desk, deep
// space, a dish array, the golf course. Each set's update(t, u, o) sets everything from time and knobs o.
import { THREE, mat, tex, speckle, boxUV, plane, mesh, paint, camera, look, lights, U } from '../lib/ps1.js';
import * as M from '../lib/motion.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const { clamp, lerp, noise1, hash01, mulberry32, TAU, E } = M;
const shade = (hex, k) => { const [r, g, b] = M.hexRgb(hex); return `rgb(${Math.min(255, Math.round(r * k))},${Math.min(255, Math.round(g * k))},${Math.min(255, Math.round(b * k))})`; };
const dummy = new THREE.Object3D();
export const TX = {};

// ---------------------------------------------------------------- textures

function starTex(w, h, seed, { milky = true, density = 0.004 } = {}) {
  return tex(w, h, (c) => {
    c.fillStyle = '#000000'; c.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    if (milky) for (let i = 0; i < 9000; i++) {
      // the galactic band: a tilted sine across the dome, with a bright core near Sagittarius
      const x = r() * w, band = h * 0.42 + Math.sin((x / w) * TAU) * h * 0.18, y = band + (r() + r() + r() - 1.5) * h * 0.09;
      const core = Math.exp(-(((x - w * 0.62) / (w * 0.08)) ** 2));
      const a = 0.08 + 0.25 * core;
      c.fillStyle = `rgba(${170 + 60 * core},${150 + 40 * core},${190 - 40 * core},${a})`;
      c.fillRect(Math.floor(x), Math.floor(y), 1, 1);
    }
    for (let i = 0; i < w * h * density; i++) {
      const b = r(), x = Math.floor(r() * w), y = Math.floor(r() * h);
      c.fillStyle = b > 0.97 ? '#ffffff' : b > 0.85 ? '#cdd6ff' : b > 0.6 ? '#8890b0' : '#4a4e66';
      c.fillRect(x, y, 1, 1);
    }
  });
}

function makeTextures() {
  TX.stars = starTex(512, 256, 7);
  TX.starsDeep = starTex(512, 256, 11, { density: 0.01 });
  TX.grass = tex(32, 32, (c, w, h) => { c.fillStyle = '#1c2a16'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#24361c', '#162212', '#2e4224', '#1a2414'], 3, 0.8); });
  TX.metal = tex(32, 32, (c, w, h) => {
    c.fillStyle = '#8c9298'; c.fillRect(0, 0, w, h);
    speckle(c, w, h, ['#7a8086', '#9aa0a6', '#848a90'], 5, 0.5);
    c.fillStyle = '#5a6066'; for (let i = 0; i < w; i += 16) { c.fillRect(i, 0, 1, h); c.fillRect(0, i, w, 1); }
  });
  TX.mesh = tex(32, 32, (c, w, h) => {
    c.fillStyle = '#6a7278'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#a8b0b6'; for (let i = 0; i < w; i += 8) { c.fillRect(i, 0, 1, h); c.fillRect(0, i, w, 1); }
    speckle(c, w, h, ['rgba(0,0,0,0.15)'], 9, 0.2);
  });
  TX.block = tex(64, 64, (c, w, h) => {
    c.fillStyle = '#b8b2a0'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = -((y / 16) % 2) * 16; x < w; x += 32) { c.fillStyle = shade('#c4bea8', 0.9 + 0.1 * hash01(x + y * 7, 3)); c.fillRect(x + 1, y + 1, 30, 14); }
    speckle(c, w, h, ['#a8a290', '#cfc9b3'], 13, 0.3);
  });
  TX.tiles = tex(64, 64, (c, w, h) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { c.fillStyle = (x + y) % 2 ? '#5a5650' : '#b8b0a0'; c.fillRect(x * 16, y * 16, 16, 16); } speckle(c, w, h, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)'], 17, 0.3); });
  TX.beige = tex(32, 32, (c, w, h) => { c.fillStyle = '#c9c0a8'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#bdb49c', '#d4cbb2'], 19, 0.4); c.fillStyle = '#8a826e'; c.fillRect(0, 0, w, 1); });
  TX.blue = tex(32, 32, (c, w, h) => { c.fillStyle = '#2d4a7a'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#264270', '#36548a'], 21, 0.4); c.fillStyle = '#1a2c4a'; c.fillRect(0, 0, w, 2); });
  TX.reel = tex(32, 32, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#2a2622'; c.beginPath(); c.arc(16, 16, 15, 0, TAU); c.fill();
    c.fillStyle = '#5a4a3a'; c.beginPath(); c.arc(16, 16, 11, 0, TAU); c.fill();
    c.fillStyle = '#c8c4bc'; for (let k = 0; k < 3; k++) { c.save(); c.translate(16, 16); c.rotate((k * TAU) / 3); c.fillRect(-2, -13, 4, 9); c.restore(); }
    c.fillStyle = '#d8d4cc'; c.beginPath(); c.arc(16, 16, 3, 0, TAU); c.fill();
  });
  TX.wood = tex(32, 32, (c, w, h) => { c.fillStyle = '#6a4a30'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#5a3c26', '#7a5838', '#4a3020'], 23, 0.5); for (let y = 0; y < h; y += 4) { c.fillStyle = 'rgba(30,15,5,0.35)'; c.fillRect(0, y, w, 1); } });
  TX.sand = tex(32, 32, (c, w, h) => { c.fillStyle = '#7a6448'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#6a5640', '#8a7254', '#5e4c38'], 29, 0.8); });
  TX.white = tex(16, 16, (c, w, h) => { c.fillStyle = '#e8e8e4'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#d8d8d4', '#f4f4f0'], 31, 0.4); });
  TX.fairway = tex(64, 64, (c, w, h) => { for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#4f9a3a' : '#5cae44'; c.fillRect(i * 16, 0, 16, h); } speckle(c, w, h, ['#4a9036', '#64b84a'], 37, 0.35); });
  TX.rough = tex(32, 32, (c, w, h) => { c.fillStyle = '#3c7a2c'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#346c26', '#468a34', '#2e6022'], 41, 0.8); });
  TX.bunker = tex(32, 32, (c, w, h) => { c.fillStyle = '#e4d29a'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#d8c48a', '#efe0ac'], 43, 0.6); });
  TX.leaf = tex(32, 32, (c, w, h) => { c.fillStyle = '#1e3a18'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#264a1e', '#16301a', '#2e5624'], 47, 0.9); });
  TX.cloud = tex(32, 16, (c, w, h) => { c.clearRect(0, 0, w, h); const r = mulberry32(53); for (let k = 0; k < 7; k++) { const x = 6 + k * 3.3, y = 9 - Math.sin((k / 6) * Math.PI) * 3, rad = 3 + r() * 3; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill(); } c.fillStyle = '#e4ecf4'; c.fillRect(2, 11, 28, 3); });
  TX.nebula = tex(64, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const r = mulberry32(59);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - 31.5, y - 31.5) / 32;
      const n = 0.5 + 0.5 * Math.sin(x * 0.31 + Math.sin(y * 0.17) * 3) * Math.cos(y * 0.23 + Math.sin(x * 0.11) * 2);
      const a = (1 - d) * (0.55 + 0.45 * n);
      if (a > 0.25 && r() < a * 1.4) { c.fillStyle = shade('#ffffff', 0.6 + 0.4 * n); c.fillRect(x, y, 1, 1); }
    }
  });
  TX.earth = tex(128, 64, (c, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lat = (y / h - 0.5) * Math.PI, lon = (x / w) * TAU;
      const n = Math.sin(lon * 2.1 + 1.3) * Math.cos(lat * 3.1) + 0.6 * Math.sin(lon * 5.3 + lat * 4.2) + 0.35 * Math.sin(lon * 11 + lat * 9);
      const ice = Math.abs(lat) > 1.25;
      c.fillStyle = ice ? '#dfe8ef' : n > 0.45 ? shade('#3e6a2e', 0.8 + 0.3 * hash01(x + y * w, 3)) : n > 0.3 ? '#8a7a4a' : shade('#1a3a6a', 0.8 + 0.2 * Math.sin(lat * 6));
      c.fillRect(x, y, 1, 1);
    }
    c.fillStyle = 'rgba(255,255,255,0.55)';
    const r = mulberry32(61);
    for (let k = 0; k < 40; k++) c.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2 + Math.floor(r() * 8), 1);
  });
  TX.flag = tex(16, 16, (c, w, h) => { c.fillStyle = '#d82a22'; c.fillRect(0, 0, w, h); c.fillStyle = '#f4f0e0'; c.fillRect(0, 6, w, 4); });
  TX.cloth = tex(16, 16, (c, w, h) => { c.fillStyle = '#3a3630'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#2e2a26', '#46423a'], 67, 0.7); });
  TX.skin = tex(16, 16, (c, w, h) => { c.fillStyle = '#b08a6a'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#a07a5c', '#c09a78'], 71, 0.5); });
  TX.dust = tex(16, 16, (c, w, h) => { c.clearRect(0, 0, w, h); const r = mulberry32(73); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - 7.5, y - 7.5) / 8; if (d < 1 && r() > d * 0.95) { c.fillStyle = shade('#9a9488', 0.7 + 0.3 * r()); c.fillRect(x, y, 1, 1); } } });
  // printer paper: green bars + characters; scrolled with a material's uUvT
  TX.paper = tex(64, 128, (c, w, h) => {
    for (let y = 0; y < h; y++) { c.fillStyle = Math.floor(y / 8) % 2 ? '#e9eee2' : '#c8dcc0'; c.fillRect(0, y, w, 1); }
    c.fillStyle = '#d8dcd4'; c.fillRect(0, 0, 5, h); c.fillRect(w - 5, 0, 5, h);
    c.fillStyle = '#9aa094'; for (let y = 2; y < h; y += 6) { c.fillRect(1, y, 3, 3); c.fillRect(w - 4, y, 3, 3); }
    const r = mulberry32(79);
    c.fillStyle = '#3a3a44';
    for (let y = 3; y < h; y += 4) for (let x = 9; x < w - 9; x += 4) { const v = r(); if (v > 0.55) c.fillRect(x, y, 2, 2); }
  });
}

// ---------------------------------------------------------------- shared builders

function uvScale(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
function billboardQuad(w, h, m, anchor = 'bottom') {
  const g = new THREE.PlaneGeometry(w, h);
  if (anchor === 'bottom') g.translate(0, h / 2, 0);
  return new THREE.Mesh(g, m);
}
function faceCam(o, cam, yOnly = true) {
  if (yOnly) o.rotation.set(0, Math.atan2(cam.position.x - o.position.x, cam.position.z - o.position.z), 0);
  else o.quaternion.copy(cam.quaternion);
}
function skyDome(map, r = 150, tint = '#ffffff') {
  const g = new THREE.SphereGeometry(r, 24, 14);
  return mesh(g, mat({ map, lit: 0, fog: 0, side: THREE.BackSide, warp: 0, color: tint }));
}
function gradSky(top, mid, hor, r = 150) {
  const g = new THREE.SphereGeometry(r, 16, 12);
  const cols = [top, mid, hor].map((h) => new THREE.Color(h));
  paint(g, (x, y) => { const k = clamp(y / r); const c = k > 0.3 ? cols[1].clone().lerp(cols[0], (k - 0.3) / 0.7) : cols[2].clone().lerp(cols[1], k / 0.3); return [c.r, c.g, c.b]; });
  return mesh(g, mat({ vertexColors: true, lit: 0, fog: 0, side: THREE.BackSide, warp: 0 }));
}
function blobTree(seed, h = 6, leafM, trunkM) {
  const r = mulberry32(seed), g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.15, 0.22, h * 0.45, 5).translate(0, h * 0.22, 0), trunkM, [0, 0, 0], g);
  for (let k = 0; k < 3; k++) mesh(new THREE.IcosahedronGeometry(h * (0.28 + r() * 0.1), 0), leafM, [(r() - 0.5) * h * 0.25, h * (0.55 + k * 0.13), (r() - 0.5) * h * 0.25], g);
  return g;
}

// a person: boxes. pose() sets walk, arms, head; used for Ehman and the golfer
export function figure({ coat = '#3a3630', pants = '#22201c', skin = '#b08a6a', hat = null, scale = 1 } = {}) {
  const grp = new THREE.Group();
  const mc = mat({ map: TX.cloth, color: coat }), mp = mat({ map: TX.cloth, color: pants }), ms = mat({ map: TX.skin, color: skin });
  const hip = new THREE.Group(); hip.position.y = 0.95; grp.add(hip);
  const legs = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(0.11 * s, 0, 0); hip.add(p); mesh(boxUV(0.15, 0.95, 0.17, 0.5).translate(0, -0.47, 0), mp, [0, 0, 0], p); return p; });
  mesh(boxUV(0.46, 0.68, 0.27, 0.5).translate(0, 0.34, 0), mc, [0, 0, 0], hip);
  const chest = new THREE.Group(); chest.position.y = 0.64; hip.add(chest);
  const arms = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(0.28 * s, 0, 0); chest.add(p); mesh(boxUV(0.12, 0.64, 0.13, 0.5).translate(0, -0.32, 0), mc, [0, 0, 0], p); mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1).translate(0, -0.67, 0), ms, [0, 0, 0], p); return p; });
  const neck = new THREE.Group(); neck.position.y = 0.08; chest.add(neck);
  mesh(new THREE.SphereGeometry(0.15, 7, 5).scale(1, 1.15, 1), ms, [0, 0.16, 0], neck);
  mesh(new THREE.SphereGeometry(0.155, 7, 4, 0, TAU, 0, Math.PI * 0.45).scale(1, 1.1, 1), mat({ color: '#2a2018' }), [0, 0.19, -0.01], neck);
  if (hat === 'cap') { mesh(new THREE.SphereGeometry(0.16, 7, 4, 0, TAU, 0, Math.PI * 0.5), mat({ color: '#f2f2ee' }), [0, 0.22, 0], neck); mesh(new THREE.BoxGeometry(0.18, 0.02, 0.14), mat({ color: '#f2f2ee' }), [0, 0.22, 0.14], neck); }
  grp.scale.setScalar(scale);
  const pose = ({ armL = 0, armR = 0, armLz = 0, armRz = 0, sit = 0, headPitch = 0, headYaw = 0, twist = 0, lean = 0 } = {}) => {
    legs[0].rotation.x = -sit * 1.5; legs[1].rotation.x = -sit * 1.5;
    arms[0].rotation.set(-armL, 0, armLz); arms[1].rotation.set(-armR, 0, armRz);
    hip.position.y = 0.95 - sit * 0.45;
    chest.rotation.set(lean, twist, 0);
    neck.rotation.set(headPitch, headYaw, 0);
  };
  pose();
  return { group: grp, pose, arms, chest };
}

// ---------------------------------------------------------------- BIG EAR: the telescope in the field at night

export function bigEarSet() {
  const scene = new THREE.Scene(), cam = camera(55, 0.1, 400);
  scene.add(skyDome(TX.stars, 180, '#c8d0ff'));
  mesh(plane(260, 260, 60, 60, 8).rotateX(-Math.PI / 2), mat({ map: TX.grass }), [0, -0.02, 0], scene);
  // the aluminium ground plane: 27 x 38 units (1 unit = 4 m)
  mesh(plane(27, 38, 14, 20, 1.2).rotateX(-Math.PI / 2), mat({ map: TX.mesh, color: '#e8f0f8' }), [0, 0.01, 0], scene).geometry.attributes.uv.array.forEach((v, i, a) => (a[i] = v * 0.45));
  // the parabolic reflector at the south end: a curved wall of mesh panels
  const para = new THREE.Group(); para.position.set(0, 0, 19); scene.add(para);
  const paraM = mat({ map: TX.mesh, color: '#c0c8d0', side: THREE.DoubleSide });
  for (let i = 0; i < 14; i++) {
    const x = -13 + i * 2 + 1, z = (x * x) / 90;
    const p = mesh(plane(2.05, 5.5, 1, 4, 1).translate(0, 2.75, 0), paraM, [x, 0, z], para);
    p.rotation.set(0.25, Math.atan2(-x, 45), 0);
  }
  for (let i = 0; i <= 14; i++) mesh(new THREE.BoxGeometry(0.15, 5.8, 0.15).translate(0, 2.9, 0), mat({ color: '#5a5e62' }), [-13 + i * 2, 0, ((-13 + i * 2) ** 2) / 90 + 0.6], para).rotation.x = 0.25;
  // the flat tiltable reflector at the north end: 26 x 8, in 24 panels so it can come down
  const flat = new THREE.Group(); flat.position.set(0, 0, -19); scene.add(flat);
  const flatM = mat({ map: TX.metal, color: '#e2e8ee', side: THREE.DoubleSide });
  const panels = [];
  for (let iy = 0; iy < 3; iy++) for (let ix = 0; ix < 8; ix++) {
    const pv = new THREE.Group();
    pv.position.set(-13 + ix * 3.25 + 1.625, 0, 0);
    flat.add(pv);
    const pm = mesh(plane(3.2, 2.75, 2, 2, 1).translate(0, 2.75 * iy + 1.375, 0), flatM, [0, 0, 0], pv);
    panels.push({ pv, pm, ix, iy, home: pm.position.clone() });
  }
  const truss = mat({ color: '#4a4e52' });
  for (let i = 0; i <= 8; i++) { const b = mesh(new THREE.BoxGeometry(0.2, 8.6, 0.2).translate(0, 4.3, 0), truss, [-13 + i * 3.25, 0, -0.9], flat); b.rotation.x = -0.42; panels.push({ strut: b, ix: Math.min(7, i), home: b.position.clone() }); }
  // feed horns + the little building + trees + a fence
  mesh(boxUV(1.6, 1.2, 1.2, 0.6), mat({ map: TX.metal, color: '#9aa2aa' }), [0, 0.6, -13], scene);
  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.15, 0.5, 1.2, 6).rotateX(-Math.PI / 2), mat({ color: '#d8dce0' }), [0.4 * s, 0.9, -12.2], scene);
  const bld = new THREE.Group(); bld.position.set(-20, 0, 6); scene.add(bld);
  mesh(boxUV(5, 2.4, 3.5, 1), mat({ map: TX.block, color: '#9a9488' }), [0, 1.2, 0], bld);
  const winM = mat({ color: '#ffd890', lit: 0 });
  for (const x of [-1.4, 0, 1.4]) mesh(new THREE.PlaneGeometry(0.7, 0.6), winM, [x, 1.4, 1.76], bld);
  const leafM = mat({ map: TX.leaf }), trunkM = mat({ color: '#2a2018' });
  for (let i = 0; i < 26; i++) { const r = mulberry32(100 + i); const a = r() * TAU, d = 34 + r() * 30; const t = blobTree(200 + i, 7 + r() * 5, leafM, trunkM); t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); scene.add(t); }
  const dustM = mat({ map: TX.dust, color: '#b8b0a0', side: THREE.DoubleSide });
  const dust = Array.from({ length: 14 }, () => { const s = billboardQuad(1, 1, dustM); scene.add(s); return s; });

  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      const c = o.cam || [[0, 6, 40], [0, 3, -10], 55, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 55);
      // the flat reflector: tilt (normal ~0.42 rad), collapse = 0..1 brings panels down in a wave
      const col = o.collapse ?? -1;
      flat.rotation.x = -0.42;
      panels.forEach((p, k) => {
        const delay = (7 - p.ix) * 0.05 + (p.iy ?? 0) * 0.04;
        const q = col < 0 ? 0 : clamp((col - delay) / 0.45);
        const fall = E.inQuad(q);
        if (p.pv) {
          p.pv.rotation.set(fall * 1.15, 0, (hash01(k, 5) - 0.5) * fall * 0.6);
          p.pm.position.set(p.home.x + (hash01(k, 3) - 0.5) * fall * 2, p.home.y - fall * p.iy * 1.6, p.home.z + fall * (1 + p.iy));
        } else if (p.strut) {
          p.strut.rotation.x = -0.42 + E.inQuad(q) * 1.1;
        }
      });
      dust.forEach((d, i) => {
        const a = col - 0.25 - (i % 5) * 0.06;
        d.visible = col >= 0 && a > 0;
        d.position.set(-12 + (i / 13) * 24 + Math.sin(i * 3) * 1.5, 0, -16 + a * 3 + Math.cos(i) * 1.5);
        d.scale.setScalar(1 + a * 7 + (i % 3));
        faceCam(d, cam);
      });
      winM.uniforms.uColor.value.setScalar(o.windows ?? 1);
      lights({
        amb: [0.26, 0.29, 0.42], dir: [0.3, -0.6, -0.75], dirCol: [0.62, 0.7, 1.0],
        points: [{ pos: [-20, 2.5, 9], col: [1.6, 1.25, 0.7], r: 14 }, { pos: [0, 4, -12], col: [0.6, 0.75, 1.1], r: 22 }, { pos: [0, 6, 10], col: [0.35, 0.45, 0.7], r: 26 }],
        fog: [0.06, 0.08, 0.15], near: 40, far: 170,
      });
    },
  };
}

// ---------------------------------------------------------------- THE ROOM: Ohio State's computer room, 1977

export function roomSet() {
  const scene = new THREE.Scene(), cam = camera(60);
  const W2 = 4, D2 = 3, Hh = 2.8;
  mesh(plane(W2 * 2, D2 * 2, 6, 4, 0.4).rotateX(-Math.PI / 2), mat({ map: TX.tiles }), [0, 0, 0], scene);
  mesh(plane(W2 * 2, D2 * 2, 4, 3, 0.8).rotateX(Math.PI / 2), mat({ color: '#d8d4c8', map: TX.white }), [0, Hh, 0], scene);
  const wallM = mat({ map: TX.block });
  mesh(boxUV(W2 * 2, Hh, 0.2, 1.2, 0.4), wallM, [0, Hh / 2, -D2 - 0.1], scene);
  mesh(boxUV(0.2, Hh, D2 * 2, 1.2, 0.4), wallM, [-W2 - 0.1, Hh / 2, 0], scene);
  mesh(boxUV(0.2, Hh, D2 * 2, 1.2, 0.4), wallM, [W2 + 0.1, Hh / 2, 0], scene);
  mesh(boxUV(W2 * 2, Hh, 0.2, 1.2, 0.4), wallM, [0, Hh / 2, D2 + 0.1], scene);
  // fluorescent fixtures
  const tubeM = mat({ color: '#f4f8ff', lit: 0 });
  const tubes = [];
  for (const x of [-2, 2]) for (const z of [-1.5, 1.2]) { tubes.push(mesh(new THREE.BoxGeometry(1.4, 0.06, 0.3), tubeM, [x, Hh - 0.04, z], scene)); }
  // tape drives along the back wall, reels spinning
  const reels = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(); g.position.set(-3 + i * 1.05, 0, -D2 + 0.4); scene.add(g);
    mesh(boxUV(0.95, 1.9, 0.7, 0.6), mat({ map: TX.blue }), [0, 0.95, 0], g);
    mesh(new THREE.PlaneGeometry(0.75, 0.9), mat({ color: '#1a2230', lit: 0.6 }), [0, 1.35, 0.355], g);
    for (const y of [1.6, 1.12]) { const r = mesh(new THREE.CircleGeometry(0.18, 10), mat({ map: TX.reel, alphaTest: 0.5 }), [0, y, 0.36], g); reels.push(r); }
  }
  // the console with blinking lights
  const con = new THREE.Group(); con.position.set(0.6, 0, -0.9); scene.add(con);
  mesh(boxUV(2.0, 0.78, 0.9, 0.6), mat({ map: TX.beige }), [0, 0.39, 0], con);
  mesh(boxUV(2.0, 0.55, 0.25, 0.6), mat({ map: TX.blue }), [0, 1.05, -0.32], con).rotation.x = -0.3;
  const lampsT = tex(32, 8, () => {});
  const lampsM = mat({ map: lampsT, lit: 0 });
  mesh(new THREE.PlaneGeometry(1.7, 0.36), lampsM, [0, 1.06, -0.17], con).rotation.x = -0.3;
  // CRT terminal on the desk
  const crt = new THREE.Group(); crt.position.set(-0.3, 0.78, -0.95); scene.add(crt);
  mesh(boxUV(0.55, 0.45, 0.5, 0.4), mat({ map: TX.beige }), [0, 0.22, 0], crt);
  const crtT = tex(64, 48, () => {});
  const crtM = mat({ map: crtT, lit: 0 });
  mesh(new THREE.PlaneGeometry(0.42, 0.32), crtM, [0, 0.24, 0.252], crt);
  // the line printer, paper rising out of it
  const prn = new THREE.Group(); prn.position.set(2.6, 0, -0.6); prn.rotation.y = -0.5; scene.add(prn);
  mesh(boxUV(1.2, 1.0, 0.8, 0.6), mat({ map: TX.beige, color: '#d8d0b8' }), [0, 0.5, 0], prn);
  mesh(boxUV(1.25, 0.12, 0.85, 0.6), mat({ color: '#5a5650' }), [0, 1.05, 0], prn);
  const paperM = mat({ map: TX.paper, side: THREE.DoubleSide });
  const paperG = new THREE.PlaneGeometry(0.9, 1.6, 1, 6).translate(0, 0.8, 0);
  const paper = mesh(paperG, paperM, [0, 1.08, 0.05], prn);
  paper.rotation.x = -0.25;
  mesh(boxUV(0.95, 0.35, 0.6, 0.6), mat({ color: '#e8e6dc' }), [0, 0.18, 0.75], prn);   // the stack it folds into
  // wall clock: 11:16
  const clockT = tex(48, 48, () => {});
  const clockM = mat({ map: clockT, lit: 0.4, alphaTest: 0.5 });
  mesh(new THREE.CircleGeometry(0.28, 16), clockM, [1.6, 2.15, -D2 + 0.01], scene);
  // the empty chair
  const chair = new THREE.Group(); chair.position.set(0.5, 0, 0.2); chair.rotation.y = 0.5; scene.add(chair);
  const chM = mat({ color: '#6a3a2a', map: TX.cloth });
  mesh(boxUV(0.5, 0.08, 0.5, 0.5), chM, [0, 0.48, 0], chair);
  mesh(boxUV(0.5, 0.55, 0.07, 0.5), chM, [0, 0.8, -0.24], chair);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 5), mat({ color: '#2a2a2a' }), [0, 0.23, 0], chair);
  for (let k = 0; k < 5; k++) mesh(new THREE.BoxGeometry(0.3, 0.03, 0.04).translate(0.15, 0, 0), mat({ color: '#2a2a2a' }), [0, 0.03, 0], chair).rotation.y = (k * TAU) / 5;
  mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 7), mat({ color: '#d8d2c0' }), [0.15, 0.83, -0.75], scene);   // coffee mug

  function drawCRT(t, spike) {
    const c = crtT.ctx, w = 64, h = 48;
    c.fillStyle = '#031a08'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(40,255,120,0.12)'; for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1);
    c.strokeStyle = '#4dff8a'; c.lineWidth = 1; c.beginPath();
    for (let x = 0; x < w; x++) {
      const xx = x / w;
      const bump = spike * Math.exp(-(((xx - 0.6) / 0.08) ** 2)) * 30;
      const y = h * 0.75 - bump - 2 * noise1(x * 0.7 + t * 18, 3);
      if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    c.fillStyle = '#4dff8a'; c.font = '7px monospace'; c.fillText('CH 2', 2, 8);
    crtT.needsUpdate = true;
  }
  function drawClock() {
    const c = clockT.ctx; c.clearRect(0, 0, 48, 48);
    c.fillStyle = '#f2f0e8'; c.beginPath(); c.arc(24, 24, 23, 0, TAU); c.fill();
    c.strokeStyle = '#1a1a1a'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#1a1a1a'; for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; c.fillRect(24 + Math.sin(a) * 19 - 1, 24 - Math.cos(a) * 19 - 1, 2, 2); }
    const hA = ((11 + 16 / 60) / 12) * TAU, mA = (16 / 60) * TAU;
    c.lineWidth = 3; c.beginPath(); c.moveTo(24, 24); c.lineTo(24 + Math.sin(hA) * 11, 24 - Math.cos(hA) * 11); c.stroke();
    c.lineWidth = 2; c.beginPath(); c.moveTo(24, 24); c.lineTo(24 + Math.sin(mA) * 17, 24 - Math.cos(mA) * 17); c.stroke();
    clockT.needsUpdate = true;
  }
  drawClock();
  let lampsLast = -1;

  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      const c = o.cam || [[0, 1.6, 2.6], [0.5, 1.1, -1.5], 60, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 60);
      reels.forEach((r, i) => (r.rotation.z = -t * (2 + (i % 2) * 1.3) * (o.reels ?? 1)));
      const fr = Math.floor(t * 8);
      if (fr !== lampsLast) {
        const lc = lampsT.ctx; lc.fillStyle = '#10141c'; lc.fillRect(0, 0, 32, 8);
        for (let y = 0; y < 8; y += 2) for (let x = 0; x < 32; x += 2) if (hash01(x + y * 32 + fr * 977, 7) > 0.55) { lc.fillStyle = hash01(x * 3 + y, 9) > 0.7 ? '#ff5a3a' : '#ffd060'; lc.fillRect(x, y, 1, 1); }
        lampsT.needsUpdate = true; lampsLast = fr;
      }
      drawCRT(t, o.spike ?? 0);
      paperM.uniforms.uUvT.value.set(1, 1, 0, -t * 0.6 * (o.printing ?? 1));
      const fl = 1 - 0.25 * (o.flicker ?? 0) * (noise1(t * 30, 4) > 0.6 ? 1 : 0);
      tubeM.uniforms.uColor.value.setScalar(fl);
      lights({
        amb: [0.2 * fl, 0.21 * fl, 0.23 * fl], dir: [0, -1, 0], dirCol: [0.1, 0.1, 0.1],
        points: [
          { pos: [-2, Hh - 0.3, -1.2], col: [0.9 * fl, 0.95 * fl, 1.0 * fl], r: 5.5 },
          { pos: [2, Hh - 0.3, 0.6], col: [0.85 * fl, 0.92 * fl, 1.0 * fl], r: 5.5 },
          { pos: [-0.3, 1.05, -0.5], col: [0.15, 0.6 + 0.6 * (o.spike ?? 0), 0.3], r: 1.8 },
          ...(o.extra ? [o.extra] : []),
        ],
        fog: [0.06, 0.07, 0.08], near: 3, far: 12,
      });
    },
  };
}

// ---------------------------------------------------------------- THE DESK: days later, the printouts at home

export function deskSet() {
  const scene = new THREE.Scene(), cam = camera(55);
  mesh(plane(8, 8, 4, 4, 0.8).rotateX(-Math.PI / 2), mat({ map: TX.wood, color: '#8a6a50' }), [0, 0, 0], scene);
  mesh(boxUV(8, 3, 0.2, 1.2, 0.5), mat({ map: TX.beige, color: '#a89a80' }), [0, 1.5, -2], scene);
  mesh(boxUV(0.2, 3, 8, 1.2, 0.5), mat({ map: TX.beige, color: '#a89a80' }), [-2.5, 1.5, 0], scene);
  const table = new THREE.Group(); scene.add(table);
  mesh(boxUV(1.8, 0.06, 1.0, 0.6), mat({ map: TX.wood }), [0, 0.76, 0], table);
  for (const [x, z] of [[-0.8, -0.42], [0.8, -0.42], [-0.8, 0.42], [0.8, 0.42]]) mesh(new THREE.BoxGeometry(0.06, 0.76, 0.06).translate(0, 0.38, 0), mat({ map: TX.wood }), [x, 0, z], table);
  const paperM = mat({ map: TX.paper });
  for (let k = 0; k < 4; k++) mesh(boxUV(0.62, 0.05, 0.42, 0.4), paperM, [-0.45 + (k % 2) * 0.05, 0.81 + k * 0.05, -0.15 + k * 0.01], table);
  const sheet = mesh(new THREE.PlaneGeometry(0.62, 0.9).rotateX(-Math.PI / 2), paperM, [0.25, 0.795, 0.05], table);
  sheet.rotation.y = 0.12;
  // the lamp
  const lamp = new THREE.Group(); lamp.position.set(0.7, 0.79, -0.3); scene.add(lamp);
  mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 8), mat({ color: '#2a4a3a' }), [0, 0.02, 0], lamp);
  mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 5), mat({ color: '#2a4a3a' }), [0, 0.24, 0], lamp);
  mesh(new THREE.ConeGeometry(0.16, 0.18, 8, 1, true), mat({ color: '#2f5a44', side: THREE.DoubleSide }), [-0.08, 0.47, 0.05], lamp);
  mesh(new THREE.SphereGeometry(0.05, 6, 4), mat({ color: '#fff4c8', lit: 0 }), [-0.08, 0.42, 0.05], lamp);
  const man = figure({ coat: '#5a6a7a', pants: '#2e2e30', skin: '#c0987a' });
  man.group.position.set(0.15, 0, 0.85); man.group.rotation.y = Math.PI; scene.add(man.group);
  const pen = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 5), mat({ color: '#d82a22', lit: 0.5 }), [0.25, 0.83, 0.08], scene);
  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      const c = o.cam || [[1.3, 1.7, 1.6], [0.1, 0.85, 0], 50, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 50);
      const w = o.write ?? 0;
      man.pose({ sit: 1, armL: 0.9, armR: 1.1 + 0.1 * Math.sin(t * 9) * w, armRz: -0.2, headPitch: 0.55, lean: 0.25 });
      pen.position.set(0.25 + 0.06 * Math.cos(t * 7) * w, 0.83, 0.08 + 0.05 * Math.sin(t * 7) * w);
      pen.rotation.set(0.6, 0, 0.3);
      lights({
        amb: [0.1, 0.09, 0.08], dir: [0.2, -1, 0.1], dirCol: [0.08, 0.08, 0.1],
        points: [{ pos: [0.62, 1.15, -0.25], col: [2.0, 1.6, 1.0], r: 3.2 }, { pos: [-2, 2.5, 2], col: [0.2, 0.25, 0.4], r: 6 }],
        fog: [0.03, 0.03, 0.03], near: 2, far: 9,
      });
    },
  };
}

// ---------------------------------------------------------------- SPACE: Earth, the beam, Sagittarius, the cloud, the flash

export function spaceSet() {
  const scene = new THREE.Scene(), cam = camera(50, 0.1, 600);
  scene.add(skyDome(TX.starsDeep, 400, '#ffffff'));
  const earth = mesh(new THREE.SphereGeometry(2, 20, 14), mat({ map: TX.earth, warp: 0 }), [0, 0, 0], scene);
  const atmo = mesh(new THREE.SphereGeometry(2.12, 20, 14), mat({ color: '#6aa0ff', lit: 0, transparent: true, opacity: 0.18, side: THREE.BackSide, depthWrite: false, warp: 0 }), [0, 0, 0], scene);
  // the beam: a thin cone from Ohio into the sky
  const beamM = mat({ color: '#ff3a30', lit: 0, fog: 0, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, warp: 0 });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.35, 9, 10, 1, true).translate(0, -4.5, 0).rotateX(Math.PI), beamM);
  earth.add(beam);
  // signal rings travelling toward Earth
  const ringM = mat({ color: '#ff4a3a', lit: 0, fog: 0, side: THREE.DoubleSide, warp: 0 });
  const rings = Array.from({ length: 6 }, () => { const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 4, 32), ringM); scene.add(r); return r; });
  // the hydrogen cloud and the magnetar, far out toward Sagittarius
  const cloud = new THREE.Group(); cloud.position.set(0, 4, -160); scene.add(cloud);
  const neb = [];
  for (let i = 0; i < 14; i++) {
    const m = mat({ map: TX.nebula, lit: 0, fog: 0, alphaTest: 0.4, color: i % 2 ? '#3a8aff' : '#8a4aff', side: THREE.DoubleSide, warp: 0 });
    const b = billboardQuad(30 + hash01(i, 2) * 30, 30 + hash01(i, 3) * 30, m, 'center');
    b.position.set((hash01(i, 4) - 0.5) * 40, (hash01(i, 5) - 0.5) * 26, (hash01(i, 6) - 0.5) * 30);
    cloud.add(b); neb.push(b);
  }
  const mag = mesh(new THREE.SphereGeometry(1.6, 10, 8), mat({ color: '#e0f0ff', lit: 0, fog: 0, warp: 0 }), [-30, -6, -120], scene);
  const shellM = mat({ color: '#bfe4ff', lit: 0, fog: 0, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, warp: 0 });
  const shell = mesh(new THREE.SphereGeometry(1, 16, 10), shellM, [-30, -6, -120], scene);
  // Sagittarius: a handful of bright stars
  const starM = mat({ color: '#ffffff', lit: 0, fog: 0, warp: 0 });
  const sag = [[0, 0], [3, 2], [6, 1], [7, -3], [4, -5], [1, -3], [-3, 2], [9, 4]].map(([x, y]) => mesh(new THREE.OctahedronGeometry(0.5, 0), starM, [x * 3 - 8, y * 3 + 6, -170], scene));
  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      const c = o.cam || [[0, 1, 8], [0, 0, 0], 50, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 50);
      earth.rotation.set(0.35, (o.spin ?? t * 0.25), 0.1);
      atmo.visible = true;
      // Ohio at ~40N: the beam points out along the local vertical
      const lat = 0.7, lon = o.lon ?? 1.2;
      beam.position.set(Math.cos(lat) * Math.sin(lon) * 2, Math.sin(lat) * 2, Math.cos(lat) * Math.cos(lon) * 2);
      beam.lookAt(beam.position.clone().multiplyScalar(3));
      beam.rotateX(-Math.PI / 2);
      beam.visible = (o.beam ?? 0) > 0.01;
      beamM.uniforms.uOpacity.value = 0.45 * (o.beam ?? 0);
      const rg = o.rings ?? -1;
      rings.forEach((r, i) => {
        const p = rg - i * 0.16;
        r.visible = rg >= 0 && p > 0 && p < 1;
        const from = new THREE.Vector3(-8, 6, -170), to = new THREE.Vector3(0, 0, 0);
        r.position.copy(from.clone().lerp(to, clamp(p)));
        r.scale.setScalar(0.5 + p * 2.5);
        r.lookAt(to);
      });
      const fl = o.flash ?? 0;
      shell.visible = fl > 0.01;
      shell.scale.setScalar(2 + fl * 75);
      shellM.uniforms.uOpacity.value = 0.7 * (1 - fl);
      mag.scale.setScalar(1 + 0.3 * Math.sin(t * 20) * (o.magnetar ?? 0));
      mag.visible = (o.magnetar ?? 0) > 0;
      const glow = o.cloudGlow ?? 0.25;
      neb.forEach((b, i) => { faceCam(b, cam, false); b.material.uniforms.uColor.value.set(i % 2 ? '#3a8aff' : '#8a4aff').multiplyScalar(glow * (0.8 + 0.4 * noise1(t * 2 + i, 3))); });
      cloud.visible = (o.cloud ?? 0) > 0;
      sag.forEach((s, i) => s.scale.setScalar(0.6 + 0.4 * Math.sin(t * 3 + i)));
      lights({ amb: [0.06, 0.07, 0.1], dir: [-0.8, -0.2, -0.6], dirCol: [1.5, 1.45, 1.35], points: [], fog: [0, 0, 0], near: 300, far: 900 });
    },
  };
}

// ---------------------------------------------------------------- THE ARRAY: decades of searching

export function dishSet() {
  const scene = new THREE.Scene(), cam = camera(50, 0.1, 500);
  scene.add(skyDome(TX.stars, 300, '#aab4ff'));
  mesh(plane(400, 400, 40, 40, 10).rotateX(-Math.PI / 2), mat({ map: TX.sand }), [0, 0, 0], scene);
  // mountains on the horizon
  const ridge = new THREE.Group(); scene.add(ridge);
  const rm = mat({ color: '#1c1a26' });
  for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU, d = 160; const m = mesh(new THREE.ConeGeometry(18 + hash01(i, 2) * 20, 14 + hash01(i, 3) * 22, 5), rm, [Math.cos(a) * d, 6, Math.sin(a) * d], ridge); m.rotation.y = hash01(i, 4) * 3; }
  const dishM = mat({ map: TX.white, side: THREE.DoubleSide }), baseM = mat({ map: TX.white, color: '#b8b8b4' });
  const dishes = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group(); g.position.set(-24 + i * 6, 0, -i * 3.5); scene.add(g);
    mesh(new THREE.CylinderGeometry(0.5, 0.8, 4, 6).translate(0, 2, 0), baseM, [0, 0, 0], g);
    const az = new THREE.Group(); az.position.y = 4.2; g.add(az);
    mesh(new THREE.BoxGeometry(2.2, 0.6, 0.6), baseM, [0, 0, 0], az);
    const el = new THREE.Group(); az.add(el);
    mesh(new THREE.SphereGeometry(3.4, 14, 6, 0, TAU, 0, 0.75).rotateX(Math.PI).translate(0, 3.0, 0), dishM, [0, 0, 0], el);
    for (let k = 0; k < 4; k++) { const s = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 4).translate(0, 1.3, 0), baseM, [Math.cos((k * TAU) / 4) * 1.9, -0.3, Math.sin((k * TAU) / 4) * 1.9], el); s.lookAt(0, 2.2, 0); s.rotateX(Math.PI / 2); }
    mesh(new THREE.ConeGeometry(0.25, 0.6, 6), baseM, [0, 2.3, 0], el);
    dishes.push({ g, az, el });
  }
  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      const c = o.cam || [[14, 3, 22], [-4, 5, -10], 55, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 55);
      const p = o.aim ?? 1;
      dishes.forEach((d, i) => {
        const lag = clamp(p * 1.4 - i * 0.04);
        d.az.rotation.y = lerp(hash01(i, 8) * 2 - 1, -0.6, E.inOutCubic(lag));
        d.el.rotation.x = lerp(-0.2, -0.75, E.inOutCubic(lag));
      });
      lights({ amb: [0.14, 0.15, 0.24], dir: [0.5, -0.6, -0.4], dirCol: [0.5, 0.56, 0.8], points: [], fog: [0.05, 0.05, 0.1], near: 40, far: 220 });
    },
  };
}

// ---------------------------------------------------------------- THE GOLF COURSE: where Big Ear stood

export function golfSet() {
  const scene = new THREE.Scene(), cam = camera(55, 0.1, 500);
  scene.add(gradSky('#2a6ad8', '#7ab4f0', '#d8ecff', 300));
  const sun = billboardQuad(18, 18, mat({ color: '#fff8d8', lit: 0, fog: 0, warp: 0 }), 'center');
  sun.geometry = new THREE.CircleGeometry(9, 16);
  sun.position.set(60, 90, -200); scene.add(sun);
  const clouds = [];
  for (let i = 0; i < 9; i++) { const c = billboardQuad(30, 15, mat({ map: TX.cloud, lit: 0, fog: 0, alphaTest: 0.5, warp: 0 }), 'center'); c.position.set((hash01(i, 2) - 0.5) * 300, 50 + hash01(i, 3) * 40, -150 - hash01(i, 4) * 80); scene.add(c); clouds.push(c); }
  mesh(plane(400, 400, 30, 30, 10).rotateX(-Math.PI / 2), mat({ map: TX.rough }), [0, 0, 0], scene);
  mesh(plane(30, 160, 6, 30, 4).rotateX(-Math.PI / 2), mat({ map: TX.fairway }), [0, 0.02, -40], scene);
  const green = mesh(new THREE.CircleGeometry(9, 20).rotateX(-Math.PI / 2), mat({ map: TX.fairway, color: '#a8e890' }), [2, 0.04, -60], scene);
  mesh(new THREE.CircleGeometry(4.5, 14).rotateX(-Math.PI / 2), mat({ map: TX.bunker }), [-9, 0.03, -52], scene);
  const flagpole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5).translate(0, 1.6, 0), mat({ color: '#f4f4f0' }), [3, 0, -61], scene);
  const flagG = new THREE.PlaneGeometry(1.2, 0.8, 6, 2).translate(0.6, 2.8, 0);
  const flagBase = Float32Array.from(flagG.attributes.position.array);
  const flag = mesh(flagG, mat({ map: TX.flag, side: THREE.DoubleSide, warp: 0 }), [3, 0, -61], scene);
  const leafM = mat({ map: TX.leaf, color: '#7ab85a' }), trunkM = mat({ color: '#5a4030' });
  for (let i = 0; i < 30; i++) { const r = mulberry32(400 + i); const side = i % 2 ? 1 : -1; const t = blobTree(500 + i, 8 + r() * 6, leafM, trunkM); t.position.set(side * (22 + r() * 30), 0, 20 - r() * 160); scene.add(t); }
  // houses in the distance (the development that came with it)
  for (let i = 0; i < 8; i++) { const h = new THREE.Group(); h.position.set(-60 + i * 16, 0, -140); scene.add(h); mesh(boxUV(8, 4, 7, 2), mat({ color: ['#e8dcc8', '#d8e0e8', '#f0e4d0'][i % 3] }), [0, 2, 0], h); mesh(new THREE.ConeGeometry(6.5, 3, 4).rotateY(Math.PI / 4), mat({ color: '#6a4a3a' }), [0, 5.5, 0], h); }
  const golfer = figure({ coat: '#f0f0ec', pants: '#2a3a5a', skin: '#d0a888', hat: 'cap' });
  golfer.group.position.set(-0.4, 0, 8); golfer.group.rotation.y = Math.PI / 2; scene.add(golfer.group);
  const club = new THREE.Group(); golfer.arms[1].add(club);
  mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4).translate(0, -0.5, 0), mat({ color: '#c8c8cc' }), [0, -0.66, 0], club);
  mesh(new THREE.BoxGeometry(0.1, 0.05, 0.04), mat({ color: '#3a3a3e' }), [0.04, -1.18, 0], club);
  const ball = mesh(new THREE.SphereGeometry(0.06, 6, 4), mat({ color: '#ffffff', lit: 0.5 }), [0, 0.06, 8.6], scene);
  const cart = new THREE.Group(); cart.position.set(5, 0, 6); cart.rotation.y = -0.6; scene.add(cart);
  mesh(boxUV(1.2, 0.5, 2.2, 0.6), mat({ color: '#f4f4ee' }), [0, 0.55, 0], cart);
  mesh(boxUV(1.2, 0.06, 1.6, 0.6), mat({ color: '#2a6a3a' }), [0, 1.9, -0.1], cart);
  for (const [x, z] of [[-0.55, -0.7], [0.55, -0.7], [-0.55, 0.7], [0.55, 0.7]]) mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 8).rotateZ(Math.PI / 2), mat({ color: '#1a1a1a' }), [x, 0.2, z], cart);
  for (const x of [-0.5, 0.5]) mesh(new THREE.BoxGeometry(0.05, 1.4, 0.05), mat({ color: '#d8d8d4' }), [x, 1.2, -0.8], cart);
  // the ghost of Big Ear: a wireframe of the flat reflector standing over the course
  const ghostM = new THREE.LineBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0, depthWrite: false });
  const ghostG = new THREE.EdgesGeometry(new THREE.BoxGeometry(104, 33, 2, 8, 3, 1));
  const ghost = new THREE.LineSegments(ghostG, ghostM); ghost.position.set(0, 9, -75); ghost.scale.setScalar(0.55); ghost.rotation.x = -0.42; scene.add(ghost);
  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      const c = o.cam || [[6, 1.6, 13], [-2, 1.2, 4], 55, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 55);
      // the swing: s 0..1 backswing -> impact at 0.6 -> follow-through
      const s = clamp(o.swing ?? 0);
      const back = s < 0.45 ? E.outCubic(s / 0.45) : 1 - E.inCubic(clamp((s - 0.45) / 0.15)) * 1.9;
      const arm = s < 0.6 ? back : -0.9 - 0.6 * E.outCubic(clamp((s - 0.6) / 0.4));
      golfer.pose({ armL: 0.4 + 0.2 * arm, armR: 0.4 + 0.2 * arm, armLz: 0.3 + 1.6 * arm, armRz: 0.2 + 1.6 * arm, twist: 0.6 * arm, headPitch: 0.3 });
      club.rotation.set(0, 0, 0.5 * arm);
      const fly = clamp(o.ball ?? 0);
      ball.position.set(-fly * 5, 0.06 + Math.sin(fly * Math.PI) * 14, 8.6 - fly * 66);
      const fp = flagG.attributes.position;
      for (let i = 0; i < fp.count; i++) { const x = flagBase[i * 3]; fp.setXYZ(i, x, flagBase[i * 3 + 1], Math.sin(t * 6 - x * 4) * 0.12 * x); }
      fp.needsUpdate = true;
      clouds.forEach((cl, i) => faceCam(cl, cam, false));
      faceCam(sun, cam, false);
      ghostM.opacity = o.ghost ?? 0;
      ghost.visible = (o.ghost ?? 0) > 0.01;
      lights({ amb: [0.62, 0.64, 0.7], dir: [0.4, -0.8, -0.3], dirCol: [0.75, 0.72, 0.6], points: [], fog: [0.82, 0.9, 1.0], near: 60, far: 320 });
    },
  };
}

export function initWorld() { makeTextures(); }
