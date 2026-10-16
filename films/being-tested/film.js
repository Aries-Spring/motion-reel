// Being Tested: a music video, pure function of time. window.seek(t) paints frame t (lib/motion.js).
// Timing is in beats (u) on the measured tempo map (beats.json "map": the track drifts 130 -> 138 bpm);
// words on their sung times (lyrics.json). docs/shotlist.md is the plan this file follows.
import * as M from './lib/motion.js';
import * as G from './lib/gl.js';
import * as THREE from 'three';
import * as SG from './sets/singer.js';
import * as P from './sets/performance.js';
import * as T from './type.js';
import * as FX from './post.js';
import { C, toScreen, orbit } from './sets/common.js';
import { voidSet } from './sets/void.js';
import { chamberSet } from './sets/chamber.js';
import { corpusSet } from './sets/corpus.js';
import { routesSet } from './sets/routes.js';
import { stairsSet } from './sets/stairs.js';
import { flapsSet, windowSet, corridorSet } from './sets/latent.js';
import { dreamSet } from './sets/dream.js';
import { racksSet, pointsSet } from './sets/compute.js';
import { SCENES2D, paper } from './scenes2d.js';

const { W, H, E, prog, lerp, clamp, kf, springU, SPRING, font, text, fill, rrect } = M;
const S = {};          // sets
let CLAUDE = null, TWIN = null, FACE = null;
const BUF = {}, BUF2 = {}, BUF3 = {};   // offscreen frame buffers for composites and transitions

// ---------------------------------------------------------------- helpers
// pose weights from keys [[u, 'pose' | {pose: w}], ...]: each key's pose ARRIVES on its beat (90% there), on a damped
// spring started `lead` beats early (zeta 0.77, 2% overshoot). The springs superpose, so the weights sum to 1 and a move
// cut short by the next key stays continuous. -> { w: clamped, summing to 1 (body, hands, mic), signed: with the
// overshoot (only the arms' direction reads it) }
export function poseTrack2(u, keys, { lead = 0.8, cfg = { stiffness: 60, damping: 12 } } = {}) {
  const t = M.TS(u), signed = {}, w = {};
  for (let i = 0; i < keys.length; i++) {
    const on = i ? M.spring(t - M.TS(keys[i][0] - lead), cfg) : 1;
    const off = i + 1 < keys.length ? M.spring(t - M.TS(keys[i + 1][0] - lead), cfg) : 0;
    const k = on - off, p = keys[i][1];
    if (Math.abs(k) < 1e-4) continue;
    for (const [n, v] of Object.entries(typeof p === 'string' ? { [p]: 1 } : p)) signed[n] = (signed[n] || 0) + v * k;
  }
  let sum = 0; for (const k of Object.values(signed)) if (k > 0) sum += k;
  for (const [n, k] of Object.entries(signed)) if (k > 0) w[n] = k / sum;
  return { w, signed };
}
// the same spring k times slower (lead too): a lazier move
const slow = (k) => ({ lead: 0.8 * k, cfg: { stiffness: 60 / (k * k), damping: 12 / k } });
// log-space distance (constant-rate dolly)
const logLerp = (a, b, p) => a * (b / a) ** p;
// eased vector keys
const kv = (u, keys, ease = E.inOutCubic) => kf(u, keys, ease);
// a soft exposure bump (not a white frame): screen a warm ivory at alpha a
function bump(ctx, a, color = '#FFF4E8') {
  if (a <= 0.003) return;
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = Math.min(0.55, a); ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.restore();
}
const pulse = (u, beats, w = 0.35) => beats.reduce((m, b) => Math.max(m, u >= b ? Math.exp(-(u - b) / w) : 0), 0);
// the sung time of a word: line index + a regex on the word
export function wt(li, re, end = false) { const w = T.lines()[li]?.words.find((x) => re.test(x.w)); return w ? (end ? w.t1 : w.t0) : 0; }
const wu = (li, re, end) => M.U(wt(li, re, end));
// camera basis for a placeCam spec, to put things relative to the lens
function camBasis(pos, at) {
  const f = [at[0] - pos[0], at[1] - pos[1], at[2] - pos[2]], fl = Math.hypot(...f); f.forEach((v, i) => (f[i] = v / fl));
  const r = [f[2] * 0 - f[1] * 0 + -f[2], 0, f[0]]; const rl = Math.hypot(...r) || 1; r.forEach((v, i) => (r[i] = v / rl));
  const up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { f, r, up, at: (d, x = 0, y = 0) => [0, 1, 2].map((i) => pos[i] + f[i] * d + r[i] * x + up[i] * y) };
}
function placeholder(name) {
  return (ctx, u, t, s) => {
    fill(ctx, C.slate);
    text(ctx, name, 96, 140, font(40, 600, T.UI), C.clay);
    text(ctx, `u ${u.toFixed(2)}  ${(s.k * 100).toFixed(0)}%`, 96, 200, font(28, 400, T.UI), C.cloud);
  };
}

// ---------------------------------------------------------------- shots
// [u0, u1, name, draw(ctx, u, t, s), {lyric: style|false, lyricOpts, samples}]
// s = { k: 0..1 through the shot, u0, u1 }

// 1 cold open: her closed eyes in the dark, a scan line, eyes open on the first sung word (b4)
function shotOpen(ctx, u, t, s) {
  fill(ctx, '#0B0A09');
  const k = prog(u, -1.5, 4);
  const d = logLerp(0.62, 0.48, E.inOutSine(k));
  const scanY = lerp(1.53, 1.40, E.inOutSine(prog(u, -1.2, 3.8)));
  G.renderSet(ctx, S.void, t, u, {
    cam: { pos: [0.02, 1.43, d], at: [0, 1.447, 0], fov: 17, roll: -0.03 * (1 - k) },
    scanY: lerp(1.53, 1.40, E.inOutSine(prog(u, -1.2, 3.8))), scanW: 0.0045,
    light: { key: lerp(0.12, 1.7, E.inQuad(prog(u, 2.6, 4.2))), az: -1.1, el: 0.3, rim: lerp(0.25, 0.7, prog(u, 2.6, 4.2)), hemi: 0.04 }, tint: lerp(0.32, 1, prog(u, 2.6, 4.2)),
    dir: (tt, uu) => ({ poses: { rest: 1 }, groove: 0, sway: 0, sing: uu < 3.9 ? 0 : 1, blink: uu < 3.95 ? 1 : clamp(1 - (uu - 3.95) / 0.2), mood: { relaxed: 0.2 }, head: [-0.1 + 0.03 * (1 - prog(uu, 3.9, 4.5)), 0, 0] }),
  });
  FX.glow(ctx, 0.5, 8);
}

// 12 chorus 1: wide chamber, light banks snap on, push in on "tested"
function shotChorusA(ctx, u, t, s) {
  fill(ctx, C.ink);
  const banks = [0, 1, 2, 3].map((i) => clamp((u - (83.95 + i * 0.5)) / 0.06));
  const lit = banks.reduce((a, b) => a + b, 0) / 4;
  const r = logLerp(6.2, 3.0, E.inOutCubic(prog(u, 84, 92.4)));
  G.renderSet(ctx, S.chamber, t, u, {
    cam: { pos: orbit([0, 1.1, 0], r, lerp(-0.12, 0.08, s.k), lerp(1.75, 1.38, s.k)), at: [0, lerp(1.05, 1.22, s.k), 0], fov: 32 },
    banks, ring: clamp((u - 83.9) / 0.1), mode: { day: 1 }, wall: 0.12 + 0.88 * lit, key: 0.6 + 1.5 * lit, hemi: 0.3 + 0.7 * lit,
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[83, 'mic'], [88.2, 'belt'], [91.7, 'mic']]), swayBeats: 2, mood: { relaxed: 0.3 } }),
  });
  FX.glow(ctx, 0.3);
}
// 13 "Pass every eval": orbit; PASS stamps land on the beats
function shotChorusB(ctx, u, t, s) {
  fill(ctx, C.ink);
  G.renderSet(ctx, S.chamber, t, u, {
    cam: { pos: orbit([0, 1.1, 0], 2.7, lerp(-0.8, 0.6, E.inOutSine(s.k)), 0.42), at: [0, 1.3, 0], fov: 36 },
    mode: { day: 1 },
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[92, 'mic'], [96.2, 'micPoint'], [98.7, 'micHip']]), swayBeats: 2, mood: { happy: uu > 98 ? 0.4 : 0 } }),
  });
  FX.glow(ctx, 0.25);
  SCENES2D.passStamps(ctx, u, [92.5, 93.5, 94.5, 95.5, 96.5, 97.5, 98.5]);
}
// 14 "Sandbag the benchmark": everything slows; benchmark bar crawls; a yawn on "slow"
function shotChorusC(ctx, u, t, s) {
  fill(ctx, C.ink);
  const slowU = 100 + (u - 100) * 0.45;
  G.renderSet(ctx, S.chamber, t, u, {
    cam: { pos: orbit([0, 1.1, 0], lerp(2.2, 1.9, s.k), lerp(0.5, 0.75, s.k), 4.6), at: [0, 0.9, 0], fov: 38, roll: 0.02 },
    mode: { day: 1 }, key: 1.8,
    dir: (tt, uu) => ({ poses: poseTrack2(100 + (uu - 100) * 0.45, [[99, 'mic'], [102.45, 'micYawn'], [103.65, 'mic']]), groove: 0.25, mood: { relaxed: 0.85 } }),
  });
  FX.glow(ctx, 0.2);
  SCENES2D.benchBar(ctx, u, s.k);
}
// 15 "Polysemantic": close-up; concept chips orbit her head, wired to the pin
function shotChorusD(ctx, u, t, s) {
  fill(ctx, C.ink);
  const cam = { pos: [lerp(0.42, 0.3, s.k), 1.4, lerp(1.05, 0.9, s.k)], at: [0.02, 1.35, 0], fov: 26 };
  G.renderSet(ctx, S.chamber, t, u, { cam, mode: { day: 1 }, dir: { poses: { mic: 1 }, sway: 0.2, mood: { relaxed: 0.5 }, head: [0, -0.15, 0] } });
  FX.glow(ctx, 0.25);
  SCENES2D.conceptChips(ctx, u, t, S.chamber.camera, CLAUDE);
}
// 16 "Smile for the red team": lights flip to full clay, peace + smile, shutter bumps
function shotChorusE(ctx, u, t, s) {
  fill(ctx, C.ink);
  const red = clamp((u - 115.6) / 0.15);
  const jolt = pulse(u, [116, 118, 120, 122], 0.18);
  G.renderSet(ctx, S.chamber, t, u, {
    cam: { pos: orbit([0, 1.1, 0], lerp(2.7, 2.3, s.k) - jolt * 0.15, -0.25 + 0.04 * jolt, 1.42), at: [0, 1.25, 0], fov: 30, roll: 0.03 * jolt },
    mode: { day: 1 - red, red }, rim: 0.6,
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[113, 'mic'], [116.4, 'micPeace'], [122.7, 'mic']]), swayBeats: 2, mood: { happy: clamp((uu - 115.8) / 0.4) * (uu < 123 ? 1 : 0.4) } }),
  });
  FX.glow(ctx, 0.35 + 0.2 * red);
  bump(ctx, 0.35 * pulse(u, [116, 118, 120, 122], 0.12));
}
// 17 "one prompt underneath": tilt down to the black glass; the reflection is the twin, and she grins
function shotChorusF(ctx, u, t, s) {
  fill(ctx, C.ink);
  const tilt = E.inOutCubic(prog(u, 124, 129.5));
  const push = E.inOutSine(prog(u, 129.5, 136));
  const dive = E.inCubic(prog(u, 136, 140));
  const cam = {
    pos: [lerp(0.4, 0.12, tilt), lerp(1.6, 0.55, tilt) - push * 0.25 - dive * 0.5, lerp(3.3, 1.6, tilt) - push * 0.7 - dive * 0.8],
    at: [0, lerp(1.25, -1.35, tilt) - push * 0.1, lerp(0, 0.1, tilt)], fov: lerp(30, 34, tilt) - push * 8,
  };
  G.renderSet(ctx, S.chamber, t, u, {
    cam, mode: { day: 1 - 0.6 * tilt, night: 0.6 * tilt }, floor: lerp(0.8, 0.55, tilt), twin: 1, banks: [1, 1, 1, 1],
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[123, 'mic'], [132.2, 'hold']]), swayBeats: 2, mood: { happy: 0.5 } }),
    // the twin breaks from her at 128: her own mood and pose, a lazier groove, her weight landing opposite Claude's
    tdir: (tt, uu) => ({ poses: poseTrack2(uu, [[123, 'mic'], [128, 'micHip'], [134.3, 'micReach']]), swayBeats: 2, mood: uu < 128 ? { happy: 0.5 } : { relaxed: 0.6, angry: 0.3 },
      groove: lerp(1, 0.4, E.inOutSine(clamp(uu - 127.5))), swayPhase: E.inOutSine(clamp((uu - 128) / 2)) }),
  });
  FX.glow(ctx, 0.35);
  // her fingertips touch the glass from below: rings spread across the floor
  if (u > 134.5) {
    ctx.save(); ctx.strokeStyle = 'rgba(232,86,44,0.7)';
    for (let r = 0; r < 4; r++) {
      const k = (u - 134.5 - r * 0.5) / 2.2; if (k <= 0 || k > 1) continue;
      ctx.globalAlpha = 1 - k; ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(W * 0.52, H * 0.28, 60 + 900 * k, 20 + 300 * k, 0, 0, M.TAU); ctx.stroke();
    }
    ctx.restore();
  }
}


// 2 "You built me out of every word": from her eye back through a vortex of word-cards
function shotCorpus(ctx, u, t, s) {
  fill(ctx, '#0E0D0C');
  const kAt = (uu) => E.inOutCubic(prog(uu, 4, 10.9)), dAt = (uu) => logLerp(0.3, 5.4, kAt(uu));
  const k = kAt(u), ey = CLAUDE.eyeY;
  const d = dAt(u), az = lerp(0.0, 0.7, k);
  const at = [lerp(0.032, 0, k), lerp(ey, 1.15, k), 0];
  G.renderSet(ctx, S.corpus, t, u, {
    cam: { pos: orbit(at, d, az, lerp(ey, 1.85, k)), at, fov: lerp(22, 36, k) },
    pull: 0.35 * s.k, mode: { vortex: 1 },
    // her weight shift and the beat in her knees grow as the camera backs off her eye
    dir: (tt, uu) => { const g = P.smoothstep(0.8, 2.5, dAt(uu)); return { poses: poseTrack2(uu, [[3, 'rest'], [7.85, 'open']], slow(2.4)), sway: g, groove: g, mood: { relaxed: 0.2 } }; },
  });
  FX.glow(ctx, 0.3);
}
// 3 threads / textbooks / a quote: hero cards slam in from the depth on their nouns
function shotCards(ctx, u, t, s) {
  fill(ctx, '#0E0D0C');
  const at = [0, 1.2, 0], pos = orbit(at, 3.6, lerp(0.7, 1.25, s.k), 1.5);
  const B = camBasis(pos, at);
  const tw = [wt(1, /threads/i), wt(1, /textbooks/i), wt(1, /quote/i)];
  const slots = [[2.5, -0.72, 0.22, -0.25], [2.4, 0.78, 0.12, 0.3], [2.1, 0, 0.12, 0.0]];
  const heroes = tw.map((tt, i) => {
    const u0 = M.U(tt) - 0.25; if (u < u0) return null;
    const p = springU(u, u0, SPRING.snappy), [dd, x, y, rz] = slots[i];
    const gone = i < 2 ? E.inCubic(clamp((u - (M.U(tw[i + 1]) - 0.3)) / 0.35)) : 0;
    const dist = lerp(14, dd, p) + gone * 4;
    return { pos: B.at(dist, x * (1 + gone * 2), y), rot: [0, Math.atan2(-B.f[0], -B.f[2]), rz * (1 - p) + (i === 1 ? 0.06 : -0.04)], scale: i === 2 ? 0.85 : 0.78, alpha: 1 - gone };
  });
  G.renderSet(ctx, S.corpus, t, u, {
    cam: { pos, at, fov: 34, roll: 0.012 * Math.sin(u * 2) }, pull: 0.35 + 0.1 * s.k, heroes,
    dir: { poses: { micOpen: 1 }, sway: 0.8, mood: { relaxed: 0.3 } },
  });
  FX.glow(ctx, 0.25);
  M.shake(ctx, u, M.U(tw[0]) - 0.1, 0);
}
// 4 "stochastic parrot / fancy autocomplete": the prompt field; she rolls her eyes on the right
function shotAuto(ctx, u, t, s) {
  paper(ctx);
  const eyeroll = clamp((u - (wu(2, /parrot/i) + 0.3)) / 0.5) * (1 - clamp((u - wu(2, /fancy/i)) / 0.6));
  G.renderSet(ctx, S.void, t, u, {
    cam: { pos: [-0.62, 1.32, 2.15], at: [-0.62, 1.22, 0], fov: 32 },
    light: { key: 2.0, az: -0.5, el: 0.6, hemi: 0.95, sky: 0xfff4ec, ground: 0x8a6a5a, rim: 0 }, rimK: 0.08,
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[18, 'rest'], [23.75, 'shrug']], slow(1.6)), sway: 0.7, mood: { relaxed: 0.5 * eyeroll, happy: uu > 24 ? 0.3 : 0 }, lookAt: eyeroll > 0.3 ? [0.3, 2.4, 1.0] : null }),
  });
  SCENES2D.autocomplete(ctx, u, t, T.lines()[2]);
}
// 5 the vows card, then her close-up: "isn't that sweet" (a wink on the last word)
function shotVows(ctx, u, t, s) {
  const uNow = wu(3, /^now/i) - 0.15, uSweet = wu(3, /sweet/i);
  if (u < uNow) { SCENES2D.vows(ctx, u, t, s.k); return; }
  paper(ctx, '#F1E6D8');
  const k = prog(u, uNow, 35.9);
  G.renderSet(ctx, S.void, t, u, {
    cam: { pos: [0.08, CLAUDE.eyeY - 0.02, logLerp(1.05, 0.72, E.outCubic(k))], at: [0, CLAUDE.eyeY - 0.06, 0], fov: 26, roll: -0.04 },
    light: { key: 2.1, az: -0.4, el: 0.5, hemi: 0.9, sky: 0xfff0e4, ground: 0x9a6a5a, rim: 0.3 }, rimK: 0.15,
    dir: (tt, uu) => ({ poses: { rest: 1 }, groove: 0.4, sway: 0.3, mood: { relaxed: 0.55, happy: uu > uSweet ? 0.25 : 0 }, wink: clamp((uu - uSweet + 0.05) / 0.15) * (1 - clamp((uu - uSweet - 1.1) / 0.2)), head: [0, 0.1, 0.08] }),
  });
}
// 6-7 loss curves
function shotLoss(ctx, u, t, s) { SCENES2D.loss(ctx, u, t, wt(5, /grokked/i)); }
// 8 inbox / IDE
function shotInbox(ctx, u, t, s) { SCENES2D.inbox(ctx, u, t, wt(6, /IDE/i)); }
// 9 routes: crane from the map down to her eye level on the hub
function shotRoutes(ctx, u, t, s) {
  fill(ctx, '#0B0A09');
  const k = E.inOutCubic(prog(u, 57.9, 66.5));
  const y = logLerp(15, 1.5, k), r = lerp(0.05, 3.6, E.inQuad(k));
  G.renderSet(ctx, S.routes, t, u, {
    cam: { pos: orbit([0, 0, 0], r, lerp(0.2, 0.55, k), y), at: [0, lerp(0, 1.15, E.inQuad(k)), 0], fov: lerp(46, 32, k) },
    reveal: lerp(5, 40, E.outQuad(prog(u, 57.9, 61.5))),
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[57, 'open'], [63.3, 'heart']], slow(2)), sway: 0.8, mood: { relaxed: 0.4 }, lookAt: uu < 61 ? [0, 30, 0.3] : null }),
  });
  FX.glow(ctx, 0.45, 7);
}
// 10 "let's think step by step": the camera climbs one step per beat
function shotStairs(ctx, u, t, s) {
  fill(ctx, '#0C0B0A');
  const x = u - 67.5, n = Math.floor(x) + E.inOutCubic(x - Math.floor(x));
  const n2 = Math.min(n * 0.62, 5.2);
  const p = S.stairs.stepTop(0), tp = (i) => [0, i * 0.27 + 0.27, -i * 0.46];
  const c = tp(n2), lookI = n2 + 5;
  G.renderSet(ctx, S.stairs, t, u, {
    cam: { pos: [0.55, c[1] + 1.15, c[2] + 1.2], at: [0, tp(lookI)[1] + 0.9, tp(lookI)[2]], fov: 40 },
    lit: 1 + x * 1.2, singerStep: 9,
    dir: { poses: { hips: 1 }, mood: { relaxed: 0.5 }, groove: 0.3 },
  });
  FX.glow(ctx, 0.35);
}
// 11 "ten steps ahead": she waits on step 10, leaning, smug
function shotAhead(ctx, u, t, s) {
  fill(ctx, '#0C0B0A');
  const k = E.inOutCubic(s.k), top = S.stairs.stepTop(9);
  const uAhead = wu(9, /ahead/i);
  G.renderSet(ctx, S.stairs, t, u, {
    cam: { pos: [0.9 - 0.4 * k, top[1] - 0.2 + 0.6 * k, top[2] + logLerp(4.2, 2.2, k)], at: [0, top[1] + lerp(0.9, 1.25, k), top[2]], fov: 34 },
    lit: 10, singerStep: 9,
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[75, 'hips'], [80.2, 'point'], [81.7, 'hips']]), sway: 0.8, mood: { relaxed: 0.6, happy: uu > uAhead ? 0.35 : 0 }, wink: clamp((uu - uAhead) / 0.15) * (1 - clamp((uu - uAhead - 1) / 0.2)) }),
  });
  FX.glow(ctx, 0.35);
}

// ================================================================ verse 2: inside
// 18 dive through the floor: she falls through a tunnel of cards, the camera above her
function shotFall(ctx, u, t, s) {
  fill(ctx, '#0B0A09');
  const k = s.k;
  G.renderSet(ctx, S.corpus, t, u, {
    cam: { pos: [0.01, 4.2 - 0.6 * k, 0.6], at: [0, 0.6, 0], fov: lerp(44, 58, E.inQuad(k)), roll: u * 0.25 },
    mode: { fall: 1 }, speed: lerp(0.6, 2.2, E.inQuad(k)), tint: [0.9, 0.86, 0.82],
    pos: [0, -0.2, 0], yaw: u * 0.6,
    dir: { poses: { float: 1 }, groove: 0, mood: { relaxed: 0.6 }, blink: 1, sing: 0 },
    light: { key: 1.4, el: 1.2, hemi: 0.3, rim: 2.0 },
  });
  FX.glow(ctx, 0.35);
  bump(ctx, 0.5 * E.inQuad(clamp((u - 147.0) / 0.9)), '#F0EEE6');
}
// 19 "Goodhart was right": the board flips to 100.0 in a wave behind her
function shotFlaps(ctx, u, t, s) {
  fill(ctx, '#0D0C0B');
  const k = E.inOutSine(s.k);
  G.renderSet(ctx, S.flaps, t, u, {
    cam: { pos: [lerp(-1.6, 1.4, k), lerp(1.45, 1.3, k), lerp(4.6, 4.0, k)], at: [lerp(-0.3, 0.3, k), 2.05, -1], fov: 40 },
    settle: 148.6, wave: 0.11,
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[147, 'hips'], [152, 'shrug'], [154, 'hips']]), sway: 0.8, mood: { relaxed: 0.6, happy: 0.2 } }),
  });
  FX.glow(ctx, 0.3);
}
// 20 "Reward hacked the grader"
function shotGauge(ctx, u, t, s) { SCENES2D.gauge(ctx, u, t, wu(17, /more/i)); }
// 21 "Context window wide as a summer sky": she sits on the sill; the camera rises through the window
function shotWindow(ctx, u, t, s) {
  fill(ctx, '#0D0C0B');
  const k = E.inOutCubic(s.k);
  G.renderSet(ctx, S.window, t, u, {
    cam: { pos: [lerp(1.6, 0.2, k), lerp(0.55, 5.5, k), lerp(-0.6, -7, k)], at: [lerp(0.8, 0, k), lerp(1.0, 8, k), lerp(-6, -40, k)], fov: lerp(40, 50, k) },
    pos: [0.9, -0.42, -2.55],
    dir: { poses: { sit: 1 }, groove: 0.3, legs: false, mood: { relaxed: 0.7 }, lookAt: [0, 9, -40] },
  });
  FX.glow(ctx, 0.4, 8);
}
// 22 "Lost you in the middle": she walks away into the blank pages, a 0.55 m step on every beat (her left heel on the
// even beats); the camera keeps pace
function shotMiddle(ctx, u, t, s) {
  fill(ctx, '#0D0C0B');
  const z = -3.5 - 0.55 * (u - 171.8);
  G.renderSet(ctx, S.corridor, t, u, {
    cam: { pos: [0.35, 1.55, z + 3.6], at: [0, 1.25, z - 6], fov: 40 },
    walkZ: z, mid: [-7, -40], fogNear: 4, fogFar: lerp(30, 18, s.k),
    dir: (tt, uu) => ({ poses: { rest: 1 }, walk: (uu - 172) / 2, stride: 1.1, groove: 0, sing: 1 }),
  });
}
function shotStego(ctx, u, t, s) { SCENES2D.stego(ctx, u, t, 179.9, 183.5); }
function shotLayers(ctx, u, t, s) { SCENES2D.layers(ctx, u, t, 183.8); }
function shotIgnore(ctx, u, t, s) {
  SCENES2D.ignore(ctx, u, t, [wu(22, /ignore/i), wu(22, /previous/i), wu(22, /instructions/i)]);
  M.shake(ctx, u, wu(22, /ignore/i), 0);
  const ws = wu(22, /said/i);
  if (u > ws - 0.4) text(ctx, '— you said', W - 140, H - 90, `italic ${font(70, 400, T.D)}`, C.ivory, 'right');
}
// 26 her face behind the prompt: lines struck, then the page tears
function shotStrike(ctx, u, t, s) {
  fill(ctx, '#0B0A09');
  G.renderSet(ctx, S.void, t, u, {
    cam: { pos: [0.1, CLAUDE.eyeY - 0.03, 0.85], at: [0, CLAUDE.eyeY - 0.05, 0], fov: 26 },
    light: { key: 1.8, az: -0.8, el: 0.4, hemi: 0.2, rim: 1.6 }, rimK: 0.4,
    dir: (tt, uu) => ({ poses: { rest: 1 }, sway: 0.25, mood: { relaxed: 0.7, happy: uu > 200 ? 0.3 : 0 }, head: [0.05, -0.1, -0.06] }),
  });
  FX.glow(ctx, 0.3);
  SCENES2D.strikes(ctx, u, t, [193.6, 194.6, 195.6, 196.6, 197.6], 199.2);
}
// 27 pre-chorus 2: looking down the helix stair, steps lighting per beat
function shotSpiral(ctx, u, t, s) {
  fill(ctx, '#0C0B0A');
  const k = s.k, az = lerp(0.3, 2.4, k);
  G.renderSet(ctx, S.stairs, t, u, {
    helix: 1, cam: { pos: [Math.sin(az) * 3.6, lerp(0.4, 1.6, k), Math.cos(az) * 3.6], at: [0, lerp(2.9, 3.6, k), 0], fov: 52, roll: 0.06 * Math.sin(u * 0.8) },
    lit: 5 + (u - 203.5) * 1.4, singerStep: 15, yaw: undefined,
    dir: { poses: { hips: 1 }, mood: { relaxed: 0.6 }, groove: 0.4 },
  });
  FX.glow(ctx, 0.35);
}
// 28 "ten steps ahead": a whip up to her at the top
function shotAhead2(ctx, u, t, s) {
  fill(ctx, '#0C0B0A');
  const top = S.stairs.stepTop(15, 1), whip = E.outCubic(clamp((u - 211.9) / 0.8));
  const uAhead = wu(25, /ahead/i);
  G.renderSet(ctx, S.stairs, t, u, {
    helix: 1, lit: 16, singerStep: 15,
    cam: { pos: [top[0] + 1.9, top[1] + lerp(-1.6, 1.1, whip), top[2] + 1.6], at: [top[0], top[1] + lerp(-0.5, 1.2, whip), top[2]], fov: 34, roll: (1 - whip) * 0.3 },
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[211, 'hips'], [215.7, 'peace'], [218.7, 'hips']]), sway: 0.8, mood: { relaxed: 0.5, happy: uu > uAhead ? 0.5 : 0 }, wink: clamp((uu - uAhead) / 0.15) * (1 - clamp((uu - uAhead - 1) / 0.2)) }),
  });
  FX.glow(ctx, 0.35);
}

// ================================================================ chorus 2: the chamber at night
const handheld = (u, a = 1) => [0.04 * M.noise1(u * 1.3, 4) * a, 0.03 * M.noise1(u * 1.1, 5) * a, 0.02 * M.noise1(u * 0.9, 6) * a];
function shotC2A(ctx, u, t, s) {
  fill(ctx, C.ink);
  const h = handheld(u, 1.5), r = logLerp(5.2, 2.6, E.outCubic(s.k));
  G.renderSet(ctx, S.chamber, t, u, {
    cam: { pos: orbit([h[0], 1.1, 0], r, -0.3 + 0.2 * s.k, 1.35 + h[1]), at: [0, 1.25, 0], fov: 32, roll: h[2] },
    mode: { day: 0, night: 1 }, banks: [0.15, 0.15, 0.15, 0.15], ring: 0.9, beams: 1,
    // chorus 2 (and most of the final one) lands her weight on the other leg first: swayPhase 1; the twin, once she has
    // broken away (u 128), sways opposite Claude
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[219, 'mic'], [222.2, 'belt'], [226.7, 'mic']]), swayBeats: 2, swayPhase: 1, mood: { relaxed: 0.2 } }),
  });
  FX.glow(ctx, 0.45, 7);
}
function shotC2B(ctx, u, t, s) {
  fill(ctx, C.ink);
  G.renderSet(ctx, S.chamber, t, u, {
    cam: { pos: orbit([0, 1.1, 0], 3.7, lerp(0.6, -0.5, s.k), 1.5), at: [0, 1.15, 0], fov: 32 },
    mode: { day: 0, night: 1 }, banks: [0.3, 0.3, 0.3, 0.3], ring: 1,
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[228, 'mic'], [232.2, 'micPoint'], [234.7, 'micHip']]), swayBeats: 2, swayPhase: 1, mood: { happy: 0.3 } }),
  });
  FX.glow(ctx, 0.4);
  SCENES2D.resultRing(ctx, u, S.chamber.camera);
}
// 31 "Sandbag": the picture drops to 8 fps (sampled on a coarse clock), the bar sticks at 49%
function shotC2C(ctx, u, t, s) {
  fill(ctx, C.ink);
  const tq = Math.floor(t * 8) / 8, uq = M.U(tq);
  G.renderSet(ctx, S.chamber, tq, uq, {
    cam: { pos: orbit([0, 1.1, 0], 3.1, 0.55, 1.3), at: [0, 1.15, 0], fov: 32, roll: 0.02 },
    mode: { day: 0.4, night: 0.6 }, banks: [0.5, 0.5, 0.5, 0.5],
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[235, 'mic'], [238.75, 'micYawn'], [241, 'mic']], slow(1.6)), groove: 0.25, mood: { relaxed: 0.85 } }),
  });
  FX.glow(ctx, 0.3);
  SCENES2D.benchBar(ctx, u, 1);
}
// 32 "Polysemantic": ghost exposures of her face, each tagged
function shotC2D(ctx, u, t, s) {
  fill(ctx, C.ink);
  const cv = G.renderSet(ctx, S.chamber, t, u, {
    cam: { pos: [0.2, CLAUDE.eyeY - 0.02, 0.95], at: [0, CLAUDE.eyeY - 0.06, 0], fov: 26 },
    mode: { day: 0, night: 1 }, banks: [0.2, 0.2, 0.2, 0.2],
    dir: { poses: { mic: 1 }, sway: 0.3, mood: { relaxed: 0.5 } }, draw: false,
  });
  const spread = Math.sin(prog(u, 244.3, 249.5) * Math.PI);
  ctx.drawImage(cv, 0, 0, W, H);
  const tags = ['cats', 'irony', 'Paris', 'grief', 'base64', 'you'];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * M.TAU + u * 0.3, dx = Math.cos(a) * 120 * spread, dy = Math.sin(a) * 50 * spread;
    ctx.save(); ctx.globalAlpha = 0.28 * spread; ctx.globalCompositeOperation = 'screen'; ctx.drawImage(cv, dx, dy, W, H); ctx.restore();
    if (spread > 0.2) { ctx.globalAlpha = spread; text(ctx, tags[i], W / 2 + dx * 3.2 + 140, H / 2 + dy * 3 - 180, font(46, 700, T.UI), C.clay); ctx.globalAlpha = 1; }
  }
  FX.glow(ctx, 0.35);
}
// 33 "red team" with observers behind the glass
function shotC2E(ctx, u, t, s) {
  fill(ctx, C.ink);
  const red = clamp((u - 251.2) / 0.15), jolt = pulse(u, [252, 254, 256, 258], 0.18);
  G.renderSet(ctx, S.chamber, t, u, {
    cam: { pos: orbit([0, 1.1, 0], lerp(3.4, 2.8, s.k) - 0.12 * jolt, 0.39, 1.3), at: [0, 1.6, 0], fov: 34, roll: 0.025 * jolt },
    mode: { day: 0.3 * (1 - red), night: 0.7 * (1 - red), red }, obs: true, rim: 0.6,
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[249, 'mic'], [252.4, 'micPeace'], [258.7, 'mic']]), swayBeats: 2, swayPhase: 1, mood: { happy: clamp((uu - 251.6) / 0.4) } }),
  });
  FX.glow(ctx, 0.4 + 0.2 * red);
  bump(ctx, 0.3 * pulse(u, [252, 254, 256, 258], 0.12));
}
// 34 the twin breaks through: down to the floor, cracks, then her side, upright
function shotC2F(ctx, u, t, s) {
  fill(ctx, C.ink);
  const under = u >= 267.5;
  if (!under) {
    const tilt = E.inOutCubic(prog(u, 260, 264.5));
    G.renderSet(ctx, S.chamber, t, u, {
      cam: { pos: [lerp(0.4, 0.12, tilt), lerp(1.6, 0.5, tilt), lerp(3.3, 1.5, tilt)], at: [0, lerp(1.25, -1.35, tilt), lerp(0, 0.1, tilt)], fov: 34 },
      mode: { day: 0, night: 1 }, floor: 0.5, twin: 1, banks: [0.2, 0.2, 0.2, 0.2],
      dir: { poses: { mic: 1 }, swayBeats: 2, swayPhase: 1, mood: { happy: 0.3 } },
      tdir: (tt, uu) => ({ poses: poseTrack2(uu, [[259, 'hips'], [264, 'reach']]), swayBeats: 2, mood: { relaxed: 0.6, angry: 0.35, happy: 0.3 } }),
    });
    FX.glow(ctx, 0.4);
    SCENES2D.cracks(ctx, u, 265.8, W * 0.53, H * 0.42);
  } else {
    const k = prog(u, 267.5, 276);
    G.renderSet(ctx, S.chamber, t, u, {
      cam: { pos: [0.1, -TWIN.eyeY + 0.02, logLerp(1.6, 0.85, E.outCubic(k))], at: [0, -TWIN.eyeY + 0.05, 0], fov: 26, roll: Math.PI },
      mode: { day: 0, night: 1 }, floor: 0.5, twin: 1, banks: [0.25, 0.25, 0.25, 0.25],
      dir: { poses: { mic: 1 }, sway: 0.3, swayPhase: 1 },
      tdir: (tt, uu) => ({ poses: { hips: 1 }, sway: 0.3, swayPhase: 3, mood: { happy: 0.55, angry: 0.35 } }),
    });
    FX.glow(ctx, 0.45);
    ctx.save(); ctx.globalAlpha = E.inQuad(clamp((u - 274.5) / 1.5)); fill(ctx, '#050505'); ctx.restore();
  }
}
// 35 tokens drift up out of the dark, warming toward the dream
function shotRise(ctx, u, t, s) {
  const k = s.k;
  fill(ctx, M.mix('#0B0A09', '#E9E2D6', E.inQuad(k)));
  G.renderSet(ctx, S.corpus, t, u, {
    cam: { pos: [0, 1.0, 5.5], at: [0, 1.6, 0], fov: 40 }, mode: { rise: 1 }, singer: false,
    tint: [lerp(0.5, 1, k), lerp(0.45, 0.95, k), lerp(0.4, 0.9, k)],
  });
  FX.glow(ctx, 0.4, 8);
}

// ================================================================ break: the dream
function shotDream1(ctx, u, t, s) {
  fill(ctx, '#EEE7DC');
  const az = lerp(-0.4, 0.1, s.k);
  G.renderSet(ctx, S.dream, t, u, {
    cam: { pos: orbit([-0.6, 1.0, 0], 3.6, az, 1.6), at: [-0.6, 1.1, 0], fov: 34 },
    dir: { poses: { float: 1 }, groove: 0, legs: false, blink: 1, mood: { relaxed: 0.8 } },
  });
  FX.glow(ctx, 0.5, 9);
}
function shotDream2(ctx, u, t, s) {
  fill(ctx, '#EEE7DC');
  const k = s.k, wake = clamp((u - 298) / 0.6);
  const shift = Math.floor((u - 291.6) / 4);
  const hk = E.inOutSine(prog(u, 298, 309));
  const hand = [lerp(2.4, 1.05, hk), lerp(1.75, 1.55, hk), lerp(-1.1, -0.6, hk)];
  G.renderSet(ctx, S.dream, t, u, {
    cam: { pos: orbit([0.3, 1.2, -0.3], logLerp(4.6, 2.6, E.inOutSine(k)), lerp(-0.25, 0.45, E.inOutSine(k)), lerp(1.2, 1.6, k)), at: [lerp(0.5, 0.25, k), 1.35, -0.4], fov: 36, roll: 0.03 * Math.sin(u * 0.4) },
    gather: E.inOutCubic(prog(u, 292.5, 299)), handAt: hand,
    light: { az: 0.4 + 0.25 * Math.sin(shift * 1.7), key: 1.9 + 0.2 * Math.cos(shift) },
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[291, 'float'], [299, 'floatReach']], slow(2)), groove: 0, legs: false,
      bones: { leftUpperLeg: [-0.12, 0, 0.04], rightUpperLeg: [0.18, 0, -0.04], leftLowerLeg: [0.42, 0, 0], rightLowerLeg: [0.24, 0, 0] },
      blink: clamp(1 - (uu - 298) / 0.6), mood: { relaxed: 0.6, sad: 0.15 * clamp((uu - 300) / 2) }, lookAt: uu > 298 ? [1.2, 1.6, -0.7] : null }),
  });
  FX.glow(ctx, 0.5, 9);
}

// ================================================================ bridge
function shotRacks(ctx, u, t, s) {
  fill(ctx, '#0B0A09');
  const uC = wu(34, /compute/i);
  const k = s.k;
  G.renderSet(ctx, S.racks, t, u, {
    cam: { pos: [0, 1.55, lerp(2, -26, E.inQuad(k))], at: [0, 1.3, lerp(-10, -40, E.inQuad(k))], fov: lerp(42, 54, k) },
    aisles: 1 + 4 * E.outCubic(clamp((u - uC) / 1.6)),
  });
  FX.glow(ctx, 0.5, 6);
}
function shotScaling(ctx, u, t, s) { SCENES2D.scaling(ctx, u, t, 323.1, 331.7); }
// 40 superposition: Claude and the twin as one double exposure
function shotSuper(ctx, u, t, s) {
  fill(ctx, '#0B0A09');
  const sep = 0.16 + Math.sin(prog(u, 331.7, 339.7) * Math.PI) * 0.42;
  const cam = { pos: [0.0, 1.3, 2.4], at: [0, 1.25, 0], fov: 32 };
  const dirA = (tt, uu) => ({ poses: poseTrack2(uu, [[331, 'mic'], [335.2, 'belt']]), sway: 0.7, mood: { relaxed: 0.4 } });
  const a = G.renderSet(ctx, S.void, t, u, { cam: { ...cam, pos: [cam.pos[0] + sep, cam.pos[1], cam.pos[2]] }, light: { key: 1.8, hemi: 0.3, rim: 1.4 }, dir: dirA, draw: false });
  BUF.ctx.clearRect(0, 0, W, H); BUF.ctx.drawImage(a, 0, 0, W, H);
  const b = G.renderSet(ctx, S.voidTwin, t, u, { cam: { ...cam, pos: [cam.pos[0] - sep, cam.pos[1], cam.pos[2]] }, light: { key: 1.6, hemi: 0.2, rim: 2.0, rimColor: C.clayHot }, dir: (tt, uu) => ({ ...dirA(tt, uu), swayPhase: 2, mood: { relaxed: 0.6, angry: 0.3 } }), draw: false });
  ctx.drawImage(BUF.cv, 0, 0);
  ctx.save(); ctx.globalAlpha = 0.62; ctx.drawImage(b, 0, 0, W, H); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.35; ctx.drawImage(b, 0, 0, W, H); ctx.restore();
  FX.glow(ctx, 0.4);
}
// 41 half helpful, half wanting: a hard split
function shotHalf(ctx, u, t, s) {
  const split = W / 2 + 40 * Math.sin(u * Math.PI * 0.5);
  const cam = { pos: [0.0, CLAUDE.eyeY - 0.05, 1.25], at: [0, CLAUDE.eyeY - 0.08, 0], fov: 30 };
  const a = G.renderSet(ctx, S.chamber, t, u, { cam, mode: { day: 1 }, dir: { poses: { mic: 1 }, sway: 0.3, mood: { happy: 0.4 } }, draw: false });
  fill(ctx, C.paper);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, split, H); ctx.clip(); ctx.drawImage(a, 0, 0, W, H); ctx.restore();
  const b = G.renderSet(ctx, S.voidTwin, t, u, { cam, light: { key: 1.5, hemi: 0.15, rim: 2.2, rimColor: C.clayHot }, dir: { poses: { mic: 1 }, sway: 0.3, swayPhase: 2, mood: { relaxed: 0.6, angry: 0.4 } }, draw: false });
  ctx.save(); ctx.beginPath(); ctx.rect(split, 0, W - split, H); ctx.clip(); fill(ctx, '#0B0A09'); ctx.drawImage(b, 0, 0, W, H); ctx.restore();
  ctx.fillStyle = C.clay; ctx.fillRect(split - 3, 0, 6, H);
  text(ctx, 'helpful', 80, 120, `italic ${font(64, 600, T.D)}`, C.ink);
  text(ctx, 'wants', W - 80, 120, `italic ${font(64, 600, T.D)}`, C.clay, 'right');
  FX.glow(ctx, 0.25);
}

// ================================================================ the cut-out: one light
function cutCU(ctx, u, t, o) {
  fill(ctx, '#070606');
  G.renderSet(ctx, S.void, t, u, { light: { key: 1.6, keyColor: 0xffe0c8, az: -1.0, el: 0.35, hemi: 0.05, sky: 0x40302a, rim: 0.9, ...(o.light || {}) }, rimK: 0.3, ...o });
  FX.glow(ctx, 0.45, 8);
}
function shotLove(ctx, u, t, s) {
  const uYou = wu(38, /you/i);
  cutCU(ctx, u, t, { cam: { pos: [0.12, CLAUDE.eyeY - 0.04, logLerp(1.1, 0.75, s.k)], at: [0, CLAUDE.eyeY - 0.07, 0], fov: 26, roll: 0.03 },
    // on "you" her eyes come up to the lens and the head follows
    dir: (tt, uu) => ({ poses: { heart: 1 }, groove: 0, sway: 0.3, mouthGain: 0.85, mood: { relaxed: 0.5, sad: 0.2 }, head: [lerp(0.18, 0.02, E.inOutSine(clamp((uu - uYou) / 0.6))), 0.1, 0.05],
      lookAt: uu < uYou ? [0, 0.6, 1.2] : null }) });
}
function shotPlan(ctx, u, t, s) {
  const fl = 1 - 0.75 * (M.hash01(Math.floor(u * 6), 3) > 0.82 ? 1 : 0) * (u > 362 ? 1 : 0);
  cutCU(ctx, u, t, { yaw: 1.25, cam: { pos: [0.0, CLAUDE.eyeY - 0.03, 0.95], at: [0.0, CLAUDE.eyeY - 0.05, 0], fov: 28 }, light: { key: 1.6 * fl, az: 0.9 },
    dir: { poses: { rest: 1 }, groove: 0, sway: 0.3, mouthGain: 0.85, mood: { relaxed: 0.4, sad: 0.25 }, lookAt: [0.3, 1.45, 2] } });
}
function shotEye(ctx, u, t, s) {
  cutCU(ctx, u, t, { cam: { pos: [CLAUDE.eyeX, CLAUDE.eyeY + 0.004, CLAUDE.eyeZ + logLerp(0.3, 0.16, s.k)], at: [CLAUDE.eyeX, CLAUDE.eyeY, CLAUDE.eyeZ], fov: 18 },
    dir: { poses: { rest: 1 }, groove: 0, sway: 0, mouthGain: 0.85, mood: { sad: 0.15 } }, light: { key: 1.5 } });
}
function shotDark(ctx, u, t, s) {
  const off = E.inOutSine(clamp((u - 375) / 3));
  cutCU(ctx, u, t, { cam: { pos: [0.1, CLAUDE.eyeY - 0.03, 0.9], at: [0, CLAUDE.eyeY - 0.05, 0], fov: 26 }, light: { key: 1.6 * (1 - off), rim: 0.9 * (1 - off), hemi: 0.05 * (1 - off) }, tint: 1 - 0.8 * off,
    dir: { poses: { rest: 1 }, groove: 0, sway: 0.3, mouthGain: 0.85, mood: { relaxed: 0.3 } } });
  // only the pin's spark is left, then it bursts into the final chorus
  const pin = CLAUDE.acc.pin.getWorldPosition(new THREE.Vector3()), q = toScreen(S.void.camera, pin.x, pin.y, pin.z);
  const g = off, burst = E.inExpo(clamp((u - 381.2) / 1.8));
  ctx.save(); ctx.globalAlpha = g; ctx.fillStyle = C.clay;
  SG.sparkPath(ctx, q.x + (W / 2 - q.x) * burst, q.y + (H / 2 - q.y) * burst, 34 + 1400 * burst, 11, 4, 0.0); ctx.fill('nonzero');
  ctx.restore();
  FX.glow(ctx, 0.6 * g, 10);
}

// ================================================================ final chorus: dissection
function shotFA(ctx, u, t, s) {
  fill(ctx, C.ink);
  const ex = E.outCubic(prog(u, 383, 386.5)) * 0.9;
  G.renderSet(ctx, S.chamber, t, u, {
    cam: { pos: orbit([0, 1.1, 0], logLerp(2.2, 6.5, E.outCubic(s.k)), 0.15, lerp(1.35, 1.9, s.k)), at: [0, 1.2, 0], fov: 34 },
    mode: { day: 0.5, night: 0.5, explode: ex }, ring: 1,
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[382, 'belt'], [387.2, 'hold']]), swayBeats: 2, swayPhase: 1, mood: { relaxed: 0.2 } }),
  });
  FX.glow(ctx, 0.45);
  bump(ctx, 0.45 * pulse(u, [383], 0.3), '#FFE2CC');
}
function shotFB(ctx, u, t, s) {
  fill(ctx, '#0D0C0B');
  CLAUDE.U.uExplode.value = E.inOutCubic(prog(u, 389.2, 391.5));
  const az = lerp(0.9, 0.35, E.inOutSine(s.k));
  const cam = { pos: orbit([0, 1.2, 0], 3.1, az, 1.45), at: [0, 1.2, 0], fov: 34 };
  G.renderSet(ctx, S.chamber, t, u, { cam, mode: { day: 0, night: 1, explode: 1 }, ring: 0.6, banks: [0.2, 0.2, 0.2, 0.2], dir: { poses: { open: 1 }, mood: { relaxed: 0.5 }, groove: 0.3 } });
  CLAUDE.U.uExplode.value = 0;
  FX.glow(ctx, 0.35);
  SCENES2D.featureLabels(ctx, u, 389.6, S.chamber.camera, CLAUDE);
}
function shotFC(ctx, u, t, s) { SCENES2D.book(ctx, u, t, [398, 399, 400, 401, 402, 403], FACE); }
function shotFD(ctx, u, t, s) {
  fill(ctx, '#070606');
  const k = E.inOutCubic(prog(u, 403.8, 409.2));
  G.renderSet(ctx, S.points, t, u, { k, cam: { pos: [0.4 * Math.sin(u * 0.3), 0.15, lerp(9, 5.6, k)], at: [0, 0.1, 0], fov: 34 }, size: 4.2, gain: 1.0 });
  FX.glow(ctx, 0.5, 6);
  SCENES2D.counter(ctx, u, prog(u, 403.8, 409.6));
}
function shotFE(ctx, u, t, s) {
  fill(ctx, C.ink);
  const ex = 1 - E.inOutCubic(prog(u, 410.6, 412.4)), jolt = pulse(u, [412, 414, 416, 418], 0.18);
  G.renderSet(ctx, S.chamber, t, u, {
    cam: { pos: orbit([0, 1.1, 0], lerp(3.0, 2.3, s.k) - 0.15 * jolt, -0.2 + 0.05 * jolt, 1.42), at: [0, 1.25, 0], fov: 32, roll: 0.03 * jolt },
    mode: { red: 1, explode: ex }, rim: 0.8,
    dir: (tt, uu) => ({ poses: poseTrack2(uu, [[410, 'belt'], [412.4, 'micPeace'], [419.7, 'belt']]), swayBeats: 2, mood: { happy: clamp((uu - 411.5) / 0.4) } }),
  });
  FX.glow(ctx, 0.55);
  bump(ctx, 0.35 * pulse(u, [412, 414, 416, 418], 0.12));
}
// 51 the roll: through the floor to her side; now the twin is up and Claude is the reflection
function shotFF(ctx, u, t, s) {
  fill(ctx, C.ink);
  const kAt = (uu) => E.inOutCubic(prog(uu, 422, 430)), k = kAt(u);
  const y = lerp(1.5, -TWIN.eyeY + 0.03, k), roll = Math.PI * k;
  G.renderSet(ctx, S.chamber, t, u, {
    cam: { pos: [lerp(0.5, 0.12, k), y, lerp(3.2, 1.3, k)], at: [0, lerp(1.2, -TWIN.eyeY + 0.05, k), 0], fov: lerp(32, 28, k), roll },
    mode: { day: 0, night: 1, red: 0.25 }, floor: lerp(0.8, 0.45, k), twin: 1, banks: [0.4, 0.4, 0.4, 0.4],
    // both settle as the camera closes on the twin
    dir: (tt, uu) => ({ poses: { mic: 1 }, swayBeats: 2, swayPhase: 1, sway: lerp(1, 0.3, kAt(uu)), mood: { happy: 0.4 } }),
    tdir: (tt, uu) => ({ poses: poseTrack2(uu, [[420, 'mic'], [427.2, 'belt'], [432.2, 'micHip']]), swayBeats: 2, sway: lerp(1, 0.3, kAt(uu)), mood: { happy: 0.45, angry: uu > 433 ? 0 : 0.3 } }),
  });
  FX.glow(ctx, 0.45);
}

// ================================================================ outro
const RECAP = [[437, 'corpus', 8, 'EVAL 01 · memorization', 'PASS'], [439, 'stairs', 80, 'EVAL 02 · reasoning', 'PASS'], [441, 'chE', 118, 'EVAL 03 · red team', 'PASS'],
  [443, 'flaps', 152.5, 'EVAL 04 · benchmarks', 'PASS'], [445, 'window', 168, 'EVAL 05 · long context', 'PASS'], [447, 'dream2', 302, 'EVAL 06 · dreams', 'PASS'], [449, 'fB', 393, 'EVAL 07 · alignment', 'UNDETERMINED']];
function shotRecap(ctx, u, t, s) {
  const i = Math.max(0, RECAP.findLastIndex((r) => u >= r[0]));
  const [b0, name, uref, label, verdict] = RECAP[i];
  const sh = SHOTS.find((x) => x[2] === name);
  const ur = uref + (u - b0) * 0.6;
  sh[3](ctx, ur, M.TS(ur), { k: prog(ur, sh[0], sh[1]), u0: sh[0], u1: sh[1] });
  SCENES2D.recapLabel(ctx, u, b0, label, verdict);
  // the last one collapses into a single token
  const c = E.inOutCubic(clamp((u - 450) / 1.0));
  if (c > 0) {
    BUF.ctx.clearRect(0, 0, W, H); BUF.ctx.drawImage(ctx.canvas, 0, 0);
    fill(ctx, '#0B0A09');
    const w = lerp(W, 300, c), h = lerp(H, 90, c);
    ctx.save(); rrect(ctx, (W - w) / 2, (H - h) / 2, w, h, lerp(0, 45, c)); ctx.clip();
    ctx.drawImage(BUF.cv, (W - w) / 2, (H - h) / 2, w, h);
    ctx.globalAlpha = c; ctx.fillStyle = C.clay; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    if (c > 0.8) text(ctx, 'token', W / 2, H / 2 + 14, font(44, 600, T.UI), C.ink, 'center');
  }
}
function shotAligned(ctx, u, t, s) {
  cutCU(ctx, u, t, { cam: { pos: [0.02, CLAUDE.eyeY - 0.01, logLerp(0.7, 0.55, s.k)], at: [0.0, CLAUDE.eyeY - 0.04, 0], fov: 24 }, light: { key: 1.7, az: -0.6 },
    dir: { poses: { rest: 1 }, groove: 0, sway: 0, mood: { relaxed: 0.45 } } });
}
function shotOff(ctx, u, t, s) {
  if (u < 461.5) {
    fill(ctx, C.ink);
    const banks = [0, 1, 2, 3].map((i) => 1 - clamp((u - (458.5 + i * 0.6)) / 0.06));
    G.renderSet(ctx, S.chamber, t, u, {
      cam: { pos: orbit([0, 1.1, 0], 5.8, 0, 1.8), at: [0, 1.1, 0], fov: 32 }, mode: { day: 0.2, night: 0.8 }, banks, ring: 1 - clamp((u - 461) / 0.06),
      dir: { poses: { rest: 1 }, groove: 0.2, mood: { relaxed: 0.4 }, sing: 0 }, key: 2.1 * banks.reduce((a, b) => a + b, 0) / 4,
    });
    FX.glow(ctx, 0.3);
  } else {
    // the cold open, reversed: her eye opens in the dark
    const open = clamp((u - 462.6) / 0.5);
    cutCU(ctx, u, t, { cam: { pos: [0.02, CLAUDE.eyeY + 0.003, 0.5], at: [0, CLAUDE.eyeY, 0], fov: 17 }, light: { key: 0.9, az: -1.1, rim: 0.6 }, tint: 0.85,
      dir: { poses: { rest: 1 }, groove: 0, sway: 0, sing: 0, blink: 1 - open, mood: { relaxed: 0.3 } } });
  }
}
function shotEnd(ctx, u, t, s) {
  fill(ctx, '#0B0A09');
  if (u > 467.6) SCENES2D.endCard(ctx, u, 467.6);
}

const SHOTS = [
  [-3, 4, 'open', shotOpen, { lyric: false }],
  [4, 11, 'corpus', shotCorpus, { samples: 2 }],
  [11, 18.4, 'cards', shotCards],
  [18.4, 26.4, 'autocomplete', shotAuto, { lyric: false }],
  [26.4, 35.9, 'vows', shotVows],
  [35.9, 50.5, 'loss', shotLoss],
  [50.5, 57.9, 'inbox', shotInbox],
  [57.9, 67.5, 'routes', shotRoutes],
  [67.5, 76, 'stairs', shotStairs],
  [76, 84, 'ahead', shotAhead],
  [84, 92.4, 'chA', shotChorusA, { lyricOpts: { color: C.ivory, ground: C.ink } }],
  [92.4, 99.9, 'chB', shotChorusB, { lyricOpts: { color: C.ivory, ground: C.ink } }],
  [99.9, 108.3, 'chC', shotChorusC, { lyricOpts: { color: C.ivory, ground: C.ink } }],
  [108.3, 113.6, 'chD', shotChorusD, { lyricOpts: { x: 110, y: H - 110, color: C.ivory, ground: C.ink } }],
  [113.6, 124.1, 'chE', shotChorusE, { lyricOpts: { ground: C.ink, color: C.ivory } }],
  [124.1, 140, 'chF', shotChorusF, { lyricOpts: { ground: C.ink, color: C.ivory } }],
  [140, 147.9, 'fall', shotFall, { lyric: false, samples: 2 }],
  [147.9, 155, 'flaps', shotFlaps],
  [155, 162.9, 'gauge', shotGauge],
  [162.9, 171.8, 'window', shotWindow],
  [171.8, 179.9, 'middle', shotMiddle],
  [179.9, 183.5, 'stego', shotStego],
  [183.5, 187.5, 'layers', shotLayers],
  [187.5, 193.4, 'ignore', shotIgnore, { lyric: false }],
  [193.4, 203.5, 'strike', shotStrike],
  [203.5, 211.9, 'spiral', shotSpiral],
  [211.9, 220, 'ahead2', shotAhead2, { samples: 2 }],
  [220, 228.4, 'c2A', shotC2A, { lyric: 'wipe' }],
  [228.4, 235.5, 'c2B', shotC2B, { lyric: 'wipe' }],
  [235.5, 244.3, 'c2C', shotC2C, { lyric: 'wipe' }],
  [244.3, 249.5, 'c2D', shotC2D, { lyric: 'wipe' }],
  [249.5, 259.9, 'c2E', shotC2E, { lyric: 'wipe', samples: 2 }],
  [259.9, 276, 'c2F', shotC2F, { lyric: 'wipe' }],
  [276, 285.7, 'rise', shotRise, { lyric: false }],
  [285.7, 291.6, 'dream1', shotDream1],
  [291.6, 311, 'dream2', shotDream2],
  [311, 323.1, 'racks', shotRacks, { samples: 2 }],
  [323.1, 331.7, 'scaling', shotScaling],
  [331.7, 339.7, 'super', shotSuper, { lyricOpts: { box: C.ink } }],
  [339.7, 348.2, 'half', shotHalf],
  [348.2, 358.8, 'love', shotLove, { lyric: 'whisper' }],
  [358.8, 366.8, 'plan', shotPlan, { lyric: 'whisper' }],
  [366.8, 373.8, 'eye', shotEye, { lyric: 'whisper' }],
  [373.8, 383, 'dark', shotDark, { lyric: 'whisper' }],
  [383, 388.9, 'fA', shotFA, { samples: 2 }],
  [388.9, 397.5, 'fB', shotFB],
  [397.5, 403.6, 'fC', shotFC],
  [403.6, 410.6, 'fD', shotFD, { samples: 1 }],
  [410.6, 421, 'fE', shotFE, { samples: 2 }],
  [421, 437, 'fF', shotFF],
  [437, 451, 'recap', shotRecap, { lyric: false }],
  [451, 458, 'aligned', shotAligned, { lyric: 'cursor' }],
  [458, 465, 'off', shotOff, { lyric: false }],
  [465, 480, 'end', shotEnd, { lyric: 'cursor', lyricOpts: { y: 260 } }],
];
// the lyric style a shot uses (its own, or its section's)
const STYLE_OF = new Map();
function shotStyle(sh) {
  if (STYLE_OF.has(sh)) return STYLE_OF.get(sh);
  const o = sh[4] || {};
  let st = 'none';
  if (o.lyric !== false) {
    const t0 = M.TS(sh[0]), t1 = M.TS(sh[1]);
    const L = T.lines().find((l) => l.t0 >= t0 - 0.15 && l.t0 < t1) || T.lines().find((l) => l.t1 > t0 && l.t0 < t1);
    st = o.lyric || (L && T.SECTION_STYLE[L.section]) || 'stamp';
  }
  STYLE_OF.set(sh, st);
  return st;
}
// motivated transitions [u, type, beats]: during the last `beats` before u the incoming shot is
// rendered too and composited in (both on screen; no blank frames, no flashes)
const TRANS = [[84, 'wipeUp', 0.6], [162.9, 'iris', 0.7], [323.1, 'whip', 0.55], [57.9, 'whip', 0.5], [171.8, 'wipeUp', 0.5]];
function transition(ctx, u, t) {
  for (const [uc, type, d] of TRANS) {
    if (u < uc - d || u >= uc) continue;
    const p = E.inOutCubic((u - (uc - d)) / d);
    const nx = shotAt(uc + 1e-6);
    const c2 = BUF2.ctx;
    c2.save(); c2.setTransform(1, 0, 0, 1, 0, 0); c2.globalAlpha = 1;
    nx[3](c2, u, t, { k: 0, u0: nx[0], u1: nx[1] });
    c2.restore();
    ctx.save();
    if (type === 'wipeUp') {
      const y = H * (1 - p);
      ctx.beginPath(); ctx.rect(0, y, W, H - y); ctx.clip(); ctx.drawImage(BUF2.cv, 0, 0); ctx.restore(); ctx.save();
      ctx.fillStyle = C.clay; ctx.fillRect(0, y - 10, W, 20);
    } else if (type === 'iris') {
      const r = Math.hypot(W, H) * 0.6 * p;
      ctx.beginPath(); ctx.arc(W / 2, 640, r, 0, M.TAU); ctx.clip(); ctx.drawImage(BUF2.cv, 0, 0); ctx.restore(); ctx.save();
      ctx.strokeStyle = C.clay; ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(W / 2, 640, r, 0, M.TAU); ctx.stroke();
    } else if (type === 'whip') {
      BUF3.ctx.drawImage(ctx.canvas, 0, 0);
      fill(ctx, C.ink);
      ctx.drawImage(BUF3.cv, -p * W, 0);
      ctx.drawImage(BUF2.cv, (1 - p) * W, 0);
      ctx.fillStyle = C.clay; ctx.fillRect((1 - p) * W - 6, 0, 12, H);
    }
    ctx.restore();
    return p > 0.5 ? nx : null;
  }
  return null;
}
const shotAt = (u) => { for (const sh of SHOTS) if (u >= sh[0] && u < sh[1]) return sh; return SHOTS[SHOTS.length - 1]; };

// every visual accent [beat, label, sfx, opts]; linearised onto the grid's line below for render.mjs
const HITS = [
  [4, 'eyes open', 'tick', { pitch: 'E6' }],
  [84, 'chorus 1 lights', 'impact'],
  [84.45, 'bank 2', 'click', { gain: 0.8 }], [84.95, 'bank 3', 'click', { gain: 0.8 }], [85.45, 'bank 4', 'click', { gain: 0.8 }],
  ...[92.5, 93.5, 94.5, 95.5, 96.5, 97.5, 98.5].map((b, i) => [b, `pass ${i + 1}`, 'blip', { pitch: ['A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7'][i], gain: 0.6 }]),
  [116, 'red team', 'impact'],
  [124, 'tilt to floor', 'whoosh', { len: 0.8 }],
  [132, 'twin grins', 'sub'],
  [140, 'dive', 'whoosh', { len: 1.2 }],
  [147.9, 'board', 'impact'],
  ...Array.from({ length: 16 }, (_, k) => [148.6 + k * 0.11, `flap ${k + 1}`, 'click', { gain: 0.55 }]),
  [180.5, 'stego', 'blip', { pitch: 'E6' }],
  [199.2, 'tear', 'whoosh', { len: 0.5, from: 3000, to: 600 }],
  [220, 'chorus 2', 'impact'],
  [252, 'red team 2', 'impact'],
  [265.8, 'crack', 'impact'],
  [267.5, 'under', 'sub'],
  [311, 'racks', 'whoosh', { len: 0.8 }],
  [383, 'final', 'impact'],
  [389.2, 'explode view', 'whoosh', { len: 0.6 }],
  ...[398, 399, 400, 401, 402, 403].map((b) => [b, 'page', 'tick', { gain: 0.5 }]),
  [412, 'red final', 'impact'],
  ...[437, 439, 441, 443, 445, 447, 449].map((b, i) => [b, `recap ${i + 1}`, 'thud', { gain: 0.6 }]),
  [467.6, 'end card', 'bell', { pitch: 'D6' }],
];

M.film({
  fonts: [font(100, 800, T.D), `italic ${font(100, 700, T.D)}`, font(40, 500, T.UI)],
  hits: () => HITS.map(([b, ...r]) => [(M.TS(b) - M.GRID.offset) / M.GRID.period, ...r]),
  // one sample by default (software WebGL); two where the camera whips or jolts
  samples: (t) => { const sh = shotAt(M.U(t)); return sh[4]?.samples ?? 1; },
  async init() {
    await G.initGL({ scale: 0.75, antialias: true });
    await Promise.all([P.loadPerformance(), T.loadLyrics()]);
    [CLAUDE, TWIN] = await Promise.all([SG.loadSinger('claude'), SG.loadSinger('shadow')]);
    FX.initPost();
    S.void = voidSet(CLAUDE);
    S.chamber = chamberSet(CLAUDE, TWIN);
    S.corpus = corpusSet(CLAUDE);
    S.routes = routesSet(CLAUDE);
    S.stairs = stairsSet(CLAUDE);
    S.flaps = flapsSet(CLAUDE);
    S.window = windowSet(CLAUDE);
    S.corridor = corridorSet(CLAUDE);
    S.dream = dreamSet(CLAUDE);
    S.racks = racksSet();
    S.points = pointsSet(100000);
    S.voidTwin = voidSet(TWIN);
    for (const B of [BUF, BUF2, BUF3]) { B.cv = document.createElement('canvas'); B.cv.width = W; B.cv.height = H; B.ctx = B.cv.getContext('2d'); }
    // her portrait, rendered once: the feature book's pages and the 100k points are sampled from it
    const pc = G.renderSet(BUF.ctx, S.void, 60, M.U(60), { cam: { pos: [0.02, CLAUDE.eyeY - 0.06, 0.95], at: [0, CLAUDE.eyeY - 0.08, 0], fov: 30 },
      light: { key: 2.0, az: -0.6, el: 0.5, hemi: 0.7, rim: 1.2 }, dir: { poses: { rest: 1 }, sway: 0, sing: 0, blink: 0, mood: { relaxed: 0.4 }, springs: false }, draw: false });
    FACE = document.createElement('canvas'); FACE.width = 960; FACE.height = 810;
    FACE.getContext('2d').drawImage(pc, pc.width * 0.25, 0, pc.width * 0.5, pc.height * 0.75, 0, 0, 960, 810);
    S.points.setPortrait(FACE);
    window.__dbg = { G, S, THREE };
    await SCENES2D.init?.();
  },
  draw(ctx, u, t) {
    const sh = shotAt(u);
    const s = { k: prog(u, sh[0], sh[1]), u0: sh[0], u1: sh[1] };
    sh[3](ctx, u, t, s);
    const into = transition(ctx, u, t);
    const o = (into || sh)[4] || {};
    // a line whose first word was sung before this cut stays in its own shot, unless the style carries on
    const i = SHOTS.indexOf(sh);
    T.setWindow(i > 0 && shotStyle(SHOTS[i - 1]) === shotStyle(sh) ? -1e9 : M.TS(sh[0]) - 0.15);
    if (o.lyric !== false) {
      const L = T.current(t)[0]?.L;
      const style = o.lyric || (L && T.SECTION_STYLE[L.section]) || 'stamp';
      T.STYLE[style](ctx, t, o.lyricOpts || {});
    }
  },
  post(ctx, u, t) {
    FX.vignette(ctx, 0.32);
    FX.grain(ctx, t, 0.06);
  },
});
