// THE BELL WITCH: pure function of time. window.seek(t) paints frame t (see lib/motion.js).
// 80 bpm, 144 beats, 108 s. docs/shotlist.md is the plan; vo.json (from audio/score.py) places
// every narrated phrase and word on the same grid, so type can land on the spoken word.
import * as M from './lib/motion.js';
import * as P from './lib/ps1.js';
import * as S from './sets/world.js';

const { W, H, FORMAT, E, prog, lerp, clamp, kf, springU, font, layout, glyph, text, fill, noise1, hash01, bump } = M;
const VO = await fetch('vo.json').then((r) => r.json());
const PH = Object.fromEntries(VO.phrases.map((p) => [p.id, p]));
const BEAT = 0.75;
const ub = (t) => t / BEAT;                         // seconds -> beats (offset 0)
const wordsOf = (id) => VO.words.filter((w) => w.p === id);

const C = { night: '#06070A', fog: '#2B3140', bone: '#E9E0C9', ember: '#C9782E', blood: '#D11A1E', witch: '#3FD3FF' };
const DISPLAY = 'Fell', UI = 'VT';
const PORT = FORMAT.portrait;
const SAFE = FORMAT.safe;

// ---------------------------------------------------------------- hits: every accent, voiced by sfx.mjs
// (sfx = synthesized palette sound; opts.el = an ElevenLabs sample placed by audio/sfx_el.py)
const HITS = [
  [0, 'knock 1', null, { el: 'knock', slice: 0, gain: 1.0 }],
  [1, 'knock 2', null, { el: 'knock', slice: 1, gain: 1.0 }],
  [2, 'knock 3', null, { el: 'knock', slice: 2, gain: 1.15 }],
  [4, '1817 stamps', 'sub', { len: 1.4, gain: 0.5 }],
  [5, 'caption types on', 'type', { len: 1.3, gain: 0.25 }],
  [8, 'match cut into the corn', 'whoosh', { len: 0.8, from: 300, to: 1400, gain: 0.12 }],
  [9.5, 'JOHN BELL', 'thud+click', { gain: 0.35 }],
  [13, 'cut: toward us', 'thud+click', { gain: 0.45 }],
  [18, 'the creature', 'sub', { len: 1.0, gain: 0.45 }],
  [21, 'hammer cocks', 'click+tick', { gain: 0.4 }],
  [22.5, 'the shot', 'sub', { el: 'rifle', gain: 0.5, elGain: 1.0, len: 0.8 }],
  [26, 'cut to night', 'whoosh', { len: 0.9, from: 2000, to: 200, gain: 0.08 }],
  [30.5, 'door knock', null, { el: 'knock', slice: 3, gain: 1.0 }],
  [31, 'KNOCKING', null, { el: 'knock', slice: 4, gain: 1.15 }],
  [31.5, 'knock', null, { el: 'knock', slice: 5, gain: 0.9 }],
  [32, 'knock', null, { el: 'knock', slice: 0, gain: 1.0 }],
  [32.5, 'knock', null, { el: 'knock', slice: 2, gain: 0.85 }],
  [33, 'SCRATCHING', null, { el: 'scratch', gain: 1.0 }],
  [35, 'GNAWING', null, { el: 'gnaw', gain: 1.1 }],
  [37, 'CHAINS', null, { el: 'chains', gain: 1.0 }],
  [39, 'all at once', null, { el: 'dog', gain: 0.45 }],
  [39.5, 'cut', null, { el: 'knock', slice: 1, gain: 0.6 }],
  [40, 'cut', null, { el: 'knock', slice: 4, gain: 0.7 }],
  [40.5, 'cut', null, { el: 'knock', slice: 3, gain: 0.8 }],
  [41.5, 'the quilt slides', 'thud', { el: 'quilt', gain: 0.2, elGain: 0.9, align: 'first' }],
  [45.5, 'Goodspeed types on', 'type', { len: 2.4, gain: 0.2 }],
  [45.75, 'slapped / candle out', 'thud', { el: 'slap', gain: 0.15, elGain: 0.9 }],
  [53, 'the voice', 'sub', { len: 1.6, gain: 0.35 }],
  [63, 'KATE', 'thud', { gain: 0.3 }],
  [66, 'two shadows', 'whoosh', { len: 1.2, from: 200, to: 900, gain: 0.07 }],
  [70.5, 'DEC. 19 1820', 'type', { len: 0.8, gain: 0.22 }],
  [72, 'cupboard opens', null, { el: 'creak', gain: 0.8 }],
  [80.75, 'the cat', null, { el: 'cat', gain: 0.75, cut: 1.1 }],
  [85.5, 'vial shatters', null, { el: 'vial', gain: 1.0, cut: 0.45 }],
  [86, 'BLUE', 'impact+thud', { gain: 0.75 }],
  [87.5, 'the chimney', 'whoosh', { len: 0.7, from: 400, to: 3000, gain: 0.12 }],
  [89.5, 'the bell / DEC. 20 1820', null, { el: 'bell', gain: 0.7, align: 'first' }],
  [95, 'dirt on the coffin', null, { el: 'dirt', gain: 0.75, align: 'first' }],
  [101, 'heads snap round', 'thud+sub', { len: 0.9, gain: 0.5 }],
  [110, '1821', 'thud', { gain: 0.35 }],
  [118.5, '1828', 'thud', { gain: 0.35 }],
  [114.5, 'the years roll', 'tick', { gain: 0.25 }],
  [127.5, '1935', 'impact', { gain: 0.4 }],
  [129, 'the dark cabin', 'thud', { gain: 0.3 }],
  [137, 'SCARE', 'impact', { el: 'scream', gain: 0.6, elGain: 1.25, cut: 0.62 }],
  [138, 'THE BELL WITCH', 'thud+sub', { len: 2.4, gain: 0.6, el: 'knock', slice: 2, elGain: 1.2 }],
  [141, 'knock', null, { el: 'knock', slice: 0, gain: 1.0 }],
  [141.75, 'knock', null, { el: 'knock', slice: 1, gain: 1.0 }],
  [142.5, 'knock', null, { el: 'knock', slice: 2, gain: 1.15 }],
];

// ---------------------------------------------------------------- helpers
const SETS = {};
let GRAIN = [], SCAN = null, VIG = null;

// keyed camera: [[u, [pos, target, fov, roll]], ...]
function camKeys(u, keys, ease = E.inOutCubic) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const [a, A] = keys[i - 1], [b, B] = keys[i];
      const p = ease((u - a) / (b - a));
      return [A[0].map((v, k) => lerp(v, B[0][k], p)), A[1].map((v, k) => lerp(v, B[1][k], p)), lerp(A[2] ?? 50, B[2] ?? 50, p), lerp(A[3] ?? 0, B[3] ?? 0, p)];
    }
  }
  return keys[keys.length - 1][1];
}
const since = (u, list) => { let best = null; for (const b of list) if (u >= b) best = u - b; return best; };
// render a set at the 30 fps PS1 clock and present it 5x
function stage(ctx, set, t3, u3, o, pres = {}) { P.renderSet(SETS[set], t3, u3, o); P.present(ctx, { bleed: 1, ...pres }); return SETS[set]; }

// IM Fell slammed in: big -> 1 on a stiff spring, red/cyan ghosts that settle, a short shake
function stamp(ctx, str, x, y, size, color, u, u0, { align = 'left', italic = false, track = -0.02, ghost = 1, alpha = 1 } = {}) {
  const a = u - u0;
  if (a < 0) return;
  const k = springU(u, u0, { stiffness: 900, damping: 38 });
  const s = lerp(1.2, 1, k);
  const f = `${italic ? 'italic ' : ''}400 ${Math.round(size)}px ${DISPLAY}`;
  const L = layout(ctx, str, f, track * size);
  const ox = align === 'center' ? -L.width / 2 : align === 'right' ? -L.width : 0;
  const sh = 14 * Math.exp(-a * 9);
  ctx.save();
  ctx.translate(x + sh * noise1(u * 40, 3), y + sh * noise1(u * 40, 7));
  ctx.scale(s, s);
  ctx.globalAlpha = alpha;
  const d = (3 + 22 * Math.exp(-a * 5)) * ghost;
  if (ghost) {
    ctx.globalCompositeOperation = 'lighter';
    text(ctx, str, ox - d, 0, f, 'rgba(255,20,40,0.55)', 'left', track * size);
    text(ctx, str, ox + d, 0, f, 'rgba(20,200,255,0.4)', 'left', track * size);
    ctx.globalCompositeOperation = 'source-over';
  }
  text(ctx, str, ox, 0, f, color, 'left', track * size);
  ctx.restore();
  return L;
}
// VT323 typed on at `rate` chars per beat, with a block cursor
function typeOn(ctx, str, x, y, size, color, u, u0, rate = 24, { cursor = true, track = 0.06, align = 'left' } = {}) {
  if (u < u0) return;
  const n = Math.min(str.length, Math.floor((u - u0) * rate));
  const f = font(size, 400, UI);
  const shown = str.slice(0, n);
  const L = layout(ctx, str, f, track * size);
  const ox = align === 'center' ? -L.width / 2 : align === 'right' ? -L.width : 0;
  text(ctx, shown, x + ox, y, f, color, 'left', track * size);
  if (cursor && (n < str.length || Math.floor(u * 2.6) % 2 === 0)) {
    const w = layout(ctx, shown, f, track * size).width;
    ctx.fillStyle = color; ctx.fillRect(x + ox + w + size * 0.12, y - size * 0.7, size * 0.45, size * 0.78);
  }
}
// a line of words that each stamp in on their spoken time (word-aligned VO)
function spokenLine(ctx, words, line, x, y, size, color, u, { italic = true, align = 'left', wobble = 0, ghost = 0.6, from = 0 } = {}) {
  const f = `${italic ? 'italic ' : ''}400 ${Math.round(size)}px ${DISPLAY}`;
  const L = layout(ctx, line, f, -0.01 * size);
  const ox = align === 'center' ? -L.width / 2 : 0;
  const toks = line.split(' ');
  let cx = 0;
  toks.forEach((tok, i) => {
    const w = words[from + i];
    const wl = layout(ctx, tok + ' ', f, -0.01 * size).width;
    if (w && u >= ub(w.t0) - 0.04) {
      const a = u - ub(w.t0);
      const k = springU(u, ub(w.t0) - 0.04, { stiffness: 520, damping: 22 });
      ctx.save();
      const wy = wobble * Math.sin(u * 2.2 + i * 1.3) * size * 0.08;
      ctx.translate(x + ox + cx, y + wy + (1 - k) * size * 0.25);
      ctx.globalAlpha = clamp(k * 1.4);
      const j = 2.5 * Math.exp(-a * 4) + wobble * 1.2;
      if (ghost) {
        ctx.globalCompositeOperation = 'lighter';
        text(ctx, tok, -4 - j * noise1(u * 30, i), 0, f, `rgba(255,30,40,${0.45 * ghost})`);
        text(ctx, tok, 4 + j * noise1(u * 30, i + 9), 0, f, `rgba(40,190,255,${0.35 * ghost})`);
        ctx.globalCompositeOperation = 'source-over';
      }
      text(ctx, tok, j * noise1(u * 33, i + 3), j * noise1(u * 29, i + 5), f, color);
      ctx.restore();
    }
    cx += wl;
  });
}
function vignette(ctx, k = 1) { ctx.save(); ctx.globalAlpha = k; ctx.drawImage(VIG, 0, 0); ctx.restore(); }
function black(ctx, a = 1) { ctx.save(); ctx.globalAlpha = a; fill(ctx, '#000'); ctx.restore(); }
const fs = (v16, v916) => (PORT ? v916 : v16);

// ---------------------------------------------------------------- shots
// each: [from beat, to beat, fn(ctx, u, t, u3, t3)]
const SHOTS = [
  // 1. KNOCK KNOCK KNOCK: three cuts tighter on the door
  [0, 4, (ctx, u, t, u3, t3) => {
    const i = Math.min(3, Math.floor(u));
    const cams = [
      [[0.9, 0.9, 7.4], [-1.0, 1.35, 2.5], 40, 0.03],
      [[-2.9, 1.0, 5.6], [-1.0, 1.15, 2.5], 38, -0.05],
      [[-0.62, 1.04, 3.25], [-0.76, 1.03, 2.5], 40, 0.03],
      [[-0.62, 1.04, 3.25], [-0.76, 1.03, 2.5], 40, 0.03],
    ];
    const c = cams[i].map((v) => (Array.isArray(v) ? v.slice() : v));
    const kick = Math.exp(-(u - Math.min(i, 2)) * 8);
    const tear = kick > 0.6 ? [[60, 90, 6], [140, 150, -4]] : null;
    if (i === 0) {
      // a flash-forward: the hearth that becomes a mouth
      const sh = 0.05 * Math.exp(-u * 6);
      stage(ctx, 'int', t3, u3, { cam: [[0.6 + sh * noise1(u * 50, 1), 1.0, -0.15], [0.6, 0.95, -2.4], 62, 0.06], quilt: 1, fire: 0.6, candle: 0, moon: 0.4, warp: 0.08, mouth: 1, scratch: 0.32, extra: { pos: [0.6, 1.0, -1.6], col: [2.4, 0.15, 0.12], r: 3.2 } }, { bleed: 3, tear: u < 0.12 ? [[30, 70, 10], [150, 170, -8]] : null });
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.3; fill(ctx, '#ff2a2a'); ctx.restore();
    } else if (i >= 2) {
      // inside: the same door from the dark side, lantern light under it
      const k = u - 2;
      stage(ctx, 'int', t3, u3, { cam: [[-0.7, 1.15, 0.3 + k * 0.25 + kick * 0.08], [-1.1, 0.95, 2.6], 44, 0.04 * kick], doorKnock: k, doorGap: u < 3.5 ? 1 : 0.15, fire: 0.05, candle: 0, moon: 0.9, quilt: 0, scratch: 0, extra: { pos: [-1.1, 0.35, 2.25], col: u < 3.5 ? [1.3, 0.75, 0.35] : [0.2, 0.12, 0.06], r: 2.6 } }, { tear });
    } else {
      c[0][2] += (u - i) * 0.12 - kick * 0.12;
      stage(ctx, 'ext', t3, u3, { cam: c, knock: u - i, window: 1, lantern: 1, smoke: 0 }, { tear });
    }
    vignette(ctx, 1);
    if (u > 3.5) black(ctx, E.inCubic(prog(u, 3.5, 4)) * 0.85);
  }],
  // 2. 1817: crane over the farm, the year stamps in
  [4, 8, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[4, [[-5.5, 2.0, 15], [0, 1.6, 0], 48, 0]], [6.2, [[-1, 6.5, 9.5], [0, 1.5, -4], 52, -0.03]], [8, [[0, 8.5, 1], [0, 2.5, -22], 55, 0]]]);
    stage(ctx, 'ext', t3, u3, { cam: c, window: 1, lantern: 1 });
    vignette(ctx, 1);
    const sz = PORT ? M.fitSize(ctx, '1817', 400, DISPLAY, SAFE.w * 0.78, 520, -0.04) : 560;
    stamp(ctx, '1817', fs(SAFE.x - 10, SAFE.x), fs(H * 0.72, SAFE.y + sz * 0.95), sz, C.blood, u, 4, { track: -0.04 });
    typeOn(ctx, PORT ? 'ROBERTSON CO., TENNESSEE' : 'RED RIVER · ROBERTSON CO., TENNESSEE', SAFE.x + 6, fs(H * 0.72 + 100, SAFE.y + sz * 0.95 + 100), fs(64, 58), C.bone, u, 5, 30);
  }],
  // 3. the cornfield: John Bell walking away from us, then toward us against the dusk
  [8, 18, (ctx, u, t, u3, t3) => {
    const z = lerp(-1.5, -7.6, prog(u3, 8, 18));
    const sway = 0.08 * noise1(u3 * 0.6, 4);
    const front = u >= 13;
    const cam = front ? [[0.25 + sway * 0.5, 0.55, z - 3.6 + 0.5 * prog(u3, 13, 18)], [0, 1.9, z + 1], 52, -0.03] : [[0.35 + sway, 1.55, z + 3.4], [0, 1.25, z - 6], 48, 0.015];
    stage(ctx, 'corn', t3, u3, { cam, farmer: { x: 0.05, z, walk: t3 * 0.75, stride: 1 } });
    vignette(ctx, 1);
    const hp = P.project(SETS.corn.camera, [0.05, 2.1, z]);
    if (u > 9.5 && u < 13) {
      if (PORT) {
        stamp(ctx, 'JOHN BELL', W / 2, hp.y - 230, 120, C.bone, u, 9.5, { ghost: 0.5, align: 'center' });
        typeOn(ctx, 'FARMER · 1817', W / 2, hp.y - 160, 58, C.bone, u, 10, 20, { cursor: false, align: 'center' });
      } else {
        stamp(ctx, 'JOHN BELL', hp.x + 110, hp.y - 10, 120, C.bone, u, 9.5, { ghost: 0.5 });
        typeOn(ctx, 'FARMER · 1817', hp.x + 116, hp.y + 60, 56, C.bone, u, 10, 20, { cursor: false });
      }
    }
  }],
  // 4. the creature at the end of the row: dolly zoom
  [18, 21, (ctx, u, t, u3, t3) => {
    const p = prog(u3, 18, 21);
    const d0 = 12.5, d = lerp(d0, 7.5, E.inOutSine(p));
    const fov = (2 * Math.atan(Math.tan((22 * Math.PI) / 360) * (d0 / d)) * 180) / Math.PI;
    stage(ctx, 'corn', t3, u3, {
      cam: [[0.3, 1.45, -17 + d], [0.05, 1.0, -17], fov, 0.02 * Math.sin(u * 2)],
      farmer: { x: -0.42, z: -12.6, walk: 0, stride: 0, headYaw: 0.1 },
      beast: { visible: true, z: -17, x: 0.05, yaw: 0.35, twitch: 1.2, look: -0.1 },
      fog: [0.42, 0.22, 0.16], near: 4, far: 26,
    });
    vignette(ctx, 1);
  }],
  // 5. he fired
  [21, 23.5, (ctx, u, t, u3, t3) => {
    const aim = springU(u3, 21.1, { stiffness: 140, damping: 16 });
    const fl = u >= 22.5 ? Math.exp(-(u - 22.5) * 10) : 0;
    const rec = u >= 22.5 ? Math.exp(-(u - 22.5) * 5) : 0;
    const c = camKeys(u3, [[21, [[0.42, 1.35, -11.6], [0.05, 1.45, -8.2], 46, 0.03]], [23.5, [[0.38, 1.35, -11.2], [0.05, 1.45, -8.2], 40, 0.03]]]);
    c[0][2] += rec * 0.25; c[0][0] += rec * 0.1 * noise1(u * 40, 2);
    stage(ctx, 'corn', t3, u3, {
      cam: c,
      farmer: { x: 0.18, z: -8.2, aim, recoil: rec, walk: 0, stride: 0 },
      beast: { visible: false },
      flash: fl, flashAt: [-0.1, 1.45, -9.25], smoke: u >= 22.5 ? (u - 22.5) * 0.5 : -1,
    }, { tear: u >= 22.5 && u < 22.75 ? [[0, 70, 14], [100, 130, -10], [170, 200, 8]] : null, bleed: u >= 22.5 && u < 23 ? 3 : 1 });
    vignette(ctx, 1);
    if (fl > 0.05) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fl * 0.55; fill(ctx, '#ffd9a0'); ctx.restore(); }
  }],
  // 6. gone
  [23.5, 26, (ctx, u, t, u3, t3) => {
    const p = prog(u3, 23.5, 26);
    stage(ctx, 'corn', t3, u3, {
      cam: [[0.1, 1.5, lerp(-9.6, -11.2, p)], [0, 1.0, -30], 40, 0.03],
      smoke: 0.5 + (u - 23.5) * 0.4, flashAt: [-0.1, 1.45, -9.25], fog: [0.3, 0.16, 0.13],
    });
    vignette(ctx, 1);
  }],
  // 7. that night: push to the door
  [26, 31, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[26, [[7, 1.9, 17], [0, 1.8, 0], 46, 0]], [31, [[-0.6, 1.45, 6.2], [-1.0, 1.25, 2.5], 44, -0.02]]], E.inOutSine);
    stage(ctx, 'ext', t3, u3, { cam: c, window: 1, lantern: 1, knock: u >= 30.5 ? u - 30.5 : null });
    vignette(ctx, 1);
  }],
  // 8-12. the montage
  [31, 41, (ctx, u, t, u3, t3) => montage(ctx, u, t, u3, t3)],
  // 13. the quilts
  [41, 45, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[41, [[-0.3, 1.55, 2.1], [-2.5, 0.55, -0.4], 50, 0]], [45, [[-0.7, 1.4, 1.5], [-2.4, 0.5, -0.4], 46, 0]]], E.inOutSine);
    stage(ctx, 'int', t3, u3, { cam: c, quilt: E.inOutSine(prog(u3, 41.5, 44.6)), fire: 0.35, candle: 1, scratch: 0.32 });
    vignette(ctx, 1);
  }],
  // 14. in the dark: the candle snuffed on "slapped"
  [45, 49, (ctx, u, t, u3, t3) => {
    const sl = u >= 45.75 ? u - 45.75 : -1;
    const c = [[-0.35, 1.05, 2.0], [-1.7, 0.65, 0.5], 46, 0];
    if (sl >= 0) { const a = Math.exp(-sl * 7); c[0][0] += a * 0.12 * noise1(u * 50, 1); c[0][1] += a * 0.1 * noise1(u * 50, 4); c[3] = a * 0.08; }
    stage(ctx, 'int', t3, u3, { cam: c, quilt: 1, fire: 0.25, candle: sl < 0 ? 1 : 0, snuff: sl >= 0 ? ub(t3) - 45.75 : -1, moon: 0.9, scratch: 0.32 }, { bleed: sl >= 0 && sl < 0.3 ? 3 : 1 });
    vignette(ctx, 1);
    if (sl >= 0) black(ctx, 0.35 * clamp(sl * 3));
    const lines = PORT ? ['"IT WOULD TAKE THE QUILTS', 'FROM THE BEDS, SLAP', 'AND PINCH THE CHILDREN."'] : ['"IT WOULD TAKE THE QUILTS FROM THE BEDS,', 'SLAP AND PINCH THE CHILDREN."'];
    const sz = fs(70, 60), x = SAFE.x, y0 = fs(H - 300, SAFE.y + SAFE.h - 380);
    let u0 = 45.5;
    lines.forEach((ln, i) => { typeOn(ctx, ln, x, y0 + i * sz * 1.15, sz, C.bone, u, u0, 26, { cursor: i === lines.length - 1 }); u0 += ln.length / 26; });
    typeOn(ctx, "— GOODSPEED'S HISTORY OF TENNESSEE, 1886", x, y0 + lines.length * sz * 1.15 + 24, fs(46, 40), C.ember, u, u0 + 0.2, 40, { cursor: false });
  }],
  // 15. and then...
  [49, 53, (ctx, u, t, u3, t3) => {
    const p = prog(u3, 49, 53);
    stage(ctx, 'int', t3, u3, { cam: [[lerp(0.5, 0.55, p), lerp(1.5, 1.3, p), lerp(2.3, 0.6, p)], [0.6, 0.85, -2.4], 50, 0], quilt: 1, fire: 0.25, candle: 0, moon: 0.8, warp: 0.02 * p, scratch: 0.32, extra: { pos: [0.6, 1.0, -1.6], col: [0.3 + 1.2 * E.inQuad(p), 0.08, 0.06], r: 3.2 } });
    vignette(ctx, 1.2);
  }],
  // 16. THE VOICE
  [53, 63, (ctx, u, t, u3, t3) => {
    const p = prog(u3, 53, 63);
    const d0 = 2.9, d = lerp(d0, 1.25, E.inOutSine(p));
    const fov = (2 * Math.atan(Math.tan((40 * Math.PI) / 360) * (d0 / d)) * 180) / Math.PI;
    const warp = 0.03 + 0.1 * E.inQuad(p);
    stage(ctx, 'int', t3, u3, {
      cam: [[0.6, 1.0 + 0.1 * Math.sin(u * 0.7), -2.2 + d], [0.6, 0.9, -2.4], Math.min(fov, 95), 0.05 * Math.sin(u * 0.9)],
      quilt: 1, fire: 0.3 + 0.3 * p, candle: 0, moon: 0.5, warp, mouth: E.inOutCubic(prog(u3, 55, 61)), scratch: 0.32, extra: { pos: [0.6, 1.0, -1.6], col: [1.4 + p, 0.15, 0.12], r: 3.2 },
    }, { bleed: 1 + Math.round(2 * p) });
    vignette(ctx, 1.3);
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.35 * p; fill(ctx, '#ff2a2a'); ctx.restore();
    const W1 = wordsOf('W1');
    const lines = [['I AM A SPIRIT.', 0, 4], ['I WAS ONCE VERY HAPPY...', 4, 9], ['BUT HAVE BEEN DISTURBED.', 9, 13]];
    ctx.font = `italic 400 100px ${DISPLAY}`;
    const longest = Math.max(...(PORT ? ['I WAS ONCE', 'VERY HAPPY...', 'BUT HAVE BEEN', 'DISTURBED.'] : ['I WAS ONCE VERY HAPPY...', 'BUT HAVE BEEN DISTURBED.']).map((x) => ctx.measureText(x + ' ').width));
    const sz = Math.min(fs(150, 130), (100 * SAFE.w * 0.9) / longest);
    lines.forEach(([ln, a, b], i) => {
      const t0 = W1[a].t0, t1 = i < 2 ? W1[lines[i + 1][1]].t0 - 0.05 : W1[12].t1 + 0.9;
      if (u < ub(t0) - 0.1 || u > ub(t1)) return;
      if (PORT) {
        const parts = ln.split(' '), half = Math.ceil(parts.length / 2);
        const l1 = parts.slice(0, half).join(' '), l2 = parts.slice(half).join(' ');
        spokenLine(ctx, W1.slice(a), l1, W / 2, H * 0.42, sz, C.bone, u, { align: 'center', wobble: 1, from: 0 });
        spokenLine(ctx, W1.slice(a), l2, W / 2, H * 0.42 + sz * 1.05, sz, C.bone, u, { align: 'center', wobble: 1, from: half });
      } else spokenLine(ctx, W1.slice(a), ln, W / 2, H * 0.56, sz, C.bone, u, { align: 'center', wobble: 1 });
    });
  }],
  // 17. KATE
  [63, 66, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[63, [[-1.55, 1.5, 1.15], [-1.75, 1.55, -2.6], 55, 0]], [66, [[-1.6, 1.52, 0.4], [-1.75, 1.55, -2.6], 55, 0]]], E.outCubic);
    const kick = Math.exp(-(u - 63) * 6);
    c[0][0] += kick * 0.15 * noise1(u * 45, 3);
    stage(ctx, 'int', t3, u3, { cam: c, quilt: 1, fire: 0.6, candle: 0, moon: 0.7, scratch: 1, extra: { pos: [-1.75, 1.6, -1.5], col: [1.7, 0.4, 0.3], r: 3.0 } }, { bleed: kick > 0.3 ? 3 : 1, tear: kick > 0.7 ? [[90, 120, 10]] : null });
    vignette(ctx, 1);
  }],
  // 18. it hated John Bell: two shadows
  [66, 70.5, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[66, [[0.0, 1.45, 1.4], [2.6, 1.15, -1.1], 52, 0]], [70.5, [[0.5, 1.4, 1.0], [2.6, 1.2, -1.1], 48, 0]]], E.inOutSine);
    stage(ctx, 'int', t3, u3, { cam: c, fire: 1, candle: 0, quilt: 1, rock: 0.1, bell: 1, shadow: E.inOutCubic(prog(u3, 66.8, 70)), scratch: 1 });
    vignette(ctx, 1);
  }],
  // 19. December 1820: the cupboard, the vial
  [70.5, 78.5, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[70.5, [[1.2, 1.45, 0.6], [2.75, 1.2, -2.1], 50, 0]], [74, [[2.1, 1.38, -0.6], [2.75, 1.25, -2.05], 44, 0]], [78.5, [[2.6, 1.42, -1.3], [2.75, 1.3, -2.05], 40, 0]]], E.inOutSine);
    stage(ctx, 'int', t3, u3, { cam: c, fire: 0.9, candle: 0, quilt: 1, bell: 0, cupboard: prog(u3, 72, 73.4), scratch: 1, glint: u > 75 ? 1 : 0, extra: { pos: [2.55, 1.55, -1.5], col: [1.0, 0.85, 0.6], r: 1.9 } });
    vignette(ctx, 1);
    const sz = fs(96, 84);
    typeOn(ctx, 'DEC. 19, 1820', SAFE.x, fs(H - 120, SAFE.y + SAFE.h - 60), sz, C.bone, u, 70.5, 18);
  }],
  // 20. the cat
  [78.5, 82, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[78.5, [[0.35, 0.55, 0.0], [-0.4, 0.25, -1.5], 42, 0]], [82, [[0.25, 0.5, -0.25], [-0.4, 0.22, -1.5], 38, 0]]], E.inOutSine);
    stage(ctx, 'int', t3, u3, { cam: c, fire: 0.85, candle: 0, quilt: 1, bell: 0, cat: 1, catDown: prog(u3, 80.9, 81.6), drop: prog(u3, 79.3, 80.1) * (u3 < 80.12 ? 1 : 2), dropFrom: [-0.38, 0.95, -1.28], vial: { pos: [-0.3, 0.98, -1.2], rot: [0, 0, 2.6] }, scratch: 1 });
    vignette(ctx, 1);
    if (u >= 80.75 && u < 82) black(ctx, 0.25 * bump(u, 81.1, 0.4));
  }],
  // 21. the cat died
  [82, 84, (ctx, u, t, u3, t3) => {
    stage(ctx, 'int', t3, u3, { cam: [[0.5, 0.95, 0.4], [-0.35, 0.12, -1.45], 44, 0], fire: 0.7, candle: 0, quilt: 1, bell: 0, cat: 1, catDown: 1, vial: { pos: [-0.05, 0.035, -1.15], rot: [0, 0.6, Math.PI / 2] }, scratch: 1 });
    vignette(ctx, 1.2);
  }],
  // 22. into the fire
  [84, 86, (ctx, u, t, u3, t3) => {
    const p = clamp((ub(t3) - 84.3) / 1.2);
    const a = [0.55, 1.15, 0.4], b = [0.62, 0.25, -2.3];
    const vp = [lerp(a[0], b[0], p), lerp(a[1], b[1], p) + 0.9 * Math.sin(p * Math.PI) * 0.6, lerp(a[2], b[2], p)];
    stage(ctx, 'int', t3, u3, { cam: [[0.62, 0.45, -2.25], [0.55, 0.95, 0.5], 62, 0.04], fire: 1.2, candle: 0, quilt: 1, bell: 0, vial: { pos: vp, rot: [p * 9, p * 4, p * 7] }, scratch: 1 });
    vignette(ctx, 1);
  }],
  // 23. BLUE
  [86, 89.5, (ctx, u, t, u3, t3) => {
    const a = u - 86;
    const blue = Math.exp(-a * 0.45) * (0.75 + 0.25 * noise1(u * 12, 3));
    const sh = Math.exp(-a * 2.5) * 0.18;
    if (u < 87.5) {
      stage(ctx, 'int', t3, u3, { cam: [[0.6 + sh * noise1(u * 50, 1), 1.15 + sh * noise1(u * 50, 2), 1.6], [0.6, 1.1, -2.4], 54, sh * noise1(u * 30, 5)], fire: 0, blue, candle: 0, quilt: 1, bell: 0, scratch: 1, fogCol: [0.05, 0.12, 0.16] }, { bleed: 3, tear: a < 0.2 ? [[0, 216, 6]] : a < 0.4 ? [[40, 80, -12], [150, 190, 9]] : null });
    } else {
      const c = camKeys(u3, [[87.5, [[9, 1.6, 13], [3.9, 5.5, 0], 50, 0]], [89.5, [[8, 2.2, 11], [3.9, 6.5, 0], 46, 0]]]);
      stage(ctx, 'ext', t3, u3, { cam: c, blue: Math.max(0.6, blue), window: 0.4, lantern: 0 }, { bleed: 2 });
      const cp = P.project(SETS.ext.camera, [3.95, 7.5, 0]);
      const gr = ctx.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, H * 0.5);
      gr.addColorStop(0, 'rgba(63,211,255,0.55)'); gr.addColorStop(1, 'rgba(63,211,255,0)');
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    vignette(ctx, 0.8);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.75 * Math.exp(-a * 3.2); fill(ctx, C.witch); ctx.restore();
  }],
  // 24. dead
  [89.5, 94.5, (ctx, u, t, u3, t3) => {
    const p = prog(u3, 89.5, 94.5);
    stage(ctx, 'int', t3, u3, { cam: [[lerp(0.3, 0.7, p), 1.25, lerp(1.2, 0.5, p)], [1.9, 0.6, -0.9], 50, 0], fire: 0.08, candle: 0, quilt: 1, bell: 0, rock: 0.16, moon: 1.1, scratch: 1 });
    vignette(ctx, 1.2);
    typeOn(ctx, 'DEC. 20, 1820', SAFE.x, fs(H - 120, SAFE.y + SAFE.h - 60), fs(96, 84), C.bone, u, 89.5, 18);
  }],
  // 25. the funeral
  [94.5, 100.5, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[94.5, [[0.5, 7, 10], [0, 0.5, 0], 46, 0]], [100.5, [[0.2, 2.0, 5.6], [0, 0.6, 0], 50, 0]]], E.outCubic);
    stage(ctx, 'grave', t3, u3, { cam: c, dig: ub(t3) - 94.5, dirt: prog(u3, 95, 100) });
    vignette(ctx, 1);
  }],
  // 26. the song
  [100.5, 110, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[100.5, [[0.35, 1.55, 3.3], [-0.2, 1.4, -0.5], 46, 0]], [104, [[0.25, 1.65, 3.0], [-0.2, 1.4, -0.5], 42, 0]], [110, [[0.4, 9.0, 4.5], [0, 0.6, -0.8], 56, 0.02]]], E.inOutSine);
    stage(ctx, 'grave', t3, u3, { cam: c, turn: prog(u3, 101, 101.5), dig: -1, dirt: 1, warp: 0.03 + 0.04 * prog(u3, 104, 110) }, { bleed: u > 101 && u < 101.3 ? 3 : 1 });
    vignette(ctx, 1.1);
    const W2 = wordsOf('W2'), W3 = wordsOf('W3');
    const sz = fs(120, 96);
    if (u < ub(W3[0].t0) - 0.1) spokenLine(ctx, W2, 'Row me up some brandy, O...', W / 2, fs(H * 0.82, H * 0.72), sz, C.bone, u, { align: 'center', wobble: 2, ghost: 0.8 });
    else if (u < 109.2) spokenLine(ctx, W3, 'row me up some brandy, O...', W / 2, fs(H * 0.82, H * 0.72), sz, C.bone, u, { align: 'center', wobble: 3, ghost: 0.9 });
  }],
  // 27. 1821 - seven years - 1828
  [110, 118.5 + 1.999, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[110, [[-7, 1.5, 19], [0, 2, 0], 38, 0]], [120.5, [[-5.5, 1.6, 15], [0, 2.0, 0], 38, 0]]], E.linear);
    stage(ctx, 'ext', t3, u3, { cam: c, window: u < 110.5 ? 1 : u >= 118.5 ? 1 : 0.0, lantern: 0, smoke: u >= 118.5 ? 1 : 0, near: 8, far: 50 });
    vignette(ctx, 1);
    const sz = fs(440, 400);
    const X = fs(W - SAFE.x - 20, W / 2), Y = fs(H * 0.62, SAFE.y + sz * 0.9), al = fs('right', 'center');
    if (u < 114.5) stamp(ctx, '1821', X, Y, sz, C.bone, u, 110, { align: al });
    else if (u < 118.5) {
      const yr = Math.round(lerp(1821, 1828, E.inQuad(prog(u, 114.5, 118.4))));
      const f = font(sz, 400, DISPLAY), L = layout(ctx, String(yr), f, -0.02 * sz);
      text(ctx, String(yr), X + (al === 'right' ? -L.width : -L.width / 2) + 3 * noise1(u * 60, 3), Y, f, C.bone, 'left', -0.02 * sz);
    } else stamp(ctx, '1828', X, Y, sz, C.blood, u, 118.5, { align: al });
    if (u > 112 && u < 118.5) typeOn(ctx, 'SEVEN YEARS', X, Y + fs(118, 128), fs(84, 76), C.bone, u, 112.4, 14, { align: al, cursor: false });
  }],
  // 28. a hundred and seven years: flying back through the corn, the sky spinning
  [120.5, 129, (ctx, u, t, u3, t3) => {
    const p = prog(u3, 120.5, 129);
    const z = -14 + 70 * E.inCubic(p) + 6 * p;
    const cyc = (p * p * 5.5) % 1;                         // day/night cycles, accelerating
    const day = 0.5 + 0.5 * Math.cos(cyc * Math.PI * 2 + Math.PI);
    const night = [5, 6, 11], dusk = [58, 31, 34], noon = [120, 130, 140];
    const mixc = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
    const top = mixc(night, noon, day), mid = mixc(mixc(dusk, night, 0.4), mixc(noon, [180, 170, 150], 0.5), day), hor = mixc([138, 74, 38], [200, 190, 170], day);
    const css = (a) => `rgb(${a.map(Math.round).join(',')})`;
    stage(ctx, 'corn', t3, u3, {
      cam: [[0.1, 1.5 + 0.4 * p, z], [0, 1.2, z - 12], 50 + 20 * p, 0.04 * Math.sin(u * 3) * p],
      farmer: { visible: false }, skyCols: [css(top), css(mid), css(hor)], day: day * 0.8, sky: day > 0.5 ? 1 : 0,
      fog: [lerp(0.12, 0.6, day), lerp(0.1, 0.6, day), lerp(0.12, 0.6, day)], wind: 0.08 + 0.3 * p,
    }, { bleed: 1 + Math.round(p * 2), tear: p > 0.6 && Math.floor(u * 4) % 3 === 0 ? [[Math.floor(hash01(Math.floor(u * 4), 2) * 180), Math.floor(hash01(Math.floor(u * 4), 2) * 180) + 24, 10]] : null });
    vignette(ctx, 1);
    // the year counter: 1828 rolling to 1935 with the words "one hundred and seven years later"
    const r = E.inQuad(prog(u, 122.2, 127.5));
    const year = Math.round(lerp(1828, 1935, r));
    const sz = fs(440, 400);
    const f = font(sz, 400, DISPLAY);
    const x = W / 2, y = fs(H * 0.64, H * 0.5);
    if (u < 127.5) { ctx.save(); ctx.globalAlpha = 0.92; text(ctx, String(year), x + 3 * noise1(u * 60, 2), y, f, C.bone, 'center', -0.04 * sz); ctx.restore(); }
    else stamp(ctx, '1935', x, y, sz, C.blood, u, 127.5, { align: 'center', track: -0.04 });
  }],
  // 28b. no one saw it come back: the cabin, dark
  [129, 131.5, (ctx, u, t, u3, t3) => {
    stage(ctx, 'ext', t3, u3, { cam: [[2.5, 1.5, lerp(13, 11.5, prog(u3, 129, 131.5))], [1.0, 1.6, 0], 40, 0], window: 0, lantern: 0, smoke: 0, near: 3, far: 30, fogCol: [0.16, 0.18, 0.24] });
    vignette(ctx, 1.2);
    const sz = fs(440, 400);
    stamp(ctx, '1935', W / 2, fs(H * 0.64, H * 0.5), sz, C.blood, u, 127.5, { align: 'center', track: -0.04, ghost: 0.3 });
  }],
  // 29. silence: creep to the dark window
  [131.5, 136.86, (ctx, u, t, u3, t3) => {
    const p = prog(u3, 131.5, 137);
    stage(ctx, 'ext', t3, u3, { cam: [[1.75, 1.52, lerp(8.5, 3.1, E.inQuad(p))], [1.7, 1.5, 2.4], 40, 0.01], window: 0, lantern: 0, smoke: 0, near: 2, far: 22, fogCol: [0.14, 0.16, 0.22], ghost: E.inQuad(prog(u3, 134.2, 136.7)) * (0.85 + 0.15 * noise1(u * 9, 4)) });
    vignette(ctx, 1.3);
  }],
  // 30. SCARE
  [136.86, 138, (ctx, u, t, u3, t3) => {
    const a = u - 137;
    const L = clamp((u - 136.86) / 0.3);
    const sh = 26 * Math.exp(-a * 3);
    ctx.save(); ctx.translate(sh * noise1(u * 70, 1), sh * noise1(u * 70, 2));
    stage(ctx, 'face', t, u, { lunge: L, mouth: 0.35 + 0.65 * E.outCubic(clamp(a / 0.5)), snap: 1.8 }, { bleed: 4, tear: Math.floor(u * 16) % 2 ? [[Math.floor(hash01(Math.floor(u * 16), 4) * 200), Math.floor(hash01(Math.floor(u * 16), 4) * 200) + 16, 18]] : null, s: 1.04 });
    ctx.restore();
    vignette(ctx, 1);
  }],
  // 31. THE BELL WITCH
  [138, 144.01, (ctx, u, t, u3, t3) => title(ctx, u, t, u3, t3)],
];

// shots 8-12: KNOCKING / SCRATCHING / GNAWING / CHAINS, then all four on half-beat cuts
function montage(ctx, u, t, u3, t3) {
  const words = [['KNOCKING.', 31], ['SCRATCHING.', 33], ['GNAWING.', 35], ['CHAINS.', 37]];
  const which = u < 39 ? Math.floor((u - 31) / 2) : [0, 1, 2, 3][Math.floor((u - 39) * 2) % 4];
  const knocks = [31, 31.5, 32, 32.5, 39.5, 40, 40.5];
  const kn = since(u, knocks);
  const o = { quilt: 0, fire: 0.45, candle: 1, moon: 0.9 };
  let c;
  if (which === 0) { c = [[-1.4, 1.5, 0.7], [-1.75, 1.45, -2.6], 52, 0]; o.knock = kn; o.scratch = 0; o.extra = { pos: [-1.6, 1.7, -1.3], col: [1.1, 0.75, 0.45], r: 3.2 }; if (kn != null) { const a = Math.exp(-kn * 9); c[0][2] += a * 0.12; c[3] = a * 0.05 * noise1(u * 40, 2); } }
  if (which === 1) { o.extra = { pos: [-2.2, 1.7, -1.7], col: [0.75, 0.8, 1.1], r: 2.4 }; c = [[-1.95, 1.5, -1.0], [-2.55, 1.55, -2.6], 46, 0.05]; o.scratch = clamp(0.02 + (u < 39 ? prog(u3, 33, 35) : 1) * 0.3); }
  if (which === 2) { o.extra = { pos: [-2.6, 1.0, 1.2], col: [0.9, 0.6, 0.35], r: 1.8 }; c = [[-2.45, 0.85, 1.35], [-3.05, 0.6, 0.4], 44, -0.05]; o.gnaw = (ub(t3) - 35) % (u < 39 ? 99 : 0.5) + (u < 39 ? 0 : 0.1); o.scratch = 0.32; }
  if (which === 3) { o.extra = { pos: [-0.6, 0.7, 1.9], col: [0.7, 0.7, 0.95], r: 2.6 }; c = [[0.2, 0.4, 2.35], [-1.1, 0.08, 1.3], 50, 0.03]; o.chain = u < 39 ? prog(u3, 37, 39) * 0.8 : 0.8 + (u - 39) * 0.2; o.scratch = 0.32; }
  const d = u - (u < 39 ? 31 + which * 2 : 39 + Math.floor((u - 39) * 2) * 0.5);
  c[0][0] += 0.05 * Math.sin(u * 1.3); c[0][2] -= d * 0.06;
  stage(ctx, 'int', t3, u3, { cam: c, ...o }, { bleed: d < 0.15 ? 3 : 1, tear: d < 0.08 ? [[20 + which * 40, 50 + which * 40, 8]] : null });
  vignette(ctx, 1.1);
  // the words: one at a time, then all four stacked
  const sz = PORT ? M.fitSize(ctx, 'SCRATCHING.', 400, DISPLAY, SAFE.w * 0.8, 160, -0.02) : 200;
  if (u < 39) {
    const [wd, w0] = words[which];
    stamp(ctx, wd, fs(SAFE.x, W / 2), fs(H * 0.62, H * 0.42), sz, C.bone, u, w0, { align: fs('left', 'center') });
  } else {
    const lh = sz * 0.9;
    const y0 = fs(H * 0.5 - lh * 1.2, H * 0.3);
    words.forEach(([wd], i) => stamp(ctx, wd, fs(SAFE.x + i * 60, W / 2), y0 + i * lh, sz * (PORT ? 0.95 : 0.85), i === which ? C.blood : C.bone, u, 39 + i * 0.25, { align: fs('left', 'center'), ghost: 0.7 }));
  }
}

function title(ctx, u, t, u3, t3) {
  // the cabin, barely there, behind the title
  stage(ctx, 'ext', t3, u3, { cam: [[-4, 1.4, 16], [0, 2.2, 0], 34, 0], window: 0, lantern: 0, smoke: 0, near: 2, far: 24 }, { alpha: 0.5 });
  vignette(ctx, 1.4);
  black(ctx, 0.35);
  const kn = since(u, [141, 141.75, 142.5]);
  const jolt = kn != null ? Math.exp(-kn * 8) : 0;
  ctx.save();
  ctx.translate(jolt * 14 * noise1(u * 60, 1), jolt * 10 * noise1(u * 60, 2));
  if (PORT) {
    const sz = 300;
    stamp(ctx, 'THE', W / 2, H * 0.36, 120, C.bone, u, 138, { align: 'center', ghost: 0.5 });
    stamp(ctx, 'BELL', W / 2, H * 0.36 + 270, sz, C.blood, u, 138, { align: 'center' });
    stamp(ctx, 'WITCH', W / 2, H * 0.36 + 270 + sz * 0.88, sz * 0.92, C.blood, u, 138, { align: 'center' });
    typeOn(ctx, 'ADAMS, TENNESSEE', W / 2, H * 0.36 + 270 + sz * 0.88 + 120, 64, C.bone, u, 139, 26, { align: 'center', cursor: false });
    typeOn(ctx, '1817–1821', W / 2, H * 0.36 + 270 + sz * 0.88 + 195, 64, C.bone, u, 139.6, 26, { align: 'center', cursor: false });
    typeOn(ctx, "AMERICA'S GREATEST", W / 2, H * 0.36 + 270 + sz * 0.88 + 300, 54, C.ember, u, 140, 26, { align: 'center', cursor: false });
    typeOn(ctx, 'GHOST STORY', W / 2, H * 0.36 + 270 + sz * 0.88 + 365, 54, C.ember, u, 140.7, 26, { align: 'center', cursor: false });
  } else {
    const tsz = M.fitSize(ctx, 'BELL WITCH', 400, DISPLAY, SAFE.w * 0.94, 270, -0.03);
    stamp(ctx, 'THE', W / 2, H * 0.4, 90, C.bone, u, 138, { align: 'center', ghost: 0.5 });
    stamp(ctx, 'BELL WITCH', W / 2, H * 0.4 + tsz * 0.82, tsz, C.blood, u, 138, { align: 'center', track: -0.03 });
    typeOn(ctx, 'ADAMS, TENNESSEE · 1817–1821', W / 2, H * 0.4 + tsz * 0.82 + 110, 66, C.bone, u, 139, 26, { align: 'center', cursor: false });
    typeOn(ctx, "AMERICA'S GREATEST GHOST STORY", W / 2, H * 0.4 + tsz * 0.82 + 190, 56, C.ember, u, 140, 26, { align: 'center', cursor: false });
  }
  ctx.restore();
  if (u >= 143.5) black(ctx, 1);
}

// ---------------------------------------------------------------- post: grain, scanlines, dust, VHS

function makePost() {
  for (let k = 0; k < 4; k++) {
    const cv = document.createElement('canvas'); cv.width = 384; cv.height = 384;
    const c = cv.getContext('2d'), img = c.createImageData(384, 384), r = M.mulberry32(900 + k);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 120; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    c.putImageData(img, 0, 0);
    GRAIN.push(cv);
  }
  SCAN = document.createElement('canvas'); SCAN.width = W; SCAN.height = H;
  const sc = SCAN.getContext('2d');
  sc.fillStyle = 'rgba(0,0,0,0.30)';
  for (let y = 4; y < H; y += 5) sc.fillRect(0, y, W, 1);
  VIG = document.createElement('canvas'); VIG.width = W; VIG.height = H;
  const vc = VIG.getContext('2d');
  const g = vc.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.56);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.7, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
  vc.fillStyle = g; vc.fillRect(0, 0, W, H);
}

function post(ctx, u, t) {
  const fr = Math.floor(t * 24);
  // grain (24 fps, like film)
  const tile = GRAIN[fr % 4];
  const pat = ctx.createPattern(tile, 'repeat');
  pat.setTransform(new DOMMatrix().translate(Math.floor(hash01(fr, 1) * 384), Math.floor(hash01(fr, 2) * 384)));
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // dust + scratches: a couple of frames at a time
  const r = M.mulberry32(fr * 7 + 3);
  if (r() < 0.22) { ctx.save(); ctx.fillStyle = 'rgba(230,220,200,0.35)'; const x = r() * W; ctx.fillRect(x, 0, 2, H); ctx.restore(); }
  for (let i = 0; i < 3; i++) if (r() < 0.35) { ctx.save(); ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.6)' : 'rgba(240,230,210,0.4)'; ctx.beginPath(); ctx.arc(r() * W, r() * H, 1 + r() * 4, 0, M.TAU); ctx.fill(); ctx.restore(); }
  ctx.drawImage(SCAN, 0, 0);
  // gate weave: the whole frame breathes a pixel or two
  // (done by drawing over itself would cost a full copy; scanline crawl is enough)
}

// ---------------------------------------------------------------- film

M.film({
  fonts: [`400 100px ${DISPLAY}`, `italic 400 100px ${DISPLAY}`, `400 40px ${UI}`],
  hits: HITS,
  samples: 1,
  async init() {
    P.initPS1();
    S.initWorld();
    SETS.ext = S.exteriorSet();
    SETS.corn = S.cornSet();
    SETS.int = S.interiorSet();
    SETS.grave = S.graveSet();
    SETS.face = S.faceSet();
    makePost();
    window.SETS = SETS;
    // compile every set once so the first real frame doesn't pay for it
    for (const k of Object.keys(SETS)) P.renderSet(SETS[k], 0, 0, {});
  },
  draw(ctx, u, t) {
    fill(ctx, '#000');
    const t3 = Math.floor(t * 30) / 30, u3 = ub(t3);
    const shot = SHOTS.find(([a, b]) => u >= a && u < b) || SHOTS[SHOTS.length - 1];
    shot[2](ctx, u, t, u3, t3);
  },
  post,
});
