// WORKED EXAMPLE (the Chai Dhaba spot): a talking cut-out character, lip-synced from lipsync.json.
// Lifted from that film's film.js; paste the parts you need into your own film.js and re-measure RIG
// on your character (all numbers are portrait pixels of the source art).
//
// Layers (made by rig_split.py from the real portrait):
//   rigBase  the portrait with the mustache painted out (clean plate)
//   rigMust  the mustache alone, same canvas size
// Per frame: draw the clean plate into an offscreen canvas, open a vector mouth at the lip seam,
// drop the jaw by sliding 2 px columns of the lower face down (compressed into the neck, feathered
// sideways with a cosine so the face contour never tears), flap the mustache halves about the nose,
// then draw the offscreen canvas as one card with rotation / squash / a nod on each phrase onset.
//
// Needs, from the film: LS = await fetch('lipsync.json') (score_vo.py writes it), PHRASE = LS.phrases,
// IMG.rigBase / IMG.rigMust loaded via M.film({ images }), and in init():
//   rigCv = document.createElement('canvas'); rigCv.width = RIG.w; rigCv.height = RIG.h; rc = rigCv.getContext('2d');
import * as M from '../../assets/lib/motion.js';   // in a film: './lib/motion.js'

const { TAU, lerp } = M;
let LS, PHRASE, IMG, rigCv, rc;   // set these up in your film (see above)

const RIG = { w: 558, h: 748, cx: 292, seam: 320, pivL: [288, 298], pivR: [296, 298], jawY0: 321, jawY1: 471 };
const VW = { A: 1.0, E: 1.12, O: 0.64, M: 0.9, F: 0.92, C: 0.95 };   // mouth width per viseme
const VCLOSE = { M: 0.2, F: 0.5 };                                 // labials / lip-bite close the mouth

// Mouth openness (from the processed VO's envelope) shaped by the visemes within +/-40 ms
// (coarticulation: neighbouring sounds blend, which reads far better than hard switching).
export function mouthAt(t) {
  const o = LS.open, i = t * LS.rate, i0 = Math.floor(i);
  if (i0 < 0 || i0 >= o.length - 1) return { open: 0, vw: 1 };
  let open = lerp(o[i0], o[i0 + 1], i - i0);
  let wsum = 0, vw = 0, cl = 0;
  for (const [a, b, v] of LS.visemes) {
    if (b < t - 0.04 || a > t + 0.04) continue;
    const ov = Math.min(b, t + 0.04) - Math.max(a, t - 0.04);
    if (ov <= 0) continue;
    wsum += ov; vw += ov * VW[v]; cl += ov * (VCLOSE[v] ?? 1);
  }
  if (wsum > 0) { vw /= wsum; open *= cl / wsum; } else vw = 1;
  return { open, vw };
}

// A damped head bob at every phrase onset: characters punctuate with the head, not just the mouth.
export function nod(t) {
  let r = 0;
  for (const p of PHRASE) {
    const d = t - p.t0;
    if (d > 0 && d < 1.2) r += Math.exp(-d / 0.22) * Math.sin(TAU * 2.4 * d);
  }
  return r;
}

export function renderRig(t, { gain = 1, flap = 0, lift = 0, talk = true } = {}) {
  rc.setTransform(1, 0, 0, 1, 0, 0);
  rc.clearRect(0, 0, RIG.w, RIG.h);
  rc.drawImage(IMG.rigBase, 0, 0);
  const m = talk ? mouthAt(t) : { open: 0, vw: 1 };
  const J = m.open * 19 * gain;                       // jaw drop in portrait px; size it for phone view
  if (J > 0.35) {
    const w = 58 * m.vw, top = 317, bot = RIG.seam + J + 2, cy = (top + bot) / 2, ry = (bot - top) / 2 + 1;
    rc.save();
    rc.beginPath(); rc.ellipse(RIG.cx, cy, w / 2, ry, 0, 0, TAU);
    rc.fillStyle = '#3b0f0c'; rc.fill();                // mouth interior
    rc.clip();
    rc.fillStyle = '#b9483f'; rc.beginPath(); rc.ellipse(RIG.cx, bot + 1, w * 0.3, Math.max(2, J * 0.42), 0, 0, TAU); rc.fill();
    if (J > 4) { rc.fillStyle = '#f3ecdc'; rc.fillRect(RIG.cx - w * 0.3, top - 1, w * 0.6, Math.min(4.5, J * 0.3) + 1.5); }
    rc.restore();
    rc.lineWidth = 3.2; rc.strokeStyle = '#141414';     // match the art's line weight
    rc.beginPath(); rc.ellipse(RIG.cx, cy, w / 2, ry, 0, 0, TAU); rc.stroke();
    // the jaw drops: columns of the lower face slide down and compress into the neck
    const band = RIG.jawY1 - RIG.jawY0;
    for (let x = 230; x < 354; x += 2) {
      const d = Math.abs(x + 1 - RIG.cx);
      const s = d < 30 ? 1 : d > 62 ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * (d - 30)) / 32);
      const dj = J * s;
      if (dj < 0.05) continue;
      rc.drawImage(IMG.rigBase, x, RIG.jawY0, 2, band, x, RIG.jawY0 + dj, 2.6, band - dj);
    }
  }
  // mustache: halves flap about the nose, lifted by the mouth (flap / lift also take manual keys,
  // e.g. a big twirl on the end card's button beat)
  const fl = ((flap + m.open * 5 * gain) * Math.PI) / 180, lf = lift + m.open * 2.4 * gain;
  for (const [side, piv, sgn] of [[0, RIG.pivL, 1], [1, RIG.pivR, -1]]) {
    rc.save();
    rc.beginPath(); rc.rect(side ? RIG.cx : 0, 0, side ? RIG.w - RIG.cx : RIG.cx, RIG.h); rc.clip();
    rc.translate(piv[0], piv[1] - lf); rc.rotate(sgn * fl); rc.translate(-piv[0], -piv[1]);
    rc.drawImage(IMG.rigMust, 0, 0);
    rc.restore();
  }
}

// The character's card, bottom-centre at (x, y), h tall. gain < 1 for a whisper.
export function character(ctx, t, x, y, h, { rot = 0, sx = 1, sy = 1, gain = 1, flap = 0, lift = 0, talk = true, nodAmt = 1 } = {}) {
  renderRig(t, { gain, flap, lift, talk });
  const w = (RIG.w * h) / RIG.h;
  const r = rot + 0.035 * nodAmt * nod(t);
  const bob = 1 + 0.012 * (talk ? mouthAt(t).open : 0) * gain;
  ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.scale(sx, sy * bob);
  ctx.drawImage(rigCv, -w / 2, -h, w, h);
  ctx.restore();
}
