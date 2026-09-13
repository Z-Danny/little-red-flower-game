import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dependency, root } from './lib/dependencies.mjs';

const sharp = dependency('sharp');
const input = process.argv[2];
// No argument rebuilds from checked-in docs/flood-rooftop/originals/<name>.png.
// An optional directory imports original generated exec-*.png filenames instead.
const targets = [
  { name: 'family-prepared', file: 'exec-e9790069-e45f-4fe5-98e6-9b4e61e5a07b.png', kind: 'character', seeds: [[361, 184], [657, 245], [652, 134], [414, 142], [356, 251]] },
  { name: 'family-message', file: 'exec-eb2cd5a0-b013-4890-909d-c6074be85c89.png', kind: 'character', seeds: [[597, 558], [275, 218], [278, 136], [558, 206], [278, 273], [548, 251]] },
  { name: 'roof-background', file: 'exec-d33de743-cffe-4fef-b1c6-54c52a3f11b5.png', kind: 'background' },
  { name: 'wood-panel', file: 'exec-6ecd47a2-432b-42ea-afdf-85d87826b726.png', kind: 'prop' },
  { name: 'foam', file: 'exec-f70ffb78-fd1a-42c1-bc08-b531840ad4e1.png', kind: 'prop', silhouette: 'M235 64 L833 68 Q866 68 870 97 L870 1419 Q870 1438 850 1455 L818 1480 Q813 1485 796 1484 L184 1450 Q164 1448 164 1431 L164 119 Q164 105 174 96 L221 68 Q228 64 235 64Z' },
  { name: 'float-aid', file: 'exec-06f44529-ab45-417f-9e20-5a1e14ae48d2.png', kind: 'prop' },
  { name: 'breaker', file: 'exec-6490817f-b676-4bd9-8111-3fd3c23ef403.png', kind: 'prop', silhouette: 'M226 148 L800 148 Q824 147 844 169 L868 192 Q881 205 881 229 L881 1321 Q881 1355 858 1379 L842 1395 Q834 1402 814 1402 L212 1402 Q188 1400 170 1378 L154 1358 Q149 1350 149 1330 L149 228 Q148 210 160 195 L188 166 Q207 148 226 148Z' },
  { name: 'flood-failure', file: 'exec-932e7f8f-4c8a-41c6-8f44-6ba99f6349b9.png', kind: 'background' },
  { name: 'breaker-off', file: 'exec-096be55d-858c-4fea-a609-30f676f5bfb0.png', kind: 'prop', shellSource: 'exec-6490817f-b676-4bd9-8111-3fd3c23ef403.png', silhouette: 'M226 148 L800 148 Q824 147 844 169 L868 192 Q881 205 881 229 L881 1321 Q881 1355 858 1379 L842 1395 Q834 1402 814 1402 L212 1402 Q188 1400 170 1378 L154 1358 Q149 1350 149 1330 L149 228 Q148 210 160 195 L188 166 Q207 148 226 148Z' },
  { name: 'electric-failure', file: 'exec-2fa11359-b9d4-46d8-8300-de10721358b9.png', kind: 'background' },
  { name: 'family-roof', file: 'exec-4bb17519-43c6-433f-98fe-6732b814445a.png', kind: 'character', seeds: [[608, 237], [321, 178], [605, 129], [316, 241], [371, 131], [511, 66], [276, 246], [552, 83], [922, 988]] },
];
const out = path.join(root, 'public/levels/flood-rooftop-v2');
const audit = path.join(root, 'docs/flood-rooftop');
const originals = path.join(audit, 'originals');
for (const dir of [out, audit, originals]) fs.mkdirSync(dir, { recursive: true });
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const report = [];
const provenancePath = path.join(originals, 'provenance.json');
const previousProvenance = fs.existsSync(provenancePath) ? JSON.parse(fs.readFileSync(provenancePath, 'utf8')) : [];
const originalPath = target => input ? path.resolve(input, target.file) : path.join(originals, target.name + '.png');

function removeChecker(data, w, h, seeds) {
  const n = w * h, bg = new Uint8Array(n), queue = new Int32Array(n);
  let head = 0, tail = 0;
  const neutral = i => { const j = i * 4, r = data[j], g = data[j + 1], b = data[j + 2]; return Math.min(r, g, b) >= 98 && Math.max(r, g, b) - Math.min(r, g, b) <= 24; };
  const push = i => { if (!bg[i] && neutral(i)) { bg[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  for (const [x, y] of seeds) push(y * w + x);
  while (head < tail) {
    const i = queue[head++], x = i % w, y = Math.floor(i / w);
    if (x) push(i - 1); if (x < w - 1) push(i + 1); if (y) push(i - w); if (y < h - 1) push(i + w);
  }
  for (let i = 0; i < n; i++) if (bg[i]) data[i * 4 + 3] = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (bg[i]) continue;
    const exposed = bg[i - 1] + bg[i + 1] + bg[i - w] + bg[i + w];
    if (exposed) data[i * 4 + 3] = neutral(i) || exposed > 1 ? 0 : 160;
  }
  // List enclosed neutral components for review, never blindly remove eye/shoe whites.
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
  return components.sort((a, b) => b.pixels - a.pixels);
}

function removeSpecks(data, w, h) {
  const n = w * h, seen = new Uint8Array(n), queue = new Int32Array(n);
  let removed = 0;
  for (let start = 0; start < n; start++) {
    if (seen[start] || !data[start * 4 + 3]) continue;
    let head = 0, tail = 0; queue[tail++] = start; seen[start] = 1;
    const add = i => { if (!seen[i] && data[i * 4 + 3]) { seen[i] = 1; queue[tail++] = i; } };
    while (head < tail) {
      const i = queue[head++], x = i % w, y = Math.floor(i / w);
      if (x) add(i - 1); if (x < w - 1) add(i + 1); if (y) add(i - w); if (y < h - 1) add(i + w);
    }
    if (tail < 40) { for (let j = 0; j < tail; j++) data[queue[j] * 4 + 3] = 0; removed += tail; }
  }
  return removed;
}

function alphaStats(data, w, h) {
  let alpha0 = 0, partial = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3]; if (!a) { alpha0++; continue; }
    if (a < 255) partial++;
    const x = i % w, y = Math.floor(i / w);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { transparentPixels: alpha0, transparentFraction: alpha0 / (w * h), partialAlphaPixels: partial, visibleBounds: [x0, y0, x1, y1] };
}

for (const target of targets) {
  const readFrom = originalPath(target), originalCopy = path.join(originals, target.name + '.png');
  const originalBytes = fs.readFileSync(readFrom);
  const prior = previousProvenance.find(entry => entry.name === target.name && entry.sourceSHA256 === sha(originalBytes));
  // Preserve the original generator provenance when rebuilding identical bytes.
  const source = prior?.source ?? readFrom;
  if (readFrom !== originalCopy && (!fs.existsSync(originalCopy) || sha(fs.readFileSync(originalCopy)) !== sha(originalBytes))) fs.writeFileSync(originalCopy, originalBytes);
  const originalMeta = await sharp(originalBytes).metadata();
  const output = path.join(out, target.name + '.webp');
  if (target.kind === 'background') {
    await sharp(originalBytes).webp({ quality: 96 }).toFile(output);
    report.push({ name: target.name, kind: target.kind, originalCanvas: [originalMeta.width, originalMeta.height], outputCanvas: [originalMeta.width, originalMeta.height], hasAlpha: false, source, original: path.relative(root, originalCopy).replaceAll('\\', '/'), sourceSHA256: sha(originalBytes), output: path.relative(root, output).replaceAll('\\', '/'), outputSHA256: sha(fs.readFileSync(output)), method: 'full original canvas; no crop, stretching or repaint' });
    continue;
  }
  let { data, info: { width: w, height: h } } = await sharp(originalBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let components = [], coloredFringePixelsRemoved = 0, crop = null;
  if (target.kind === 'character') {
    if (w !== 1024 || h !== 1536) throw Error('Characters must share the 1024x1536 source canvas');
    components = removeChecker(data, w, h, target.seeds);
  } else {
    if (!originalMeta.hasAlpha && !target.silhouette) throw Error('Prop transparency needs explicit cutout review');
    if (target.shellSource) {
      // Both switch states use the exact same housing pixels and outline. Only
      // generated indicator / switch-well pixels are taken from the off variant.
      // This is state atlas compositing, not repainting a new switch with code.
      const shellTarget = targets.find(entry => entry.file === target.shellSource);
      if (!shellTarget) throw Error(`Unknown shared housing source: ${target.shellSource}`);
      const shell = await sharp(originalPath(shellTarget)).ensureAlpha().raw().toBuffer();
      if (shell.length !== data.length) throw Error('Breaker state source canvases differ');
      const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="427" y="399" width="177" height="79" rx="30" fill="white"/><rect x="424" y="545" width="184" height="396" rx="23" fill="white"/></svg>`);
      const stateMask = await sharp(svg).ensureAlpha().raw().toBuffer();
      for (let i = 0; i < data.length; i += 4) {
        const mix = stateMask[i + 3] / 255;
        for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * mix + shell[i + c] * (1 - mix));
        data[i + 3] = shell[i + 3];
      }
    }
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = data.subarray(i, i + 4);
      // Visually inspected source has isolated saturated red/yellow alpha fringe,
      // not wood. Keep the actual warm wooden panel colors and outlines intact.
      if (a && (a < 32 || (r > 210 && g < 100 && b < 100) || (r > 230 && g > 180 && b < 40))) { data[i + 3] = 0; coloredFringePixelsRemoved++; }
    }
    if (target.silhouette) {
      // These sources contain a baked glow despite having an alpha channel.
      // Reviewed object-outline mask removes the glow, not its light-colored paint.
      const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path d="${target.silhouette}" fill="white"/></svg>`);
      const mask = await sharp(svg).ensureAlpha().raw().toBuffer();
      for (let i = 0; i < data.length; i += 4) data[i + 3] = Math.min(data[i + 3], mask[i + 3]);
    }
  }
  const isolatedPixelsRemoved = removeSpecks(data, w, h);
  if (target.kind === 'prop') {
    const [x0, y0, x1, y1] = alphaStats(data, w, h).visibleBounds;
    const margin = 8, left = Math.max(0, x0 - margin), top = Math.max(0, y0 - margin);
    crop = { left, top, width: Math.min(w - 1, x1 + margin) - left + 1, height: Math.min(h - 1, y1 + margin) - top + 1, margin };
    const extracted = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height }).raw().toBuffer();
    data = extracted; w = crop.width; h = crop.height;
  }
  await sharp(data, { raw: { width: w, height: h, channels: 4 } }).webp({ lossless: true }).toFile(output);
  const stats = alphaStats(data, w, h), metadata = await sharp(output).metadata();
  if (!metadata.hasAlpha || stats.transparentFraction <= .01) throw Error(`Invalid alpha in ${target.name}`);
  report.push({ name: target.name, kind: target.kind, source, original: path.relative(root, originalCopy).replaceAll('\\', '/'), sourceSHA256: sha(originalBytes), output: path.relative(root, output).replaceAll('\\', '/'), outputSHA256: sha(fs.readFileSync(output)), originalCanvas: [originalMeta.width, originalMeta.height], outputCanvas: [w, h], hasAlpha: metadata.hasAlpha, ...stats, crop, manualBackgroundSeeds: target.seeds ?? [], reviewedSilhouettePath: target.silhouette ?? null, sharedShellSource: target.shellSource ?? null, isolatedPixelsRemoved, coloredFringePixelsRemoved, remainingNeutralComponents: components, method: target.kind === 'character' ? 'edge-connected neutral checker removal; manual reviewed hair/gap seeds; one-pixel edge alpha cleanup; no crop' : 'preserve source alpha; saturated fringe cleanup; optional reviewed silhouette to remove baked glow; optional identical shell / generated state-interior compositing; transparent bounds crop with 8px margin' });
  const previewSize = target.kind === 'character' ? [512, 768] : [400, 768];
  const previews = [];
  for (const color of ['#ecd8b5', '#192c2e']) previews.push(await sharp(data, { raw: { width: w, height: h, channels: 4 } }).flatten({ background: color }).resize(previewSize[0], previewSize[1], { fit: 'contain', background: color }).png().toBuffer());
  await sharp({ create: { width: previewSize[0] * 2, height: previewSize[1], channels: 3, background: '#ecd8b5' } }).composite(previews.map((buffer, i) => ({ input: buffer, left: i * previewSize[0], top: 0 }))).png().toFile(path.join(audit, 'art-check-' + target.name + '.png'));
}
const onReport = report.find(x => x.name === 'breaker'), offReport = report.find(x => x.name === 'breaker-off');
const on = await sharp(path.join(root, onReport.output)).ensureAlpha().raw().toBuffer();
const off = await sharp(path.join(root, offReport.output)).ensureAlpha().raw().toBuffer();
if (JSON.stringify(onReport.outputCanvas) !== JSON.stringify(offReport.outputCanvas) || JSON.stringify(onReport.crop) !== JSON.stringify(offReport.crop)) throw Error('Switch housing canvas/crop mismatch');
let alphaMismatches = 0, housingColorMismatches = 0;
for (let i = 0; i < on.length; i += 4) {
  const pixel = i / 4, x = pixel % onReport.outputCanvas[0] + onReport.crop.left, y = Math.floor(pixel / onReport.outputCanvas[0]) + onReport.crop.top;
  if (on[i + 3] !== off[i + 3]) alphaMismatches++;
  const interior = (x >= 427 && x <= 604 && y >= 399 && y <= 478) || (x >= 424 && x <= 608 && y >= 545 && y <= 941);
  if (!interior && on[i + 3] && (on[i] !== off[i] || on[i + 1] !== off[i + 1] || on[i + 2] !== off[i + 2])) housingColorMismatches++;
}
if (alphaMismatches || housingColorMismatches) throw Error('Switch housing changed between states');
const auditReport = { version: 1, sourceType: 'original generated art; user-authorized local alpha cleanup', review: { deepAndLightComposites: 'passed_visual_review_2026-09-13', whiteClothesFoamAndEyeWhites: 'retained_visually_checked', bakedGlowAndColoredFringe: 'removed_visually_checked', gameRuntime: 'parent_task', physicalPhone: 'not_run' }, breakerPair: { sameCanvas: true, sameCrop: true, alphaMismatches, housingColorMismatches, note: 'Only generated indicator and switch-well interiors differ; all housing pixels reused from the on original.' }, assets: report };
fs.writeFileSync(path.join(audit, 'art-audit.json'), JSON.stringify(auditReport, null, 2) + '\n');
const provenanceJSON = JSON.stringify(report.map(({ name, source, original, sourceSHA256, originalCanvas }) => ({ name, source, original, sourceSHA256, originalCanvas })), null, 2) + '\n';
if (!fs.existsSync(provenancePath) || fs.readFileSync(provenancePath, 'utf8') !== provenanceJSON) fs.writeFileSync(provenancePath, provenanceJSON);
console.log(JSON.stringify(report.map(({ name, outputCanvas, visibleBounds, transparentFraction, remainingNeutralComponents }) => ({ name, outputCanvas, visibleBounds, transparentFraction, remainingNeutralComponents: remainingNeutralComponents?.slice(0, 12) })), null, 2));
