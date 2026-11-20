// THE WOW! SIGNAL — a YouTube Short (9:16, 59.4 s). Pure function of time: window.seek(t) paints frame t.
// 100 bpm, 99 beats. vo.json (audio/score.py) places every phrase and word on the grid, so captions,
// stamps and cuts land on the spoken word. The last frame is the first frame: the Short loops seamlessly.
import * as M from './lib/motion.js';
import * as P from './lib/ps1.js';
import * as S from './sets/world.js';

const { W, H, E, prog, lerp, clamp, springU, font, layout, text, fill, noise1, hash01 } = M;
const VO = await fetch('vo.json').then((r) => r.json());
const BEAT = 0.6;
const ub = (t) => t / BEAT;
const WORDS = VO.words;
const PH = Object.fromEntries(VO.phrases.map((p) => [p.id, p]));
const word = (pid, k) => WORDS.filter((w) => w.p === pid)[k];
const wb = (pid, k) => ub(word(pid, k).t0);                          // beat a word starts on
const q4 = (b) => Math.round(b * 4) / 4;                             // nearest quarter beat

const C = { ink: '#05060A', bone: '#F2EEE4', red: '#E3262B', green: '#4DFF8A', amber: '#FFB547' };
const DISPLAY = 'Anton', UI = 'VT';
const SAFE = M.FORMAT.safe;
const CX = SAFE.x + SAFE.w / 2;                                      // centre of the Shorts safe area

// key moments, from the words themselves
const K = {
  called: q4(wb('H1', 10)),        // "called" -> cut to Earth
  telescope: q4(wb('S2', 2)),
  loud: wb('S3', 7),
  letters: wb('S3', 17),
  seconds: ub(word('S4', 7).t1),   // "seconds," ends: the timer lands on 72
  deep: q4(wb('S4', 8)),           // "exactly" -> Earth turning
  frequency: wb('S5', 3),
  circles: wb('S7', 1),
  torn: wb('S11', 0),
  y1998: wb('S11', 3),
  expand: q4(wb('S11', 5)),
  golf: wb('S11', 7),
  flash: wb('S12', 6),
  y2024: wb('S12', 1),
};

// ---------------------------------------------------------------- hits (sfx.mjs + audio/sfx_el.py)
const HITS = [
  [0, 'the printout', 'thud', { gain: 0.35 }],
  [K.called, 'cut to Earth', 'whoosh', { len: 0.5, from: 600, to: 3000, gain: 0.12 }],
  [7, 'AUGUST 15, 1977', 'thud+click', { gain: 0.4 }],
  [10.25, 'low over the dish', 'whoosh', { len: 0.7, from: 300, to: 1800, gain: 0.1 }],
  [K.telescope, 'BIG EAR', 'click', { gain: 0.3 }],
  [15.75, 'the room / 11:16 PM', 'thud', { el: 'computer', gain: 0.3, elGain: 0.35, align: 'first' }],
  [18.5, 'the CRT', 'click', { el: 'crt', gain: 0.35, elGain: 0.8 }],
  [K.loud, 'the spike', 'sub', { len: 0.8, gain: 0.4 }],
  [20.75, 'the printer', 'click', { el: 'printer', gain: 0.3, elGain: 0.7, align: 'first' }],
  [26, '6', null], [27, 'E', null], [28, 'Q', null], [29, 'U', null], [30, 'J', null], [31, '5', null],
  [33, '72 seconds', 'whoosh', { len: 0.6, from: 3000, to: 400, gain: 0.1 }],
  [K.seconds, 'the timer lands: 1:12', 'click+tick', { gain: 0.35 }],
  [43.5, '1420 MHz', 'thud', { gain: 0.35 }],
  [50.5, 'the desk', 'whoosh', { len: 0.6, from: 2500, to: 500, gain: 0.08 }],
  [K.circles, 'the red circle', 'tick', { el: 'circle', gain: 0.3, elGain: 0.9, align: 'first' }],
  [61, 'WOW!', null, { el: 'scribble', gain: 0.9, align: 'first' }],
  [63.5, 'the array', 'whoosh', { len: 0.8, from: 400, to: 2400, gain: 0.1 }],
  [68.5, 'never came back', 'sub', { len: 1.0, gain: 0.25 }],
  [71.5, 'Big Ear again', 'whoosh', { len: 0.8, from: 2000, to: 300, gain: 0.08 }],
  [K.torn, 'the collapse', null, { el: 'collapse', gain: 0.85 }],
  [K.y1998, '1998', 'thud+click', { gain: 0.5 }],
  [K.expand, 'the golf course', null, { el: 'golfhit', gain: 0.9 }],
  [K.expand + 1.5, 'polite applause', null, { el: 'applause', gain: 0.6, align: 'first' }],
  [82, '2024', 'thud+click', { gain: 0.35 }],
  [K.flash, 'the flash', null, { el: 'flash', gain: 0.8 }],
  [91.5, 'UNPROVEN', 'thud', { gain: 0.4 }],
  [94, 'back to the paper', null, { el: 'tear', gain: 0.5 }],
];

// ---------------------------------------------------------------- helpers
const SETS = {};
let GRAIN = [], SCAN = null, VIG = null, SHEET = null, CHARS = null;

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
function stage(ctx, set, t3, u3, o, pres = {}) { P.renderSet(SETS[set], t3, u3, o); P.present(ctx, { bleed: 1, ...pres }); }
function vignette(ctx, k = 1) { ctx.save(); ctx.globalAlpha = k; ctx.drawImage(VIG, 0, 0); ctx.restore(); }
function veil(ctx, a, col = '#000') { ctx.save(); ctx.globalAlpha = a; fill(ctx, col); ctx.restore(); }
const fnt = (size, fam = DISPLAY) => `400 ${Math.round(size)}px ${fam}`;

// a word stamped in, on a red tag (news-chyron energy), spring scale + a red/cyan split that settles
function tag(ctx, str, x, y, size, u, u0, { bg = C.red, fg = '#ffffff', align = 'center', rot = -0.03, fam = DISPLAY, pad = 0.28 } = {}) {
  if (u < u0) return;
  const a = u - u0;
  const k = springU(u, u0, { stiffness: 700, damping: 26 });
  const f = fnt(size, fam);
  const L = layout(ctx, str, f, 0);
  const w = L.width + size * pad * 2, h = size * 1.12;
  const ox = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot * (1 - 0.5 * k)); ctx.scale(lerp(1.35, 1, k), lerp(1.35, 1, k));
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(ox, -h * 0.82, w, h); }
  const d = 10 * Math.exp(-a * 6);
  if (d > 0.5) { ctx.globalCompositeOperation = 'lighter'; text(ctx, str, ox + size * pad - d, 0, f, 'rgba(255,40,60,0.6)'); text(ctx, str, ox + size * pad + d, 0, f, 'rgba(40,200,255,0.5)'); ctx.globalCompositeOperation = 'source-over'; }
  text(ctx, str, ox + size * pad, 0, f, fg);
  ctx.restore();
}
// big slammed type with a dark outline (for numbers and the letters)
function slam(ctx, str, x, y, size, u, u0, { color = C.bone, stroke = '#000', sw = 0.06, over = 1.4, fam = DISPLAY } = {}) {
  if (u < u0) return;
  const a = u - u0;
  const k = springU(u, u0, { stiffness: 900, damping: 30 });
  const f = fnt(size, fam);
  ctx.save();
  ctx.translate(x + 10 * Math.exp(-a * 8) * noise1(u * 50, 2), y);
  ctx.scale(lerp(over, 1, k), lerp(over, 1, k));
  ctx.font = f; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.lineWidth = size * sw * 2; ctx.strokeStyle = stroke; ctx.strokeText(str, 0, 0);
  const d = 14 * Math.exp(-a * 5);
  if (d > 0.5) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,40,60,0.6)'; ctx.fillText(str, -d, 0); ctx.fillStyle = 'rgba(40,200,255,0.5)'; ctx.fillText(str, d, 0); ctx.globalCompositeOperation = 'source-over'; }
  ctx.fillStyle = color; ctx.fillText(str, 0, 0);
  ctx.restore();
}
function vt(ctx, str, x, y, size, color, align = 'center', u = null, u0 = null, rate = 30) {
  const s = u != null ? str.slice(0, Math.max(0, Math.floor((u - u0) * rate))) : str;
  if (!s) return;
  ctx.save(); ctx.font = fnt(size, UI); ctx.textAlign = align; ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.16; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(s, x, y);
  ctx.fillStyle = color; ctx.fillText(s, x, y); ctx.restore();
}

// ---------------------------------------------------------------- captions: Shorts-style, word by word

const CHUNKS = (() => {
  const out = [];
  for (const p of VO.phrases) {
    if (p.id.startsWith('L')) continue;                              // the letters are their own captions
    const ws = WORDS.filter((w) => w.p === p.id);
    let cur = [];
    const flush = () => { if (cur.length) out.push({ p: p.id, words: cur }); cur = []; };
    ws.forEach((w, i) => {
      cur.push(w);
      const chars = cur.map((x) => x.w).join(' ').length;
      const brk = /[.,?…]$/.test(w.w) || w.w.endsWith('...');
      if (cur.length >= 3 || chars >= 13 || brk) flush();
    });
    flush();
  }
  out.forEach((c, i) => {
    c.t0 = i === 0 ? 0 : c.words[0].t0 - 0.04;                       // the hook's first words are on frame 0
    const next = out[i + 1];
    c.t1 = Math.min(c.words[c.words.length - 1].t1 + 0.35, next ? next.words[0].t0 - 0.04 : 99);
  });
  return out;
})();
const clean = (w) => w.toUpperCase().replace(/\.\.\.$/, '…').replace(/[,.]$/, '').replace(/…$/, '...');

function captions(ctx, t, y = 1250) {
  const c = CHUNKS.find((k) => t >= k.t0 && t < k.t1);
  if (!c) return;
  const size = 104;
  const f = fnt(size);
  const toks = c.words.map((w) => clean(w.w));
  const widths = toks.map((s) => layout(ctx, s, f, 0).width);
  const gap = size * 0.24;
  let total = widths.reduce((a, b) => a + b, 0) + gap * (toks.length - 1);
  let s = Math.min(1, (SAFE.w * 0.98) / total);
  const k = springU(ub(t), ub(c.t0), { stiffness: 620, damping: 24 });
  const pop = lerp(1.18, 1, k);
  ctx.save();
  ctx.translate(CX, y); ctx.scale(s * pop, s * pop);
  let x = -total / 2;
  ctx.font = f; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
  toks.forEach((tok, i) => {
    const w = c.words[i];
    const active = t >= w.t0 - 0.03 && (i === toks.length - 1 || t < c.words[i + 1].t0 - 0.03);
    const said = t >= w.t0 - 0.03;
    ctx.save();
    ctx.translate(x, 0);
    if (active) { const kk = springU(ub(t), ub(w.t0 - 0.03), { stiffness: 900, damping: 30 }); ctx.translate(widths[i] / 2, -size * 0.35); ctx.scale(lerp(1.22, 1.08, kk), lerp(1.22, 1.08, kk)); ctx.translate(-widths[i] / 2, size * 0.35); }
    ctx.lineWidth = size * 0.17; ctx.strokeStyle = '#000'; ctx.strokeText(tok, 0, 0);
    ctx.fillStyle = active ? C.red : said ? '#ffffff' : 'rgba(255,255,255,0.55)';
    ctx.fillText(tok, 0, 0);
    ctx.restore();
    x += widths[i] + gap;
  });
  ctx.restore();
}

// ---------------------------------------------------------------- the printout (2-D, crisp)

const SH = { w: 1160, h: 2240, x0: 300, y0: 150, cp: 78, rp: 80, cols: 11, rows: 26, col: 2, row: 12 };
const READ = ['6', 'E', 'Q', 'U', 'J', '5'];
function cellChar(c, r) {
  if (c === SH.col && r >= SH.row && r < SH.row + 6) return READ[r - SH.row];
  const v = hash01(c * 97 + r * 13, 5);
  if (c === SH.col && (r === SH.row - 1 || r === SH.row + 6)) return v > 0.5 ? '2' : '1';
  return v < 0.38 ? ' ' : v < 0.8 ? '1' : v < 0.93 ? '2' : v < 0.985 ? '3' : '4';
}
function buildSheet() {
  SHEET = document.createElement('canvas'); SHEET.width = SH.w; SHEET.height = SH.h;
  const c = SHEET.getContext('2d');
  for (let y = 0; y < SH.h; y += 40) { c.fillStyle = Math.floor(y / 120) % 2 ? '#f3f4ec' : '#d3e6cf'; c.fillRect(0, y, SH.w, 40); }
  const r = M.mulberry32(5);
  for (let i = 0; i < 26000; i++) { c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)'; c.fillRect(r() * SH.w, r() * SH.h, 2, 2); }
  c.fillStyle = '#e7e8e0'; c.fillRect(0, 0, 70, SH.h); c.fillRect(SH.w - 70, 0, 70, SH.h);
  for (let y = 30; y < SH.h; y += 60) for (const x of [35, SH.w - 35]) { c.fillStyle = '#1a1c18'; c.beginPath(); c.arc(x, y, 13, 0, M.TAU); c.fill(); }
  c.strokeStyle = 'rgba(0,0,0,0.12)'; c.setLineDash([6, 8]); c.beginPath(); c.moveTo(70, 0); c.lineTo(70, SH.h); c.moveTo(SH.w - 70, 0); c.lineTo(SH.w - 70, SH.h); c.stroke(); c.setLineDash([]);
  CHARS = document.createElement('canvas'); CHARS.width = SH.w; CHARS.height = SH.h;
  const k = CHARS.getContext('2d');
  k.font = `400 70px ${UI}`; k.textAlign = 'center';
  for (let row = 0; row < SH.rows; row++) for (let col = 0; col < SH.cols; col++) {
    const ch = cellChar(col, row);
    if (ch === ' ') continue;
    const x = SH.x0 + col * SH.cp, y = SH.y0 + row * SH.rp;
    k.fillStyle = `rgba(30,30,40,${0.78 + 0.2 * hash01(col + row * 31, 9)})`;
    k.fillText(ch, x + (hash01(col + row, 4) - 0.5) * 3, y + (hash01(col * 3 + row, 6) - 0.5) * 3);
  }
}
const CIRC = { cx: SH.x0 + SH.col * SH.cp, cy: SH.y0 + (SH.row + 2.5) * SH.rp - 24, rx: 62, ry: 278 };
function circlePts(n = 90) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI * 0.62 + (i / n) * Math.PI * 2.18;
    const wob = 1 + 0.05 * Math.sin(a * 3 + 1) + 0.025 * Math.sin(a * 7);
    const grow = 1 + 0.07 * (i / n);
    pts.push([CIRC.cx + Math.cos(a) * CIRC.rx * wob * grow + 6, CIRC.cy + Math.sin(a) * CIRC.ry * wob * grow]);
  }
  return pts;
}
// "Wow!" by hand: strokes in a 200 x 110 box, Catmull-Rom smoothed
function catmull(pts, n = 8) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const WOW = (() => {
  const W1 = catmull([[0, 12], [6, 60], [16, 100], [27, 52], [36, 40], [44, 70], [54, 100], [64, 50], [72, 6]]);
  const O = [];
  for (let i = 0; i <= 30; i++) { const a = -Math.PI / 2 - (i / 30) * Math.PI * 2.15; O.push([92 + Math.cos(a) * 17, 70 + Math.sin(a) * 23]); }
  const W2 = catmull([[106, 52], [114, 80], [121, 100], [128, 72], [134, 62], [140, 84], [147, 100], [155, 70], [163, 46]]);
  const BANG = [[188, 0], [186, 30], [182, 72]];
  const strokes = [W1, O, W2, BANG].map((s) => { const len = [0]; for (let i = 1; i < s.length; i++) len.push(len[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1])); return { s, len, total: len[len.length - 1] }; });
  const total = strokes.reduce((a, b) => a + b.total, 0);
  return { strokes, total };
})();
function penStroke(c, pts, upto, width, col) {
  if (upto < 2) return;
  c.strokeStyle = col; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  const n = Math.floor(upto), f = upto - n;
  for (let i = 1; i < Math.min(n, pts.length); i++) c.lineTo(pts[i][0], pts[i][1]);
  if (n < pts.length && n > 0) { const a = pts[n - 1], b = pts[n]; c.lineTo(lerp(a[0], b[0], f), lerp(a[1], b[1], f)); }
  c.stroke();
}
// draw the sheet centred on sheet point (px, py) at screen (sx, sy), scale s, rotation rot
function printout(ctx, { px = CIRC.cx, py = CIRC.cy, sx = CX, sy = H * 0.44, s = 1, rot = -0.06, rows = 99, circle = 1, wow = 1, pen = null, glow = 0, flash = 0 }) {
  ctx.save();
  ctx.translate(sx, sy); ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-px, -py);
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
  ctx.drawImage(SHEET, 0, 0);
  ctx.shadowColor = 'transparent';
  if (rows >= SH.rows) ctx.drawImage(CHARS, 0, 0);
  else if (rows > 0) { const hh = SH.y0 + rows * SH.rp - SH.rp + 18; ctx.drawImage(CHARS, 0, 0, SH.w, hh, 0, 0, SH.w, hh); }
  if (flash > 0) { ctx.fillStyle = `rgba(227,38,43,${0.5 * flash})`; ctx.fillRect(CIRC.cx - 45, SH.y0 + SH.row * SH.rp - 70, 90, 6 * SH.rp + 10); }
  // the red pen
  const red = '#d4222a';
  if (glow > 0) { ctx.shadowColor = `rgba(255,40,40,${0.9 * glow})`; ctx.shadowBlur = 30 * glow; }
  const cp = circlePts();
  penStroke(ctx, cp, circle * (cp.length - 1), 9, red);
  if (wow > 0) {
    ctx.save(); ctx.translate(70, CIRC.cy - 70); ctx.rotate(-0.12); ctx.scale(1.15, 1.15);
    let left = wow * WOW.total;
    for (const st of WOW.strokes) {
      if (left <= 0) break;
      const L = Math.min(left, st.total);
      let idx = st.len.findIndex((v) => v >= L); if (idx < 0) idx = st.s.length - 1;
      const f = idx > 0 ? (L - st.len[idx - 1]) / Math.max(1e-6, st.len[idx] - st.len[idx - 1]) : 0;
      penStroke(ctx, st.s, idx - 1 + f + 1, 8, red);
      left -= st.total;
    }
    if (wow >= 0.97) { ctx.fillStyle = red; ctx.beginPath(); ctx.arc(181, 94, 6, 0, M.TAU); ctx.fill(); }
    ctx.restore();
  }
  ctx.shadowColor = 'transparent';
  if (pen) {
    // a red felt-tip, drawn as a slanted body with a nib at the point
    ctx.save(); ctx.translate(pen[0], pen[1]); ctx.rotate(-0.7);
    ctx.fillStyle = '#b8161d'; ctx.fillRect(-9, -190, 18, 160);
    ctx.fillStyle = '#e8e4da'; ctx.fillRect(-9, -205, 18, 18);
    ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.moveTo(-9, -30); ctx.lineTo(9, -30); ctx.lineTo(2, 0); ctx.lineTo(-2, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // lamp light falloff over the paper
  const g = ctx.createRadialGradient(sx - 120, sy - 300, 100, sx, sy, 1300);
  g.addColorStop(0, 'rgba(255,240,210,0.0)'); g.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
// the pen tip position along the circle / the word, in sheet coordinates
function penAt(kind, p) {
  if (kind === 'circle') { const cp = circlePts(); const i = Math.min(cp.length - 1, Math.floor(p * (cp.length - 1))); return cp[i]; }
  let left = p * WOW.total;
  for (const st of WOW.strokes) {
    if (left <= st.total) { let idx = st.len.findIndex((v) => v >= left); if (idx < 0) idx = st.s.length - 1; const [x, y] = st.s[idx]; const a = -0.12, s = 1.15; return [70 + (x * Math.cos(a) - y * Math.sin(a)) * s, CIRC.cy - 70 + (x * Math.sin(a) + y * Math.cos(a)) * s]; }
    left -= st.total;
  }
  return [70 + 181 * 1.15, CIRC.cy - 70 + 94 * 1.15];
}
// the hook / loop framing: tight on the circled column (identical at u = 0 and u = 99)
const HOOK = { s: 1.55, rot: -0.06, sy: H * 0.40, px: CIRC.cx - 86 };

// ---------------------------------------------------------------- shots
const SHOTS = [
  // 1. HOOK: the printout, tight on 6EQUJ5, pulling back
  [0, 'K.called', (ctx, u, t, u3, t3) => {
    fill(ctx, '#0b0a08');
    const p = E.outCubic(prog(u, 0, K.called));
    const s = HOOK.s * (0.72 / HOOK.s) ** p;
    printout(ctx, { s, rot: lerp(HOOK.rot, -0.1, p), sy: HOOK.sy, px: lerp(HOOK.px, CIRC.cx - 60, p), py: lerp(CIRC.cy, CIRC.cy + 30, p), glow: 0.4 });
    vignette(ctx, 0.9);
    tag(ctx, 'UNSOLVED SINCE 1977', CX, SAFE.y + 90, 64, u, 0, { fam: DISPLAY });
    captions(ctx, t);
  }],
  // 2. ...called Earth: the planet, the signal arriving
  ['K.called', 7, (ctx, u, t, u3, t3) => {
    const p = prog(u3, K.called, 7);
    stage(ctx, 'space', t3, u3, { cam: [[lerp(1.5, 0.6, p), lerp(1.2, 0.6, p), lerp(9.5, 6.4, E.outCubic(p))], [0, 0.3, 0], 46, 0.05], beam: 0, rings: 0.35 + p * 0.8, spin: 0.9 + t3 * 0.3 });
    vignette(ctx, 0.9);
    captions(ctx, t);
  }],
  // 3. August 1977: Big Ear under the Milky Way
  [7, 10.25, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[7, [[-30, 22, 44], [0, 2, -8], 58, -0.04]], [10.25, [[-22, 14, 36], [0, 2, -10], 54, -0.02]]], E.linear);
    stage(ctx, 'ear', t3, u3, { cam: c });
    vignette(ctx, 0.9);
    tag(ctx, 'AUGUST 15, 1977', CX, SAFE.y + 170, 84, u, 7.05);
    captions(ctx, t);
  }],
  // 4. low over the ground plane toward the giant reflector
  [10.25, 15.75, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[10.25, [[2, 1.4, 15], [0, 4, -18], 62, 0.02]], [15.75, [[0.5, 1.6, -4], [0, 6, -19], 70, 0]]], E.inOutSine);
    stage(ctx, 'ear', t3, u3, { cam: c });
    vignette(ctx, 0.9);
    tag(ctx, 'BIG EAR', CX, SAFE.y + 170, 96, u, K.telescope);
    vt(ctx, 'OHIO STATE UNIVERSITY', CX, SAFE.y + 255, 56, C.bone, 'center', u, K.telescope + 0.4, 40);
    captions(ctx, t);
  }],
  // 5. late one night: the room, nobody in it, the clock at 11:16
  [15.75, 18.5, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[15.75, [[0.2, 1.75, 2.9], [0.6, 1.4, -2], 64, 0]], [18.5, [[0.6, 1.7, 1.7], [1.2, 1.6, -3], 58, 0]]], E.inOutSine);
    stage(ctx, 'room', t3, u3, { cam: c, spike: 0, flicker: 1 });
    vignette(ctx, 0.9);
    slam(ctx, '11:16 PM', CX, SAFE.y + 230, 150, u, 16.25, { color: C.bone });
    vt(ctx, 'EASTERN DAYLIGHT TIME', CX, SAFE.y + 305, 54, C.bone, 'center', u, 16.8, 40);
    captions(ctx, t);
  }],
  // 6. the CRT: the spike
  [18.5, 20.75, (ctx, u, t, u3, t3) => {
    const sp = E.outExpo(prog(u, K.loud - 0.3, K.loud + 0.4));
    const sh = sp > 0 && sp < 1 ? 0.01 : 0;
    stage(ctx, 'room', t3, u3, { cam: [[-0.3 + sh * noise1(u * 60, 1), 1.05, -0.1 + lerp(0.25, 0, prog(u3, 18.5, 20.75))], [-0.3, 1.02, -0.95], 42, 0.02], spike: sp }, { bleed: sp > 0.5 ? 2 : 1 });
    vignette(ctx, 0.9);
    captions(ctx, t);
  }],
  // 7. the computer runs out of numbers... and switches to letters
  [20.75, 26, (ctx, u, t, u3, t3) => {
    fill(ctx, '#0b0a08');
    const rows = Math.floor(lerp(4, SH.row + 6, clamp((u - 20.75) / (K.letters + 0.6 - 20.75))));
    const s = 0.78 * (1.25 / 0.78) ** E.inOutSine(prog(u, 20.75, 26));
    const py = SH.y0 + Math.max(0, rows - 6) * SH.rp;
    const fl = u > K.letters ? 1 : 0;
    printout(ctx, { s, sy: H * 0.45, px: CIRC.cx + 40, py: lerp(py, CIRC.cy, prog(u, K.letters - 1, K.letters + 0.5)), rot: -0.04, rows, circle: 0, wow: 0, flash: fl * (0.6 + 0.4 * Math.sin(u * 12)) });
    vignette(ctx, 0.8);
    captions(ctx, t);
  }],
  // 8. 6 E Q U J 5: one per beat, the bars build
  [26, 33, (ctx, u, t, u3, t3) => {
    stage(ctx, 'space', t3, u3, { cam: [[0, 0, 40], [-8, 6, -170], lerp(30, 22, prog(u3, 26, 33)), 0.02 * Math.sin(u)], cloud: 0, rings: -1 });
    veil(ctx, 0.45);
    vignette(ctx, 1);
    const k = Math.min(5, Math.floor(u - 26));
    const v = [6, 14, 26, 30, 19, 5][k];
    const big = 560 + v * 5;
    slam(ctx, READ[k], CX, 1010, big, u, 26 + k, { color: k === 3 ? C.red : C.bone, over: 1.2 });
    // the bars: strength in multiples of the noise
    const bw = 104, gap = 26, x0 = CX - (6 * bw + 5 * gap) / 2, base = 1440;
    for (let i = 0; i <= k; i++) {
      const vv = [6, 14, 26, 30, 19, 5][i];
      const hgt = vv * 9.5 * E.outBack(clamp((u - 26 - i) / 0.35), 1.6);
      ctx.fillStyle = i === 3 ? C.red : C.bone;
      ctx.fillRect(x0 + i * (bw + gap), base - hgt, bw, hgt);
      vt(ctx, READ[i], x0 + i * (bw + gap) + bw / 2, base + 64, 64, C.bone);
      vt(ctx, String(vv), x0 + i * (bw + gap) + bw / 2, base - hgt - 16, 46, i === 3 ? C.red : C.bone);
    }
    vt(ctx, 'STRENGTH × THE NOISE', CX, base + 126, 54, C.bone);
    if (u >= 29) tag(ctx, '30X STRONGER THAN THE NOISE', CX, SAFE.y + 100, 62, u, 29.1);
  }],
  // 9a. 72 seconds: the curve and the clock
  [33, 'K.deep', (ctx, u, t, u3, t3) => {
    stage(ctx, 'space', t3, u3, { cam: [[0, 0, 40], [-8, 6, -170], 22, 0], rings: -1 });
    veil(ctx, 0.55);
    vignette(ctx, 1);
    const p = clamp((u - 33) / (K.seconds - 33));
    const secs = Math.round(72 * p);
    slam(ctx, `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`, CX, SAFE.y + 330, 230, u, 33, { color: p >= 1 ? C.red : C.bone, fam: UI, sw: 0.05 });
    // the bell curve, drawn as the clock runs, through the six readings
    const x0 = SAFE.x + 30, x1 = SAFE.x + SAFE.w - 30, yb = 1150, hh = 430;
    ctx.save(); ctx.lineWidth = 10; ctx.strokeStyle = C.red; ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(255,40,40,0.8)'; ctx.shadowBlur = 24;
    ctx.beginPath();
    for (let i = 0; i <= 120 * p; i++) { const xx = i / 120; const y = Math.exp(-(((xx - 0.5) / 0.19) ** 2)); const px = lerp(x0, x1, xx), py = yb - y * hh - 4 * noise1(i * 0.9 + u * 3, 2); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.stroke(); ctx.restore();
    ctx.fillStyle = 'rgba(242,238,228,0.35)'; ctx.fillRect(x0, yb + 6, x1 - x0, 3);
    [6, 14, 26, 30, 19, 5].forEach((v, i) => { const xx = (i + 0.5) / 6; if (xx > p) return; const px = lerp(x0, x1, xx), py = yb - (v / 30) * hh; ctx.fillStyle = C.bone; ctx.beginPath(); ctx.arc(px, py, 12, 0, M.TAU); ctx.fill(); vt(ctx, READ[i], px, yb + 60, 50, C.bone); });
    captions(ctx, t, 1430);
  }],
  // 9b. exactly like a signal from deep space: Earth turns, the beam sweeps across Sagittarius
  ['K.deep', 43.5, (ctx, u, t, u3, t3) => {
    const p = prog(u3, K.deep, 43.5);
    stage(ctx, 'space', t3, u3, { cam: [[lerp(3, -6, p), lerp(2, 4, p), lerp(10, 16, p)], [lerp(0, -3, p), lerp(0, 2, p), lerp(0, -40, p)], 50, 0.03], beam: 1, lon: 0.6 + p * 1.4, spin: 0.8 + p * 0.9, rings: 0.2 + p * 0.9 });
    vignette(ctx, 0.9);
    captions(ctx, t);
  }],
  // 10. the frequency: a tuner sweeps to 1420 MHz
  [43.5, 50.5, (ctx, u, t, u3, t3) => {
    stage(ctx, 'ear', t3, u3, { cam: [[1.6, 1.2, -9.5], [0, 1.0, -13], 50, 0.02] });
    veil(ctx, 0.35);
    vignette(ctx, 0.9);
    // the dial
    const dx = SAFE.x + 20, dw = SAFE.w - 40, dy = 600, dh = 260;
    ctx.save();
    ctx.fillStyle = '#1a140c'; M.rrect(ctx, dx - 14, dy - 14, dw + 28, dh + 28, 26); ctx.fill();
    const gl = ctx.createLinearGradient(0, dy, 0, dy + dh); gl.addColorStop(0, '#ffcf7a'); gl.addColorStop(1, '#d88a2a');
    ctx.fillStyle = gl; M.rrect(ctx, dx, dy, dw, dh, 16); ctx.fill();
    const f0 = 1400, f1 = 1440, fx = (f) => dx + 40 + ((f - f0) / (f1 - f0)) * (dw - 80);
    ctx.strokeStyle = '#2a1a08'; ctx.fillStyle = '#2a1a08';
    for (let f = f0; f <= f1; f += 2) { ctx.lineWidth = f % 10 === 0 ? 5 : 2; ctx.beginPath(); ctx.moveTo(fx(f), dy + 30); ctx.lineTo(fx(f), dy + (f % 10 === 0 ? 120 : 80)); ctx.stroke(); }
    ctx.font = fnt(52, UI); ctx.textAlign = 'center';
    for (let f = f0; f <= f1; f += 10) ctx.fillText(String(f), fx(f), dy + 190);
    ctx.font = fnt(36, UI); ctx.fillText('MHz', dx + dw - 60, dy + 240);
    const sweep = E.inOutCubic(prog(u, 43.6, K.frequency + 0.5));
    const fq = lerp(1403, 1420.4, sweep) + (sweep >= 1 ? 0.15 * Math.sin(u * 20) * Math.exp(-(u - K.frequency - 0.5) * 3) : 0);
    ctx.strokeStyle = C.red; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(fx(fq), dy - 6); ctx.lineTo(fx(fq), dy + dh + 6); ctx.stroke();
    ctx.restore();
    if (sweep >= 1) {
      slam(ctx, '1420 MHz', CX, 470, 190, u, K.frequency + 0.5, { color: C.bone });
      tag(ctx, 'THE HYDROGEN LINE', CX, 1010, 62, u, K.frequency + 0.9);
    }
    captions(ctx, t);
  }],
  // 11. days later: Jerry Ehman at his desk
  [50.5, 55.5, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[50.5, [[1.6, 1.9, 2.0], [0.1, 0.85, 0], 52, 0]], [55.5, [[0.9, 1.45, 1.05], [0.2, 0.8, 0.05], 46, 0]]], E.inOutSine);
    stage(ctx, 'desk', t3, u3, { cam: c, write: 0.2 });
    vignette(ctx, 0.9);
    tag(ctx, 'DAYS LATER', CX, SAFE.y + 150, 78, u, 50.55);
    vt(ctx, 'JERRY R. EHMAN · ASTRONOMER', CX, SAFE.y + 240, 54, C.bone, 'center', u, wb('S6', 2), 40);
    captions(ctx, t);
  }],
  // 12. he circles it in red... and writes one word
  [55.5, 61, (ctx, u, t, u3, t3) => {
    fill(ctx, '#0b0a08');
    const cp = E.inOutSine(prog(u, K.circles, K.circles + 1.6));
    const toWow = E.inOutCubic(prog(u, 58.8, 61));
    const pen = cp < 1 ? penAt('circle', cp) : (() => { const a = penAt('circle', 1), b = penAt('wow', 0); return [lerp(a[0], b[0], toWow), lerp(a[1], b[1], toWow)]; })();
    const s = lerp(1.1, 1.75, E.inOutCubic(prog(u, 58.8, 61)));
    printout(ctx, { s, sy: H * 0.42, px: lerp(CIRC.cx, 205, toWow), py: lerp(CIRC.cy, CIRC.cy - 20, toWow), rot: lerp(-0.06, -0.05, toWow), circle: cp, wow: 0, pen: u > K.circles - 0.3 ? pen : null });
    vignette(ctx, 0.8);
    captions(ctx, t);
  }],
  // 13. WOW!
  [61, 63.5, (ctx, u, t, u3, t3) => {
    fill(ctx, '#0b0a08');
    const wp = E.inOutSine(prog(u, 61, 62.6));
    const punch = 1 + 0.12 * Math.exp(-(u - 61) * 3) + 0.06 * prog(u, 61, 63.5);
    const shk = 14 * Math.exp(-(u - 61) * 5);
    ctx.save(); ctx.translate(shk * noise1(u * 60, 1), shk * noise1(u * 60, 3));
    printout(ctx, { s: 1.75 * punch, sy: H * 0.42, px: 205, py: CIRC.cy - 20, rot: -0.05, circle: 1, wow: wp, pen: wp < 1 ? penAt('wow', wp) : null, glow: E.outCubic(prog(u, 61, 62.8)) });
    ctx.restore();
    vignette(ctx, 0.8);
  }],
  // 14. decades of searching: the array turns as one
  [63.5, 68.5, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[63.5, [[18, 2.5, 20], [-6, 6, -12], 56, 0]], [68.5, [[10, 1.8, 14], [-6, 7, -12], 52, -0.02]]], E.inOutSine);
    stage(ctx, 'dish', t3, u3, { cam: c, aim: prog(u3, 63.6, 67) });
    vignette(ctx, 0.9);
    const yr = Math.round(lerp(1977, 2022, E.inQuad(prog(u, 63.6, 68.2))));
    slam(ctx, String(yr), CX, SAFE.y + 260, 200, u, 63.5, { color: C.bone, fam: UI, sw: 0.04, over: 1.1 });
    vt(ctx, 'THE SAME PATCH OF SKY', CX, SAFE.y + 335, 56, C.bone);
    captions(ctx, t);
  }],
  // 15. it never came back
  [68.5, 71.5, (ctx, u, t, u3, t3) => {
    stage(ctx, 'space', t3, u3, { cam: [[0, 0, 40], [-8, 6, -170], 26, 0], rings: -1 });
    veil(ctx, 0.55);
    vignette(ctx, 1.1);
    const x0 = SAFE.x + 30, x1 = SAFE.x + SAFE.w - 30, yb = 960;
    ctx.save(); ctx.strokeStyle = C.green; ctx.lineWidth = 6; ctx.shadowColor = 'rgba(77,255,138,0.8)'; ctx.shadowBlur = 18; ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const px = lerp(x0, x1, i / 120), py = yb - 3 * noise1(i * 1.3 + u * 6, 5); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.stroke(); ctx.restore();
    if (Math.floor(u * 2) % 2 === 0) vt(ctx, 'NO SIGNAL', CX, 860, 92, C.green);
    captions(ctx, t);
  }],
  // 16. and the telescope that heard it?
  [71.5, 'K.torn', (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[71.5, [[-18, 6, 30], [0, 4, -16], 52, 0]], [K.torn, [[-12, 4, 18], [0, 4, -18], 52, 0]]], E.inOutSine);
    stage(ctx, 'ear', t3, u3, { cam: c });
    vignette(ctx, 1);
    captions(ctx, t);
  }],
  // 17. torn down in 1998
  ['K.torn', 'K.expand', (ctx, u, t, u3, t3) => {
    const col = prog(u3, K.torn, K.torn + 2.6);
    const sh = 0.35 * Math.exp(-(u - K.torn - 0.6) * 1.5) * (u > K.torn + 0.3 ? 1 : 0);
    stage(ctx, 'ear', t3, u3, { cam: [[-12 + sh * noise1(u * 40, 1), 4 + sh * noise1(u * 40, 2), 18], [0, 4, -18], 52, sh * 0.05 * noise1(u * 30, 3)], collapse: col }, { bleed: col > 0.2 && col < 0.6 ? 3 : 1, tear: col > 0.3 && col < 0.45 ? [[60, 90, 8], [200, 230, -10]] : null });
    vignette(ctx, 1);
    if (u >= K.y1998) slam(ctx, '1998', CX, SAFE.y + 330, 300, u, K.y1998, { color: C.red });
    captions(ctx, t);
  }],
  // 18. ...to expand a golf course
  ['K.expand', 82, (ctx, u, t, u3, t3) => {
    const sw = prog(u3, K.expand - 0.6, K.expand + 0.4);
    const ball = prog(u3, K.expand, K.expand + 3);
    const c = camKeys(u3, [[K.expand, [[3.5, 1.4, 11.5], [-0.4, 1.1, 8], 52, 0]], [K.expand + 1.2, [[3.0, 1.6, 11.0], [-1, 2.5, -8], 58, 0]], [82, [[2.0, 3, 13], [0, 5, -60], 58, 0]]], E.inOutSine);
    stage(ctx, 'golf', t3, u3, { cam: c, swing: sw, ball, ghost: 0.85 * E.inOutSine(prog(u3, 79.6, 81.4)) }, { bleed: 1 });
    vignette(ctx, 0.5);
    if (u >= K.golf) tag(ctx, 'NOW: A GOLF COURSE', CX, SAFE.y + 160, 78, u, K.golf, { bg: '#1f6b2a' });
    captions(ctx, t);
  }],
  // 19. 2024: a natural flash in a cloud of hydrogen?
  [82, 91.5, (ctx, u, t, u3, t3) => {
    const p = prog(u3, 82, 91.5);
    const fl = u >= K.flash ? clamp((u - K.flash) / 2.2) : 0;
    const glow = 0.7 + 1.5 * Math.exp(-Math.max(0, u - K.flash - 0.4) * 0.6) * (u > K.flash ? 1 : 0);
    stage(ctx, 'space', t3, u3, { cam: [[lerp(-18, -10, p), lerp(-3, 1, p), lerp(-50, -38, p)], [-14, -1, -140], 58, 0.02], cloud: 1, magnetar: 1, flash: fl, cloudGlow: glow, rings: u > K.flash + 1 ? (u - K.flash - 1) * 0.25 : -1 }, { bleed: fl > 0 && fl < 0.15 ? 3 : 1 });
    vignette(ctx, 0.9);
    if (fl > 0 && fl < 0.3) veil(ctx, 0.6 * (1 - fl / 0.3), '#cfe8ff');
    tag(ctx, '2024', CX, SAFE.y + 170, 110, u, K.y2024);
    vt(ctx, 'PREPRINT · AUGUST 2024', CX, SAFE.y + 255, 54, C.bone, 'center', u, K.y2024 + 0.6, 40);
    if (u > K.flash + 0.6) {
      const mp = P.project(SETS.space.camera, [-30, -6, -120]), cp = P.project(SETS.space.camera, [0, 4, -160]);
      vt(ctx, '← MAGNETAR', mp.x + 40, mp.y + 16, 54, C.bone, 'left');
      vt(ctx, 'HYDROGEN CLOUD', clamp(cp.x, SAFE.x + 230, SAFE.x + SAFE.w - 230), cp.y - 150, 54, C.bone);
    }
    captions(ctx, t);
  }],
  // 20. but nobody can prove it
  [91.5, 94, (ctx, u, t, u3, t3) => {
    stage(ctx, 'space', t3, u3, { cam: [[-10, 1, -38], [-14, -1, -140], 58, 0.02], cloud: 1, magnetar: 0, cloudGlow: lerp(0.6, 0.25, prog(u, 91.5, 94)) }, { bleed: 2, tear: Math.floor(u * 6) % 3 === 0 ? [[150, 170, 6]] : null });
    veil(ctx, 0.35);
    vignette(ctx, 1);
    tag(ctx, 'UNPROVEN', CX, SAFE.y + 200, 120, u, 91.55);
    captions(ctx, t);
  }],
  // 21. so all we have... is this piece of paper (ends on frame 0's framing: the loop)
  [94, 99.01, (ctx, u, t, u3, t3) => {
    fill(ctx, '#0b0a08');
    const p = E.inOutSine(prog(u, 94, 98.6));
    const s = 0.72 * (HOOK.s / 0.72) ** p;
    printout(ctx, { s, rot: lerp(-0.1, HOOK.rot, p), sy: HOOK.sy, px: lerp(CIRC.cx - 60, HOOK.px, p), py: lerp(CIRC.cy + 30, CIRC.cy, p), glow: 0.4 });
    vignette(ctx, 0.9);
    if (u >= 98.4) tag(ctx, 'UNSOLVED SINCE 1977', CX, SAFE.y + 90, 64, u, 98.4, { fam: DISPLAY });
    captions(ctx, t);
  }],
].map(([a, b, fn]) => [typeof a === 'string' ? K[a.slice(2)] : a, typeof b === 'string' ? K[b.slice(2)] : b, fn]);

// ---------------------------------------------------------------- post

function makePost() {
  for (let k = 0; k < 4; k++) {
    const cv = document.createElement('canvas'); cv.width = 384; cv.height = 384;
    const c = cv.getContext('2d'), img = c.createImageData(384, 384), r = M.mulberry32(900 + k);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 110; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    c.putImageData(img, 0, 0); GRAIN.push(cv);
  }
  SCAN = document.createElement('canvas'); SCAN.width = W; SCAN.height = H;
  const sc = SCAN.getContext('2d'); sc.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 4; y < H; y += 5) sc.fillRect(0, y, W, 1);
  VIG = document.createElement('canvas'); VIG.width = W; VIG.height = H;
  const vc = VIG.getContext('2d');
  const g = vc.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.75, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0.8)');
  vc.fillStyle = g; vc.fillRect(0, 0, W, H);
}
function post(ctx, u, t) {
  const fr = Math.floor(t * 24);
  const pat = ctx.createPattern(GRAIN[fr % 4], 'repeat');
  pat.setTransform(new DOMMatrix().translate(Math.floor(hash01(fr, 1) * 384), Math.floor(hash01(fr, 2) * 384)));
  ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.16; ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.restore();
  const r = M.mulberry32(fr * 7 + 3);
  if (r() < 0.15) { ctx.save(); ctx.fillStyle = 'rgba(230,220,200,0.25)'; ctx.fillRect(r() * W, 0, 2, H); ctx.restore(); }
  ctx.drawImage(SCAN, 0, 0);
}

M.film({
  fonts: [`400 100px ${DISPLAY}`, `400 40px ${UI}`],
  hits: HITS,
  samples: 1,
  async init() {
    P.initPS1();
    S.initWorld();
    SETS.ear = S.bigEarSet();
    SETS.room = S.roomSet();
    SETS.desk = S.deskSet();
    SETS.space = S.spaceSet();
    SETS.dish = S.dishSet();
    SETS.golf = S.golfSet();
    buildSheet();
    makePost();
    window.SETS = SETS; window.K = K;
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
