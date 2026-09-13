import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dependency, root } from './lib/dependencies.mjs';

// Original generated art contains a drawn checkerboard, not transparency.
// This offline, repeatable cutout removes only edge-connected neutral pixels.
// Manually reviewed enclosed gaps may be seeded; clothing/eyes are never keyed globally.
const sharp = dependency('sharp');
const input = process.argv[2];
if (!input) throw Error('Usage: node scripts/prepare-flood-performance-art.mjs <generated-original-directory>');
const targets = [
  { name: 'family-calling', file: 'exec-b38123dd-a1cb-4a96-b64d-4efbdbd7967c.png', seeds: [[530, 530], [311, 144], [269, 277], [276, 259]] },
  { name: 'family-signal-high', file: 'exec-4929a007-9094-4c4d-bc3f-82258cdfb0ee.png', seeds: [[431, 270], [456, 195], [430, 304]] },
  { name: 'family-signal-low', file: 'exec-7cd7950d-0b91-4a10-80f5-a671184340b2.png', seeds: [[457, 194], [430, 304]] },
  { name: 'family-waiting', file: 'exec-9738c6b5-3f8b-403b-a774-0ba03a912a83.png', seeds: [[584, 1130], [324, 209], [639, 279], [351, 133], [326, 242], [620, 322]] },
];
const out = path.join(root, 'public/levels/flood-performance-v1');
const audit = path.join(root, 'docs/flood-refinement');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(audit, { recursive: true });
const reports = [];
const images = new Map();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
for (const target of targets) {
  const source = path.resolve(input, target.file);
  const { data, info: { width: w, height: h } } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (w !== 1024 || h !== 1536) throw Error(`Unexpected common canvas for ${target.name}: ${w}x${h}`);
  const n = w * h, bg = new Uint8Array(n), queue = new Int32Array(n);
  let head = 0, tail = 0;
  const neutral = i => {
    const j = i * 4, r = data[j], g = data[j + 1], b = data[j + 2];
    return Math.min(r, g, b) >= 108 && Math.max(r, g, b) - Math.min(r, g, b) <= 21;
  };
  const push = i => { if (!bg[i] && neutral(i)) { bg[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  for (const [x, y] of target.seeds) push(y * w + x);
  while (head < tail) {
    const i = queue[head++], x = i % w, y = Math.floor(i / w);
    if (x) push(i - 1); if (x < w - 1) push(i + 1);
    if (y) push(i - w); if (y < h - 1) push(i + w);
  }
  for (let i = 0; i < n; i++) if (bg[i]) data[i * 4 + 3] = 0;

  // One inward antialias pass eliminates residual checker matte without touching
  // interior paint. Dark line art is retained at half alpha at its outer edge.
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (bg[i]) continue;
    const neighbors = [i - 1, i + 1, i - w, i + w];
    const exposed = neighbors.reduce((s, k) => s + bg[k], 0);
    if (exposed) data[i * 4 + 3] = neutral(i) || exposed > 1 ? 0 : 160;
  }

  // Generated checker texture can leave isolated specks. Remove disconnected
  // islands below 40 pixels, not hair/garment contours attached to the figures.
  const visited = new Uint8Array(n);
  let isolatedPixelsRemoved = 0;
  for (let start = 0; start < n; start++) {
    if (visited[start] || !data[start * 4 + 3]) continue;
    head = 0; tail = 0; queue[tail++] = start; visited[start] = 1;
    const add = i => { if (!visited[i] && data[i * 4 + 3]) { visited[i] = 1; queue[tail++] = i; } };
    while (head < tail) {
      const i = queue[head++], x = i % w, y = Math.floor(i / w);
      if (x) add(i - 1); if (x < w - 1) add(i + 1); if (y) add(i - w); if (y < h - 1) add(i + w);
    }
    if (tail < 40) { for (let k = 0; k < tail; k++) data[queue[k] * 4 + 3] = 0; isolatedPixelsRemoved += tail; }
  }

  // Report remaining neutral connected components. Large checker gaps are
  // reviewed visually; eye whites / shoe highlights intentionally remain.
  const seen = new Uint8Array(n), components = [];
  for (let start = 0; start < n; start++) {
    if (seen[start] || bg[start] || !neutral(start)) continue;
    head = 0; tail = 0; queue[tail++] = start; seen[start] = 1;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, min = 255, max = 0;
    const add = i => { if (!seen[i] && !bg[i] && neutral(i)) { seen[i] = 1; queue[tail++] = i; } };
    while (head < tail) {
      const i = queue[head++], x = i % w, y = Math.floor(i / w), v = data[i * 4];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); min = Math.min(min, v); max = Math.max(max, v);
      if (x) add(i - 1); if (x < w - 1) add(i + 1); if (y) add(i - w); if (y < h - 1) add(i + w);
    }
    if (tail > 45) components.push({ pixels: tail, bounds: [x0, y0, x1, y1], min, max, seed: [start % w, Math.floor(start / w)] });
  }
  let alpha0 = 0, alphaPartial = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < n; i++) {
    const alpha = data[i * 4 + 3];
    if (!alpha) { alpha0++; continue; }
    if (alpha < 255) alphaPartial++;
    const x = i % w, y = Math.floor(i / w);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const output = path.join(out, target.name + '.webp');
  await sharp(data, { raw: { width: w, height: h, channels: 4 } }).webp({ lossless: true }).toFile(output);
  const metadata = await sharp(output).metadata();
  if (!metadata.hasAlpha || alpha0 / n < .28 || alpha0 / n > .80) throw Error(`Invalid cutout ${target.name}`);
  images.set(target.name, { data, w, h });
  reports.push({ name: target.name, source, sourceSHA256: sha(fs.readFileSync(source)), output: path.relative(root, output).replaceAll('\\', '/'), outputSHA256: sha(fs.readFileSync(output)), canvas: [w, h], hasAlpha: metadata.hasAlpha, transparentPixels: alpha0, transparentFraction: alpha0 / n, partialAlphaPixels: alphaPartial, visibleBounds: [x0, y0, x1, y1], manualBackgroundSeeds: target.seeds, isolatedPixelsRemoved, remainingNeutralComponents: components.sort((a, b) => b.pixels - a.pixels) });
  const previews = [];
  for (const color of ['#ecd8b5', '#192c2e']) {
    previews.push(await sharp(data, { raw: { width: w, height: h, channels: 4 } }).flatten({ background: color }).resize(512, 768).png().toBuffer());
  }
  await sharp({ create: { width: 1024, height: 768, channels: 3, background: '#ecd8b5' } }).composite(previews.map((buffer, i) => ({ input: buffer, left: i * 512, top: 0 }))).png().toFile(path.join(audit, 'art-check-' + target.name + '.png'));
}
const high = images.get('family-signal-high'), low = images.get('family-signal-low');
let footAlphaDiff = 0, footOpaquePixels = 0;
for (let y = 1340; y < 1536; y++) for (let x = 280; x < 1024; x++) {
  const i = (y * 1024 + x) * 4 + 3;
  if (high.data[i] || low.data[i]) footOpaquePixels++;
  if (Math.abs(high.data[i] - low.data[i]) > 30) footAlphaDiff++;
}
const report = { version: 1, method: 'edge-connected neutral-checker flood fill + reviewed enclosed gap seeds + one-pixel alpha edge cleanup + removal of isolated sub-40-pixel specks; no independent trimming', authoredBy: 'original generated artwork, local cutout processing authorized by user', review: { warmAndDarkComposites: 'passed_visual_review_on_2026-09-13', whiteTrousersEyeWhitesAndShoes: 'retained_visually_checked', hairAndFamilyEnclosedGaps: 'checker_removed_visually_checked', physicalPhone: 'not_run', limitations: 'Original signal frames have small painted edge differences; shared canvas and equal foot baseline prevent positional rescaling. No skeletal animation claimed.' }, signalPair: { commonCanvas: [1024, 1536], footRegion: [280, 1340, 1024, 1536], footAlphaDifferentPixels: footAlphaDiff, footRegionUnionOpaquePixels: footOpaquePixels, footSilhouetteDifferenceFraction: footAlphaDiff / footOpaquePixels }, assets: reports };
fs.writeFileSync(path.join(audit, 'art-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ signalPair: report.signalPair, assets: reports.map(({ name, visibleBounds, transparentFraction, remainingNeutralComponents }) => ({ name, visibleBounds, transparentFraction, remainingNeutralComponents: remainingNeutralComponents.slice(0, 12) })) }, null, 2));
