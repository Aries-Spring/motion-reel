// ps1.js: a 1997 console in three.js. Every set renders into a tiny buffer (384x216 for 16x9), with
// vertex snapping to that pixel grid, affine (non perspective-correct) texture mapping, per-vertex
// lighting and fog, and 15-bit colour with a 4x4 Bayer dither. present() upscales it 5x with
// nearest-neighbour onto the film's 2-D canvas, after an optional low-res chroma bleed.
//
// Everything a set animates is set in its update(t, u, o) from time alone (see references/3d.md).
import * as THREE from 'three';
import * as M from './motion.js';

export { THREE };
const { FORMAT } = M;
export const LW = FORMAT.portrait ? 216 : FORMAT.square ? 216 : 384;
export const LH = FORMAT.portrait ? 384 : 216;
export let R = null;
let low = null, lowCtx = null;

// shared uniforms: lights, fog, warp, grade. A set writes them in its update().
export const U = {
  uRes: { value: new THREE.Vector2(LW, LH) },
  uSnap: { value: 1.0 },
  uAmb: { value: new THREE.Color(0.1, 0.1, 0.12) },
  uDirDir: { value: new THREE.Vector3(0.3, -1, 0.2).normalize() },
  uDirCol: { value: new THREE.Color(0.2, 0.22, 0.3) },
  uPLP: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(0, -999, 0)) },
  uPLC: { value: [0, 1, 2, 3].map(() => new THREE.Color(0, 0, 0)) },
  uPLR: { value: [1, 1, 1, 1] },
  uFogCol: { value: new THREE.Color(0.08, 0.09, 0.12) },
  uFogNear: { value: 4 },
  uFogFar: { value: 40 },
  uWarp: { value: 0 },
  uTime: { value: 0 },
  uWind: { value: 0 },
  uTint: { value: new THREE.Color(1, 1, 1) },
  uLevels: { value: 31 },
  uDither: { value: 1.0 },
};

const VERT = /* glsl */`
uniform vec2 uRes; uniform float uSnap;
uniform vec3 uAmb, uDirDir, uDirCol;
uniform vec3 uPLP[4]; uniform vec3 uPLC[4]; uniform float uPLR[4];
uniform float uFogNear, uFogFar, uFog, uLit, uWarp, uTime, uWind, uSway, uWarpK;
uniform vec4 uUvT;
varying vec3 vUvw; varying vec3 vLight; varying float vFogF;
void main() {
  mat4 mm = modelMatrix;
  #ifdef USE_INSTANCING
  mm = modelMatrix * instanceMatrix;
  #endif
  vec4 wp = mm * vec4(position, 1.0);
  float sw = uWind * uSway * max(position.y, 0.0);
  wp.x += sw * sin(uTime * 1.7 + wp.x * 0.7 + wp.z * 0.45);
  wp.z += sw * 0.6 * sin(uTime * 1.3 + wp.z * 0.9 + wp.x * 0.2);
  float wk = uWarp * uWarpK;
  if (wk > 0.0) {
    vec3 q = wp.xyz;
    wp.xyz += wk * vec3(sin(q.y * 2.1 + uTime * 1.9) * 0.6 + sin(q.z * 1.3 + uTime * 1.1) * 0.4,
                        sin(q.x * 1.7 + uTime * 1.3) * 0.35 + sin(q.z * 2.3 - uTime * 0.9) * 0.2,
                        sin(q.y * 1.5 + uTime * 2.3) * 0.6 + sin(q.x * 0.9 + uTime * 0.8) * 0.4);
  }
  vec4 vp = viewMatrix * wp;
  vec4 cp = projectionMatrix * vp;
  if (uSnap > 0.0 && cp.w > 0.0) {
    vec2 g = uRes * 0.5 / uSnap;
    cp.xy = floor(cp.xy / cp.w * g + 0.5) / g * cp.w;
  }
  gl_Position = cp;
  vUvw = vec3((uv * uUvT.xy + uUvT.zw) * cp.w, cp.w);
  vec3 n = normalize(mat3(mm) * normal);
  vec3 L = uAmb + uDirCol * max(dot(n, -uDirDir), 0.0);
  for (int i = 0; i < 4; i++) {
    vec3 d = uPLP[i] - wp.xyz;
    float dist = length(d);
    float att = clamp(1.0 - dist / max(uPLR[i], 0.001), 0.0, 1.0);
    L += uPLC[i] * att * att * (0.3 + 0.7 * max(dot(n, d / max(dist, 1e-4)), 0.0));
  }
  vLight = mix(vec3(1.0), L, uLit);
  #ifdef USE_COLOR
  vLight *= color;
  #endif
  vFogF = uFog * clamp((-vp.z - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
}`;

const FRAG = /* glsl */`
uniform sampler2D map; uniform float uUseMap, uOpacity, uAlphaTest, uLevels, uDither;
uniform vec3 uColor, uEmissive, uFogCol, uTint;
varying vec3 vUvw; varying vec3 vLight; varying float vFogF;
float bayer(vec2 p) {
  int i = int(mod(p.x, 4.0)) + int(mod(p.y, 4.0)) * 4;
  float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return m[i] / 16.0;
}
void main() {
  vec2 uv = vUvw.xy / vUvw.z;
  vec4 tx = uUseMap > 0.5 ? texture2D(map, uv) : vec4(1.0);
  if (tx.a < uAlphaTest) discard;
  vec3 c = tx.rgb * uColor * vLight + uEmissive * tx.rgb;
  c = mix(c, uFogCol, vFogF) * uTint;
  float b = bayer(gl_FragCoord.xy) - 0.5;
  c = floor(clamp(c, 0.0, 1.0) * uLevels + 0.5 + b * uDither) / uLevels;
  gl_FragColor = vec4(c, tx.a * uOpacity);
}`;

const col = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));
// A PS1 material. lit 0 = unlit (emissive things), fog 0 = sky/moon, sway = wind response, warp = how
// much the breathing-room warp moves it.
export function mat({ map = null, color = 0xffffff, emissive = 0x000000, fog = 1, lit = 1, side = THREE.FrontSide,
  vertexColors = false, transparent = false, opacity = 1, alphaTest = 0.5, sway = 0, warp = 1, depthWrite = true } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      map: { value: map }, uUseMap: { value: map ? 1 : 0 }, uColor: { value: col(color) }, uEmissive: { value: col(emissive) },
      uFog: { value: fog }, uLit: { value: lit }, uOpacity: { value: opacity }, uAlphaTest: { value: map ? alphaTest : 0 },
      uSway: { value: sway }, uWarpK: { value: warp }, uUvT: { value: new THREE.Vector4(1, 1, 0, 0) },
    },
    vertexShader: VERT, fragmentShader: FRAG, side, vertexColors, transparent, depthWrite,
  });
  return m;
}

// ---------------------------------------------------------------- textures drawn in code

export function tex(w, h, draw, { repeat = [1, 1] } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  draw(c, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.NoColorSpace;
  t.cv = cv; t.ctx = c;
  return t;
}
// seeded per-pixel noise speckle in a palette
export function speckle(c, w, h, cols, seed, amt = 1) {
  const rnd = M.mulberry32(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rnd() > amt) continue;
    c.fillStyle = cols[Math.floor(rnd() * cols.length)];
    c.fillRect(x, y, 1, 1);
  }
}

// ---------------------------------------------------------------- geometry helpers
// UVs scaled so a texture tiles at `tile` world units (affine warp shows best on big faces)
export function uvScale(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}
// A box tessellated every `seg` world units (per-vertex light needs vertices near the light, as on the
// real hardware) with planar UVs from the world-size faces, tiling every `tile` units.
export function boxUV(w, h, d, tile = 1, seg = 0.55) {
  const n = (v) => Math.max(1, Math.min(24, Math.round(v / seg)));
  const g = new THREE.BoxGeometry(w, h, d, n(w), n(h), n(d));
  const p = g.attributes.position, nn = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(nn.getX(i)), ay = Math.abs(nn.getY(i)), az = Math.abs(nn.getZ(i));
    let a, b;
    if (ax >= ay && ax >= az) { a = -p.getZ(i) * Math.sign(nn.getX(i)); b = p.getY(i); }
    else if (ay >= az) { a = p.getX(i); b = p.getZ(i); }
    else { a = p.getX(i) * Math.sign(nn.getZ(i)); b = p.getY(i); }
    uv.setXY(i, a / tile + 0.5, b / tile + 0.5);
  }
  return g;
}
// a tessellated plane (same reason), uv tiled su x sv times
export function plane(w, h, su = 1, sv = 1, seg = 0.6) {
  const g = new THREE.PlaneGeometry(w, h, Math.max(1, Math.min(48, Math.round(w / seg))), Math.max(1, Math.min(48, Math.round(h / seg))));
  return uvScale(g, su, sv);
}
export function mesh(g, m, [x, y, z] = [0, 0, 0], parent = null) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  if (parent) parent.add(o);
  return o;
}
// vertex colours from a function of the vertex position
export function paint(g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, gg, b] = fn(p.getX(i), p.getY(i), p.getZ(i), i);
    c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

export const camera = (fov = 50, near = 0.05, far = 300) => new THREE.PerspectiveCamera(pfov(fov), LW / LH, near, far);
// portrait frames see more height: widen the vertical fov so the subject still fits across
export const pfov = (v) => (FORMAT.portrait ? Math.min((2 * Math.atan(Math.tan((v * Math.PI) / 360) * 1.55) * 180) / Math.PI, 100) : v);
export function look(cam, [x, y, z], [tx, ty, tz], roll = 0, fov = null) {
  cam.position.set(x, y, z);
  cam.up.set(Math.sin(roll), Math.cos(roll), 0);
  cam.lookAt(tx, ty, tz);
  if (fov) { cam.fov = pfov(fov); cam.updateProjectionMatrix(); }
}
// world point -> film pixel (for 2-D glows and labels pinned to 3-D things)
const _v = new THREE.Vector3();
export function project(cam, [x, y, z]) {
  _v.set(x, y, z).project(cam);
  return { x: (_v.x * 0.5 + 0.5) * M.W, y: (-_v.y * 0.5 + 0.5) * M.H, behind: _v.z > 1 };
}

export function lights({ amb = [0.1, 0.1, 0.12], dir = [0.3, -1, 0.2], dirCol = [0.2, 0.22, 0.3], points = [], fog = [0.08, 0.09, 0.12], near = 4, far = 40 } = {}) {
  U.uAmb.value.setRGB(...amb);
  U.uDirDir.value.set(...dir).normalize();
  U.uDirCol.value.setRGB(...dirCol);
  for (let i = 0; i < 4; i++) {
    const p = points[i];
    if (p) { U.uPLP.value[i].set(...p.pos); U.uPLC.value[i].setRGB(...p.col); U.uPLR.value[i] = p.r; }
    else { U.uPLP.value[i].set(0, -999, 0); U.uPLC.value[i].setRGB(0, 0, 0); U.uPLR.value[i] = 1; }
  }
  U.uFogCol.value.setRGB(...fog);
  U.uFogNear.value = near; U.uFogFar.value = far;
}

export function initPS1() {
  const cv = document.createElement('canvas');
  cv.width = LW; cv.height = LH;
  R = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  R.setPixelRatio(1);
  R.setSize(LW, LH, false);
  R.outputColorSpace = THREE.LinearSRGBColorSpace;
  R.toneMapping = THREE.NoToneMapping;
  R.setClearColor(0x000000, 1);
  low = document.createElement('canvas');
  low.width = LW; low.height = LH;
  lowCtx = low.getContext('2d', { willReadFrequently: true });
}

// render a set into the low-res buffer (no present)
export function renderSet(set, t, u, o = {}) {
  U.uTime.value = t;
  U.uTint.value.setRGB(1, 1, 1);
  U.uWarp.value = 0; U.uWind.value = 0; U.uSnap.value = 1;
  set.update(t, u, o);
  R.render(set.scene, set.camera);
  return set;
}

// Copy the low buffer onto the film canvas, 5x, nearest. bleed = chroma offset in low pixels
// (red left, blue right), tear = [[y0, y1, dx], ...] rows shifted in low pixels (VHS tracking).
export function present(ctx, { bleed = 0, tear = null, alpha = 1, x = 0, y = 0, s = 1 } = {}) {
  let src = R.domElement;
  if (bleed || tear) {
    lowCtx.globalCompositeOperation = 'copy';
    lowCtx.drawImage(R.domElement, 0, 0);
    lowCtx.globalCompositeOperation = 'source-over';
    const img = lowCtx.getImageData(0, 0, LW, LH), d = img.data, s0 = new Uint8ClampedArray(d);
    const b = Math.round(bleed);
    for (let yy = 0; yy < LH; yy++) {
      let dx = 0;
      if (tear) for (const [a, z, k] of tear) if (yy >= a && yy < z) dx += k;
      for (let xx = 0; xx < LW; xx++) {
        const i = (yy * LW + xx) * 4;
        const xr = Math.min(LW - 1, Math.max(0, xx - dx + b)), xg = Math.min(LW - 1, Math.max(0, xx - dx)), xb = Math.min(LW - 1, Math.max(0, xx - dx - b));
        const row = yy * LW;
        d[i] = s0[(row + xr) * 4]; d[i + 1] = s0[(row + xg) * 4 + 1]; d[i + 2] = s0[(row + xb) * 4 + 2];
      }
    }
    lowCtx.putImageData(img, 0, 0);
    src = low;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  if (s !== 1) { ctx.translate(M.W / 2, M.H / 2); ctx.scale(s, s); ctx.translate(-M.W / 2, -M.H / 2); }
  ctx.drawImage(src, x, y, M.W, M.H);
  ctx.restore();
}
