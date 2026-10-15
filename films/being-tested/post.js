// post.js: the film's finish. glow() is a cheap halation (a 1/8-size blurred copy screened back),
// run inside draw() so it rides the motion blur; grain() and vignette() run once per frame in post.
import * as M from './lib/motion.js';

let small = null, sctx = null, grainTiles = [];
export function initPost() {
  small = document.createElement('canvas'); small.width = M.W / 8; small.height = M.H / 8;
  sctx = small.getContext('2d');
  // seeded grain tiles (never Math.random): 6 tiles of 512 x 512 luminance noise around mid-grey
  for (let k = 0; k < 6; k++) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const c = cv.getContext('2d'), d = c.createImageData(512, 512), r = M.mulberry32(1000 + k);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 128 + (r() + r() + r() - 1.5) * 70;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
    }
    c.putImageData(d, 0, 0); grainTiles.push(cv);
  }
}

// halation: amount 0..1, threshold-free (screen of a blurred copy only lifts what is bright)
export function glow(ctx, amount = 0.35, radius = 6) {
  if (amount <= 0) return;
  sctx.filter = 'none';
  sctx.clearRect(0, 0, small.width, small.height);
  sctx.drawImage(ctx.canvas, 0, 0, small.width, small.height);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = amount;
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(small, 0, 0, M.W, M.H);
  ctx.restore();
}

export function grain(ctx, t, amount = 0.07) {
  const f = Math.floor(t * 60);
  const tile = grainTiles[f % grainTiles.length];
  const ox = Math.floor(M.hash01(f, 3) * 512), oy = Math.floor(M.hash01(f, 4) * 512);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = amount;
  for (let y = -oy; y < M.H; y += 512) for (let x = -ox; x < M.W; x += 512) ctx.drawImage(tile, x, y);
  ctx.restore();
}

let vig = null;
export function vignette(ctx, amount = 0.38) {
  if (!vig) {
    vig = ctx.createRadialGradient(M.W / 2, M.H / 2, M.H * 0.35, M.W / 2, M.H / 2, M.H * 1.05);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(10,8,6,1)');
  }
  ctx.save(); ctx.globalAlpha = amount; ctx.fillStyle = vig; ctx.fillRect(0, 0, M.W, M.H); ctx.restore();
}
