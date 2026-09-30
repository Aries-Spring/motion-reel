// Turn a style reference (video, image, or folder of images) into something you can look at and
// measure before writing docs/style_guide.md.
//
//   node <skill>/scripts/reference.mjs <path> <film> [--threshold 0.25]
//
// video  -> <film>/docs/reference/shots.png   one frame per shot (scene-cut detection), tiled
//           <film>/docs/reference/second.png  one frame per second, tiled
//           <film>/docs/reference/cuts.json   cut times, shot lengths, cutting rate
// images -> <film>/docs/reference/sheet.png   everything tiled (max 24)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [src, film] = process.argv.slice(2);
const ti = process.argv.indexOf('--threshold');
// Scene-change score needed to call a cut. This finds HARD cuts only: match cuts, morphs, pushes
// and irises are seamless by design and won't register, so read second.png for those. Raise it if
// fast moves inside a shot get counted as cuts.
const THRESH = ti > 0 ? Number(process.argv[ti + 1]) : 0.25;
if (!src || !film) { console.error('usage: reference.mjs <video|image|folder> <film>'); process.exit(1); }
const OUT = path.join(process.cwd(), film, 'docs', 'reference');
fs.mkdirSync(OUT, { recursive: true });
const run = (cmd, argv) => spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 1 << 28 });
const ff = (argv) => { const r = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv]); if (r.status) throw new Error(r.stderr); };

const IMG = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;
const isDir = fs.statSync(src).isDirectory();

function sheet(files, out, cols = 4, w = 480, h = 270) {
  const list = path.join(OUT, '_list.txt');
  fs.writeFileSync(list, files.map((f) => `file '${path.resolve(f).replace(/'/g, "'\\''")}'\nduration 1`).join('\n'));
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-vf',
    `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:0x777777,pad=iw+8:ih+8:4:4:0x777777,tile=${cols}x${Math.ceil(files.length / cols)}`,
    '-frames:v', '1', out]);
  fs.rmSync(list);
}

if (isDir || IMG.test(src)) {
  const files = isDir ? fs.readdirSync(src).filter((f) => IMG.test(f)).sort().slice(0, 24).map((f) => path.join(src, f)) : [src];
  sheet(files, path.join(OUT, 'sheet.png'), Math.min(4, files.length), 480, 360);
  console.log(`${files.length} reference images -> ${path.relative(process.cwd(), OUT)}/sheet.png`);
} else {
  const probe = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,r_frame_rate', '-of', 'json', src]);
  const meta = JSON.parse(probe.stdout);
  const dur = Number(meta.format.duration);
  // scene cuts: frames whose scene-change score is above threshold
  const sc = run('ffmpeg', ['-hide_banner', '-i', src, '-vf', `select='gt(scene,${THRESH})',showinfo`, '-an', '-f', 'null', '-']);
  // motion blur can smear one cut over two frames: merge cuts closer than 0.1 s
  const cuts = [...sc.stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => +(+m[1]).toFixed(3))
    .filter((c, i, a) => i === 0 || c - a[i - 1] >= 0.1);
  const bounds = [0, ...cuts, dur];
  const shots = bounds.slice(1).map((b, i) => +(b - bounds[i]).toFixed(3)).filter((d) => d > 0.04);
  const sorted = [...shots].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  fs.writeFileSync(path.join(OUT, 'cuts.json'), JSON.stringify({
    source: path.resolve(src), duration: +dur.toFixed(3), threshold: THRESH,
    note: 'hard cuts only; seamless transitions (match cuts, morphs, irises) are not counted', cuts, shots,
    shot_count: shots.length, mean_shot_s: +(dur / shots.length).toFixed(3), median_shot_s: median,
    cuts_per_10s: +((cuts.length / dur) * 10).toFixed(2),
  }, null, 1));
  // one frame from the middle of each shot, then one per second
  const tmp = path.join(OUT, '_frames');
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
  const mids = bounds.slice(1).map((b, i) => (bounds[i] + b) / 2).slice(0, 40);
  mids.forEach((t, i) => ff(['-ss', String(t), '-i', src, '-frames:v', '1', '-vf', 'scale=640:-2', path.join(tmp, `s${String(i).padStart(3, '0')}.png`)]));
  const [vw, vh] = [meta.streams[0].width, meta.streams[0].height];
  sheet(fs.readdirSync(tmp).sort().map((f) => path.join(tmp, f)), path.join(OUT, 'shots.png'), 5, 384, Math.round((384 * vh) / vw / 2) * 2);
  ff(['-i', src, '-vf', `fps=1,scale=384:-2,pad=iw+8:ih+8:4:4:0x777777,tile=6x${Math.ceil(Math.min(dur, 60) / 6)}`, '-frames:v', '1', '-t', '60', path.join(OUT, 'second.png')]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${shots.length} shots in ${dur.toFixed(1)}s: median ${median}s, ${(cuts.length / dur * 10).toFixed(1)} cuts / 10s`);
  console.log(`-> ${path.relative(process.cwd(), OUT)}/shots.png, second.png, cuts.json`);
}
