// The Somerton Man, built for a 1997 console: Somerton beach at dawn, an evidence table, the Rubaiyat, a
// 1940s car on a night street, a bungalow up the beach, the plaster bust, and a DNA helix. Every set's
// update(t, u, o) sets all it shows from time and its knobs o.
import { THREE, mat, tex, speckle, boxUV, plane, mesh, paint, camera, look, lights, U } from '../lib/ps1.js';
import * as M from '../lib/motion.js';

const { clamp, lerp, noise1, hash01, mulberry32, TAU, E } = M;
const shade = (hex, k) => { const [r, g, b] = M.hexRgb(hex); return `rgb(${Math.min(255, Math.round(r * k))},${Math.min(255, Math.round(g * k))},${Math.min(255, Math.round(b * k))})`; };
const dummy = new THREE.Object3D();
export const TX = {};

function makeTextures() {
  TX.sand = tex(32, 32, (c, w, h) => { c.fillStyle = '#c8b48c'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#bba67e', '#d6c39c', '#a8936e', '#e0d0ac'], 3, 0.7); });
  TX.wet = tex(32, 32, (c, w, h) => { c.fillStyle = '#8a7a62'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#7a6c56', '#9a8a70'], 5, 0.5); });
  TX.water = tex(32, 32, (c, w, h) => { c.fillStyle = '#3a6a86'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#4a7a96', '#2e5a74', '#6a9ab2', '#c8dce4'], 7, 0.35); });
  TX.stone = tex(64, 64, (c, w, h) => {
    c.fillStyle = '#4a4640'; c.fillRect(0, 0, w, h);
    const r = mulberry32(9);
    for (let y = 0; y < h; y += 12) for (let x = -((y / 12) % 2) * 10; x < w; x += 20) { c.fillStyle = shade('#a89c86', 0.7 + r() * 0.35); c.fillRect(x + 1, y + 1, 18 - Math.floor(r() * 4), 10); }
    speckle(c, w, h, ['#8a8070', '#b8ac94', '#6a6458'], 11, 0.25);
  });
  TX.road = tex(32, 32, (c, w, h) => { c.fillStyle = '#3a3a3c'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#444446', '#303032', '#4c4c4e'], 13, 0.6); });
  TX.grass = tex(32, 32, (c, w, h) => { c.fillStyle = '#4a6a34'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#3e5c2c', '#56783c', '#34502a'], 15, 0.8); });
  TX.render = tex(32, 32, (c, w, h) => { c.fillStyle = '#d8ccb4'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#ccc0a8', '#e2d8c2', '#c4b8a0'], 17, 0.4); });
  TX.brick = tex(32, 32, (c, w, h) => { c.fillStyle = '#5a4034'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 6) for (let x = -((y / 6) % 2) * 6; x < w; x += 12) { c.fillStyle = shade('#9a5a44', 0.8 + 0.25 * hash01(x + y * 31, 2)); c.fillRect(x + 1, y + 1, 10, 4); } });
  TX.tile = tex(32, 32, (c, w, h) => { for (let y = 0; y < h; y += 6) for (let x = -((y / 6) % 2) * 4; x < w; x += 8) { c.fillStyle = shade('#8a3a2a', 0.75 + 0.3 * hash01(x * 3 + y, 4)); c.fillRect(x, y, 7, 5); c.fillStyle = '#2a1410'; c.fillRect(x, y + 5, 8, 1); } });
  TX.wood = tex(32, 32, (c, w, h) => { c.fillStyle = '#4a2e1c'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#3a2214', '#5a3a24', '#2e1a0e'], 19, 0.5); for (let y = 0; y < h; y += 4) { c.fillStyle = 'rgba(20,10,4,0.35)'; c.fillRect(0, y, w, 1); } });
  TX.felt = tex(32, 32, (c, w, h) => { c.fillStyle = '#26302a'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#202a24', '#2e3a32'], 21, 0.6); });
  TX.suit = tex(16, 16, (c, w, h) => { c.fillStyle = '#4a4036'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#40362e', '#54493e'], 23, 0.7); });
  TX.skin = tex(16, 16, (c, w, h) => { c.fillStyle = '#b89a80'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#a88a70', '#c4a88e'], 25, 0.5); });
  TX.plaster = tex(32, 32, (c, w, h) => { c.fillStyle = '#d8d2c4'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#cac4b6', '#e4dfd2', '#bdb6a8'], 27, 0.5); });
  TX.leaf = tex(32, 32, (c, w, h) => { c.fillStyle = '#1e3a24'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#264a2c', '#16301c', '#2e5634'], 29, 0.9); });
  TX.paint = tex(16, 16, (c, w, h) => { c.fillStyle = '#20302a'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#1a2a24', '#2a3c34', '#3a4e44'], 31, 0.4); });
  TX.chrome = tex(16, 16, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f0f0f0'); g.addColorStop(0.5, '#707478'); g.addColorStop(1, '#c8ccd0'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
  TX.gull = tex(32, 16, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = '#f2f2ee';
    for (const [f, up] of [[0, 1], [1, -1]]) { const ox = f * 16; c.fillRect(ox + 6, 7, 4, 2); for (let i = 0; i < 6; i++) { c.fillRect(ox + 7 - i, 7 - up * Math.floor(i * 0.6), 1, 1); c.fillRect(ox + 9 + i, 7 - up * Math.floor(i * 0.6), 1, 1); } }
  });
  // the book's cover: dark green cloth, gilt border and title
  TX.cover = tex(64, 96, (c, w, h) => {
    c.fillStyle = '#1e3a2a'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#18321f', '#24432f'], 33, 0.6);
    c.strokeStyle = '#c8a24a'; c.lineWidth = 1; c.strokeRect(4.5, 4.5, w - 9, h - 9); c.strokeRect(7.5, 7.5, w - 15, h - 15);
    c.fillStyle = '#d8b25a';
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; c.fillRect(32 + Math.cos(a) * 9 - 1, 52 + Math.sin(a) * 9 - 1, 2, 2); }
    c.font = '9px serif'; c.textAlign = 'center'; c.fillText('RUBAIYAT', 32, 28); c.font = '6px serif'; c.fillText('OMAR KHAYYAM', 32, 38);
  });
  TX.pages = tex(16, 16, (c, w, h) => { c.fillStyle = '#e8e0cc'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { c.fillStyle = '#d0c6b0'; c.fillRect(0, y, w, 1); } });
  TX.paper = tex(16, 16, (c, w, h) => { c.fillStyle = '#ece4d0'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#e0d6c0', '#f4eee0'], 35, 0.4); });
  TX.cloud = tex(32, 16, (c, w, h) => { c.clearRect(0, 0, w, h); for (let k = 0; k < 7; k++) { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(6 + k * 3.3, 9 - Math.sin((k / 6) * Math.PI) * 3, 3 + hash01(k, 3) * 3, 0, TAU); c.fill(); } });
}

// ---------------------------------------------------------------- builders

function uvScale(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
function billboardQuad(w, h, m, anchor = 'bottom') { const g = new THREE.PlaneGeometry(w, h); if (anchor === 'bottom') g.translate(0, h / 2, 0); return new THREE.Mesh(g, m); }
function faceCam(o, cam, yOnly = true) { if (yOnly) o.rotation.set(0, Math.atan2(cam.position.x - o.position.x, cam.position.z - o.position.z), 0); else o.quaternion.copy(cam.quaternion); }
function gradSky(r = 200) {
  const g = new THREE.SphereGeometry(r, 16, 12);
  paint(g, () => [1, 1, 1]);
  const m = mesh(g, mat({ vertexColors: true, lit: 0, fog: 0, side: THREE.BackSide, warp: 0 }));
  m.userData.r = r;
  return m;
}
function recolorSky(m, top, mid, hor) {
  const cols = [top, mid, hor].map((h) => new THREE.Color(h));
  const p = m.geometry.attributes.position, c = m.geometry.attributes.color, r = m.userData.r;
  for (let i = 0; i < p.count; i++) { const k = clamp(p.getY(i) / r); const cc = k > 0.25 ? cols[1].clone().lerp(cols[0], (k - 0.25) / 0.75) : cols[2].clone().lerp(cols[1], k / 0.25); c.setXYZ(i, cc.r, cc.g, cc.b); }
  c.needsUpdate = true;
}
// a Norfolk Island pine: a trunk and tiers of flat whorls
function pine(seed, h, leafM, trunkM) {
  const g = new THREE.Group(), r = mulberry32(seed);
  mesh(new THREE.CylinderGeometry(0.12, 0.3, h, 5).translate(0, h / 2, 0), trunkM, [0, 0, 0], g);
  for (let k = 0; k < 7; k++) { const y = h * (0.3 + k * 0.1), rad = (1 - k / 8) * h * 0.22 + 0.4; const c = mesh(new THREE.ConeGeometry(rad, h * 0.08, 6), leafM, [0, y, 0], g); c.rotation.y = r() * 3; }
  mesh(new THREE.ConeGeometry(0.5, h * 0.18, 5), leafM, [0, h * 1.02, 0], g);
  return g;
}

export function figure({ coat = '#4a4036', pants = '#3a322a', skin = '#b89a80', hat = false, scale = 1 } = {}) {
  const grp = new THREE.Group();
  const mc = mat({ map: TX.suit, color: coat }), mp = mat({ map: TX.suit, color: pants }), ms = mat({ map: TX.skin, color: skin });
  const hip = new THREE.Group(); hip.position.y = 0.95; grp.add(hip);
  const legs = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(0.11 * s, 0, 0); hip.add(p); mesh(boxUV(0.16, 0.95, 0.18, 0.5).translate(0, -0.47, 0), mp, [0, 0, 0], p); mesh(new THREE.BoxGeometry(0.15, 0.08, 0.28).translate(0, -0.94, 0.05), mat({ color: '#1a1410' }), [0, 0, 0], p); return p; });
  mesh(boxUV(0.48, 0.7, 0.28, 0.5).translate(0, 0.35, 0), mc, [0, 0, 0], hip);
  const chest = new THREE.Group(); chest.position.y = 0.66; hip.add(chest);
  const arms = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(0.29 * s, 0, 0); chest.add(p); mesh(boxUV(0.13, 0.64, 0.14, 0.5).translate(0, -0.32, 0), mc, [0, 0, 0], p); mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1).translate(0, -0.68, 0), ms, [0, 0, 0], p); return p; });
  mesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), mat({ color: '#e8e4dc' }), [0, 0.0, 0.14], chest);   // shirt front
  const neck = new THREE.Group(); neck.position.y = 0.08; chest.add(neck);
  mesh(new THREE.SphereGeometry(0.15, 7, 5).scale(1, 1.15, 1), ms, [0, 0.16, 0], neck);
  mesh(new THREE.SphereGeometry(0.155, 7, 4, 0, TAU, 0, Math.PI * 0.42).scale(1, 1.1, 1), mat({ color: '#6a5a4a' }), [0, 0.19, -0.01], neck);
  if (hat) { mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 8), mat({ color: '#2a2622' }), [0, 0.3, 0], neck); mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.14, 7), mat({ color: '#2a2622' }), [0, 0.38, 0], neck); }
  grp.scale.setScalar(scale);
  const pose = ({ armL = 0, armR = 0, armLz = 0, armRz = 0, sit = 0, legsOut = 0, cross = 0, headPitch = 0, headYaw = 0, lean = 0, headRoll = 0 } = {}) => {
    legs[0].rotation.set(-sit * 1.5 - legsOut * 1.5, 0, cross * 0.12); legs[1].rotation.set(-sit * 1.5 - legsOut * 1.5, 0, -cross * 0.12);
    if (cross) { legs[0].position.x = 0.11 - cross * 0.08; legs[1].position.x = -0.11 + cross * 0.08; }
    arms[0].rotation.set(-armL, 0, armLz); arms[1].rotation.set(-armR, 0, armRz);
    hip.position.y = 0.95 - (sit + legsOut) * 0.45 * (legsOut ? 1.7 : 1);
    chest.rotation.set(lean, 0, 0);
    neck.rotation.set(headPitch, headYaw, headRoll);
  };
  pose();
  return { group: grp, pose };
}

// ---------------------------------------------------------------- SOMERTON BEACH at dawn

export function beachSet() {
  const scene = new THREE.Scene(), cam = camera(55, 0.1, 500);
  const sky = gradSky(300); scene.add(sky);
  recolorSky(sky, '#4a6a9a', '#d8a8a0', '#f4d8b8');
  const clouds = [];
  for (let i = 0; i < 8; i++) { const c = billboardQuad(40, 20, mat({ map: TX.cloud, lit: 0, fog: 0, alphaTest: 0.5, color: '#f4d8d0', warp: 0 }), 'center'); c.position.set(-120 - hash01(i, 2) * 60, 30 + hash01(i, 3) * 40, (hash01(i, 4) - 0.5) * 240); scene.add(c); clouds.push(c); }
  // the gulf: an animated sea to the west (x < 0)
  const seaG = new THREE.PlaneGeometry(220, 260, 44, 52).rotateX(-Math.PI / 2);
  uvScale(seaG, 40, 48);
  const seaBase = Float32Array.from(seaG.attributes.position.array);
  const sea = mesh(seaG, mat({ map: TX.water }), [-112, 0, 0], scene);
  mesh(plane(16, 260, 4, 40, 4).rotateX(-Math.PI / 2), mat({ map: TX.wet }), [-4, 0.02, 0], scene);
  mesh(plane(16, 260, 4, 40, 4).rotateX(-Math.PI / 2), mat({ map: TX.sand }), [4, 0.03, 0], scene).position.y = 0.04;
  const foamM = mat({ color: '#f4f2ea', lit: 0.6, transparent: true, opacity: 0.85, depthWrite: false });
  const foam = mesh(new THREE.PlaneGeometry(3, 260, 1, 40).rotateX(-Math.PI / 2), foamM, [-11, 0.08, 0], scene);
  // the seawall at x = 12, the esplanade behind it
  mesh(boxUV(1.2, 1.9, 260, 1.2, 0.6), mat({ map: TX.stone }), [12.6, 0.95, 0], scene);
  mesh(boxUV(0.5, 0.25, 260, 0.6, 0.8), mat({ map: TX.render }), [12.8, 2.0, 0], scene);
  for (const z of [-26, 14]) for (let k = 0; k < 6; k++) mesh(boxUV(0.45, 0.32, 2.4, 0.5), mat({ map: TX.stone, color: '#c8c0b0' }), [11.8 - k * 0.42, 0.16 + k * 0.31, z], scene);
  mesh(plane(18, 260, 4, 40, 6).rotateX(-Math.PI / 2), mat({ map: TX.road }), [22, 1.9, 0], scene);
  mesh(plane(40, 260, 6, 40, 8).rotateX(-Math.PI / 2), mat({ map: TX.grass }), [50, 1.88, 0], scene);
  // the Crippled Children's Home across the road: two storeys, a long veranda
  const home = new THREE.Group(); home.position.set(38, 1.9, -6); scene.add(home);
  mesh(boxUV(10, 7, 30, 1.5), mat({ map: TX.render }), [0, 3.5, 0], home);
  mesh(boxUV(11, 0.4, 31, 1.5), mat({ map: TX.tile }), [0, 7.2, 0], home);
  mesh(new THREE.ConeGeometry(17, 4, 4).rotateY(Math.PI / 4).scale(0.42, 1, 1.25), mat({ map: TX.tile }), [0, 9.2, 0], home);
  mesh(boxUV(2.4, 0.25, 30, 1.5), mat({ map: TX.render, color: '#c8bca4' }), [-6.2, 3.6, 0], home);
  for (let z = -14; z <= 14; z += 3.5) mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 5).translate(0, 1.8, 0), mat({ color: '#e8e0d0' }), [-7.2, 0, z], home);
  const winM = mat({ color: '#ffd89a', lit: 0 });
  for (let z = -12; z <= 12; z += 4) for (const y of [2, 5.2]) mesh(new THREE.PlaneGeometry(1.2, 1.4).rotateY(-Math.PI / 2), winM, [-5.02, y, z], home);
  // Norfolk Island pines and lamp posts along the esplanade
  const leafM = mat({ map: TX.leaf }), trunkM = mat({ color: '#3a2a20' });
  for (let i = 0; i < 12; i++) { const p = pine(70 + i, 14 + hash01(i, 5) * 6, leafM, trunkM); p.position.set(15.5 + hash01(i, 6) * 2, 1.9, -100 + i * 18); scene.add(p); }
  const lampM = mat({ color: '#2a2a2a' });
  for (let i = 0; i < 14; i++) { const z = -95 + i * 14; mesh(new THREE.CylinderGeometry(0.07, 0.1, 4, 5).translate(0, 2, 0), lampM, [14.2, 1.9, z], scene); mesh(new THREE.SphereGeometry(0.22, 6, 4), mat({ color: '#fff2c8', lit: 0 }), [14.2, 6, z], scene); }
  // the man against the wall, legs out and crossed, head back
  const man = figure({ coat: '#5a4c3e', pants: '#4a3e32' });
  man.group.position.set(11.75, 0.04, -4); man.group.rotation.y = -Math.PI / 2; scene.add(man.group);
  man.pose({ legsOut: 1, cross: 1, armL: 0.15, armR: 0.15, armLz: 0.15, armRz: -0.15, headPitch: -0.35, lean: -0.25, headRoll: 0.1 });
  // two policemen arrive
  const cops = [0, 1].map((i) => { const f = figure({ coat: '#1e2430', pants: '#1e2430', hat: true }); f.group.position.set(9.5 - i * 1.2, 0.04, -2.4 - i * 1.6); f.group.rotation.y = -2.0 + i * 0.4; scene.add(f.group); return f; });
  // gulls
  const gullM = [0, 1].map(() => mat({ map: TX.gull, lit: 0, fog: 0.3, alphaTest: 0.5, side: THREE.DoubleSide, warp: 0 }));
  const gulls = Array.from({ length: 7 }, (_, i) => { const g = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), gullM[i % 2]); scene.add(g); return g; });
  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      const c = o.cam || [[-2, 3, 14], [11, 1, -4], 50, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 50);
      if (o.sky) recolorSky(sky, ...o.sky);
      // waves: long swells rolling in toward +x
      const p = seaG.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = seaBase[i * 3] - 112, z = seaBase[i * 3 + 2]; p.setY(i, 0.18 * Math.sin(x * 0.35 - t * 1.6 + z * 0.05) + 0.08 * Math.sin(z * 0.4 + t * 0.9)); }
      p.needsUpdate = true; seaG.computeVertexNormals();
      foam.position.x = -11 + 1.2 * Math.sin(t * 0.8);
      foamM.uniforms.uOpacity.value = 0.55 + 0.3 * Math.sin(t * 0.8 + 1.2);
      man.group.visible = (o.man ?? 1) > 0.5;
      cops.forEach((f, i) => { f.group.visible = (o.cops ?? 0) > 0.5; f.pose({ headPitch: 0.4, armL: 0.1, armR: 0.1 }); });
      gulls.forEach((g, i) => {
        const a = t * (0.25 + i * 0.03) + i * 1.7, rad = 10 + i * 2;
        g.position.set(-4 + Math.cos(a) * rad, 9 + i * 1.3 + Math.sin(t * 2 + i) * 0.6, -6 + Math.sin(a) * rad);
        g.material = gullM[(Math.floor(t * 5 + i) % 2)];
        gullM.forEach((m) => m.uniforms.uUvT.value.set(0.5, 1, 0, 0));
        gullM[1].uniforms.uUvT.value.set(0.5, 1, 0.5, 0);
        faceCam(g, cam, false);
      });
      clouds.forEach((cl) => faceCam(cl, cam, false));
      const day = o.day ?? 0.6;
      winM.uniforms.uColor.value.setScalar(lerp(1, 0.3, day));
      lights({
        amb: [lerp(0.2, 0.55, day), lerp(0.2, 0.52, day), lerp(0.28, 0.55, day)], dir: [-0.6, -0.5, 0.3], dirCol: [lerp(0.4, 1.0, day), lerp(0.35, 0.82, day), lerp(0.45, 0.7, day)],
        points: [], fog: o.fog || [0.86, 0.78, 0.76], near: 30, far: 220,
      });
    },
  };
}

// ---------------------------------------------------------------- THE EVIDENCE TABLE

export function evidenceSet() {
  const scene = new THREE.Scene(), cam = camera(45);
  mesh(plane(6, 6, 6, 6, 0.4).rotateX(-Math.PI / 2), mat({ map: TX.felt }), [0, 0, 0], scene);
  const items = [];
  const add = (geo, m, x, z, ry, label) => { const o = mesh(geo, m, [x, 0, z], scene); o.rotation.y = ry; o.userData.label = label; items.push(o); return o; };
  add(new THREE.BoxGeometry(0.06, 0.012, 0.42).translate(0, 0.006, 0), mat({ map: TX.chrome }), -0.55, -0.25, 0.3, 'COMB');
  add(new THREE.BoxGeometry(0.22, 0.03, 0.09).translate(0, 0.015, 0), mat({ color: '#e8c63a' }), 0.15, -0.45, -0.15, 'CHEWING GUM');
  add(new THREE.BoxGeometry(0.2, 0.05, 0.3).translate(0, 0.025, 0), mat({ color: '#e8e4dc' }), 0.55, -0.05, 0.2, 'CIGARETTES');
  add(new THREE.BoxGeometry(0.14, 0.04, 0.22).translate(0, 0.02, 0), mat({ color: '#c84a2a' }), 0.0, 0.25, 0.5, 'MATCHES');
  add(new THREE.BoxGeometry(0.28, 0.004, 0.14).translate(0, 0.002, 0), mat({ color: '#b8d4b0', map: TX.paper }), -0.45, 0.35, -0.35, 'RAIL TICKET');
  add(new THREE.BoxGeometry(0.2, 0.004, 0.11).translate(0, 0.002, 0), mat({ color: '#e8d8a0', map: TX.paper }), 0.45, 0.45, 0.6, 'BUS TICKET');
  return {
    scene, camera: cam, items,
    update(t, u, o = {}) {
      const c = o.cam || [[0.05, 2.2, 0.35], [0, 0, 0], 45, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 45);
      const shown = o.shown ?? 6;
      items.forEach((it, i) => { const k = clamp(shown - i); it.visible = k > 0; it.position.y = (1 - E.outBack(k, 2)) * 0.3; });
      lights({ amb: [0.25, 0.24, 0.22], dir: [0.2, -1, 0.3], dirCol: [0.4, 0.38, 0.34], points: [{ pos: [0.2, 1.4, -0.2], col: [1.6, 1.4, 1.05], r: 3.0 }], fog: [0.02, 0.02, 0.02], near: 3, far: 8 });
    },
  };
}

// ---------------------------------------------------------------- THE BOOK

export function bookSet() {
  const scene = new THREE.Scene(), cam = camera(45);
  mesh(plane(6, 6, 6, 6, 0.4).rotateX(-Math.PI / 2), mat({ map: TX.wood }), [0, 0, 0], scene);
  const book = new THREE.Group(); scene.add(book);
  mesh(new THREE.BoxGeometry(0.62, 0.08, 0.92).translate(0.31, 0.045, 0), mat({ map: TX.pages }), [0, 0, 0], book);
  mesh(new THREE.BoxGeometry(0.64, 0.012, 0.94).translate(0.32, 0.004, 0), mat({ map: TX.cover }), [0, 0, 0], book);
  const lid = new THREE.Group(); lid.position.set(0, 0.09, 0); book.add(lid);
  mesh(new THREE.BoxGeometry(0.64, 0.012, 0.94).translate(0.32, 0, 0), mat({ map: TX.cover }), [0, 0, 0], lid);
  mesh(new THREE.BoxGeometry(0.03, 0.1, 0.94), mat({ color: '#1a3022' }), [-0.01, 0.045, 0], book);
  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      const c = o.cam || [[0.3, 1.1, 0.9], [0.3, 0.05, 0], 45, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 45);
      lid.rotation.z = E.inOutCubic(clamp(o.open ?? 0)) * 3.0;
      book.rotation.y = o.spin ?? 0;
      lights({ amb: [0.16, 0.14, 0.12], dir: [0.2, -1, 0.2], dirCol: [0.2, 0.18, 0.16], points: [{ pos: [0.6, 0.9, -0.3], col: [1.8, 1.45, 0.95], r: 2.6 }], fog: [0.02, 0.02, 0.02], near: 2, far: 7 });
    },
  };
}

// ---------------------------------------------------------------- THE CAR: Jetty Road, Glenelg, at night

export function carSet() {
  const scene = new THREE.Scene(), cam = camera(50, 0.1, 300);
  const sky = gradSky(200); scene.add(sky); recolorSky(sky, '#05070c', '#0c1220', '#1a2234');
  mesh(plane(14, 200, 4, 40, 4).rotateX(-Math.PI / 2), mat({ map: TX.road }), [0, 0, 0], scene);
  for (const s of [-1, 1]) mesh(boxUV(3, 0.15, 200, 1.2, 2), mat({ map: TX.render, color: '#8a8478' }), [s * 8.5, 0.075, 0], scene);
  // shopfronts
  const winM = mat({ color: '#ffcf80', lit: 0 });
  for (const s of [-1, 1]) for (let i = 0; i < 12; i++) {
    const g = new THREE.Group(); g.position.set(s * 12, 0, -60 + i * 10); scene.add(g);
    const hgt = 5 + hash01(i * 2 + (s > 0 ? 1 : 0), 3) * 3;
    mesh(boxUV(4, hgt, 9.6, 1.5), mat({ map: i % 3 ? TX.render : TX.brick, color: i % 3 ? '#b8ac94' : '#ffffff' }), [0, hgt / 2, 0], g);
    if (hash01(i, s > 0 ? 7 : 8) > 0.35) mesh(new THREE.PlaneGeometry(6, 2).rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2), winM, [-s * 2.02, 1.5, 0], g);
    mesh(boxUV(1.4, 0.2, 9.6, 1), mat({ color: '#3a3430' }), [-s * 2.6, 3.0, 0], g);
  }
  const lamps = [];
  for (let i = 0; i < 6; i++) { const z = -40 + i * 16; for (const s of [-1, 1]) { mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 5).translate(0, 2.25, 0), mat({ color: '#2a2a2a' }), [s * 7.4, 0, z], scene); lamps.push(mesh(new THREE.SphereGeometry(0.25, 6, 4), mat({ color: '#fff0c0', lit: 0 }), [s * 7.4, 4.6, z], scene)); } }
  // a 1940s sedan
  const car = new THREE.Group(); car.position.set(5.2, 0, 0.8); scene.add(car);
  const paintM = mat({ map: TX.paint, color: '#3a4e46' }), glassM = mat({ color: '#0e1418', lit: 0.4 }), chromeM = mat({ map: TX.chrome });
  mesh(boxUV(1.8, 0.6, 4.6, 0.6), paintM, [0, 0.75, 0], car);
  for (const s of [-1, 1]) for (const z of [-1.4, 1.5]) { mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10).rotateZ(Math.PI / 2), mat({ color: '#141414' }), [s * 0.82, 0.42, z], car); mesh(new THREE.SphereGeometry(0.5, 8, 6, 0, TAU, 0, Math.PI / 2).scale(0.5, 0.75, 1.1), paintM, [s * 0.75, 0.55, z], car); }
  // an open tourer: no roof, a windscreen, the folded hood behind the back seat
  mesh(new THREE.PlaneGeometry(1.6, 0.45).rotateX(-0.25), glassM, [0, 1.3, -1.0], car);
  mesh(new THREE.BoxGeometry(1.7, 0.06, 0.06), chromeM, [0, 1.52, -1.05], car);
  mesh(boxUV(1.6, 0.25, 0.5, 0.5), mat({ color: '#2a2622' }), [0, 1.15, 1.75], car);
  mesh(boxUV(1.5, 0.3, 0.6, 0.5), mat({ color: '#6a4a3a', map: TX.suit }), [0, 0.95, -0.55], car);
  mesh(boxUV(1.5, 0.5, 0.15, 0.5), mat({ color: '#6a4a3a', map: TX.suit }), [0, 1.25, -0.25], car);
  mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 10).rotateX(1.2), mat({ color: '#1a1a1a' }), [0.4, 1.3, -0.85], car);
  const rear = { visible: true };
  mesh(new THREE.BoxGeometry(1.9, 0.12, 0.12), chromeM, [0, 0.55, -2.35], car);
  mesh(new THREE.BoxGeometry(1.9, 0.12, 0.12), chromeM, [0, 0.55, 2.35], car);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.16, 8, 6), mat({ color: '#f0e8c8', lit: 0.3 }), [s * 0.6, 0.9, -2.35], car);
  // the back seat and the book on it
  mesh(boxUV(1.5, 0.3, 0.7, 0.5), mat({ color: '#6a4a3a', map: TX.suit }), [0, 0.95, 0.75], car);
  mesh(boxUV(1.5, 0.55, 0.15, 0.5), mat({ color: '#6a4a3a', map: TX.suit }), [0, 1.27, 1.12], car);
  const book = mesh(new THREE.BoxGeometry(0.3, 0.05, 0.42), mat({ map: TX.cover }), [0.25, 1.13, 0.7], car);
  book.rotation.y = 0.5;
  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      const c = o.cam || [[3, 1.6, 9], [5.2, 1.0, 1], 50, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 50);
      rear.visible = (o.glass ?? 1) > 0.5;
      lights({
        amb: [0.2, 0.21, 0.28], dir: [0.3, -1, 0.2], dirCol: [0.18, 0.2, 0.28],
        points: [{ pos: [7.4, 4.4, 2], col: [2.0, 1.7, 1.1], r: 12 }, { pos: [7.4, 4.4, -14], col: [1.2, 1.0, 0.7], r: 11 }, { pos: [5.2, 2.4, 0.8], col: 0.5 + (o.torch ?? 0) * 1.0, r: 2.6 }].map((p) => ({ ...p, col: Array.isArray(p.col) ? p.col : [p.col, p.col * 0.95, p.col * 0.8] })),
        fog: [0.04, 0.05, 0.08], near: 10, far: 70,
      });
    },
  };
}

// ---------------------------------------------------------------- MOSELEY STREET: the bungalow up the beach

export function houseSet() {
  const scene = new THREE.Scene(), cam = camera(50, 0.1, 300);
  const sky = gradSky(200); scene.add(sky); recolorSky(sky, '#06080e', '#101828', '#24304a');
  mesh(plane(80, 80, 10, 10, 6).rotateX(-Math.PI / 2), mat({ map: TX.grass, color: '#6a7a6a' }), [0, 0, 0], scene);
  mesh(plane(8, 80, 2, 10, 6).rotateX(-Math.PI / 2), mat({ map: TX.road }), [0, 0.02, 8], scene);
  const h = new THREE.Group(); scene.add(h);
  mesh(boxUV(9, 3.2, 7, 1.2), mat({ map: TX.brick }), [0, 1.6, -4], h);
  mesh(new THREE.ConeGeometry(7, 2.6, 4).rotateY(Math.PI / 4).scale(1, 1, 0.8), mat({ map: TX.tile }), [0, 4.5, -4], h);
  mesh(boxUV(3.4, 0.2, 2.2, 1), mat({ map: TX.render }), [-1.5, 2.9, -0.2], h);
  for (const x of [-3, 0]) mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.8, 5).translate(0, 1.4, 0), mat({ map: TX.render }), [x, 0, 0.8], h);
  const porchM = mat({ color: '#ffd890', lit: 0 });
  const porch = mesh(new THREE.SphereGeometry(0.16, 6, 4), porchM, [-1.5, 2.6, 0.6], h);
  const winM = mat({ color: '#ffcf80', lit: 0 });
  mesh(new THREE.PlaneGeometry(1.4, 1.2), winM, [2.4, 1.7, -0.48], h);
  mesh(new THREE.PlaneGeometry(1.0, 2.0), mat({ color: '#3a2a1e' }), [-1.5, 1.0, -0.48], h);
  for (let x = -6; x <= 6; x += 0.5) mesh(new THREE.BoxGeometry(0.08, 0.9, 0.04).translate(0, 0.45, 0), mat({ color: '#e8e4d8' }), [x, 0, 3.2], scene);
  mesh(new THREE.BoxGeometry(12.5, 0.06, 0.05), mat({ color: '#e8e4d8' }), [0, 0.7, 3.2], scene);
  const leafM = mat({ map: TX.leaf, color: '#7a9a7a' }), trunkM = mat({ color: '#2a2018' });
  for (const [x, z] of [[-9, -6], [9, -3], [-12, 4]]) { const p = pine(300 + x, 12, leafM, trunkM); p.position.set(x, 0, z); scene.add(p); }
  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      const c = o.cam || [[3, 1.7, 14], [0, 1.8, -2], 50, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 50);
      const fl = 1 - 0.12 * Math.max(0, noise1(t * 7, 3));
      porchM.uniforms.uColor.value.setScalar(fl);
      winM.uniforms.uColor.value.setRGB(1.0 * (o.window ?? 1), 0.78 * (o.window ?? 1), 0.45 * (o.window ?? 1));
      lights({ amb: [0.1, 0.11, 0.16], dir: [-0.4, -0.6, -0.5], dirCol: [0.22, 0.26, 0.4], points: [{ pos: [-1.5, 2.5, 1.2], col: [1.6 * fl, 1.2 * fl, 0.7 * fl], r: 6 }, { pos: [2.4, 1.7, 0.4], col: [0.9, 0.7, 0.4], r: 4 }], fog: [0.04, 0.05, 0.08], near: 12, far: 60 });
    },
  };
}

// ---------------------------------------------------------------- THE BUST: plaster, eyes closed

export function bustSet() {
  const scene = new THREE.Scene(), cam = camera(40);
  const back = mesh(new THREE.PlaneGeometry(20, 12), mat({ color: '#0c0b0a', lit: 0.3 }), [0, 3, -3], scene);
  mesh(boxUV(0.8, 1.1, 0.8, 0.5), mat({ map: TX.wood }), [0, 0.55, 0], scene);
  const bust = new THREE.Group(); bust.position.set(0, 1.1, 0); scene.add(bust);
  const pm = mat({ map: TX.plaster });
  mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, TAU, 0, Math.PI / 2).scale(1.25, 0.55, 0.8), pm, [0, 0.0, 0], bust);       // shoulders
  mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.25, 8), pm, [0, 0.3, 0], bust);
  // the head: a sphere sculpted into a face (closed eyes, a strong nose, brows, lips, chin), with
  // vertex shading in the hollows so it reads at 216 px wide
  const g = new THREE.SphereGeometry(0.2, 28, 22);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const G = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2));
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    x *= 0.8; y *= 1.2; z *= 1.02;
    let ao = 0;
    if (z > 0.02) {
      const f = Math.min(1, z / 0.12);
      const sock = G(Math.abs(x), y, 0.07, 0.05, 0.04, 0.03); z -= sock * 0.045 * f; ao += sock * 0.55;
      const brow = G(Math.abs(x), y, 0.07, 0.095, 0.06, 0.018); z += brow * 0.022 * f;
      const lid = G(Math.abs(x), y, 0.07, 0.045, 0.03, 0.006); ao += lid * 0.5;
      const nose = G(x, y, 0, -0.01, 0.024, 0.075) + 0.6 * G(x, y, 0, -0.07, 0.035, 0.02); z += nose * 0.09 * f;
      const nostril = G(Math.abs(x), y, 0.022, -0.08, 0.012, 0.01); ao += nostril * 0.6;
      const lips = G(x, y, 0, -0.125, 0.05, 0.016); z += lips * 0.02 * f;
      const seam = G(x, y, 0, -0.127, 0.05, 0.004); ao += seam * 0.7;
      const chin = G(x, y, 0, -0.19, 0.045, 0.03); z += chin * 0.02 * f;
      const cheek = G(Math.abs(x), y, 0.1, -0.06, 0.04, 0.04); z -= cheek * 0.012 * f; ao += cheek * 0.15;
    }
    if (y < -0.14) { x *= 0.86; z *= 0.94; }
    const hair = y > 0.1 && z < 0.12 ? Math.min(1, (y - 0.1) / 0.05) : 0;
    p.setXYZ(i, x, y, z);
    const k = 1 - ao * 0.6;
    col[i * 3] = k * (1 - 0.25 * hair); col[i * 3 + 1] = k * (1 - 0.28 * hair); col[i * 3 + 2] = k * (1 - 0.32 * hair);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  mesh(g, mat({ map: TX.plaster, vertexColors: true }), [0, 0.62, 0.02], bust);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.05, 6, 5).scale(0.5, 1, 0.8), pm, [s * 0.17, 0.63, 0], bust);
  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      const c = o.cam || [[0.5, 1.8, 1.8], [0, 1.65, 0], 40, 0];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 40);
      bust.rotation.y = o.turn ?? 0.25;
      const fl = o.flash ?? 0;
      lights({ amb: [0.06 + fl, 0.06 + fl, 0.07 + fl], dir: [0.4, -0.7, -0.5], dirCol: [0.1, 0.1, 0.12], points: [{ pos: [0.7, 2.1, 1.1], col: [1.9, 1.75, 1.45], r: 3.2 }, { pos: [-0.9, 1.7, 0.6], col: [0.35, 0.4, 0.55], r: 2.4 }], fog: [0.01, 0.01, 0.01], near: 3, far: 9 });
    },
  };
}

// ---------------------------------------------------------------- DNA

export function dnaSet() {
  const scene = new THREE.Scene(), cam = camera(50);
  const n = 64;
  const ballG = new THREE.IcosahedronGeometry(0.09, 0);
  const strandA = new THREE.InstancedMesh(ballG, mat({ color: '#6ad8ff', lit: 0 }), n);
  const strandB = new THREE.InstancedMesh(ballG, mat({ color: '#ff5a6a', lit: 0 }), n);
  const rungs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 4), mat({ color: '#f2eee4', lit: 0 }), n);
  [strandA, strandB, rungs].forEach((m) => { m.frustumCulled = false; scene.add(m); });
  const dust = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.02, 0), mat({ color: '#8ab8ff', lit: 0 }), 120);
  dust.frustumCulled = false; scene.add(dust);
  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      const c = o.cam || [[2.2, 0, 3.4], [0, 0, 0], 50, 0.1];
      look(cam, c[0], c[1], c[3] || 0, c[2] || 50);
      const grow = clamp(o.grow ?? 1), spin = t * 0.9;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1), y = (k - 0.5) * 7, a = k * 14 + spin, vis = k <= grow ? 1 : 0;
        const ax = Math.cos(a) * 0.55, az = Math.sin(a) * 0.55;
        dummy.position.set(ax, y, az); dummy.scale.setScalar(vis); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); strandA.setMatrixAt(i, dummy.matrix);
        dummy.position.set(-ax, y, -az); dummy.updateMatrix(); strandB.setMatrixAt(i, dummy.matrix);
        dummy.position.set(0, y, 0); dummy.rotation.set(0, -a, Math.PI / 2); dummy.scale.set(vis, 1.1 * vis, vis); dummy.updateMatrix(); rungs.setMatrixAt(i, dummy.matrix);
      }
      for (let i = 0; i < 120; i++) { dummy.position.set((hash01(i, 2) - 0.5) * 6, ((hash01(i, 3) * 8 + t * 0.3) % 8) - 4, (hash01(i, 4) - 0.5) * 6 - 1); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); dust.setMatrixAt(i, dummy.matrix); }
      [strandA, strandB, rungs, dust].forEach((m) => (m.instanceMatrix.needsUpdate = true));
      lights({ amb: [0.3, 0.3, 0.3], dir: [0, -1, 0], dirCol: [0, 0, 0], points: [], fog: [0.01, 0.02, 0.05], near: 3, far: 9 });
    },
  };
}

export function initWorld() { makeTextures(); }
