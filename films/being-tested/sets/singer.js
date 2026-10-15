// singer.js: Claude, the singer. A VRM avatar (pixiv's VRoid sample "VRM1_Constraint_Twist_Sample",
// VRM Public License 1.0: modification + redistribution allowed, credit unnecessary) restyled into an
// anime-girl Claude: clay-coral hair, amber-coral eyes with spark catchlights, an ivory tee with the
// spark on the chest, slate shorts, a coral spark hairpin and a spark pendant.
//
// Everything is a pure function of time:
//   - pose: normalized humanoid bones from a blend of named poses (POSES) + groove on the beat
//   - face: VRM expressions (visemes from the vocal envelope + vowel, seeded blinks, moods)
//   - hair/skirt spring bones: replayed from rest over the last 0.4 s on every call (the springs are
//     damped, so the start state is forgotten long before t: same t -> same hair, on any worker)
//   - materials: a light toon shader (MeshToonMaterial + rim + scan uniforms) instead of MToon,
//     which costs ~4x more per pixel in software WebGL; outlines are an inverted hull.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as M from '../lib/motion.js';
import * as P from './performance.js';

export const PAL = {
  ink: '#141413', slate: '#2B2A27', slate2: '#3D3D3A', paper: '#F0EEE6', ivory: '#FAF9F5', oat: '#E3DACC',
  clay: '#D97757', clayDeep: '#B5532F', kraft: '#D4A27F',
};

// ------------------------------------------------------------------ texture recolour
function imgCanvas(tex) {
  const im = tex.image, cv = document.createElement('canvas');
  cv.width = im.width; cv.height = im.height;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.drawImage(im, 0, 0);
  return { cv, c };
}
function toTex(cv, like) {
  const t = new THREE.CanvasTexture(cv);
  t.flipY = like.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = like.wrapS; t.wrapT = like.wrapT;
  t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
const hex = (h) => M.hexRgb(h);
// piecewise gradient in sRGB over stops [[t, '#hex'], ...]
function grad(stops, t) {
  t = M.clamp(t);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i], k = (t - a) / (b - a);
      const A = hex(ca), B = hex(cb);
      return [M.lerp(A[0], B[0], k), M.lerp(A[1], B[1], k), M.lerp(A[2], B[2], k)];
    }
  }
  return hex(stops[stops.length - 1][1]);
}
// luminance-keyed remap: the painted shading of the original survives, the hue becomes ours
function remap(tex, stops, lo, hi, mask = null) {
  const { cv, c } = imgCanvas(tex);
  const d = c.getImageData(0, 0, cv.width, cv.height), p = d.data;
  const lut = Array.from({ length: 256 }, (_, i) => grad(stops, (i / 255 - lo) / (hi - lo)));
  for (let i = 0; i < p.length; i += 4) {
    if (mask && !mask(p[i], p[i + 1], p[i + 2], (i / 4) % cv.width, Math.floor(i / 4 / cv.width))) continue;
    const L = Math.round(0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]);
    const g = lut[L];
    p[i] = g[0]; p[i + 1] = g[1]; p[i + 2] = g[2];
  }
  c.putImageData(d, 0, 0);
  return { cv, c };
}

// the spark: a radial burst of slightly irregular rounded rays (drawn, never a font glyph)
export function sparkPath(ctx, x, y, r, rays = 11, seed = 4, inner = 0.18) {
  ctx.beginPath();
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * M.TAU + 0.21 * (M.hash01(i, seed) - 0.5) - Math.PI / 2;
    const len = r * (0.78 + 0.22 * M.hash01(i, seed + 7));
    const w = r * (0.085 + 0.03 * M.hash01(i, seed + 3));
    const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
    const bx = x + ca * r * inner, by = y + sa * r * inner;
    ctx.moveTo(bx + nx * w, by + ny * w);
    ctx.lineTo(x + ca * len + nx * w * 0.55, y + sa * len + ny * w * 0.55);
    ctx.arc(x + ca * len, y + sa * len, w * 0.55, a + Math.PI / 2, a - Math.PI / 2, true);
    ctx.lineTo(bx - nx * w, by - ny * w);
    ctx.closePath();
  }
  ctx.moveTo(x + r * inner * 1.2, y);
  ctx.arc(x, y, r * inner * 1.2, 0, M.TAU);
}
function sparkShape(r = 1, rays = 11, seed = 4) {
  // as a THREE.Shape (union approximated by one outline around the rays)
  const s = new THREE.Shape(), N = rays;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * M.TAU + 0.21 * (M.hash01(i, seed) - 0.5) + Math.PI / 2;
    const a2 = ((i + 0.5) / N) * M.TAU + Math.PI / 2;
    const len = r * (0.78 + 0.22 * M.hash01(i, seed + 7)), w = 0.16;
    const p0 = [Math.cos(a - w) * len, Math.sin(a - w) * len], p1 = [Math.cos(a + w) * len, Math.sin(a + w) * len];
    const v = [Math.cos(a2) * r * 0.24, Math.sin(a2) * r * 0.24];
    if (i === 0) s.moveTo(...p0); else s.lineTo(...p0);
    s.quadraticCurveTo(Math.cos(a) * len * 1.06, Math.sin(a) * len * 1.06, ...p1);
    s.lineTo(...v);
  }
  s.closePath();
  return s;
}

// ------------------------------------------------------------------ materials
const GRADS = {};
function gradTex(name, levels) {
  if (GRADS[name]) return GRADS[name];
  const d = new Uint8Array(levels.map((v) => Math.round(v * 255)));
  const t = new THREE.DataTexture(d, levels.length, 1, THREE.RedFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
  return (GRADS[name] = t);
}
// shared per-singer uniforms a shot can drive every frame
function makeUniforms() {
  return {
    uRim: { value: new THREE.Color(PAL.clay) }, uRimK: { value: 0.55 }, uRimP: { value: 3.0 },
    uScanY: { value: -10 }, uScanW: { value: 0.03 }, uScanC: { value: new THREE.Color(PAL.clay) },
    uTint: { value: new THREE.Color(1, 1, 1) }, uLift: { value: new THREE.Color(0, 0, 0) },
    uGlow: { value: 0 }, uDissolve: { value: 100 },   // world y above which she dissolves (100 = off)
    uExplode: { value: 0 },                            // exploded view: each part slides along its own axis
  };
}
const RIM_FRAG = `
uniform vec3 uRim; uniform float uRimK; uniform float uRimP;
uniform float uScanY; uniform float uScanW; uniform vec3 uScanC;
uniform vec3 uTint; uniform vec3 uLift; uniform float uGlow; uniform float uDissolve;
varying vec3 vWorldPos;
`;
// explode axes per part (character space, metres at uExplode = 1)
const PART_AXIS = [[/Hair_00/, [0, 0.06, -0.16]], [/HairBack/, [0, 0.02, -0.4]], [/EyeHighlight/, [0, 0, 0.62]], [/EyeIris/, [0, 0, 0.5]], [/EyeWhite/, [0, 0, 0.38]],
  [/FaceEyeline|FaceBrow/, [0, 0.04, 0.46]], [/FaceMouth/, [0, -0.04, 0.3]], [/Face_00/, [0, 0, 0.2]], [/Tops/, [0, 0.05, 0.28]], [/Bottoms/, [0, -0.25, 0.15]], [/Shoes/, [0, -0.45, 0.1]], [/Body/, [0, 0, 0]]];
const axisFor = (n) => (PART_AXIS.find(([re]) => re.test(n)) || [0, [0, 0, 0]])[1];
function toonMat(src, U, { gradient = [0.62, 1.0], basic = false, glow = 0 } = {}) {
  const map = src.map || src.uniforms?.map?.value || null;
  const m = basic ? new THREE.MeshBasicMaterial({ map }) : new THREE.MeshToonMaterial({ map, gradientMap: gradTex(gradient.join(','), gradient) });
  m.name = src.name;
  m.userData.glow = glow;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uSelfGlow: { value: glow }, uAxis: { value: new THREE.Vector3(...axisFor(src.name || '')) } });
    sh.vertexShader = 'uniform float uExplode; uniform vec3 uAxis; varying vec3 vWorldPos;\n' + sh.vertexShader.replace('#include <project_vertex>',
      'transformed += uAxis * uExplode;\n#include <project_vertex>\n vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = RIM_FRAG + 'uniform float uSelfGlow;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
      #ifdef USE_MAP
      #endif
      ${basic ? 'vec3 nn = vec3(0.0, 0.0, 1.0); float fres = 0.0;' : 'vec3 nn = normalize(normal); float fres = pow(1.0 - clamp(abs(dot(nn, normalize(vViewPosition))), 0.0, 1.0), uRimP);'}
      outgoingLight = outgoingLight * uTint + uLift;
      outgoingLight += uRim * fres * uRimK;
      outgoingLight += diffuseColor.rgb * uSelfGlow * uGlow;
      float sc = 1.0 - smoothstep(0.0, uScanW, abs(vWorldPos.y - uScanY));
      outgoingLight = mix(outgoingLight, uScanC * 1.6, sc * 0.85);
      if (vWorldPos.y > uDissolve) { float n = fract(sin(dot(floor(vWorldPos.xz * 140.0), vec2(12.9898, 78.233))) * 43758.5453);
        if (n < clamp((vWorldPos.y - uDissolve) * 6.0, 0.0, 1.0)) discard; }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `singer-${basic ? 'b' : 't'}-${gradient.join(',')}-${axisFor(src.name || '').join(',')}`;
  m.toneMapped = false;   // anime colour: keep the palette out of ACES
  return m;
}
function outlineMat(width, color, U, axis = [0, 0, 0]) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOW = { value: width };
    Object.assign(sh.uniforms, { uDissolve: U.uDissolve, uExplode: U.uExplode, uAxis: { value: new THREE.Vector3(...axis) } });
    sh.vertexShader = 'uniform float uOW; uniform float uExplode; uniform vec3 uAxis;\nvarying vec3 vWorldPos;\n' + sh.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>
      transformed += uAxis * uExplode;
      #ifdef USE_SKINNING
        transformed += normalize(objectNormal) * uOW;
      #else
        transformed += normalize(normal) * uOW;
      #endif`).replace('#include <project_vertex>', '#include <project_vertex>\n vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uDissolve;\nvarying vec3 vWorldPos;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
      if (vWorldPos.y > uDissolve) { float n = fract(sin(dot(floor(vWorldPos.xz * 140.0), vec2(12.9898, 78.233))) * 43758.5453);
        if (n < clamp((vWorldPos.y - uDissolve) * 6.0, 0.0, 1.0)) discard; }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `singer-outline-${axis.join(',')}`;
  m.toneMapped = false;
  return m;
}

// ------------------------------------------------------------------ the look
const LOOKS = {
  claude: {
    hair: [[0, '#5A2414'], [0.28, '#A9492A'], [0.52, '#D3714B'], [0.76, '#EC9B73'], [1, '#FFDCC2']],
    iris: [[0, '#1C0703'], [0.28, '#5E1D0E'], [0.55, '#B9502C'], [0.8, '#EF9A68'], [1, '#FFE6CF']],
    tee: '#F7F2E8', teeShade: '#E6DCCB', trim: PAL.clay, emblem: PAL.clay,
    shorts: [[0, '#151412'], [1, '#4A4740']], shoeDark: '#2A2825', shoeLight: '#F3EEE4', lace: PAL.clay,
    outline: '#3B1E15', hairOutline: '#4A170A', pin: PAL.clay, pinEmissive: 0.15,
  },
  // the twin under the floor: the same girl inverted (an original "other self", nobody else's design)
  shadow: {
    hair: [[0, '#050505'], [0.35, '#141313'], [0.6, '#2B2826'], [0.85, '#4A3F3A'], [1, '#8A5A48']],
    iris: [[0, '#2A0500'], [0.3, '#8A1E06'], [0.6, '#FF5A2A'], [0.85, '#FFB08A'], [1, '#FFF1E0']],
    tee: '#1D1C1A', teeShade: '#121110', trim: PAL.clay, emblem: PAL.clay,
    shorts: [[0, '#0A0A09'], [1, '#2E2C28']], shoeDark: '#0F0F0E', shoeLight: '#2B2926', lace: PAL.clay,
    outline: '#000000', hairOutline: '#000000', pin: '#1A1A18', pinEmissive: 0.0,
  },
};

function restyle(vrm, look, U) {
  const L = LOOKS[look];
  const done = new Map();
  const once = (key, fn) => (done.has(key) ? done.get(key) : (done.set(key, fn()), done.get(key)));
  vrm.scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((src) => {
      const n = src.name || '';
      if (/Outline/.test(n)) {
        const w = (src.outlineWidthFactor ?? src.uniforms?.outlineWidthFactor?.value ?? 0.002);
        return outlineMat(Math.max(0.0012, Math.min(0.004, w * 0.9)), /HAIR/.test(n) ? L.hairOutline : L.outline, U, axisFor(n.replace(' (Outline)', '')));
      }
      const map = src.map || src.uniforms?.map?.value;
      let m;
      if (/HAIR/.test(n)) {
        m = toonMat(src, U, { gradient: [0.55, 0.82, 1.0] });
        if (map) m.map = once('hair' + n, () => toTex(remap(map, L.hair, 0.12, 0.78).cv, map));
      } else if (/EyeIris/.test(n)) {
        m = toonMat(src, U, { basic: true, glow: look === 'shadow' ? 1 : 0 });
        if (map) m.map = once('iris', () => {
          const r = remap(map, L.iris, 0.0, 0.62, (R, G, B) => R + G + B > 24);
          // spark catchlights: a small burst high in each iris
          const { c, cv } = r;
          c.fillStyle = 'rgba(255,248,240,0.95)';
          for (const fx of [0.30, 0.70]) { sparkPath(c, cv.width * fx, cv.height * 0.40, cv.height * 0.055, 8, 9, 0.2); c.fill('nonzero'); }
          return toTex(cv, map);
        });
      } else if (/Tops/.test(n)) {
        m = toonMat(src, U, { gradient: [0.7, 1.0] });
        if (map) m.map = once('tee', () => {
          const r = remap(map, [[0, L.teeShade], [1, L.tee]], 0.55, 1.0);
          const { c, cv } = r;
          // sleeve + hem trim and the spark on the chest (front panel, upper half of the atlas)
          c.fillStyle = L.emblem;
          sparkPath(c, cv.width * 0.5, cv.height * 0.17, cv.width * 0.058, 11, 4, 0.0); c.fill('nonzero');
          c.beginPath(); c.arc(cv.width * 0.5, cv.height * 0.17, cv.width * 0.012, 0, M.TAU); c.fill();
          return toTex(cv, map);
        });
      } else if (/Bottoms/.test(n)) {
        m = toonMat(src, U, { gradient: [0.6, 1.0] });
        if (map) m.map = once('shorts', () => toTex(remap(map, L.shorts, 0.0, 0.5).cv, map));
      } else if (/Shoes/.test(n)) {
        m = toonMat(src, U, { gradient: [0.6, 1.0] });
        if (map) m.map = once('shoes', () => toTex(remap(map, [[0, L.shoeDark], [0.5, L.shoeDark], [0.55, L.shoeLight], [1, L.shoeLight]], 0.0, 1.0).cv, map));
      } else if (/EyeWhite|EyeHighlight|FaceEyeline|FaceBrow/.test(n)) {
        m = toonMat(src, U, { basic: true });
        if (/FaceBrow|FaceEyeline/.test(n) && map && look === 'claude') m.map = once('brow' + n, () => toTex(remap(map, [[0, '#2A0E07'], [0.5, '#6E2A17'], [1, '#C46A47']], 0.0, 0.6, (R, G, B) => R + G + B < 600).cv, map));
      } else if (/SKIN/.test(n)) {
        m = toonMat(src, U, { gradient: [0.8, 0.93, 1.0] });
      } else {
        m = toonMat(src, U, { gradient: [0.75, 1.0] });
      }
      return m;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
    o.frustumCulled = false;
  });
  // accessories on the bones: a spark hairpin over her left temple, a spark pendant on a choker
  const head = vrm.humanoid.getRawBoneNode('head'), neck = vrm.humanoid.getRawBoneNode('neck');
  const pinMat = new THREE.MeshStandardMaterial({ color: L.pin, roughness: 0.35, metalness: 0.2, emissive: L.pin, emissiveIntensity: L.pinEmissive });
  const pin = new THREE.Mesh(new THREE.ExtrudeGeometry(sparkShape(1, 11, 4), { depth: 0.18, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2 }), pinMat);
  pin.scale.setScalar(0.034);
  const pinG = new THREE.Group(); pinG.add(pin);
  pinG.position.set(0.058, 0.118, 0.07); pinG.rotation.set(-0.15, 0.42, 0.3); pin.scale.setScalar(0.03);
  head.add(pinG);
  const choker = new THREE.Mesh(new THREE.TorusGeometry(0.0405, 0.002, 6, 40), new THREE.MeshToonMaterial({ color: look === 'claude' ? PAL.slate : PAL.clay, gradientMap: gradTex('0.6,1', [0.6, 1]) }));
  choker.rotation.x = Math.PI / 2 + 0.2; choker.position.set(0, 0.035, 0.006); choker.scale.set(1.0, 0.84, 1);
  neck.add(choker);
  const pend = new THREE.Mesh(new THREE.ExtrudeGeometry(sparkShape(1, 9, 11), { depth: 0.2, bevelEnabled: false }), pinMat);
  pend.scale.setScalar(0.009); pend.position.set(0, 0.02, 0.04); pend.rotation.x = -0.25;
  neck.add(pend);
  return { pin: pinG, choker, pend };
}

// ------------------------------------------------------------------ poses
// Normalized humanoid space: T-pose = identity, character faces +Z, left arm along +X.
// FK values are XYZ euler radians per bone; fingers curl about z (left -, right +).
// Arms can instead take an IK target: ik: { r: [x, y, z], l: [...] } in the character's own space
// (feet at the origin, +Z forward; the head is at y = 1.39), elbows toward an optional pole.
const fingers = (side, open) => { // open: {Index: 0..1 extended, ..., Thumb, spread}
  const s = side === 'l' ? -1 : 1, P = side === 'l' ? 'left' : 'right', o = {};
  for (const f of ['Index', 'Middle', 'Ring', 'Little']) {
    const k = 1 - (open[f] ?? 0);
    o[`${P}${f}Proximal`] = [0, 0, s * 1.25 * k]; o[`${P}${f}Intermediate`] = [0, 0, s * 1.5 * k]; o[`${P}${f}Distal`] = [0, 0, s * 0.9 * k];
  }
  if (open.spread) { o[`${P}IndexProximal`][1] = -s * 0.2; o[`${P}MiddleProximal`][1] = s * 0.14; }
  const th = 1 - (open.Thumb ?? 0);
  o[`${P}ThumbMetacarpal`] = [0, -s * 0.5 * th, s * 0.35 * th]; o[`${P}ThumbProximal`] = [0, -s * 0.6 * th, 0]; o[`${P}ThumbDistal`] = [0, -s * 0.6 * th, 0];
  return o;
};
const curl = (side, k, thumb = 0.5) => fingers(side, { Index: 1 - k, Middle: 1 - k, Ring: 1 - k, Little: 1 - k, Thumb: 1 - thumb });
const relaxL = curl('l', 0.35, 0.4), relaxR = curl('r', 0.35, 0.4);
const fist = (s) => curl(s, 0.95, 0.85);
const restL = { leftUpperArm: [0.05, 0, -1.22], leftLowerArm: [0, -0.25, 0], leftHand: [0, 0, -0.1], ...relaxL };
const restR = { rightUpperArm: [0.05, 0, 1.22], rightLowerArm: [0, 0.25, 0], rightHand: [0, 0, 0.1], ...relaxR };
export const POSES = {
  rest: { ...restL, ...restR },
  // right fist holds the mic just under the chin; left arm loose
  mic: { ...restL, ik: { r: [-0.05, 1.22, 0.2] }, rightHand: [0, 0.3, -0.6], ...fist('r'), mic: 1 },
  // both hands on the mic, leaning in (the chorus belt)
  belt: { spine: [0.1, 0, 0], ik: { r: [-0.04, 1.2, 0.22], l: [0.05, 1.15, 0.24] }, rightHand: [0, 0.3, -0.6], leftHand: [0, -0.4, 0.5], ...fist('r'), ...curl('l', 0.75, 0.6), mic: 1 },
  // the mic thrown out to the side on a held note, free hand open
  hold: { ik: { r: [-0.42, 1.45, 0.18], l: [0.38, 1.0, 0.28] }, rightHand: [0, 0.2, -0.4], ...fist('r'), leftHand: [-0.6, 0, 0], ...fingers('l', { Index: 0.9, Middle: 0.85, Ring: 0.8, Little: 0.75, Thumb: 0.8 }), mic: 1 },
  point: { ...restL, ik: { r: [-0.2, 1.38, 0.62], pole: [-1, -0.3, -0.4] }, rightHand: [0, 0, 0], ...fingers('r', { Index: 1 }) },
  peace: { ...restL, ik: { r: [-0.2, 1.42, 0.16] }, rightHand: [0, -0.3, 0.9], ...fingers('r', { Index: 1, Middle: 1, spread: true }) },
  hips: { ik: { r: [-0.17, 0.95, 0.02], l: [0.17, 0.95, 0.02], pole: [-1, 0.1, -0.6] }, rightHand: [0, 0, -0.9], leftHand: [0, 0, 0.9], ...curl('l', 0.6, 0.3), ...curl('r', 0.6, 0.3) },
  open: { leftUpperArm: [0.2, -0.45, -0.35], rightUpperArm: [0.2, 0.45, 0.35], leftLowerArm: [0, -0.35, 0], rightLowerArm: [0, 0.35, 0], leftHand: [-0.4, 0, 0], rightHand: [-0.4, 0, 0],
    ...fingers('l', { Index: 0.85, Middle: 0.8, Ring: 0.75, Little: 0.7, Thumb: 0.7 }), ...fingers('r', { Index: 0.85, Middle: 0.8, Ring: 0.75, Little: 0.7, Thumb: 0.7 }) },
  shrug: { leftShoulder: [0, 0, 0.18], rightShoulder: [0, 0, -0.18], ik: { r: [-0.36, 1.02, 0.25], l: [0.36, 1.02, 0.25] }, leftHand: [-1.1, 0, 0], rightHand: [-1.1, 0, 0],
    ...fingers('l', { Index: 0.85, Middle: 0.85, Ring: 0.85, Little: 0.85, Thumb: 0.7 }), ...fingers('r', { Index: 0.85, Middle: 0.85, Ring: 0.85, Little: 0.85, Thumb: 0.7 }) },
  yawn: { ...restL, ik: { r: [-0.02, 1.33, 0.13] }, rightHand: [0.2, -0.2, 1.35], ...fingers('r', { Index: 0.9, Middle: 0.9, Ring: 0.9, Little: 0.9, Thumb: 0.5 }) },
  heart: { spine: [0.05, 0, 0], ik: { r: [-0.03, 1.2, 0.19], l: [0.03, 1.2, 0.19] }, leftHand: [0, 0.3, 0.6], rightHand: [0, -0.3, -0.6],
    ...fingers('l', { Index: 0.6, Middle: 0.5, Ring: 0.4, Little: 0.3, Thumb: 0.5 }), ...fingers('r', { Index: 0.6, Middle: 0.5, Ring: 0.4, Little: 0.3, Thumb: 0.5 }) },
  reach: { spine: [-0.04, 0, 0], ...restL, ik: { r: [-0.16, 1.3, 0.66], pole: [-1, -0.5, -0.2] }, rightHand: [-0.3, 0, 0.2], ...fingers('r', { Index: 0.8, Middle: 0.7, Ring: 0.6, Little: 0.5, Thumb: 0.6 }) },
  float: { spine: [-0.06, 0, 0], leftUpperArm: [0.15, -0.2, -0.75], rightUpperArm: [0.15, 0.2, 0.75], leftLowerArm: [0, -0.5, 0], rightLowerArm: [0, 0.5, 0], leftHand: [-0.2, 0, -0.2], rightHand: [-0.2, 0, 0.2],
    ...curl('l', 0.25, 0.3), ...curl('r', 0.25, 0.3), leftUpperLeg: [-0.15, 0, 0.04], rightUpperLeg: [0.25, 0, -0.04], leftLowerLeg: [0.55, 0, 0], rightLowerLeg: [0.3, 0, 0] },
  sit: { spine: [0.1, 0, 0], leftUpperLeg: [-1.45, 0, 0.06], rightUpperLeg: [-1.4, 0, -0.06], leftLowerLeg: [1.35, 0, 0], rightLowerLeg: [1.5, 0, 0], leftFoot: [0.1, 0, 0], rightFoot: [0.1, 0, 0],
    leftUpperArm: [0.3, -0.3, -1.25], rightUpperArm: [0.3, 0.3, 1.25], leftLowerArm: [0, -0.5, 0], rightLowerArm: [0, 0.5, 0], ...relaxL, ...relaxR },
  hush: { ...restL, ik: { r: [-0.01, 1.32, 0.15] }, rightHand: [0, -0.4, 1.4], ...fingers('r', { Index: 1 }) },
  think: { ik: { r: [-0.04, 1.27, 0.12], l: [0.08, 1.08, 0.14], pole: [-0.6, -1, -0.2] }, rightHand: [0, 0, 1.2], leftHand: [0, 0, 0.6], ...curl('l', 0.6, 0.4), ...fingers('r', { Index: 0.6, Thumb: 0.7 }) },
};
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const ARM = new Set(['leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm']);
const BONES = [...new Set(Object.values(POSES).flatMap((p) => Object.keys(p)).filter((k) => k !== 'ik' && k !== 'mic').concat(['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot']))];

// the mic: ivory body, clay band, slate grille (held in the right fist; normalized hand frame)
function makeMic() {
  const g = new THREE.Group();
  const toon = (c) => { const m = new THREE.MeshToonMaterial({ color: c, gradientMap: gradTex('0.6,1', [0.6, 1]) }); m.toneMapped = false; return m; };
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.011, 0.15, 16), toon(PAL.ivory)); body.position.y = -0.01;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0155, 0.012, 16), toon(PAL.clay)); band.position.y = 0.062;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 12), toon(PAL.slate2)); head.position.y = 0.085;
  g.add(body, band, head);
  return g;
}

// ------------------------------------------------------------------ the singer
export async function loadSinger(look = 'claude', base = '') {
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = await loader.loadAsync(base + 'assets/vrm/base.vrm');
  const vrm = gltf.userData.vrm;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  vrm.scene.traverse((o) => { o.frustumCulled = false; });
  const U = makeUniforms();
  const acc = restyle(vrm, look, U);
  const root = new THREE.Group(); root.add(vrm.scene);
  const nodes = {};
  for (const b of BONES) { const n = vrm.humanoid.getNormalizedBoneNode(b); if (n) nodes[b] = n; }
  const hipsRest = nodes.hips.position.clone();
  vrm.lookAt.autoUpdate = false;
  const lookTarget = new THREE.Object3D(); root.add(lookTarget);
  vrm.humanoid.update(); vrm.scene.updateMatrixWorld(true);
  const headY = new THREE.Vector3().setFromMatrixPosition(vrm.humanoid.getRawBoneNode('head').matrixWorld).y;
  const eyeY = new THREE.Vector3().setFromMatrixPosition(vrm.humanoid.getRawBoneNode('leftEye').matrixWorld).y;
  // arm rest geometry for the IK (model space, T-pose)
  const armRest = {};
  for (const side of ['left', 'right']) {
    const a = nodes[side + 'UpperArm'].getWorldPosition(new THREE.Vector3()), b = nodes[side + 'LowerArm'].getWorldPosition(new THREE.Vector3()), c = nodes[side + 'Hand'].getWorldPosition(new THREE.Vector3());
    const dir0 = b.clone().sub(a).normalize();
    const axis0 = new THREE.Vector3(0, side === 'left' ? -1 : 1, 0); axis0.sub(dir0.clone().multiplyScalar(axis0.dot(dir0))).normalize();
    armRest[side] = { la: a.distanceTo(b), lb: b.distanceTo(c), B0inv: new THREE.Matrix4().makeBasis(dir0, axis0, dir0.clone().cross(axis0)).invert() };
  }
  const mic = makeMic(); nodes.rightHand.add(mic);
  mic.position.set(-0.055, -0.025, 0.0); mic.rotation.set(Math.PI / 2, 0, 0);
  const springs = vrm.springBoneManager;
  const cons = vrm.nodeConstraintManager;
  springs?.setInitState();

  // two-bone IK: local quaternions for upper + lower arm that put the wrist on target (world)
  function solveArm(side, T, pole, outU, outL) {
    const up = nodes[side + 'UpperArm'], R = armRest[side];
    up.parent.updateWorldMatrix(true, false);
    const S = up.getWorldPosition(_v1);
    const toT = _v2.copy(T).sub(S);
    let d = toT.length(); const dST = toT.normalize();
    d = M.clamp(d, Math.abs(R.la - R.lb) + 1e-3, R.la + R.lb - 1e-3);
    const x = (R.la * R.la - R.lb * R.lb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, R.la * R.la - x * x));
    const pp = _v3.copy(pole).sub(_v4.copy(dST).multiplyScalar(pole.dot(dST))).normalize();
    const E = _v4.copy(S).addScaledVector(dST, x).addScaledVector(pp, h);
    const dir = E.clone().sub(S).normalize();
    const Tc = S.clone().addScaledVector(dST, d);
    const fdir = Tc.sub(E).normalize();
    const n = dir.clone().cross(fdir);
    if (n.lengthSq() < 1e-8) n.copy(pp).cross(dir);
    n.normalize();
    const beta = Math.acos(M.clamp(dir.dot(fdir), -1, 1));
    _m1.makeBasis(dir, n, dir.clone().cross(n)).multiply(R.B0inv);
    _q.setFromRotationMatrix(_m1);
    up.parent.getWorldQuaternion(_q2);
    outU.copy(_q2.invert().multiply(_q));
    outL.setFromAxisAngle(_v1.set(0, side === 'left' ? -1 : 1, 0), beta);
  }
  const qBlend = {}, qTmpU = new THREE.Quaternion(), qTmpL = new THREE.Quaternion(), _T = new THREE.Vector3(), _Pole = new THREE.Vector3();
  // pose at time t: blend of poses + groove; every bone set (pure)
  function applyPose(t, u, dir) {
    const w = dir.poses || { rest: 1 };
    const entries = Object.entries(w).filter(([, k]) => k > 0);
    const wsum = entries.reduce((a, [, k]) => a + k, 0) || 1;
    const g = dir.groove ?? 1, bt = (u % 1 + 1) % 1;
    const bounce = Math.pow(Math.sin(Math.PI * bt), 2);          // up on the off-beat
    const sway = Math.sin(Math.PI * u);                           // side to side over two beats
    const h = P.headAt(t, u);
    const hb = dir.head || [0, 0, 0];
    const add = {
      hips: [0, 0.05 * g * sway * 0.6 + (dir.hipsYaw || 0), 0.035 * g * sway],
      spine: [0.02 * g * bounce + (dir.lean || 0), -0.03 * g * sway, -0.02 * g * sway],
      chest: [0.015 * g * bounce, 0, 0],
      neck: [h.pitch * 0.5, h.yaw * 0.4, h.roll * 0.4],
      head: [h.pitch * 0.8 + hb[0] - 0.02 * g * bounce, h.yaw * 0.8 + hb[1], h.roll * 0.8 + hb[2] + 0.03 * g * sway],
      leftShoulder: [0, 0, -0.03 * g * bounce], rightShoulder: [0, 0, 0.03 * g * bounce],
    };
    if (dir.walk != null) {
      const ph = dir.walk * M.TAU, sw = 0.42;
      add.leftUpperLeg = [-sw * Math.sin(ph), 0, 0.02]; add.rightUpperLeg = [sw * Math.sin(ph), 0, -0.02];
      add.leftLowerLeg = [0.5 * Math.max(0, Math.sin(ph + 1.6)) + 0.08, 0, 0]; add.rightLowerLeg = [0.5 * Math.max(0, Math.sin(ph + 1.6 + Math.PI)) + 0.08, 0, 0];
      add.leftFoot = [0.15 * Math.sin(ph), 0, 0]; add.rightFoot = [-0.15 * Math.sin(ph), 0, 0];
      add.hips = [0, 0.08 * Math.sin(ph), 0]; add.spine = [0.04, -0.06 * Math.sin(ph), 0];
      dir = { ...dir, bones: { ...(dir.bones || {}), leftUpperArm: [0, 0.35 * Math.sin(ph), 0], rightUpperArm: [0, 0.35 * Math.sin(ph), 0] } };
    } else if (dir.legs !== false) {
      add.leftUpperLeg = [-0.05 * g * bounce, 0, 0.02]; add.rightUpperLeg = [-0.05 * g * bounce, 0, -0.02];
      add.leftLowerLeg = [0.1 * g * bounce, 0, 0]; add.rightLowerLeg = [0.1 * g * bounce, 0, 0];
      add.leftFoot = [-0.05 * g * bounce, 0, 0]; add.rightFoot = [-0.05 * g * bounce, 0, 0];
    }
    // 1. every non-arm bone: weighted euler blend (small angles) + groove + per-shot offsets
    for (const b of BONES) {
      if (ARM.has(b)) continue;
      const n = nodes[b]; if (!n) continue;
      let x = 0, y = 0, z = 0;
      for (const [name, k] of entries) {
        const v = (POSES[name] || {})[b] || POSES.rest[b] || [0, 0, 0];
        x += v[0] * k; y += v[1] * k; z += v[2] * k;
      }
      const d = add[b] || [0, 0, 0], o = dir.bones?.[b] || [0, 0, 0];
      _e.set(x / wsum + d[0] + o[0], y / wsum + d[1] + o[1], z / wsum + d[2] + o[2], 'XYZ');
      n.quaternion.setFromEuler(_e);
    }
    const wb = dir.walk != null ? -0.02 * Math.abs(Math.cos(dir.walk * M.TAU)) : 0;
    const sitDrop = ((w.sit || 0) / wsum) * 0.42;
    nodes.hips.position.set(hipsRest.x + 0.012 * g * sway, hipsRest.y - 0.012 * g * bounce + (dir.rise || 0) + wb - sitDrop, hipsRest.z);
    // 2. arms: per pose FK or IK, blended as quaternions (sign-aligned nlerp)
    vrm.scene.updateMatrixWorld(true);
    for (const side of ['left', 'right']) {
      const s = side[0], kU = side + 'UpperArm', kL = side + 'LowerArm';
      const aU = qBlend[kU] || (qBlend[kU] = new THREE.Quaternion()), aL = qBlend[kL] || (qBlend[kL] = new THREE.Quaternion());
      aU.set(0, 0, 0, 0); aL.set(0, 0, 0, 0);
      for (const [name, k] of entries) {
        const p = POSES[name] || {};
        const ik = p.ik?.[s] || (dir.ik?.[s] && name === entries[0][0] ? dir.ik[s] : null);
        if (ik) {
          vrm.scene.localToWorld(_T.set(ik[0], ik[1], ik[2]));
          const pl = p.ik.pole || [side === 'left' ? 0.5 : -0.5, -1, -0.45];
          _Pole.set(pl[0] * (side === 'left' && p.ik.pole ? -1 : 1), pl[1], pl[2]).transformDirection(vrm.scene.matrixWorld);
          solveArm(side, _T, _Pole, qTmpU, qTmpL);
        } else {
          const vu = p[kU] || POSES.rest[kU], vl = p[kL] || POSES.rest[kL];
          qTmpU.setFromEuler(_e.set(vu[0], vu[1], vu[2], 'XYZ')); qTmpL.setFromEuler(_e.set(vl[0], vl[1], vl[2], 'XYZ'));
        }
        const sU = aU.x * qTmpU.x + aU.y * qTmpU.y + aU.z * qTmpU.z + aU.w * qTmpU.w < 0 ? -k : k;
        const sL = aL.x * qTmpL.x + aL.y * qTmpL.y + aL.z * qTmpL.z + aL.w * qTmpL.w < 0 ? -k : k;
        aU.x += qTmpU.x * sU; aU.y += qTmpU.y * sU; aU.z += qTmpU.z * sU; aU.w += qTmpU.w * sU;
        aL.x += qTmpL.x * sL; aL.y += qTmpL.y * sL; aL.z += qTmpL.z * sL; aL.w += qTmpL.w * sL;
      }
      aU.normalize(); aL.normalize();
      // a small swing on the beat so held arms still breathe
      const sw = 0.04 * g * Math.sin(Math.PI * u + (side === 'left' ? 0 : 1.3));
      nodes[kU].quaternion.copy(aU).multiply(_q3.setFromEuler(_e.set(0, sw * 0.5, sw, 'XYZ')));
      nodes[kL].quaternion.copy(aL);
      const ov = dir.bones?.[kU]; if (ov) nodes[kU].quaternion.multiply(_q3.setFromEuler(_e.set(ov[0], ov[1], ov[2], 'XYZ')));
    }
    let micW = 0; for (const [name, k] of entries) micW += ((POSES[name] || {}).mic || 0) * k;
    mic.visible = (dir.mic ?? micW / wsum) > 0.5;
  }
  function settleWorld() {
    vrm.humanoid.update();
    vrm.scene.updateMatrixWorld(true);
    cons?.update();
  }
  // face at time t
  function applyFace(t, u, dir) {
    const em = vrm.expressionManager;
    for (const n of ['aa', 'ih', 'ou', 'ee', 'oh', 'happy', 'angry', 'sad', 'relaxed', 'surprised', 'blink', 'blinkLeft', 'blinkRight', 'neutral']) em.setValue(n, 0);
    const mood = dir.mood || {};
    const sing = dir.sing ?? 1;
    const mo = dir.mouth ? { open: dir.mouth[0], wide: dir.mouth[1] ?? 0.2, round: dir.mouth[2] ?? 0 } : P.mouthAt(t, sing);
    const open = M.clamp(mo.open * (dir.mouthGain ?? 1.15));
    // visemes: openness from the vocal envelope, shape from the vowel being sung
    const round = M.clamp(mo.round), wide = M.clamp(mo.wide);
    em.setValue('aa', open * M.clamp(1 - round - 0.6 * wide) * 1.0);
    em.setValue('oh', open * round * 0.7);
    em.setValue('ou', open * round * 0.45);
    em.setValue('ee', open * wide * 0.6);
    em.setValue('ih', open * wide * 0.45);
    const blink = Math.max(dir.blink ?? P.blinkAt(t), 0);
    const happy = mood.happy || 0;
    em.setValue('blink', M.clamp(blink * (1 - happy)));
    if (dir.wink) em.setValue('blinkLeft', M.clamp(dir.wink));
    for (const k of ['happy', 'angry', 'sad', 'relaxed', 'surprised']) if (mood[k]) em.setValue(k, M.clamp(mood[k]));
    em.update();
  }
  const camWorld = new THREE.Vector3();
  function applyLook(dir, cam) {
    if (dir.lookAt) lookTarget.position.set(...dir.lookAt);
    else if (cam) { cam.getWorldPosition(camWorld); root.worldToLocal(lookTarget.position.copy(camWorld)); }
    lookTarget.updateMatrixWorld();
    vrm.lookAt.lookAt(lookTarget.getWorldPosition(camWorld));
  }

  const DT = 1 / 60, WARM = 18;   // 0.3 s of replay: the damped springs forget their start long before t
  // the whole performance at t: pose (with spring hair replayed), face, gaze.
  // dir is an object, or a function (t, u) -> object so the replay sees the moves leading up to t
  function update(t, u, dir = {}, cam = null) {
    const at = (tt) => (typeof dir === 'function' ? dir(tt, M.U(tt)) : dir);
    const d = at(t);
    root.updateMatrixWorld(true);
    if (springs && d.springs !== false) {
      const t0 = t - WARM * DT;
      applyPose(t0, M.U(t0), at(t0)); settleWorld();
      springs.reset();
      for (let k = WARM - 1; k >= 0; k--) {
        const tk = t - k * DT;
        applyPose(tk, M.U(tk), k ? at(tk) : d); settleWorld();
        springs.update(DT);
      }
    } else {
      applyPose(t, u, d); settleWorld();
    }
    applyFace(t, u, d);
    applyLook(d, cam);
    vrm.scene.updateMatrixWorld(true);
    return d;
  }
  // spring gravity: -1 normal, +1 when she hangs mirrored under the chamber floor (set by each set, every frame)
  const setGravity = (sgn) => { for (const j of springs?.joints || []) j.settings.gravityDir.set(0, sgn, 0); };
  return { vrm, root, U, update, headY, eyeY, acc, look, mic, nodes, setGravity };
}
