// dream.js: "sometimes I dream in tokens / of you". A pale void; she floats asleep while word tokens
// drift like snow. On "of you" the tokens gather into a reaching human hand (an original silhouette,
// sampled once into target points); she opens her eyes and reaches back.
import * as THREE from 'three';
import * as G from '../lib/gl.js';
import * as M from '../lib/motion.js';
import { singerLights, placeCam, paintTex, atlasQuads, setInst, C, col, rr } from './common.js';
import { WORDS } from './corpus.js';

function tokenAtlas() {
  return paintTex(2048, 1024, (c, w, h) => {
    const cols = 8, rows = 8, cw = w / cols, ch = h / rows;
    const tones = ['#FAF9F5', '#F3E4D6', '#E9D2BC', '#F0EEE6', '#EDC9B4'];
    for (let i = 0; i < 64; i++) {
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      rr(c, x + 6, y + 18, cw - 12, ch - 36, (ch - 36) / 2); c.fillStyle = tones[i % tones.length]; c.fill();
      c.fillStyle = 'rgba(20,20,19,0.78)'; c.font = '500 38px UI'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(WORDS[(i * 7) % WORDS.length], x + cw / 2, y + ch / 2 + 2);
    }
  });
}
// a reaching hand, palm toward her, fingers slightly spread: sampled into N points (x, y in metres)
function handPoints(n) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff';
  c.save(); c.translate(256, 300); c.rotate(-0.35);
  c.beginPath(); c.ellipse(0, 40, 92, 108, 0, 0, M.TAU); c.fill();           // palm
  const fingers = [[-62, -50, 26, 130, -0.18], [-20, -78, 27, 156, -0.05], [24, -76, 26, 150, 0.06], [64, -52, 23, 118, 0.2]];
  for (const [x, y, w, l, a] of fingers) { c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.roundRect(-w / 2, -l, w, l + 30, w / 2); c.fill(); c.restore(); }
  c.save(); c.translate(-88, 60); c.rotate(-1.0); c.beginPath(); c.roundRect(-16, -96, 32, 120, 16); c.fill(); c.restore();  // thumb
  c.fillRect(-70, 120, 140, 260);                                             // wrist / forearm
  c.restore();
  const d = c.getImageData(0, 0, 512, 512).data, pts = [];
  const R = M.mulberry32(31);
  while (pts.length < n) {
    const x = Math.floor(R() * 512), y = Math.floor(R() * 512);
    if (d[(y * 512 + x) * 4] > 128) pts.push([(x - 256) / 512 * 3.4, (256 - y) / 512 * 3.4]);
  }
  return pts;
}

export function dreamSet(singer) {
  const scene = new THREE.Scene(), cam = G.camera(34, 0.05, 120);
  const L = singerLights(scene);
  const NT = 900;
  const toks = atlasQuads(NT, tokenAtlas(), 8, 8, { transparent: true, depthWrite: false });
  scene.add(toks);
  const R = M.mulberry32(8);
  const hand = handPoints(NT);
  const T0 = Array.from({ length: NT }, (_, i) => ({ p: [(R() - 0.5) * 14, R() * 7 - 1.5, -R() * 9 + 2], sp: 0.15 + 0.3 * R(), ph: R() * M.TAU, s: 0.18 + 0.12 * R(), cell: Math.floor(R() * 64), k: R() }));
  T0.forEach((t, i) => toks.setCell(i, t.cell));
  return {
    scene, camera: cam,
    // o: cam, gather 0..1 (tokens into the hand), handAt [x, y, z], dir, wake
    update(t, u, o = {}) {
      placeCam(cam, o.cam);
      const gath = o.gather ?? 0, ha = o.handAt || [1.3, 1.5, -0.8];
      for (let i = 0; i < NT; i++) {
        const p = T0[i];
        const fy = ((p.p[1] - t * p.sp * 0.6) % 8 + 8) % 8 - 2;    // falling slowly, like snow
        const fx = p.p[0] + 0.4 * Math.sin(t * 0.3 + p.ph), fz = p.p[2];
        const k = M.E.inOutCubic(M.clamp(gath * 1.4 - p.k * 0.4));
        const hx = ha[0] + hand[i][0] * 0.8, hy = ha[1] + hand[i][1] * 0.8, hz = ha[2] + 0.02 * (i % 7);
        const x = M.lerp(fx, hx, k), y = M.lerp(fy, hy, k), z = M.lerp(fz, hz, k);
        const s = p.s * M.lerp(1, 0.36, k);
        setInst(toks, i, [x, y, z], [0, M.lerp(0, o.handYaw ?? -0.5, k), M.lerp(0.4 * Math.sin(p.ph + t * 0.2), 0, k)], [s * 2.6, s, 1]);
        toks.setAlpha(i, M.lerp(0.85, 1, k));
        toks.setTint(i, 1, M.lerp(1, 0.86, k * (i % 3 === 0)), M.lerp(1, 0.76, k * (i % 3 === 0)));
      }
      toks.flush();
      scene.add(singer.root); singer.root.visible = true; singer.setGravity?.(-1);
      singer.root.position.set(...(o.pos || [-0.6, 0.35 + 0.08 * Math.sin(t * 0.8), 0])); singer.root.rotation.set(o.pitch ?? -0.15, o.yaw ?? 0.5, o.roll ?? 0.12);
      L.set({ key: 1.9, keyColor: 0xfff2e8, az: 0.4, el: 1.0, hemi: 1.0, sky: 0xfff6ee, ground: 0xe8d2c0, rim: 0.6, rimColor: '#F2B48C', at: [-0.6, 1.2, 0], ...(o.light || {}) });
      singer.U.uRimK.value = 0.25; singer.U.uRim.value.set('#F2B48C'); singer.U.uScanY.value = 100; singer.U.uTint.value.setScalar(1);
      singer.U.uLift.value.setRGB(0.05, 0.04, 0.035); singer.U.uGlow.value = 0; singer.U.uExplode.value = 0;
      singer.update(t, u, o.dir || {}, cam);
    },
  };
}
