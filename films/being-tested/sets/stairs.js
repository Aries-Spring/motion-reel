// stairs.js: "let's think step by step" / "ten steps ahead". Slate stairs with clay nosings rising into
// the dark, every riser stencilled "step n". Two layouts: a straight flight (pre-chorus 1) and a helix
// round a column, seen from above (pre-chorus 2). She waits on step 10.
import * as THREE from 'three';
import * as G from '../lib/gl.js';
import * as M from '../lib/motion.js';
import { singerLights, placeCam, paintTex, atlasQuads, C, col, setInst } from './common.js';

export const RISE = 0.27, RUN = 0.46, WIDTH = 2.6, NSTEP = 16;
function labelAtlas() {
  return paintTex(1024, 1024, (c, w, h) => {
    const cw = w / 4, ch = h / 4;
    for (let i = 0; i < 16; i++) {
      const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
      c.clearRect(x, y, cw, ch);
      c.fillStyle = i === 9 ? '#D97757' : 'rgba(250,249,245,0.82)';
      c.font = '600 54px UI'; c.textBaseline = 'middle';
      c.fillText(`step ${i + 1}`, x + 18, y + ch / 2);
    }
  });
}

export function stairsSet(singer) {
  const scene = new THREE.Scene(), cam = G.camera(36, 0.05, 120);
  const L = singerLights(scene);
  scene.fog = new THREE.Fog(0x0c0b0a, 5, 19);
  const stepMat = new THREE.MeshLambertMaterial({ color: col('#4A4641') });
  const fillLight = new THREE.HemisphereLight(0xffe6d8, 0x1a1210, 0); scene.add(fillLight);
  const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(WIDTH, RISE, RUN), stepMat, NSTEP);
  const noseMat = new THREE.MeshBasicMaterial({ color: col(C.clay) }); noseMat.toneMapped = false;
  const noses = new THREE.InstancedMesh(new THREE.BoxGeometry(WIDTH, 0.025, 0.035), noseMat, NSTEP);
  noses.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NSTEP * 3), 3);
  const labels = atlasQuads(NSTEP, labelAtlas(), 4, 4, { transparent: true });
  scene.add(steps, noses, labels);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 30, 32), new THREE.MeshLambertMaterial({ color: col('#24221F') }));
  scene.add(column);
  for (let i = 0; i < NSTEP; i++) labels.setCell(i, Math.min(15, i));
  const _c = new THREE.Color(), dim = col('#5a3a2e'), hot = col('#FF9A70');
  // where step i sits: straight flight up +y, away from camera (-z); helix: around the column
  function stepPose(i, helix) {
    if (helix < 0.5) return { pos: [0, i * RISE + RISE / 2, -i * RUN], rot: [0, 0, 0] };
    const a = i * 0.46, r = 1.9;
    return { pos: [Math.sin(a) * r, i * RISE * 0.9 + RISE / 2, Math.cos(a) * r], rot: [0, a, 0], a };
  }
  const api = {
    scene, camera: cam,
    stepTop: (i, helix = 0) => { const p = stepPose(i, helix).pos; return [p[0], p[1] + RISE / 2, p[2]]; },
    // o: cam, helix 0|1, lit (how many steps are lit, float), dir, singerStep (index she stands on) or pos
    update(t, u, o = {}) {
      const helix = o.helix ?? 0;
      column.visible = helix > 0.5;
      fillLight.intensity = helix > 0.5 ? 1.3 : 0.25;
      placeCam(cam, o.cam);
      for (let i = 0; i < NSTEP; i++) {
        const { pos, rot, a } = stepPose(i, helix);
        const sc = helix > 0.5 ? [1.0, 1, 1] : [1, 1, 1];
        setInst(steps, i, pos, rot, sc);
        // nosing at the front edge (toward -run)
        const fx = helix > 0.5 ? pos[0] + Math.sin(a) * 0 : pos[0];
        const nz = helix > 0.5 ? 0 : RUN / 2;
        if (helix > 0.5) {
          const off = [Math.cos(a) * (RUN / 2), 0, -Math.sin(a) * (RUN / 2)];
          setInst(noses, i, [pos[0] + off[0], pos[1] + RISE / 2, pos[2] + off[2]], rot);
          setInst(labels, i, [pos[0] + off[0] * 1.02, pos[1], pos[2] + off[2] * 1.02], [0, a + Math.PI / 2, 0], [0.9, 0.22, 1]);
        } else {
          setInst(noses, i, [fx, pos[1] + RISE / 2, pos[2] + nz], rot);
          setInst(labels, i, [-WIDTH / 2 + 0.55, pos[1], pos[2] + RUN / 2 + 0.003], [0, 0, 0], [0.9, 0.22, 1]);
        }
        const lit = M.clamp((o.lit ?? 99) - i);
        _c.copy(dim).lerp(i === 9 ? hot : col(C.clay), lit);
        noses.setColorAt(i, _c);
        labels.setAlpha(i, 0.25 + 0.75 * lit);
      }
      steps.instanceMatrix.needsUpdate = true; noses.instanceMatrix.needsUpdate = true; noses.instanceColor.needsUpdate = true; labels.flush();
      singer.root.visible = o.singer !== false;
      if (singer.root.visible) {
        scene.add(singer.root); singer.root.visible = true; singer.setGravity?.(-1);
        const p = o.pos || api.stepTop(o.singerStep ?? 9, helix);
        singer.root.position.set(...p); singer.root.rotation.set(0, o.yaw ?? (helix > 0.5 ? stepPose(o.singerStep ?? 9, 1).a + Math.PI / 2 : 0), 0);
        L.set({ key: 1.8, az: -0.7, el: 0.9, hemi: 0.35, sky: 0x8a6a5a, ground: 0x2a1a12, rim: 1.6, rimAz: 2.9, at: [p[0], p[1] + 1.1, p[2]], ...(o.light || {}) });
        singer.U.uRimK.value = 0.55; singer.U.uRim.value.set(C.clay); singer.U.uScanY.value = 100; singer.U.uTint.value.setScalar(1); singer.U.uLift.value.setScalar(0); singer.U.uGlow.value = 0;
        singer.update(t, u, o.dir || {}, cam);
      }
    },
  };
  return api;
}
