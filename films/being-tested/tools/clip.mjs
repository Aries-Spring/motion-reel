// clip.mjs '<motion.html query>' --out <dir>/<name> [--strip-fps 6] [--cols 6]: render the singer-only motion lab
// (lab/motion.html) frame by frame -> <name>.mp4 (for watching) + <name>_strip.png (frames at --strip-fps, tiled, for
// judging motion from stills). Run from films/. e.g.
//   node being-tested/tools/clip.mjs 't0=40&t1=43&fps=30&views=full,face,side&dir=%7B%22poses%22%3A%7B%22mic%22%3A1%7D%7D' --out /tmp/x/mic
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');   // films/
const req = createRequire(path.join(ROOT, 'noop.js'));
const pw = await import(req.resolve('playwright')); const chromium = pw.chromium || pw.default.chromium;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.vrm': 'application/octet-stream', '.ttf': 'font/ttf' };
const server = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r); });
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const args = process.argv.slice(2); const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const query = args[0], out = opt('out', '/tmp/clip'), sfps = +opt('strip-fps', 6), cols = +opt('cols', 3);
const qs = new URLSearchParams(query); const W = +(qs.get('w') || 1280), H = +(qs.get('h') || 720), fps = +(qs.get('fps') || 30);
const gpu = args.includes('--gpu') ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface', '--enable-gpu', '--ignore-gpu-blocklist'] : [];
const browser = await chromium.launch({ args: ['--font-render-hinting=none', ...gpu] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.goto(`http://127.0.0.1:${server.address().port}/being-tested/lab/motion.html?${query}`);
await page.waitForFunction(() => window.DONE === true, null, { timeout: 300000 });
const N = await page.evaluate(() => window.N);
const dir = out + '_frames'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const el = await page.$('#c');
for (let i = 0; i < N; i++) { await page.evaluate((i) => window.renderFrame(i), i); await el.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.png`) }); }
await browser.close(); server.close();
const ff = (a) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { stdio: 'inherit' }); if (r.status) throw new Error('ffmpeg ' + a.join(' ')); };
ff(['-framerate', String(fps), '-i', path.join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', out + '.mp4']);
const step = Math.max(1, Math.round(fps / sfps)), n = Math.ceil(N / step), rows = Math.ceil(n / cols), tw = Math.round(W / +opt('shrink', 2) / 2) * 2, th = Math.round(H / +opt('shrink', 2) / 2) * 2;
ff(['-i', path.join(dir, 'f%04d.png'), '-vf', `select='not(mod(n\\,${step}))',scale=${tw}:${th},pad=${tw + 4}:${th + 4}:2:2:0x777777,tile=${cols}x${rows}`, '-frames:v', '1', '-fps_mode', 'passthrough', out + '_strip.png']);
console.log(`${N} frames -> ${out}.mp4, ${out}_strip.png (every ${step} frames, ${(step / fps).toFixed(3)} s apart)`);
