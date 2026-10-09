// Renders the app's artwork into PNGs: every key in packages/shared/src/art.ts as
//   assets/art/cut/<key>.webp  a halftone cut-out (ink dots on a white die-cut, with its drop shadow)
//   assets/art/stk/<key>.webp  a full-colour sticker with a white outline and shadow
// plus the paper textures in assets/paper/. The look and the halftone algorithm come from the design prototype.
//
// Artwork: Twemoji (c) Twitter, Inc and other contributors, CC BY 4.0 (github.com/jdecked/twemoji).
// Needs Playwright with Chromium: PLAYWRIGHT=/path/to/node_modules/playwright node scripts/build-art.mjs [key ...]
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ART, TEXT_ART } from '../../packages/shared/src/art.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cache = join(here, '.twemoji-cache');
const out = { cut: join(root, 'assets/art/cut'), stk: join(root, 'assets/art/stk'), paper: join(root, 'assets/paper') };

// Rendered size in points; the app scales these down for smaller cut-outs. 3x for sharp phones.
const CUT = 180;
const STK = 42;
const SCALE = 3;
const TWEMOJI = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@16.0.1/assets/svg';


const exists = (p) => access(p).then(() => true, () => false);
const codepoints = (glyph, keepVs) =>
  [...glyph].map((c) => c.codePointAt(0).toString(16)).filter((c) => keepVs || c !== 'fe0f').join('-');

async function twemoji(glyph) {
  const file = join(cache, `${codepoints(glyph, false)}.svg`);
  if (await exists(file)) return readFile(file, 'utf8');
  for (const name of [codepoints(glyph, false), codepoints(glyph, true)]) {
    const res = await fetch(`${TWEMOJI}/${name}.svg`);
    if (res.ok) {
      const svg = await res.text();
      await writeFile(file, svg);
      return svg;
    }
  }
  throw new Error(`No Twemoji artwork for ${glyph}`);
}

// ---- runs in the page: the prototype's halftone, unchanged apart from its inputs ----
const PAGE_HALFTONE = `
window.halftone = async function (cv, S, artUrl, glyph) {
  const TAU = Math.PI * 2, INK = '#141310', WHITE = '#FBFAF6';
  const isText = !artUrl;
  const dpr = ${SCALE}, q = 2, N = S * q;
  const art = artUrl ? await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = artUrl; }) : null;
  const sample = (im) => {
    const c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (im) x.drawImage(im, N * .13, N * .13, N * .74, N * .74);
    else { x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#000'; x.font = '900 ' + (N * .98) + 'px Gabarito, "Arial Black", sans-serif'; x.fillText(glyph, N / 2, N / 2 + N * .06); }
    return [c, x, x.getImageData(0, 0, N, N).data];
  };
  let [src, sx, px] = sample(art);
  cv.width = cv.height = Math.round(S * dpr); cv.style.width = cv.style.height = S + 'px';
  let cover = 0, lo = 1, hi = 0, sum = 0;
  const lum = (i) => (.2126 * px[i] + .7152 * px[i + 1] + .0722 * px[i + 2]) / 255;
  const at = (x, y) => (Math.min(N - 1, Math.max(0, y * q | 0)) * N + Math.min(N - 1, Math.max(0, x * q | 0))) * 4;
  for (let i = 0; i < px.length; i += 16) if (px[i + 3] > 128) { const l = lum(i); cover++; sum += l; if (l < lo) lo = l; if (l > hi) hi = l; }
  if (cover < N * N / 4 * .03) { sx.clearRect(0, 0, N, N); sx.beginPath(); sx.arc(N / 2, N / 2, N * .36, 0, TAU); sx.fill(); px = sx.getImageData(0, 0, N, N).data; lo = hi = 0; }
  const flat = isText || hi - lo < .08, span = Math.max(.001, hi - lo), mean = cover ? (sum / cover - lo) / span : .5;
  const sil = document.createElement('canvas'); sil.width = sil.height = N;
  const sl = sil.getContext('2d'); sl.drawImage(src, 0, 0); sl.globalCompositeOperation = 'source-in'; sl.fillStyle = WHITE; sl.fillRect(0, 0, N, N);
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, S, S);
  const b = Math.max(3, S * .034);
  for (let k = 0; k < 24; k++) ctx.drawImage(sil, Math.cos(k / 24 * TAU) * b, Math.sin(k / 24 * TAU) * b, S, S);
  ctx.drawImage(sil, 0, 0, S, S);
  const cell = Math.max(2.8, S / 44), c = S / 2, cs = Math.SQRT1_2, e = cell * 1.5, t = cell * .33;
  ctx.fillStyle = INK; ctx.beginPath();
  for (let gy = -S * .3; gy < S * 1.3; gy += cell) for (let gx = -S * .3; gx < S * 1.3; gx += cell) {
    const x = c + (gx - c) * cs - (gy - c) * cs, y = c + (gx - c) * cs + (gy - c) * cs;
    if (x < 0 || y < 0 || x >= S || y >= S || px[at(x, y) + 3] < 110) continue;
    let d;
    if (flat) d = .3 + .7 * (x + y) / (2 * S);
    else {
      let l = 0, n = 0;
      for (const [dx, dy] of [[0, 0], [t, 0], [-t, 0], [0, t], [0, -t]]) { const j = at(x + dx, y + dy); if (px[j + 3] > 110) { l += lum(j); n++; } }
      d = Math.min(1, Math.max(0, .46 + (mean - (l / n - lo) / span) * 1.7));
      if (px[at(x + e, y) + 3] < 110 || px[at(x - e, y) + 3] < 110 || px[at(x, y + e) + 3] < 110 || px[at(x, y - e) + 3] < 110) d = Math.max(d, .82);
    }
    const r = cell * (.08 + .66 * Math.pow(d, .9));
    ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fill();
};`;

// The cut-out's drop shadow and the sticker's outline are CSS filters in the design; screenshots bake them in.
// PAD leaves room for them: the app draws each PNG PAD points bigger on every side.
const CUT_PAD = 10;
const STK_PAD = 6;
const PAGE = `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gabarito:wght@900&display=block">
<style>
  body { margin: 0; background: transparent; }
  .wrap { display: inline-block; padding: ${CUT_PAD}px; }
  .ht { display: block; filter: drop-shadow(0 3px 3px rgba(20,19,16,.3)); }
  .swrap { display: inline-block; padding: ${STK_PAD}px; }
  .stk { width: ${STK}px; height: ${STK}px; filter: drop-shadow(2px 0 0 #FBFAF6) drop-shadow(-2px 0 0 #FBFAF6) drop-shadow(0 2px 0 #FBFAF6) drop-shadow(0 -2px 0 #FBFAF6) drop-shadow(0 3px 2px rgba(20,19,16,.3)); }
  .stk img { display: block; width: 100%; height: 100%; }
</style></head><body>
<div class="wrap" id="cw"><canvas class="ht" id="cv"></canvas></div>
<div class="swrap" id="sw"><div class="stk"><img id="si"></div></div>
<script>${PAGE_HALFTONE}</script></body></html>`;

// Paper textures from the design's CSS (feTurbulence + diffuse lighting), as JPEG tiles.
const tex = (light, scale) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'%3E%3Cfilter id='f' filterUnits='userSpaceOnUse' x='-24' y='-24' width='1072' height='1072' color-interpolation-filters='sRGB'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.008 .011' numOctaves='3' seed='7' stitchTiles='stitch' x='0' y='0' width='1024' height='1024'/%3E%3CfeTile x='-24' y='-24' width='1072' height='1072'/%3E%3CfeDiffuseLighting lighting-color='%23${light}' surfaceScale='${scale}' diffuseConstant='1.08'%3E%3CfeDistantLight azimuth='225' elevation='68'/%3E%3C/feDiffuseLighting%3E%3C/filter%3E%3Crect x='-24' y='-24' width='1072' height='1072' filter='url(%23f)'/%3E%3C/svg%3E")`;
const texY = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='390' height='500'%3E%3Cfilter id='f' x='0' y='0' width='100%25' height='100%25' color-interpolation-filters='sRGB'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.011 .015' numOctaves='3' seed='21'/%3E%3CfeDiffuseLighting lighting-color='%23FFB81C' surfaceScale='2.200' diffuseConstant='1.08'%3E%3CfeDistantLight azimuth='225' elevation='68'/%3E%3C/feDiffuseLighting%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E")`;

async function main() {
  const only = process.argv.slice(2);
  if (only[0] === 'index') return writeIndex();
  const { chromium } = await import(process.env.PLAYWRIGHT ? pathToFileURL(join(process.env.PLAYWRIGHT, 'index.mjs')).href : 'playwright');
  for (const d of [cache, ...Object.values(out)]) await mkdir(d, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: SCALE, viewport: { width: 400, height: 400 } });
  await page.setContent(PAGE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.load('900 80px Gabarito'));

  const jobs = [
    ...Object.entries(ART).map(([key, glyph]) => ({ key, glyph, text: false })),
    ...Object.entries(TEXT_ART).map(([key, glyph]) => ({ key, glyph, text: true })),
  ].filter((j) => !only.length || only.includes(j.key));

  // Screenshots come out as PNG; WebP with alpha is a fraction of the size and React Native shows it everywhere.
  const saveWebp = async (locator, path) => {
    const png = await locator.screenshot({ omitBackground: true });
    const data = await page.evaluate(async (b64) => {
      const im = new Image();
      await new Promise((res) => { im.onload = res; im.src = 'data:image/png;base64,' + b64; });
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      c.getContext('2d').drawImage(im, 0, 0);
      return c.toDataURL('image/webp', 0.86);
    }, png.toString('base64'));
    await writeFile(path, Buffer.from(data.split(',')[1], 'base64'));
  };

  for (const { key, glyph, text } of jobs) {
    const url = text ? null : `data:image/svg+xml,${encodeURIComponent(await twemoji(glyph))}`;
    await page.evaluate(({ url, glyph, size }) => window.halftone(document.getElementById('cv'), size, url, glyph), { url, glyph, size: CUT });
    await saveWebp(page.locator('#cw'), join(out.cut, `${key}.webp`));
    if (!text) {
      await page.evaluate((u) => new Promise((res) => { const im = document.getElementById('si'); im.onload = res; im.src = u; }), url);
      await saveWebp(page.locator('#sw'), join(out.stk, `${key}.webp`));
    }
    process.stdout.write('.');
  }

  if (!only.length || only.includes('paper')) {
    const shot = async (name, css, w, h) => {
      await page.setViewportSize({ width: w, height: h });
      // In a <style> block: the textures are url("…") values, which would end a style="" attribute early.
      await page.setContent(`<style>body{margin:0}#p{width:${w}px;height:${h}px;${css}}</style><div id="p"></div>`);
      await page.waitForTimeout(300);
      await page.locator('#p').screenshot({ path: join(out.paper, name), type: 'jpeg', quality: 82, scale: 'css' });
    };
    await shot('ground-light.jpg', `background:#F4F4F1 ${tex('F4F4F1', '3.200')} 0 0/1024px 1024px`, 1024, 1024);
    await shot('ground-dark.jpg', `background:#161512 ${tex('1C1B17', '4')} 0 0/1024px 1024px`, 1024, 1024);
    await shot('yellow.jpg', `background:#FFB81C ${texY} center/cover no-repeat`, 390, 500);
  }

  await browser.close();
  await writeIndex();
  console.log(`\nRendered ${jobs.length} artworks.`);
}

/** src/ui/art-assets.ts: static requires, so Metro bundles every artwork. */
async function writeIndex() {
  const line = (dir, key) => `  ${/^[a-z]\w*$/.test(key) ? key : `'${key}'`}: require('../../assets/art/${dir}/${key}.webp'),`;
  const keys = Object.keys(ART);
  const src = [
    '// Generated by scripts/build-art.mjs. Do not edit by hand.',
    '/* eslint-disable */',
    'export const CUT_ASSETS = {',
    ...[...keys, ...Object.keys(TEXT_ART)].map((k) => line('cut', k)),
    '} as const;',
    '',
    'export const STICKER_ASSETS = {',
    ...keys.map((k) => line('stk', k)),
    '} as const;',
    '',
  ].join('\n');
  await writeFile(join(root, 'src/ui/art-assets.ts'), src);
}

await main();
