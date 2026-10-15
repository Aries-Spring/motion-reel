// gpuprobe.mjs [--t 60,120] [--n 4]: which headless-Chromium flags give hardware WebGL on this Linux box, and how
// fast the film renders with each. Run from films/. For each flag set it prints the WebGL renderer string and
// the mean ms per seek (render mode, motion blur on) at the given times. Used on the RunPod GPU pod.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');   // films/
const req = createRequire(path.join(ROOT, 'noop.js'));
const pw = await import(req.resolve('playwright')); const chromium = pw.chromium || pw.default.chromium;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.vrm': 'application/octet-stream', '.ttf': 'font/ttf' };
const server = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r); });
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const args = process.argv.slice(2); const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const TIMES = opt('t', '60,120').split(',').map(Number), N = +opt('n', 4);
const VK = ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface', '--ignore-gpu-blocklist', '--enable-gpu'];
const SETS = [
  ['shell default', {}, ['--enable-gpu', '--ignore-gpu-blocklist']],
  ['shell vulkan', {}, VK],
  ['new-headless vulkan', { channel: 'chromium' }, VK],
  ['new-headless egl', { channel: 'chromium' }, ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu']],
  ['shell egl', {}, ['--use-gl=egl', '--ignore-gpu-blocklist', '--enable-gpu']],
];
const url = `http://127.0.0.1:${server.address().port}/being-tested/index.html?render=1&blur=1&fps=60&format=16x9&w=1920&h=1080`;
for (const [name, launch, flags] of SETS) {
  let browser;
  try {
    browser = await chromium.launch({ ...launch, args: ['--font-render-hinting=none', '--disable-lcd-text', ...flags] });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const gl = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('webgl2');
      if (!c) return 'none';
      const e = c.getExtension('WEBGL_debug_renderer_info');
      return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER);
    });
    console.log(`[${name}] webgl: ${gl}`);
    if (/swiftshader|none/i.test(gl)) { await browser.close(); continue; }
    await page.goto(url);
    await page.waitForFunction(() => window.filmReady === true, null, { timeout: 180000 });
    for (const t of TIMES) {
      await page.evaluate((t) => window.seek(t), t);
      const a = Date.now();
      for (let i = 0; i < N; i++) await page.evaluate((t) => window.seek(t), t + (i + 1) / 60);
      const ms = (Date.now() - a) / N;
      const b = Date.now(); await page.screenshot({ type: 'png' }); const shot = Date.now() - b;
      console.log(`[${name}] t=${t}: ${ms.toFixed(0)} ms/seek, screenshot ${shot} ms`);
    }
  } catch (e) { console.log(`[${name}] failed: ${String(e.message).split('\n')[0]}`); }
  await browser?.close();
}
server.close();
