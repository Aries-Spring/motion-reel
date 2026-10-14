// WORKED EXAMPLE: a singer's performance as a pure function of time, for vector_rig.js (or any rig
// with the same state fields). From a music video: copy into <film>/.
//   - mouth: the vocal stem's 100 Hz envelope (lipsync.json, from align.py) sets how open; the vowel
//     being sung at that instant (lyrics.json word timing) sets the shape, blended over +/-40 ms
//   - seeded blinks every 2.2-4.5 s (fast close, slower open); none of them random at render time
//   - idle head motion from value noise, a damped nod at every lyric line onset, a bob on the beat
//   - follow-through: hair angles are the head's motion now minus 0.1 / 0.2 s ago, so the hair lags
//     and overshoots like hair, while staying a pure function of t (no simulation state)
// singer(t, u, overrides) returns the state for drawIdol(); overrides add yaw/roll/pitch offsets
// (yawAdd...) or replace any field, so a shot can direct her ("look up", "wink", "ring eyes").
import * as M from '../../assets/lib/motion.js';   // in a film: './lib/motion.js'

let LS = null, LINES = [], WORDS = [];
export async function loadPerformance() {
  const [ls, ly] = await Promise.all([fetch('lipsync.json').then((r) => r.json()), fetch('lyrics.json').then((r) => r.json())]);
  LS = ls; LINES = ly.lines;
  WORDS = LINES.flatMap((L, li) => L.words.map((w, wi) => ({ ...w, li, wi })));
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

// seeded blinks every ~2.2-4.5 s; each lasts ~150 ms (fast close, slower open)
const BLINKS = (() => { const out = []; let t = 0.9; for (let k = 0; t < 170; k++) { out.push(t); t += 2.2 + 2.3 * M.hash01(k, 77); } return out; })();
export function blinkAt(t) {
  let b = 0;
  for (const bt of BLINKS) {
    const d = t - bt;
    if (d < 0 || d > 0.25) continue;
    b = Math.max(b, d < 0.06 ? d / 0.06 : Math.max(0, 1 - (d - 0.06) / 0.16));
  }
  return b;
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
