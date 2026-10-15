// Frame-exact renderer. A film is a pure function of time: window.seek(t) paints frame t.
// Run it from the project folder that holds the film directories (<film>/index.html etc.):
//
//   node <skill>/scripts/render.mjs --film <film>                full render + <film>/audio/mix.wav
//                                                                 -> out/<film>/<film>.mp4
//   node <skill>/scripts/render.mjs --film <film> --video-only   picture only -> out/<film>/video_<format>.mp4
//                                                                 (mix.mjs masters the audio and muxes it)
//   ... --range 20:30       a span (seconds) as video, with the mix if there is one -> out/<film>/range_<a>-<b>.mp4
//   ... --contact           one frame per beat (or --every N beats, --from/--to seconds)
//                           -> out/<film>/contact.png (all) + contact_pN.png pages of 36 + phone_pN.png (half size)
//   ... --at 3.2,7.5        stills at the given times -> out/<film>/stills/
//   ... --strip 7.2:7.8:6   N evenly spaced stills in a range, tiled -> out/<film>/strip.png (--name x -> x.png)
//   ... --hits              dump the film's visual hit list -> out/<film>/hits.json
//   ... --poster [t]        one still at t (default: film.json "poster") -> out/<film>/poster.png
//
// Flags: --fps 60  --workers 6  --noblur  --keep (also write the PNG frames)  --cpu | --gpu
//        --format 9x16  16x9 (1920x1080, default) | 9x16 (1080x1920) | 1x1 (1080x1080). The page gets
//                       ?format=&w=&h= and lays itself out; outputs other than 16x9 get a _<format> suffix.
//
// WebGL: on macOS Chromium is launched on the GPU (ANGLE Metal) by default; headless Chromium otherwise
// falls back to SwiftShader, ~80x slower for three.js scenes. --cpu forces software, --gpu asks for
// the GPU elsewhere: on Linux that is ANGLE on Vulkan, which finds an NVIDIA card in a container started
// with NVIDIA_DRIVER_CAPABILITIES=all (graphics libraries mounted). The renderer in use is printed.
// 2-D-only films are unaffected either way.
// Full renders stream frames straight into ffmpeg in order: no frames/ directory, no disk wall on long
// films (a 2.5 min 1080p60 PNG sequence is ~28 GB).
//
// <film>/film.json sets "duration" (default 15) and "poster" (seconds). Output: H.264 yuv420p CRF 16.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
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
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream' };

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
    // name what's missing (Chromium's own message has no URL); the template's woff2-then-ttf font
    // fallback and the favicon are expected 404s
    page.on('response', (r) => { if (r.status() === 404 && !/\.woff2$|favicon\.ico$/.test(r.url())) console.error('[404]', decodeURIComponent(new URL(r.url()).pathname)); });
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) console.error('[console]', m.text()); });
    await page.goto(url);
    // 3-D films build their sets in init(): give them time
    await page.waitForFunction(() => window.filmReady === true, null, { timeout: 120000 });
    return page;
  }));
}
const shoot = async (page, t, file) => {
  await page.evaluate((t) => window.seek(t), t);
  return page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide', ...(file ? { path: file } : {}) });
};

// Render a list of {t, file} jobs across the worker pages.
async function renderJobs(pages, jobs) {
  let next = 0, done = 0;
  const t0 = Date.now();
  await Promise.all(pages.map(async (page) => {
    while (next < jobs.length) {
      const job = jobs[next++];
      await shoot(page, job.t, job.file);
      done++;
      if (jobs.length > 40 && done % 30 === 0) {
        const rate = done / ((Date.now() - t0) / 1000);
        process.stdout.write(`\r  ${done}/${jobs.length} frames  ${rate.toFixed(1)} fps`);
      }
    }
  }));
  if (jobs.length > 40) process.stdout.write('\n');
}

// Render frames [f0, f1) in order into a running ffmpeg's stdin. Workers run ahead at most LEAD
// frames, so memory stays flat however long the film is. --keep also writes each PNG to dir.
async function streamFrames(pages, f0, f1, ff, keepDir) {
  const n = f1 - f0, LEAD = pages.length * 6, ready = new Map();
  let nextJob = 0, nextWrite = 0, waiters = [];
  const t0 = Date.now();
  const wake = () => { const w = waiters; waiters = []; w.forEach((r) => r()); };
  let writing = Promise.resolve();
  const flush = async () => {
    while (ready.has(nextWrite)) {
      const buf = ready.get(nextWrite); ready.delete(nextWrite);
      if (keepDir) fs.writeFileSync(path.join(keepDir, `${String(f0 + nextWrite).padStart(5, '0')}.png`), buf);
      nextWrite++;
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (nextWrite % 120 === 0) {
        const rate = nextWrite / ((Date.now() - t0) / 1000);
        process.stdout.write(`\r  ${nextWrite}/${n} frames  ${rate.toFixed(1)} fps  eta ${((n - nextWrite) / rate / 60).toFixed(1)} min   `);
      }
    }
    wake();
  };
  await Promise.all(pages.map(async (page) => {
    while (nextJob < n) {
      while (nextJob - nextWrite > LEAD) await new Promise((r) => waiters.push(r));
      const i = nextJob++;
      ready.set(i, await shoot(page, (f0 + i) / FPS));
      writing = writing.then(flush);
    }
  }));
  await writing;
  process.stdout.write('\n');
}

const ENC = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
function encoder(out, audio = null) {
  const argv = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-'];
  if (audio) argv.push(...audio.input);
  argv.push(...ENC);
  argv.push(...(audio ? ['-c:a', 'aac', '-b:a', '320k', '-shortest'] : ['-an']), '-movflags', '+faststart', out);
  const ff = spawn('ffmpeg', argv, { stdio: ['pipe', 'inherit', 'inherit'] });
  ff.done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  return ff;
}

// Tile a numbered PNG sequence into one sheet; thumbnails keep the format's aspect.
function tile(pattern, start, count, cols, thumbH, file) {
  const th = thumbH, tw = Math.round((th * W) / H / 2) * 2;
  ffmpeg(['-framerate', '1', '-start_number', String(start), '-i', pattern, '-frames:v', '1',
    '-vf', `scale=${tw}:${th}:flags=area,pad=${tw + 8}:${th + 8}:4:4:0x777777,tile=${cols}x${Math.ceil(count / cols)}`, file]);
}

const beatsPath = path.join(FILM_DIR, 'beats.json');
if (!fs.existsSync(beatsPath)) {
  console.error(`${path.relative(ROOT, beatsPath)} missing: run beats.py (or the film's own audio/score.py) first`);
  process.exit(1);
}
const beats = JSON.parse(fs.readFileSync(beatsPath, 'utf8'));

const GPU = flag('cpu') ? false : flag('gpu') || process.platform === 'darwin';
const gpuArgs = process.platform === 'darwin'
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface', '--enable-gpu', '--ignore-gpu-blocklist'];
const server = await serve();
const url = `http://127.0.0.1:${server.address().port}/${FILM}/index.html` +
  `?render=1&blur=${BLUR ? 1 : 0}&fps=${FPS}&format=${FORMAT}&w=${W}&h=${H}`;
const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', ...(GPU ? gpuArgs : [])] });
const rel = (p) => path.relative(ROOT, p);
async function reportGL(page) {
  const r = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!gl) return 'none';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  console.log(`webgl: ${r}${/swiftshader/i.test(r) ? '  (software: slow for 3-D films; on macOS drop --cpu)' : ''}`);
}

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
    // One frame per beat (every N beats on long films), snapped to the frame grid the render will use.
    const all = beats.beats.filter((t) => t < DURATION);
    const every = Number(opt('every', Math.max(1, Math.ceil(all.length / 180))));
    const from = Number(opt('from', 0)), to = Number(opt('to', DURATION));
    const times = all.filter((t, i) => i % every === 0 && t >= from && t < to).map((t) => Math.round(t * FPS) / FPS);
    const jobs = times.map((t, i) => ({ t, file: path.join(dir, `b${String(i).padStart(3, '0')}.png`) }));
    const pages = await openPages(browser, url, Math.min(WORKERS, jobs.length));
    await reportGL(pages[0]);
    await renderJobs(pages, jobs);
    const cols = { '16x9': 4, '9x16': 8, '1x1': 6 }[FORMAT];
    const small = { '16x9': 270, '9x16': 384, '1x1': 320 }[FORMAT];
    const pat = path.join(dir, 'b%03d.png');
    tile(pat, 0, jobs.length, cols, jobs.length > 64 ? Math.round(small / 2) : small, path.join(OUT, `contact${SUF}.png`));
    // Pages of 36 at a size you can judge, and the same pages at half size: about a phone held at
    // arm's length. Anything unreadable on a phone page is unreadable on a phone.
    const PER = 36, pcols = { '16x9': 6, '9x16': 9, '1x1': 6 }[FORMAT], ph = { '16x9': 230, '9x16': 420, '1x1': 300 }[FORMAT];
    for (const f of fs.readdirSync(OUT)) if (new RegExp(`^(contact|phone)${SUF}_p\\d+\\.png$`).test(f)) fs.rmSync(path.join(OUT, f));
    const npages = Math.ceil(jobs.length / PER);
    for (let p = 0; p < npages; p++) {
      const n = Math.min(PER, jobs.length - p * PER);
      const page = path.join(OUT, `contact${SUF}_p${p + 1}.png`);
      tile(pat, p * PER, n, pcols, ph, page);
      ffmpeg(['-i', page, '-vf', 'scale=iw/2:-2:flags=area', path.join(OUT, `phone${SUF}_p${p + 1}.png`)]);
    }
    console.log(`contact sheet: ${jobs.length} frames (every ${every} beat${every > 1 ? 's' : ''}) -> ${rel(OUT)}/contact${SUF}.png, ` +
      `contact${SUF}_p1..${npages}.png, phone${SUF}_p1..${npages}.png`);
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
    const name = opt('name', 'strip');
    const dir = path.join(OUT, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const jobs = Array.from({ length: n }, (_, i) => {
      const t = Math.round((a + (b - a) * (n === 1 ? 0 : i / (n - 1))) * FPS) / FPS;
      return { t, file: path.join(dir, `s${String(i).padStart(3, '0')}.png`) };
    });
    const pages = await openPages(browser, url, Math.min(WORKERS, jobs.length));
    await renderJobs(pages, jobs);
    const cols = Math.min(n, FORMAT === '16x9' ? 4 : 6);
    tile(path.join(dir, 's%03d.png'), 0, n, cols, FORMAT === '16x9' ? 360 : 480, path.join(OUT, `${name}${SUF}.png`));
    console.log(`strip ${a}-${b}s x${n}: ${jobs.map((j) => j.t.toFixed(3)).join(' ')} -> ${rel(OUT)}/${name}${SUF}.png`);
  } else {
    const videoOnly = flag('video-only');
    const range = opt('range', null);
    const mixWav = path.join(FILM_DIR, 'audio', 'mix.wav');
    if (!videoOnly && !range && !fs.existsSync(mixWav)) throw new Error(`${rel(mixWav)} missing: run the film's audio step, or pass --video-only`);
    const [ra, rb] = range ? range.split(':').map(Number) : [0, DURATION];
    const f0 = Math.round(ra * FPS), f1 = Math.round(Math.min(rb, DURATION) * FPS);
    const mp4 = range ? path.join(OUT, `range${SUF}_${ra}-${rb}.mp4`)
      : videoOnly ? path.join(OUT, `video_${FORMAT}.mp4`) : path.join(OUT, `${FILM}${SUF}.mp4`);
    // a range gets the mix under it when there is one (for review); a full render without --video-only always does
    const audio = (!videoOnly && fs.existsSync(mixWav)) ? { input: ['-ss', String(ra), '-t', String((f1 - f0) / FPS), '-i', mixWav] } : null;
    const keepDir = flag('keep') ? path.join(OUT, `frames${SUF}`) : null;
    if (keepDir) { fs.rmSync(keepDir, { recursive: true, force: true }); fs.mkdirSync(keepDir, { recursive: true }); }
    console.log(`rendering ${f1 - f0} frames (${ra}-${(f1 / FPS).toFixed(2)}s) ${W}x${H} @ ${FPS}fps, ${WORKERS} workers, motion blur ${BLUR ? 'on' : 'off'}`);
    const pages = await openPages(browser, url, WORKERS);
    await reportGL(pages[0]);
    const t0 = Date.now();
    const ff = encoder(mp4, audio);
    await streamFrames(pages, f0, f1, ff, keepDir);
    ff.stdin.end();
    await ff.done;
    console.log(`-> ${rel(mp4)}  (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
  }
} finally {
  await browser.close();
  server.close();
}
