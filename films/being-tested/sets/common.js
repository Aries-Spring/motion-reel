// common.js: helpers shared by this film's 3-D sets (all pure functions of time).
import * as THREE from 'three';
import * as G from '../lib/gl.js';
import * as M from '../lib/motion.js';

export const C = {
  ink: '#141413', slate: '#2B2A27', slate2: '#3D3D3A', paper: '#F0EEE6', ivory: '#FAF9F5', oat: '#E3DACC',
  clay: '#D97757', clayHot: '#E8562C', kraft: '#D4A27F', cloud: '#B8B5AA',
};
export const col = (h) => new THREE.Color(h);

// Lights for the singer in any set; update() sets them every frame from a spec.
export function singerLights(scene) {
  const key = new THREE.DirectionalLight(0xfff1e6, 2.2);
  const rim = new THREE.DirectionalLight(col(C.clay), 0.0);
  const hemi = new THREE.HemisphereLight(0xfff4ec, 0x6a4a40, 0.9);
  const tk = new THREE.Object3D(); scene.add(tk); key.target = tk; rim.target = tk;
  scene.add(key, rim, hemi);
  return {
    key, rim, hemi,
    // az/el in radians around the subject at `at`
    set({ key: k = 2.2, keyColor = 0xfff1e6, az = -0.6, el = 0.7, rim: r = 0, rimColor = C.clay, rimAz = 2.6, rimEl = 0.4, hemi: h = 0.9, sky = 0xfff4ec, ground = 0x6a4a40, at = [0, 1.2, 0] } = {}) {
      tk.position.set(...at); tk.updateMatrixWorld();
      key.intensity = k; key.color.set(keyColor);
      key.position.set(at[0] + Math.sin(az) * Math.cos(el) * 5, at[1] + Math.sin(el) * 5, at[2] + Math.cos(az) * Math.cos(el) * 5);
      rim.intensity = r; rim.color.set(rimColor);
      rim.position.set(at[0] + Math.sin(rimAz) * Math.cos(rimEl) * 5, at[1] + Math.sin(rimEl) * 5, at[2] + Math.cos(rimAz) * Math.cos(rimEl) * 5);
      hemi.intensity = h; hemi.color.set(sky); hemi.groundColor.set(ground);
    },
  };
}

// camera from a spec { pos, at, fov, roll }
export function placeCam(cam, { pos = [0, 1.3, 3], at = [0, 1.2, 0], fov = 30, roll = 0 } = {}) {
  if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  G.lookFrom(cam, pos, at, roll);
  cam.updateMatrixWorld();
}
// orbit helper: a point at radius r around `at`, azimuth az (0 = +z, in front of her), height y
export const orbit = (at, r, az, y) => [at[0] + Math.sin(az) * r, y, at[2] + Math.cos(az) * r];

// a canvas texture drawn once
export function paintTex(w, h, fn, { repeat = false, srgb = true } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  fn(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
export const basic = (o) => new THREE.MeshBasicMaterial(o);

// an instanced set of quads with per-instance atlas cells (a word-card atlas, glyph atlas...)
// cells: atlas grid cols x rows. Each instance gets aCell (index) and aTint (rgb multiply).
export function atlasQuads(n, tex, cols, rows, { transparent = true, additive = false, depthWrite = false, side = THREE.DoubleSide, opacity = 1 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const cell = new Float32Array(n), tint = new Float32Array(n * 3).fill(1), alpha = new Float32Array(n).fill(1);
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 1));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent, depthWrite, side, opacity, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aCell; attribute vec3 aTint; attribute float aAlpha; varying vec3 vTint; varying float vAlpha;\n' +
      sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vec2 cc = vec2(mod(aCell, ${cols}.0), floor(aCell / ${cols}.0));
      vMapUv = (vec2(uv.x, uv.y) + vec2(cc.x, ${rows - 1}.0 - cc.y)) / vec2(${cols}.0, ${rows}.0);
      vTint = aTint; vAlpha = aAlpha;`);
    sh.fragmentShader = 'varying vec3 vTint; varying float vAlpha;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
      'diffuseColor.rgb *= vTint; diffuseColor.a *= vAlpha; outgoingLight = diffuseColor.rgb;\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => `atlas-${cols}x${rows}`;
  mat.toneMapped = false;
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  mesh.userData = { cell, tint, alpha };
  mesh.setCell = (i, c) => { cell[i] = c; };
  mesh.setTint = (i, r, g, b) => { tint[i * 3] = r; tint[i * 3 + 1] = g; tint[i * 3 + 2] = b; };
  mesh.setAlpha = (i, a) => { alpha[i] = a; };
  mesh.flush = () => {
    geo.attributes.aCell.needsUpdate = true; geo.attributes.aTint.needsUpdate = true; geo.attributes.aAlpha.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
  };
  return mesh;
}
const _o = new THREE.Object3D();
export function setInst(mesh, i, pos, rot = [0, 0, 0], scl = [1, 1, 1]) {
  _o.position.set(pos[0], pos[1], pos[2]); _o.rotation.set(rot[0], rot[1], rot[2]); _o.scale.set(scl[0], scl[1], scl[2]);
  _o.updateMatrix(); mesh.setMatrixAt(i, _o.matrix);
}
export function setInstQ(mesh, i, pos, quat, scl) {
  _o.position.set(pos[0], pos[1], pos[2]); _o.quaternion.copy(quat); _o.scale.set(scl[0], scl[1], scl[2]);
  _o.updateMatrix(); mesh.setMatrixAt(i, _o.matrix);
}

// project a world point to frame pixels (for 2-D labels tied to 3-D)
const _p = new THREE.Vector3();
export function toScreen(cam, x, y, z) {
  _p.set(x, y, z).project(cam);
  return { x: (_p.x * 0.5 + 0.5) * M.W, y: (-_p.y * 0.5 + 0.5) * M.H, z: _p.z, behind: _p.z > 1 };
}

// rounded-rect path for atlases
export function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
