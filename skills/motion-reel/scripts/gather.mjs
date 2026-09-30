// Gather a product's real assets from its URL with Playwright: screenshots, logo, fonts, brand
// tokens, copy. Everything lands in <film>/assets/ and is listed at the end.
//
//   node <skill>/scripts/gather.mjs <url> <film> [--pages /pricing,/features]
//
// assets/shots/   desktop + mobile, viewport + full page, and one PNG per page section (2x DPR)
// assets/logo/    favicon / touch icon, header SVG or IMG logo
// assets/fonts/   @font-face files for the families the page actually uses (+ fonts.json)
// assets/brand.json  colours ranked by use (hex), font families + weights, :root custom properties
// assets/copy.md     title, description, headings, buttons, nav: the brand's own words

import fs from 'node:fs';
import path from 'node:path';
import { loadChromium } from './pw.mjs';

const chromium = await loadChromium();

const args = process.argv.slice(2);
const [url, film] = args;
if (!url || !film) { console.error('usage: gather.mjs <url> <film> [--pages /a,/b]'); process.exit(1); }
const pi = args.indexOf('--pages');
const extra = pi >= 0 ? args[pi + 1].split(',').filter(Boolean) : [];
const A = path.join(process.cwd(), film, 'assets');
for (const d of ['shots', 'logo', 'fonts']) fs.mkdirSync(path.join(A, d), { recursive: true });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';

async function settle(page) {
  // scroll through once so lazy content and scroll-triggered reveals are in their final state
  await page.evaluate(async () => {
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    scrollTo(0, 0);
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}

const browser = await chromium.launch();
const listing = [];
const note = (f, what) => listing.push([path.relative(process.cwd(), f), what]);

try {
  // ---------------- desktop pass: screenshots, sections, brand, copy, fonts, logo
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await settle(page);
  let f = path.join(A, 'shots', 'desktop_viewport.png');
  await page.screenshot({ path: f }); note(f, 'desktop 1440x900 @2x, first screen');
  f = path.join(A, 'shots', 'desktop_full.png');
  await page.screenshot({ path: f, fullPage: true }); note(f, 'desktop full page');

  // sections: the page's own building blocks, each a real, croppable piece of UI
  const sections = await page.$$eval('header, section, main > div, footer, [class*="hero" i]', (els) => {
    const seen = new Set();
    return els.map((el, i) => {
      const r = el.getBoundingClientRect();
      const h = el.querySelector('h1,h2,h3');
      return { i, top: r.top + scrollY, h: r.height, w: r.width, tag: el.tagName.toLowerCase(), title: h ? h.innerText.trim().split('\n')[0] : '' };
    }).filter((s) => s.h > 160 && s.w > 600 && !seen.has(Math.round(s.top / 40)) && seen.add(Math.round(s.top / 40)));
  });
  const handles = await page.$$('header, section, main > div, footer, [class*="hero" i]');
  let n = 0;
  for (const s of sections.slice(0, 18)) {
    const el = handles[s.i];
    f = path.join(A, 'shots', `section_${String(n++).padStart(2, '0')}_${slug(s.title || s.tag)}.png`);
    try { await el.screenshot({ path: f }); note(f, `section <${s.tag}> "${s.title}" ${Math.round(s.w)}x${Math.round(s.h)}`); } catch { /* detached */ }
  }

  const info = await page.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const hex = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return d[3] < 250 ? null : '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); };
    const count = (m, k, w = 1) => k && m.set(k, (m.get(k) || 0) + w);
    const text = new Map(), bg = new Map(), fams = new Map(), weights = new Map();
    for (const el of document.querySelectorAll('body *')) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      const area = Math.min(r.width * r.height, 2e5) / 1e4;
      if (el.childNodes.length && [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) {
        count(text, hex(s.color), 1);
        const fam = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
        count(fams, fam, 1); count(weights, `${fam} ${s.fontWeight}`, 1);
      }
      if (s.backgroundColor && !s.backgroundColor.endsWith(', 0)') && s.backgroundColor !== 'transparent') count(bg, hex(s.backgroundColor), area);
    }
    const top = (m, k = 10) => [...m.entries()].filter(([c]) => c).sort((a, b) => b[1] - a[1]).slice(0, k).map(([c, v]) => [c, Math.round(v)]);
    const vars = {};
    for (const ss of document.styleSheets) {
      let rules; try { rules = ss.cssRules; } catch { continue; }
      for (const r of rules) if (r.selectorText === ':root' || r.selectorText === ':root, :host') {
        for (const p of r.style) if (p.startsWith('--')) vars[p] = r.style.getPropertyValue(p).trim();
      }
    }
    // @font-face sources: same-origin sheets directly, cross-origin ones by href for node to fetch
    const faces = [], crossSheets = [];
    for (const ss of document.styleSheets) {
      let rules; try { rules = ss.cssRules; } catch { if (ss.href) crossSheets.push(ss.href); continue; }
      for (const r of rules) if (r instanceof CSSFontFaceRule) {
        const src = r.style.getPropertyValue('src');
        const urls = [...src.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => new URL(m[1], ss.href || location.href).href);
        faces.push({ family: r.style.getPropertyValue('font-family').replace(/["']/g, '').trim(), weight: r.style.getPropertyValue('font-weight') || '400', style: r.style.getPropertyValue('font-style') || 'normal', range: r.style.getPropertyValue('unicode-range') || '', urls });
      }
    }
    const q = (sel) => [...document.querySelectorAll(sel)].map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean);
    const logoSvg = (() => {
      const cands = [...document.querySelectorAll('header svg, nav svg, a[href="/"] svg')].filter((s) => { const r = s.getBoundingClientRect(); return r.top < 140 && r.left < innerWidth / 2 && r.width > 40; });
      return cands[0] ? cands[0].outerHTML : null;
    })();
    const logoImg = [...document.querySelectorAll('header img, nav img, a[href="/"] img')].map((i) => i.currentSrc || i.src)[0] || null;
    const homeText = (() => { const a = document.querySelector('a[href="/"]'); if (!a) return null; const s = getComputedStyle(a); return { text: a.innerText.trim(), font: s.fontFamily, weight: s.fontWeight, tracking: s.letterSpacing, html: a.innerHTML.slice(0, 400) }; })();
    const icons = [...document.querySelectorAll('link[rel*="icon"]')].map((l) => l.href);
    return {
      title: document.title, description: document.querySelector('meta[name="description"]')?.content || '',
      themeColor: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content),
      text: top(text), backgrounds: top(bg), families: top(fams, 6), weights: top(weights, 12), vars,
      faces, crossSheets, logoSvg, logoImg, homeText, icons,
      copy: { h1: q('h1'), h2: q('h2'), h3: q('h3').slice(0, 30), buttons: q('button, a[class*="btn" i], a[class*="button" i]').slice(0, 20), nav: q('nav a').slice(0, 20) },
    };
  });

  // cross-origin stylesheets (e.g. Google Fonts CSS): fetch and parse @font-face blocks
  for (const href of info.crossSheets) {
    try {
      const css = await (await fetch(href)).text();
      for (const block of css.match(/@font-face\s*{[^}]*}/g) || []) {
        const fam = /font-family:\s*['"]?([^;'"]+)/.exec(block)?.[1]?.trim();
        const urls = [...block.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => new URL(m[1], href).href);
        info.faces.push({ family: fam, weight: /font-weight:\s*([^;]+)/.exec(block)?.[1] || '400', style: /font-style:\s*([^;]+)/.exec(block)?.[1] || 'normal', range: /unicode-range:\s*([^;]+)/.exec(block)?.[1] || '', urls });
      }
    } catch { /* offline or blocked */ }
  }
  // download faces for the families the page really uses (prefer woff2). Web fonts are often
  // split by unicode-range; the "latin" subset (U+0000-00FF) is the one Latin copy needs.
  const used = new Set(info.families.map(([f]) => f));
  const fontManifest = [];
  const subsetOf = (r) => (!r ? 'all' : /U\+0+-0*FF\b/i.test(r) ? 'latin' : /U\+0100/i.test(r) ? 'latin-ext' : 'other');
  for (const face of info.faces.filter((x) => used.has(x.family))) {
    const src = face.urls.find((u) => u.includes('.woff2')) || face.urls[0];
    if (!src) continue;
    const ext = (src.match(/\.(woff2|woff|ttf|otf)/) || [, 'woff2'])[1];
    const sub = subsetOf(face.range);
    const file = path.join(A, 'fonts', `${slug(face.family)}-${slug(face.weight)}-${face.style}-${sub}-${fontManifest.length}.${ext}`);
    try {
      const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
      fs.writeFileSync(file, buf);
      fontManifest.push({ family: face.family, weight: face.weight, style: face.style, subset: sub, range: face.range, file: path.basename(file), src });
      note(file, `font ${face.family} ${face.weight} ${face.style} (${sub})`);
    } catch { /* skip */ }
  }
  fs.writeFileSync(path.join(A, 'fonts', 'fonts.json'), JSON.stringify(fontManifest, null, 1));

  // logo + icons
  if (info.logoSvg) { f = path.join(A, 'logo', 'logo.svg'); fs.writeFileSync(f, info.logoSvg); note(f, 'header SVG (check it is the logo, not an icon)'); }
  for (const [k, src] of [['logo_img', info.logoImg], ...info.icons.map((s, i) => [`icon_${i}`, s])]) {
    if (!src) continue;
    try {
      const r = await fetch(src); const ext = (r.headers.get('content-type') || '').split('/')[1]?.split(/[;+]/)[0] || 'png';
      f = path.join(A, 'logo', `${k}.${ext === 'svg' ? 'svg' : ext}`);
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); note(f, k === 'logo_img' ? 'header logo image' : 'site icon');
    } catch { /* skip */ }
  }

  const brand = {
    url, title: info.title, description: info.description, themeColor: info.themeColor,
    text_colors: info.text, background_colors: info.backgrounds, font_families: info.families,
    font_weights: info.weights, css_vars: info.vars, wordmark: info.homeText,
  };
  f = path.join(A, 'brand.json'); fs.writeFileSync(f, JSON.stringify(brand, null, 1)); note(f, 'colours (hex, ranked), fonts, css vars, wordmark');
  const c = info.copy;
  const md = [`# ${info.title}`, '', info.description, '', '## Headlines', ...c.h1.map((h) => `- (h1) ${h}`), ...c.h2.map((h) => `- (h2) ${h}`),
    '', '## Subheads', ...c.h3.map((h) => `- ${h}`), '', '## Buttons / CTAs', ...[...new Set(c.buttons)].map((b) => `- ${b}`),
    '', '## Nav', ...[...new Set(c.nav)].map((b) => `- ${b}`), ''].join('\n');
  f = path.join(A, 'copy.md'); fs.writeFileSync(f, md); note(f, 'the brand\'s own words');
  await ctx.close();

  // ---------------- mobile pass: phone UI is the most useful real screen for 9x16
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  await mp.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await settle(mp);
  f = path.join(A, 'shots', 'mobile_viewport.png'); await mp.screenshot({ path: f }); note(f, 'mobile 390x844 @3x, first screen');
  f = path.join(A, 'shots', 'mobile_full.png'); await mp.screenshot({ path: f, fullPage: true }); note(f, 'mobile full page');
  await mctx.close();

  // ---------------- extra pages
  for (const p of extra) {
    const ectx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const ep = await ectx.newPage();
    try {
      await ep.goto(new URL(p, url).href, { waitUntil: 'networkidle', timeout: 60000 });
      await settle(ep);
      f = path.join(A, 'shots', `page_${slug(p)}_viewport.png`); await ep.screenshot({ path: f }); note(f, `${p} first screen`);
      f = path.join(A, 'shots', `page_${slug(p)}_full.png`); await ep.screenshot({ path: f, fullPage: true }); note(f, `${p} full page`);
    } catch (e) { console.error(`skip ${p}: ${e.message}`); }
    await ectx.close();
  }
} finally {
  await browser.close();
}

const pad = Math.max(...listing.map(([p]) => p.length));
console.log(listing.map(([p, w]) => `${p.padEnd(pad)}  ${w}`).join('\n'));
console.log(`\n${listing.length} assets in ${path.relative(process.cwd(), A)}/`);
