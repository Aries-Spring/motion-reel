// gl.js: the 3-D half of a film (three.js). One WebGL renderer, shared environment light, an optional
// bloom chain, and the helpers a set needs. A set is a plain object:
//
//   { scene, camera, bloom?, bloomThreshold?, bloomRadius?, update(t, u, opts) }
//
// and renderSet(ctx, set, t, u, opts) calls set.update, renders, and draws the result onto the film's
// 2-D canvas, so 3-D and 2-D layers interleave in draw() in any order. update() must set EVERYTHING
// from (t, u, opts): no accumulated state, no clocks (see references/3d.md). Build sets once in init().
//
//   import * as G from './lib/gl.js';
//   M.film({ async init() { await G.initGL({ font: 'fonts/display.ttf' }); SET = mySet(); },
//            draw(ctx, u, t) { G.renderSet(ctx, SET, t, u, { ... }); M.text(ctx, ...); } });
//
// Setup: `npm i three opentype.js` in the project folder; scaffold.mjs --3d writes the import map.
// Render on the GPU (render.mjs does by default on macOS): software WebGL is ~80x slower.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as M from './motion.js';

export { THREE };
export let R = null, ENV = null, FONT = null;
let composer = null, renderPass = null, bloomPass = null;

// font: a TTF/OTF in the film folder, for 3-D type in the display face (needs opentype.js)
export async function initGL({ font = null, exposure = 1.0 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = M.W; cv.height = M.H;
  // preserveDrawingBuffer: the WebGL canvas is read back into the 2-D canvas after every render
  R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  R.setPixelRatio(1);
  R.setSize(M.W, M.H, false);
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.toneMapping = THREE.ACESFilmicToneMapping;
  R.toneMappingExposure = exposure;
  R.shadowMap.enabled = true;
  R.shadowMap.type = THREE.PCFShadowMap;
  ENV = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), 0.04).texture;
  // bloom: sets with bloom > 0 render opaque through it; the rest render with a transparent clear
  composer = new EffectComposer(R, new THREE.WebGLRenderTarget(M.W, M.H, { type: THREE.HalfFloatType, samples: 4 }));
  renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  bloomPass = new UnrealBloomPass(new THREE.Vector2(M.W, M.H), 0.5, 0.5, 0.85);
  composer.addPass(renderPass); composer.addPass(bloomPass); composer.addPass(new OutputPass());
  if (font) {
    const [{ TTFLoader }, { Font }, tg] = await Promise.all([import('three/addons/loaders/TTFLoader.js'),
      import('three/addons/loaders/FontLoader.js'), import('three/addons/geometries/TextGeometry.js')]);
    FONT = new Font(await new Promise((res, rej) => new TTFLoader().load(font, res, undefined, rej)));
    TextGeometry = tg.TextGeometry;
  }
}

// update the set, render it, composite onto ctx (honours ctx's transform; opts.alpha / opts.blend)
export function renderSet(ctx, set, t, u, opts = {}) {
  set.update(t, u, opts);
  if (set.bloom) {
    renderPass.scene = set.scene; renderPass.camera = set.camera;
    bloomPass.strength = set.bloom; bloomPass.radius = set.bloomRadius ?? 0.5; bloomPass.threshold = set.bloomThreshold ?? 0.85;
    R.setClearColor(0x000000, 1);
    composer.render();
  } else {
    R.setClearColor(0x000000, 0);
    R.render(set.scene, set.camera);
  }
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  if (opts.blend) ctx.globalCompositeOperation = opts.blend;
  ctx.drawImage(R.domElement, 0, 0);
  ctx.restore();
}

export const camera = (fov = 35, near = 0.1, far = 400) => new THREE.PerspectiveCamera(fov, M.W / M.H, near, far);
// place a camera; roll in radians about the view axis
export function lookFrom(cam, [x, y, z], [tx, ty, tz], roll = 0) {
  cam.position.set(x, y, z);
  cam.up.set(Math.sin(roll), Math.cos(roll), 0);
  cam.lookAt(tx, ty, tz);
}
// a dolly-zoom (vertigo): keep a subject at distance d0 the same size while the camera sits at d
export const dollyFov = (fov0, d0, d) => (2 * Math.atan(Math.tan((fov0 * Math.PI) / 360) * (d0 / d)) * 180) / Math.PI;

export function keyLights(scene, { key = 2.6, rim = 2.2, fill = 0.4, keyPos = [-4, 6, 6], rimPos = [5, 3, -6], keyColor = 0xfff4ea, rimColor = 0xffd2bc } = {}) {
  const k = new THREE.DirectionalLight(keyColor, key); k.position.set(...keyPos); scene.add(k);
  const r = new THREE.DirectionalLight(rimColor, rim); r.position.set(...rimPos); scene.add(r);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1410, fill));
  return { key: k, rim: r };
}

// 3-D type in the display face, centred on its bounding box (cached); needs initGL({ font })
const textCache = new Map();
let TextGeometry = null;
export function text3D(str, size = 1, depth = 0.25, bevel = 0.03, curve = 6) {
  if (!FONT || !TextGeometry) throw new Error('text3D: pass initGL({ font: "fonts/display.ttf" })');
  const key = `${str}|${size}|${depth}|${bevel}|${curve}`;
  if (textCache.has(key)) return textCache.get(key);
  const g = new TextGeometry(str, { font: FONT, size, depth, curveSegments: curve, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: 3 });
  g.computeBoundingBox();
  const b = g.boundingBox;
  g.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -(b.max.z + b.min.z) / 2);
  textCache.set(key, g);
  return g;
}
// one mesh per glyph, laid out like the string (so each letter can fly in on its own spring)
export function glyphs3D(str, size, depth, material, bevel = 0.03) {
  const group = new THREE.Group();
  const adv = [...str].map((ch) => (ch === ' ' ? size * 0.35 : FONT.data.glyphs[ch] ? (FONT.data.glyphs[ch].ha * size) / FONT.data.resolution : size * 0.6));
  const total = adv.reduce((a, b) => a + b, 0);
  let x = -total / 2;
  const glyphs = [];
  [...str].forEach((ch, i) => {
    if (ch !== ' ') {
      const m = new THREE.Mesh(text3D(ch, size, depth, bevel), material);
      m.userData.home = new THREE.Vector3(x + adv[i] / 2, 0, 0);
      m.position.copy(m.userData.home);
      group.add(m); glyphs.push(m);
    }
    x += adv[i];
  });
  return { group, glyphs, width: total };
}

// 2-D drawn into a texture each frame (a character card, a screen, a sign): tex.draw((c, w, h) => {...})
export function canvasTexture(w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.draw = (fn) => { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); fn(c, w, h); tex.needsUpdate = true; };
  tex.ctx = c; tex.cv = cv;
  return tex;
}
// canvas pixels are sRGB; a ShaderMaterial attribute or uniform colour must be linear
export const srgbToLinear = (v255) => (v255 / 255) ** 2.2;

// A 2-D figure standing in a 3-D set: a card that always faces the camera, plus the angle the camera
// sees it from, so the drawing can turn its head/body by that much. A billboard alone, seen while the
// camera orbits, reads as a cardboard cut-out; turning the drawing with the view reads as a figure.
export function billboard(mesh, cam) { mesh.lookAt(cam.position.x, mesh.position.y, cam.position.z); }
export const viewYaw = (camPos, objPos) => Math.atan2(camPos[0] - objPos[0], camPos[2] - objPos[2]);
