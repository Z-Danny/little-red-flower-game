import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readdirSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url);
const dep = name => require(readdirSync(join(root, 'node_modules/.pnpm')).filter(n => n.startsWith(name + '@')).map(n => join(root, 'node_modules/.pnpm', n, 'node_modules', name)).find(p => existsSync(join(p, 'package.json'))));
const sharp = dep('sharp'), names = ['pan', 'lid', 'water', 'cloth', 'extinguisher', 'gas', 'plate', 'knife', 'flame', 'worried', 'panicked', 'focused', 'relieved'];
const report = [];
const skin = JSON.parse(readFileSync(join(root, 'content/presets/kitchen/skin.json'), 'utf8'));
for (const name of names) {
  const src = sharp(join(root, 'public', skin.assets[name]));
  const meta = await src.metadata(), { data, info } = await src.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0, opaque = 0, edgeMax = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * 4 + 3];
    transparent += Number(alpha === 0); opaque += Number(alpha === 255);
    if (!x || !y || x === info.width - 1 || y === info.height - 1) edgeMax = Math.max(edgeMax, alpha);
  }
  assert.equal(meta.hasAlpha, true, name + ' missing alpha'); assert.ok(transparent > 0 && opaque > 0, name + ' must contain both transparency and artwork'); assert.equal(edgeMax, 0, name + ' clipped or opaque border');
  report.push({ name, width: info.width, height: info.height, transparent, opaque, edgeMax });
}
const output = join(root, 'outputs/kitchen-review'); mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'alpha-validation.json'), JSON.stringify({ passed: true, sprites: report }, null, 2));
console.log('PASS: 13 genuine RGBA sprites; every outer edge transparent.');
