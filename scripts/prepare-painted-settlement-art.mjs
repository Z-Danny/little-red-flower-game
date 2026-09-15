// Build responsive completion-modal artwork from the approved ImageGen edit.
// Sharp is limited to alpha-bound crop, transparent padding, proportional resize,
// rectangular slice extraction and PNG/WebP encoding. No artistic repainting.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dependency, root } from './lib/dependencies.mjs';

const sharp = dependency('sharp');
const source = join(root, 'art-source/painted-settlement-v1');
const output = join(root, 'public/ui/painted-settlement-v1');
mkdirSync(output, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const assets = {};

function alphaStats(data, info) {
  let min = 255, max = 0, transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    min = Math.min(min, data[i]); max = Math.max(max, data[i]);
    if (data[i] === 0) transparent++;
  }
  return { hasAlpha: true, alphaMin: min, alphaMax: max,
    fullyTransparentFraction: transparent / (info.width * info.height) };
}

async function save(name, png, extra = {}) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = alphaStats(data, info);
  assert.equal(alpha.alphaMin, 0, `${name}: real alpha transparency required`);
  assert.equal(alpha.alphaMax, 255, `${name}: opaque artwork required`);
  const webp = await sharp(png).webp({ quality: 94, alphaQuality: 100, effort: 6 }).toBuffer();
  writeFileSync(join(output, `${name}.png`), png);
  writeFileSync(join(output, `${name}.webp`), webp);
  assets[name] = { width: info.width, height: info.height,
    png: `public/ui/painted-settlement-v1/${name}.png`,
    webp: `public/ui/painted-settlement-v1/${name}.webp`,
    pngBytes: png.length, webpBytes: webp.length,
    pngSha256: hash(png), webpSha256: hash(webp), validation: alpha, ...extra };
  return png;
}

for (const name of ['panel', 'button']) {
  const bytes = readFileSync(join(source, `${name}-source.png`));
  const metadata = await sharp(bytes).metadata();
  assert(metadata.hasAlpha, `${name}: preserve generated alpha`);
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  // Alpha 1 contains a few almost-invisible watermark specks in distant margins.
  // Use >1 only to locate the frame bounds; retain every original pixel in crop.
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 1) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const pad = 6;
  const crop = { left: Math.max(0, x0 - pad), top: Math.max(0, y0 - pad),
    width: Math.min(info.width, x1 + pad + 1) - Math.max(0, x0 - pad),
    height: Math.min(info.height, y1 + pad + 1) - Math.max(0, y0 - pad) };
  const png = await sharp(bytes).extract(crop).resize({ width: 960 })
    .extend({ top: 2, right: 2, bottom: 2, left: 2, background: '#00000000' })
    .png().toBuffer();
  await save(name, png, { source: `art-source/painted-settlement-v1/${name}-source.png`,
    sourceSha256: hash(bytes), sourceSize: { width: info.width, height: info.height }, crop,
    transparentOutputBorder: 2 });
}

// All slices share the exact full-panel x coordinates. Top and bottom are kept
// at the same proportional scale; only the middle may stretch vertically.
const panel = readFileSync(join(output, 'panel.png'));
const { width, height } = assets.panel;
const cuts = { header: { left: 0, top: 0, width, height: 250 },
  body: { left: 0, top: 250, width, height: 760 },
  footer: { left: 0, top: 1010, width, height: height - 1010 } };
for (const [name, crop] of Object.entries(cuts)) {
  await save(name, await sharp(panel).extract(crop).png().toBuffer(),
    { source: 'public/ui/painted-settlement-v1/panel.png', crop });
}

const manifest = {
  version: 1,
  generation: 'OpenAI built-in image_gen; approved modal edited into reusable artwork.',
  preparation: 'Sharp only: alpha bounding crop, transparent border, proportional resize, rectangular slicing and format compression.',
  approvedReference: { path: 'art-source/painted-settlement-v1/approved-reference.png',
    sha256: hash(readFileSync(join(source, 'approved-reference.png'))) },
  generatedSources: {
    panel: '/Users/danny/.codex/generated_images/01a0a350-9461-7171-b9b2-738b870c448c/exec-8296a705-0758-4dd0-9369-6e45b7ca7056.png',
    button: '/Users/danny/.codex/generated_images/01a0a350-9461-7171-b9b2-738b870c448c/exec-b88f36cd-9402-4ce2-ba0c-4e8dd83d3ec4.png',
    initialPanelBeforeMarginFix: '/Users/danny/.codex/generated_images/01a0a350-9461-7171-b9b2-738b870c448c/exec-b07e7588-5129-4aec-a4d3-94012cb2d32d.png'
  },
  prompts: ['art-source/painted-settlement-v1/prompts.json', 'art-source/painted-settlement-v1/panel-margin-prompt.txt'],
  assets,
  layout: {
    units: 'percent of final full panel image unless stated otherwise',
    title: { left: 24, top: 3.8, width: 52, height: 10.4 },
    titleRelativeToHeaderSlice: { left: 24, top: 19, width: 52, height: 52 },
    bodyText: { left: 9, width: 81 },
    footerSafeContent: { left: 10, width: 73 },
    buttonLabel: { left: 12, top: 17, width: 76, height: 62 },
    headerHeightToWidthRatio: 250 / width,
    footerHeightToWidthRatio: (height - 1010) / width,
    recommendedMinimumModalWidthCssPx: 280,
    recommendedBodyTextCssPx: 15,
    sliceRule: 'Stack header/body/footer at identical CSS widths without gaps. Preserve aspect ratio of header and footer; stretch body in height to fit real HTML content. Body ends before corner leaves. Keep HTML content above the footer decorative corner and use normal document flow, never a fixed-height overlay for long science copy.',
    nineSliceAlternative: { top: 250, right: 54, bottom: height - 1010, left: 50,
      note: 'Prefer the three full-width slices: horizontal stretching of header would distort the hand; vertical stretching belongs only in body.' }
  },
  visualReview: { textInArtwork: 'none', embeddedButtonInPanel: 'none',
    centralRewardFlowersInPanel: 'none', hand: 'pointing at viewer, top left',
    cornerFlower: 'bottom right with intact leaf tips', actualAlpha: 'verified' }
};
writeFileSync(join(source, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(assets).map(([name, asset]) =>
  [name, { width: asset.width, height: asset.height, bytes: asset.webpBytes, alpha: asset.validation }])), null, 2));
