// THE SOMERTON MAN — a YouTube Short (9:16, 59.4 s). Pure function of time: window.seek(t) paints frame t.
// 100 bpm, 99 beats; vo.json (audio/score.py) puts every phrase and word on the grid. The last line
// ("...or what he meant by two words:") runs into frame 0 ("Tamám Shud."): the Short loops.
import * as M from './lib/motion.js';
import * as P from './lib/ps1.js';
import * as S from './sets/world.js';

const { W, H, E, prog, lerp, clamp, springU, layout, text, fill, noise1, hash01 } = M;
const VO = await fetch('vo.json').then((r) => r.json());
const BEAT = 0.6;
const ub = (t) => t / BEAT;
const WORDS = VO.words;
const word = (pid, k) => WORDS.filter((w) => w.p === pid)[k];
const wb = (pid, k) => ub(word(pid, k).t0);
const q4 = (b) => Math.round(b * 4) / 4;

const C = { bone: '#F2EEE4', red: '#D7262B', paper: '#EAE0C8', ink: '#2a2620', pencil: '#3c3a40', sea: '#2f5d78' };
const DISPLAY = 'Anton', SERIF = 'Fell';
const SAFE = M.FORMAT.safe;
const CX = SAFE.x + SAFE.w / 2;

const K = {
  pocket: wb('P2', 7), dead: q4(wb('P2', 9)), label: wb('P4', 6), book: wb('P8', 10), finished: wb('P9', 2),
  car: q4(wb('P10', 6)), phone: wb('P11', 5), this: wb('P11', 8), solved: wb('P12', 4), nurse: wb('P13', 5),
  upbeach: q4(wb('P13', 7)), face: wb('P14', 5), faint: wb('P14', 10), says: q4(wb('P14', 11)), dna: wb('P16', 1),
  hair: wb('P16', 3), one: wb('P16', 10), webb: wb('P17', 0), died: wb('P18', 5), code: wb('P18', 8), meant: wb('P18', 12),
  two: wb('P18', 17),
};

// ---------------------------------------------------------------- hits (sfx.mjs + audio/sfx_el.py)
const HITS = [
  [0, 'Tamám Shud', 'thud', { gain: 0.3 }],
  [3, 'the pocket', 'click', { el: 'unroll', gain: 0.3, elGain: 0.7, align: 'first' }],
  [K.dead, 'the beach', 'whoosh', { len: 0.7, from: 2500, to: 400, gain: 0.08 }],
  [10.5, '1 DECEMBER 1948', 'thud+click', { gain: 0.4 }],
  [K.label, 'labels removed', 'thud', { el: 'stamp', gain: 0.3, elGain: 0.8 }],
  [21.5, 'NO WALLET', 'thud', { gain: 0.45 }],
  [23, 'NO NAME', 'thud', { gain: 0.45 }],
  [24.5, 'cause of death', 'click', { gain: 0.3 }],
  [q4(wb('P7', 5)), 'UNKNOWN stamp', null, { el: 'stamp', gain: 1.0 }],
  [28, 'the scrap unrolls', 'click', { el: 'unroll', gain: 0.3, elGain: 0.8, align: 'first' }],
  [31, 'the last page', 'click', { el: 'pages', gain: 0.3, elGain: 0.6, align: 'first' }],
  [33, 'the scrap fits', 'tick+click', { gain: 0.4 }],
  [K.finished, 'IT IS FINISHED', 'thud', { gain: 0.4 }],
  [39, 'Jetty Road, night', 'whoosh', { len: 0.8, from: 300, to: 1800, gain: 0.08 }],
  [K.car, 'the car', 'thud', { el: 'cardoor', gain: 0.3, elGain: 0.6, align: 'first' }],
  [45.5, 'the back cover', 'click', { el: 'pages', gain: 0.3, elGain: 0.4, align: 'first' }],
  [K.this, 'the code', 'sub', { el: 'pencil', gain: 0.35, elGain: 0.7, align: 'first', len: 1.0 }],
  [K.solved, 'UNSOLVED', null, { el: 'stamp', gain: 1.0 }],
  [57.5, 'the phone', 'click', { el: 'rotary', gain: 0.3, elGain: 0.6, align: 'first' }],
  [K.upbeach, 'her street', 'whoosh', { len: 0.6, from: 2000, to: 500, gain: 0.07 }],
  [63, 'the bust', 'thud', { gain: 0.25 }],
  [K.face, 'the flashbulb', null, { el: 'flash', gain: 0.8 }],
  [K.faint, 'ready to faint', null, { el: 'heart', gain: 0.8 }],
  [72.5, 'seventy years', 'whoosh', { len: 1.0, from: 400, to: 3000, gain: 0.08 }],
  [77, 'the hair', 'click', { gain: 0.3 }],
  [80.5, 'the lab', 'blip', { el: 'lab', gain: 0.25, elGain: 0.5, align: 'first', pitch: 'A6' }],
  [K.webb, 'CARL WEBB', 'impact', { gain: 0.45 }],
  [K.died, 'how he died ?', 'tick', { gain: 0.3 }],
  [K.code, 'what the code says ?', 'tick', { gain: 0.3 }],
  [K.two, 'two words', 'thud', { gain: 0.3 }],
];

// ---------------------------------------------------------------- helpers
const SETS = {};
let GRAIN = [], SCAN = null, VIG = null, TWEED = null, LINEN = null;

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
const fnt = (size, fam = DISPLAY, italic = false) => `${italic ? 'italic ' : ''}400 ${Math.round(size)}px ${fam}`;

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
function slam(ctx, str, x, y, size, u, u0, { color = C.bone, stroke = '#000', sw = 0.06, over = 1.4, fam = DISPLAY, italic = false } = {}) {
  if (u < u0) return;
  const a = u - u0;
  const k = springU(u, u0, { stiffness: 900, damping: 30 });
  ctx.save();
  ctx.translate(x + 10 * Math.exp(-a * 8) * noise1(u * 50, 2), y);
  ctx.scale(lerp(over, 1, k), lerp(over, 1, k));
  ctx.font = fnt(size, fam, italic); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  if (stroke) { ctx.lineWidth = size * sw * 2; ctx.strokeStyle = stroke; ctx.strokeText(str, 0, 0); }
  const d = 14 * Math.exp(-a * 5);
  if (d > 0.5) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,40,60,0.6)'; ctx.fillText(str, -d, 0); ctx.fillStyle = 'rgba(40,200,255,0.5)'; ctx.fillText(str, d, 0); ctx.globalCompositeOperation = 'source-over'; }
  ctx.fillStyle = color; ctx.fillText(str, 0, 0);
  ctx.restore();
}
function serif(ctx, str, x, y, size, color, align = 'center', u = null, u0 = null, rate = 30, italic = false) {
  const s = u != null ? str.slice(0, Math.max(0, Math.floor((u - u0) * rate))) : str;
  if (!s) return;
  ctx.save(); ctx.font = fnt(size, SERIF, italic); ctx.textAlign = align; ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.14; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(s, x, y);
  ctx.fillStyle = color; ctx.fillText(s, x, y); ctx.restore();
}

// ---------------------------------------------------------------- captions (word by word)
const CHUNKS = (() => {
  const out = [];
  for (const p of VO.phrases) {
    const ws = WORDS.filter((w) => w.p === p.id);
    let cur = [];
    const flush = () => { if (cur.length) out.push({ p: p.id, words: cur }); cur = []; };
    ws.forEach((w) => { cur.push(w); const chars = cur.map((x) => x.w).join(' ').length; if (cur.length >= 3 || chars >= 13 || /[.,?:]$/.test(w.w) || w.w.endsWith('...')) flush(); });
    flush();
  }
  out.forEach((c, i) => { c.t0 = i === 0 ? 0 : c.words[0].t0 - 0.04; const next = out[i + 1]; c.t1 = Math.min(c.words[c.words.length - 1].t1 + 0.35, next ? next.words[0].t0 - 0.04 : 99); });
  return out;
})();
const clean = (w) => w.toUpperCase().replace(/\.\.\.$/, '...').replace(/[,.:]$/, '');
function captions(ctx, t, y = 1290) {
  const c = CHUNKS.find((k) => t >= k.t0 && t < k.t1);
  if (!c) return;
  const size = 104, f = fnt(size);
  const toks = c.words.map((w) => clean(w.w));
  const widths = toks.map((s) => layout(ctx, s, f, 0).width);
  const gap = size * 0.24;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (toks.length - 1);
  const s = Math.min(1, (SAFE.w * 0.98) / total);
  const k = springU(ub(t), ub(c.t0), { stiffness: 620, damping: 24 });
  const pop = lerp(1.18, 1, k);
  ctx.save(); ctx.translate(CX, y); ctx.scale(s * pop, s * pop);
  let x = -total / 2;
  ctx.font = f; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
  toks.forEach((tok, i) => {
    const w = c.words[i];
    const active = t >= w.t0 - 0.03 && (i === toks.length - 1 || t < c.words[i + 1].t0 - 0.03);
    const said = t >= w.t0 - 0.03;
    ctx.save(); ctx.translate(x, 0);
    if (active) { const kk = springU(ub(t), ub(w.t0 - 0.03), { stiffness: 900, damping: 30 }); ctx.translate(widths[i] / 2, -size * 0.35); ctx.scale(lerp(1.22, 1.08, kk), lerp(1.22, 1.08, kk)); ctx.translate(-widths[i] / 2, size * 0.35); }
    ctx.lineWidth = size * 0.17; ctx.strokeStyle = '#000'; ctx.strokeText(tok, 0, 0);
    ctx.fillStyle = active ? C.red : said ? '#ffffff' : 'rgba(255,255,255,0.55)';
    ctx.fillText(tok, 0, 0);
    ctx.restore();
    x += widths[i] + gap;
  });
  ctx.restore();
}

// ---------------------------------------------------------------- paper artifacts

function paperRect(ctx, x, y, w, h, { col = C.paper, seed = 1, torn = 0, shadow = true } = {}) {
  ctx.save();
  if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18; }
  ctx.beginPath();
  const r = M.mulberry32(seed), n = 40;
  ctx.moveTo(x, y);
  for (let i = 0; i <= n; i++) ctx.lineTo(x + (w * i) / n, y + (torn ? (r() - 0.5) * torn : 0));
  for (let i = 0; i <= n; i++) ctx.lineTo(x + w + (torn ? (r() - 0.5) * torn : 0), y + (h * i) / n);
  for (let i = 0; i <= n; i++) ctx.lineTo(x + w - (w * i) / n, y + h + (torn ? (r() - 0.5) * torn : 0));
  for (let i = 0; i <= n; i++) ctx.lineTo(x + (torn ? (r() - 0.5) * torn : 0), y + h - (h * i) / n);
  ctx.closePath();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, col); g.addColorStop(1, M.mix(col, '#a08a60', 0.35));
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  ctx.save(); ctx.clip(); ctx.restore();
}
// the scrap: "Tamám Shud", torn on all sides; unroll 0..1 opens it from a roll
function scrap(ctx, cx, cy, s, rot, unroll = 1, glow = 0) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(s, s);
  const w = 800, h = 236, vis = w * lerp(0.25, 1, E.inOutCubic(unroll));
  ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, -h, vis, h * 2); ctx.clip();
  paperRect(ctx, -w / 2, -h / 2, w, h, { seed: 7, torn: 22 });
  ctx.fillStyle = 'rgba(120,90,40,0.12)'; for (let i = 0; i < 40; i++) ctx.fillRect(-w / 2 + hash01(i, 3) * w, -h / 2 + hash01(i, 4) * h, 3 + hash01(i, 5) * 20, 2);
  ctx.font = fnt(128, SERIF); ctx.textAlign = 'center'; ctx.fillStyle = '#1e1a16';
  if (glow) { ctx.shadowColor = `rgba(215,38,43,${0.7 * glow})`; ctx.shadowBlur = 30 * glow; }
  ctx.fillText('Tamám Shud', 0, 44);
  ctx.restore();
  if (unroll < 1) {   // the rolled part
    const rx = -w / 2 + vis;
    const g = ctx.createLinearGradient(rx - 30, 0, rx + 30, 0);
    g.addColorStop(0, '#cfc4a6'); g.addColorStop(0.5, '#f6eedb'); g.addColorStop(1, '#a8987a');
    ctx.fillStyle = g; ctx.fillRect(rx - 26, -h / 2 - 6, 52, h + 12);
  }
  ctx.restore();
}
// tweed for the trousers, linen for the lining: drawn once
function makeCloth() {
  TWEED = document.createElement('canvas'); TWEED.width = 512; TWEED.height = 512;
  let c = TWEED.getContext('2d'); c.fillStyle = '#4e4438'; c.fillRect(0, 0, 512, 512);
  const r = M.mulberry32(3);
  for (let i = 0; i < 9000; i++) { c.fillStyle = r() < 0.5 ? 'rgba(30,24,18,0.35)' : 'rgba(140,120,96,0.25)'; const x = r() * 512, y = r() * 512; c.fillRect(x, y, 6 + r() * 10, 2); }
  for (let y = 0; y < 512; y += 6) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, y, 512, 1); }
  LINEN = document.createElement('canvas'); LINEN.width = 512; LINEN.height = 512;
  c = LINEN.getContext('2d'); c.fillStyle = '#7a6a58'; c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6000; i++) { c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,240,220,0.1)'; c.fillRect(r() * 512, r() * 512, 1 + r() * 6, 1); }
}
function cloth(ctx, img, x, y, w, h) { ctx.save(); ctx.fillStyle = ctx.createPattern(img, 'repeat'); ctx.fillRect(x, y, w, h); ctx.restore(); }
function stitches(ctx, x, y, w, h, col = '#d8cfbd', len = 10) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([len, len * 0.8]);
  ctx.strokeRect(x, y, w, h); ctx.restore();
}
// a stamp: red ink, rough edges, slammed
function inkStamp(ctx, str, x, y, size, u, u0, rot = -0.12) {
  if (u < u0) return;
  const k = springU(u, u0, { stiffness: 1100, damping: 36 });
  const s = lerp(1.6, 1, k);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.globalAlpha = clamp(k * 3) * 0.92;
  const f = fnt(size); ctx.font = f; ctx.textAlign = 'center';
  const w = ctx.measureText(str).width + size * 0.6, h = size * 1.15;
  ctx.strokeStyle = C.red; ctx.lineWidth = size * 0.08; ctx.strokeRect(-w / 2, -h * 0.82, w, h);
  ctx.fillStyle = C.red; ctx.fillText(str, 0, 0);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 60; i++) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect((hash01(i, 2) - 0.5) * w, -h * 0.8 + hash01(i, 3) * h, 3 + hash01(i, 4) * 8, 2 + hash01(i, 5) * 3); }
  ctx.restore();
}

// ---------------------------------------------------------------- the code, in pencil, stroke by stroke
const GL = {
  A: [[[0, 1], [0.5, 0], [1, 1]], [[0.22, 0.62], [0.78, 0.62]]],
  B: [[[0, 1], [0, 0]], [[0, 0], [0.6, 0], [0.85, 0.12], [0.85, 0.36], [0.6, 0.48], [0, 0.48]], [[0.6, 0.48], [0.92, 0.62], [0.92, 0.86], [0.66, 1], [0, 1]]],
  C: [Array.from({ length: 13 }, (_, i) => { const a = -0.25 * Math.PI - (i / 12) * 1.5 * Math.PI; return [0.55 + 0.45 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]; })],
  D: [[[0, 1], [0, 0]], [[0, 0], [0.5, 0], [0.9, 0.25], [0.95, 0.6], [0.6, 0.95], [0, 1]]],
  E: [[[0.9, 0], [0, 0], [0, 1], [0.9, 1]], [[0, 0.5], [0.7, 0.5]]],
  G: [Array.from({ length: 13 }, (_, i) => { const a = -0.25 * Math.PI - (i / 12) * 1.55 * Math.PI; return [0.55 + 0.45 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]; }).concat([[0.98, 0.55], [0.6, 0.55]])],
  I: [[[0.5, 0], [0.5, 1]], [[0.2, 0], [0.8, 0]], [[0.2, 1], [0.8, 1]]],
  L: [[[0, 0], [0, 1], [0.85, 1]]],
  M: [[[0, 1], [0.05, 0], [0.5, 0.62], [0.95, 0], [1, 1]]],
  N: [[[0, 1], [0, 0], [1, 1], [1, 0]]],
  O: [Array.from({ length: 17 }, (_, i) => { const a = -Math.PI / 2 - (i / 16) * 2.05 * Math.PI; return [0.5 + 0.48 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]; })],
  P: [[[0, 1], [0, 0], [0.65, 0], [0.9, 0.14], [0.9, 0.36], [0.65, 0.5], [0, 0.5]]],
  Q: [Array.from({ length: 17 }, (_, i) => { const a = -Math.PI / 2 - (i / 16) * 2.05 * Math.PI; return [0.5 + 0.48 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]; }), [[0.6, 0.7], [1.0, 1.08]]],
  R: [[[0, 1], [0, 0], [0.65, 0], [0.9, 0.14], [0.9, 0.36], [0.65, 0.5], [0, 0.5]], [[0.4, 0.5], [0.95, 1]]],
  S: [[[0.9, 0.12], [0.6, 0], [0.2, 0.04], [0.05, 0.24], [0.25, 0.46], [0.75, 0.56], [0.95, 0.76], [0.8, 0.96], [0.4, 1], [0.05, 0.88]]],
  T: [[[0, 0], [1, 0]], [[0.5, 0], [0.5, 1]]],
  W: [[[0, 0], [0.22, 1], [0.5, 0.35], [0.78, 1], [1, 0]]],
  X: [[[0, 0], [1, 1]], [[1, 0], [0, 1]]],
};
// five lines, as transcribed (the second struck out; an "x" over the last O)
const CODE = ['W RGOABABD', 'M LIAOI', 'WTBIMPANETP', 'MLIABO AIAQC', 'ITTMTSAMSTGAB'];
const CODE_CHARS = CODE.reduce((a, l) => a + l.replace(/ /g, '').length, 0);
function pencilGlyph(ctx, ch, x, y, s, p, seed) {
  const strokes = GL[ch];
  if (!strokes) return;
  const tot = strokes.reduce((a, st) => a + st.length - 1, 0);
  let left = p * tot;
  ctx.strokeStyle = 'rgba(48,46,52,0.9)'; ctx.lineWidth = s * 0.1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  strokes.forEach((st, si) => {
    if (left <= 0) return;
    const segs = Math.min(st.length - 1, left);
    ctx.beginPath();
    for (let i = 0; i <= Math.ceil(segs); i++) {
      const j = Math.min(i, st.length - 1);
      let [px, py] = st[j];
      if (i > segs) { const f = segs - Math.floor(segs); const [qx, qy] = st[Math.floor(segs)]; px = lerp(qx, px, f); py = lerp(qy, py, f); }
      const jx = (hash01(seed * 31 + si * 7 + j, 3) - 0.5) * 0.12, jy = (hash01(seed * 17 + si * 5 + j, 4) - 0.5) * 0.1;
      const sl = 0.12 * (1 - py);
      const X = x + (px + jx + sl) * s * 0.62, Y = y + (py + jy) * s + Math.sin(seed * 1.7) * s * 0.04;
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    left -= st.length - 1;
  });
}
// draw the code block; p = 0..1 of all characters written
function codeBlock(ctx, x0, y0, size, p, { strike = 1, xmark = 1 } = {}) {
  let n = 0;
  const per = 1 / CODE_CHARS;
  CODE.forEach((line, li) => {
    const y = y0 + li * size * 1.55;
    let x = x0;
    [...line].forEach((ch, ci) => {
      if (ch === ' ') { x += size * 0.38; return; }
      const q = clamp((p - n * per) / per);
      if (q > 0) pencilGlyph(ctx, ch, x, y, size, q, li * 40 + ci);
      if (li === 3 && ci === 5 && xmark && p > (n + 1) * per) pencilGlyph(ctx, 'X', x + size * 0.18, y - size * 0.62, size * 0.38, clamp((p - (n + 1) * per) / per), 999);
      x += size * 0.78;
      n++;
    });
    if (li === 1 && strike && p > (n * per)) {
      const w = x - x0, k = clamp((p - n * per) / (per * 2));
      ctx.strokeStyle = 'rgba(55,52,58,0.88)'; ctx.lineWidth = size * 0.07;
      ctx.beginPath(); ctx.moveTo(x0 - 10, y + size * 0.52); ctx.lineTo(x0 - 10 + (w + 20) * k, y + size * 0.48); ctx.stroke();
    }
  });
}

// ---------------------------------------------------------------- shots
const HOOK = { s: 1.06, rot: -0.05, y: H * 0.43 };
const SHOTS = [
  // 1. HOOK: Tamám Shud
  [0, 3, (ctx, u, t) => {
    fill(ctx, '#0a0908');
    const s = HOOK.s * (1 + 0.04 * prog(u, 0, 3));
    scrap(ctx, CX, HOOK.y, s, HOOK.rot, 1, 0.5);
    vignette(ctx, 0.9);
    tag(ctx, 'UNSOLVED · 1948', CX, SAFE.y + 110, 70, u, 0);
    captions(ctx, t);
  }],
  // 2a. a secret pocket: the fob pocket in the waistband, the rolled scrap drawn out
  [3, 'K.dead', (ctx, u, t) => {
    const z = 1 + 0.55 * E.inOutSine(prog(u, 3, K.dead)), jig = 6 * Math.exp(-Math.max(0, u - K.pocket) * 3) * (u > K.pocket ? 1 : 0);
    ctx.save(); ctx.translate(525 + jig * noise1(u * 40, 2), 760); ctx.scale(z, z); ctx.translate(-525, -760);
    cloth(ctx, TWEED, -200, -200, W + 400, H + 400);
    // the waistband across the top, belt loops, a button; the fob pocket sewn just under it
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 380, W, 170);
    cloth(ctx, TWEED, 0, 370, W, 160);
    stitches(ctx, -10, 384, W + 20, 132, '#c8bca4', 9);
    for (const x of [150, 820]) { cloth(ctx, TWEED, x, 330, 70, 230); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4; ctx.strokeRect(x, 330, 70, 230); }
    ctx.fillStyle = '#2a221a'; ctx.beginPath(); ctx.arc(520, 450, 34, 0, M.TAU); ctx.fill();
    ctx.fillStyle = '#4a3e30'; for (const [dx, dy] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) { ctx.beginPath(); ctx.arc(520 + dx, 450 + dy, 5, 0, M.TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 1500); ctx.quadraticCurveTo(300, 1120, 420, 560); ctx.stroke();
    const fx = 400, fy = 640, fw = 250, fh = 230;
    cloth(ctx, TWEED, fx, fy, fw, fh);
    stitches(ctx, fx + 10, fy + 14, fw - 20, fh - 24, '#e8dcc0', 8);
    ctx.fillStyle = '#16120e'; ctx.fillRect(fx + 20, fy - 8, fw - 40, 18);
    const pull = E.inOutCubic(prog(u, K.pocket - 1.2, K.pocket + 1.0));
    ctx.save(); ctx.translate(fx + fw / 2, fy + 40 - pull * 330); ctx.rotate(-0.15 + pull * 0.2);
    const g = ctx.createLinearGradient(-22, 0, 22, 0); g.addColorStop(0, '#bcae8c'); g.addColorStop(0.5, '#f4ecd8'); g.addColorStop(1, '#9a8a6a');
    ctx.fillStyle = g; ctx.fillRect(-22, -110, 44, 220);
    ctx.restore();
    // tweezers
    ctx.save(); ctx.translate(fx + fw / 2 + 4, fy - 60 - pull * 330); ctx.rotate(0.05);
    ctx.fillStyle = '#b8bcc0'; ctx.fillRect(-14, -420, 9, 400); ctx.fillRect(6, -420, 9, 400);
    ctx.restore();
    ctx.restore();
    veil(ctx, 0.15);
    vignette(ctx, 1);
    serif(ctx, 'a fob pocket, sewn inside the trousers', CX, 1000, 50, C.bone, 'center', u, K.pocket - 0.2, 40, true);
    tag(ctx, 'A SECRET POCKET', CX, SAFE.y + 150, 76, u, K.pocket);
    captions(ctx, t);
  }],
  // 2b. on a dead man: Somerton beach, dawn
  ['K.dead', 10.5, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[K.dead, [[7.4, 1.6, 1.4], [11.6, 0.6, -4], 46, 0.02]], [10.5, [[8.4, 1.3, -0.6], [11.6, 0.6, -4], 42, 0.02]]], E.inOutSine);
    stage(ctx, 'beach', t3, u3, { cam: c, man: 1, day: 0.55 });
    vignette(ctx, 0.9);
    captions(ctx, t);
  }],
  // 3. December 1948
  [10.5, 13.5, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[10.5, [[-6, 6, 24], [14, 3, -6], 55, 0]], [13.5, [[-4, 4.5, 18], [14, 2.5, -6], 52, 0]]], E.linear);
    stage(ctx, 'beach', t3, u3, { cam: c, man: 1, day: 0.5 });
    vignette(ctx, 0.9);
    tag(ctx, '1 DECEMBER 1948', CX, SAFE.y + 140, 86, u, 10.55);
    serif(ctx, 'Somerton Park beach · 6:30 am', CX, SAFE.y + 235, 58, C.bone, 'center', u, 11.0, 40);
    captions(ctx, t);
  }],
  // 4a. found on an Australian beach: walking down to him, police arriving
  [13.5, 'K.label', (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[13.5, [[0, 1.7, 10], [11.5, 0.9, -3.5], 50, 0]], [K.label, [[6.5, 1.5, 2.5], [11.6, 0.7, -4], 46, 0]]], E.inOutSine);
    stage(ctx, 'beach', t3, u3, { cam: c, man: 1, cops: 1, day: 0.6 });
    vignette(ctx, 0.9);
    serif(ctx, 'Adelaide, South Australia', CX, SAFE.y + 150, 60, C.bone, 'center', u, 14, 40);
    captions(ctx, t);
  }],
  // 4b. every label removed
  ['K.label', 21.5, (ctx, u, t) => {
    cloth(ctx, LINEN, 0, 0, W, H);
    const items = [['JACKET', 160, 360], ['PULLOVER', 160, 760], ['TROUSERS', 160, 1160]];
    items.forEach(([name, x, y], i) => {
      const k = E.outBack(clamp((u - K.label - i * 0.6) / 0.4), 1.6);
      if (k <= 0) return;
      ctx.save(); ctx.translate(x + 360, y + 110); ctx.scale(k, k); ctx.translate(-(x + 360), -(y + 110));
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 8, y + 12, 720, 220);
      cloth(ctx, TWEED, x, y, 720, 220);
      // the ghost of the label: stitch holes and a paler patch
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 260, y + 50, 200, 110);
      stitches(ctx, x + 260, y + 50, 200, 110, 'rgba(240,230,210,0.8)', 6);
      for (let j = 0; j < 7; j++) { ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 270 + j * 28, y + 160); ctx.lineTo(x + 266 + j * 28 + 6 * noise1(j, 2), y + 186); ctx.stroke(); }
      ctx.restore();
      serif(ctx, name, x + 60, y + 130, 52, C.bone, 'left');
    });
    vignette(ctx, 0.9);
    inkStamp(ctx, 'LABELS REMOVED', CX, 1020, 96, u, K.label + 1.6, -0.1);
    captions(ctx, t, 1480);
  }],
  // 5. no wallet, no name: the evidence table, top down
  [21.5, 24.5, (ctx, u, t, u3, t3) => {
    stage(ctx, 'evidence', t3, u3, { cam: [[0.05, 2.0 - 0.3 * prog(u3, 21.5, 24.5), 0.3], [0, 0, 0], 45, 0.05], shown: (u - 21.4) * 3.5 });
    vignette(ctx, 0.9);
    const cam = SETS.evidence.camera;
    SETS.evidence.items.forEach((it, i) => {
      if (u - 21.4 < i / 3.5 + 0.2) return;
      const p = P.project(cam, [it.position.x, 0.05, it.position.z]);
      serif(ctx, it.userData.label, p.x, p.y + 70, 40, C.bone);
    });
    tag(ctx, 'NO WALLET', CX, SAFE.y + 140, 90, u, 21.5);
    if (u >= 23) tag(ctx, 'NO NAME', CX, SAFE.y + 260, 90, u, 23, { rot: 0.03 });
    captions(ctx, t);
  }],
  // 6. no one can say what killed him
  [24.5, 28, (ctx, u, t) => {
    fill(ctx, '#15130f');
    paperRect(ctx, 110, 380, 860, 900, { seed: 11, torn: 0 });
    ctx.save(); ctx.fillStyle = C.ink; ctx.font = fnt(46, SERIF); ctx.textAlign = 'left';
    ctx.fillText('CORONER’S INQUEST', 170, 470);
    ctx.font = fnt(40, SERIF);
    ['Name of deceased:', 'Address:', 'Cause of death:'].forEach((l, i) => { ctx.fillText(l, 170, 580 + i * 170); ctx.fillStyle = 'rgba(42,38,32,0.5)'; ctx.fillRect(470, 590 + i * 170, 430, 2); ctx.fillStyle = C.ink; });
    ctx.restore();
    inkStamp(ctx, 'UNKNOWN', 690, 560, 70, u, 24.6, -0.08);
    inkStamp(ctx, 'UNKNOWN', 690, 730, 70, u, 25.1, 0.05);
    inkStamp(ctx, 'UNKNOWN', 640, 920, 120, u, q4(wb('P7', 5)), -0.14);
    vignette(ctx, 0.9);
    captions(ctx, t);
  }],
  // 7a. the scrap unrolls
  [28, 31, (ctx, u, t) => {
    fill(ctx, '#0a0908');
    scrap(ctx, CX, H * 0.42, 1.0, -0.04, prog(u, 28, 29.6), 0.2);
    vignette(ctx, 0.9);
    captions(ctx, t);
  }],
  // 7b. torn from the last page of a book of Persian poems
  [31, 34.5, (ctx, u, t) => {
    fill(ctx, '#0e0c0a');
    const px = 140, py = 260, pw = 800, ph = 1120;
    paperRect(ctx, px, py, pw, ph, { seed: 21 });
    ctx.save(); ctx.fillStyle = 'rgba(40,34,28,0.55)';
    for (let i = 0; i < 12; i++) { if (i % 5 === 4) continue; const lw = 520 - (i % 5) * 30 + hash01(i, 2) * 60; ctx.fillRect(px + 140 + (i % 5 === 3 ? 60 : 0), py + 150 + i * 52, lw, 12); }
    ctx.fillStyle = '#6a5a40'; for (const dx of [-40, 0, 40]) { ctx.save(); ctx.translate(px + pw / 2 + dx, py + 800); ctx.rotate(Math.PI / 4); ctx.fillRect(-8, -8, 16, 16); ctx.restore(); }
    ctx.restore();
    // the torn gap at the foot of the page, and the scrap sliding back into it
    const gx = px + pw / 2, gy = py + 960;
    ctx.save(); ctx.fillStyle = '#0e0c0a'; ctx.beginPath();
    const r = M.mulberry32(7); ctx.moveTo(gx - 300, gy - 70);
    for (let i = 0; i <= 20; i++) ctx.lineTo(gx - 300 + i * 30, gy - 70 + (r() - 0.5) * 18);
    for (let i = 0; i <= 8; i++) ctx.lineTo(gx + 300 + (r() - 0.5) * 18, gy - 70 + i * 17.5);
    for (let i = 0; i <= 20; i++) ctx.lineTo(gx + 300 - i * 30, gy + 70 + (r() - 0.5) * 18);
    ctx.closePath(); ctx.fill(); ctx.restore();
    const fit = E.inOutCubic(prog(u, 32, 33));
    scrap(ctx, gx + lerp(330, 0, fit), gy + lerp(300, 0, fit), 0.78, lerp(0.25, 0, fit), 1, fit > 0.98 ? 0.6 : 0);
    vignette(ctx, 0.9);
    tag(ctx, 'THE RUBÁIYÁT OF OMAR KHAYYÁM', CX, SAFE.y + 110, 58, u, K.book);
    serif(ctx, 'the last page', CX, SAFE.y + 190, 52, C.bone, 'center', u, K.book + 0.5, 40, true);
    captions(ctx, t, 1500);
  }],
  // 8. it means: it is finished (the book in lamplight)
  [34.5, 39, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[34.5, [[0.3, 1.15, 0.95], [0.3, 0.05, 0], 45, 0]], [39, [[0.2, 0.75, 0.6], [0.3, 0.05, 0], 42, 0.05]]], E.inOutSine);
    stage(ctx, 'book', t3, u3, { cam: c, open: 1 - E.inOutCubic(prog(u3, 35, 37.5)) });
    veil(ctx, 0.25);
    vignette(ctx, 1);
    slam(ctx, 'Tamám Shud', CX, 560, 140, u, 34.6, { fam: SERIF, color: C.bone, sw: 0.05, over: 1.15 });
    if (u >= K.finished) slam(ctx, '= IT IS FINISHED', CX, 720, 104, u, K.finished, { color: C.red });
    captions(ctx, t);
  }],
  // 9. found in the back of his car: Jetty Road, Glenelg, at night
  [39, 45.5, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[39, [[1.5, 2.0, 10], [5.2, 1.0, 1.0], 46, 0]], [K.car, [[3.4, 2.6, 4.8], [5.2, 1.0, 0.8], 46, 0]], [45.5, [[5.0, 2.7, 2.4], [5.3, 1.1, 0.6], 44, 0.03]]], E.inOutSine);
    stage(ctx, 'car', t3, u3, { cam: c, torch: prog(u3, K.car, K.car + 1) });
    vignette(ctx, 0.9);
    serif(ctx, 'Jetty Road, Glenelg', CX, SAFE.y + 150, 60, C.bone, 'center', u, 39.5, 40);
    if (u >= K.car) tag(ctx, 'IN THE BACK OF HIS CAR', CX, SAFE.y + 260, 66, u, K.car);
    captions(ctx, t);
  }],
  // 10-11. inside the back cover: a phone number... and this. It has never been solved.
  [45.5, 57.5, (ctx, u, t) => {
    fill(ctx, '#0e0c0a');
    const px = 70, py = 220, pw = 940, ph = 1190;
    const zoom = 1 + 0.05 * prog(u, 45.5, 57.5), swing = E.outCubic(prog(u, 45.5, 46.6));
    ctx.save(); ctx.translate(CX, py + ph / 2); ctx.scale(zoom * lerp(0.05, 1, swing), zoom); ctx.rotate(lerp(0.2, 0, swing)); ctx.translate(-CX, -(py + ph / 2));
    paperRect(ctx, px, py, pw, ph, { seed: 31, col: '#e6dcc4' });
    // the phone number line: faint, blurred out
    serif(ctx, 'inside the back cover', px + 90, py + 90, 44, '#5a4a38', 'left', u, 46.2, 30, true);
    if (u >= K.phone - 1.2) {
      const k = clamp((u - K.phone + 1.2) / 0.8);
      // the number itself is not shown: a graphite smudge where it was written
      ctx.save(); ctx.globalAlpha = 0.55 * k;
      const g = ctx.createLinearGradient(px + 90, 0, px + 90 + 420 * k, 0); g.addColorStop(0, 'rgba(60,58,64,0.9)'); g.addColorStop(1, 'rgba(60,58,64,0.2)');
      ctx.fillStyle = g; M.rrect(ctx, px + 90, py + 130, 420 * k, 60, 30); ctx.fill();
      ctx.restore();
      serif(ctx, 'a telephone number', px + 560, py + 175, 46, '#5a4a38', 'left', null, null, 30, true);
    }
    const wp = clamp((u - K.this + 0.1) / 3.6);
    codeBlock(ctx, px + 70, py + 360, 76, wp);
    ctx.restore();
    vignette(ctx, 0.8);
    if (u >= K.solved) inkStamp(ctx, 'NEVER SOLVED', CX, 1250, 104, u, K.solved, -0.08);
    if (u >= K.solved + 0.7) tag(ctx, 'CAN YOU CRACK IT?', CX, SAFE.y + 90, 74, u, K.solved + 0.7, { rot: 0.02 });
    captions(ctx, t, 1480);
  }],
  // 12a. the number leads to a nurse who lives just up the beach: the map
  [57.5, 'K.upbeach', (ctx, u, t) => {
    fill(ctx, '#e4dac2');
    // sea to the west, the shoreline, two places 400 m apart
    const sx = 360;
    ctx.save(); ctx.fillStyle = '#8fb0be'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sx, 0);
    for (let y = 0; y <= H; y += 40) ctx.lineTo(sx + 18 * Math.sin(y * 0.01), y);
    ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2a2620'; ctx.lineWidth = 4; ctx.beginPath();
    for (let y = 0; y <= H; y += 40) { const x = sx + 18 * Math.sin(y * 0.01); if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.restore();
    serif(ctx, 'Gulf St Vincent', 180, 1560, 46, '#24485a', 'center', null, null, 30, true);
    serif(ctx, 'GLENELG', 740, 300, 54, '#2a2620'); serif(ctx, 'SOMERTON PARK', 720, 1130, 54, '#2a2620');
    const by = 980, ny = 430;
    const k = E.inOutCubic(prog(u, 58, 60));
    ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = 6; ctx.setLineDash([18, 14]);
    ctx.beginPath(); ctx.moveTo(sx + 70, by); ctx.lineTo(sx + 70 + 160 * k, by - (by - ny) * k); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(sx + 45, by - 25); ctx.lineTo(sx + 95, by + 25); ctx.moveTo(sx + 95, by - 25); ctx.lineTo(sx + 45, by + 25); ctx.stroke(); ctx.restore();
    serif(ctx, 'where he was found', sx + 130, by + 16, 46, '#2a2620', 'left');
    if (k > 0.95) {
      ctx.fillStyle = '#2a2620'; ctx.beginPath(); ctx.moveTo(sx + 230, ny - 40); ctx.lineTo(sx + 270, ny - 80); ctx.lineTo(sx + 310, ny - 40); ctx.closePath(); ctx.fill(); ctx.fillRect(sx + 240, ny - 40, 60, 46);
      serif(ctx, 'the nurse’s house', sx + 330, ny - 8, 46, '#2a2620', 'left');
    }
    tag(ctx, '400 METRES', sx + 260, (by + ny) / 2, 66, u, 59.6, { rot: -0.04 });
    vignette(ctx, 0.5);
    captions(ctx, t);
  }],
  // 12b. her street at night
  ['K.upbeach', 63, (ctx, u, t, u3, t3) => {
    const c = camKeys(u3, [[K.upbeach, [[5, 1.6, 16], [0, 1.8, -2], 48, 0]], [63, [[3, 1.6, 11], [0, 1.9, -2], 46, 0]]], E.inOutSine);
    stage(ctx, 'house', t3, u3, { cam: c });
    vignette(ctx, 0.9);
    serif(ctx, 'Moseley Street, Glenelg', CX, SAFE.y + 150, 60, C.bone, 'center', u, K.upbeach + 0.3, 40);
    captions(ctx, t);
  }],
  // 13. shown a cast of his face... she looks ready to faint
  [63, 'K.says', (ctx, u, t, u3, t3) => {
    const p = prog(u3, 63, K.says);
    const fl = u >= K.face ? Math.exp(-(u - K.face) * 4) : 0;
    stage(ctx, 'bust', t3, u3, { cam: [[lerp(0.55, 0.2, p), lerp(1.8, 1.74, p), lerp(1.9, 1.0, E.inOutSine(p))], [0, 1.72, 0], 38, 0.02], turn: lerp(-0.25, -0.05, p), flash: fl * 1.5 });
    if (fl > 0.05) veil(ctx, fl * 0.7, '#ffffff');
    vignette(ctx, 1);
    tag(ctx, 'THE PLASTER CAST', CX, SAFE.y + 140, 72, u, 63.3);
    if (u >= K.faint) { const hb = Math.exp(-((u - K.faint) % 0.75) * 6); veil(ctx, 0.25 * hb, '#3a0000'); }
    captions(ctx, t);
  }],
  // 13b. ...and says she doesn't know him
  ['K.says', 72.5, (ctx, u, t, u3, t3) => {
    stage(ctx, 'house', t3, u3, { cam: [[2.2, 1.7, lerp(9, 7.5, prog(u3, K.says, 72.5))], [2.2, 1.7, -0.5], 40, 0] });
    vignette(ctx, 1);
    captions(ctx, t);
  }],
  // 14. for over seventy years, he has no name
  [72.5, 77, (ctx, u, t, u3, t3) => {
    const p = prog(u3, 72.5, 77);
    const cyc = (p * p * 4) % 1, day = 0.5 + 0.5 * Math.cos(cyc * Math.PI * 2 + Math.PI);
    const mixc = (a, b, k) => a.map((v, i) => Math.round(lerp(v, b[i], k)));
    const css = (a) => `rgb(${a.join(',')})`;
    const top = mixc([10, 14, 30], [90, 140, 210], day), mid = mixc([40, 40, 70], [200, 200, 220], day), hor = mixc([90, 70, 80], [240, 230, 210], day);
    stage(ctx, 'beach', t3, u3, { cam: [[-2, 2.2, 16 - 4 * p], [12, 1, -4], 50, 0], man: 0, day, sky: [css(top), css(mid), css(hor)], fog: [lerp(0.3, 0.86, day), lerp(0.3, 0.84, day), lerp(0.4, 0.86, day)] });
    vignette(ctx, 1);
    const yr = Math.round(lerp(1948, 2022, E.inQuad(prog(u, 72.8, 76.6))));
    slam(ctx, String(yr), CX, SAFE.y + 300, 230, u, 72.5, { color: C.bone, over: 1.1 });
    serif(ctx, 'buried unnamed, West Terrace Cemetery, 1949', CX, SAFE.y + 380, 46, C.bone, 'center', null, null, 30, true);
    captions(ctx, t);
  }],
  // 15a. DNA from hair caught in that cast
  [77, 80.5, (ctx, u, t, u3, t3) => {
    stage(ctx, 'bust', t3, u3, { cam: [[0.35, 1.84, lerp(0.75, 0.55, prog(u3, 77, 80.5))], [0.05, 1.8, 0], 34, 0.03], turn: -0.5 });
    vignette(ctx, 1);
    const hk = E.outCubic(prog(u, K.hair - 0.2, K.hair + 0.8));
    ctx.save(); ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 4; ctx.shadowColor = 'rgba(255,220,120,0.9)'; ctx.shadowBlur = 22;
    ctx.beginPath(); for (let i = 0; i <= 40 * hk; i++) { const x = 380 + i * 9, y = 760 + 40 * Math.sin(i * 0.25) - i * 3; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); ctx.restore();
    if (hk > 0.9) tag(ctx, 'A STRAND OF HAIR', CX, SAFE.y + 140, 72, u, K.hair + 0.7);
    captions(ctx, t);
  }],
  // 15b. the DNA, 2022
  [80.5, 85, (ctx, u, t, u3, t3) => {
    stage(ctx, 'dna', t3, u3, { cam: [[lerp(2.6, 1.6, prog(u3, 80.5, 85)), 0.4, 3.2], [0, 0, 0], 50, 0.15], grow: E.outCubic(prog(u3, 80.5, 83)) });
    vignette(ctx, 0.9);
    tag(ctx, '2022', CX, SAFE.y + 140, 100, u, 80.6);
    captions(ctx, t);
  }],
  // 16. CARL WEBB
  [85, 89, (ctx, u, t, u3, t3) => {
    stage(ctx, 'dna', t3, u3, { cam: [[1.6, 0.4, 3.2], [0, 0, 0], 50, 0.15], grow: 1 });
    veil(ctx, 0.55);
    vignette(ctx, 1);
    slam(ctx, 'CARL WEBB', CX, 860, 230, u, K.webb, { color: C.bone, over: 1.3 });
    serif(ctx, 'electrical engineer', CX, 980, 62, C.bone, 'center', u, K.webb + 0.7, 40, true);
    serif(ctx, 'born 1905 · Footscray, Melbourne', CX, 1060, 54, C.bone, 'center', u, K.webb + 1.3, 40, true);
    serif(ctx, 'named by researchers in July 2022', CX, 1150, 44, '#c8beb0', 'center', u, K.webb + 2.0, 50);
  }],
  // 17. what we still don't know, and back to the two words
  [89, 'K.two', (ctx, u, t, u3, t3) => {
    const pp = E.inOutSine(prog(u3, 89, K.two));
    stage(ctx, 'beach', t3, u3, { cam: [[lerp(5.5, 9.5, pp), lerp(1.3, 0.9, pp), lerp(2.0, -2.4, pp)], [11.8, 0.5, -4], 42, 0.02], man: 0, day: 0.3, fog: [0.3, 0.28, 0.34] });
    veil(ctx, 0.5);
    vignette(ctx, 1);
    const rows = [['HIS NAME', 89.2, true], ['HOW HE DIED', K.died, false], ['WHAT THE CODE SAYS', K.code, false], ['WHAT HE MEANT', K.meant + 0.4, false]];
    rows.forEach(([lbl, b0, done], i) => {
      if (u < b0) return;
      const k = E.outBack(clamp((u - b0) / 0.35), 1.6);
      const y = 470 + i * 175;
      ctx.save(); ctx.translate(SAFE.x + 40, y); ctx.scale(k, k);
      ctx.font = fnt(100); ctx.textAlign = 'left'; ctx.lineJoin = 'round'; ctx.lineWidth = 14; ctx.strokeStyle = '#000';
      ctx.strokeText(lbl, 110, 0); ctx.fillStyle = done ? 'rgba(242,238,228,0.6)' : C.bone; ctx.fillText(lbl, 110, 0);
      if (done) { ctx.strokeStyle = C.bone; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(10, -36); ctx.lineTo(40, -6); ctx.lineTo(86, -66); ctx.stroke(); }
      else { ctx.font = fnt(112); ctx.fillStyle = C.red; ctx.strokeText('?', 20, 6); ctx.fillText('?', 20, 6); }
      ctx.restore();
    });
    captions(ctx, t);
  }],
  // 18. ...two words: (the scrap again, landing on frame 0's framing: the loop)
  ['K.two', 99.01, (ctx, u, t) => {
    fill(ctx, '#0a0908');
    const p = E.outCubic(prog(u, K.two, 98.4));
    scrap(ctx, CX, lerp(H * 0.6, HOOK.y, p), HOOK.s * lerp(0.7, 1, p), lerp(0.2, HOOK.rot, p), 1, 0.5 * p);
    vignette(ctx, 0.9);
    if (u >= 98.4) tag(ctx, 'UNSOLVED · 1948', CX, SAFE.y + 110, 70, u, 98.4);
    captions(ctx, t);
  }],
].map(([a, b, fn]) => [typeof a === 'string' ? K[a.slice(2)] : a, typeof b === 'string' ? K[b.slice(2)] : b, fn]);

// the blurred phone number: a few pencil strokes
function codeBlockLine(ctx, x, y, size, str, p) {
  [...str].forEach((ch, i) => pencilGlyph(ctx, ['W', 'M', 'T', 'L', 'N'][i % 5], x + i * size * 0.8, y, size, clamp(p * str.length - i), 500 + i));
}

// ---------------------------------------------------------------- post
function makePost() {
  for (let k = 0; k < 4; k++) {
    const cv = document.createElement('canvas'); cv.width = 384; cv.height = 384;
    const c = cv.getContext('2d'), img = c.createImageData(384, 384), r = M.mulberry32(900 + k);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 110; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    c.putImageData(img, 0, 0); GRAIN.push(cv);
  }
  SCAN = document.createElement('canvas'); SCAN.width = W; SCAN.height = H;
  const sc = SCAN.getContext('2d'); sc.fillStyle = 'rgba(0,0,0,0.2)';
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
  ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.18; ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.restore();
  const r = M.mulberry32(fr * 7 + 3);
  if (r() < 0.18) { ctx.save(); ctx.fillStyle = 'rgba(230,220,200,0.25)'; ctx.fillRect(r() * W, 0, 2, H); ctx.restore(); }
  for (let i = 0; i < 2; i++) if (r() < 0.3) { ctx.save(); ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.5)' : 'rgba(240,230,210,0.35)'; ctx.beginPath(); ctx.arc(r() * W, r() * H, 1 + r() * 4, 0, M.TAU); ctx.fill(); ctx.restore(); }
  ctx.drawImage(SCAN, 0, 0);
  // a sepia wash: 1948
  ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.18; fill(ctx, '#b08850'); ctx.restore();
}

M.film({
  fonts: [`400 100px ${DISPLAY}`, `400 60px ${SERIF}`, `italic 400 60px ${SERIF}`],
  hits: HITS,
  samples: 1,
  async init() {
    P.initPS1();
    S.initWorld();
    SETS.beach = S.beachSet();
    SETS.evidence = S.evidenceSet();
    SETS.book = S.bookSet();
    SETS.car = S.carSet();
    SETS.house = S.houseSet();
    SETS.bust = S.bustSet();
    SETS.dna = S.dnaSet();
    makeCloth();
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
