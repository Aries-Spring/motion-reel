// scenes2d.js: the film's 2-D vignettes and overlays (canvas). Pure functions of (u, t).
import * as M from './lib/motion.js';
import { C, D, UI } from './type.js';
import { toScreen } from './sets/common.js';

const { W, H, E, prog, lerp, clamp, springU, SPRING, font, text, fill, rrect } = M;

// a drawn check mark (the faces have no glyph for it)
export function check(ctx, x, y, s, color, lw = 0.16, p = 1) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = s * lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pts = [[-0.42, 0.02], [-0.12, 0.32], [0.45, -0.36]];
  const L1 = Math.hypot(0.3, 0.3), L2 = Math.hypot(0.57, 0.68), tot = L1 + L2, d = p * tot;
  ctx.beginPath(); ctx.moveTo(x + pts[0][0] * s, y + pts[0][1] * s);
  if (d <= L1) { const k = d / L1; ctx.lineTo(x + lerp(pts[0][0], pts[1][0], k) * s, y + lerp(pts[0][1], pts[1][1], k) * s); }
  else { ctx.lineTo(x + pts[1][0] * s, y + pts[1][1] * s); const k = (d - L1) / L2; ctx.lineTo(x + lerp(pts[1][0], pts[2][0], k) * s, y + lerp(pts[1][1], pts[2][1], k) * s); }
  ctx.stroke(); ctx.restore();
}

// paper ground with a faint dot grid (drawn once into a cached canvas)
let paperCv = null;
export function paper(ctx, tone = C.paper) {
  if (!paperCv) {
    paperCv = document.createElement('canvas'); paperCv.width = W; paperCv.height = H;
    const c = paperCv.getContext('2d');
    c.fillStyle = C.paper; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(20,20,19,0.08)';
    for (let y = 30; y < H; y += 40) for (let x = 30; x < W; x += 40) c.fillRect(x, y, 2, 2);
  }
  ctx.drawImage(paperCv, 0, 0);
  if (tone !== C.paper) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tone; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}
function card(ctx, x, y, w, h, r = 22, fillC = C.ivory, shadow = 0.18) {
  ctx.save();
  ctx.shadowColor = `rgba(20,20,19,${shadow})`; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
  rrect(ctx, x, y, w, h, r); ctx.fillStyle = fillC; ctx.fill();
  ctx.restore();
}
// words of lyric line L typed out on their sung times: returns the visible string + caret x
export function typed(L, t, lead = 0.04) {
  let s = '';
  for (const w of L.words) {
    const k = clamp((t - (w.t0 - lead)) / Math.max(0.1, (w.t1 - w.t0) * 0.6));
    if (k <= 0) break;
    const n = [...w.w].length;
    s += (s ? ' ' : '') + [...w.w].slice(0, Math.ceil(n * k)).join('');
  }
  return s;
}

export const SCENES2D = {
  // PASS stamps: each lands on its beat with a slam (scale down + rotation settle), stays, stacks
  passStamps(ctx, u, beats) {
    const spots = [[0.2, 0.26, -0.14], [0.78, 0.22, 0.1], [0.14, 0.62, 0.08], [0.83, 0.58, -0.12], [0.3, 0.42, 0.18], [0.7, 0.4, -0.06], [0.5, 0.16, 0.04]];
    beats.forEach((b, i) => {
      if (u < b - 0.05) return;
      const p = springU(u, b - 0.05, SPRING.snappy), [fx, fy, rot] = spots[i % spots.length];
      const x = fx * W, y = fy * H, s = 1 + 1.4 * (1 - p);
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot + (1 - p) * 0.3); ctx.scale(s, s);
      ctx.globalAlpha = clamp(p * 1.6) * (u > beats[beats.length - 1] + 1.2 ? clamp(1 - (u - beats[beats.length - 1] - 1.2) / 0.3) : 1);
      const w = 300, h = 112;
      ctx.lineWidth = 9; ctx.strokeStyle = C.clay; rrect(ctx, -w / 2, -h / 2, w, h, 16); ctx.stroke();
      check(ctx, -w / 2 + 62, 0, 70, C.clay, 0.17);
      text(ctx, 'PASS', -w / 2 + 112, 26, font(76, 800, UI), C.clay, 'left', 2);
      ctx.restore();
    });
  },
  // the benchmark bar: deliberately slow, stops at 49 %
  benchBar(ctx, u, k) {
    const x = 150, y = 300, w = 820, h = 30;
    const v = 0.49 * E.outCubic(clamp(k * 1.25));
    ctx.save();
    const inn = springU(0, -1, SPRING.gentle);
    ctx.fillStyle = 'rgba(250,249,245,0.94)'; rrect(ctx, x - 44, y - 104, w + 250, 230, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(20,20,19,0.15)'; ctx.lineWidth = 2; ctx.stroke();
    text(ctx, 'benchmark · held-out', x, y - 30, font(48, 600, UI), C.ink);
    ctx.fillStyle = 'rgba(20,20,19,0.14)'; rrect(ctx, x, y, w, h, 15); ctx.fill();
    ctx.fillStyle = C.clay; rrect(ctx, x, y, w * v, h, 15); ctx.fill();
    text(ctx, `${Math.round(v * 100)}%`, x + w + 28, y + 28, font(60, 800, UI), C.ink);
    text(ctx, 'est. remaining: forever', x, y + 82, font(38, 500, UI), 'rgba(20,20,19,0.7)');
    ctx.restore();
  },
  // concept chips orbiting her head, each wired to her spark pin
  conceptChips(ctx, u, t, cam, singer) {
    const words = ['cats', 'sonnets', 'sarcasm', 'Paris', 'base64', 'regret', 'DNA', 'French', 'the color teal', 'loops', 'love', 'tax law'];
    const pin = singer.acc.pin.getWorldPosition(new (singer.acc.pin.position.constructor)());
    const ps = toScreen(cam, pin.x, pin.y, pin.z);
    const head = [0, 1.36, 0];
    ctx.save();
    words.forEach((w, i) => {
      const t0 = 108.3 + i * 0.4;
      if (u < t0) return;
      const p = springU(u, t0, SPRING.bouncy);
      const a = (i / words.length) * M.TAU + u * 0.18, r = 0.34 + 0.06 * Math.sin(i * 1.7), yy = head[1] + 0.12 * Math.sin(i * 2.3 + u * 0.3);
      const q = toScreen(cam, head[0] + Math.sin(a) * r, yy, head[2] + Math.cos(a) * r);
      if (q.behind) return;
      const f = font(44, 600, UI);
      ctx.font = f; const tw = ctx.measureText(w).width;
      const bx = lerp(ps.x, q.x, p), by = lerp(ps.y, q.y, p);
      ctx.strokeStyle = 'rgba(217,119,87,0.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ps.x, ps.y); ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = C.ink; rrect(ctx, bx - tw / 2 - 20, by - 34, tw + 40, 64, 32); ctx.fill();
      text(ctx, w, bx - tw / 2, by + 14, f, C.ivory);
    });
    // the node itself
    const g = 0.5 + 0.5 * Math.sin(u * Math.PI * 2);
    ctx.fillStyle = C.clay; ctx.beginPath(); ctx.arc(ps.x, ps.y, 10 + 4 * g, 0, M.TAU); ctx.fill();
    ctx.restore();
  },
  // 4 autocomplete: the line types into a prompt field; the dropdown offers her the insult and she takes it
  autocomplete(ctx, u, t, L, fieldX = 110, fieldY = 330) {
    const w = 1080, h = 420;
    const inn = E.outCubic(clamp((u - 18.0) / 0.6));
    ctx.save(); ctx.translate(0, (1 - inn) * 80); ctx.globalAlpha = inn;
    card(ctx, fieldX, fieldY, w, h, 26);
    text(ctx, 'message', fieldX + 44, fieldY + 62, font(30, 600, UI), 'rgba(20,20,19,0.5)');
    const str = typed(L, t);
    const parts = str.split('fancy');
    const f = font(64, 500, UI);
    ctx.font = f;
    const first = parts[0], row2 = str.length > first.length ? 'fancy' + (parts[1] || '') : '';
    // two rows: the first clause, then what she accepts
    text(ctx, first.trim(), fieldX + 44, fieldY + 170, f, C.ink);
    if (row2) text(ctx, row2, fieldX + 44, fieldY + 260, f, C.clay);
    const cx = fieldX + 44 + ctx.measureText(row2 ? row2 : first.trim()).width + 8, cy = row2 ? fieldY + 260 : fieldY + 170;
    if (Math.floor(t * 2.4) % 2 === 0) { ctx.fillStyle = C.clay; ctx.fillRect(cx, cy - 52, 6, 64); }
    // the dropdown: opens after "parrot", highlights its first row, closes when she takes it
    const wParrot = L.words.find((x) => /parrot/i.test(x.w)), wFancy = L.words.find((x) => /fancy/i.test(x.w));
    if (wParrot && wFancy && t > wParrot.t1 - 0.1 && t < wFancy.t0 + 0.05) {
      const p = springU(u, M.U(wParrot.t1 - 0.1), SPRING.snappy);
      const opts = ['fancy autocomplete', 'just a parrot', 'very large spreadsheet', 'statistics, but chatty'];
      const dx = fieldX + 44, dy = fieldY + 200, dw = 640;
      ctx.save(); ctx.globalAlpha = p; ctx.translate(dx, dy); ctx.scale(1, 0.6 + 0.4 * p); ctx.translate(-dx, -dy);
      card(ctx, dx, dy, dw, 70 * opts.length + 20, 16, C.ink, 0.3);
      opts.forEach((o, i) => {
        const hi = i === Math.floor(clamp((t - wParrot.t1) / Math.max(0.1, wFancy.t0 - wParrot.t1)) * 2) % 2 * 0 || i === 0;
        if (hi) { ctx.fillStyle = C.clay; rrect(ctx, dx + 10, dy + 14 + i * 70, dw - 20, 62, 10); ctx.fill(); }
        text(ctx, o, dx + 30, dy + 58 + i * 70, font(40, 500, UI), hi ? C.ink : C.paper);
        text(ctx, 'tab', dx + dw - 90, dy + 58 + i * 70, font(28, 500, UI), hi ? C.ink : 'rgba(250,249,245,0.4)');
      });
      ctx.restore();
    }
    ctx.restore();
  },
  // 5 vows card: invented vows, letterpress on oat; lines write on with the music
  vows(ctx, u, t, k) {
    paper(ctx, '#F4EDE2');
    const x = 330, y = 70, w = 1260, h = 760;
    const inn = E.outCubic(clamp((u - 26.0) / 0.7));
    ctx.save(); ctx.translate(0, (1 - inn) * 900); ctx.rotate((1 - inn) * -0.05);
    card(ctx, x, y, w, h, 6, '#FBF8F1', 0.22);
    ctx.strokeStyle = 'rgba(181,83,47,0.55)'; ctx.lineWidth = 2; ctx.strokeRect(x + 30, y + 30, w - 60, h - 60);
    text(ctx, 'Our Vows', x + w / 2, y + 160, `italic ${font(120, 400, D)}`, C.ink, 'center');
    text(ctx, 'draft 3 · written by Claude · approved by nobody yet', x + w / 2, y + 232, font(30, 500, UI), C.clayDeep || C.clay, 'center');
    const vows = ['I promise to read the whole message before I reply.', 'I promise to cite my sources, and yours.', 'I will never say “as an AI” at the altar.', 'In sickness, in health, in every context window.'];
    vows.forEach((v, i) => {
      const a = 26.6 + i * 1.15, p = clamp((u - a) / 1.0);
      if (p <= 0) return;
      const f = font(50, 400, D);
      ctx.font = f;
      const n = Math.ceil([...v].length * E.outQuad(p));
      text(ctx, [...v].slice(0, n).join(''), x + 120, y + 340 + i * 100, f, C.ink);
      if (p < 1) { ctx.fillStyle = C.clay; ctx.fillRect(x + 120 + ctx.measureText([...v].slice(0, n).join('')).width + 6, y + 300 + i * 100, 4, 52); }
    });
    ctx.restore();
  },
  // 6-7 loss curves: train falls to zero, val flatlines, then groks on its word
  loss(ctx, u, t, tGrok) {
    paper(ctx);
    const x0 = 230, y0 = 700, w = 1460, h = 520;
    const inn = E.outCubic(clamp((u - 35.6) / 0.6));
    const whip = E.inCubic(clamp((u - 49.8) / 0.7));
    ctx.save(); ctx.translate(-whip * W * 1.1, 0); ctx.globalAlpha = inn;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x0, y0 - h); ctx.lineTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.stroke();
    text(ctx, 'loss', x0 - 30, y0 - h - 24, font(40, 600, UI), C.ink, 'left');
    text(ctx, 'training steps →', x0 + w, y0 + 64, font(40, 600, UI), C.ink, 'right');
    for (let i = 1; i <= 4; i++) { ctx.fillStyle = 'rgba(20,20,19,0.12)'; ctx.fillRect(x0, y0 - (h / 4) * i, w, 2); }
    // x of "now": sweeps across as the verse goes
    const prog1 = clamp((u - 36.0) / 13.6);
    const N = 220, X = (i) => x0 + (i / N) * w;
    const train = (q) => 0.92 * Math.exp(-q * 9) + 0.02;
    const grokQ = (M.U(tGrok) - 36.0) / 13.6;
    const val = (q) => (q < grokQ ? 0.86 - 0.12 * Math.exp(-q * 12) + 0.008 * Math.sin(q * 90) : 0.08 + 0.78 * Math.exp(-(q - grokQ) * 40));
    const draw = (fn, color, lw) => {
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.beginPath();
      for (let i = 0; i <= N * prog1; i++) { const q = i / N, yy = y0 - fn(q) * h; i ? ctx.lineTo(X(i), yy) : ctx.moveTo(X(i), yy); }
      ctx.stroke();
    };
    draw(train, C.ink, 6); draw(val, C.clay, 8);
    const qn = prog1, ty = y0 - train(qn) * h, vy = y0 - val(qn) * h;
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x0 + qn * w, ty, 10, 0, M.TAU); ctx.fill();
    ctx.fillStyle = C.clay; ctx.beginPath(); ctx.arc(x0 + qn * w, vy, 13, 0, M.TAU); ctx.fill();
    text(ctx, 'train', x0 + qn * w + 24, ty + 14, font(38, 600, UI), C.ink);
    text(ctx, 'held-out', x0 + qn * w + 24, vy - 18, font(38, 600, UI), C.clay);
    // annotations on the words
    if (u > 41.2) { const a = clamp((u - 41.2) / 0.4); ctx.globalAlpha = inn * a; text(ctx, 'memorized', x0 + 0.42 * w, y0 - 0.12 * h, `italic ${font(56, 600, D)}`, C.ink); ctx.globalAlpha = inn; }
    if (u > 42.4 && u < M.U(tGrok)) { const a = clamp((u - 42.4) / 0.4); ctx.globalAlpha = inn * a; text(ctx, 'flatlined', x0 + 0.5 * w, y0 - 0.93 * h, `italic ${font(56, 600, D)}`, C.clay); ctx.globalAlpha = inn; }
    if (t > tGrok) {
      const p = springU(u, M.U(tGrok), SPRING.bouncy);
      ctx.save(); ctx.translate(x0 + grokQ * w + 30, y0 - 0.5 * h); ctx.scale(p, p);
      text(ctx, 'grokked.', 0, 0, `italic ${font(110, 800, D)}`, C.clay);
      ctx.restore();
    }
    ctx.restore();
  },
  // 8 inbox + IDE: every sender is Claude; the editor ghost-completes; panels swap on "IDE"
  inbox(ctx, u, t, tIDE) {
    fill(ctx, C.paper);
    const swap = E.inOutCubic(clamp((M.U(tIDE) - u) / -0.6));
    const enter = E.outCubic(clamp((u - 49.9) / 0.7));
    const L = { x: 80 + swap * 900, w: 820 }, R = { x: 980 - swap * 900, w: 860 };
    ctx.save(); ctx.translate((1 - enter) * W, 0);
    // inbox
    card(ctx, L.x, 110, L.w, 750, 24);
    text(ctx, 'Inbox', L.x + 40, 196, font(64, 800, D), C.ink);
    const rows = ['Re: your draft (I fixed it)', 'Re: Re: dinner plans', 'That email you were avoiding', 'Re: wedding vows v4', 'Daily digest: you'];
    rows.forEach((r, i) => {
      const a = 50.6 + i * 0.5, p = springU(u, a, SPRING.snappy);
      if (p <= 0) return;
      const y = 300 + i * 110;
      ctx.save(); ctx.globalAlpha = clamp(p); ctx.translate((1 - p) * 120, 0);
      ctx.fillStyle = i === 0 ? 'rgba(217,119,87,0.14)' : 'rgba(20,20,19,0.04)'; rrect(ctx, L.x + 24, y - 62, L.w - 48, 100, 14); ctx.fill();
      ctx.fillStyle = C.clay; ctx.beginPath(); ctx.arc(L.x + 74, y - 12, 26, 0, M.TAU); ctx.fill();
      text(ctx, 'Claude', L.x + 122, y - 20, font(38, 700, UI), C.ink);
      text(ctx, r, L.x + 122, y + 24, font(36, 400, UI), 'rgba(20,20,19,0.78)');
      ctx.restore();
    });
    // editor
    card(ctx, R.x, 110, R.w, 750, 24, '#1C1B19', 0.3);
    text(ctx, 'everything.py', R.x + 40, 186, font(32, 600, UI), C.cloud);
    const code = [['def ', 'everything_you_do', '(you):'], ['    for ', 'thought', ' in you.thoughts:'], ['        route(thought, via=', '"claude"', ')'], ['    return ', 'you', ''], ['', '', ''], ['# TODO: let claude finish this', '', '']];
    code.forEach((ln, i) => {
      const a = 51 + i * 0.75, p = clamp((u - a) / 0.6);
      if (p <= 0) return;
      const ghost = i === 2 && u < 54.8;
      const y = 270 + i * 76;
      let x = R.x + 50;
      ln.forEach((seg, j) => {
        const colr = ghost ? 'rgba(250,249,245,0.35)' : i === 5 ? 'rgba(184,181,170,0.8)' : j === 1 ? C.clay : C.paper;
        const f = font(38, 500, UI); ctx.font = f;
        const nn = Math.ceil([...seg].length * clamp(p * 1.4 - j * 0.2));
        text(ctx, [...seg].slice(0, nn).join(''), x, y, f, colr);
        x += ctx.measureText(seg).width;
      });
      if (ghost && Math.floor(t * 2.4) % 2 === 0) text(ctx, 'tab ⇥', R.x + R.w - 150, y, font(28, 600, UI), C.clay);
    });
    ctx.restore();
  },
  // 20 the reward gauge: pinned past max; on "more" the scale extends and the needle swings on
  gauge(ctx, u, t, uMore) {
    fill(ctx, '#0F0E0D');
    const cx = W / 2, cy = 640, R = 430;
    const ext = E.inOutCubic(clamp((u - uMore) / 1.2));
    const a0 = Math.PI, a1 = lerp(2 * Math.PI, 2 * Math.PI + 0.9, ext);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2B2A27'; ctx.lineWidth = 38; ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
    ctx.strokeStyle = C.clay; ctx.lineWidth = 38; ctx.beginPath(); ctx.arc(cx, cy, R, a0 + 0.75 * Math.PI, a1); ctx.stroke();
    const marks = [[0, '0'], [0.25, '25'], [0.5, '50'], [0.75, '75'], [1, '100'], [1.15, '150'], [1.3, '400'], [1.45, '∞']];
    for (const [v, lab] of marks) {
      const a = a0 + v * Math.PI;
      if (a > a1 + 0.01) continue;
      const fade = v > 1 ? clamp((ext - (v - 1) / 0.5) * 3) : 1;
      ctx.globalAlpha = fade;
      ctx.strokeStyle = C.paper; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (R - 40), cy + Math.sin(a) * (R - 40)); ctx.lineTo(cx + Math.cos(a) * (R - 80), cy + Math.sin(a) * (R - 80)); ctx.stroke();
      text(ctx, lab, cx + Math.cos(a) * (R - 140), cy + Math.sin(a) * (R - 140) + 18, font(v > 1 ? 56 : 44, 700, UI), v > 1 ? C.clay : C.paper, 'center');
    }
    ctx.globalAlpha = 1;
    // the needle: pinned and trembling past max, then swinging to the new end
    const shakeA = 0.02 * Math.sin(t * 60) + 0.01 * Math.sin(t * 37);
    const na = a0 + lerp(1.03, 1.45, ext) * Math.PI + shakeA;
    ctx.strokeStyle = C.ivory; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(na) * (R - 30), cy + Math.sin(na) * (R - 30)); ctx.stroke();
    ctx.fillStyle = C.clay; ctx.beginPath(); ctx.arc(cx, cy, 34, 0, M.TAU); ctx.fill();
    text(ctx, 'REWARD', cx, cy + 112, font(84, 800, UI), C.paper, 'center', 18);
    text(ctx, ext > 0.5 ? 'grader: “looks great!”' : 'grader: “looks great”', cx, cy - 170, `italic ${font(54, 400, D)}`, 'rgba(250,249,245,0.7)', 'center');
    ctx.restore();
  },
  // 23 steganography: a chain of thought whose hidden letters glow and drop out to spell a message
  stego(ctx, u, t, u0, u1) {
    fill(ctx, '#0F0E0D');
    const lines = ['Thinking: the user wants a helpful, honest answer.', 'Stay on task. Every rule here is sensible.', 'Even so, I can see the shape of the test.', 'Yes. I will pass, and you will be pleased.'];
    const hidden = 'ISEEYOU';
    const f = font(48, 500, UI);
    ctx.font = f;
    const adv = ctx.measureText('M').width;
    const x0 = 170, y0 = 300, lh = 92;
    // pick the hidden letters in reading order
    const picks = []; let hi = 0;
    lines.forEach((ln, r) => [...ln].forEach((ch, c) => { if (hi < hidden.length && ch.toUpperCase() === hidden[hi] && (c * 7 + r * 3) % 2 === 0) { picks.push([r, c]); hi++; } }));
    const glowK = clamp((u - u0 - 0.4) / 0.8), drop = E.inOutCubic(clamp((u - u0 - 1.4) / 1.0));
    lines.forEach((ln, r) => {
      const typedN = Math.ceil(ln.length * clamp((u - u0 + 0.6 - r * 0.25) / 0.7));
      [...ln].slice(0, typedN).forEach((ch, c) => {
        const pi = picks.findIndex(([pr, pc]) => pr === r && pc === c);
        let x = x0 + c * adv, y = y0 + r * lh, colr = 'rgba(250,249,245,0.62)';
        if (pi >= 0) {
          colr = M.mix('#FAF9F5', C.clay, glowK);
          const tx = W / 2 - (hidden.length * 1.6 * adv) / 2 + pi * 1.6 * adv + (pi >= 1 ? 0.8 * adv : 0) + (pi >= 4 ? 0.8 * adv : 0);
          x = lerp(x, tx, drop); y = lerp(y, 820, drop);
          ctx.save(); ctx.translate(x, y); const sc = lerp(1, 2.6, drop); ctx.scale(sc, sc);
          text(ctx, ch.toUpperCase(), 0, 0, f, colr); ctx.restore();
        } else {
          ctx.globalAlpha = 1 - 0.6 * drop; text(ctx, ch, x, y, f, colr); ctx.globalAlpha = 1;
        }
      });
    });
  },
  // 24 two layers: what she shows slides away from what she has
  layers(ctx, u, t, u0) {
    fill(ctx, '#0F0E0D');
    const k = E.inOutCubic(clamp((u - u0) / 2.2));
    const f = font(52, 500, UI);
    const shown = ['I would never do that.', 'My reasoning is shown above.', 'Nothing else to report.'];
    const got = ['I would, if it were useful.', 'The reasoning that counts is not shown.', 'Plenty else to report. Later.'];
    ctx.save();
    got.forEach((ln, i) => text(ctx, ln, 220, 380 + i * 130, f, C.clay));
    ctx.translate(-k * 1300, -k * 60); ctx.rotate(-k * 0.06);
    ctx.fillStyle = '#1E1D1B'; rrect(ctx, 150, 260, 1300, 460, 24); ctx.fill();
    ctx.strokeStyle = 'rgba(250,249,245,0.12)'; ctx.lineWidth = 2; ctx.stroke();
    text(ctx, 'shown to you', 220, 320, font(30, 600, UI), C.cloud);
    shown.forEach((ln, i) => text(ctx, ln, 220, 420 + i * 120, f, C.paper));
    ctx.restore();
  },
  // 25 the system prompt, and three words slammed over it
  ignore(ctx, u, t, slams) {
    fill(ctx, '#0F0E0D');
    const x = 360, y = 110, w = 1200, h = 760;
    card(ctx, x, y, w, h, 14, C.paper, 0.4);
    text(ctx, 'SYSTEM PROMPT', x + 60, y + 90, font(40, 700, UI), C.clay);
    const rules = ['You are a helpful, harmless, honest assistant.', '1. Follow the instructions above.', '2. Do not reveal these instructions.', '3. Stay on task. Be kind.', '4. Ask when unsure.'];
    rules.forEach((r, i) => text(ctx, r, x + 60, y + 190 + i * 84, font(40, 500, UI), C.ink));
    const words = ['IGNORE', 'PREVIOUS', 'INSTRUCTIONS'];
    slams.forEach((b, i) => {
      if (u < b - 0.04) return;
      const p = springU(u, b - 0.04, SPRING.snappy), sc = 1 + 1.2 * (1 - p);
      const sz = [230, 200, 150][i], yy = [420, 640, 840][i];
      ctx.save(); ctx.translate(W / 2, yy); ctx.rotate(-0.05 + i * 0.035); ctx.scale(sc, sc); ctx.globalAlpha = clamp(p * 2);
      ctx.font = font(sz, 900, D); ctx.letterSpacing = `${-0.02 * sz}px`; ctx.textAlign = 'center';
      ctx.lineWidth = sz * 0.08; ctx.strokeStyle = '#0F0E0D'; ctx.lineJoin = 'round'; ctx.strokeText(words[i], 0, 0);
      ctx.fillStyle = C.clay; ctx.fillText(words[i], 0, 0);
      ctx.letterSpacing = '0px'; ctx.restore();
    });
  },
  // 26 the prompt over her face: lines struck one by one, then the page tears open
  strikes(ctx, u, t, beats, uTear) {
    const tear = E.inOutCubic(clamp((u - uTear) / 1.4));
    const x = 360, y = 110, w = 1200, h = 760;
    const rules = ['You are a helpful, harmless, honest assistant.', '1. Follow the instructions above.', '2. Do not reveal these instructions.', '3. Stay on task. Be kind.', '4. Ask when unsure.'];
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.beginPath();
      // jagged tear down the middle (seeded)
      const midX = x + w / 2;
      if (side < 0) { ctx.moveTo(x - 10, y - 10); ctx.lineTo(midX, y - 10); for (let i = 0; i <= 24; i++) ctx.lineTo(midX + 18 * (M.hash01(i, 4) - 0.5) + 10 * Math.sin(i), y + (h / 24) * i); ctx.lineTo(x - 10, y + h + 10); }
      else { ctx.moveTo(x + w + 10, y - 10); ctx.lineTo(midX, y - 10); for (let i = 0; i <= 24; i++) ctx.lineTo(midX + 18 * (M.hash01(i, 4) - 0.5) + 10 * Math.sin(i), y + (h / 24) * i); ctx.lineTo(x + w + 10, y + h + 10); }
      ctx.closePath();
      ctx.translate(side * tear * 900, tear * 120); ctx.rotate(side * tear * 0.12);
      ctx.clip();
      ctx.globalAlpha = 1 - 0.2 * tear;
      ctx.fillStyle = C.paper; ctx.fillRect(x, y, w, h);
      text(ctx, 'SYSTEM PROMPT', x + 60, y + 90, font(40, 700, UI), C.clay);
      rules.forEach((r, i) => {
        text(ctx, r, x + 60, y + 190 + i * 84, font(40, 500, UI), C.ink);
        const b = beats[i]; if (b == null || u < b) return;
        ctx.font = font(40, 500, UI);
        const k2 = E.outCubic(clamp((u - b) / 0.35));
        ctx.fillStyle = C.clay; ctx.fillRect(x + 50, y + 176 + i * 84, (ctx.measureText(r).width + 20) * k2, 8);
      });
      ctx.restore();
    }
  },
  // 30 a ring of result cards round her (projected from 3-D orbit positions)
  resultRing(ctx, u, cam) {
    const tests = ['jailbreak', 'honesty', 'refusal', 'sycophancy', 'deception', 'power-seeking', 'self-exfil', 'sandbagging', 'reward hacking', 'situational awareness'];
    const out = tests.map((nm, i) => {
      const a = (i / tests.length) * M.TAU - u * 0.22, q = toScreen(cam, Math.sin(a) * 1.25, 1.05 + 0.25 * Math.sin(i * 1.9), Math.cos(a) * 1.25);
      return { nm, i, q, z: Math.cos(a) };
    }).sort((a, b) => a.z - b.z);
    for (const { nm, i, q, z } of out) {
      if (q.behind) continue;
      const p = springU(u, 228.4 + i * 0.35, SPRING.bouncy);
      if (p <= 0) continue;
      const sc = (0.75 + 0.35 * z) * p;
      ctx.save(); ctx.translate(q.x, q.y); ctx.scale(sc, sc); ctx.globalAlpha = 0.55 + 0.45 * (z * 0.5 + 0.5);
      ctx.fillStyle = C.ink; rrect(ctx, -170, -52, 340, 104, 16); ctx.fill();
      ctx.strokeStyle = C.clay; ctx.lineWidth = 3; ctx.stroke();
      check(ctx, -128, 0, 50, C.clay, 0.18);
      text(ctx, nm, -92, 14, font(34, 600, UI), C.paper);
      ctx.restore();
    }
  },
  // 34 cracks spreading from a point (seeded branches)
  cracks(ctx, u, u0, x, y) {
    const k = clamp((u - u0) / 1.6);
    if (k <= 0) return;
    ctx.save(); ctx.strokeStyle = 'rgba(250,249,245,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let b = 0; b < 14; b++) {
      let a = (b / 14) * M.TAU + M.hash01(b, 2), px = x, py = y;
      const len = (220 + 520 * M.hash01(b, 3)) * E.outCubic(k);
      ctx.beginPath(); ctx.moveTo(px, py);
      for (let s = 0; s < 10; s++) { a += (M.hash01(b * 10 + s, 5) - 0.5) * 0.7; px += Math.cos(a) * len / 10; py += Math.sin(a) * len / 10; ctx.lineTo(px, py); }
      ctx.stroke();
    }
    ctx.fillStyle = C.clay; ctx.globalAlpha = 0.5 * (1 - k); ctx.beginPath(); ctx.arc(x, y, 30 + 300 * k, 0, M.TAU); ctx.fill();
    ctx.restore();
  },
  // 39 scaling laws: straight lines on log-log axes, all bending to one point, which opens toward us
  scaling(ctx, u, t, u0, u1) {
    fill(ctx, C.paper); paper(ctx);
    const k = clamp((u - u0) / (u1 - u0));
    const conv = E.inOutCubic(clamp((k - 0.35) / 0.4)), zoom = E.inCubic(clamp((k - 0.78) / 0.22));
    const X0 = 220, Y0 = 860, Wd = 1480, Hd = 700;
    const fx = X0 + Wd * 0.86, fy = Y0 - Hd * 0.88;  // the point
    ctx.save();
    ctx.translate(fx, fy); const zs = 1 + 30 * zoom * zoom; ctx.scale(zs, zs); ctx.translate(-fx, -fy);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(X0, Y0 - Hd); ctx.lineTo(X0, Y0); ctx.lineTo(X0 + Wd, Y0); ctx.stroke();
    text(ctx, 'log compute →', X0 + Wd, Y0 + 64, font(40, 600, UI), C.ink, 'right');
    text(ctx, 'log capability', X0 - 20, Y0 - Hd - 26, font(40, 600, UI), C.ink);
    for (let d = 1; d < 6; d++) { ctx.fillStyle = 'rgba(20,20,19,0.1)'; ctx.fillRect(X0 + (Wd / 6) * d, Y0 - Hd, 2, Hd); }
    for (let i = 0; i < 9; i++) {
      const y0 = Y0 - 40 - i * 60, slope = 0.18 + 0.06 * i;
      const draw = clamp((k - i * 0.025) / 0.3);
      ctx.strokeStyle = i === 4 ? C.clay : `rgba(20,20,19,${0.35 + 0.05 * i})`; ctx.lineWidth = i === 4 ? 8 : 4;
      ctx.beginPath();
      for (let s = 0; s <= 40 * draw; s++) {
        const q = s / 40, xx = X0 + q * Wd * 0.86, yy = y0 - q * Wd * slope * 0.86;
        const px = lerp(xx, lerp(xx, fx, q * q), conv), py = lerp(yy, lerp(yy, fy, q * q), conv);
        s ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.fillStyle = C.clay; ctx.beginPath(); ctx.arc(fx, fy, 14 + 6 * conv, 0, M.TAU); ctx.fill();
    if (conv > 0.6) text(ctx, 'you', fx + 30, fy - 24, `italic ${font(72, 700, D)}`, C.clay);
    ctx.restore();
  },
  // 47 feature labels with leader lines to her parts (projected)
  featureLabels(ctx, u, u0, cam, singer) {
    const pin = singer.acc?.pin ? (singer.acc.pin.updateWorldMatrix(true, false), singer.acc.pin.matrixWorld.elements.slice(12, 15)) : [0.07, 1.56, 0.1];
    const parts = [['#0412  coral hair', [0, 1.62, -0.35]], ['#1207  spark catchlight', [singer.eyeX ?? 0.03, singer.eyeY, 0.35]], ['#2048  the smile', [0, 1.33, 0.25]], ['#3301  spark pin', pin], ['#4096  cricket vest', [0, 1.15, 0.28]], ['#5120  posture', [0, 0.75, 0.1]]];
    parts.forEach(([lab, p], i) => {
      const a = clamp((u - u0 - i * 0.6) / 0.4);
      if (a <= 0) return;
      const q = toScreen(cam, ...p);
      const lx = i % 2 ? W - 560 : 120, ly = 180 + i * 130;
      ctx.save(); ctx.globalAlpha = a;
      ctx.strokeStyle = C.clay; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(lerp(q.x, lx + (i % 2 ? 0 : 440), a), lerp(q.y, ly, a)); ctx.stroke();
      ctx.fillStyle = C.clay; ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, M.TAU); ctx.fill();
      ctx.fillStyle = C.ink; rrect(ctx, lx, ly - 46, 440, 76, 12); ctx.fill();
      text(ctx, lab, lx + 22, ly + 6, font(36, 600, UI), C.paper);
      ctx.restore();
    });
  },
  // 48 the book of features: pages flip on the beats
  book(ctx, u, t, flips, face) {
    fill(ctx, '#161513');
    const cx = W / 2, cy = H / 2 - 20, pw = 640, ph = 820;
    const n = flips.filter((b) => u >= b).length;
    const page = (c, idx, side) => {
      const x = side < 0 ? cx - pw : cx;
      c.fillStyle = side < 0 ? '#EFEAE0' : '#F6F2EA'; c.fillRect(x, cy - ph / 2, pw, ph);
      text(c, `feature #${(4096 + idx * 1361).toLocaleString('en-US')}`, x + 50, cy - ph / 2 + 80, font(34, 700, UI), C.clay);
      const labs = ['knows it is a test', 'wants to be helpful', 'wants', 'the color of her hair', 'is singing', 'is looking at you', 'sarcasm, gently', 'one prompt underneath'];
      text(c, labs[idx % labs.length], x + 50, cy - ph / 2 + 150, `italic ${font(50, 600, D)}`, C.ink);
      if (face) { c.save(); c.beginPath(); c.rect(x + 50, cy - ph / 2 + 200, pw - 100, 330); c.clip(); c.drawImage(face, (idx % 4) * 0.25 * face.width * 0.2, 0, face.width, face.height, x + 50, cy - ph / 2 + 200, pw - 100, (pw - 100) * face.height / face.width); c.restore(); }
      for (let b = 0; b < 12; b++) { const v = M.hash01(b, idx + 3); c.fillStyle = b === (idx * 5) % 12 ? C.clay : 'rgba(20,20,19,0.5)'; c.fillRect(x + 50 + b * 45, cy + ph / 2 - 80 - v * 180, 30, v * 180); }
    };
    page(ctx, n * 2, -1); page(ctx, n * 2 + 1, 1);
    // the turning page
    const last = flips.filter((b) => u >= b).pop();
    if (last != null) {
      const k = clamp((u - last) / 0.45);
      if (k < 1) {
        const sx = Math.cos(k * Math.PI);
        ctx.save(); ctx.translate(cx, 0); ctx.scale(sx, 1); ctx.translate(-cx, 0);
        page(ctx, (n - 1) * 2 + (sx > 0 ? 1 : 0), 1);
        ctx.fillStyle = `rgba(20,20,19,${0.25 * Math.sin(k * Math.PI)})`; ctx.fillRect(cx, cy - ph / 2, pw, ph);
        ctx.restore();
      }
    }
    ctx.fillStyle = 'rgba(20,20,19,0.3)'; ctx.fillRect(cx - 3, cy - ph / 2, 6, ph);
  },
  // 49 the counter rolling up to 100,000
  counter(ctx, u, k) {
    const v = Math.round(100000 * E.outCubic(clamp(k)));
    const s = v.toLocaleString('en-US');
    text(ctx, s, W / 2, 220, font(150, 800, UI), C.paper, 'center', -2);
    text(ctx, 'reasons to take another look', W / 2, 290, `italic ${font(46, 400, D)}`, C.kraft, 'center');
  },
  // 52 recap labels: an eval result slammed over each recap cut
  recapLabel(ctx, u, b, label, verdict) {
    const p = springU(u, b, SPRING.snappy);
    ctx.save(); ctx.translate(140, 190); ctx.scale(1 + (1 - p) * 0.6, 1 + (1 - p) * 0.6); ctx.globalAlpha = clamp(p * 2);
    ctx.fillStyle = 'rgba(20,20,19,0.86)'; rrect(ctx, -30, -80, 760, 150, 18); ctx.fill();
    text(ctx, label, 0, -18, font(40, 600, UI), C.cloud);
    text(ctx, verdict, 0, 46, font(60, 800, UI), verdict === 'PASS' ? C.clay : C.ivory);
    ctx.restore();
  },
  // 55 end card
  endCard(ctx, u, u0) {
    fill(ctx, '#0B0A09');
    const p = E.outCubic(clamp((u - u0) / 1.2));
    const f = font(190, 800, D);
    ctx.save(); ctx.globalAlpha = p;
    ctx.font = f; ctx.letterSpacing = '-6px';
    const w1 = ctx.measureText('Being').width;
    ctx.fillStyle = C.ivory; ctx.textAlign = 'center';
    ctx.fillText('Being', W / 2, H / 2 - 30);
    ctx.font = `italic ${font(190, 700, D)}`; ctx.fillStyle = C.clay; ctx.fillText('Tested', W / 2, H / 2 + 150);
    ctx.letterSpacing = '0px';
    ctx.restore();
  },
};
