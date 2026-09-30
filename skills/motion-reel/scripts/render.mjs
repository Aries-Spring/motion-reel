// Frame-exact renderer. A film is a pure function of time: window.seek(t) paints frame t.
// Run it from the project folder that holds the film directories (<film>/index.html etc.):
//
//   node <skill>/scripts/render.mjs --film <film>                full render + <film>/audio/mix.wav
//                                                                 -> out/<film>/<film>.mp4
//   node <skill>/scripts/render.mjs --film <film> --video-only   picture only -> out/<film>/video_<format>.mp4
//                                                                 (mix.mjs masters the audio and muxes it)
//   ... --contact           one frame per measured beat -> out/<film>/contact.png (+ _a, _b halves)
//   ... --at 3.2,7.5        stills at the given times -> out/<film>/stills/
//   ... --strip 7.2:7.8:6   N evenly spaced stills in a range, tiled -> out/<film>/strip.png
//   ... --hits              dump the film's visual hit list -> out/<film>/hits.json
//   ... --poster [t]        one still at t (default: film.json "poster") -> out/<film>/poster.png
//
// Flags: --fps 60  --workers 6  --noblur  --keep (keep PNG frames)
//        --format 9x16  16x9 (1920x1080, default) | 9x16 (1080x1920) | 1x1 (1080x1080). The page gets
//                       ?format=&w=&h= and lays itself out; outputs other than 16x9 get a _<format> suffix.
//
// <film>/film.json sets "duration" (default 15) and "poster" (seconds). Output: H.264 yuv420p CRF 16.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadChromium } from './pw.mjs';

const chromium = await loadChromium();
const ROOT = process.cwd();
const FORMATS = { '16x9': [1920, 1080], '9x16': [1080, 1920], '1x1': [1080, 1080] };

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const FILM = opt('film', null);
if (!FILM || !fs.existsSync(path.join(ROOT, FILM, 'index.html'))) {
  console.error(`usage: node render.mjs --film <dir> [...]  (run from the folder that holds <dir>/index.html)`);
  process.exit(1);
}
const OUT = path.join(ROOT, 'out', FILM);
const FILM_DIR = path.join(ROOT, FILM);
const FORMAT = opt('format', '16x9');
if (!FORMATS[FORMAT]) {
  console.error(`unknown --format ${FORMAT}: use ${Object.keys(FORMATS).join(', ')}`);
  process.exit(1);
}
const [W, H] = FORMATS[FORMAT];
const SUF = FORMAT === '16x9' ? '' : `_${FORMAT}`;
const FPS = Number(opt('fps', 60));
const WORKERS = Number(opt('workers', 6));
const BLUR = !flag('noblur');

const cfgPath = path.join(FILM_DIR, 'film.json');
const CFG = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
const DURATION = Number(CFG.duration || 15);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' };

function serve() {
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function ffmpeg(argv) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${argv.join(' ')}`);
}

async function openPages(browser, url, n) {
  return Promise.all(Array.from({ length: n }, async () => {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error('[page]', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.filmReady === true, null, { timeout: 30000 });
    return page;
  }));
}

// Render a list of {t, file} jobs across the worker pages.
async function renderJobs(pages, jobs) {
  let next = 0, done = 0;
  const t0 = Date.now();
  await Promise.all(pages.map(async (page) => {
    while (next < jobs.length) {
      const job = jobs[next++];
      await page.evaluate((t) => window.seek(t), job.t);
      await page.screenshot({ path: job.file, type: 'png', animations: 'disabled', caret: 'hide' });
      done++;
      if (jobs.length > 40 && done % 60 === 0) {
        const rate = done / ((Date.now() - t0) / 1000);
        process.stdout.write(`\r  ${done}/${jobs.length} frames  ${rate.toFixed(1)} fps`);
      }
    }
  }));
  if (jobs.length > 40) process.stdout.write('\n');
}

// Tile a numbered PNG sequence into one sheet; thumbnails keep the format's aspect.
function tile(pattern, start, count, cols, thumbH, file) {
  const th = thumbH, tw = Math.round((th * W) / H / 2) * 2;
  ffmpeg(['-framerate', '1', '-start_number', String(start), '-i', pattern,
    '-vf', `scale=${tw}:${th}:flags=area,pad=${tw + 8}:${th + 8}:4:4:0x777777,tile=${cols}x${Math.ceil(count / cols)}`,
    '-frames:v', '1', file]);
}

const beatsPath = path.join(FILM_DIR, 'beats.json');
if (!fs.existsSync(beatsPath)) {
  console.error(`${path.relative(ROOT, beatsPath)} missing: run beats.py (or the film's own audio/score.py) first`);
  process.exit(1);
}
const beats = JSON.parse(fs.readFileSync(beatsPath, 'utf8'));

const server = await serve();
const url = `http://127.0.0.1:${server.address().port}/${FILM}/index.html` +
  `?render=1&blur=${BLUR ? 1 : 0}&fps=${FPS}&format=${FORMAT}&w=${W}&h=${H}`;
const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text'] });
const rel = (p) => path.relative(ROOT, p);

try {
  fs.mkdirSync(OUT, { recursive: true });

  if (flag('hits')) {
    const [page] = await openPages(browser, url, 1);
    const hits = await page.evaluate(() => window.HITS);
    // [beat, label, sfx?, opts?] -> {beat, t, label, sfx?, opts?}
    const out = hits.map(([b, label, sfx, o]) => ({
      beat: b, t: +(beats.offset + b * beats.period).toFixed(4), label,
      ...(sfx ? { sfx } : {}), ...(o ? { opts: o } : {}),
    }));
    fs.writeFileSync(path.join(OUT, 'hits.json'), JSON.stringify(out, null, 1));
    console.log(`${out.length} visual hits -> ${rel(OUT)}/hits.json`);
  } else if (flag('contact')) {
    const dir = path.join(OUT, `contact${SUF}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    // One frame per beat, snapped to the frame grid the final render will use.
    const times = beats.beats.filter((t) => t < DURATION).map((t) => Math.round(t * FPS) / FPS);
    const jobs = times.map((t, i) => ({ t, file: path.join(dir, `b${String(i).padStart(3, '0')}.png`) }));
    const pages = await openPages(browser, url, Math.min(WORKERS, jobs.length));
    await renderJobs(pages, jobs);
    const cols = { '16x9': 4, '9x16': 8, '1x1': 6 }[FORMAT];
    const small = { '16x9': 270, '9x16': 384, '1x1': 320 }[FORMAT];
    const pat = path.join(dir, 'b%03d.png');
    tile(pat, 0, jobs.length, cols, small, path.join(OUT, `contact${SUF}.png`));
    // Two halves at a larger size for close inspection.
    const half = Math.ceil(jobs.length / 2);
    tile(pat, 0, half, cols, Math.round(small * 4 / 3), path.join(OUT, `contact${SUF}_a.png`));
    tile(pat, half, jobs.length - half, cols, Math.round(small * 4 / 3), path.join(OUT, `contact${SUF}_b.png`));
    console.log(`contact sheet: ${jobs.length} beats -> ${rel(OUT)}/contact${SUF}.png, contact${SUF}_a.png, contact${SUF}_b.png`);
  } else if (opt('at', null)) {
    const dir = path.join(OUT, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    const jobs = opt('at').split(',').map(Number).map((t) => ({ t, file: path.join(dir, `t${t.toFixed(3)}${SUF}.png`) }));
    const pages = await openPages(browser, url, Math.min(WORKERS, jobs.length));
    await renderJobs(pages, jobs);
    console.log(jobs.map((j) => rel(j.file)).join('\n'));
  } else if (flag('poster')) {
    const t = Number(opt('poster', CFG.poster ?? DURATION * 0.85));
    const file = path.join(OUT, `poster${SUF}.png`);
    const pages = await openPages(browser, url, 1);
    await renderJobs(pages, [{ t: Math.round(t * FPS) / FPS, file }]);
    console.log(`poster @ ${t}s -> ${rel(file)}`);
  } else if (opt('strip', null)) {
    const [a, b, n] = opt('strip').split(':').map(Number);
    const dir = path.join(OUT, 'strip');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const jobs = Array.from({ length: n }, (_, i) => {
      const t = Math.round((a + (b - a) * (n === 1 ? 0 : i / (n - 1))) * FPS) / FPS;
      return { t, file: path.join(dir, `s${String(i).padStart(3, '0')}.png`) };
    });
    const pages = await openPages(browser, url, Math.min(WORKERS, jobs.length));
    await renderJobs(pages, jobs);
    const cols = Math.min(n, FORMAT === '16x9' ? 4 : 6);
    tile(path.join(dir, 's%03d.png'), 0, n, cols, FORMAT === '16x9' ? 360 : 480, path.join(OUT, `strip${SUF}.png`));
    console.log(`strip ${a}-${b}s x${n}: ${jobs.map((j) => j.t.toFixed(3)).join(' ')} -> ${rel(OUT)}/strip${SUF}.png`);
  } else {
    const videoOnly = flag('video-only');
    const audio = path.join(FILM_DIR, 'audio', 'mix.wav');
    if (!videoOnly && !fs.existsSync(audio)) throw new Error(`${rel(audio)} missing: run the film's audio step, or pass --video-only`);
    const dir = path.join(OUT, `frames${SUF}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const n = Math.round(DURATION * FPS);
    const jobs = Array.from({ length: n }, (_, i) => ({ t: i / FPS, file: path.join(dir, `${String(i).padStart(5, '0')}.png`) }));
    console.log(`rendering ${n} frames ${W}x${H} @ ${FPS}fps, ${WORKERS} workers, motion blur ${BLUR ? 'on' : 'off'}`);
    const pages = await openPages(browser, url, WORKERS);
    await renderJobs(pages, jobs);
    const mp4 = videoOnly ? path.join(OUT, `video_${FORMAT}.mp4`)
      : path.join(OUT, `${FILM}${SUF}.mp4`);
    const video = ['-framerate', String(FPS), '-i', path.join(dir, '%05d.png')];
    const enc = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
    if (videoOnly) ffmpeg([...video, ...enc, '-an', '-t', String(DURATION), '-movflags', '+faststart', mp4]);
    else ffmpeg([...video, '-i', audio, ...enc, '-c:a', 'aac', '-b:a', '320k', '-t', String(DURATION), '-movflags', '+faststart', mp4]);
    if (!flag('keep')) fs.rmSync(dir, { recursive: true, force: true });
    console.log(`-> ${rel(mp4)}`);
  }
} finally {
  await browser.close();
  server.close();
}
