// singer.js: Claude, the singer. Sendagaya Shino (a VRoid Studio beta preset avatar by pixiv, CC0; see
// assets/vrm/CREDITS.md) restyled at load time into an anime-girl Claude: long hair in a clay-to-peach gradient
// with a peach angel ring, amber-coral eyes with spark catchlights, an oat cricket vest with clay ribbing over an
// ivory shirt, a clay bow with a spark charm, a slate pleated skirt with a clay stripe, and a spark hairpin where
// her X clip was. The twin under the floor is the same girl inverted: ink hair with ember tips, red-hot eyes.
//
// Everything is a pure function of time:
//   - pose: normalized humanoid bones from a blend of named poses (POSES) + the groove (her weight moving from
//     leg to leg, knees giving on the beat) with the feet planted by leg IK; arms solved in root space (the same
//     upright and mirrored), hands following late, hanging arms trailing the body
//   - face: VRM expressions (visemes from the phones of the lyric words, seeded blinks, moods split into eye and
//     mouth parts so no mood props the mouth open)
//   - hair/skirt spring bones: replayed from rest over the last 0.3 s on every call (the springs are
//     damped, so the start state is forgotten long before t: same t -> same hair, on any worker)
//   - materials: three-vrm's MToon (toon ramp, shade colour, matcap rim, emission, outlines) with the film's own
//     uniforms (rim, scan line, tint, lift, glow, dissolve, exploded view) spliced into its shader
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRMExpression, VRMExpressionMorphTargetBind } from '@pixiv/three-vrm';
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
// height at load. ik.frame ('head' | 'chest' | 'hips', or per side { r, l }) carries the target with that part of
// her as it moves; the elbow goes toward ik.pole (authored for the right arm, mirrored for the left; poleL / poleR
// set one side). still: 1 keeps hanging arms still (hands planted on something).
const fingers = (side, open) => { // open: {Index: 0..1 extended, ..., Thumb, spread: index and middle apart}
  const s = side === 'l' ? -1 : 1, P = side === 'l' ? 'left' : 'right', o = {};
  for (const f of ['Index', 'Middle', 'Ring', 'Little']) {
    const k = 1 - (open[f] ?? 0);
    o[`${P}${f}Proximal`] = [0, 0, s * 1.25 * k]; o[`${P}${f}Intermediate`] = [0, 0, s * 1.5 * k]; o[`${P}${f}Distal`] = [0, 0, s * 0.9 * k];
  }
  if (open.spread) { o[`${P}IndexProximal`][1] = s * 0.2; o[`${P}MiddleProximal`][1] = -s * 0.14; }
  const th = 1 - (open.Thumb ?? 0);
  o[`${P}ThumbMetacarpal`] = [0, -s * 0.5 * th, s * 0.35 * th]; o[`${P}ThumbProximal`] = [0, -s * 0.6 * th, 0]; o[`${P}ThumbDistal`] = [0, -s * 0.6 * th, 0];
  return o;
};
const curl = (side, k, thumb = 0.5) => fingers(side, { Index: 1 - k, Middle: 1 - k, Ring: 1 - k, Little: 1 - k, Thumb: 1 - thumb });
const fist = (s) => curl(s, 0.95, 0.85);
// a hand at rest: the curl grows from index to little and the fingers fan a little; k scales it
const relax = (side, k = 1) => {
  const s = side === 'l' ? -1 : 1, P = side === 'l' ? 'left' : 'right', o = {};
  const F = { Index: [0.22, 0.32, 0.18, -0.06], Middle: [0.32, 0.42, 0.22, 0], Ring: [0.42, 0.48, 0.26, 0.05], Little: [0.52, 0.52, 0.28, 0.12] };
  for (const [f, [a, b, c, fan]] of Object.entries(F)) { o[`${P}${f}Proximal`] = [0, s * fan, s * a * k]; o[`${P}${f}Intermediate`] = [0, 0, s * b * k]; o[`${P}${f}Distal`] = [0, 0, s * c * k]; }
  o[`${P}ThumbMetacarpal`] = [0, -s * 0.25 * k, s * 0.15 * k]; o[`${P}ThumbProximal`] = [0, -s * 0.3 * k, 0]; o[`${P}ThumbDistal`] = [0, -s * 0.25 * k, 0];
  return o;
};
const OPEN = { Index: 0.92, Middle: 0.88, Ring: 0.8, Little: 0.72, Thumb: 0.75 }, V = { Index: 1, Middle: 1, spread: true, Thumb: 0.1 };
// arms hang close (9 deg out, a little forward), elbows soft, palms to the thighs, shoulders down
const restL = { leftUpperArm: [-0.08, -0.18, -1.37], leftLowerArm: [0, -0.3, 0], leftHand: [0.05, 0, -0.1], leftShoulder: [0, -0.02, -0.04], ...relax('l') };
const restR = { rightUpperArm: [-0.08, 0.18, 1.37], rightLowerArm: [0, 0.3, 0], rightHand: [0.05, 0, 0.1], rightShoulder: [0, 0.02, 0.04], ...relax('r') };
// the right fist holds the mic 5 cm under her lips and a little in front, aimed at them; it rides with her head
const micR = { ik: { r: [-0.063, 1.284, 0.163], pole: [-0.6, -1, -0.737], frame: { r: 'head' } }, rightHand: [-0.263, -0.513, 0.425], ...fist('r'), mic: 1 };
const hipL = { l: [0.151, 1.012, -0.015], poleL: [0.7, 0.1, -0.6] }, hipHandL = [-0.484, -0.125, 0.525];   // left palm on the waist
// adrift (the fall, the dream): arms afloat, elbows and knees loose
const afloat = { spine: [-0.06, 0, 0], leftUpperArm: [0.15, -0.2, -0.75], rightUpperArm: [0.15, 0.2, 0.75], leftLowerArm: [0, -0.6, 0], rightLowerArm: [0, 0.6, 0], leftHand: [-0.2, 0, -0.2], rightHand: [-0.2, 0, 0.2],
  ...relax('l', 0.8), ...relax('r', 0.8), leftUpperLeg: [-0.15, 0, 0.04], rightUpperLeg: [0.25, 0, -0.04], leftLowerLeg: [0.55, 0, 0], rightLowerLeg: [0.3, 0, 0] };
export const POSES = {
  rest: { ...restL, ...restR },
  mic: { ...restL, ...micR },
  // both hands on the mic, leaning in (the chorus belt)
  belt: { spine: [0.06, 0, 0], ik: { r: [-0.057, 1.292, 0.175], l: [0.046, 1.186, 0.231], frame: 'head' }, rightHand: [-0.238, -0.537, 0.612], leftHand: [-0.313, -0.338, 0.344], ...fist('r'), ...curl('l', 0.7, 0.6), mic: 1 },
  // a held note: the mic stays at her mouth, the free arm goes out and up, palm forward
  hold: { spine: [-0.04, 0, 0], ...micR, ik: { ...micR.ik, l: [0.442, 1.41, 0.227], poleL: [0.325, -1, 0], frame: { r: 'head', l: 'chest' } }, leftHand: [-0.484, 0, 0.375], leftShoulder: [0, 0, 0.06], ...fingers('l', OPEN) },
  // still singing, the free hand gestures: a V by her temple, a point, on the hip, open, a yawn beside the mic, a reach
  micPeace: { ...restL, ...micR, ik: { ...micR.ik, l: [0.167, 1.371, 0.114], poleL: [1.394, -0.7, 0.4], frame: 'head' }, leftHand: [0.531, 0.688, 0.347], ...fingers('l', V) },
  micPoint: { ...restL, ...micR, ik: { ...micR.ik, l: [0.24, 1.296, 0.399], poleL: [1.131, -1, -0.081], frame: { r: 'head', l: 'chest' } }, leftHand: [-0.188, 0.109, -0.172], leftShoulder: [0, -0.07, 0.03], ...fingers('l', { Index: 1, Thumb: 0.3 }) },
  micHip: { ...micR, ik: { ...micR.ik, ...hipL, frame: { r: 'head', l: 'hips' } }, leftHand: hipHandL, ...curl('l', 0.3, 0.2), leftShoulder: [0, 0.03, 0.03] },
  micOpen: { ...micR, ik: { ...micR.ik, l: [0.402, 1.049, 0.203], poleL: [-0.394, -1, 0.219], frame: { r: 'head', l: 'chest' } }, leftHand: [-0.375, 0.047, 0.047], ...fingers('l', OPEN) },
  micYawn: { ...restL, ...micR, ik: { ...micR.ik, l: [0.07, 1.34, 0.115], poleL: [0.412, -1, -0.862], frame: 'head' }, leftHand: [0.35, 0.9, -0.4], ...fingers('l', { Index: 0.85, Middle: 0.85, Ring: 0.8, Little: 0.75, Thumb: 0.6 }) },
  micReach: { spine: [-0.04, 0, 0], ...micR, ik: { ...micR.ik, l: [0.261, 1.407, 0.444], poleL: [1.3, -1, 0.15], frame: { r: 'head', l: 'chest' } }, leftHand: [0, 0.125, 0.281], leftShoulder: [0, -0.1, 0.03],
    ...fingers('l', { Index: 0.92, Middle: 0.85, Ring: 0.75, Little: 0.65, Thumb: 0.7, spread: true }) },
  // the mic lowered to her chest, the free hand on the hip (between lines only)
  micHips: { ik: { ...hipL, r: [-0.104, 1.131, 0.157], pole: [-0.162, -1, -0.737], frame: { l: 'hips', r: 'chest' } }, leftHand: hipHandL, rightHand: [-0.031, -0.903, 0.025], ...curl('l', 0.3, 0.2), ...fist('r'), leftShoulder: [0, 0.03, 0.03], mic: 1 },
  // free-handed
  point: { ...restL, ik: { r: [-0.199, 1.49, 0.399], pole: [-0.681, -1, -0.281], frame: 'chest' }, rightHand: [-0.172, -0.094, 0.125], rightShoulder: [0, 0.08, -0.04], ...fingers('r', { Index: 1, Thumb: 0.3 }) },
  peace: { ...restL, ik: { r: [-0.154, 1.36, 0.08], pole: [-1.844, -0.831, 0.4], frame: 'head' }, rightHand: [0.625, -0.859, -0.238], ...fingers('r', V) },
  hips: { ik: { l: hipL.l, r: [-0.151, 1.012, -0.015], pole: [-0.7, 0.1, -0.6], frame: 'hips' }, leftHand: hipHandL, rightHand: [-0.484, 0.125, -0.525], ...curl('l', 0.3, 0.2), ...curl('r', 0.3, 0.2), leftShoulder: [0, 0.03, 0.03], rightShoulder: [0, -0.03, -0.03] },
  open: { ik: { l: [0.402, 1.049, 0.203], r: [-0.402, 1.049, 0.203], pole: [0.394, -1, 0.219], frame: 'chest' }, leftHand: [-0.375, 0.047, 0.047], rightHand: [-0.375, -0.047, -0.047], ...fingers('l', OPEN), ...fingers('r', OPEN) },
  shrug: { ik: { l: [0.229, 1.134, 0.239], r: [-0.229, 1.134, 0.239], pole: [0.188, -1, -0.231], frame: 'chest' }, leftHand: [-1.453, 0, 0.219], rightHand: [-1.453, 0, -0.219], leftShoulder: [0, 0, 0.15], rightShoulder: [0, 0, -0.15], ...fingers('l', OPEN), ...fingers('r', OPEN) },
  yawn: { ...restL, ik: { r: [0.002, 1.356, 0.131], pole: [-0.412, -1, -0.862], frame: 'head' }, rightHand: [-0.394, -0.778, 0.425], ...fingers('r', { Index: 0.85, Middle: 0.85, Ring: 0.8, Little: 0.75, Thumb: 0.6 }) },
  heart: { spine: [0.05, 0, 0], ik: { l: [0.026, 1.19, 0.17], r: [-0.026, 1.19, 0.17], pole: [-0.806, -1, -0.962], frame: 'chest' }, leftHand: [0.359, 0.034, 0.444], rightHand: [0.359, -0.034, -0.444],
    ...fingers('l', { Index: 0.6, Middle: 0.5, Ring: 0.4, Little: 0.3, Thumb: 0.5 }), ...fingers('r', { Index: 0.6, Middle: 0.5, Ring: 0.4, Little: 0.3, Thumb: 0.5 }) },
  reach: { spine: [-0.04, 0, 0], ...restL, ik: { r: [-0.261, 1.407, 0.444], pole: [-1.3, -1, 0.15], frame: 'chest' }, rightHand: [0, -0.125, -0.281], rightShoulder: [0, 0.1, -0.03],
    ...fingers('r', { Index: 0.92, Middle: 0.85, Ring: 0.75, Little: 0.65, Thumb: 0.7, spread: true }) },
  float: afloat,
  // still adrift, her left hand reaching out to the hand of words (legs: false keeps the floating legs)
  floatReach: { ...afloat, ik: { l: [0.42, 1.4, 0.3], poleL: [1.3, -1, 0.15], frame: 'chest' }, leftHand: [0, 0.125, 0.281], leftShoulder: [0, -0.1, 0.03],
    ...fingers('l', { Index: 0.92, Middle: 0.85, Ring: 0.75, Little: 0.65, Thumb: 0.7, spread: true }) },
  sit: { spine: [0.1, 0, 0], leftUpperLeg: [-1.45, 0, 0.06], rightUpperLeg: [-1.4, 0, -0.06], leftLowerLeg: [1.35, 0, 0], rightLowerLeg: [1.5, 0, 0], leftFoot: [0.1, 0, 0], rightFoot: [0.1, 0, 0],
    leftUpperArm: [0.3, -0.3, -1.25], rightUpperArm: [0.3, 0.3, 1.25], leftLowerArm: [0, -0.5, 0], rightLowerArm: [0, 0.5, 0], ...relax('l'), ...relax('r'), still: 1 },
  hush: { ...restL, ik: { r: [-0.01, 1.32, 0.15] }, rightHand: [0, -0.4, 1.4], ...fingers('r', { Index: 1 }) },
  think: { ik: { r: [-0.04, 1.27, 0.12], l: [0.08, 1.08, 0.14], pole: [-0.6, -1, -0.2] }, rightHand: [0, 0, 1.2], leftHand: [0, 0, 0.6], ...curl('l', 0.6, 0.4), ...fingers('r', { Index: 0.6, Thumb: 0.7 }) },
};
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _m1 = new THREE.Matrix4();
const ARM = new Set(['leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm', 'leftHand', 'rightHand']);
const FINGER = /Thumb|Index|Middle|Ring|Little/;
const BONES = [...new Set(Object.values(POSES).flatMap((p) => Object.keys(p)).filter((k) => !['ik', 'mic', 'still'].includes(k)).concat(['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot', 'leftToes', 'rightToes']))];

// dir.poses is {name: w}, or a spring track's {w, signed} (signed: the springs' small overshoot, read only by the arm
// direction so a move can carry a hair past its key). Everything else reads the clamped weights, summing to 1
function weightsOf(poses = { rest: 1 }) {
  const w = poses.w || poses, wn = {};
  let sum = 0; for (const k of Object.values(w)) if (k > 0) sum += k;
  if (!sum) return weightsOf({ rest: 1 });
  for (const [n, k] of Object.entries(w)) if (k > 0) wn[n] = k / sum;
  return { wn, ent: Object.entries(wn), signed: Object.entries(poses.signed || w).filter(([, k]) => k > -0.25 && Math.abs(k) > 1e-4) };
}
// ------------------------------------------------------------------ the groove (pure functions of t, u, dir)
const sh3 = (x) => x * (1.5 - 0.5 * x * x);   // dwells at the ends
// her weight, -1 all on the right leg .. +1 all on the left. On the groove it lands on a leg every swayBeats / 2
// beats; off it, it drifts slowly about the contrapposto (dir.weight). dir.sway scales the shift and the drift
function weightAt(t, u, dir) {
  const g = dir.groove ?? 1, rest = dir.weight ?? -0.55;
  const beat = sh3(Math.cos((M.TAU * (u - (dir.swayPhase ?? 0))) / (dir.swayBeats ?? 4)));
  return M.clamp(rest + (dir.sway ?? 1) * ((beat - rest) * g + 0.2 * (1 - g) * M.noise1(t * 0.21, 31)), -1, 1);
}
// the knees give on the beat: 0..1 times the groove
const dipAt = (u, dir) => (dir.groove ?? 1) * (0.5 + 0.5 * Math.cos(M.TAU * u)) ** 1.5;
// the walk. dir.walk: the phase in cycles (her left heel strikes on whole cycles, her right on halves); dir.stride: how
// far she travels per cycle (m), so a foot that is down stays put on the floor as she moves on
const DUTY = 0.62;   // a foot is down 62% of the cycle: both are down for the 12% after each heel strike
const minJerk = (x) => x * x * x * (10 + x * (6 * x - 15));
// one foot, p cycles after its heel strike: where it is (z from the strike: moving back while it is down, then
// swinging through), lift, pitch (- toes up, rolling on the heel; + heel up, rolling on the ball), toes bent at the ball
function stepAt(p, L) {
  if (p < DUTY) { const pitch = -0.25 * (1 - P.smoothstep(0, 0.1, p)) + 1.0 * P.smoothstep(0.3, DUTY, p) ** 1.5; return { z: -L * p, lift: 0, pitch, toe: Math.min(0.6, Math.max(0, pitch)) }; }
  const s = (p - DUTY) / (1 - DUTY), a = s ** 0.8;
  return { z: L * (minJerk(s) - p), lift: 0.8 * a * a * (1 - a) * (1 - a), pitch: M.lerp(1.0, -0.25, P.smoothstep(0, 0.9, s)), toe: 0.6 * (1 - P.smoothstep(0, 0.3, s)) };
}
// the torso on the walk: weight over the foot that is down (+ left), the pelvis turning with the leading leg, the bob
// (lowest just after each heel strike)
const walkAt = (ph) => ({ s: 0.7 * Math.cos(M.TAU * (ph - 0.3)), turn: -0.07 * Math.cos(M.TAU * ph), bob: -0.01 * (1 + Math.cos(2 * M.TAU * (ph - 0.06))) });
// the torso's groove at (t, u), the one source for the pose and the arms' lag: the hips over the standing leg (the
// free hip forward), the chest rolling back so the shoulders stay level and the head upright, the dip on the beat, the
// head's idle; the phrasing (performance.js): chest and shoulders rising with the breath before a line, a lean in and
// the chin up on a held note, a small nod on a stressed vowel, a settle after the line; on the walk, the pelvis and
// shoulders turning against each other. s: the weight, gated to standing poses by ws (sit, float and legs: false keep
// their own legs)
function addsAt(t, u, dir) {
  const { wn } = weightsOf(dir.poses), wk = dir.walk != null;
  const ws = dir.legs === false ? 0 : M.clamp(1 - (wn.sit || 0) - (wn.float || 0));
  const sAt = (lu, lw) => ws * (wk ? walkAt(dir.walk - lw).s : weightAt(t, u - lu, dir));   // lagged lu beats (lw cycles on the walk)
  const s = sAt(0, 0), s1 = sAt(0.12, 0.05), s2 = sAt(0.25, 0.1), wa = wk ? walkAt(dir.walk) : { turn: 0, bob: 0 }, tn = wa.turn * ws;
  const dip = dipAt(u, dir), { breath: br, belt: bt, accent: ac, settle: se } = P.phraseAt(t);
  const h = P.headAt(t, u), hb = dir.head || [0, 0, 0], sh = 0.025 * dip - 0.03 * br + 0.02 * se;   // shoulders down
  const add = {
    hips: [0.015 * dip * ws, (wk ? tn : 0.05 * s) + (dir.hipsYaw || 0), 0.065 * s],
    spine: [0.02 * dip + (dir.lean || 0) + (wk ? 0.03 : 0) + 0.03 * bt + 0.008 * se, -0.025 * s1 - 0.8 * tn, -0.015 * s1],
    chest: [0.01 * dip - 0.02 * br + 0.008 * bt + 0.012 * se, -0.02 * s1 - 0.6 * tn, -0.03 * s1],
    upperChest: [-0.012 * br, 0, -0.012 * s1],
    neck: [h.pitch * 0.5 - 0.008 * br - 0.015 * bt + 0.008 * ac, h.yaw * 0.4 + 0.2 * tn, h.roll * 0.4 + 0.015 * s2],
    head: [h.pitch * 0.8 + hb[0] - 0.015 * dip - 0.04 * bt + 0.02 * ac + 0.015 * se, h.yaw * 0.8 + hb[1] + 0.2 * tn, h.roll * 0.8 + hb[2] + 0.025 * s2],
    leftShoulder: [0, 0, -sh], rightShoulder: [0, 0, sh],
  };
  return { add, s, dip, ws, bob: wa.bob * ws };
}

// the mic: ivory body, clay band, slate grille (held in the right fist; normalized hand frame)
function makeMic(U) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.011, 0.15, 20), toonMat(PAL.ivory, U)); body.position.y = -0.01;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0155, 0.012, 20), toonMat(PAL.clay, U)); band.position.y = 0.062;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.024, 20, 14), toonMat(PAL.slate2, U)); head.position.y = 0.085;
  g.add(body, band, head);
  return g;
}

// ------------------------------------------------------------------ face
// VRoid's Joy / Sorrow / Surprised each bind one combined morph (Fcl_ALL_*) that opens the mouth: their eye and mouth
// halves become expressions of their own, so a mood never props the mouth open while she sings. Registered as
// expressions (never written to morphTargetInfluences) so expressionManager.update() clears them every frame
const FACE_RAW = { eyeJoy: 'Fcl_EYE_Joy', mthFun: 'Fcl_MTH_Fun', mthJoy: 'Fcl_MTH_Joy', eyeSorrow: 'Fcl_EYE_Sorrow', mthSorrow: 'Fcl_MTH_Sorrow',
  eyeSurprised: 'Fcl_EYE_Surprised', mthSurprised: 'Fcl_MTH_Surprised' };
function registerRawFace(vrm, json) {
  // the morph names are only in the glTF (three.js keys the face's morphs '0'..'40'); the face primitives are the
  // visemes' own (Facebaked...), else every mesh with that many morphs
  const g = json.extensions?.VRM?.blendShapeMaster?.blendShapeGroups?.find((b) => b.presetName === 'a');
  const names = g && json.meshes[g.binds[0].mesh].primitives[0].extras?.targetNames;
  if (!names) return [];
  const em = vrm.expressionManager, prims = em.getExpression('aa')?.binds[0]?.primitives || [];
  if (!prims.length) vrm.scene.traverse((o) => { if (o.morphTargetInfluences?.length === names.length) prims.push(o); });
  const got = [];
  for (const [name, morph] of Object.entries(FACE_RAW)) {
    const index = names.findIndex((n) => n.endsWith(morph));
    if (index < 0 || !prims.length) continue;
    const e = new VRMExpression(name);
    e.addBind(new VRMExpressionMorphTargetBind({ primitives: prims, index, weight: 1 }));
    vrm.scene.add(e); em.registerExpression(e); got.push(name);
  }
  return got;
}
// dir.mouth = [open, wide, round] (lab sheets): fixed visemes on the same scale as performance.js visemesAt
const legacyMouth = ([open, wide = 0.2, round = 0]) => {
  const o = M.clamp(open) * 0.6;
  return { aa: o * M.clamp(1 - round - 0.6 * wide), oh: o * round * 0.75, ou: o * round * 0.5, ee: o * wide * 0.7, ih: o * wide * 0.5 };
};
const HEAD_H = 0.22;   // her head, chin to crown (m)

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
  vrm.humanoid.update(); vrm.scene.updateMatrixWorld(true);
  const wpos = (n) => new THREE.Vector3().setFromMatrixPosition(n.matrixWorld);
  const headY = wpos(vrm.humanoid.getRawBoneNode('head')).y;
  const eyeL = wpos(vrm.humanoid.getRawBoneNode('leftEye')), eyeR = wpos(vrm.humanoid.getRawBoneNode('rightEye'));
  const eyeY = eyeL.y, eyeX = Math.abs(eyeL.x - eyeR.x) / 2, eyeZ = (eyeL.z + eyeR.z) / 2;
  const K = headY / OLD_HEAD_Y;    // IK targets scale with her
  const acc = accessories(vrm, look, U, hidden);
  // root-relative position / rotation of a node: det > 0 even when she hangs under a mirrored group (the twin), so
  // every solve below gives the same pose upright and mirrored
  const _mi = new THREE.Matrix4(), _mr = new THREE.Matrix4(), _ms = new THREE.Vector3(), _rp = new THREE.Vector3(), _rq = new THREE.Quaternion();
  const rootRel = (n, outP = _rp, outQ = _rq) => { _mr.multiplyMatrices(_mi.copy(root.matrixWorld).invert(), n.matrixWorld).decompose(outP, outQ, _ms); return outP; };
  // arm rest geometry: limb lengths in root units (the targets' own), the rest basis in the model's own frame (where
  // normalized bones rest at identity)
  const armRest = {};
  for (const side of ['left', 'right']) {
    const loc = (n) => vrm.scene.worldToLocal(n.getWorldPosition(new THREE.Vector3()));
    const a = loc(nodes[side + 'UpperArm']), b = loc(nodes[side + 'LowerArm']);
    const dir0 = b.clone().sub(a).normalize();
    const axis0 = new THREE.Vector3(0, side === 'left' ? -1 : 1, 0); axis0.sub(dir0.clone().multiplyScalar(axis0.dot(dir0))).normalize();
    const [S, E, W] = ['UpperArm', 'LowerArm', 'Hand'].map((k) => rootRel(nodes[side + k]).clone());
    armRest[side] = { la: S.distanceTo(E), lb: E.distanceTo(W), B0inv: new THREE.Matrix4().makeBasis(dir0, axis0, dir0.clone().cross(axis0)).invert() };
  }
  // body frames: an IK target rides with her head, chest or hips as they move from rest (the T-pose here)
  const FRAMES = { head: nodes.head, chest: nodes.upperChest || nodes.chest, hips: nodes.hips };
  const frame = { root: { p: new THREE.Vector3(), d: new THREE.Quaternion(), p0: new THREE.Vector3() } };
  for (const [f, n] of Object.entries(FRAMES)) frame[f] = { p: new THREE.Vector3(), d: new THREE.Quaternion(), p0: rootRel(n).clone(), q0i: _rq.clone().invert() };
  // the torso bones and how far under the shoulders each one pivots (m)
  const TORSO = ['hips', 'spine', 'chest', 'upperChest'].filter((b) => nodes[b]);
  const shY = rootRel(nodes.leftUpperArm).y, LEVER = TORSO.map((b) => shY - rootRel(nodes[b]).y);
  // leg rest geometry in the MODEL frame (vrm.scene local: normalized bones rest at identity, nothing mirrored);
  // character-space directions, points and rotations convert into it
  const sc = vrm.scene.scale.x, qSc = vrm.scene.quaternion.clone(), qScI = qSc.clone().invert();
  const c2mV = (v) => v.applyQuaternion(qScI), c2mP = (v) => v.applyQuaternion(qScI).divideScalar(sc), cq2m = (q) => q.premultiply(qScI).multiply(qSc);
  const fwdM = c2mV(new THREE.Vector3(0, 0, 1)), legRest = {}, leg = {};
  for (const side of ['left', 'right']) {
    const oL = nodes[side + 'LowerLeg'].position.clone(), oF = nodes[side + 'Foot'].position.clone();
    const dL = oL.clone().normalize(), f0 = fwdM.clone().addScaledVector(dL, -fwdM.dot(dL)).normalize();
    const ankle = rootRel(nodes[side + 'Foot']).clone();
    const ball = nodes[side + 'Toes'] ? rootRel(nodes[side + 'Toes']).clone().sub(ankle) : new THREE.Vector3(0, -0.063, 0.108);
    const heel = new THREE.Vector3(0, 0.01 - ankle.y, -0.04);   // the back of the sole, from the ankle
    legRest[side] = { oU: nodes[side + 'UpperLeg'].position.clone(), la: oL.length(), lb: oF.length(), dF: oF.normalize(), ankle, ball, heel,
      B0inv: new THREE.Matrix4().makeBasis(dL, f0, dL.clone().cross(f0)).invert() };
    leg[side] = { A: new THREE.Vector3(), pole: new THREE.Vector3(), qF: new THREE.Quaternion(), qY: new THREE.Quaternion(), toe: 0 };
  }
  // the stance (character space): ankle x, ankle z from rest, toe-out; feet 12 cm apart, her left a touch forward
  const STANCE = { left: { x: 0.064, z: 0.025, yaw: 0.2 }, right: { x: -0.06, z: -0.012, yaw: -0.1 } };
  const mic = makeMic(U); nodes.rightHand.add(mic);
  mic.position.set(-0.055 * FX, -0.025, 0.0); mic.rotation.set(FX * Math.PI / 2, 0, 0);
  const springs = vrm.springBoneManager;
  const cons = vrm.nodeConstraintManager;
  springs?.setInitState();
  const em = vrm.expressionManager;
  // VRM 0 customs keep their own names (Shino: "Extra" = the > < squint). happy / sad / surprised (VRoid's open-mouthed
  // Joy / Sorrow / Surprised) are retired for the raw eye and mouth halves
  const EXPR = {};
  for (const n of ['aa', 'ih', 'ou', 'ee', 'oh', 'angry', 'relaxed', 'blink', 'blinkLeft', 'extra']) {
    const hit = [n, n[0].toUpperCase() + n.slice(1)].find((k) => em.getExpression(k));
    if (hit) EXPR[n] = hit;
  }
  for (const n of registerRawFace(vrm, gltf.parser.json)) EXPR[n] = n;
  const setX = (n, v) => { if (EXPR[n]) em.setValue(EXPR[n], v); };

  // two-bone arm IK in root space: local quaternions for upper + lower arm that put the wrist on T, elbow toward pole
  function solveArm(side, T, pole, outU, outL) {
    const up = nodes[side + 'UpperArm'], R = armRest[side];
    up.updateWorldMatrix(true, false);
    const S = rootRel(up, _v1);
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
    // root rotation of the bone = current basis * rest basis^-1 (rest basis in the bone's own rest frame)
    _m1.makeBasis(dir, n, dir.clone().cross(n)).multiply(R.B0inv);
    _q.setFromRotationMatrix(_m1);
    rootRel(up.parent, _v2, _q2);
    outU.copy(_q2.invert().multiply(_q));
    outL.setFromAxisAngle(_v1.set(0, side === 'left' ? -1 : 1, 0), beta);
  }
  // two-bone leg IK in the model frame: thigh, shin and foot local quaternions that put the ankle on A, the knee toward
  // pole and the foot at model-frame orientation qFoot
  const _lh = new THREE.Vector3(), _ld = new THREE.Vector3(), _lp = new THREE.Vector3(), _lk = new THREE.Vector3(), _lu = new THREE.Vector3(), _lf = new THREE.Vector3(), _lq = new THREE.Quaternion();
  function solveLeg(side, A, pole, qFoot, outU, outL, outF) {
    const R = legRest[side], qH = nodes.hips.quaternion;
    const H = _lh.copy(R.oU).applyQuaternion(qH).add(nodes.hips.position);
    const dir = _ld.copy(A).sub(H); let d = dir.length(); dir.divideScalar(d);
    const L = R.la + R.lb, ds = 0.995 * L;
    if (d > ds) d = ds + (L - ds) * (1 - Math.exp(-(d - ds) / (L - ds)));   // soft reach: no knee snap near straight
    d = Math.max(d, Math.abs(R.la - R.lb) + 1e-3);
    const x = (R.la * R.la - R.lb * R.lb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, R.la * R.la - x * x));
    const pp = _lp.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
    const Kn = _lk.copy(H).addScaledVector(dir, x).addScaledVector(pp, h);
    const dU = _lu.copy(Kn).sub(H).normalize(), fU = _lf.copy(pp).addScaledVector(dU, -pp.dot(dU)).normalize();
    _m1.makeBasis(dU, fU, dU.clone().cross(fU)).multiply(R.B0inv);
    _lq.setFromRotationMatrix(_m1);                                      // the thigh, model frame
    outU.copy(qH).invert().multiply(_lq);
    outL.setFromUnitVectors(R.dF, H.addScaledVector(dir, d).sub(Kn).normalize().applyQuaternion(_lq.invert()));
    outF.copy(_lq.invert()).multiply(outL).invert().multiply(qFoot);
  }
  const eul = (x, y, z) => _e.set(x * FX, y, z * FX, 'XYZ');
  const ZERO = [0, 0, 0], QI = new THREE.Quaternion(), _X = new THREE.Vector3(1, 0, 0), _Y = new THREE.Vector3(0, 1, 0);
  const qLU = new THREE.Quaternion(), qLL = new THREE.Quaternion(), qLF = new THREE.Quaternion(), qHU = new THREE.Quaternion(), qHL = new THREE.Quaternion(), _hq = new THREE.Quaternion();
  const _S = new THREE.Vector3(), _T = new THREE.Vector3(), _W = new THREE.Vector3(), _Eb = new THREE.Vector3(), _a = new THREE.Vector3(), _e2 = new THREE.Vector3(), _dS = new THREE.Vector3(), _eS = new THREE.Vector3();
  // planted feet: two-bone IK onto the stance, the free heel peeling up about the ball of the foot, knees over the
  // toes (a touch inward); on the walk each foot rolls heel to toe where it is down and swings through on an arc.
  // Blended in by ws so a crossfade to a pose with its own legs (sit, float) stays continuous
  function plantLegs(s, ws, dir) {
    for (const side of ['left', 'right']) {
      const R = legRest[side], L = leg[side], sg = side === 'left' ? 1 : -1;
      let st, th, lift = 0;
      if (dir.walk != null) {
        const p = dir.walk - (sg > 0 ? 0 : 0.5), sd = dir.stride ?? 1.2, f = stepAt(p - Math.floor(p), sd);
        st = { x: 0.045 * sg, z: 0.25 * sd + f.z, yaw: 0.08 * sg }; th = f.pitch; lift = f.lift; L.toe = f.toe;
      } else {
        const fr = M.clamp((M.clamp(-sg * s) - 0.25) / 0.75);
        st = { ...STANCE[side], ...dir.stance?.[side] }; th = L.toe = (dir.heel ?? 0.085) * fr * fr * (3 - 2 * fr);
      }
      const pv = th < 0 ? R.heel : R.ball;   // the foot rolls on its heel or on its ball, which stays put
      L.qY.setFromAxisAngle(_Y, st.yaw); L.qF.setFromAxisAngle(_X, th).premultiply(L.qY);
      c2mP(L.A.set(st.x, R.ankle.y + lift, R.ankle.z + st.z).add(_v1.copy(pv).applyQuaternion(L.qY)).sub(_v1.copy(pv).applyQuaternion(L.qF)));
      c2mV(L.pole.set(Math.sin(st.yaw * 0.5 - sg * 0.12), -0.05, Math.cos(st.yaw * 0.5 - sg * 0.12)));
      cq2m(L.qF);
    }
    // the knees never lock: a leg asked for more than 0.998 of its reach brings the hips down (a soft max) as far as it
    // must to reach (straight down: on the walk the feet are well ahead of and behind the hips)
    let ex = -1;
    for (const side of ['left', 'right']) {
      const R = legRest[side], H = _v1.copy(R.oU).applyQuaternion(nodes.hips.quaternion).add(nodes.hips.position).sub(leg[side].A);
      ex = Math.max(ex, H.y - Math.sqrt(Math.max(0, (0.998 * (R.la + R.lb)) ** 2 - H.x * H.x - H.z * H.z)));
    }
    nodes.hips.position.y -= 0.002 * Math.log1p(Math.exp(ex / 0.002)) * ws;
    for (const side of ['left', 'right']) {
      const L = leg[side];
      solveLeg(side, L.A, L.pole, L.qF, qLU, qLL, qLF);
      nodes[side + 'UpperLeg'].quaternion.slerp(qLU, ws); nodes[side + 'LowerLeg'].quaternion.slerp(qLL, ws); nodes[side + 'Foot'].quaternion.slerp(qLF, ws);
      nodes[side + 'Toes']?.quaternion.slerp(cq2m(_lq.setFromAxisAngle(_X, -L.toe)), ws);   // toes flat on the floor
    }
  }
  // the torso at (t, u, dir): summed pitch / roll of hips..upperChest (VRM1 frame), how far they and the hips' shift
  // carry the shoulders (character space), and the weight: what a hanging arm lags behind
  function torsoAt(t, u, dir) {
    const { ent } = weightsOf(dir.poses), { add, s } = addsAt(t, u, dir), o = { x: 0, z: 0, px: 0.036 * s, pz: 0, s };
    TORSO.forEach((b, i) => {
      let x = (add[b] || ZERO)[0] + (dir.bones?.[b] || ZERO)[0], z = (add[b] || ZERO)[2] + (dir.bones?.[b] || ZERO)[2];
      for (const [name, k] of ent) { const v = POSES[name]?.[b] || POSES.rest[b] || ZERO; x += v[0] * k; z += v[2] * k; }
      o.x += x; o.z += z; o.px -= LEVER[i] * z; o.pz += LEVER[i] * x;
    });
    return o;
  }
  const frameOf = (p, lr) => (typeof p.ik?.frame === 'string' ? p.ik.frame : p.ik?.frame?.[lr]) || 'root';
  const poleOf = (p, lr, out) => {   // authored for the right arm, mirrored for the left unless poleL is given
    const pl = p.ik?.[lr === 'l' ? 'poleL' : 'poleR'] || p.ik?.pole || [-0.5, -1, -0.45];
    return out.set(lr === 'l' && !p.ik?.poleL ? -pl[0] : pl[0], pl[1], pl[2]);
  };
  // a pose's FK arm (rest's where it has none), its world matrices brought up to date
  function fkArm(side, p) {
    const kU = side + 'UpperArm', kL = side + 'LowerArm', vu = p[kU] || POSES.rest[kU], vl = p[kL] || POSES.rest[kL];
    nodes[kU].quaternion.setFromEuler(eul(vu[0], vu[1], vu[2])); nodes[kL].quaternion.setFromEuler(eul(vl[0], vl[1], vl[2]));
    for (const k of [kU, kL, side + 'Hand']) nodes[k].updateWorldMatrix(false, false);
  }
  // unit vector acc slerped toward unit vector a by f (f may stray a little outside 0..1)
  const slerpV = (acc, a, f) => {
    const ang = Math.acos(M.clamp(acc.dot(a), -1, 1)), sn = Math.sin(ang);
    return sn < 1e-4 ? acc : acc.multiplyScalar(Math.sin((1 - f) * ang) / sn).addScaledVector(a, Math.sin(f * ang) / sn).normalize();
  };
  // pose at time t: blend of poses + the groove + planted legs + arms; every bone set (pure). at(t') is the direction
  // at another time: the hands follow the arms late and hanging arms lag the torso
  function applyPose(t, u, dir, at) {
    const { wn, ent, signed } = weightsOf(dir.poses), entH = weightsOf(at(t - 0.07).poses).ent;
    const { add, s, dip, ws, bob } = addsAt(t, u, dir);
    // 1. every bone but the arms: weighted euler blend (small angles) + groove + per-shot offsets; fingers on the
    // hands' late weights
    for (const b of BONES) {
      const n = nodes[b]; if (!n || ARM.has(b)) continue;
      let x = 0, y = 0, z = 0;
      for (const [name, k] of FINGER.test(b) ? entH : ent) {
        const v = POSES[name]?.[b] || POSES.rest[b] || ZERO;
        x += v[0] * k; y += v[1] * k; z += v[2] * k;
      }
      const d = add[b] || ZERO, o = dir.bones?.[b] || ZERO;
      n.quaternion.setFromEuler(eul(x + d[0] + o[0], y + d[1] + o[1], z + d[2] + o[2]));
    }
    // the hips over the standing leg, down on the dip and the walk's bob (character space); rise and the sit in model units
    nodes.hips.position.copy(hipsRest).add(c2mP(_v1.set(0.036 * s, bob - (0.002 + 0.006 * dip) * ws, 0)));
    nodes.hips.position.y += (dir.rise || 0) - (wn.sit || 0) * 0.42 * K;
    if (ws > 0) plantLegs(s, ws, dir);
    // 2. arms. Each pose's arm becomes a wrist target and an elbow direction in root space (FK poses by forward
    // kinematics, IK targets carried by their body frame). They blend as a direction from the shoulder (an arc: no
    // straight arm mid-move), a reach and an elbow hint, and solve once. Hands blend as root-space orientations, so a
    // held mic keeps its aim
    root.updateMatrixWorld(true);
    for (const [f, n] of Object.entries(FRAMES)) { const F = frame[f]; rootRel(n, F.p, F.d); F.d.multiply(F.q0i); }
    frame.head.d.slerp(QI, 0.15);   // a held mic follows 85% of her head's turn
    let lag = null;
    for (const side of ['left', 'right']) {
      const lr = side[0], sg = lr === 'l' ? 1 : -1, kU = side + 'UpperArm', kL = side + 'LowerArm', kH = side + 'Hand';
      const S = rootRel(nodes[kU], _S);
      let wAcc = 0, kSum = 0, kPos = 0, lSum = 0, lMin = 9, lMax = 0, hang = 0;
      _eS.set(0, 0, 0);
      for (const [name, k] of signed) {
        const p = POSES[name] || {}, ik = p.ik?.[lr] || (dir.ik?.[lr] && name === signed[0][0] ? dir.ik[lr] : null);
        if (ik) {
          const fr = frameOf(p, lr), F = frame[fr];
          _W.set(ik[0] * K, ik[1] * K, ik[2] * K).sub(F.p0).applyQuaternion(F.d).add(F.p);
          poleOf(p, lr, _Eb).applyQuaternion(frame[fr === 'hips' ? 'hips' : 'chest'].d);
        } else {
          fkArm(side, p); rootRel(nodes[kH], _W); rootRel(nodes[kL], _Eb).sub(S);
          hang += k * (p.still ? 0 : P.smoothstep(0.2, 0.3, S.y - _W.y));   // hanging below the shoulder
        }
        const len = _a.copy(_W).sub(S).length(); _a.divideScalar(len);
        _e2.copy(_Eb).addScaledVector(_a, -_Eb.dot(_a));
        if (_e2.lengthSq() < 1e-8) poleOf({}, lr, _e2).addScaledVector(_a, -_e2.dot(_a));
        if (wAcc <= 0) { _dS.copy(_a); wAcc = k; } else slerpV(_dS, _a, k / (wAcc += k));
        kSum += k; kPos += Math.max(0, k); lSum += Math.max(0, k) * len ** -4; lMin = Math.min(lMin, len); lMax = Math.max(lMax, len); _eS.addScaledVector(_e2.normalize(), k);
      }
      kSum = kSum || 1;
      // hands (and fingers, above) on the weights 0.07 s ago: each pose's hand in root space, from its own forearm
      // turned with its body frame; blended, then put under the final forearm
      _hq.set(0, 0, 0, 0);
      for (const [name, k] of entH) {
        const p = POSES[name] || {}, ik = p.ik?.[lr];
        if (ik) {
          solveArm(side, _W.set(ik[0] * K, ik[1] * K, ik[2] * K), poleOf(p, lr, _Eb), qHU, qHL);
          rootRel(nodes[kU].parent, _v1, _q2);
          _q.copy(frame[frameOf(p, lr)].d).multiply(_q2).multiply(qHU).multiply(qHL);
        } else { fkArm(side, p); rootRel(nodes[kL], _v1, _q); }
        const vh = p[kH] || POSES.rest[kH];
        _q.multiply(_q2.setFromEuler(eul(vh[0], vh[1], vh[2])));
        const kk = _hq.dot(_q) < 0 ? -k : k;
        _hq.set(_hq.x + _q.x * kk, _hq.y + _q.y * kk, _hq.z + _q.z * kk, _hq.w + _q.w * kk);
      }
      _hq.normalize();
      // the reach blends as a soft minimum of the unsigned weights, so a moving arm stays bent until it arrives (and
      // bends first on the way back); the direction may overshoot, the reach never
      const T = _T.copy(S).addScaledVector(_dS, M.clamp((lSum / kPos) ** -0.25, lMin, lMax));
      if (_eS.lengthSq() < 1e-6) poleOf({}, lr, _eS);
      // shoulder rhythm: the clavicle lifts once the arm rises past ~70 deg and rolls forward on a forward reach
      const dc = _a.copy(T).sub(S).normalize().applyQuaternion(_q.copy(frame.chest.d).invert());
      const raise = M.clamp(0.32 * (Math.acos(M.clamp(-dc.y, -1, 1)) - 1.2), 0, 0.28), fwd = M.clamp(0.18 * dc.z, 0, 0.1);
      if (raise > 0 || fwd > 0) nodes[side + 'Shoulder']?.quaternion.multiply(_q.setFromEuler(eul(0, -sg * fwd, sg * raise)));
      solveArm(side, T, _eS, nodes[kU].quaternion, nodes[kL].quaternion);
      nodes[kU].updateWorldMatrix(false, false); nodes[kL].updateWorldMatrix(false, false);
      rootRel(nodes[kL], _v1, _q); nodes[kH].quaternion.copy(_q.invert().multiply(_hq));
      // forearm roll: the forearm takes half the hand's twist about the arm, so the wrist never candy-wraps
      const hq = nodes[kH].quaternion, tw = Math.atan2(hq.w < 0 ? -hq.x : hq.x, Math.abs(hq.w));
      nodes[kL].quaternion.multiply(_q.setFromAxisAngle(_X, tw)); hq.premultiply(_q.invert());
      // hanging arms: they keep part of where the torso was 0.2 s ago (its tilt, and where it carried the shoulder),
      // hang plumb against the rest of the tilt, swing against the hips (on the walk, against the legs: the right arm
      // forward with the left foot, the elbow bending as it comes forward), open out over the standing hip (the skirt),
      // give at the elbow just after the dip and live a little (seeded noise)
      const hk = hang / kSum;
      if (hk > 0.001) {
        if (!lag) { const tl = t - 0.2; lag = [torsoAt(t, u, dir), torsoAt(tl, M.U(tl), at(tl))]; }
        const [now, was] = lag, n = lr === 'l' ? 0 : 1, sl = 0.6 * now.s + 0.4 * was.s;   // the weight ~0.08 s ago: the swing trails the sway ~0.14 s
        const sw = dir.walk != null ? 0.28 * ws * Math.cos(M.TAU * (dir.walk - 0.04)) : 0;
        const dz = 0.6 * was.z - now.z - (now.px - was.px) / 0.55 + 0.065 * sg * Math.max(0, sg * was.s) + 0.022 * M.noise1(t * 0.31, 40 + n);
        const dx = 0.6 * was.x - now.x + (now.pz - was.pz) / 0.55 + sg * (sw - 0.04 * sl) + 0.035 * M.noise1(t * 0.23, 42 + n);
        const pump = 0.08 * dipAt(u - 0.2, dir) + 0.25 * Math.max(0, -sg * sw) + 0.04 * M.noise1(t * 0.37, 44 + n);
        nodes[kU].quaternion.premultiply(_q.setFromEuler(eul(dx * hk, 0, dz * hk)));
        nodes[kL].quaternion.premultiply(_q.setFromAxisAngle(_v1.set(0, -sg, 0), pump * hk));
      }
      const ov = dir.bones?.[kU]; if (ov) nodes[kU].quaternion.multiply(_q.setFromEuler(eul(ov[0], ov[1], ov[2])));
    }
    let micW = 0; for (const [name, k] of ent) micW += (POSES[name]?.mic || 0) * k;
    mic.visible = (dir.mic ?? micW) > 0.5;
  }
  function settleWorld() {
    vrm.humanoid.update();
    vrm.scene.updateMatrixWorld(true);
    cons?.update();
  }
  // small in frame, the mouth opens a little more so she still reads as singing: as her head (from the head bone's
  // depth and the camera's fov) shrinks from 15% to 6% of the frame height, the mouth gain ramps from 1 to 1.25
  const _hw = new THREE.Vector3(), _cw = new THREE.Vector3();
  function framingGain(cam) {
    if (!cam?.isPerspectiveCamera) return 1;
    nodes.head.getWorldPosition(_hw).sub(_cw.setFromMatrixPosition(cam.matrixWorld));
    const depth = Math.max(0.05, _hw.dot(cam.getWorldDirection(_cw)));
    return M.lerp(1, 1.25, P.smoothstep(0.15, 0.06, (HEAD_H * cam.zoom) / (2 * depth * Math.tan((cam.fov * Math.PI) / 360))));
  }
  // a blink rides on a big move: a pose change, a turn of dir.head or a jump of the gaze target (lookAt on / off) starting
  // in the last 0.25 s. Onsets are found on a fixed 1/30 s grid, so every t sees the same ones
  const moved = (a, b) => {
    const wa = weightsOf(a.poses).wn, wb = weightsOf(b.poses).wn, ha = a.head || ZERO, hb = b.head || ZERO;
    let dw = 0; for (const n of new Set([...Object.keys(wa), ...Object.keys(wb)])) dw += Math.abs((wa[n] || 0) - (wb[n] || 0));
    return dw > 0.3 || Math.hypot(ha[0] - hb[0], ha[1] - hb[1], ha[2] - hb[2]) > 0.05 || !a.lookAt !== !b.lookAt;
  };
  function moveBlink(t, at) {
    if (at(t) === at(t - 1)) return 0;   // a fixed direction never moves
    const h = 1 / 30, j1 = Math.floor(t / h);
    let b = 0, was = null;
    for (let j = Math.floor((t - 0.25) / h) - 1; j <= j1; j++) {
      const m = moved(at(j * h), at(j * h - 0.1));
      if (m && was === false) b = Math.max(b, P.blinkShape(t - j * h));
      was = m;
    }
    return b;
  }
  // face at time t: visemes from performance.js, seeded blinks, moods as eye and mouth halves. Singing ("act") the eyes
  // smile softly and the mouth is left to the visemes; between lines the smile and the ^^ eyes come through
  function applyFace(t, d, at, cam) {
    // sing and moods step inside shots: averaged over the last 0.15 s, a step eases instead of popping the face
    let sing = 0; const mood = {};
    for (let k = 0; k < 8; k++) {
      const dk = k ? at(t - (k * 0.15) / 7) : d;
      sing += M.clamp(dk.sing ?? 1) / 8;
      for (const [m, v] of Object.entries(dk.mood || {})) mood[m] = (mood[m] || 0) + M.clamp(v) / 8;
    }
    for (const e of em.expressions) e.weight = 0;
    const vis = d.mouth ? legacyMouth(d.mouth) : P.visemesAt(t, sing * framingGain(cam) * (d.mouthGain ?? 1));
    if (!d.mouth) { const pt = sing * P.phraseAt(t).part; vis.aa = Math.max(vis.aa, 0.1 * pt); vis.ih = Math.max(vis.ih, 0.06 * pt); }   // lips part for the breath
    for (const k in vis) setX(k, vis[k]);
    const act = sing * P.activityAt(t), idle = 1 - act;
    const h = mood.happy || 0, r = mood.relaxed || 0, s = mood.sad || 0, su = mood.surprised || 0;
    const eyeJoy = h * ((0.45 + 0.15 * P.smoothstep(0.6, 0.8, h)) * act + 0.75 * idle);   // a big smile shows in the eyes while singing too
    setX('eyeJoy', eyeJoy);
    setX('mthFun', Math.min(1 - Math.min(0.8, r), 0.6 * h + 0.12 * idle * (1 - h) * (1 - s)));   // smile corners + a soft resting smile
    setX('mthJoy', 0.15 * P.smoothstep(0.5, 1, h) * idle);   // a parted happy mouth only between lines, only for big joy
    setX('relaxed', Math.min(0.8, r));                       // VRoid "Fun": a closed smile, soft lids
    setX('angry', mood.angry || 0);                          // closed, corners down (the twin's sneer)
    setX('extra', mood.extra || 0);
    setX('eyeSorrow', s); setX('mthSorrow', 0.4 * s * idle);
    setX('eyeSurprised', su); setX('mthSurprised', 0.3 * su * idle);
    setX('blink', M.clamp(d.blink ?? Math.max(P.blinkAt(t), moveBlink(t, at))) * (1 - Math.min(1, eyeJoy + 0.5 * su)));
    if (d.wink) setX('blinkLeft', M.clamp(d.wink) * (1 - eyeJoy));
    em.update();
  }
  // gaze: the camera (or dir.lookAt, root space) as her head sees it, turned into the eye bones' yaw / pitch the way
  // three-vrm's lookAt measures them, plus the seeded saccades and glances (performance.js; eye-turn degrees, x9 to the
  // range maps' 90-deg input). Root-relative, so the same mirrored; applied straight to the eyes (nothing else does)
  const headRaw = vrm.humanoid.getRawBoneNode('head'), lookOff = vrm.lookAt.offsetFromHeadBone.clone();
  const qHead0 = new THREE.Quaternion(); rootRel(headRaw, _v1, qHead0);
  const _gt = new THREE.Vector3(), _gq = new THREE.Quaternion();
  function applyLook(t, dir, cam) {
    const E = rootRel(headRaw, _v1, _gq).add(_v2.copy(lookOff).multiplyScalar(sc).applyQuaternion(_gq));
    if (dir.lookAt || cam) (dir.lookAt ? _gt.set(...dir.lookAt) : root.worldToLocal(cam.getWorldPosition(_gt))).sub(E).applyQuaternion(_gq.invert().premultiply(qHead0));
    else _gt.set(0, 0, 1);
    const [gx, gy] = P.gazeAt(t), deg = 180 / Math.PI;
    vrm.lookAt.applier.applyYawPitch(Math.atan2(_gt.x, _gt.z) * deg + 9 * gx, -Math.atan2(_gt.y, Math.hypot(_gt.x, _gt.z)) * deg + 9 * gy);
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
      applyPose(t0, M.U(t0), at(t0), at); settleWorld();
      springs.reset();
      for (let k = WARM - 1; k >= 0; k--) {
        const tk = t - k * DT;
        applyPose(tk, M.U(tk), k ? at(tk) : d, at); settleWorld();
        springs.update(DT);
      }
    } else {
      applyPose(t, u, d, at); settleWorld();
    }
    applyFace(t, d, at, cam);
    applyLook(t, d, cam);
    vrm.scene.updateMatrixWorld(true);
    return d;
  }
  // spring gravity: -1 normal, +1 when she hangs mirrored under the chamber floor (set by each set, every frame)
  const setGravity = (sgn) => { for (const j of springs?.joints || []) j.settings.gravityDir.set(0, sgn, 0); };
  return { vrm, root, U, update, headY, eyeY, eyeX, eyeZ, acc, look, mic, nodes, setGravity };
}
