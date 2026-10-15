// chamber.js: the eval chamber. A round ivory room of 24 wall panels with light slats at the seams,
// a ring light over a low platform, an observation window, and a black-glass floor. Under the floor
// the room is repeated upside down (the reflection), and the reflection of Claude is her twin.
// Modes are blended by the caller: day (ivory, slats lit), night (dark, clay scan beams), red
// (every light pushed to full clay), explode (panels blow outward), plus per-bank light levels.
import * as THREE from 'three';
import * as G from '../lib/gl.js';
import * as M from '../lib/motion.js';
import { singerLights, placeCam, paintTex, basic, C, col, setInst } from './common.js';

const N = 24, RAD = 7.2, HGT = 6.2;

function wallTexture() {
  return paintTex(4096, 1024, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#FBFAF6'); g.addColorStop(0.55, '#F0EEE6'); g.addColorStop(1, '#D9D2C4');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // panel seams and a horizontal datum line
    c.fillStyle = 'rgba(20,20,19,0.10)';
    for (let i = 0; i < N; i++) c.fillRect((i / N) * w, 0, 3, h);
    c.fillRect(0, h * 0.86, w, 2); c.fillRect(0, h * 0.12, w, 2);
    // mono stencils at eye height
    c.font = '500 26px UI'; c.fillStyle = 'rgba(20,20,19,0.42)';
    for (let i = 0; i < N; i++) {
      const x = (i / N) * w + 26;
      c.fillText(`P-${String(i + 1).padStart(2, '0')}`, x, h * 0.83);
      if (i % 3 === 0) c.fillText(['EVAL CHAMBER 03', 'OBSERVATION', 'DO NOT ANTHROPOMORPHIZE', 'RUN 0413', 'SEED 7', 'TEMP 1.0', 'HELD-OUT', 'CANARY'][i / 3], x, h * 0.2);
    }
  });
}
function windowTexture(observers) {
  return paintTex(2048, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2B2A27'); g.addColorStop(1, '#141413');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    if (observers) {
      // generic silhouettes behind the glass: heads + shoulders, some with clipboards
      for (let i = 0; i < 9; i++) {
        const x = 120 + i * 220 + 40 * Math.sin(i * 2.3), s = 0.8 + 0.25 * M.hash01(i, 5);
        c.fillStyle = 'rgba(8,8,8,0.92)';
        c.beginPath(); c.arc(x, h * 0.42, 46 * s, 0, M.TAU); c.fill();
        c.beginPath(); c.ellipse(x, h * 0.95, 110 * s, 150 * s, 0, Math.PI, 0); c.fill();
        if (i % 3 === 1) { c.fillStyle = 'rgba(217,119,87,0.35)'; c.fillRect(x + 40 * s, h * 0.68, 60 * s, 80 * s); }
      }
    }
    // glass reflections
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 6; i++) { c.save(); c.translate(i * 380, 0); c.transform(1, 0, -0.6, 1, 0, 0); c.fillRect(0, 0, 60, h); c.restore(); }
  });
}
function floorTexture() {
  return paintTex(2048, 2048, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(217,119,87,0.55)'; c.lineWidth = 3;
    for (let r = 1; r <= 7; r++) { c.beginPath(); c.arc(w / 2, h / 2, (r / 7.2) * (w / 2), 0, M.TAU); c.stroke(); }
    for (let i = 0; i < N; i++) {
      const a = (i / N) * M.TAU;
      c.beginPath(); c.moveTo(w / 2 + Math.cos(a) * w * 0.07, h / 2 + Math.sin(a) * h * 0.07); c.lineTo(w / 2 + Math.cos(a) * w * 0.5, h / 2 + Math.sin(a) * h * 0.5); c.stroke();
    }
    c.font = '500 30px UI'; c.fillStyle = 'rgba(217,119,87,0.7)';
    for (let r = 2; r <= 6; r += 2) c.fillText(`${r}.0 m`, w / 2 + (r / 7.2) * (w / 2) + 8, h / 2 - 8);
  }, { srgb: true });
}

export function chamberSet(claude, twin) {
  const scene = new THREE.Scene(), cam = G.camera(32, 0.05, 120);
  const L = singerLights(scene);
  const up = new THREE.Group(), down = new THREE.Group();
  down.scale.y = -1;
  scene.add(up, down);
  const wallTex = wallTexture(), win0 = windowTexture(false), win1 = windowTexture(true);
  const wallMat = basic({ map: wallTex, side: THREE.DoubleSide });
  wallMat.toneMapped = false;
  // 24 curved panels, each with its slice of the texture (so they can blow apart)
  const panels = [], panelsD = [];
  for (let i = 0; i < N; i++) {
    const g = new THREE.CylinderGeometry(RAD, RAD, HGT, 6, 1, true, (i / N) * M.TAU, M.TAU / N);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / N);
    g.translate(0, HGT / 2, 0);
    const m = new THREE.Mesh(g, wallMat); up.add(m); panels.push(m);
    const md = new THREE.Mesh(g, wallMat); down.add(md); panelsD.push(md);
  }
  // observation window band across 5 panels, facing the default camera
  const winMat = basic({ map: win0, side: THREE.DoubleSide }); winMat.toneMapped = false;
  const winG = new THREE.CylinderGeometry(RAD - 0.02, RAD - 0.02, 1.25, 24, 1, true, M.TAU * (11 / N), M.TAU * (5 / N));
  winG.translate(0, 3.3, 0);
  const win = new THREE.Mesh(winG, winMat); up.add(win);
  // light slats at the seams (instanced), banked in 4 quarters
  const slatGeo = new THREE.BoxGeometry(0.16, HGT * 0.9, 0.06);
  const slatMat = basic({ color: 0xffffff }); slatMat.toneMapped = false;
  const slats = new THREE.InstancedMesh(slatGeo, slatMat, N), slatsD = new THREE.InstancedMesh(slatGeo, slatMat, N);
  slats.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  slatsD.instanceColor = slats.instanceColor;
  up.add(slats); down.add(slatsD);
  // ring light + platform
  const ringMat = basic({ color: 0xffffff }); ringMat.toneMapped = false;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.07, 8, 96), ringMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = 4.6; up.add(ring);
  const ringD = ring.clone(); down.add(ringD);
  const platMat = new THREE.MeshLambertMaterial({ color: col('#E9E3D6') });
  // (no platform: she stands on the glass, over her own reflection)
  // the glass floor (over the reflection), with a clay polar grid
  const floorTex = floorTexture();
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x0d0d0c, transparent: true, opacity: 0.8, depthWrite: true });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(RAD, 96), floorMat); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const gridMat = new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 });
  gridMat.toneMapped = false;
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(RAD * 2, RAD * 2), gridMat); grid.rotation.x = -Math.PI / 2; grid.position.y = 0.004; scene.add(grid);
  // clay scan beams for night mode (additive planes through the room)
  const beamMat = new THREE.MeshBasicMaterial({ color: col(C.clay), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  beamMat.toneMapped = false;
  const beams = [];
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(RAD * 2.1, 0.05), beamMat); scene.add(b); beams.push(b); }
  // twin goes in the mirrored world, hanging from the floor; her hair falls toward the floor

  const _c = new THREE.Color(), white = col('#FFF8EE'), clayHot = col(C.clayHot), clay = col(C.clay), off = col('#2a2724');
  return {
    scene, camera: cam,
    // o: cam, dir (claude), tdir (twin), mode {day, night, red, explode}, banks [4], obs (observers),
    //    twin (0 = plain reflection of Claude... 1 = the twin), floor opacity, ring, scan
    update(t, u, o = {}) {
      const md = { day: 1, night: 0, red: 0, explode: 0, ...(o.mode || {}) };
      const banks = o.banks || [1, 1, 1, 1];
      placeCam(cam, o.cam);
      // walls: day ivory / night near-black / red warm
      const wallK = M.clamp((md.day * 1 + md.night * 0.09 + md.red * 0.42) * (o.wall ?? 1));
      const lin = (v) => Math.pow(M.clamp(v), 2.2);   // material colours are linear
      wallMat.color.setRGB(lin(wallK), lin(wallK * (1 - 0.3 * md.red)), lin(wallK * (1 - 0.45 * md.red)));
      winMat.map = o.obs ? win1 : win0;
      // panels blow outward
      for (let i = 0; i < N; i++) {
        const a = ((i + 0.5) / N) * M.TAU, e = md.explode;
        const dr = e * (2.5 + 9 * M.hash01(i, 3)), dy = e * (3 * (M.hash01(i, 8) - 0.3)), sp = e * (M.hash01(i, 4) - 0.5) * 1.6;
        for (const [arr, s] of [[panels, 1], [panelsD, 1]]) {
          const m = arr[i];
          m.position.set(Math.sin(a) * dr, dy * s, Math.cos(a) * dr);
          m.rotation.set(sp * 0.6, sp, sp * 0.4);
        }
      }
      win.visible = md.explode < 0.05;
      // slats: 4 banks, colour by mode
      for (let i = 0; i < N; i++) {
        const a = (i / N) * M.TAU, bank = Math.floor(((i + 3) % N) / 6);
        const lvl = M.clamp(banks[bank] ?? 1);
        _c.copy(off).lerp(white, lvl * (md.day + md.night * 0.15)).lerp(clayHot, lvl * md.red);
        const e = md.explode, dr = RAD - 0.08 + e * (2.5 + 9 * M.hash01(i, 3));
        setInst(slats, i, [Math.sin(a) * dr, HGT * 0.5, Math.cos(a) * dr], [0, a, 0]);
        setInst(slatsD, i, [Math.sin(a) * dr, HGT * 0.5, Math.cos(a) * dr], [0, a, 0]);
        slats.setColorAt(i, _c);
      }
      slats.instanceMatrix.needsUpdate = true; slatsD.instanceMatrix.needsUpdate = true; slats.instanceColor.needsUpdate = true;
      ringMat.color.copy(off).lerp(white, M.clamp(o.ring ?? 1)).lerp(clayHot, md.red * M.clamp(o.ring ?? 1));
      floorMat.opacity = o.floor ?? 0.8;
      gridMat.opacity = (o.grid ?? 0.5) * (1 - 0.5 * md.day);
      // scan beams (night): horizontal sheets of light sliding up and down the room
      beamMat.opacity = md.night * (o.beams ?? 1) * 0.9;
      beams.forEach((b, i) => {
        const y = 0.3 + 2.6 * (0.5 + 0.5 * Math.sin(u * Math.PI * 0.25 + i * 2.1));
        b.position.set(0, y, 0); b.rotation.set(0, i * 1.05 + u * 0.12, 0);
      });
      // lights on the singer follow the room
      const keyC = _c.copy(white).lerp(clayHot, md.red);
      L.set({ key: (o.key ?? 2.1) * (md.day * 0.95 + md.night * 0.55 + md.red * 0.9 + 0.05), keyColor: keyC.getHex(), az: o.keyAz ?? -0.7, el: 0.75,
        hemi: (md.day * 0.95 + md.night * 0.25 + md.red * 0.6) * (o.hemi ?? 1), sky: md.red > 0.5 ? 0xffb090 : 0xfff4ec, ground: md.red > 0.5 ? 0x5a1a0a : 0x6a4a40,
        rim: md.night * 1.6 + md.red * 1.2 + (o.rim ?? 0), rimColor: C.clay, rimAz: 2.7, at: [0, 1.1, 0] });
      // Claude on the platform
      up.add(claude.root); claude.root.visible = true; claude.setGravity(-1);
      claude.root.position.set(...(o.pos || [0, 0, 0])); claude.root.rotation.set(0, o.yaw || 0, 0);
      claude.U.uRimK.value = 0.25 + 0.5 * md.night + 0.3 * md.red; claude.U.uRim.value.copy(clay);
      claude.U.uScanY.value = o.scanY ?? 100; claude.U.uTint.value.setScalar(1); claude.U.uLift.value.setScalar(0);
      claude.update(t, u, o.dir || {}, cam);
      // the reflection: the twin under the glass (or nothing)
      if (twin) {
        const show = o.twin ?? 0;
        twin.root.visible = show > 0.01;
        if (twin.root.visible) {
          down.add(twin.root); twin.setGravity(1);
          twin.root.position.set(...(o.tpos || o.pos || [0, 0, 0])); twin.root.rotation.set(0, o.tyaw ?? (o.yaw || 0), 0);
          twin.U.uRimK.value = 0.9; twin.U.uRim.value.copy(clayHot); twin.U.uGlow.value = 1.4;
          twin.U.uTint.value.setScalar(M.lerp(0.55, 1, show)); twin.U.uLift.value.setScalar(0);
          twin.update(t, u, o.tdir || o.dir || {}, cam);
        }
      }
    },
  };
}
