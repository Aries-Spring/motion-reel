// type.js: the lyric styles (one per section, see docs/shotlist.md). Words come from lyrics.json
// (sung times); a word appears ~40 ms before its t0, the current word takes the accent.
// Lines are laid out once (cached), never reflowed while they play. Main lines >= 80 px.
import * as M from './lib/motion.js';

export const C = {
  ink: '#141413', slate: '#2B2A27', slate2: '#3D3D3A', paper: '#F0EEE6', ivory: '#FAF9F5', oat: '#E3DACC',
  clay: '#D97757', clayHot: '#E8562C', kraft: '#D4A27F', cloud: '#B8B5AA',
};
export const D = 'Display', UI = 'UI';
const LEAD = 0.04;
let LINES = [];
export async function loadLyrics() {
  const ly = await fetch('lyrics.json').then((r) => r.json());
  LINES = ly.lines.map((L, i) => ({ ...L, i }));
  return LINES;
}
export const lines = () => LINES;

// lines that began before this time are not drawn (set per shot: a line never rides across a cut
// into a shot with another lyric style)
let T_MIN = -1e9;
export const setWindow = (t) => { T_MIN = t; };
// the line(s) on screen at t: from just before the first word to just after the last, ending when the
// next line appears (never two lines at once)
export function current(t, pre = 0.35, post = 0.6) {
  const out = [];
  for (let i = 0; i < LINES.length; i++) {
    const L = LINES[i], nx = LINES[i + 1];
    if (L.t0 < T_MIN) continue;
    const a = L.t0 - pre, b = Math.min(L.t1 + post, nx ? nx.t0 - pre - 0.02 : 1e9);
    if (t >= a && t < b) out.push({ L, a, b, k: (t - a) / (b - a), out: M.clamp((t - (b - 0.22)) / 0.22) });
  }
  return out;
}
const sung = (w, t) => t >= w.t0 - LEAD;
const singing = (w, t) => t >= w.t0 - LEAD && t < w.t1;
const KEY = /^(tested|sweet|underneath|ahead|eval|polysemantic|grokked|autocomplete|IDE|sandbag|slow|arrested|know|dissected|book|look|you|tokens|compute|once|wants|plan|thing|understand|aligned|test|more|sky|why|thought|got|said|head|me|score)\W*$/i;

// ---- layout: words of a line in up to two rows that fit maxW (cached per line+font)
const LAY = new Map();
export function layLine(ctx, L, f, maxW, track = 0, space = 0.28) {
  const key = `${L.i}|${f}|${maxW}|${track}`;
  if (LAY.has(key)) return LAY.get(key);
  ctx.font = f; ctx.letterSpacing = `${track}px`;
  const sz = parseFloat(/(\d+)px/.exec(f)[1]);
  const ws = L.words.map((w) => ({ ...w, width: ctx.measureText(w.w).width }));
  ctx.letterSpacing = '0px';
  const sp = sz * space;
  const total = ws.reduce((a, w) => a + w.width, 0) + sp * (ws.length - 1);
  let rows = [ws];
  if (total > maxW) {
    // split at the word boundary nearest half the width
    let acc = 0, best = 1, bd = 1e9;
    for (let i = 0; i < ws.length - 1; i++) { acc += ws[i].width + sp; const d = Math.abs(acc - total / 2); if (d < bd) { bd = d; best = i + 1; } }
    rows = [ws.slice(0, best), ws.slice(best)];
  }
  const out = rows.map((r) => {
    let x = 0; const items = r.map((w) => { const it = { ...w, x }; x += w.width + sp; return it; });
    return { items, width: x - sp };
  });
  const lay = { rows: out, size: sz, width: Math.max(...out.map((r) => r.width)) };
  LAY.set(key, lay);
  return lay;
}

// y: baseline of the LAST row (bottom-anchored); top: baseline of the first row (top-anchored)
function rowsAt(lay, x, y, align, lh, top = null) {
  const y0 = top ?? y - (lay.rows.length - 1) * lh;
  return lay.rows.map((r, ri) => ({ ...r, x0: align === 'center' ? x - r.width / 2 : align === 'right' ? x - r.width : x, y0: y0 + ri * lh }));
}

// ======================================================================== styles
// opts common: x, y (baseline of the first row), align, maxW, color, accent, ground (stroke colour), size

// verse 1: prompt tokens. Words land as chips in a prompt bar; the current chip is clay.
export function tokens(ctx, t, o = {}) {
  for (const { L, k, out } of current(t, 0.5, 0.5)) {
    const sz = o.size || 80, f = M.font(sz, 500, UI);
    const lay = layLine(ctx, L, f, o.maxW || 1640, -0.02 * sz, 0.62);
    const lh = sz * 1.55;
    const rows = rowsAt(lay, o.x ?? M.W / 2, o.y ?? M.H - 120, o.align || 'center', lh, o.top);
    const fade = 1 - out;
    ctx.save(); ctx.globalAlpha = fade;
    ctx.translate(0, -out * 30);
    for (const r of rows) for (const w of r.items) {
      if (!sung(w, t)) continue;
      const p = M.springU(M.U(t), M.U(w.t0 - LEAD), M.SPRING.bouncy);
      const now = singing(w, t);
      const x = r.x0 + w.x - sz * 0.22, y = r.y0 - sz * 0.88, wd = w.width + sz * 0.44, ht = sz * 1.18;
      ctx.save();
      ctx.translate(x + wd / 2, y + ht / 2); ctx.scale(0.6 + 0.4 * p, 0.6 + 0.4 * p); ctx.translate(-(x + wd / 2), -(y + ht / 2));
      M.rrect(ctx, x, y, wd, ht, sz * 0.24);
      ctx.fillStyle = now ? C.clay : (o.chip || C.paper); ctx.fill();
      if (!now) { ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(20,20,19,0.18)'; ctx.stroke(); }
      M.text(ctx, w.w, r.x0 + w.x, r.y0, f, now ? C.ivory : C.ink, 'left', -0.02 * sz);
      ctx.restore();
    }
    // caret after the last sung word
    const last = [...rows.flatMap((r) => r.items.map((w) => ({ w, r })))].filter(({ w }) => sung(w, t)).pop();
    if (last && Math.floor(t * 2.2) % 2 === 0) {
      ctx.fillStyle = C.clay; ctx.fillRect(last.r.x0 + last.w.x + last.w.width + sz * 0.32, last.r.y0 - sz * 0.8, sz * 0.09, sz * 0.95);
    }
    ctx.restore();
  }
}

// pre-chorus: steps. Words climb up and to the right, one per stair.
export function steps(ctx, t, o = {}) {
  for (const { L, out } of current(t, 0.3, 0.45)) {
    const sz = o.size || 92, f = M.font(sz, 700, D);
    ctx.font = f;
    let x = o.x ?? 150, y = o.y ?? M.H - 150;
    ctx.save(); ctx.globalAlpha = 1 - out;
    for (const w of L.words) {
      const wd = ctx.measureText(w.w).width;
      if (sung(w, t)) {
        const p = M.springU(M.U(t), M.U(w.t0 - LEAD), M.SPRING.snappy);
        const yy = y + (1 - p) * 60;
        ctx.lineWidth = sz * 0.12; ctx.strokeStyle = o.ground || C.ink; ctx.lineJoin = 'round';
        ctx.strokeText(w.w, x, yy);
        M.text(ctx, w.w, x, yy, f, singing(w, t) ? C.clay : (o.color || C.ivory));
        // the tread under the word
        ctx.fillStyle = singing(w, t) ? C.clay : 'rgba(250,249,245,0.5)';
        ctx.fillRect(x, yy + sz * 0.22, wd * p, 5);
      }
      x += wd + sz * 0.3; y -= sz * 0.62;
    }
    ctx.restore();
  }
}

// chorus 1: stamp. Big serif words spring in on their time; key words clay italic.
export function stamp(ctx, t, o = {}) {
  for (const { L, out } of current(t, 0.3, 0.5)) {
    const sz = o.size || 128;
    const f = M.font(sz, 800, D), fi = `italic ${M.font(sz, 700, D)}`;
    const lay = layLine(ctx, L, f, o.maxW || 1500, -0.03 * sz, 0.26);
    const lh = sz * 0.98;
    const rows = rowsAt(lay, o.x ?? 110, o.y ?? M.H - 110, o.align || 'left', lh, o.top);
    ctx.save();
    for (const r of rows) for (const w of r.items) {
      if (!sung(w, t)) continue;
      const uu = M.U(t), u0 = M.U(w.t0 - LEAD);
      const p = M.springU(uu, u0, M.SPRING.bouncy);
      const s = 1 + 0.5 * (1 - p);
      const key = KEY.test(w.w) && (o.keys !== false);
      const cx = r.x0 + w.x + w.width / 2, cy = r.y0 - sz * 0.35;
      ctx.save();
      ctx.globalAlpha = M.clamp(p * 1.5) * (1 - out);
      ctx.translate(cx, cy + out * -40); ctx.scale(s, s); ctx.rotate((1 - p) * 0.08); ctx.translate(-cx, -cy);
      ctx.font = key ? fi : f; ctx.letterSpacing = `${-0.03 * sz}px`;
      if (o.ground) { ctx.lineWidth = sz * 0.07; ctx.lineJoin = 'round'; ctx.strokeStyle = o.ground; ctx.strokeText(w.w, r.x0 + w.x, r.y0); }
      ctx.fillStyle = key ? C.clay : (o.color || C.ink);
      ctx.fillText(w.w, r.x0 + w.x, r.y0);
      ctx.letterSpacing = '0px';
      ctx.restore();
    }
    ctx.restore();
  }
}

// verse 2: decode. Mono characters scramble until their word is sung, then lock.
const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*+=<>/\\|{}[]';
export function decode(ctx, t, o = {}) {
  for (const { L, out } of current(t, 0.5, 0.5)) {
    const sz = o.size || 84, f = M.font(sz, 600, UI);
    const lay = layLine(ctx, L, f, o.maxW || 1640, 0, 0.6);
    const lh = sz * 1.3;
    const rows = rowsAt(lay, o.x ?? M.W / 2, o.y ?? M.H - 120, o.align || 'center', lh, o.top);
    ctx.save(); ctx.globalAlpha = 1 - out;
    ctx.font = f;
    for (const r of rows) for (const w of r.items) {
      const tShow = w.t0 - 0.28; // scramble starts just ahead of the word
      if (t < tShow) continue;
      const locked = sung(w, t);
      const ch = [...w.w];
      let x = r.x0 + w.x;
      const adv = w.width / ch.length;
      ch.forEach((c, i) => {
        const lockAt = w.t0 - LEAD + i * 0.018;
        let g = c;
        if (t < lockAt && /[A-Za-z0-9]/.test(c)) g = GLYPHS[Math.floor(M.hash01(i + Math.floor(t * 30) * 13, w.t0 * 100) * GLYPHS.length)];
        const isNow = singing(w, t);
        const scr = t < lockAt;
        ctx.fillStyle = scr ? 'rgba(217,119,87,0.5)' : isNow ? C.clay : (o.color || C.ivory);
        ctx.lineWidth = sz * 0.14; ctx.strokeStyle = o.ground || C.ink; ctx.lineJoin = 'round';
        if (!scr) ctx.strokeText(g, x, r.y0);
        ctx.fillText(g, x, r.y0);
        x += adv;
      });
      if (locked && singing(w, t)) { ctx.fillStyle = C.clay; ctx.fillRect(r.x0 + w.x, r.y0 + sz * 0.18, w.width * M.clamp((t - w.t0) / Math.max(0.05, w.t1 - w.t0)), 6); }
    }
    ctx.restore();
  }
}

// chorus 2: karaoke wipe. The whole line in outlined serif from the start; clay fills as it is sung.
export function wipe(ctx, t, o = {}) {
  for (const { L, k, out } of current(t, 0.45, 0.5)) {
    const sz = o.size || 120, f = M.font(sz, 800, D);
    const lay = layLine(ctx, L, f, o.maxW || 1560, -0.025 * sz, 0.26);
    const lh = sz * 1.0;
    const rows = rowsAt(lay, o.x ?? M.W / 2, o.y ?? M.H - 110, o.align || 'center', lh, o.top);
    const intro = M.E.outCubic(M.clamp((t - (L.t0 - 0.45)) / 0.3));
    ctx.save(); ctx.globalAlpha = intro * (1 - out);
    ctx.translate(0, (1 - intro) * 30 - out * 30);
    ctx.font = f; ctx.letterSpacing = `${-0.025 * sz}px`;
    for (const r of rows) for (const w of r.items) {
      const x = r.x0 + w.x, y = r.y0;
      ctx.lineWidth = sz * 0.12; ctx.strokeStyle = o.ground || C.ink; ctx.lineJoin = 'round'; ctx.strokeText(w.w, x, y);
      ctx.lineWidth = 3; ctx.strokeStyle = o.color || C.ivory; ctx.strokeText(w.w, x, y);
      ctx.fillStyle = 'rgba(250,249,245,0.18)'; ctx.fillText(w.w, x, y);
      const p = M.clamp((t - (w.t0 - LEAD)) / Math.max(0.08, w.t1 - w.t0));
      if (p > 0) {
        ctx.save(); ctx.beginPath(); ctx.rect(x - 4, y - sz, (w.width + 8) * p, sz * 1.3); ctx.clip();
        ctx.fillStyle = o.accent || C.clay; ctx.fillText(w.w, x, y);
        ctx.restore();
      }
    }
    ctx.letterSpacing = '0px';
    ctx.restore();
  }
}

// break: drift. Small letter-spaced italic, words breathe up.
export function drift(ctx, t, o = {}) {
  for (const { L, out } of current(t, 0.6, 1.2)) {
    const sz = o.size || 84, f = `italic ${M.font(sz, 300, D)}`;
    const lay = layLine(ctx, L, f, o.maxW || 1600, 0.06 * sz, 0.3);
    const lh = sz * 1.3;
    const rows = rowsAt(lay, o.x ?? M.W / 2, o.y ?? M.H * 0.8, o.align || 'center', lh, o.top);
    ctx.save();
    if (o.band !== false) {
      const y0 = rows[0].y0 - sz * 1.1, y1 = rows[rows.length - 1].y0 + sz * 0.6;
      const g = ctx.createLinearGradient(0, y0 - 60, 0, y1 + 60);
      g.addColorStop(0, 'rgba(240,238,230,0)'); g.addColorStop(0.3, 'rgba(240,238,230,0.82)'); g.addColorStop(0.7, 'rgba(240,238,230,0.82)'); g.addColorStop(1, 'rgba(240,238,230,0)');
      ctx.globalAlpha = 1 - out; ctx.fillStyle = g; ctx.fillRect(0, y0 - 60, M.W, y1 - y0 + 120);
    }
    for (const r of rows) for (const w of r.items) {
      const a = M.E.outCubic(M.clamp((t - (w.t0 - 0.25)) / 0.6));
      if (a <= 0) continue;
      ctx.globalAlpha = a * (1 - out);
      ctx.font = f; ctx.letterSpacing = `${0.06 * sz}px`;
      ctx.fillStyle = o.color || C.ink;
      ctx.fillText(w.w, r.x0 + w.x, r.y0 + (1 - a) * 24 - out * 20);
    }
    ctx.letterSpacing = '0px';
    ctx.restore();
  }
}

// bridge: data labels. Mono uppercase tags; each word's tag snaps in with a leader tick.
export function labels(ctx, t, o = {}) {
  for (const { L, out } of current(t, 0.3, 0.5)) {
    const sz = o.size || 80, f = M.font(sz, 700, UI);
    const lay = layLine(ctx, { ...L, words: L.words.map((w) => ({ ...w, w: w.w.toUpperCase() })) }, f, o.maxW || 1640, -0.01 * sz, 0.5);
    const lh = sz * 1.5;
    const rows = rowsAt(lay, o.x ?? 120, o.y ?? M.H - 110, o.align || 'left', lh, o.top);
    ctx.save(); ctx.globalAlpha = 1 - out;
    for (const r of rows) for (const w of r.items) {
      if (!sung(w, t)) continue;
      const p = M.springU(M.U(t), M.U(w.t0 - LEAD), M.SPRING.snappy);
      const now = singing(w, t);
      const x = r.x0 + w.x, y = r.y0;
      ctx.fillStyle = now ? C.clay : (o.box || C.ink);
      ctx.fillRect(x - 12, y - sz * 0.86, (w.width + 24) * p, sz * 1.1);
      if (p > 0.6) M.text(ctx, w.w, x, y, f, now ? C.ink : (o.color || C.ivory), 'left', -0.01 * sz);
    }
    ctx.restore();
  }
}

// cut-out: whisper. One lower-third italic line, the current word brightening.
export function whisper(ctx, t, o = {}) {
  for (const { L, out } of current(t, 0.5, 0.9)) {
    const sz = o.size || 80, f = `italic ${M.font(sz, 400, D)}`;
    const lay = layLine(ctx, L, f, o.maxW || 1500, 0.01 * sz, 0.28);
    const lh = sz * 1.15;
    const rows = rowsAt(lay, o.x ?? M.W / 2, o.y ?? M.H - 140, o.align || 'center', lh, o.top);
    const intro = M.clamp((t - (L.t0 - 0.5)) / 0.5);
    ctx.save();
    const by = rows[0].y0 - sz * 1.2, bh = rows[rows.length - 1].y0 - by + sz * 0.8;
    const g = ctx.createLinearGradient(0, by - 80, 0, by + bh + 80);
    g.addColorStop(0, 'rgba(7,6,6,0)'); g.addColorStop(0.35, 'rgba(7,6,6,0.62)'); g.addColorStop(0.65, 'rgba(7,6,6,0.62)'); g.addColorStop(1, 'rgba(7,6,6,0)');
    ctx.globalAlpha = intro * (1 - out); ctx.fillStyle = g; ctx.fillRect(0, by - 80, M.W, bh + 160);
    for (const r of rows) for (const w of r.items) {
      const done = t >= w.t1, now = singing(w, t);
      ctx.globalAlpha = intro * (1 - out) * (now ? 1 : done ? 0.9 : 0.6);
      M.text(ctx, w.w, r.x0 + w.x, r.y0, f, now ? (o.accent || C.kraft) : (o.color || C.ivory), 'left', 0.01 * sz);
    }
    ctx.restore();
  }
}

// final chorus: feature cards. Each word printed on a small labelled card; cards sit where the
// shot puts them (o.anchor(i) -> {x, y, rot}) or in a staggered row.
export function cards(ctx, t, o = {}) {
  for (const { L, out } of current(t, 0.3, 0.45)) {
    const sz = o.size || 96, f = M.font(sz, 800, D), fs = M.font(24, 600, UI);
    ctx.font = f;
    const ws = L.words.map((w) => ({ ...w, width: ctx.measureText(w.w).width }));
    const total = ws.reduce((a, w) => a + w.width + sz * 0.62, 0);
    const twoRows = total > (o.maxW || 1700);
    let x = 0, row = 0, half = 0;
    if (twoRows) { let acc = 0; for (let i = 0; i < ws.length; i++) { acc += ws[i].width + sz * 0.62; if (acc > total / 2) { half = i + 1; break; } } }
    const rowW = (a, b) => ws.slice(a, b).reduce((s, w) => s + w.width + sz * 0.62, 0);
    const widths = twoRows ? [rowW(0, half), rowW(half, ws.length)] : [total];
    ctx.save(); ctx.globalAlpha = 1 - out;
    ws.forEach((w, i) => {
      if (twoRows && i === half) { row = 1; x = 0; }
      const rw = widths[row];
      const bx = (o.x ?? M.W / 2) - rw / 2 + x, by = (o.y ?? M.H - 200) - (twoRows ? (1 - row) * sz * 1.75 : 0);
      x += w.width + sz * 0.62;
      if (!sung(w, t)) return;
      const p = M.springU(M.U(t), M.U(w.t0 - LEAD), M.SPRING.bouncy);
      const now = singing(w, t);
      const cw = w.width + sz * 0.4, ch = sz * 1.45;
      ctx.save();
      ctx.translate(bx + cw / 2, by); ctx.rotate((1 - p) * 0.3 + (M.hash01(i, L.i) - 0.5) * 0.04); ctx.scale(p, p); ctx.translate(-(bx + cw / 2), -by);
      ctx.fillStyle = now ? C.clay : C.ivory; ctx.fillRect(bx, by - ch * 0.78, cw, ch);
      ctx.fillStyle = now ? C.ivory : C.ink;
      ctx.font = fs; ctx.fillText(`#${(1000 + Math.floor(M.hash01(i, L.i * 7) * 98000)).toLocaleString('en-US')}`, bx + 14, by - ch * 0.78 + 30);
      M.text(ctx, w.w, bx + sz * 0.2, by + sz * 0.28, f, now ? C.ivory : C.ink, 'left', -0.02 * sz);
      ctx.restore();
    });
    ctx.restore();
  }
}

// outro: cursor. Tiny mono, typed letter by letter across each word, blinking clay block.
export function cursor(ctx, t, o = {}) {
  for (const { L, out } of current(t, 0.4, 2.2)) {
    const sz = o.size || 64, f = M.font(sz, 500, UI);
    ctx.font = f;
    let s = '';
    for (const w of L.words) {
      const n = [...w.w].length, k = M.clamp((t - (w.t0 - LEAD)) / Math.max(0.12, w.t1 - w.t0));
      if (k <= 0) break;
      s += (s ? ' ' : '') + [...w.w].slice(0, Math.ceil(n * k)).join('');
    }
    const full = L.text;
    const wd = ctx.measureText(full).width;
    const x = (o.x ?? M.W / 2) - wd / 2, y = o.y ?? M.H / 2 + 260;
    ctx.save(); ctx.globalAlpha = 1 - out;
    ctx.fillStyle = 'rgba(11,10,9,0.78)'; M.rrect(ctx, x - ctx.measureText('> ').width - 28, y - sz * 1.05, wd + ctx.measureText('> ').width + 56 + sz * 0.6, sz * 1.5, 14); ctx.fill();
    M.text(ctx, '> ' + s, x - ctx.measureText('> ').width, y, f, o.color || C.ivory);
    if (Math.floor(t * 2.4) % 2 === 0) { ctx.fillStyle = C.clay; ctx.fillRect(x + ctx.measureText(s).width + 8, y - sz * 0.78, sz * 0.55, sz * 0.95); }
    ctx.restore();
  }
}

export const STYLE = { tokens, steps, stamp, decode, wipe, drift, labels, whisper, cards, cursor };
export const SECTION_STYLE = { 'verse-1': 'tokens', 'pre-chorus': 'steps', chorus: 'stamp', 'verse-2': 'decode', break: 'drift', bridge: 'labels', 'final-chorus': 'cards', outro: 'cursor' };
