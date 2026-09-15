// Build game-sized transparent assets from the approved standalone art sources.
// No background removal or repainting: preserve ImageGen's original alpha.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dependency, root } from './lib/dependencies.mjs';

const sharp = dependency('sharp');
const source = join(root, 'art-source/map-wheel-v1');
const output = join(root, 'public/levels/journey-map/map-wheel-v1');
mkdirSync(output, { recursive: true });
const names = ['category-nature', 'category-public', 'category-home', 'flower', 'trophy'];
const assets = [];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

for (const name of names) {
  const bytes = readFileSync(join(source, `${name}.png`));
  const metadata = await sharp(bytes).metadata();
  assert(metadata.hasAlpha, `${name}: source needs genuine transparency`);
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  for (let index = 3; index < data.length; index += info.channels) if (data[index] === 0) transparent++;
  assert(transparent / (info.width * info.height) > 0.15, `${name}: transparent padding missing`);
  for (const pixel of [0, info.width - 1, (info.height - 1) * info.width, info.width * info.height - 1]) {
    assert.equal(data[pixel * info.channels + 3], 0, `${name}: corner must be transparent`);
  }
  const file = `${name}.webp`;
  // Normalize empty margins and size only; don't alter the generated artwork.
  const built = await sharp(bytes).trim({ threshold: 8 })
    .resize(360, 360, { fit: 'contain', background: '#00000000' })
    .extend({ top: 12, right: 12, bottom: 12, left: 12, background: '#00000000' })
    .webp({ quality: 94, alphaQuality: 100 }).toBuffer();
  writeFileSync(join(output, file), built);
  assets.push({ name, source: `art-source/map-wheel-v1/${name}.png`, sourceSha256: sha256(bytes),
    path: `/levels/journey-map/map-wheel-v1/${file}`, width: 384, height: 384,
    alpha: true, transparentSourceFraction: transparent / (info.width * info.height), sha256: sha256(built), bytes: built.length });
}

for (const name of ['plate-wing', 'plate-wheel']) {
  const bytes = readFileSync(join(source, `${name}.svg`));
  const built = await sharp(bytes).png().toBuffer();
  const metadata = await sharp(built).metadata();
  const file = `${name}.png`;
  writeFileSync(join(output, file), built);
  assets.push({ name, source: `art-source/map-wheel-v1/${name}.svg`, sourceSha256: sha256(bytes),
    path: `/levels/journey-map/map-wheel-v1/${file}`, width: metadata.width, height: metadata.height,
    alpha: metadata.hasAlpha, sha256: sha256(built), bytes: built.length });
}
writeFileSync(join(source, 'assets.json'), JSON.stringify({
  version: 1,
  scope: 'Top map HUD only; category artwork, wallet, achievement entry, and two UI plates. No map/level assets changed.',
  generation: 'Built-in image_gen; five separate transparent icon generations. Two plates authored as editable SVG.',
  preparation: 'sharp: transparent margin normalization, resize, WebP encoding; SVG rasterization to PNG for offline embedding.',
  assets,
}, null, 2) + '\n');
console.log(JSON.stringify(assets.map(({ name, width, height, bytes, alpha }) => ({ name, width, height, bytes, alpha })), null, 2));
