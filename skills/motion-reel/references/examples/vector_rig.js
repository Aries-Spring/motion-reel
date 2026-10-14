// WORKED EXAMPLE: a character drawn entirely in code, with a 2.5-D head. An original anime-style
// singer from a music video; copy it into <film>/ and restyle (PAL, the hair data, the outfit) rather
// than starting from a blank file. Pair it with performance.js (lip sync, blinks, head motion).
//
// How it works:
//   - The head is an ellipsoid. Every point of a head layer takes its depth from it (plus the layer's
//     own offset: back hair -150, face 0, bangs +26...), is rotated by yaw/pitch and projected. So the
//     features slide, the far cheek compresses and the layers parallax: a real turn for |yaw| < ~0.4.
//   - Hair is locks: a cubic spine, a width that bellies then tapers, bent about its root by a sway
//     angle that grows toward the tip. Cel shade on the inner edge, one shared highlight band.
//   - Eyes are the expensive, expressive part: lid curves that lerp to a shut line (or a happy ^ arc),
//     a gradient iris clipped by the sclera, catchlights, a lash wing. eyeMode swaps the iris look.
//   - The mouth is a closed smile line, or an open shape set by open / wide / round (visemes).
//
// drawIdol(ctx, S) paints her in MODEL units (eye line y = 0, face centre x = 0, +y down; the bust
// spans about y -470..800). The caller sets the transform (translate/scale) first.
// S (all optional): { yaw, pitch, roll, lean, breathe,        head/body pose (radians, small)
//   blinkL, blinkR (0 open..1 shut), happy (0..1 ^^ eyes), lookX, lookY (-1..1),
//   mouth: { open 0..1, wide -1..1, round 0..1, smile -1..1 }, brow (-1 sad..1 angry), browUp (0..1),
//   blush 0..1, sway: [back, side, bangs] hair bend (radians), ahoge (radians), clipSpin,
//   eyeMode: 'normal' | 'red' | 'spark' | 'void', tear 0..1, mic (default true), t (seconds) }
// Pure: the same S always paints the same pixels.
// Placed in a 3-D set, draw her into a canvasTexture on a billboard and add the view angle to yaw
// (gl.js billboard + viewYaw): seen from an angle she turns, instead of reading as a flat cut-out.

const TAU = Math.PI * 2;
export const PAL = {
  hair: '#D97757', hairShade: '#B9583D', hairDeep: '#8E3D2A', hairHi: '#F6B08E', hairRim: '#FFDCC6', hairLine: '#5A2418',
  skin: '#FFEEE5', skinShade: '#F5CBB8', skinDeep: '#E7A691', skinLine: '#B3634D',
  white: '#FFFFFF', lash: '#2B1411', iris0: '#43130A', iris1: '#B2442A', iris2: '#FFB57C',
  mouth: '#8F2C3A', tongue: '#F08A93', lip: '#6E2522',
  hood: '#F4EFE7', hoodShade: '#DCD2C3', hoodDeep: '#C2B5A2', hoodLine: '#6B5A4E', cord: '#D97757',
  set: '#25252A', setHi: '#5A5A64',
};

// ---------------------------------------------------------------- projection
// Head = ellipsoid; each head-layer point takes its depth from it (+ the layer's offset), is rotated
// by yaw/pitch about the head centre and projected orthographically: features slide, the far cheek
// compresses, layers parallax. Reads as a real 3-D turn for |yaw| < ~0.4.
const HEAD = { cy: -40, rx: 175, ry: 255, rz: 165 };
function projector(yaw, pitch, cx = 0, cy = HEAD.cy) {
  const ca = Math.cos(yaw), sa = Math.sin(yaw), cb = Math.cos(pitch), sb = Math.sin(pitch);
  return (x, y, dz = 0, zAbs = null) => {
    let z = zAbs;
    if (z === null) {
      const q = 1 - (x / HEAD.rx) ** 2 - ((y - HEAD.cy) / HEAD.ry) ** 2;
      z = HEAD.rz * Math.sqrt(Math.max(0, q)) + dz;
    }
    const X = x - cx, Y = y - cy;
    const x1 = X * ca + z * sa, z1 = -X * sa + z * ca;
    return [x1 + cx, Y * cb + z1 * sb + cy];
  };
}

// segments: [x,y] = move/line, [c1x,c1y,c2x,c2y,x,y] = cubic; projected through pj
function path(ctx, pj, segs, dz = 0, close = true) {
  ctx.beginPath();
  segs.forEach((s, i) => {
    if (s.length === 2) { const [x, y] = pj(s[0], s[1], dz); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    else { const a = pj(s[0], s[1], dz), b = pj(s[2], s[3], dz), c = pj(s[4], s[5], dz); ctx.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]); }
  });
  if (close) ctx.closePath();
}
const flip = (s) => s.map((v, i) => (i % 2 === 0 ? -v : v));
// right half (top centre -> down the right side -> bottom centre) mirrored into a closed outline
function sym(right) {
  const out = right.slice();
  for (let i = right.length - 1; i > 0; i--) {
    const cur = flip(right[i]), prev = flip(right[i - 1]);
    const end = prev.length === 2 ? prev : prev.slice(4);
    out.push(cur.length === 2 ? end : [cur[2], cur[3], cur[0], cur[1], end[0], end[1]]);
  }
  return out;
}
const lerp = (a, b, t) => a + (b - a) * t;
const lerpSeg = (A, B, t) => A.map((s, i) => s.map((v, j) => lerp(v, B[i][j], t)));
const bez = (p0, p1, p2, p3, s) => {
  const m = 1 - s;
  return [m * m * m * p0[0] + 3 * m * m * s * p1[0] + 3 * m * s * s * p2[0] + s * s * s * p3[0],
    m * m * m * p0[1] + 3 * m * m * s * p1[1] + 3 * m * s * s * p2[1] + s * s * s * p3[1]];
};

// ---------------------------------------------------------------- hair locks
// A lock: cubic spine root->tip, width w0 at the root tapering to a point (taper exponent), bent
// about its root by `sway` (growing toward the tip, so it reads as a flexible strand).
function lockPts(pj, L, sway, dz) {
  const N = 18, pts = [];
  const [p0, p1, p2, p3] = L.spine;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    let [x, y] = bez(p0, p1, p2, p3, s);
    const a = sway * s ** 1.7;
    const dx = x - p0[0], dy = y - p0[1];
    pts.push([p0[0] + dx * Math.cos(a) - dy * Math.sin(a), p0[1] + dx * Math.sin(a) + dy * Math.cos(a)]);
  }
  const left = [], right = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    // belly: locks swell a little below the root before they taper (reads as a clump, not a wedge)
    const w = L.w0 * (1 - s ** (L.taper ?? 1.5)) * (1 + (L.belly ?? 0.25) * Math.sin(Math.PI * Math.min(1, s * 1.6))) / 2;
    const k = L.hook ?? 0;   // hook: the tip curls to one side
    const wl = w * (1 + k * s), wr = w * (1 - k * s);
    left.push(pj(pts[i][0] + nx * wl, pts[i][1] + ny * wl, dz));
    right.push(pj(pts[i][0] - nx * wr, pts[i][1] - ny * wr, dz));
  }
  return { left, right, spine: pts.map((p) => pj(p[0], p[1], dz)) };
}
function smoothPoly(ctx, P, close = true) {
  ctx.beginPath();
  ctx.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length - 1; i++) ctx.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
  ctx.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
  if (close) ctx.closePath();
}
function drawLock(ctx, pj, L, sway, dz, o = {}) {
  const { left, right, spine } = lockPts(pj, L, sway, dz);
  const outline = left.concat(right.slice().reverse());
  ctx.save();
  smoothPoly(ctx, outline);
  ctx.fillStyle = o.fill || PAL.hair; ctx.fill();
  ctx.clip();
  // cel shadow: the inner half of the lock toward the tip (light comes from upper left)
  if (o.shade !== false) {
    const edge = (L.shadeSide ?? 1) > 0 ? right : left;
    const from = L.shadeFrom ?? 6;
    ctx.beginPath();
    ctx.moveTo(spine[from][0], spine[from][1]);
    for (let i = from; i < edge.length; i++) ctx.lineTo(edge[i][0], edge[i][1]);
    for (let i = spine.length - 1; i >= from; i--) {
      const k = (i - from) / (spine.length - from);
      const m = 0.15 + 0.25 * Math.sin(Math.PI * k);
      ctx.lineTo(lerp(spine[i][0], edge[i][0], -m), lerp(spine[i][1], edge[i][1], -m));
    }
    ctx.closePath();
    ctx.fillStyle = o.shadeCol || PAL.hairShade; ctx.fill();
  }
  if (o.band) o.band(ctx);   // a highlight band shared by a group of locks (clipped to each)
  ctx.restore();
  if (o.line !== false) {
    if (o.openRoot) {
      const k = o.openRoot;
      smoothPoly(ctx, left.slice(k).concat(right.slice(k).reverse()), false);
    } else smoothPoly(ctx, outline);
    ctx.lineWidth = o.lw ?? 3.4; ctx.lineJoin = 'round'; ctx.strokeStyle = PAL.hairLine; ctx.stroke();
  }
  return spine;
}

// Bangs: side-swept from a part at x = +36, with a long strand between the eyes.
const BANGS = [
  { spine: [[-120, -330], [-176, -190], [-198, -70], [-184, 40]], w0: 84, taper: 1.3, hook: 0.3, shadeSide: 1 },
  { spine: [[-70, -350], [-116, -230], [-140, -130], [-140, -38]], w0: 100, hook: 0.45, shadeSide: 1 },
  { spine: [[-20, -360], [-50, -250], [-82, -150], [-92, -70]], w0: 104, hook: 0.35, shadeSide: 1 },
  { spine: [[20, -364], [0, -240], [-18, -100], [-6, 6]], w0: 64, taper: 1.2, hook: -0.2, shadeSide: -1, belly: 0.1 },
  { spine: [[46, -364], [66, -250], [88, -160], [84, -84]], w0: 100, hook: -0.4, shadeSide: -1 },
  { spine: [[84, -350], [128, -230], [152, -130], [148, -46]], w0: 92, hook: -0.45, shadeSide: -1 },
  { spine: [[120, -330], [176, -196], [198, -70], [186, 36]], w0: 80, taper: 1.3, hook: -0.3, shadeSide: -1 },
];
const WISPS = [
  { spine: [[-70, -300], [-100, -190], [-112, -90], [-110, 0]], w0: 22, taper: 1.1, belly: 0 },
  { spine: [[64, -310], [102, -190], [116, -90], [118, -4]], w0: 20, taper: 1.1, belly: 0 },
  { spine: [[-24, -320], [-36, -200], [-42, -120], [-52, -40]], w0: 18, taper: 1.1, belly: 0 },
];
// Long side locks in front of the ears, falling over the shoulders.
const SIDE = [
  { spine: [[-152, -190], [-214, -40], [-214, 210], [-246, 500]], w0: 96, taper: 1.15, hook: 0.2, shadeSide: 1, belly: 0.15 },
  { spine: [[-140, -130], [-176, 30], [-160, 250], [-186, 420]], w0: 50, taper: 1.2, shadeSide: -1, belly: 0.1 },
  { spine: [[152, -190], [214, -40], [214, 210], [246, 500]], w0: 96, taper: 1.15, hook: -0.2, shadeSide: -1, belly: 0.15 },
  { spine: [[140, -130], [176, 30], [160, 250], [186, 420]], w0: 50, taper: 1.2, shadeSide: 1, belly: 0.1 },
];

// ---------------------------------------------------------------- small pieces

// The spark: an 8-armed asterisk with tapered arms (her emblem).
export function asterisk(ctx, x, y, r, rot = 0, arms = 8, color = '#fff', thick = 0.3) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * TAU, px = Math.cos(a), py = Math.sin(a), nx = -py, ny = px, w = r * thick * 0.5;
    ctx.moveTo(nx * w, ny * w);
    ctx.quadraticCurveTo(px * r * 0.6 + nx * w * 0.9, py * r * 0.6 + ny * w * 0.9, px * r, py * r);
    ctx.quadraticCurveTo(px * r * 0.6 - nx * w * 0.9, py * r * 0.6 - ny * w * 0.9, -nx * w, -ny * w);
  }
  ctx.fillStyle = color; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r * thick * 0.8, 0, TAU); ctx.fill();
  ctx.restore();
}

// One eye. side = +1 (screen right) or -1; local x points to the outer corner.
function eye(ctx, pj, side, S) {
  const cx = 84 * side, cy = 2;
  const P = (x, y) => [cx + x * side, cy + y];
  const L = (arr) => arr.map((s) => { const o = []; for (let i = 0; i < s.length; i += 2) o.push(...P(s[i], s[i + 1])); return o; });
  const blink = Math.min(1, Math.max(side > 0 ? S.blinkL || 0 : S.blinkR || 0, S.happy || 0));
  const open = 1 - blink;
  const UP = [[-54, -4], [-48, -60, 20, -82, 62, -38]];
  const SHUT = [[-52, 22], [-30, 40, 30, 42, 60, 16]];
  const HAPPY = [[-50, 28], [-30, -16, 30, -22, 58, 20]];
  const LOW = [[58, 24], [44, 70, -30, 72, -50, 16]];
  const shutLine = lerpSeg(SHUT, HAPPY, S.happy || 0);
  if (open < 0.1) {
    path(ctx, pj, L(shutLine), 6, false);
    ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.strokeStyle = PAL.lash; ctx.stroke();
    const e = P(60, shutLine[1][5]);
    const [ex, ey] = pj(e[0], e[1], 6), [fx, fy] = pj(e[0] + 14 * side, e[1] + ((S.happy || 0) > 0.5 ? 10 : -8), 6);
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(fx, fy); ctx.lineWidth = 5; ctx.stroke();
    return;
  }
  const up = lerpSeg(UP, shutLine, 1 - open);
  const scl = L([...up, ...LOW]);
  ctx.save();
  path(ctx, pj, scl, 6);
  ctx.fillStyle = PAL.white; ctx.fill();
  ctx.clip();
  const mode = S.eyeMode || 'normal';
  const lx = (S.lookX || 0) * 13, ly = (S.lookY || 0) * 9;
  const ic = P(4, 10);
  const [ix, iy] = pj(ic[0] + lx, ic[1] + ly, 12);
  const irx = 42, iry = 56;
  const g = ctx.createLinearGradient(ix, iy - iry, ix, iy + iry);
  if (mode === 'red') { g.addColorStop(0, '#250206'); g.addColorStop(0.5, '#B0101C'); g.addColorStop(1, '#FF6A52'); }
  else if (mode === 'void') { g.addColorStop(0, '#050507'); g.addColorStop(1, '#2A2A33'); }
  else { g.addColorStop(0, PAL.iris0); g.addColorStop(0.42, PAL.iris1); g.addColorStop(1, PAL.iris2); }
  ctx.beginPath(); ctx.ellipse(ix, iy, irx, iry, 0, 0, TAU); ctx.fillStyle = g; ctx.fill();
  // iris texture: faint radial streaks
  ctx.save(); ctx.beginPath(); ctx.ellipse(ix, iy, irx, iry, 0, 0, TAU); ctx.clip();
  ctx.strokeStyle = mode === 'red' ? 'rgba(255,170,150,0.25)' : 'rgba(255,220,190,0.22)'; ctx.lineWidth = 2;
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU;
    ctx.beginPath(); ctx.moveTo(ix + Math.cos(a) * irx * 0.4, iy + 4 + Math.sin(a) * iry * 0.4); ctx.lineTo(ix + Math.cos(a) * irx, iy + Math.sin(a) * iry); ctx.stroke();
  }
  ctx.restore();
  if (mode === 'red') {
    ctx.beginPath(); ctx.ellipse(ix, iy + 4, irx * 0.62, iry * 0.62, 0, 0, TAU); ctx.lineWidth = 3.5; ctx.strokeStyle = '#FFA585'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(ix, iy + 4, 6, iry * 0.52, 0, 0, TAU); ctx.fillStyle = '#12010A'; ctx.fill();
  } else {
    ctx.beginPath(); ctx.ellipse(ix, iy + 2, 17, 25, 0, 0, TAU); ctx.fillStyle = mode === 'void' ? '#000' : '#300B06'; ctx.fill();
    const gg = ctx.createRadialGradient(ix, iy + iry * 0.7, 2, ix, iy + iry * 0.7, irx * 1.1);
    gg.addColorStop(0, 'rgba(255,220,176,0.85)'); gg.addColorStop(1, 'rgba(255,220,176,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(ix, iy, irx, iry, 0, 0, TAU); ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(ix, iy, irx, iry, 0, 0, TAU);
  ctx.lineWidth = 3.4; ctx.strokeStyle = mode === 'red' ? '#1A0204' : '#3A1108'; ctx.stroke();
  // the upper lid casts a soft cel shadow on the eyeball
  path(ctx, pj, L(up), 6, false);
  ctx.lineWidth = 22; ctx.strokeStyle = 'rgba(110,60,90,0.20)'; ctx.stroke();
  // highlights: big soft oval, small dot, the asterisk spark
  ctx.fillStyle = '#fff';
  if (mode === 'void') {
    // no light in them: one thin clay ring, no catchlights
    ctx.beginPath(); ctx.ellipse(ix, iy + 2, irx * 0.55, iry * 0.55, 0, 0, TAU); ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(217,119,87,0.7)'; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.ellipse(ix - 15 * side, iy - 22, 12.5, 17, -0.45 * side, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ix + 16 * side, iy + 30, 6.5, 6, 0, 0, TAU); ctx.fill();
  }
  if (mode !== 'void') {
    const tw = 0.85 + 0.15 * Math.sin((S.t || 0) * 4.3 + side);
    asterisk(ctx, ix + 17 * side, iy - 26, 10.5 * tw * (mode === 'spark' ? 1.7 : 1), (S.t || 0) * 0.5, 8, '#fff', 0.36);
  }
  ctx.restore();
  // upper lash line: thick, heavier toward the outer corner, with a wing
  const upL = L(up);
  path(ctx, pj, upL, 6, false);
  ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.strokeStyle = PAL.lash; ctx.stroke();
  const [, c1y, , c2y, ex, ey] = up[1];
  path(ctx, pj, L([[up[0][0] + 26, lerp(up[0][1], c1y, 0.6) - 4], [lerp(up[0][0], ex, 0.55), c2y + 2, ex - 14, ey - 18, ex, ey - 4]]), 6, false);
  ctx.lineWidth = 10; ctx.stroke();
  const o = P(ex, ey);
  const [ox, oy] = pj(o[0], o[1], 6), [fx, fy] = pj(o[0] + 20 * side, o[1] - 6, 6), [f2x, f2y] = pj(o[0] + 6 * side, o[1] + 14, 6);
  ctx.beginPath(); ctx.moveTo(ox - 4 * side, oy - 7); ctx.quadraticCurveTo(ox + 8 * side, oy - 9, fx, fy); ctx.lineTo(f2x, f2y); ctx.closePath();
  ctx.fillStyle = PAL.lash; ctx.fill();
  // lower lash: a short stroke at the outer bottom + a soft lower-lid line
  path(ctx, pj, L([[54, 32], [46, 56, 26, 66, 6, 68]]), 6, false);
  ctx.lineWidth = 3.2; ctx.strokeStyle = PAL.lash; ctx.globalAlpha = 0.9; ctx.stroke(); ctx.globalAlpha = 1;
  // double-lid crease
  if (open > 0.5) {
    path(ctx, pj, L([[-10, -86 + (1 - open) * 34], [12, -94, 44, -84, 64, -56]]), 6, false);
    ctx.lineWidth = 2.6; ctx.strokeStyle = PAL.skinLine; ctx.globalAlpha = 0.65; ctx.stroke(); ctx.globalAlpha = 1;
  }
  // a tear on the lower lid
  if ((S.tear || 0) > 0.01 && side < 0) {
    const [tx, ty] = pj(P(10, 70)[0], P(10, 70)[1] + S.tear * 60, 10);
    ctx.beginPath(); ctx.moveTo(tx, ty - 16); ctx.quadraticCurveTo(tx + 9, ty, tx, ty + 8); ctx.quadraticCurveTo(tx - 9, ty, tx, ty - 16);
    ctx.fillStyle = 'rgba(190,230,255,0.9)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(80,120,160,0.6)'; ctx.stroke();
  }
}

function brows(ctx, pj, S) {
  const b = S.brow || 0, up = (S.browUp || 0) * 16;
  for (const side of [-1, 1]) {
    const P = (x, y) => [84 * side + x * side, y];
    const inner = -104 - up + b * 12, mid = -122 - up - b * 2, outer = -110 - up * 0.6 - b * 4;
    path(ctx, pj, [P(-46, inner), [...P(-20, mid), ...P(30, mid - 2), ...P(62, outer)]], 30, false);
    ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.strokeStyle = PAL.hairLine; ctx.globalAlpha = 0.92; ctx.stroke(); ctx.globalAlpha = 1;
  }
}

function mouthShape(ctx, pj, S) {
  const m = S.mouth || {};
  const open = Math.max(0, Math.min(1, m.open || 0)), wide = m.wide || 0, round = m.round || 0, smile = m.smile ?? 0.4;
  const y0 = 150;
  const w = 22 + 13 * wide - 10 * round + 6 * open;
  const h = 3 + 50 * open * (1 - 0.15 * wide);
  if (open < 0.06) {
    const c = smile * 10;
    path(ctx, pj, [[-w, y0 - c * 0.4], [-w * 0.4, y0 + c, w * 0.4, y0 + c, w, y0 - c * 0.4]], 8, false);
    ctx.lineWidth = 3.8; ctx.lineCap = 'round'; ctx.strokeStyle = PAL.lip; ctx.stroke();
    return;
  }
  const top = y0 - 2 - smile * 2 - round * h * 0.25, bot = y0 + h, cy0 = y0 - smile * 4;
  const segs = [[-w, cy0], [-w * 0.6, top - round * 6, w * 0.6, top - round * 6, w, cy0],
    [w * (1 - 0.1 * round), y0 + h * 0.55, w * 0.62, bot, 0, bot], [-w * 0.62, bot, -w * (1 - 0.1 * round), y0 + h * 0.55, -w, cy0]];
  ctx.save();
  path(ctx, pj, segs, 8);
  ctx.fillStyle = PAL.mouth; ctx.fill();
  ctx.clip();
  const [tx, ty] = pj(0, bot + 6, 8);
  ctx.beginPath(); ctx.ellipse(tx, ty, w * 0.8, h * 0.45, 0, 0, TAU); ctx.fillStyle = PAL.tongue; ctx.fill();
  if (h > 12) {
    const [ax, ay] = pj(-w, top - 6, 8), [bx, by] = pj(w, top + 8, 8);
    ctx.fillStyle = '#fff'; ctx.fillRect(Math.min(ax, bx), ay, Math.abs(bx - ax), by - ay);
  }
  ctx.restore();
  path(ctx, pj, segs, 8);
  ctx.lineWidth = 3.4; ctx.lineJoin = 'round'; ctx.strokeStyle = PAL.lip; ctx.stroke();
}

// ---------------------------------------------------------------- the whole figure

export function drawIdol(ctx, S = {}) {
  const yaw = S.yaw || 0, pitch = S.pitch || 0, roll = S.roll || 0;
  const sway = S.sway || [0, 0, 0];
  const t = S.t || 0, breathe = S.breathe || 0;
  const bodyPj = projector(yaw * 0.22, 0, 0, 300);
  const B = (x, y) => bodyPj(x, y, 0, 40);
  const pj = projector(yaw, pitch);

  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.translate(0, 900); ctx.rotate(S.lean || 0); ctx.translate(0, -900);
  const headTx = () => { ctx.translate(0, 210); ctx.rotate(roll); ctx.translate(0, -210 - breathe * 3); };

  // ---- back hair: one mass behind head and shoulders, tips swaying
  ctx.save(); headTx();
  {
    const sw = sway[0];
    const tip = (x, y, k) => { const a = sw * k; return [x * Math.cos(a) - (y + 200) * Math.sin(a) * 0.15 + sw * 120 * k, y]; };
    const R = [[0, -410], [180, -410, 250, -250, 248, -60], [250, 160, 290, 380, ...tip(300, 600, 0.8)],
      [...tip(280, 650, 0.9), ...tip(268, 700, 1), ...tip(262, 770, 1)], [...tip(232, 720, 1), ...tip(210, 700, 1), ...tip(196, 740, 1)],
      [...tip(170, 700, 1), ...tip(140, 690, 1), ...tip(120, 760, 1)], [...tip(90, 700, 1), ...tip(40, 700, 1), ...tip(0, 770, 1)]];
    const back = sym(R);
    path(ctx, pj, back, -150);
    ctx.fillStyle = PAL.hairShade; ctx.fill();
    ctx.save(); ctx.clip();
    // inner shadow toward the middle (the hair is in the head's shadow)
    path(ctx, pj, [[-170, -100], [-120, 200, -110, 500, -90, 800], [90, 800], [110, 500, 120, 200, 170, -100]], -150);
    ctx.fillStyle = PAL.hairDeep; ctx.fill();
    // strand lines
    ctx.strokeStyle = PAL.hairDeep; ctx.lineWidth = 3;
    for (const x of [-230, -190, 190, 230]) {
      path(ctx, pj, [[x * 0.7, -100], [x, 150, x * 1.08, 400, ...tip(x * 1.1, 680, 1)]], -150, false); ctx.stroke();
    }
    ctx.restore();
    path(ctx, pj, back, -150); ctx.lineWidth = 3.6; ctx.strokeStyle = PAL.hairLine; ctx.stroke();
  }
  ctx.restore();

  // ---- body: hoodie, hood, neck
  ctx.save();
  ctx.translate(0, breathe * 4);
  const body = [[0, 300], [80, 300, 150, 318, 260, 370], [350, 410, 392, 520, 408, 820], [-408, 820], [-392, 520, -350, 410, -260, 370], [-150, 318, -80, 300, 0, 300]];
  path(ctx, B, body);
  ctx.fillStyle = PAL.hood; ctx.fill();
  ctx.save(); ctx.clip();
  path(ctx, B, [[-420, 480], [-330, 460, -300, 600, -290, 820], [-420, 820]]); ctx.fillStyle = PAL.hoodShade; ctx.fill();
  path(ctx, B, [[420, 470], [340, 470, 318, 620, 306, 820], [420, 820]]); ctx.fillStyle = PAL.hoodShade; ctx.fill();
  // fold lines
  ctx.strokeStyle = PAL.hoodDeep; ctx.lineWidth = 2.6;
  path(ctx, B, [[-250, 560], [-235, 640, -232, 720, -238, 820]], 0, false); ctx.stroke();
  path(ctx, B, [[236, 580], [226, 660, 228, 740, 232, 820]], 0, false); ctx.stroke();
  ctx.strokeStyle = PAL.hoodLine; ctx.lineWidth = 2.8;
  path(ctx, B, [[-240, 380], [-275, 470, -290, 600, -296, 820]], 0, false); ctx.stroke();
  path(ctx, B, [[240, 380], [275, 470, 290, 600, 296, 820]], 0, false); ctx.stroke();
  ctx.restore();
  path(ctx, B, body); ctx.lineWidth = 4; ctx.strokeStyle = PAL.hoodLine; ctx.stroke();
  // hood bunched behind the neck
  const hood = [[-196, 352], [-186, 262, -86, 236, 0, 236], [86, 236, 186, 262, 196, 352], [130, 380, 60, 390, 0, 390], [-60, 390, -130, 380, -196, 352]];
  path(ctx, B, hood); ctx.fillStyle = PAL.hoodShade; ctx.fill(); ctx.lineWidth = 3.4; ctx.strokeStyle = PAL.hoodLine; ctx.stroke();
  path(ctx, B, [[-150, 330], [-120, 280, -50, 266, 0, 266], [50, 266, 120, 280, 150, 330]], 0, false); ctx.lineWidth = 2.4; ctx.strokeStyle = PAL.hoodDeep; ctx.stroke();
  // neck
  const neck = [[-48, 150], [48, 150], [46, 240, 52, 300, 60, 340], [20, 362, -20, 362, -60, 340], [-52, 300, -46, 240, -48, 150]];
  path(ctx, B, neck); ctx.fillStyle = PAL.skin; ctx.fill();
  ctx.save(); path(ctx, B, neck); ctx.clip();
  path(ctx, B, [[-70, 150], [70, 150], [70, 236], [24, 268, -24, 268, -70, 236]]); ctx.fillStyle = PAL.skinShade; ctx.fill();
  ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = PAL.skinLine;
  path(ctx, B, [[-48, 200], [-46, 260, -52, 306, -60, 340]], 0, false); ctx.stroke();
  path(ctx, B, [[48, 200], [46, 260, 52, 306, 60, 340]], 0, false); ctx.stroke();
  // collar ribbing in front of the neck
  const collar = [[-128, 330], [-80, 372, 80, 372, 128, 330], [146, 360, 116, 422, 0, 430], [-116, 422, -146, 360, -128, 330]];
  path(ctx, B, collar); ctx.fillStyle = PAL.hood; ctx.fill(); ctx.lineWidth = 3.2; ctx.strokeStyle = PAL.hoodLine; ctx.stroke();
  // drawstrings with aglets
  for (const s of [-1, 1]) {
    const sw = Math.sin(t * 2.1 + s) * 6 + (S.lean || 0) * 90;
    path(ctx, B, [[s * 44, 412], [s * 48 + sw * 0.3, 470, s * 42 + sw * 0.7, 520, s * 46 + sw, 584]], 0, false);
    ctx.lineWidth = 10; ctx.strokeStyle = PAL.cord; ctx.stroke();
    ctx.lineWidth = 2.4; ctx.strokeStyle = PAL.hairLine; ctx.globalAlpha = 0.45; ctx.stroke(); ctx.globalAlpha = 1;
    const [ax, ay] = B(s * 46 + sw, 584);
    ctx.fillStyle = PAL.hairDeep; ctx.beginPath(); ctx.roundRect(ax - 6.5, ay - 4, 13, 28, 4); ctx.fill();
  }
  const [ex, ey] = B(-170, 600);
  asterisk(ctx, ex, ey, 38, 0.2, 8, PAL.cord, 0.3);
  ctx.restore();

  // ---- head
  ctx.save(); headTx();
  const faceR = [[0, -240], [96, -240, 166, -196, 172, -60], [176, 26, 168, 82, 148, 124], [118, 176, 62, 210, 0, 222]];
  const face = sym(faceR);
  path(ctx, pj, face, 0);
  ctx.fillStyle = PAL.skin; ctx.fill();
  ctx.save(); ctx.clip();
  const shadeX = yaw > 0 ? -1 : 1;
  ctx.globalAlpha = Math.min(0.9, Math.abs(yaw) * 2.4);
  path(ctx, pj, [[shadeX * 185, -140], [shadeX * 128, -40, shadeX * 136, 90, shadeX * 60, 240], [shadeX * 210, 240]]);
  ctx.fillStyle = PAL.skinShade; ctx.fill();
  ctx.globalAlpha = 1;
  // bangs' shadow on the forehead: a soft edge that follows the bang tips, a little lower
  {
    const edge = [[-210, 70], [-186, 60], [-164, -6], [-140, -14], [-116, -44], [-92, -48], [-60, -64], [-30, -50], [-8, 26], [14, -40], [44, -74],
      [84, -62], [116, -66], [148, -24], [172, -4], [188, 56], [212, 70]];
    const P = [pj(-212, -300, 4), ...edge.map(([x, y]) => pj(x, y, 4)), pj(212, -300, 4)];
    smoothPoly(ctx, P);
    ctx.fillStyle = PAL.skinShade; ctx.fill();
  }
  const bl = S.blush ?? 0.55;
  if (bl > 0) {
    for (const side of [-1, 1]) {
      const [bx, by] = pj(side * 102, 92, 6);
      const g = ctx.createRadialGradient(bx, by, 2, bx, by, 50);
      g.addColorStop(0, `rgba(255,124,118,${0.6 * bl})`); g.addColorStop(1, 'rgba(255,124,118,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bx, by, 56, 28, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(230,92,88,${0.8 * bl})`; ctx.lineWidth = 2.8;
      for (let k = 0; k < 3; k++) {
        const [hx, hy] = pj(side * (84 + k * 15), 88, 8);
        ctx.beginPath(); ctx.moveTo(hx + 5, hy - 8); ctx.lineTo(hx - 5, hy + 8); ctx.stroke();
      }
    }
  }
  ctx.restore();
  path(ctx, pj, face, 0); ctx.lineWidth = 3.6; ctx.strokeStyle = PAL.skinLine; ctx.stroke();

  for (const side of [-1, 1]) {
    path(ctx, pj, [[side * 166, -14], [side * 194, -30, side * 200, 34, side * 182, 66], [side * 172, 78, side * 164, 66, side * 162, 54]], 0);
    ctx.fillStyle = PAL.skinShade; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = PAL.skinLine; ctx.stroke();
  }

  eye(ctx, pj, -1, S);
  eye(ctx, pj, 1, S);
  path(ctx, pj, [[5, 88], [3, 94, 0, 100, -4, 104]], 30, false);
  ctx.lineWidth = 3.2; ctx.strokeStyle = PAL.skinLine; ctx.stroke();
  mouthShape(ctx, pj, S);

  // crown
  const crownR = [[0, -414], [150, -414, 222, -320, 214, -170], [208, -110, 192, -78, 176, -56], [122, -200, 64, -262, 0, -266]];
  const crown = sym(crownR);
  path(ctx, pj, crown, 12);
  ctx.fillStyle = PAL.hair; ctx.fill();
  ctx.save(); path(ctx, pj, crown, 12); ctx.clip();
  // part line + strand lines radiating from it
  ctx.strokeStyle = PAL.hairShade; ctx.lineWidth = 3;
  for (const [x0, x1] of [[36, -150], [36, 190]]) {
    path(ctx, pj, [[x0, -412], [lerp(x0, x1, 0.5), -400, lerp(x0, x1, 0.9), -330, x1, -250]], 14, false); ctx.stroke();
  }
  // a broad shadow on the far side of the crown
  path(ctx, pj, [[120, -400], [200, -360, 230, -260, 214, -160], [180, -200, 150, -300, 120, -400]], 12);
  ctx.fillStyle = PAL.hairShade; ctx.fill();
  ctx.restore();
  path(ctx, pj, crown, 12); ctx.lineWidth = 3.6; ctx.strokeStyle = PAL.hairLine; ctx.stroke();

  // headset band
  const mic = S.mic !== false;
  if (mic) {
    path(ctx, pj, [[-206, -110], [-216, -340, -96, -436, 0, -436], [96, -436, 216, -340, 206, -110]], 34, false);
    ctx.lineWidth = 16; ctx.strokeStyle = PAL.set; ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = PAL.setHi; ctx.stroke();
  }

  SIDE.forEach((L, i) => drawLock(ctx, pj, L, sway[1] * (i % 2 ? 1.15 : 0.9), 36));
  WISPS.forEach((L) => drawLock(ctx, pj, L, sway[2] * 0.7, 20, { shade: false, lw: 2.4, openRoot: 4 }));
  // bangs share one highlight band (a wavy ring at the root third)
  const band = (c) => {
    // an arc across the head; the lower edge dips into each lock in points, like a real shine
    const N = 40, top = (x) => -262 + 0.0016 * x * x, bot = (x, k) => top(x) + 14 + 16 * Math.max(0, Math.sin(k * 0.95 + 0.4)) ** 3 + 6 * Math.sin(k * 2.3);
    c.beginPath();
    for (let k = 0; k <= N; k++) { const x = -220 + (k / N) * 440; const [px, py] = pj(x, top(x), 28); k ? c.lineTo(px, py) : c.moveTo(px, py); }
    for (let k = N; k >= 0; k--) { const x = -220 + (k / N) * 440; const [px, py] = pj(x, bot(x, k), 28); c.lineTo(px, py); }
    c.closePath(); c.fillStyle = PAL.hairHi; c.fill();
    c.beginPath();
    for (let k = 4; k <= 14; k++) { const x = -220 + (k / N) * 440; const [px, py] = pj(x, top(x) + 4, 28); k > 4 ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.lineWidth = 4; c.strokeStyle = PAL.hairRim; c.stroke();
  };
  BANGS.forEach((L, i) => drawLock(ctx, pj, L, sway[2] * (0.75 + 0.1 * Math.abs(i - 3)), 26, { band, openRoot: 4 }));
  brows(ctx, pj, S);

  // hair clip: the spark, pinned on her left bangs
  const [hx, hy] = pj(150, -160, 50);
  const cs = 0.35 + (S.clipSpin || 0);
  asterisk(ctx, hx, hy, 38, cs, 8, PAL.hairLine, 0.42);
  asterisk(ctx, hx, hy, 33, cs, 8, '#FFF7F0', 0.35);
  asterisk(ctx, hx, hy, 13, cs, 8, PAL.hair, 0.55);

  // ahoge
  drawLock(ctx, pj, { spine: [[14, -404], [8, -488], [86, -532], [126, -470]], w0: 28, taper: 1.15, belly: 0.1 }, S.ahoge || 0, 14, { shade: false, lw: 3 });

  if (mic) {
    const [px, py] = pj(200, -6, 44);
    ctx.beginPath(); ctx.ellipse(px, py, 30, 44, 0, 0, TAU); ctx.fillStyle = PAL.set; ctx.fill();
    ctx.beginPath(); ctx.ellipse(px, py, 19, 30, 0, 0, TAU); ctx.fillStyle = PAL.hair; ctx.fill();
    asterisk(ctx, px, py, 13, 0, 8, '#FFF7F0', 0.4);
    const [mx, my] = pj(70, 166, 64), [c1x, c1y] = pj(206, 126, 64), [c2x, c2y] = pj(140, 182, 64);
    ctx.beginPath(); ctx.moveTo(px - 6, py + 32); ctx.bezierCurveTo(c1x, c1y, c2x, c2y, mx, my);
    ctx.lineWidth = 6.5; ctx.strokeStyle = PAL.set; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(mx - 4, my, 14, 11, 0.3, 0, TAU); ctx.fillStyle = PAL.set; ctx.fill();
    ctx.beginPath(); ctx.ellipse(mx - 7, my - 3, 5.5, 3.5, 0.3, 0, TAU); ctx.fillStyle = PAL.setHi; ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}
