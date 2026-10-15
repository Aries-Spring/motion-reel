// lab.mjs <page relative to films/> [--w 1920] [--shot out.png]: serve films/, open the page in headless Chromium, wait for
// window.DONE, print window.RESULT. e.g. node being-tested/tools/lab.mjs 'being-tested/lab/compare.html?m=shino.vrm' --shot /tmp/c.png
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');   // films/
const req = createRequire(path.join(ROOT, 'noop.js'));
const pw = await import(req.resolve('playwright')); const chromium = pw.chromium || pw.default.chromium;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.vrm': 'application/octet-stream', '.ttf': 'font/ttf', '.wav': 'audio/wav' };
const server = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r); });
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const args = process.argv.slice(2); const page_ = args[0]; const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const W = +opt('w', 1920), H = Math.round(W * 9 / 16);
const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', (m) => console.log('[console]', m.text())); page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/${page_}${page_.includes('?') ? '&' : '?'}w=${W}`);
await page.waitForFunction(() => window.DONE === true, null, { timeout: 300000 });
console.log(JSON.stringify(await page.evaluate(() => window.RESULT), null, 1));
if (opt('shot')) await page.screenshot({ path: opt('shot') });
await browser.close(); server.close();
