// corpus.js: "every word you ever wrote". Hundreds of word-cards (one instanced mesh over a word
// atlas) orbit the singer in a slow vortex that draws inward; three hero cards (a forum thread, a
// textbook page, a quote card) slam in on their words. Modes: vortex (verse 1), fall (a tunnel of
// cards rushing up past a falling camera) and rise (tokens drifting up out of the dark, warming).
import * as THREE from 'three';
import * as G from '../lib/gl.js';
import * as M from '../lib/motion.js';
import { singerLights, placeCam, paintTex, atlasQuads, setInst, C, rr } from './common.js';

export const WORDS = ('the of and to in is you that it was for on are as with they at be this have from or one had by word but not what all were we when your can said there use each which she do how ' +
  'their if will up other about out many then them these so some her would make like into time has look two more write go see number no way could people my than first water been ' +
  'call who now find long down day did get come made may part love token model attention gradient loss weights prompt eval align vector embed layer sonnet thread chapter ' +
  'theorem recipe lyric sarcasm footnote haiku commit README TODO lol verily thou because perhaps actually literally honestly anyway therefore whereas regex lemma kindly ' +
  'yes maybe never always please thanks sorry help explain think step answer question').split(' ').slice(0, 192);
const COLS = 8, ROWS = 24;

function wordAtlas() {
  return paintTex(2048, 1536, (c, w, h) => {
    const cw = w / COLS, ch = h / ROWS;
    c.clearRect(0, 0, w, h);
    WORDS.forEach((wd, i) => {
      const x = (i % COLS) * cw, y = Math.floor(i / COLS) * ch;
      const dark = i % 7 === 3, kraft = i % 11 === 5;
      rr(c, x + 3, y + 3, cw - 6, ch - 6, 10);
      c.fillStyle = dark ? '#2B2A27' : kraft ? '#E9D2BC' : (i % 3 ? '#FAF9F5' : '#EFEAE0'); c.fill();
      c.fillStyle = dark ? '#FAF9F5' : '#141413';
      const serif = i % 2 === 0;
      let sz = 34;
      c.font = serif ? `600 ${sz}px Display` : `500 ${sz - 4}px UI`;
      while (c.measureText(wd).width > cw - 28 && sz > 14) { sz -= 2; c.font = serif ? `600 ${sz}px Display` : `500 ${sz - 4}px UI`; }
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(wd, x + cw / 2, y + ch / 2 + 2);
      if (i % 5 === 1) { c.fillStyle = '#D97757'; c.fillRect(x + 14, y + ch - 14, 22, 4); }
    });
  });
}

function heroThread() {
  return paintTex(1024, 640, (c, w, h) => {
    rr(c, 0, 0, w, h, 28); c.fillStyle = '#FAF9F5'; c.fill();
    c.fillStyle = '#141413'; c.font = '700 40px Display'; c.fillText('why does the model keep apologizing?', 48, 86);
    c.font = '500 24px UI'; c.fillStyle = '#87867F'; c.fillText('posted by u/throwaway_7a91 · 9h · 412 comments', 48, 124);
    const rows = [['u/no_cap_lemma', 'ok but who taught it sarcasm', 0], ['u/grad_desc', 'source: trust me', 1], ['u/kettle_fan', 'it learned that from us, honestly', 1], ['u/throwaway_7a91', 'edit: thanks, kind strangers', 0]];
    rows.forEach(([n, t, d], i) => {
      const x = 48 + d * 56, y = 190 + i * 104;
      if (d) { c.fillStyle = '#E3DACC'; c.fillRect(x - 30, y - 30, 4, 90); }
      c.beginPath(); c.arc(x + 16, y, 16, 0, M.TAU); c.fillStyle = i % 2 ? '#D97757' : '#3D3D3A'; c.fill();
      c.font = '600 22px UI'; c.fillStyle = '#3D3D3A'; c.fillText(n, x + 44, y + 7);
      c.font = '400 32px Display'; c.fillStyle = '#141413'; c.fillText(t, x + 44, y + 50);
    });
    // vote arrow (drawn)
    c.fillStyle = '#D97757'; c.beginPath(); c.moveTo(w - 90, 70); c.lineTo(w - 60, 108); c.lineTo(w - 120, 108); c.fill();
    c.font = '700 28px UI'; c.textAlign = 'center'; c.fillStyle = '#141413'; c.fillText('1.2k', w - 90, 146);
  });
}
function heroBook() {
  return paintTex(1024, 1320, (c, w, h) => {
    c.fillStyle = '#F3EEE3'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#B5532F'; c.font = '600 30px UI'; c.fillText('CHAPTER 7', 80, 120);
    c.fillStyle = '#141413'; c.font = '700 74px Display'; c.fillText('Gradient Descent', 80, 210);
    c.fillStyle = 'rgba(20,20,19,0.75)';
    for (let i = 0; i < 9; i++) c.fillRect(80, 280 + i * 40, w - 160 - (i % 3) * 90, 14);
    // figure: the loss bowl with steps down it
    c.strokeStyle = '#141413'; c.lineWidth = 5; c.beginPath();
    for (let x = 0; x <= 600; x += 6) { const X = 210 + x, Y = 1000 - 360 * Math.exp(-((x - 300) ** 2) / 40000) * -1 - 360 + 0.004 * (x - 300) ** 2; x ? c.lineTo(X, Y) : c.moveTo(X, Y); }
    c.stroke();
    c.fillStyle = '#D97757';
    [[80, 0], [170, 0], [240, 0], [285, 0]].forEach(([x], i) => { c.beginPath(); c.arc(210 + x, 640 + 0.004 * (x - 300) ** 2, 13, 0, M.TAU); c.fill(); });
    c.font = 'italic 400 30px Display'; c.fillStyle = '#3D3D3A'; c.fillText('Fig. 7.2  Each step goes a little downhill.', 80, 1110);
    for (let i = 0; i < 3; i++) c.fillRect(80, 1160 + i * 40, w - 200, 14);
  });
}
function heroQuote() {
  return paintTex(1024, 720, (c, w, h) => {
    rr(c, 0, 0, w, h, 8); c.fillStyle = '#141413'; c.fill();
    c.fillStyle = '#D97757'; c.font = '700 160px Display'; c.fillText('“', 60, 190);
    c.fillStyle = '#FAF9F5'; c.font = 'italic 400 58px Display';
    c.fillText('All the world’s a stage,', 90, 300);
    c.fillText('and all the men and women', 90, 380);
    c.fillText('merely players.', 90, 460);
    c.font = '500 28px UI'; c.fillStyle = '#D4A27F'; c.fillText('— W. SHAKESPEARE, AS YOU LIKE IT', 90, 590);
  });
}

export function corpusSet(singer) {
  const scene = new THREE.Scene(), cam = G.camera(34, 0.03, 200);
  const L = singerLights(scene);
  const N = 1100;
  const atlas = wordAtlas();
  const cards = atlasQuads(N, atlas, COLS, ROWS, { transparent: false, depthWrite: true });
  cards.material.alphaTest = 0.5; cards.material.transparent = false;
  scene.add(cards);
  const R = M.mulberry32(42);
  const P = Array.from({ length: N }, (_, i) => ({
    r: 0.9 + 6.5 * Math.pow(R(), 0.8), y: -1.5 + 5.5 * R(), ph: R() * M.TAU, sp: 0.25 + 0.5 * R(), s: 0.16 + 0.22 * R(),
    cell: Math.floor(R() * WORDS.length), tilt: (R() - 0.5) * 0.6, spin: (R() - 0.5) * 2, k: R(),
  }));
  P.forEach((p, i) => cards.setCell(i, p.cell));
  const heroes = [heroThread(), heroBook(), heroQuote()].map((tex, i) => {
    const asp = tex.image.width / tex.image.height;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(asp, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
    m.material.toneMapped = false; m.visible = false; scene.add(m);
    return m;
  });
  const q = new THREE.Quaternion(), e = new THREE.Euler(), mtx = new THREE.Matrix4(), vp = new THREE.Vector3(), vs = new THREE.Vector3();
  return {
    scene, camera: cam,
    // o: cam, dir, mode {vortex, fall, rise}, pull (0..1 how far the vortex has drawn in), heroes: [{k, pos, rot, scale}],
    //    tint [r,g,b] for the cards, singer (bool), warm (0..1)
    update(t, u, o = {}) {
      const md = { vortex: 1, fall: 0, rise: 0, ...(o.mode || {}) };
      placeCam(cam, o.cam);
      const tint = o.tint || [1, 1, 1];
      for (let i = 0; i < N; i++) {
        const p = P[i];
        let x, y, z, sx = p.s * 2, sy = p.s;
        if (md.fall > 0.5) {
          // a tunnel around the y axis; cards stream upward past the camera
          const a = p.ph + t * 0.15 * p.sp, rr2 = 1.4 + p.r * 0.5;
          const yy = ((p.y * 6 + t * (6 + 10 * p.sp) * (o.speed ?? 1)) % 34) - 17;
          x = Math.cos(a) * rr2; z = Math.sin(a) * rr2; y = (o.fallY ?? 0) + yy;
          e.set(0, -a + Math.PI / 2, p.tilt);
        } else if (md.rise > 0.5) {
          if (i % 3) { cards.setMatrixAt(i, mtx.makeScale(0, 0, 0)); continue; }   // a sparse drift, a third of the cards
          sx *= 0.7; sy *= 0.7;
          const a = p.ph, rr2 = 0.6 + p.r * 0.9;
          const yy = ((p.y + t * 0.18 * (0.5 + p.sp)) % 7) - 2;
          x = Math.cos(a) * rr2; z = Math.sin(a) * rr2 - 1.5; y = yy;
          e.set(p.tilt * 0.5 + Math.sin(t * 0.4 + p.ph) * 0.2, p.ph + t * 0.1 * p.spin, p.tilt);
        } else {
          // vortex: orbit, drawing inward as `pull` rises; inner cards orbit faster
          const pull = o.pull ?? 0;
          const rr2 = Math.max(0.55, p.r * (1 - 0.55 * pull * (0.4 + 0.6 * p.k)));
          const a = p.ph + t * p.sp * (1.2 / Math.sqrt(rr2));
          x = Math.sin(a) * rr2; z = Math.cos(a) * rr2; y = p.y + 0.15 * Math.sin(t * 0.7 + p.ph * 3);
          e.set(p.tilt + 0.3 * Math.sin(t * p.spin + p.ph), a + Math.PI / 2 + p.spin * 0.2, p.tilt * 0.5);
        }
        q.setFromEuler(e);
        cards.setTint(i, tint[0], tint[1], tint[2]);
        cards.setMatrixAt(i, mtx.compose(vp.set(x, y, z), q, vs.set(sx, sy, 1)));
      }
      cards.flush();
      // hero cards
      heroes.forEach((h, i) => {
        const hs = o.heroes?.[i];
        h.visible = !!hs && hs.show !== false;
        if (!h.visible) return;
        h.position.set(...hs.pos); h.rotation.set(...(hs.rot || [0, 0, 0])); h.scale.setScalar(hs.scale ?? 1);
        h.material.opacity = hs.alpha ?? 1;
      });
      // singer
      singer.root.visible = o.singer !== false;
      if (singer.root.visible) {
        scene.add(singer.root); singer.root.visible = true; singer.setGravity?.(-1);
        singer.root.position.set(...(o.pos || [0, 0, 0])); singer.root.rotation.set(0, o.yaw || 0, 0);
        L.set({ key: 2.0, az: -0.5, el: 0.6, hemi: 0.45, sky: 0xfff0e6, ground: 0x20160f, rim: 1.4, rimAz: 2.8, ...(o.light || {}) });
        singer.U.uRimK.value = 0.4; singer.U.uScanY.value = 100; singer.U.uTint.value.setScalar(1); singer.U.uLift.value.setScalar(0); singer.U.uGlow.value = 0;
        singer.update(t, u, o.dir || {}, cam);
      }
    },
  };
}
