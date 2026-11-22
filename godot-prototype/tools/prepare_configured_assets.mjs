// Run from any directory: node godot-prototype/tools/prepare_configured_assets.mjs [--check]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { configuredAudioBuilder } from './prepare_configured_audio.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const dest = path.join(root, 'godot-prototype/assets/configured_runner');
const check = process.argv.includes('--check');
const bytes = p => readFileSync(path.join(root, p));
const parse = p => JSON.parse(bytes(p));
const hash = b => createHash('sha256').update(b).digest('hex');
const relativeAsset = src => {
  assert.match(src, /^\/levels\/[a-zA-Z0-9_.\-/]+\.(png|webp)$/);
  assert(!src.split('/').some(s => s === '..' || s === '.'), `Unsafe asset path: ${src}`);
  return src.slice(1);
};
function emit(file, data) {
  const target = path.join(dest, file);
  assert(target.startsWith(dest + path.sep));
  if (existsSync(target) && Buffer.from(data).equals(readFileSync(target))) return;
  if (check) throw Error(`Missing or stale configured asset: ${file}`);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, data);
}
const json = value => JSON.stringify(value) + '\n';
const bySource = new Map(), artFiles = new Map();
const entries = parse('content/catalog.json').filter(entry => entry.enabled).map(entry => {
  const { id, skin: skinId } = entry;
  assert.match(id, /^[a-z0-9-]+$/); assert.match(skinId, /^[a-z0-9-]+$/);
  const rulesPath = `content/levels/${id}/level.json`, skinPath = `content/levels/${id}/skins/${skinId}.json`;
  const rules = parse(rulesPath), skin = parse(skinPath);
  assert.equal(rules.schemaVersion, 1); assert.equal(rules.id, id);
  assert.equal(skin.schemaVersion, 1); assert.equal(skin.id, skinId);
  for (const asset of Object.values(skin.assets)) {
    const src = relativeAsset(asset.src), key = JSON.stringify([src, asset.frame ?? null]);
    if (!bySource.has(key)) bySource.set(key, bySource.size);
    if (!artFiles.has(src)) artFiles.set(src, bytes(`public/${src}`));
  }
  return { id, skinId, rulesPath, skinPath, rules, skin };
});
assert.equal(new Set(entries.map(x => x.id)).size, entries.length);
const result = spawnSync(process.env.CONFIGURED_PYTHON ?? 'python', [path.join(import.meta.dirname, 'prepare_configured_masks.py')], {
  input: '[' + [...bySource.keys()].join(',') + ']', encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, cwd: root,
});
if (result.error || result.status !== 0) throw Error(`Alpha mask bake failed: ${result.error ?? result.stderr}`);
const masks = JSON.parse(result.stdout);
assert.equal(masks.length, bySource.size);
const buildAudio = configuredAudioBuilder(root, emit);
const index = { schemaVersion: 1, catalogSha256: hash(bytes('content/catalog.json')), levels: {} };
for (const { id, skinId, rulesPath, skinPath, rules, skin } of entries) {
  const art = Object.fromEntries(Object.entries(skin.assets).map(([name, asset]) => {
    const src = relativeAsset(asset.src), key = JSON.stringify([src, asset.frame ?? null]);
    const mask = masks[bySource.get(key)];
    return [name, { path: `res://assets/configured_runner/art/${src}`, ...(mask ? { mask } : {}) }];
  }));
  const adapter = skin.presentation ? (rules.scenarios?.length ? 'scenario-practice' : 'staged-practice') : 'legacy';
  const sourceHashes = { rules: hash(bytes(rulesPath)), skin: hash(bytes(skinPath)) };
  const pack = { schemaVersion: 1, id, skinId, adapter, sourceHashes, rules, skin,
    poseOrder: Object.keys(skin.poses), zoneOrder: Object.keys(skin.zones), art, audio: buildAudio(rules, skin) };
  const serialized = json(pack), file = `levels/${id}.json`;
  emit(file, serialized);
  index.levels[id] = { skinId, adapter, sourceHashes, packageSha256: hash(serialized), path: `res://assets/configured_runner/${file}` };
}
for (const [src, data] of artFiles) emit(`art/${src}`, data);
emit('source_index.json', JSON.stringify(index, null, 2) + '\n');
console.log(`${check ? 'Verified' : 'Imported'} ${entries.length} configured packages, ${artFiles.size} unique source pictures; no readiness changes.`);
