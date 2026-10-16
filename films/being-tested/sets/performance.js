// The singer's performance (from the skill's worked example): a singer's performance as a pure function of time, for vector_rig.js (or any rig
// with the same state fields). From a music video: copy into <film>/.
//   - mouth (vector rig, mouthAt): the vocal stem's 100 Hz envelope (lipsync.json, from align.py) sets how open; the vowel
//     being sung at that instant (lyrics.json word timing) sets the shape, blended over +/-40 ms
//   - mouth (3-D singer, visemesAt): the phones of each lyric word (phones.json: CMUdict ARPAbet plus sphinx_align.py's
//     extra words) laid out over the word's timing and blended by dominance, so syllables flap and the lips meet on
//     m/b/p; the envelope only adds emphasis and a voicing gate. activityAt says how much she is singing (eases ~0.6 s)
//   - seeded blinks every 2.2-4.5 s (fast close, slower open); none of them random at render time
//   - idle head motion from value noise, a damped nod at every lyric line onset, a bob on the beat
//   - follow-through: hair angles are the head's motion now minus 0.1 / 0.2 s ago, so the hair lags
//     and overshoots like hair, while staying a pure function of t (no simulation state)
// singer(t, u, overrides) returns the state for drawIdol(); overrides add yaw/roll/pitch offsets
// (yawAdd...) or replace any field, so a shot can direct her ("look up", "wink", "ring eyes").
import * as M from '../lib/motion.js';

let LS = null, LINES = [], WORDS = [];
export async function loadPerformance() {
  const [ls, ly, ph] = await Promise.all(['lipsync.json', 'lyrics.json', 'phones.json'].map((f) => fetch(f).then((r) => r.json())));
  LS = ls; LINES = ly.lines;
  WORDS = LINES.flatMap((L, li) => L.words.map((w, wi) => ({ ...w, li, wi })));
  buildMouth(ph); buildGlances();
  return { lines: LINES, words: WORDS };
}
export const lines = () => LINES;

export function envelope(t) {
  if (!LS) return 0;
  const i = t * LS.rate, i0 = Math.floor(i);
  if (i0 < 0 || i0 >= LS.open.length - 1) return 0;
  return M.lerp(LS.open[i0], LS.open[i0 + 1], i - i0);
}

// the word sung at t (or null), searched by binary search on t0
export function wordAt(t) {
  let lo = 0, hi = WORDS.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (WORDS[m].t0 <= t) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k < 0) return null;
  const w = WORDS[k];
  return t <= w.t1 + 0.12 ? w : null;
}
export function lineAt(t, pre = 0.25, post = 0.6) {
  for (let i = 0; i < LINES.length; i++) {
    const L = LINES[i];
    if (t >= L.t0 - pre && t <= L.t1 + post) return { ...L, index: i };
  }
  return null;
}

// vowel shape of the sound at fraction f through a word
const SHAPE = { a: { wide: 0.25, round: 0 }, e: { wide: 0.8, round: 0 }, i: { wide: 0.9, round: 0 }, y: { wide: 0.7, round: 0 },
  o: { wide: -0.2, round: 1 }, u: { wide: -0.3, round: 0.9 }, w: { wide: -0.3, round: 0.8 } };
function vowelShape(word, f) {
  const v = [...word.toLowerCase()].filter((c) => SHAPE[c]);
  if (!v.length) return { wide: 0.2, round: 0 };
  return SHAPE[v[Math.min(v.length - 1, Math.floor(f * v.length))]];
}

export function mouthAt(t, gain = 1) {
  let open = 0, wide = 0, round = 0, wsum = 0;
  for (const dt of [-0.04, 0, 0.04]) {   // coarticulation: blend the shapes within +/-40 ms
    const w = wordAt(t + dt);
    if (!w) continue;
    const f = M.clamp((t + dt - w.t0) / Math.max(0.05, w.t1 - w.t0));
    const s = vowelShape(w.w, f);
    wide += s.wide; round += s.round; wsum++;
  }
  if (wsum) { wide /= wsum; round /= wsum; }
  open = Math.min(1, envelope(t) * 1.15 * gain);
  return { open, wide, round, smile: 0.25 - 0.2 * open };
}

// ------------------------------------------------------------------ the 3-D singer's mouth
export const smoothstep = (a, b, x) => { const k = M.clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
// VRM visemes [aa, ih, ou, ee, oh]. On Shino aa .2 is a slit, .4 small, .6 clearly open, 1 VRoid's gape: every
// target stays well under the full shapes
const VIS = ['aa', 'ih', 'ou', 'ee', 'oh'];
const vec = (o) => VIS.map((k) => o[k] || 0);
// vowels: [target, diphthong glide target | null]
const VOW = {
  AA: [vec({ aa: 0.52 })], AE: [vec({ aa: 0.4, ee: 0.22 })], AH: [vec({ aa: 0.38 })], AO: [vec({ oh: 0.46, aa: 0.1 })],
  AW: [vec({ aa: 0.46 }), vec({ ou: 0.55, oh: 0.1 })], AY: [vec({ aa: 0.5 }), vec({ ee: 0.36, ih: 0.25 })],
  EH: [vec({ ee: 0.34, aa: 0.26 })], ER: [vec({ ou: 0.32, ih: 0.25, aa: 0.12 })], EY: [vec({ ee: 0.36, aa: 0.2 }), vec({ ee: 0.4, ih: 0.3 })],
  IH: [vec({ ih: 0.45, ee: 0.22, aa: 0.15 })], IY: [vec({ ee: 0.44, ih: 0.4 })], OW: [vec({ oh: 0.46 }), vec({ ou: 0.58 })],
  OY: [vec({ oh: 0.46 }), vec({ ee: 0.36, ih: 0.25 })], UH: [vec({ ou: 0.48, aa: 0.14 })], UW: [vec({ ou: 0.72, oh: 0.08 })],
};
const SCHWA = vec({ aa: 0.22, ih: 0.1 }), CLOSED = vec({});
// consonants: [target, dominance, nominal s, floor s]; m/b/p dominate so the lips always meet
const CONS = {};
for (const [cs, ...v] of [['M B P', CLOSED, 4, 0.075, 0.05], ['F V', vec({ ih: 0.3, ee: 0.08 }), 2.5, 0.08, 0.04], ['W', vec({ ou: 0.6 }), 2, 0.06, 0.03],
  ['R', vec({ ou: 0.3, ih: 0.15 }), 1.2, 0.06, 0.03], ['SH ZH CH JH', vec({ ou: 0.28, ih: 0.3 }), 1.5, 0.08, 0.035],
  ['T D N L TH DH', vec({ ih: 0.3, aa: 0.06 }), 0.7, 0.06, 0.025], ['S Z', vec({ ih: 0.32, ee: 0.1 }), 0.9, 0.08, 0.03],
  ['K G NG HH', vec({ aa: 0.12, ih: 0.1 }), 0.3, 0.06, 0.025], ['Y', vec({ ih: 0.35, ee: 0.25 }), 1, 0.05, 0.025]]) for (const c of cs.split(' ')) CONS[c] = v;
const CAP = vec({ aa: 0.62, ih: 0.5, ou: 0.8, ee: 0.55, oh: 0.58 }), OPEN_MAX = 0.68;   // openness = aa + oh + ee / 2
const FILL = vec({ aa: 0.28, ih: 0.08 });       // voiced in a line but no aligned vowel (a misaligned word): a neutral sung vowel
const W5 = [1, 4, 6, 4, 1].map((w) => w / 16);  // +/-2 frame binomial, resampling t (no state)
const wordKey = (w) => w.toLowerCase().replace(/[^a-z']/g, '').replace(/^'+|'+$/g, '');
let SEG = [];   // { a, b, v0, v1, dom, tau, kind: V vowel | C consonant | R rest, st: a stressed vowel }, sorted by a
function buildMouth(PH) {
  SEG = [];
  const rest = (a, b) => SEG.push({ a, b, v0: CLOSED, v1: null, dom: 1, tau: 0.06, kind: 'R' });
  LINES.forEach((L, li) => {
    const ws = L.words;
    for (const w of ws) {
      // consonants take their nominal time (at most 55% of the word, never under their floor); vowels share the rest,
      // stressed 1, unstressed 0.55, the last one held x1.5 (sung)
      const D = Math.max(0.06, w.t1 - w.t0);
      const items = (PH[wordKey(w.w)] || ['AH1']).map((p) => {
        const base = p.replace(/\d/g, ''), st = p.replace(/\D/g, '');
        if (VOW[base]) return { V: true, v0: p === 'AH0' ? SCHWA : VOW[base][0], v1: VOW[base][1] || null, wt: st === '1' || st === '2' ? 1 : 0.55 };
        const [v0, dom, dur, floor] = CONS[base] || CONS.T;
        return { V: false, v0, dom, dur, floor };
      });
      const vi = items.filter((x) => x.V);
      if (vi.length) vi[vi.length - 1].wt *= 1.5;
      const cd = items.reduce((s, x) => s + (x.V ? 0 : x.dur), 0), sc = cd > 0 ? Math.min(1, (0.55 * D) / cd) : 1;
      let cdur = items.map((x) => (x.V ? 0 : Math.max(x.floor, x.dur * sc)));
      if (!vi.length) { const s = cdur.reduce((a, b) => a + b, 0); cdur = cdur.map((c) => (c * D) / s); }
      const vt = D - cdur.reduce((a, b) => a + b, 0), vw = vi.reduce((s, x) => s + x.wt, 0);
      let t = w.t0;
      items.forEach((x, i) => {
        const d = x.V ? (vt * x.wt) / vw : cdur[i];
        SEG.push(x.V ? { a: t, b: t + d, v0: x.v0, v1: x.v1, dom: 1, tau: 0.05, kind: 'V', st: x.wt >= 1 } : { a: t, b: t + d, v0: x.v0, v1: null, dom: x.dom, tau: 0.03, kind: 'C' });
        t += d;
      });
    }
    for (let i = 0; i + 1 < ws.length; i++) if (ws[i + 1].t0 - ws[i].t1 >= 0.06) rest(ws[i].t1, ws[i + 1].t0);
    // closed for up to 0.6 s before and after the line, clipped to the gap to its neighbours (most gaps are under 0.3 s)
    const pre = li ? ws[0].t0 - LINES[li - 1].words.at(-1).t1 : 9, post = li + 1 < LINES.length ? LINES[li + 1].words[0].t0 - ws.at(-1).t1 : 9;
    if (pre >= 0.06) rest(ws[0].t0 - Math.min(0.6, pre), ws[0].t0);
    if (post >= 0.06) rest(ws.at(-1).t1, ws.at(-1).t1 + Math.min(0.6, post));
  });
  SEG.sort((p, q) => p.a - q.a);
}
const segsBefore = (x) => { let lo = 0, hi = SEG.length; while (lo < hi) { const m = (lo + hi) >> 1; if (SEG[m].a <= x) lo = m + 1; else hi = m; } return lo; };
const envS = (t) => { let s = 0; for (let k = -3; k <= 3; k++) s += envelope(t + k * 0.02); return s / 7; };   // +/-60 ms box
// coarticulation: every segment pulls toward its target with dominance * exp(-(distance / tau)^2) (~120 ms vowel
// attack and release, ~50-80 ms anticipation)
function mouthRaw(t, gain) {
  const num = [0, 0, 0, 0, 0], i = segsBefore(t + 0.3);
  let den = 0, vw = 0;
  for (let j = Math.max(0, i - 40); j < i; j++) {
    const s = SEG[j]; if (s.b < t - 0.3) continue;
    const w = s.dom * Math.exp(-((Math.max(0, s.a - t, t - s.b) / s.tau) ** 2));
    if (w < 1e-4) continue;
    let v = s.v0;
    if (s.v1) { const G = Math.max(0.06, 0.5 * (s.b - s.a)), f = smoothstep(0, 1, (t - s.b + G) / G); v = v.map((x, k) => M.lerp(x, s.v1[k], f)); }
    for (let k = 0; k < 5; k++) num[k] += w * v[k];
    den += w; if (s.kind === 'V') vw += w;
  }
  if (den < 1e-3) return [0, 0, 0, 0, 0];
  const e = envS(t), f = LINES.some((L) => t >= L.t0 && t <= L.t1) ? smoothstep(0.45, 0.8, e) * (1 - Math.min(1, vw / 0.5)) : 0;
  const g = gain * (0.8 + 0.4 * smoothstep(0.35, 0.95, e)) * (0.35 + 0.65 * smoothstep(0.03, 0.2, e));   // emphasis x voicing gate
  return num.map((x, k) => M.lerp(x / den, FILL[k], f) * g);
}
// VRM viseme weights at t, capped; gain scales the whole mouth (0 = closed). The mouth leads the sound by 30 ms
export function visemesAt(t, gain = 1) {
  const m = [0, 0, 0, 0, 0];
  if (gain > 0) for (let k = -2; k <= 2; k++) { const r = mouthRaw(t + 0.03 + k / 60, gain); for (let j = 0; j < 5; j++) m[j] += W5[k + 2] * r[j]; }
  for (let j = 0; j < 5; j++) m[j] = Math.min(m[j], CAP[j]);
  const s = Math.min(1, OPEN_MAX / Math.max(1e-6, m[0] + m[4] + 0.5 * m[3]));
  return Object.fromEntries(VIS.map((k, j) => [k, m[j] * s]));
}
// 1 inside sung words, easing to 0 over ~0.6 s outside them: slow on purpose, so the eyes and smile it drives never
// flutter per syllable
export function activityAt(t) {
  let a = 0;
  const n = segsBefore(t + 1.2);
  for (let j = Math.max(0, n - 120); j < n; j++) {
    const s = SEG[j]; if (s.kind === 'R' || s.b < t - 1.2) continue;
    a = Math.max(a, Math.exp(-((Math.max(0, s.a - t, t - s.b) / 0.35) ** 2)));
  }
  return a;
}

// seeded blinks every ~2.2-4.5 s, and with most glances away (below); each lasts ~150 ms (fast close, slower open)
const BLINKS = (() => { const out = []; let t = 0.9; for (let k = 0; t < 215; k++) { out.push(t); t += 2.2 + 2.3 * M.hash01(k, 77); } return out; })();
export const blinkShape = (d) => (d < 0 || d > 0.25 ? 0 : d < 0.06 ? d / 0.06 : Math.max(0, 1 - (d - 0.06) / 0.16));
export function blinkAt(t) {
  let b = 0;
  for (const bt of BLINKS) b = Math.max(b, blinkShape(t - bt));
  for (const g of GLANCE) if (g[4]) b = Math.max(b, blinkShape(t - g[0] + 0.02));
  return b;
}

// the 3-D singer's gaze about its target, in degrees of eye turn [yaw: + her left, pitch: + down]: a saccade every
// 0.6-2.5 s, 1-3 deg from the last point (40 ms jumps), and after some lines a glance away (down or aside) that is back
// before the next. Seeded, the same at every t on every worker
const SACC = (() => {
  const out = []; let t = 0.4, a = 0;
  for (let k = 0; t < 215; k++) {
    a += Math.PI + 1.4 * (M.hash01(k, 81) - 0.5);   // across the target from the last point: jumps of 1-3 deg
    const r = 0.5 + M.hash01(k, 82);
    out.push({ t, x: r * Math.cos(a), y: 0.6 * r * Math.sin(a) });
    t += 0.6 + 1.9 * M.hash01(k, 83);
  }
  return out;
})();
let GLANCE = [];   // [t0, t1, yaw, pitch, blink]
function buildGlances() {
  GLANCE = [];
  LINES.forEach((L, i) => {
    const next = LINES[i + 1]?.t0 ?? L.t1 + 9, h = (s) => M.hash01(i, s);
    if (next - L.t1 < 0.6 || h(84) > 0.65) return;
    const a = L.t1 + 0.08 + 0.12 * h(85), b = Math.min(a + 0.45 + 0.45 * h(86), next - 0.2), ang = [-0.6, 0.6, -1.4, 1.4][Math.floor(4 * h(87))], r = 5 + 2 * h(88);
    if (b - a >= 0.3) GLANCE.push([a, b, r * Math.sin(ang), r * Math.cos(ang), h(89) < 0.6]);
  });
}
export function gazeAt(t) {
  let lo = 0, hi = SACC.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (SACC[m].t <= t) lo = m; else hi = m - 1; }
  const s1 = SACC[lo], s0 = SACC[lo - 1] || s1, f = smoothstep(s1.t, s1.t + 0.04, t);
  let x = M.lerp(s0.x, s1.x, f), y = M.lerp(s0.y, s1.y, f);
  for (const [a, b, gx, gy] of GLANCE) { const g = smoothstep(a, a + 0.06, t) * (1 - smoothstep(b, b + 0.06, t)); x += g * gx; y += g * gy; }
  return [x, y];
}

// head idle: slow noise + a nod at every lyric line onset + a small bob on the beat
export function headAt(t, u) {
  let nod = 0;
  for (const L of LINES) {
    const d = t - L.t0;
    if (d > 0 && d < 1.2) nod += Math.exp(-d / 0.25) * Math.sin(M.TAU * 2.1 * d);
  }
  const bob = Math.cos(M.TAU * u) * 0.5 + 0.5;
  return {
    yaw: 0.10 * M.noise1(t * 0.35, 11) + 0.04 * M.noise1(t * 1.1, 12),
    pitch: 0.035 * nod + 0.02 * M.noise1(t * 0.5, 13) - 0.012 * bob,
    roll: 0.05 * M.noise1(t * 0.3, 14) + 0.01 * nod,
    bob,
  };
}

// A complete state for drawIdol(); `o` overrides any field (and may add yaw/roll offsets).
export function singer(t, u, o = {}) {
  const h = headAt(t, u);
  const lag = (dt) => headAt(t - dt, u - dt / M.GRID.period);
  const h1 = lag(0.1), h2 = lag(0.2);
  const yaw = h.yaw + (o.yawAdd || 0), roll = h.roll + (o.rollAdd || 0);
  const blink = o.blink ?? blinkAt(t);
  const sing = o.sing ?? 1;
  const m = mouthAt(t, sing);
  const mouth = o.mouth ? { ...m, ...o.mouth } : m;
  if (sing === 0 && !o.mouth) { mouth.open = 0; }
  const S = {
    t, yaw, pitch: h.pitch + (o.pitchAdd || 0), roll,
    lean: 0.012 * Math.sin(M.TAU * u / 8) + (o.lean || 0),
    breathe: Math.sin(t * 2.4),
    blinkL: blink, blinkR: blink,
    lookX: 0.25 * M.noise1(t * 0.6, 21), lookY: 0.1 * M.noise1(t * 0.5, 22),
    mouth,
    // hair follows the head late: the difference between now and 0.1/0.2 s ago, plus the beat bob
    sway: [(h.roll - h2.roll) * 4 + (h.yaw - h2.yaw) * 1.5 + 0.012 * Math.sin(M.TAU * u / 2),
      (h.roll - h1.roll) * 5 + (h.yaw - h1.yaw) * 2 + 0.01 * Math.sin(M.TAU * u / 2 + 1),
      (h.roll - h1.roll) * 3 + 0.006 * Math.sin(M.TAU * u + 2)],
    ahoge: 0.18 * M.wobble((u % 1), 2, 4) + (h.roll - h1.roll) * 6,
    blush: 0.55,
  };
  for (const k of Object.keys(o)) if (!['yawAdd', 'rollAdd', 'pitchAdd', 'blink', 'sing', 'mouth', 'lean'].includes(k)) S[k] = o[k];
  return S;
}

// ------------------------------------------------------------------ phrasing (the 3-D singer's body, pure functions of t)
// From the lines and the phones, each 0..1: the breath she takes before a line (deeper with more room before it; let out
// over the line) with the lips parting for it, a held or belted note (a vowel over 0.5 s, as loud as the smoothed
// envelope says), accents on stressed vowels (long, loud and on the beat count most) and the settle after a line that
// has room behind it (giving way to the next breath)
const envL = (t) => { let s = 0; for (let k = -3; k <= 3; k++) s += envelope(t + k * 0.05); return s / 7; };   // +/-150 ms box
export function phraseAt(t) {
  let breath = 0, part = 0, settle = 0, belt = 0, accent = 0;
  LINES.forEach((L, i) => {
    if (t < L.t0 - 0.6 || t > L.t1 + 1.4) return;
    const room = i ? L.t0 - LINES[i - 1].t1 : 9, after = i + 1 < LINES.length ? LINES[i + 1].t0 - L.t1 : 9;
    const k = 0.4 + 0.6 * smoothstep(0.1, 0.5, room), D = 0.3 + 0.2 * smoothstep(0.1, 0.6, room);
    breath = Math.max(breath, k * smoothstep(L.t0 - D, L.t0 - 0.05, t) * (1 - smoothstep(L.t0, L.t0 + Math.max(0.8, 0.7 * (L.t1 - L.t0)), t)));
    if (room >= 0.2) part = Math.max(part, k * smoothstep(L.t0 - D, L.t0 - D + 0.12, t) * (1 - smoothstep(L.t0 - 0.16, L.t0 - 0.04, t)));
    settle = Math.max(settle, smoothstep(0.25, 0.8, after) * smoothstep(L.t1, L.t1 + 0.35, t) * (1 - smoothstep(L.t1 + 0.5, L.t1 + 1.4, t)));
  });
  for (let j = segsBefore(t) - 1; j >= 0 && SEG[j].a > t - 6; j--) {
    const s = SEG[j]; if (s.kind !== 'V') continue;
    if (s.b - s.a >= 0.5) belt = Math.max(belt, smoothstep(s.a + 0.1, s.a + 0.5, t) * (1 - smoothstep(s.b - 0.05, s.b + 0.3, t)));
    if (s.st && t - s.a < 0.4) {
      const ub = M.U(s.a), on = Math.cos(Math.PI * (ub - Math.round(ub))) ** 2;
      accent += smoothstep(0.08, 0.25, s.b - s.a) * (0.4 + 0.6 * on) * smoothstep(0.15, 0.5, envelope(s.a + 0.06)) * smoothstep(0, 0.08, t - s.a) * (1 - smoothstep(0.1, 0.4, t - s.a));
    }
  }
  return { breath, part, settle: settle * (1 - breath), belt: belt * smoothstep(0.2, 0.6, envL(t)), accent: Math.min(1, accent) };
}
