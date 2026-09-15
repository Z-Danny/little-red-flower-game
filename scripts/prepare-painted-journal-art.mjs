// All creative artwork is produced by built-in ImageGen.
// Sharp performs only rectangular cropping, proportional scaling, slicing and encoding.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dependency, root } from './lib/dependencies.mjs';

const sharp = dependency('sharp');
const source = join(root, 'art-source/painted-journal-v1');
const output = join(root, 'public/ui/painted-journal-v1');
mkdirSync(output, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const assets = {};

async function save(name, png, provenance = {}) {
  const webp = await sharp(png).webp({ quality: 93, alphaQuality: 100, effort: 6 }).toBuffer();
  writeFileSync(join(output, `${name}.png`), png);
  writeFileSync(join(output, `${name}.webp`), webp);
  const metadata = await sharp(png).metadata();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let alphaMin = 255, alphaMax = 0, transparentPixels = 0;
  for (let i = 3; i < data.length; i += 4) {
    alphaMin = Math.min(alphaMin, data[i]); alphaMax = Math.max(alphaMax, data[i]);
    if (data[i] === 0) transparentPixels++;
  }
  assert(metadata.hasAlpha && alphaMin === 0 && alphaMax >= 250, `${name}: real alpha required`);
  assets[name] = { width: info.width, height: info.height,
    png: `public/ui/painted-journal-v1/${name}.png`,
    webp: `public/ui/painted-journal-v1/${name}.webp`,
    pngBytes: png.length, webpBytes: webp.length,
    pngSha256: hash(png), webpSha256: hash(webp),
    alpha: { min: alphaMin, max: alphaMax, transparentFraction: transparentPixels / (info.width * info.height) },
    ...provenance };
  return png;
}

async function crop(name, filename, region, width, padding = 6) {
  const original = readFileSync(join(source, filename));
  const bytes = region ? await sharp(original).extract(region).png().toBuffer() : original;
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = 0, bottom = 0;
  // Locate the visible silhouette; keep every original pixel inside its crop.
  // No alpha manipulation, background removal, color filters or creative painting.
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] <= 8) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const rect = { left: Math.max(0, left - padding), top: Math.max(0, top - padding),
    width: Math.min(info.width, right + padding + 1) - Math.max(0, left - padding),
    height: Math.min(info.height, bottom + padding + 1) - Math.max(0, top - padding) };
  const png = await sharp(bytes).extract(rect).resize({ width }).png().toBuffer();
  return save(name, png, { source: `art-source/painted-journal-v1/${filename}`, sourceSha256: hash(original), sheetRegion: region || null, silhouetteCrop: rect });
}

const panel = await crop('frame', 'frame-source.png', null, 960, 8);
const frameWidth = assets.frame.width, frameHeight = assets.frame.height;
const frameSlices = { 'frame-header': { left: 0, top: 0, width: frameWidth, height: 224 },
  'frame-body': { left: 0, top: 224, width: frameWidth, height: 1026 },
  'frame-footer': { left: 0, top: 1250, width: frameWidth, height: frameHeight - 1250 } };
for (const [name, region] of Object.entries(frameSlices)) await save(name, await sharp(panel).extract(region).png().toBuffer(), { source: assets.frame.png, sourceCrop: region });

const parts = {
  'stat-flowers': { region: { left: 0, top: 0, width: 768, height: 340 }, width: 640 },
  'island-sign': { region: { left: 768, top: 0, width: 768, height: 340 }, width: 640 },
  'count-tag': { region: { left: 0, top: 340, width: 768, height: 340 }, width: 384 },
  'rank-leaf': { region: { left: 768, top: 340, width: 768, height: 340 }, width: 384 },
  'tab-active': { region: { left: 0, top: 680, width: 768, height: 344 }, width: 640 },
  'tab-inactive': { region: { left: 768, top: 680, width: 768, height: 344 }, width: 640 },
};
for (const [name, { region, width }] of Object.entries(parts)) await crop(name, 'parts-source.png', region, width);
await save('stat-progress', readFileSync(join(output, 'stat-flowers.png')), { reusedFrom: assets['stat-flowers'].png, modification: 'none; same empty gold-rimmed plaque' });

// Transparent valleys between the three ImageGen islands (max alpha <= 4).
const islandRegions = {
  'island-nature': { left: 0, top: 0, width: 746, height: 724 },
  'island-public': { left: 746, top: 0, width: 712, height: 724 },
  'island-home': { left: 1458, top: 0, width: 714, height: 724 },
};
for (const [name, region] of Object.entries(islandRegions)) await crop(name, 'islands-source.png', region, 640);
await crop('avatar', 'avatar-source.png', null, 512, 8);

const manifest = {
  version: 1,
  generator: 'OpenAI built-in ImageGen',
  preparation: 'Sharp only rectangular crop, proportional resize, frame slicing and PNG/WebP encoding. Preserves generated RGBA alpha and RGB pixels; no programmatic drawing, color edits or background removal.',
  generatedOriginals: {
    frame: '/Users/danny/.codex/generated_images/01a0a3e0-80c6-7693-8caa-202b4abeb734/exec-d1631faa-c0aa-44a1-a899-e42fa3bf86a5.png',
    parts: '/Users/danny/.codex/generated_images/01a0a3e0-80c6-7693-8caa-202b4abeb734/exec-4738586b-2899-45f3-b82a-86bfe43d4799.png',
    islands: '/Users/danny/.codex/generated_images/01a0a3e0-80c6-7693-8caa-202b4abeb734/exec-35587bfc-a201-4635-bb15-d751e0261ca8.png',
    avatar: '/Users/danny/.codex/generated_images/01a0a3e0-80c6-7693-8caa-202b4abeb734/exec-02489328-a540-450c-ba48-b6419b36cd7d.png',
  },
  promptFile: 'art-source/painted-journal-v1/prompts.json',
  referenceFiles: ['art-source/painted-journal-v1/reference-progress.png', 'art-source/painted-journal-v1/reference-board.png'],
  assets,
  layout: {
    frameWidth, frameHeight,
    headerAspect: `${frameWidth} / 224`, footerAspect: `${frameWidth} / ${frameHeight - 1250}`,
    titleSafeBoxPercentOfHeader: { left: 24, top: 12, width: 52, height: 56 },
    contentSafeHorizontalPercent: { left: 8, right: 8 },
    statPlaqueTextSafePercent: { left: 12, top: 15, width: 74, height: 64 },
    islandSignTextSafePercent: { left: 18, top: 18, width: 74, height: 64 },
    rankLeafTextSafePercent: { left: 27, top: 19, width: 61, height: 60 },
    countTagTextSafePercent: { left: 12, top: 30, width: 76, height: 52 },
    tabTextSafePercent: { left: 23, top: 36, width: 62, height: 47 },
    frameRule: 'Keep header/footer at their natural ratios; stretch only body vertically, with continuous full-width slices. No bitmap text. Frame has no title flower, close or back controls.',
    islandRule: 'All source islands fully colored; runtime may reveal color over grayscale using actual category progress. No generated fake numbers, labels, cloud overlays or partial progress.',
    avatarRule: 'One compact smug flower adjusting sunglasses. Whole avatar can tilt on activation; no separate facial animation layers.',
  },
  visualValidation: { bakedText: false, fakeStatistics: false, genuineAlpha: true, avatarPose: 'one leaf lowering sunglasses, side-eye and raised brow', islands: 'three distinct irregular coastlines, fully colored; names and progress remain DOM text' },
};
writeFileSync(join(source, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(assets).map(([name, a]) => [name, { width: a.width, height: a.height, webpBytes: a.webpBytes, alpha: a.alpha }])), null, 2));
