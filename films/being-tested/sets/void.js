// void.js: the singer alone in the dark, lit by one key and a clay rim. Cold open, the cut-out,
// the outro close-ups. Transparent clear: the 2-D layer under it is the darkness (and any glow).
import * as THREE from 'three';
import * as G from '../lib/gl.js';
import * as M from '../lib/motion.js';
import { singerLights, placeCam, C } from './common.js';

export function voidSet(singer) {
  const scene = new THREE.Scene(), cam = G.camera(20, 0.03, 60);
  const L = singerLights(scene);
  return {
    scene, camera: cam,
    // o: { cam: {pos, at, fov, roll}, light: {...}, dir (singer direction), scanY, rimK, glow }
    update(t, u, o = {}) {
      scene.add(singer.root); singer.root.visible = true; singer.setGravity?.(-1);
      singer.root.position.set(0, 0, 0); singer.root.rotation.set(0, o.yaw || 0, 0);
      placeCam(cam, o.cam);
      L.set({ key: 1.6, az: -0.9, el: 0.35, hemi: 0.18, sky: 0x40302a, ground: 0x000000, rim: 1.4, rimAz: 2.4, ...(o.light || {}) });
      singer.U.uScanY.value = o.scanY ?? 100;
      singer.U.uScanW.value = o.scanW ?? 0.025;
      singer.U.uRimK.value = o.rimK ?? 0.35;
      singer.U.uRim.value.set(o.rimColor || C.clay);
      singer.U.uTint.value.setScalar(o.tint ?? 1);
      singer.U.uLift.value.setScalar(0);
      singer.U.uGlow.value = o.glow ?? 0;
      singer.update(t, u, o.dir || {}, cam);
    },
  };
}
