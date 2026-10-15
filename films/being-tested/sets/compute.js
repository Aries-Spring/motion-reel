// compute.js: two bridge/finale sets.
//   racksSet   "bitter lesson, just add compute": an endless datacenter aisle of racks with clay LEDs;
//              on "add compute" parallel aisles appear left and right (the room multiplies).
//   pointsSet  "a hundred thousand reasons": 100,000 points (sampled once from a render of her face)
//              fly in from a cloud and settle into her portrait.
import * as THREE from 'three';
import * as G from '../lib/gl.js';
import * as M from '../lib/motion.js';
import { singerLights, placeCam, paintTex, setInst, C, col } from './common.js';

function rackTexture() {
  return paintTex(256, 1024, (c, w, h) => {
    c.fillStyle = '#1A1918'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const y = 12 + i * 25;
      c.fillStyle = '#262422'; c.fillRect(10, y, w - 20, 20);
      c.fillStyle = '#0E0D0C'; for (let k = 0; k < 10; k++) c.fillRect(20 + k * 14, y + 6, 8, 8);
    }
  });
}
export function racksSet() {
  const scene = new THREE.Scene(), cam = G.camera(40, 0.05, 200);
  scene.fog = new THREE.Fog(0x0b0a09, 8, 70);
  const NR = 2 * 34, AISLES = 5;
  const rackMat = new THREE.MeshBasicMaterial({ map: rackTexture() }); rackMat.toneMapped = false;
  const racks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 2.4, 1.1), rackMat, NR * AISLES);
  scene.add(racks);
  const NL = NR * AISLES * 12;
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }); ledMat.toneMapped = false;
  const leds = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.035, 0.035), ledMat, NL);
  leds.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NL * 3), 3);
  scene.add(leds);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 200), new THREE.MeshBasicMaterial({ color: col('#121110') }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = -60; scene.add(floor);
  const stripMat = new THREE.MeshBasicMaterial({ color: col(C.clay) }); stripMat.toneMapped = false;
  const strips = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 200), stripMat, AISLES);
  scene.add(strips);
  const _c = new THREE.Color(), hot = col('#FF8A5C'), dim = col('#3a2018'), ivory = col('#F3EEE3');
  return {
    scene, camera: cam,
    // o: cam, aisles (how many parallel aisles are visible, 1..5, float), blink speed
    update(t, u, o = {}) {
      placeCam(cam, o.cam);
      const na = o.aisles ?? 1;
      let li = 0;
      for (let a = 0; a < AISLES; a++) {
        const ax = [0, -4.2, 4.2, -8.4, 8.4][a], vis = M.clamp(na - a);
        const rise = M.E.outBack(vis, 1.2);
        setInst(strips, a, [ax, 0.005, -60], [-Math.PI / 2, 0, 0], [vis > 0 ? 1 : 0, 1, 1]);
        for (let i = 0; i < NR; i++) {
          const side = i % 2 ? 1 : -1, z = -Math.floor(i / 2) * 1.2 - 1;
          const idx = a * NR + i;
          const y = 1.2 - (1 - rise) * 2.6;
          setInst(racks, idx, [ax + side * 1.25, y, z], [0, 0, 0], vis > 0 ? [1, 1, 1] : [0, 0, 0]);
          for (let k = 0; k < 12; k++, li++) {
            const ly = 0.2 + k * 0.18 + y - 1.2;
            setInst(leds, li, [ax + side * 1.25 - side * 0.352, ly, z + (k % 3 - 1) * 0.3], [0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0], vis > 0 ? [1, 1, 1] : [0, 0, 0]);
            const on = M.hash01(li + Math.floor(t * (o.blink ?? 7) + li * 0.13), 9) > 0.55;
            _c.copy(dim).lerp(k % 5 === 0 ? ivory : hot, on ? 1 : 0.15);
            leds.setColorAt(li, _c);
          }
        }
      }
      racks.instanceMatrix.needsUpdate = true; leds.instanceMatrix.needsUpdate = true; leds.instanceColor.needsUpdate = true; strips.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- 100k points portrait
export function pointsSet(N = 100000) {
  const scene = new THREE.Scene(), cam = G.camera(30, 0.05, 200);
  const geo = new THREE.BufferGeometry();
  const start = new Float32Array(N * 3), end = new Float32Array(N * 3), colr = new Float32Array(N * 3), seed = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(end, 3));
  geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colr, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uK: { value: 0 }, uT: { value: 0 }, uSize: { value: 2.2 }, uGain: { value: 1 } },
    vertexShader: `attribute vec3 aStart; attribute vec3 aColor; attribute float aSeed; uniform float uK; uniform float uT; uniform float uSize; varying vec3 vC;
      void main() {
        float k = clamp(uK * 1.35 - aSeed * 0.35, 0.0, 1.0); k = k * k * (3.0 - 2.0 * k);
        vec3 p = mix(aStart, position, k);
        p += (1.0 - k) * vec3(sin(uT * 0.7 + aSeed * 40.0), cos(uT * 0.6 + aSeed * 31.0), 0.0) * 0.3;
        vC = aColor;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (6.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec3 vC; uniform float uGain; void main() { vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(vC * uGain, 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  return {
    scene, camera: cam, N,
    // sample a portrait (any canvas) into the target positions + colours (once, at init)
    setPortrait(cv) {
      const c = cv.getContext('2d', { willReadFrequently: true }), w = cv.width, h = cv.height;
      const d = c.getImageData(0, 0, w, h).data, R = M.mulberry32(77);
      let n = 0, guard = 0;
      while (n < N && guard++ < N * 60) {
        const x = Math.floor(R() * w), y = Math.floor(R() * h), i = (y * w + x) * 4;
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 765, a = d[i + 3] / 255;
        if (a < 0.5 || R() > 0.15 + 0.85 * lum) continue;
        end[n * 3] = (x / w - 0.5) * 3.2 * (w / h); end[n * 3 + 1] = (0.5 - y / h) * 3.2; end[n * 3 + 2] = (R() - 0.5) * 0.04;
        colr[n * 3] = (d[i] / 255) * 0.5; colr[n * 3 + 1] = (d[i + 1] / 255) * 0.5; colr[n * 3 + 2] = (d[i + 2] / 255) * 0.5;  // the shader writes sRGB directly
        const a2 = R() * M.TAU, r2 = 3 + 9 * Math.pow(R(), 0.5), z2 = (R() - 0.5) * 14;
        start[n * 3] = Math.cos(a2) * r2; start[n * 3 + 1] = Math.sin(a2) * r2 * 0.6; start[n * 3 + 2] = z2 - 4;
        seed[n] = R();
        n++;
      }
      geo.setDrawRange(0, n);
      for (const k of ['position', 'aStart', 'aColor', 'aSeed']) geo.attributes[k].needsUpdate = true;
      return n;
    },
    update(t, u, o = {}) {
      placeCam(cam, o.cam || { pos: [0, 0, 5.4], at: [0, 0, 0], fov: 34 });
      mat.uniforms.uK.value = o.k ?? 1; mat.uniforms.uT.value = t; mat.uniforms.uSize.value = o.size ?? 2.6; mat.uniforms.uGain.value = o.gain ?? 1;
    },
  };
}
