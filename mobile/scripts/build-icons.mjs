// App icon, Android adaptive icon, splash mark and favicon: the design's yellow app icon with an ink "C"
// and a halftone corner. Needs Playwright: PLAYWRIGHT=/path/to/node_modules/playwright node scripts/build-icons.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT ? pathToFileURL(join(process.env.PLAYWRIGHT, 'index.mjs')).href : 'playwright');

/** Halftone dots that grow towards the bottom-right corner, as one SVG. */
function dotsSvg(size) {
  const cell = size / 11;
  let circles = '';
  for (let y = cell / 2; y < size; y += cell)
    for (let x = cell / 2; x < size; x += cell) {
      const k = ((x + y) / (2 * size) - 0.5) / 0.5;
      if (k <= 0.05) continue;
      circles += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(cell * 0.44 * Math.min(1, k)).toFixed(1)}"/>`;
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" style="position:absolute;inset:0" fill="#141310">${circles}</svg>`;
}

const tile = ({ size, bg, radius = 0, letter = 0.78, dots = true }) => `
<div id="t" style="position:relative;width:${size}px;height:${size}px;background:${bg};border-radius:${radius}px;overflow:hidden">
  ${dots ? dotsSvg(size) : ''}
  <div style="position:absolute;inset:0;display:grid;place-items:center;font:900 ${size * letter}px/1 Gabarito,sans-serif;color:#141310;letter-spacing:-.04em;padding-top:${size * 0.04}px;text-shadow:0 0 0 #FFB81C">C</div>
</div>`;

const shots = [
  { file: 'icon.png', html: tile({ size: 1024, bg: '#FFB81C' }) },
  // Android draws the background colour itself and crops to the middle 66%.
  { file: 'adaptive-icon.png', html: tile({ size: 1024, bg: 'transparent', letter: 0.5, dots: false }) },
  { file: 'splash-icon.png', html: tile({ size: 512, bg: '#FFB81C', radius: 112 }) },
  { file: 'favicon.png', html: tile({ size: 64, bg: '#FFB81C', radius: 14 }) },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const s of shots) {
  await page.setContent(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gabarito:wght@900&display=block"><body style="margin:0;background:transparent">${s.html}</body>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.load('900 80px Gabarito'));
  await page.locator('#t').screenshot({ path: join(root, 'assets', s.file), omitBackground: true });
}
await browser.close();
console.log('Icons written.');
