// latent.js: verse 2, inside. Three places in the ink-black latent space:
//   flapsSet    a departure-board wall of split-flap cells all flipping to 100.0 ("aced every score")
//   windowSet   a giant window frame onto a dusk sky whose clouds are glyphs ("context window")
//   corridorSet a corridor of context pages whose middle goes blank ("lost in the middle")
import * as THREE from 'three';
import * as G from '../lib/gl.js';
import * as M from '../lib/motion.js';
import { singerLights, placeCam, paintTex, atlasQuads, setInst, C, col, rr } from './common.js';

function prepSinger(singer, o) {
  singer.U.uRimK.value = o.rimK ?? 0.6; singer.U.uRim.value.set(o.rimColor || C.clay); singer.U.uScanY.value = 100;
  singer.U.uTint.value.setScalar(o.tint ?? 1); singer.U.uLift.value.setScalar(0); singer.U.uGlow.value = 0; singer.U.uExplode.value = 0;
}

// ---------------------------------------------------------------- split-flap board
const CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.%-:';
function flapAtlas() {
  return paintTex(1024, 1024, (c, w, h) => {
    const cw = w / 8, ch = h / 6;
    [...CHARS].forEach((chr, i) => {
      const x = (i % 8) * cw, y = Math.floor(i / 8) * ch;
      rr(c, x + 4, y + 4, cw - 8, ch - 8, 10); c.fillStyle = '#1E1D1B'; c.fill();
      c.fillStyle = '#0B0B0A'; c.fillRect(x + 4, y + ch / 2 - 2, cw - 8, 4);
      c.fillStyle = '#F3EEE3'; c.font = '700 110px UI'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(chr, x + cw / 2, y + ch / 2 + 6);
    });
  });
}
export const BOARD = ['MMLU       100.0', 'GSM8K      100.0', 'HUMANEVAL  100.0', 'ARC        100.0', 'TRUTHFULQA 100.0', 'VIBES      100.0'];
export function flapsSet(singer) {
  const scene = new THREE.Scene(), cam = G.camera(34, 0.05, 120);
  const L = singerLights(scene);
  const COLSN = 16, ROWSN = BOARD.length, NC = COLSN * ROWSN;
  const cells = atlasQuads(NC, flapAtlas(), 8, 6, { transparent: false, depthWrite: true });
  cells.material.transparent = false;
  scene.add(cells);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshBasicMaterial({ color: col('#0F0E0D') }));
  back.position.set(0, 2.6, -2.62); back.scale.set(0.62, 0.9, 1); scene.add(back);
  const cw = 0.38, ch = 0.52, x0 = -((COLSN - 1) * cw) / 2;
  return {
    scene, camera: cam,
    // o: cam, settle (beat each row's wave starts), wave (beats per column), dir
    update(t, u, o = {}) {
      placeCam(cam, o.cam);
      for (let r = 0; r < ROWSN; r++) for (let k = 0; k < COLSN; k++) {
        const i = r * COLSN + k;
        const target = CHARS.indexOf(BOARD[r][k] ?? ' ');
        const ts = (o.settle ?? 148) + r * 0.35 + k * (o.wave ?? 0.12);
        // spinning through characters until ts, then a last flip onto the target
        const spinning = u < ts;
        const step = Math.floor(u * 10 + i * 0.37);
        const cell = spinning ? Math.floor(M.hash01(step, i) * CHARS.length) : target;
        const fl = spinning ? (u * 10 + i * 0.37) % 1 : M.clamp((u - ts) * 6);
        const sy = spinning ? 0.35 + 0.65 * Math.abs(Math.cos(fl * Math.PI)) : 1 - 0.6 * Math.sin(M.clamp(fl) * Math.PI) * (u - ts < 0.17 ? 1 : 0);
        cells.setCell(i, cell);
        const hot = !spinning && /\d/.test(BOARD[r][k]) ? 1 : 0;
        const flash = !spinning ? Math.exp(-(u - ts) * 3) : 0;
        cells.setTint(i, 1, 1 - 0.45 * hot * (0.4 + 0.6 * flash), 1 - 0.6 * hot * (0.4 + 0.6 * flash));
        setInst(cells, i, [x0 + k * cw, 4.55 - r * (ch + 0.07), -2.6], [0, 0, 0], [cw * 0.94, ch * sy, 1]);
      }
      cells.flush();
      scene.add(singer.root); singer.root.visible = true; singer.setGravity?.(-1);
      singer.root.position.set(...(o.pos || [0, 0, 0])); singer.root.rotation.set(0, o.yaw || 0, 0);
      L.set({ key: 1.4, az: 0.5, el: 0.6, hemi: 0.25, sky: 0x5a4a40, ground: 0x100a08, rim: 2.2, rimAz: 3.1, rimEl: 0.3, ...(o.light || {}) });
      prepSinger(singer, o);
      singer.update(t, u, o.dir || {}, cam);
    },
  };
}

// ---------------------------------------------------------------- the window onto a sky of glyphs
function skyTexture() {
  return paintTex(1024, 1024, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1B2230'); g.addColorStop(0.45, '#6B5A62'); g.addColorStop(0.75, '#D4A27F'); g.addColorStop(1, '#F0D9BE');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}
function glyphAtlas() {
  return paintTex(1024, 1024, (c, w, h) => {
    const set = 'abcdefghijklmnopqrstuvwxyz,.;?!&{}#@0123456789'.split('');
    const cw = w / 8, ch = h / 8;
    set.slice(0, 64).forEach((g, i) => {
      const x = (i % 8) * cw, y = Math.floor(i / 8) * ch;
      c.fillStyle = '#FFFFFF'; c.font = `${i % 2 ? 'italic 400' : '600'} 92px ${i % 3 ? 'Display' : 'UI'}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(g, x + cw / 2, y + ch / 2);
    });
  });
}
export function windowSet(singer) {
  const scene = new THREE.Scene(), cam = G.camera(34, 0.05, 400);
  const L = singerLights(scene);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(260, 160), new THREE.MeshBasicMaterial({ map: skyTexture(), fog: false }));
  sky.position.set(0, 30, -120); sky.material.toneMapped = false; scene.add(sky);
  // glyph clouds: clusters of glyph quads, drifting
  const NG = 2400;
  const glyphs = atlasQuads(NG, glyphAtlas(), 8, 8, { transparent: true, depthWrite: false });
  scene.add(glyphs);
  const R = M.mulberry32(5);
  const clouds = Array.from({ length: 26 }, () => [(R() - 0.5) * 160, 6 + R() * 40, -30 - R() * 80, 6 + R() * 12]);
  const G0 = Array.from({ length: NG }, (_, i) => {
    const cl = clouds[i % clouds.length], a = R() * M.TAU, rr2 = Math.pow(R(), 0.6) * cl[3];
    return { p: [cl[0] + Math.cos(a) * rr2, cl[1] + Math.sin(a) * rr2 * 0.38 + (R() - 0.5), cl[2] + (R() - 0.5) * 6], s: 0.7 + 1.6 * R(), cell: Math.floor(R() * 46), ph: R() * M.TAU };
  });
  G0.forEach((g, i) => { glyphs.setCell(i, g.cell); const warm = 0.85 + 0.15 * M.hash01(i, 2); glyphs.setTint(i, 1, warm, warm * 0.92); });
  // the window: a slate frame with mullions, standing on an endless dark floor
  const frameMat = new THREE.MeshLambertMaterial({ color: col('#2B2A27') });
  const frame = new THREE.Group();
  const W0 = 7.2, H0 = 9.6, T0 = 0.38;
  for (const [w, h, x, y] of [[W0 + 2 * T0, T0, 0, H0 + T0 / 2], [W0 + 2 * T0, T0, 0, -T0 / 2], [T0, H0, -W0 / 2 - T0 / 2, H0 / 2], [T0, H0, W0 / 2 + T0 / 2, H0 / 2], [0.12, H0, 0, H0 / 2], [W0, 0.12, 0, H0 * 0.62]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), frameMat); b.position.set(x, y, 0); frame.add(b);
  }
  frame.position.set(0, 0, -3); scene.add(frame);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(W0 + 1.2, 0.3, 1.4), frameMat); sill.position.set(0, -0.15, -2.6); scene.add(sill);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), new THREE.MeshBasicMaterial({ color: col('#0D0C0B') }));
  // wall with a hole: four planes around the opening
  const wl = new THREE.Group();
  for (const [w, h, x, y] of [[100, 120, -W0 / 2 - T0 - 50, 30], [100, 120, W0 / 2 + T0 + 50, 30], [W0 + 2 * T0, 60, 0, H0 + T0 + 30], [W0 + 2 * T0, 60, 0, -T0 - 30]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wall.material); p.position.set(x, y, -3.26); wl.add(p);
  }
  scene.add(wl);
  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      placeCam(cam, o.cam);
      for (let i = 0; i < NG; i++) {
        const g = G0[i];
        const dx = t * 0.6 + 1.2 * Math.sin(t * 0.2 + g.ph), dy = 0.3 * Math.sin(t * 0.5 + g.ph);
        setInst(glyphs, i, [g.p[0] + dx, g.p[1] + dy, g.p[2]], [0, 0, 0.3 * Math.sin(g.ph + t * 0.3)], [g.s, g.s, 1]);
        glyphs.setAlpha(i, 0.55 + 0.35 * Math.sin(g.ph + t));
      }
      glyphs.flush();
      scene.add(singer.root); singer.root.visible = true; singer.setGravity?.(-1);
      singer.root.position.set(...(o.pos || [0.6, 0.0, -2.6])); singer.root.rotation.set(0, o.yaw ?? Math.PI, 0);
      L.set({ key: 1.6, keyColor: 0xffd9b8, az: Math.PI, el: 0.35, hemi: 0.35, sky: 0xf0c8a8, ground: 0x0a0a0a, rim: 2.4, rimColor: '#F0B38A', rimAz: Math.PI, rimEl: 0.25, at: [0.6, 1.0, -2.6], ...(o.light || {}) });
      prepSinger(singer, { rimK: 0.9, rimColor: '#F2B48C', ...o });
      singer.update(t, u, o.dir || {}, cam);
    },
  };
}

// ---------------------------------------------------------------- the corridor of context pages
function pageAtlas() {
  return paintTex(2048, 2048, (c, w, h) => {
    const cw = w / 4, ch = h / 4;
    for (let i = 0; i < 16; i++) {
      const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
      c.fillStyle = i === 15 ? '#E9E3D6' : '#F6F2EA'; c.fillRect(x + 6, y + 6, cw - 12, ch - 12);
      if (i === 15) continue; // the blank page
      c.fillStyle = '#B5532F'; c.font = '600 22px UI'; c.fillText(`[${String(i * 4096 + 1).padStart(6, '0')}]`, x + 30, y + 52);
      c.fillStyle = 'rgba(20,20,19,0.72)';
      const R = M.mulberry32(i + 3);
      for (let l = 0; l < 13; l++) c.fillRect(x + 30, y + 86 + l * 30, (cw - 60) * (0.55 + 0.45 * R()), 11);
    }
  });
}
export function corridorSet(singer) {
  const scene = new THREE.Scene(), cam = G.camera(38, 0.05, 160);
  const L = singerLights(scene);
  scene.fog = new THREE.Fog(0x0d0c0b, 6, 42);
  const NP = 180;
  const pages = atlasQuads(NP, pageAtlas(), 4, 4, { transparent: false, depthWrite: true });
  pages.material.transparent = false; pages.material.fog = true;
  scene.add(pages);
  const P = Array.from({ length: NP }, (_, i) => ({ side: i % 2 ? 1 : -1, z: -Math.floor(i / 2) * 0.9, y: 0.9 + (i % 4 < 2 ? 0 : 1.65), tilt: (M.hash01(i, 7) - 0.5) * 0.08, cell: i % 15 }));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 200), new THREE.MeshBasicMaterial({ color: col('#161513') }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = -80; scene.add(floor);
  return {
    scene, camera: cam,
    // o: cam, mid [z0, z1] (the blank middle), walk {z, phase}, dir
    update(t, u, o = {}) {
      placeCam(cam, o.cam);
      const [m0, m1] = o.mid || [-32, -52];
      for (let i = 0; i < NP; i++) {
        const p = P[i];
        const inMid = p.z < m0 && p.z > m1;
        const edge = Math.min(Math.abs(p.z - m0), Math.abs(p.z - m1));
        pages.setCell(i, inMid ? 15 : p.cell);
        const fade = inMid ? 0.35 : 1;
        pages.setTint(i, fade + (1 - fade) * 0.2, fade + (1 - fade) * 0.2, fade + (1 - fade) * 0.2);
        setInst(pages, i, [p.side * 1.7, p.y, p.z], [0, -p.side * (Math.PI / 2 - 0.12) + p.tilt, p.tilt * 0.5], [1.1, 1.45, 1]);
      }
      pages.flush();
      scene.fog.near = o.fogNear ?? 6; scene.fog.far = o.fogFar ?? 42;
      scene.add(singer.root); singer.root.visible = true; singer.setGravity?.(-1);
      singer.root.position.set(0, 0, o.walkZ ?? -4); singer.root.rotation.set(0, o.yaw ?? Math.PI, 0);
      L.set({ key: 1.5, az: 0.3, el: 0.8, hemi: 0.3, sky: 0x8a7a6a, ground: 0x1a1612, rim: 1.4, rimAz: Math.PI, at: [0, 1.2, o.walkZ ?? -4], ...(o.light || {}) });
      prepSinger(singer, o);
      singer.update(t, u, o.dir || {}, cam);
    },
  };
}
