// ImageGen owns every creative edit. Sharp only crops alpha margins, resizes,
// slices continuous frame bands, and encodes them for the offline game.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { dependency, root } from './lib/dependencies.mjs';

const sharp = dependency('sharp');
const source = join(root, 'art-source/painted-failure-v2');
const output = join(root, 'public/ui/painted-failure-v2');
const generatedSources = {
  panel: '/Users/danny/.codex/generated_images/01a0a399-e2a7-7e81-b964-58027173130b/exec-9ef39ccd-717c-48c2-868e-5df3fdce1805.png',
  mascot: '/Users/danny/.codex/generated_images/01a0a399-e2a7-7e81-b964-58027173130b/exec-016662f0-911d-4f10-88d7-4d862fa6affd.png',
  'secondary-button': '/Users/danny/.codex/generated_images/01a0a399-e2a7-7e81-b964-58027173130b/exec-27bbdc37-b2b8-4475-9626-3f7389fda7a2.png',
};
mkdirSync(source, { recursive: true });
mkdirSync(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assets = {};

async function record(name, png, webp, extra = {}) {
  const meta = await sharp(png).metadata();
  assert(meta.hasAlpha, `${name}: actual transparency required`);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let alphaMin = 255, alphaMax = 0, transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    alphaMin = Math.min(alphaMin, data[i]);
    alphaMax = Math.max(alphaMax, data[i]);
    if (data[i] === 0) transparent++;
  }
  assert(alphaMin === 0 && alphaMax >= 254, `${name}: invalid alpha bounds`);
  assets[name] = { width: info.width, height: info.height,
    png: `public/ui/painted-failure-v2/${name}.png`, webp: `public/ui/painted-failure-v2/${name}.webp`,
    pngBytes: png.length, webpBytes: webp.length, pngSha256: hash(png), webpSha256: hash(webp),
    validation: { hasAlpha: true, alphaMin, alphaMax, fullyTransparentFraction: transparent / (info.width * info.height) }, ...extra };
}

async function save(name, png, extra = {}) {
  const webp = await sharp(png).webp({ quality: 94, alphaQuality: 100, effort: 6 }).toBuffer();
  writeFileSync(join(output, `${name}.png`), png);
  writeFileSync(join(output, `${name}.webp`), webp);
  await record(name, png, webp, extra);
}

for (const [name, original] of Object.entries(generatedSources)) {
  const localSource = join(source, `${name}-source.png`);
  if (!existsSync(localSource)) copyFileSync(original, localSource);
  const bytes = readFileSync(localSource);
  assert((await sharp(bytes).metadata()).hasAlpha, `${name}: source alpha required`);
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 1) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  assert(x0 > 0 && y0 > 0 && x1 < info.width - 1 && y1 < info.height - 1, `${name}: source is clipped`);
  const pad = 6;
  const crop = { left: Math.max(0, x0 - pad), top: Math.max(0, y0 - pad),
    width: Math.min(info.width, x1 + pad + 1) - Math.max(0, x0 - pad),
    height: Math.min(info.height, y1 + pad + 1) - Math.max(0, y0 - pad) };
  const png = await sharp(bytes).extract(crop).resize({ width: name === 'mascot' ? 480 : 960 })
    .extend({ top: 2, right: 2, bottom: 2, left: 2, background: '#00000000' }).png().toBuffer();
  await save(name, png, { source: `art-source/painted-failure-v2/${name}-source.png`,
    sourceSha256: hash(bytes), sourceSize: { width: info.width, height: info.height }, crop,
    transparentOutputBorder: 2 });
}

for (const extension of ['png', 'webp']) {
  copyFileSync(join(root, `public/ui/painted-settlement-v1/button.${extension}`), join(output, `button.${extension}`));
}
await record('button', readFileSync(join(output, 'button.png')), readFileSync(join(output, 'button.webp')),
  { reusedFrom: 'public/ui/painted-settlement-v1/button.{png,webp}', creativeModification: 'none; identical bytes' });

const panel = readFileSync(join(output, 'panel.png'));
const { width, height } = assets.panel;
const cuts = { header: { left: 0, top: 0, width, height: 270 },
  body: { left: 0, top: 270, width, height: height - 420 },
  footer: { left: 0, top: height - 150, width, height: 150 } };
for (const [name, crop] of Object.entries(cuts)) {
  await save(name, await sharp(panel).extract(crop).png().toBuffer(), { source: 'public/ui/painted-failure-v2/panel.png', crop });
}

const manifest = { version: 2, generation: 'OpenAI built-in image_gen. Approved sarcastic failure preview edited into separate text-free runtime assets.',
  preparation: 'Sharp alpha-bounding crop, transparent padding, proportional resize, contiguous rectangular slicing, and encoding only. Golden primary copied byte-for-byte.',
  approvedPreview: '/Users/danny/.codex/generated_images/01a0a333-7edd-7b03-be71-e0bcf67639ee/exec-bc073ae6-49a0-4c24-b2e6-74c898d7eab8.png',
  generatedSources, prompts: ['art-source/painted-failure-v2/prompts.json', 'art-source/painted-failure-v2/panel-refinement-prompt.txt'], assets,
  layout: { headerHeightToWidthRatio: 270 / width, footerHeightToWidthRatio: 150 / width,
    headerTitleSafeRegionPercent: { left: 31, top: 16, width: 51, height: 59 },
    mascotSuggestedPlacement: { leftPercent: -1, topPercentOfCardWidth: -4, widthPercent: 29 },
    bodyTextSafeRegionPercent: { left: 9, width: 82 },
    buttonLabelSafeRegionPercent: { left: 10, top: 20, width: 80, height: 60 },
    sliceRule: 'Full-width contiguous slices. Keep header/footer at natural aspect ratio; stretch only the body vertically. Separate mascot overlays upper-left. Body/CTA remain semantic DOM.',
    footerNote: 'Tiny bud is contained in footer; there is no text beneath final button.' },
  visualReview: { bakedText: 'none', mascot: 'approved identity retained: red petals, crossed leaf arms, half-lidded side-eye, raised brow and crooked smirk',
    borders: 'all art inside source canvas; alpha verified', transparentBackground: true,
    deliberatelySeparate: ['mascot', 'panel frame', 'gold primary', 'green secondary'],
    animationLimit: 'Mascot is one intact image; head tilt/bob can animate as a layer. No separately articulated eyebrow or eyelid sprite provided.' } };
writeFileSync(join(source, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(assets).map(([name, a]) => [name, { width: a.width, height: a.height, bytes: a.webpBytes, alpha: a.validation }])), null, 2));
