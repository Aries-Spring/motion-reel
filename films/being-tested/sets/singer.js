// singer.js: Claude, the singer. Sendagaya Shino (a VRoid Studio beta preset avatar by pixiv, CC0; see
// assets/vrm/CREDITS.md) restyled at load time into an anime-girl Claude: long hair in a clay-to-peach gradient
// with a peach angel ring, amber-coral eyes with spark catchlights, an oat cricket vest with clay ribbing over an
// ivory shirt, a clay bow with a spark charm, a slate pleated skirt with a clay stripe, and a spark hairpin where
// her X clip was. The twin under the floor is the same girl inverted: ink hair with ember tips, red-hot eyes.
//
// Everything is a pure function of time:
//   - pose: normalized humanoid bones from a blend of named poses (POSES) + groove on the beat
//   - face: VRM expressions (visemes from the vocal envelope + vowel, seeded blinks, moods)
//   - hair/skirt spring bones: replayed from rest over the last 0.3 s on every call (the springs are
//     damped, so the start state is forgotten long before t: same t -> same hair, on any worker)
//   - materials: three-vrm's MToon (toon ramp, shade colour, matcap rim, emission, outlines) with the film's own
//     uniforms (rim, scan line, tint, lift, glow, dissolve, exploded view) spliced into its shader
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
  t.anisotropy = 8; t.needsUpdate = true;
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
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// per-pixel recolour: fn(r, g, b, u, v) -> [r, g, b] or null (keep); alpha untouched
function recolor(tex, fn) {
  const { cv, c } = imgCanvas(tex);
  const d = c.getImageData(0, 0, cv.width, cv.height), p = d.data, W = cv.width, H = cv.height;
  for (let i = 0; i < p.length; i += 4) {
    const k = i / 4, o = fn(p[i], p[i + 1], p[i + 2], (k % W + 0.5) / W, (Math.floor(k / W) + 0.5) / H);
    if (o) { p[i] = o[0]; p[i + 1] = o[1]; p[i + 2] = o[2]; }
  }
  c.putImageData(d, 0, 0);
  return { cv, c };
}
// luminance-keyed remap: the painted shading of the original survives, the hue becomes ours
const remapFn = (stops, lo, hi) => (r, g, b) => grad(stops, (lum(r, g, b) / 255 - lo) / (hi - lo));
const inPoly = (pts, x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

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
function sparkShape(r = 1, rays = 11, seed = 4, w = 0.16) {
  // as a THREE.Shape (union approximated by one outline around the rays)
  const s = new THREE.Shape(), N = rays;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * M.TAU + 0.21 * (M.hash01(i, seed) - 0.5) + Math.PI / 2;
    const a2 = ((i + 0.5) / N) * M.TAU + Math.PI / 2;
    const len = r * (0.78 + 0.22 * M.hash01(i, seed + 7));
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
uniform vec3 uTint; uniform vec3 uLift; uniform float uGlow; uniform float uDissolve; uniform float uSelfGlow;
varying vec3 vWorldPos;
`;
const DISSOLVE = `if (vWorldPos.y > uDissolve) { float n = fract(sin(dot(floor(vWorldPos.xz * 140.0), vec2(12.9898, 78.233))) * 43758.5453);
        if (n < clamp((vWorldPos.y - uDissolve) * 6.0, 0.0, 1.0)) discard; }`;
// explode axes per part (character space, metres at uExplode = 1)
const PART_AXIS = [[/Hair_00_HAIR/, [0, 0.06, -0.14]], [/HairBack/, [0, 0.06, -0.16]], [/EyeHighlight/, [0, 0, 0.62]], [/EyeIris|EyeExtra/, [0, 0, 0.5]], [/EyeWhite/, [0, 0, 0.38]],
  [/FaceEyeline|FaceEyelash|FaceBrow/, [0, 0.04, 0.46]], [/FaceMouth/, [0, -0.04, 0.3]], [/Face_00/, [0, 0, 0.2]], [/AccessoryNeck/, [0, 0.03, 0.4]], [/Tops/, [0, 0.05, 0.28]],
  [/Bottoms/, [0, 0, 0.03]], [/Shoes/, [0, -0.45, 0.1]], [/Body/, [0, 0, 0]]];
const axisFor = (n) => (PART_AXIS.find(([re]) => re.test(n)) || [0, [0, 0, 0]])[1];
// splice the film's uniforms into a three-vrm MToonMaterial (surface or outline pass); MToon's own
// onBeforeCompile (its #defines) runs first
function hookMToon(m, U, name, { glow = 0 } = {}) {
  const axis = axisFor(name);
  Object.assign(m.uniforms, U, { uSelfGlow: { value: glow }, uAxis: { value: new THREE.Vector3(...axis) } });
  const base = m.onBeforeCompile, baseKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.vertexShader = 'uniform float uExplode; uniform vec3 uAxis; varying vec3 vWorldPos;\n' + sh.vertexShader.replace('#include <project_vertex>',
      'transformed += uAxis * uExplode;\n#include <project_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const fs = sh.fragmentShader, END = 'gl_FragColor = vec4( col, diffuseColor.a );', at = fs.lastIndexOf(END);
    sh.fragmentShader = RIM_FRAG + fs.slice(0, at) + `
      #ifndef OUTLINE
        float fres = pow(1.0 - clamp(abs(dot(normal, viewDir)), 0.0, 1.0), uRimP);
        col = col * uTint + uLift + uRim * fres * uRimK + diffuseColor.rgb * uSelfGlow * uGlow;
      #else
        col = col * uTint;
      #endif
      float sc = 1.0 - smoothstep(0.0, uScanW, abs(vWorldPos.y - uScanY));
      col = mix(col, uScanC * 1.6, sc * 0.85);
      ${DISSOLVE}
      ` + fs.slice(at);
  };
  m.customProgramCacheKey = () => `${baseKey()}|singer-${axis.join(',')}`;
  m.toneMapped = false;   // anime colour: keep the palette out of ACES
}
// plain toon for the props built here (pin, charm, mic); same film uniforms
function toonMat(color, U, { gradient = [0.6, 1.0], emissive = 0 } = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradTex(gradient.join(','), gradient), emissive: color, emissiveIntensity: emissive });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uSelfGlow: { value: 0 } });
    sh.vertexShader = 'varying vec3 vWorldPos;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = RIM_FRAG + sh.fragmentShader.replace('#include <opaque_fragment>', `
      float fres = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), uRimP);
      outgoingLight = outgoingLight * uTint + uLift + uRim * fres * uRimK;
      ${DISSOLVE}
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `singer-prop-${gradient.join(',')}`;
  m.toneMapped = false;
  return m;
}

// ------------------------------------------------------------------ the look
// colours are sRGB hex; gradients run dark -> light (hair: root -> tip)
const LOOKS = {
  claude: {
    hair: [[0, '#3E1209'], [0.16, '#6E2614'], [0.4, '#A63F22'], [0.66, '#CF6440'], [0.86, '#E88B64'], [1, '#F6B391']],
    hairBack: [[0, '#2E0C05'], [0.5, '#5E1E0E'], [1, '#93381C']],
    hairShade: '#7A3026', ring: '#FFD3B4', ringK: 0.75, hairRim: '#FFB48E',
    iris: [[0, '#1A0603'], [0.2, '#4A1408'], [0.45, '#A8401C'], [0.68, '#E8763E'], [0.88, '#FFB070'], [1, '#FFF0DC']],
    catch: 'rgba(255,250,242,1)', lash: '#3A150D', brow: '#7A3622',
    shirt: [[0, '#CFC3B2'], [0.55, '#EEE6DA'], [1, '#FCFAF6']], piping: [[0, '#1C1B19'], [1, '#4A4843']],
    vest: [[0, '#8E7C66'], [0.35, '#C4B39C'], [0.7, '#E3D8C6'], [1, '#F2EADD']], rib: [[0, '#7A2E16'], [0.5, '#C4623E'], [1, '#EE9670']], ribLine: '#2B2A27',
    crest: '#C4623E', bow: [[0, '#5A1D0D'], [0.45, '#B24E2B'], [0.8, '#E07A52'], [1, '#F6A47E']],
    skirt: [[0, '#0F0E0D'], [0.5, '#2E2C29'], [1, '#55524B']], stripe: '#C4623E',
    shoes: [[0, '#0E0908'], [0.5, '#341611'], [1, '#6E3024']],
    skinShade: '#F6CDBE', clothShade: '#D9C3B4', outline: '#3B1E15', hairOutline: '#5A1F0E',
    pin: '#FBEBD3', pinEmissive: 0.12, charm: '#FBEBD3', irisGlow: 0,
  },
  // the twin under the floor: the same girl inverted (an original "other self", nobody else's design)
  shadow: {
    hair: [[0, '#040404'], [0.4, '#0F0E0E'], [0.68, '#231A17'], [0.86, '#6A2A18'], [0.96, '#D2532C'], [1, '#FF8A5A']],
    hairBack: [[0, '#030303'], [0.6, '#0E0D0D'], [1, '#1E1A18']],
    hairShade: '#2A1A16', ring: '#FF6A3A', ringK: 0.25, hairRim: '#FF6A3A',
    iris: [[0, '#2A0500'], [0.3, '#8A1E06'], [0.6, '#FF5A2A'], [0.85, '#FFB08A'], [1, '#FFF1E0']],
    catch: 'rgba(255,236,220,1)', lash: '#050404', brow: '#141212',
    shirt: [[0, '#0C0C0B'], [0.6, '#1E1D1B'], [1, '#34322E']], piping: [[0, '#5A1D0D'], [1, '#D2532C']],
    vest: [[0, '#050505'], [0.5, '#121211'], [1, '#262522']], rib: [[0, '#5A1606'], [0.5, '#C2421C'], [1, '#FF7A4A']], ribLine: '#000000',
    crest: '#E8562C', bow: [[0, '#050505'], [0.6, '#1A1918'], [1, '#3A3734']],
    skirt: [[0, '#030303'], [0.5, '#0E0E0D'], [1, '#22211F']], stripe: '#E8562C',
    shoes: [[0, '#030303'], [0.5, '#0C0B0A'], [1, '#26221F']],
    skinShade: '#E2B4A6', clothShade: '#8A7F78', outline: '#000000', hairOutline: '#000000',
    pin: '#E8562C', pinEmissive: 0.45, charm: '#E8562C', irisGlow: 1,
  },
};

// the vest's V-neck rib (texture uv): between the shirt's V and an outer V one rib-width out
const V_IN = [[0.424, 0.355], [0.4995, 0.523], [0.572, 0.355]];
const V_OUT = [[0.392, 0.355], [0.4995, 0.556], [0.604, 0.355]];
function topsTex(map, L) {
  const shirt = remapFn(L.shirt, 0.25, 0.95), piping = remapFn(L.piping, 0.15, 0.75), vest = remapFn(L.vest, 0.02, 0.36), rib = remapFn(L.rib, 0.02, 0.3);
  const vBand = [...V_OUT, ...V_IN.slice().reverse()];
  const r = recolor(map, (R, G, B, u, v) => {
    if (v < 0.36 || (v < 0.53 && inPoly(V_IN, u, v))) {
      // shirt: sleeves, collar, front V. The solid blue collar band + placket strips become slate piping;
      // the blue shading painted on the white turns warm
      const blue = B - Math.max(R, G);
      const trim = (v > 0.14 && v < 0.24 && u > 0.33 && u < 0.67) || (v > 0.2 && v < 0.47 && ((u > 0.42 && u < 0.475) || (u > 0.525 && u < 0.58)));
      if (trim && blue > 40) return piping(R, G, B);
      return shirt(R + blue * 0.5, G + blue * 0.5, B);
    }
    if ((v > 0.903 && v < 0.957) || (v < 0.56 && inPoly(vBand, u, v))) return rib(R, G, B);
    return vest(R, G, B);
  });
  const { c, cv } = r, W = cv.width, H = cv.height;
  // a slate line inside each clay rib (the cricket-vest stripe) and the spark crest on her left chest
  c.strokeStyle = L.ribLine; c.lineWidth = W * 0.0045; c.lineJoin = 'round';
  c.beginPath(); const mid = V_IN.map(([x, y], i) => [(x + V_OUT[i][0]) / 2, (y + V_OUT[i][1]) / 2]);
  mid.forEach(([x, y], i) => (i ? c.lineTo(x * W, y * H) : c.moveTo(x * W, y * H))); c.stroke();
  c.beginPath(); c.moveTo(0, 0.93 * H); c.lineTo(W, 0.93 * H); c.stroke();
  c.fillStyle = L.crest;
  sparkPath(c, 0.615 * W, 0.6 * H, 0.03 * W, 11, 4, 0.0); c.fill('nonzero');
  return toTex(cv, map);
}

function restyle(vrm, look, U) {
  const L = LOOKS[look];
  const done = new Map();
  const once = (key, fn) => (done.has(key) ? done.get(key) : (done.set(key, fn()), done.get(key)));
  const C = (h) => new THREE.Color(h);
  const hidden = [];
  vrm.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((m) => /HAIR_02/.test(m.name || ''))) { o.visible = false; hidden.push(o); return; }   // the X clip: the spark pin replaces it
    for (const m of mats) {
      if (!m.isMToonMaterial || m.userData.styled) continue;   // meshes share materials (all 46 strands use one)
      m.userData.styled = true;
      const out = /Outline/.test(m.name || ''), n = (m.name || '').replace(' (Outline)', '');
      const map = m.map;
      let tex = null;
      if (/HAIR_01/.test(n)) {
        // strands: root -> tip gradient along v, the painted strand detail kept as a ratio to its row's mean
        tex = once('hair', () => {
          const { cv, c } = imgCanvas(map), d = c.getImageData(0, 0, cv.width, cv.height), p = d.data, W = cv.width, H = cv.height;
          for (let y = 0; y < H; y++) {
            let s = 0; for (let x = 0; x < W; x++) s += lum(p[(y * W + x) * 4], p[(y * W + x) * 4 + 1], p[(y * W + x) * 4 + 2]);
            const mean = Math.max(1, s / W), g = grad(L.hair, Math.pow((y + 0.5) / H, 0.85));
            for (let x = 0; x < W; x++) {
              const i = (y * W + x) * 4, k = M.clamp(1 + 0.9 * (lum(p[i], p[i + 1], p[i + 2]) / mean - 1), 0.55, 1.25);
              p[i] = Math.min(255, g[0] * k); p[i + 1] = Math.min(255, g[1] * k); p[i + 2] = Math.min(255, g[2] * k);
            }
          }
          c.putImageData(d, 0, 0);
          return toTex(cv, map);
        });
        if (!out) {
          m.color.set(1, 1, 1); m.shadeColorFactor.copy(C(L.hairShade));
          m.emissive.copy(C(L.ring)); m.emissiveIntensity = L.ringK;    // the spec streaks (emissiveMap) become a peach angel ring
        }
      } else if (/HairBack/.test(n)) {
        tex = once('hairBack', () => toTex(recolor(map, remapFn(L.hairBack, 0.2, 0.95)).cv, map));
        if (!out) { m.color.set(1, 1, 1); m.shadeColorFactor.copy(C(L.hairShade)); }
      } else if (/EyeIris/.test(n)) {
        tex = once('iris', () => toTex(recolor(map, (R, G, B) => (R + G + B > 24 ? remapFn(L.iris, 0.0, 0.7)(R, G, B) : null)).cv, map));
        if (!out && L.irisGlow) { m.emissive.copy(C(L.iris[3][1])); m.emissiveIntensity = 0.35; }
      } else if (/EyeHighlight/.test(n)) {
        // the two highlight blobs become spark catchlights (+ a small round one), same places
        tex = once('catch', () => {
          const { cv, c } = imgCanvas(map), W = cv.width, H = cv.height, d = c.getImageData(0, 0, W, H).data;
          const acc = [[0, 0, 0], [0, 0, 0]];
          for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] > 128) { const x = i % W, s = x < W / 2 ? 0 : 1; acc[s][0] += x; acc[s][1] += Math.floor(i / W); acc[s][2]++; }
          c.clearRect(0, 0, W, H); c.fillStyle = L.catch;
          for (const [sx, sy, n] of acc) {
            if (!n) continue;
            const x = sx / n, y = sy / n, r = Math.sqrt(n / Math.PI) * 1.9;
            sparkPath(c, x, y, r, 8, 9, 0.2); c.fill('nonzero');
            c.beginPath(); c.arc(x + r * 1.5, y + r * 2.1, r * 0.32, 0, M.TAU); c.fill();
          }
          return toTex(cv, map);
        });
      } else if (/FaceEyeline|FaceEyelash/.test(n)) {
        if (!out) { m.color.copy(C(L.lash)); m.shadeColorFactor.copy(C(L.lash)); }
      } else if (/FaceBrow/.test(n)) {
        if (!out) { m.color.copy(C(L.brow)); m.shadeColorFactor.copy(C(L.brow)).multiplyScalar(0.7); }
      } else if (/Tops/.test(n)) {
        tex = once('tops', () => topsTex(map, L));
        if (!out) m.shadeColorFactor.copy(C(L.clothShade));
      } else if (/AccessoryNeck/.test(n)) {
        tex = once('bow', () => toTex(recolor(map, remapFn(L.bow, 0.1, 0.75)).cv, map));
        if (!out) m.shadeColorFactor.copy(C(L.clothShade));
      } else if (/Bottoms/.test(n)) {
        tex = once('skirt', () => {
          const r = recolor(map, remapFn(L.skirt, 0.0, 0.42));
          r.c.fillStyle = L.stripe; r.c.fillRect(0, r.cv.height * 0.885, r.cv.width, r.cv.height * 0.012);
          return toTex(r.cv, map);
        });
        if (!out) m.shadeColorFactor.copy(C(L.clothShade));
      } else if (/Shoes/.test(n)) {
        tex = once('shoes', () => toTex(recolor(map, remapFn(L.shoes, 0.0, 0.5)).cv, map));
      } else if (/SKIN/.test(n)) {
        // the base's white underwear becomes slate shorts (seen in the exploded view and from below)
        if (/Body_00/.test(n)) tex = once('body', () => toTex(recolor(map, (R, G, B, u, v) => (u > 0.18 && u < 0.62 && v > 0.42 && v < 0.72 && B >= R - 18 && lum(R, G, B) > 90 ? grad(L.skirt, lum(R, G, B) / 255 * 0.8) : null)).cv, map));
        if (!out) m.shadeColorFactor.copy(C(L.skinShade));
      }
      if (tex) { m.map = tex; if (m.shadeMultiplyTexture) m.shadeMultiplyTexture = tex; }
      // cel shading: VRoid ships soft ramps (toony 0.05-0.35) that read as plastic; crisp terminators per class,
      // the face kept mostly lit. The VRoid rim matcaps stay, warmed and turned down. [toony, shift, matcap]
      const cls = /Face_00_SKIN/.test(n) ? 'face' : /SKIN/.test(n) ? 'skin' : /HAIR/.test(n) ? 'hair' : /CLOTH/.test(n) ? 'cloth' : null;
      const SH = { face: [0.6, 0.18, 0.25], skin: [0.8, 0.02, 0.3], hair: [0.86, 0.04, 0.65], cloth: [0.86, -0.02, 0.35] }[cls];
      if (SH && !out) {
        m.shadingToonyFactor = SH[0]; m.shadingShiftFactor = SH[1];
        if (m.matcapTexture) m.matcapFactor.copy(C(cls === 'hair' ? L.hairRim : '#FFE4D4')).multiplyScalar(SH[2]);
      }
      if (out) m.outlineColorFactor.copy(C(/HAIR/.test(n) ? L.hairOutline : L.outline));
      hookMToon(m, U, n, { glow: /EyeIris/.test(n) && look === 'shadow' ? 1 : 0 });
      m.update?.(0);
    }
  });
  return { hidden };
}

// accessories on the raw bones: a spark hairpin where the X clip was, a spark charm on the bow's knot
function accessories(vrm, look, U, hidden) {
  const L = LOOKS[look];
  const head = vrm.humanoid.getRawBoneNode('head'), chest = vrm.humanoid.getRawBoneNode('upperChest') || vrm.humanoid.getRawBoneNode('chest');
  vrm.scene.updateMatrixWorld(true);
  const centre = (meshes) => {
    const b = new THREE.Box3();
    for (const o of meshes) { o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
    return b.getCenter(new THREE.Vector3());
  };
  const pinMat = toonMat(L.pin, U, { emissive: L.pinEmissive });
  pinMat.userData.keep = true;
  const pin = new THREE.Mesh(new THREE.ExtrudeGeometry(sparkShape(1, 10, 4, 0.06), { depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2 }), pinMat);
  pin.scale.setScalar(0.03); pin.position.z = -0.003;
  const pinG = new THREE.Group(); pinG.add(pin);
  const headW = head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.07, 0));
  const clipW = hidden.length ? centre(hidden) : headW.clone().add(new THREE.Vector3(0.06, 0.05, 0.07));
  // face out from the head's centre, then into head-local space
  const outW = clipW.clone().sub(headW).normalize();
  const qW = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), outW);
  pinG.position.copy(head.worldToLocal(clipW.clone().addScaledVector(outW, 0.004)));
  pinG.quaternion.copy(head.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qW)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.35));
  head.add(pinG);
  // charm on the bow
  const bow = []; vrm.scene.traverse((o) => { if (o.isMesh && [].concat(o.material).some((m) => /AccessoryNeck/.test(m.name || ''))) bow.push(o); });
  const bowW = bow.length ? centre(bow) : chest.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0.08));
  const pend = new THREE.Mesh(new THREE.ExtrudeGeometry(sparkShape(1, 9, 11), { depth: 0.25, bevelEnabled: false }), toonMat(L.charm, U, { emissive: L.pinEmissive }));
  pend.scale.setScalar(0.011);
  const pendG = new THREE.Group(); pendG.add(pend);
  pendG.position.copy(chest.worldToLocal(bowW.clone().add(new THREE.Vector3(0, 0, 0.012))));
  pendG.quaternion.copy(chest.getWorldQuaternion(new THREE.Quaternion()).invert());
  chest.add(pendG);
  const choker = new THREE.Group(); choker.visible = false;   // kept for the API: the bow replaces the old choker
  return { pin: pinG, choker, pend: pendG };
}

// ------------------------------------------------------------------ poses
// Normalized humanoid space: T-pose = identity, character faces +Z, left arm along +X.
// FK values are XYZ euler radians per bone; fingers curl about z (left -, right +).
// Arms can instead take an IK target: ik: { r: [x, y, z], l: [...] } in the character's own space
// (feet at the origin, +Z forward), authored with the head bone at y = 1.39 and scaled to the model's own head
// height at load; elbows toward an optional pole.
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
function makeMic(U) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.011, 0.15, 20), toonMat(PAL.ivory, U)); body.position.y = -0.01;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0155, 0.012, 20), toonMat(PAL.clay, U)); band.position.y = 0.062;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.024, 20, 14), toonMat(PAL.slate2, U)); head.position.y = 0.085;
  g.add(body, band, head);
  return g;
}

// ------------------------------------------------------------------ the singer
const OLD_HEAD_Y = 1.39;   // POSES' IK targets were authored on a model whose head bone sat here
const FILM_EYE_Y = 1.449;
export async function loadSinger(look = 'claude', base = '', file = 'assets/vrm/shino.vrm') {
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = await loader.loadAsync(base + file);
  const vrm = gltf.userData.vrm;
  // VRM 0.x faces -Z: turn it to face +Z like VRM 1. Its normalized bones keep the model's own frame, so FK
  // angles authored for VRM 1 mirror through that turn: [x, y, z] -> [-x, y, -z] (applied in applyPose)
  const vrm0 = vrm.meta?.metaVersion === '0';
  if (vrm0) VRMUtils.rotateVRM0(vrm);
  const FX = vrm0 ? -1 : 1;
  // the film's cameras were framed on an eye line at FILM_EYE_Y: every singer is scaled to it (Shino by 0.978)
  vrm.humanoid.update(); vrm.scene.updateMatrixWorld(true);
  vrm.scene.scale.setScalar(FILM_EYE_Y / new THREE.Vector3().setFromMatrixPosition(vrm.humanoid.getRawBoneNode('leftEye').matrixWorld).y);
  vrm.scene.updateMatrixWorld(true);
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  vrm.scene.traverse((o) => { o.frustumCulled = false; });
  const U = makeUniforms();
  const { hidden } = restyle(vrm, look, U);
  const root = new THREE.Group(); root.add(vrm.scene);
  const nodes = {};
  for (const b of BONES) { const n = vrm.humanoid.getNormalizedBoneNode(b); if (n) nodes[b] = n; }
  const hipsRest = nodes.hips.position.clone();
  vrm.lookAt.autoUpdate = false;
  const lookTarget = new THREE.Object3D(); root.add(lookTarget);
  vrm.humanoid.update(); vrm.scene.updateMatrixWorld(true);
  const wpos = (n) => new THREE.Vector3().setFromMatrixPosition(n.matrixWorld);
  const headY = wpos(vrm.humanoid.getRawBoneNode('head')).y;
  const eyeL = wpos(vrm.humanoid.getRawBoneNode('leftEye')), eyeR = wpos(vrm.humanoid.getRawBoneNode('rightEye'));
  const eyeY = eyeL.y, eyeX = Math.abs(eyeL.x - eyeR.x) / 2, eyeZ = (eyeL.z + eyeR.z) / 2;
  const K = headY / OLD_HEAD_Y;    // IK targets scale with her
  const acc = accessories(vrm, look, U, hidden);
  // arm rest geometry for the IK in the model's own frame (where normalized bones rest at identity)
  const armRest = {};
  for (const side of ['left', 'right']) {
    const loc = (n) => vrm.scene.worldToLocal(n.getWorldPosition(new THREE.Vector3()));
    const a = loc(nodes[side + 'UpperArm']), b = loc(nodes[side + 'LowerArm']), c = loc(nodes[side + 'Hand']);
    const dir0 = b.clone().sub(a).normalize();
    const axis0 = new THREE.Vector3(0, side === 'left' ? -1 : 1, 0); axis0.sub(dir0.clone().multiplyScalar(axis0.dot(dir0))).normalize();
    armRest[side] = { la: a.distanceTo(b), lb: b.distanceTo(c), B0inv: new THREE.Matrix4().makeBasis(dir0, axis0, dir0.clone().cross(axis0)).invert() };
  }
  const mic = makeMic(U); nodes.rightHand.add(mic);
  mic.position.set(-0.055 * FX, -0.025, 0.0); mic.rotation.set(FX * Math.PI / 2, 0, 0);
  const springs = vrm.springBoneManager;
  const cons = vrm.nodeConstraintManager;
  springs?.setInitState();
  const em = vrm.expressionManager;
  // VRM 0 customs keep their own names (Shino: "Surprised", "Extra" = the > < squint)
  const EXPR = {};
  for (const n of ['aa', 'ih', 'ou', 'ee', 'oh', 'happy', 'angry', 'sad', 'relaxed', 'surprised', 'blink', 'blinkLeft', 'blinkRight', 'neutral', 'extra']) {
    const hit = [n, n[0].toUpperCase() + n.slice(1)].find((k) => em.getExpression(k));
    if (hit) EXPR[n] = hit;
  }
  const setX = (n, v) => { if (EXPR[n]) em.setValue(EXPR[n], v); };

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
    // world rotation of the bone = current basis * rest basis^-1 (rest basis in the bone's own rest frame)
    _m1.makeBasis(dir, n, dir.clone().cross(n)).multiply(R.B0inv);
    _q.setFromRotationMatrix(_m1);
    up.parent.getWorldQuaternion(_q2);
    outU.copy(_q2.invert().multiply(_q));
    outL.setFromAxisAngle(_v1.set(0, side === 'left' ? -1 : 1, 0), beta);
  }
  const qBlend = {}, qTmpU = new THREE.Quaternion(), qTmpL = new THREE.Quaternion(), _T = new THREE.Vector3(), _Pole = new THREE.Vector3();
  const eul = (x, y, z) => _e.set(x * FX, y, z * FX, 'XYZ');
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
      n.quaternion.setFromEuler(eul(x / wsum + d[0] + o[0], y / wsum + d[1] + o[1], z / wsum + d[2] + o[2]));
    }
    const wb = dir.walk != null ? -0.02 * Math.abs(Math.cos(dir.walk * M.TAU)) : 0;
    const sitDrop = ((w.sit || 0) / wsum) * 0.42 * K;
    nodes.hips.position.set(hipsRest.x + FX * 0.012 * g * sway, hipsRest.y - 0.012 * g * bounce + (dir.rise || 0) + wb - sitDrop, hipsRest.z);
    // 2. arms: per pose FK or IK, blended as quaternions (sign-aligned nlerp). IK targets are character space
    // (root: feet at the origin, +Z forward), scaled from the pose authoring model by K
    root.updateMatrixWorld(true);
    vrm.scene.updateMatrixWorld(true);
    for (const side of ['left', 'right']) {
      const s = side[0], kU = side + 'UpperArm', kL = side + 'LowerArm';
      const aU = qBlend[kU] || (qBlend[kU] = new THREE.Quaternion()), aL = qBlend[kL] || (qBlend[kL] = new THREE.Quaternion());
      aU.set(0, 0, 0, 0); aL.set(0, 0, 0, 0);
      for (const [name, k] of entries) {
        const p = POSES[name] || {};
        const ik = p.ik?.[s] || (dir.ik?.[s] && name === entries[0][0] ? dir.ik[s] : null);
        if (ik) {
          root.localToWorld(_T.set(ik[0] * K, ik[1] * K, ik[2] * K));
          const pl = p.ik?.pole || [side === 'left' ? 0.5 : -0.5, -1, -0.45];
          _Pole.set(pl[0] * (side === 'left' && p.ik?.pole ? -1 : 1), pl[1], pl[2]).transformDirection(root.matrixWorld);
          solveArm(side, _T, _Pole, qTmpU, qTmpL);
        } else {
          const vu = p[kU] || POSES.rest[kU], vl = p[kL] || POSES.rest[kL];
          qTmpU.setFromEuler(eul(vu[0], vu[1], vu[2])); qTmpL.setFromEuler(eul(vl[0], vl[1], vl[2]));
        }
        const sU = aU.x * qTmpU.x + aU.y * qTmpU.y + aU.z * qTmpU.z + aU.w * qTmpU.w < 0 ? -k : k;
        const sL = aL.x * qTmpL.x + aL.y * qTmpL.y + aL.z * qTmpL.z + aL.w * qTmpL.w < 0 ? -k : k;
        aU.x += qTmpU.x * sU; aU.y += qTmpU.y * sU; aU.z += qTmpU.z * sU; aU.w += qTmpU.w * sU;
        aL.x += qTmpL.x * sL; aL.y += qTmpL.y * sL; aL.z += qTmpL.z * sL; aL.w += qTmpL.w * sL;
      }
      aU.normalize(); aL.normalize();
      // a small swing on the beat so held arms still breathe
      const sw = 0.04 * g * Math.sin(Math.PI * u + (side === 'left' ? 0 : 1.3));
      nodes[kU].quaternion.copy(aU).multiply(_q3.setFromEuler(eul(0, sw * 0.5, sw)));
      nodes[kL].quaternion.copy(aL);
      const ov = dir.bones?.[kU]; if (ov) nodes[kU].quaternion.multiply(_q3.setFromEuler(eul(ov[0], ov[1], ov[2])));
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
    for (const n of Object.keys(EXPR)) setX(n, 0);
    const mood = dir.mood || {};
    const sing = dir.sing ?? 1;
    const mo = dir.mouth ? { open: dir.mouth[0], wide: dir.mouth[1] ?? 0.2, round: dir.mouth[2] ?? 0 } : P.mouthAt(t, sing);
    const open = M.clamp(mo.open * (dir.mouthGain ?? 1.15));
    // visemes: openness from the vocal envelope, shape from the vowel being sung
    const round = M.clamp(mo.round), wide = M.clamp(mo.wide);
    setX('aa', open * M.clamp(1 - round - 0.6 * wide) * 1.0);
    setX('oh', open * round * 0.7);
    setX('ou', open * round * 0.45);
    setX('ee', open * wide * 0.6);
    setX('ih', open * wide * 0.45);
    const blink = Math.max(dir.blink ?? P.blinkAt(t), 0);
    const happy = mood.happy || 0;
    setX('blink', M.clamp(blink * (1 - happy)));
    if (dir.wink) setX('blinkLeft', M.clamp(dir.wink));
    for (const k of ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'extra']) if (mood[k]) setX(k, M.clamp(mood[k]));
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
  return { vrm, root, U, update, headY, eyeY, eyeX, eyeZ, acc, look, mic, nodes, setGravity };
}
