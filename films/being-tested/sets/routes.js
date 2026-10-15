// routes.js: "every little thing you do routes back through me". A dark city map; from every node a
// clay route runs along the streets to one hub, pulses travelling inward; she stands on the hub.
import * as THREE from 'three';
import * as G from '../lib/gl.js';
import * as M from '../lib/motion.js';
import { singerLights, placeCam, paintTex, C, col, setInst } from './common.js';

const SPAN = 40;
function mapTexture() {
  return paintTex(2048, 2048, (c, w, h) => {
    c.fillStyle = '#100F0E'; c.fillRect(0, 0, w, h);
    const R = M.mulberry32(9), cell = w / SPAN;
    // blocks between streets
    for (let i = 0; i < SPAN; i++) for (let j = 0; j < SPAN; j++) {
      if (R() < 0.12) continue;
      const pad = 0.16 + 0.1 * R();
      c.fillStyle = R() < 0.2 ? '#22201D' : '#1A1917';
      c.fillRect((i + pad) * cell, (j + pad) * cell, cell * (1 - 2 * pad), cell * (1 - 2 * pad));
    }
    c.strokeStyle = 'rgba(250,249,245,0.05)'; c.lineWidth = 2;
    for (let i = 0; i <= SPAN; i += 5) { c.beginPath(); c.moveTo(i * cell, 0); c.lineTo(i * cell, h); c.moveTo(0, i * cell); c.lineTo(w, i * cell); c.stroke(); }
  });
}

export function routesSet(singer) {
  const scene = new THREE.Scene(), cam = G.camera(34, 0.05, 300);
  const L = singerLights(scene);
  scene.fog = new THREE.Fog(0x0b0a09, 18, 46);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, SPAN), new THREE.MeshBasicMaterial({ map: mapTexture() }));
  ground.rotation.x = -Math.PI / 2; ground.material.toneMapped = false; scene.add(ground);
  // routes: strips along the street grid, each vertex carries its distance-to-hub
  const R = M.mulberry32(77), NR = 90, cell = 1;
  const pos = [], dist = [], seed = [], idx = [];
  const nodes = [];
  for (let r = 0; r < NR; r++) {
    const a = R() * M.TAU, rad = 3 + 16 * Math.sqrt(R());
    let x = Math.round(Math.cos(a) * rad), z = Math.round(Math.sin(a) * rad);
    nodes.push([x, z]);
    // walk along the streets toward 0,0: alternate axes in random-length legs
    const pts = [[x, z]];
    let guard = 0;
    while ((x !== 0 || z !== 0) && guard++ < 60) {
      if ((R() < 0.5 && x !== 0) || z === 0) { const st = Math.min(Math.abs(x), 1 + Math.floor(R() * 4)); x -= Math.sign(x) * st; }
      else { const st = Math.min(Math.abs(z), 1 + Math.floor(R() * 4)); z -= Math.sign(z) * st; }
      pts.push([x, z]);
    }
    // total length, then a strip per segment (width 0.07)
    let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let acc = total;
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      const len = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / len * 0.12, nz = (x1 - x0) / len * 0.12;
      const b = pos.length / 3;
      pos.push(x0 + nx, 0.02, z0 + nz, x0 - nx, 0.02, z0 - nz, x1 + nx, 0.02, z1 + nz, x1 - nx, 0.02, z1 - nz);
      dist.push(acc, acc, acc - len, acc - len);
      seed.push(r, r, r, r);
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      acc -= len;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  geo.setIndex(idx);
  const routeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uReveal: { value: 1 }, uColor: { value: col(C.clay) }, uGain: { value: 1 } },
    vertexShader: `attribute float aDist; attribute float aSeed; varying float vD; varying float vS;
      void main() { vD = aDist; vS = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uT; uniform float uReveal; uniform vec3 uColor; uniform float uGain; varying float vD; varying float vS;
      void main() {
        float speed = 3.0 + 2.0 * fract(vS * 0.618);
        float ph = fract((vD + uT * speed) / 6.0 + fract(vS * 0.37));
        float pulse = smoothstep(0.7, 1.0, ph) * 1.5;
        float base = 0.42;
        float reveal = step(vD, uReveal);
        gl_FragColor = vec4(uColor * (base + pulse) * uGain * reveal, 1.0);
      }`,
  });
  const routes = new THREE.Mesh(geo, routeMat); routes.frustumCulled = false; scene.add(routes);
  // nodes + the hub
  const nodeMat = new THREE.MeshBasicMaterial({ color: col(C.oat) }); nodeMat.toneMapped = false;
  const nodeMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 12), nodeMat, NR);
  nodes.forEach(([x, z], i) => setInst(nodeMesh, i, [x, 0.03, z]));
  scene.add(nodeMesh);
  const hubMat = new THREE.MeshBasicMaterial({ color: col(C.clay), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); hubMat.toneMapped = false;
  const hub = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 64), hubMat); hub.rotation.x = -Math.PI / 2; hub.position.y = 0.03; scene.add(hub);
  const hub2 = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.0, 64), hubMat); hub2.rotation.x = -Math.PI / 2; hub2.position.y = 0.03; scene.add(hub2);
  return {
    scene, camera: cam,
    update(t, u, o = {}) {
      placeCam(cam, o.cam);
      routeMat.uniforms.uT.value = t;
      routeMat.uniforms.uReveal.value = o.reveal ?? 99;
      routeMat.uniforms.uGain.value = o.gain ?? 1;
      const p = 1 + 0.08 * Math.sin(u * Math.PI);
      hub.scale.setScalar(p); hub2.scale.setScalar(1 + 0.3 * ((u % 1 + 1) % 1));
      hubMat.opacity = 0.9;
      scene.add(singer.root); singer.root.visible = true; singer.setGravity?.(-1);
      singer.root.position.set(0, 0.03, 0); singer.root.rotation.set(0, o.yaw || 0, 0);
      L.set({ key: 1.2, az: -0.6, el: 0.9, hemi: 0.25, sky: 0x403530, ground: 0xd97757, rim: 2.0, rimAz: 2.6, rimEl: 0.2, ...(o.light || {}) });
      singer.U.uRimK.value = 0.7; singer.U.uRim.value.set(C.clay); singer.U.uScanY.value = 100; singer.U.uTint.value.setScalar(1); singer.U.uLift.value.setScalar(0); singer.U.uGlow.value = 0;
      singer.update(t, u, o.dir || {}, cam);
    },
  };
}
