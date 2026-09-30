// __TITLE__: pure function of time. window.seek(t) paints frame t (see lib/motion.js).
// Timing is in beats (u) on the measured grid; docs/shotlist.md is the plan this file follows.
// This template shows the house idioms; replace its scenes with the approved shot list.
import * as M from './lib/motion.js';

const { W, H, FORMAT, E, prog, lerp, springU, springKeys, SPRING, wobble, font, layout, glyph, text, fill, cover, rrect } = M;

// Brand tokens: from assets/brand.json, confirmed with the user. One accent.
const C = { ink: '#181818', paper: '#F5F5F5', accent: '#D43F00' };
const DISPLAY = 'Display', UI = 'UI';

// Every visual accent: [beat, label, sfx, opts]. scripts/sfx.mjs puts a sound on each one,
// so picture and sound can't drift apart. sfx names: node <skill>/scripts/sfx.mjs --list
const HITS = [
  [0, 'headline word 1', 'impact'],
  [0.5, 'headline word 2', 'pop', { pitch: 'A5' }],
  [1, 'headline word 3', 'pop', { pitch: 'D6' }],
  [7.5, 'into product', 'whoosh', { len: 0.5 }],
  [8, 'product lands', 'thud'],
  [12, 'push to feature 1', 'whoosh', { len: 0.4, from: 600, to: 2400 }],
  [16, 'pan to feature 2', 'whoosh', { len: 0.4, from: 2400, to: 600, pan: 0.3 }],
  [20, 'pull back', 'tick'],
  [26, 'end card', 'impact'],
  [26.5, 'logo', 'bell', { pitch: 'D6' }],
];

// ---------------------------------------------------------------- S1 headline   (u 0..8)
// Per-format layout: portrait stacks and goes bigger, landscape sits left of centre.
const S1 = { words: ['Build', 'your', 'store.'] };
function sceneHeadline(ctx, u) {
  fill(ctx, C.paper);
  const s = FORMAT.safe;
  const size = FORMAT.pick({ '16x9': 230, '9x16': 250, '1x1': 200 });
  const f = font(size, 800, DISPLAY), track = -0.035 * size;
  const lineH = size * 0.95;
  S1.words.forEach((w, i) => {
    const L = layout(ctx, w, f, track);
    const x0 = s.x, base = s.y + size + i * lineH + (FORMAT.portrait ? s.h * 0.18 : 0);
    const u0 = HITS[i][0] - (i === 0 ? 0.25 : 0);   // the first word is already moving on frame 0
    L.glyphs.forEach((g, j) => {
      const k = springU(u, u0 + j * 0.03, SPRING.bouncy);      // each glyph a touch later: overlap
      if (k <= 0) return;
      const exit = E.inBack(prog(u, 7.4 + i * 0.05, 7.8 + i * 0.05), 1.4);
      glyph(ctx, g.ch, x0 + g.cx, base + (1 - k) * 160 - exit * (H + 200), f, i === 2 ? C.accent : C.ink, k, k);
    });
  });
}

// ---------------------------------------------------------------- S2 real product UI   (u 8..26)
// Real screenshots only: cover() crops a gathered asset; never draw invented screens.
// Portrait uses the phone screenshot in a tall card; landscape the desktop one.
function sceneProduct(ctx, u, IMG) {
  fill(ctx, C.ink);
  const s = FORMAT.safe;
  const k = springU(u, 7.7, SPRING.gentle);
  const img = FORMAT.portrait ? IMG.heroMobile : IMG.hero;
  const w = FORMAT.pick({ '16x9': s.w * 0.72, '9x16': s.w * 0.86, '1x1': s.w * 0.9 });
  const h = FORMAT.portrait ? Math.min(s.h, w * 1.9) : w * 0.62;
  const x = (W - w) / 2, y = lerp(H, s.y + (s.h - h) / 2, k);
  // the camera moves between features; each key is a spring step, so moves can overlap
  const [fx, fy, z] = springKeys(u, [[8, [0.5, 0.3, 1]], [12, [0.2, 0.25, 1.8]], [16, [0.8, 0.35, 1.8]], [20, [0.5, 0.4, 1.15]]], SPRING.gentle);
  // settle squash on landing, pivoting on the card's bottom edge
  const q = 0.04 * wobble(u - 8, 2.4, 6);
  ctx.save(); ctx.translate(W / 2, y + h); ctx.scale(1 + q, 1 - q); ctx.translate(-W / 2, -(y + h));
  rrect(ctx, x - 6, y - 6, w + 12, h + 12, 30); ctx.fillStyle = C.paper; ctx.fill();
  if (img) cover(ctx, img, x, y, w, h, { fx, fy, zoom: z, radius: 24 });
  ctx.restore();
}

// ---------------------------------------------------------------- S3 end card   (u 26..)
function sceneEnd(ctx, u) {
  fill(ctx, C.paper);
  const s = FORMAT.safe;
  const size = FORMAT.pick({ '16x9': 200, '9x16': 170, '1x1': 170 });
  const L = layout(ctx, 'brand.com', font(size, 800, DISPLAY), -0.04 * size);
  const base = FORMAT.portrait ? s.y + s.h * 0.55 : H * 0.58;
  L.glyphs.forEach((g, j) => {
    const p = E.outBack(prog(u, 26 + j * 0.04, 26.4 + j * 0.04), 1.5);
    if (p <= 0) return;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, base + L.desc + 4); ctx.clip();
    glyph(ctx, g.ch, s.x + g.cx, base + (1 - p) * (L.asc + 40), font(size, 800, DISPLAY), C.ink);
    ctx.restore();
  });
  const tp = E.outQuint(prog(u, 26.5, 26.9));
  if (tp > 0) text(ctx, 'Tagline in the brand\'s own words', s.x + 6, base + 90 + (1 - tp) * 40, font(46, 500, UI), C.ink);
}

M.film({
  fonts: [font(100, 800, DISPLAY), font(40, 500, UI)],
  images: { hero: 'assets/shots/desktop_viewport.png', heroMobile: 'assets/shots/mobile_viewport.png' },
  hits: HITS,
  draw(ctx, u, t, IMG) {
    if (u < 8) sceneHeadline(ctx, u);
    else if (u < 26) sceneProduct(ctx, u, IMG);
    else sceneEnd(ctx, u);
  },
});
