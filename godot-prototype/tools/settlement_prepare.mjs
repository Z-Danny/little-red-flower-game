// From the repo root: node godot-prototype/tools/settlement_prepare.mjs [--check]
// Import only the originals actually displayed by the Godot settlement.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dependency, root } from '../../scripts/lib/dependencies.mjs';

const target = path.join(root, 'godot-prototype/assets/settlement_ui');
const check = process.argv.includes('--check');
const read = file => readFileSync(path.join(root, file));
const json = file => JSON.parse(read(file));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const serialize = document => Buffer.from(JSON.stringify(document, null, 2) + '\n');
const files = new Map();
const provenance = {};
function use(original, destination, expected) {
  const bytes = read(original);
  const sha256 = digest(bytes);
  if (expected) assert.equal(sha256, expected, `Original artwork changed: ${original}`);
  files.set(destination, bytes);
  provenance[destination] = { original, sha256 };
}

const success = json('art-source/painted-settlement-v1/manifest.json').assets;
const failure = json('art-source/painted-failure-v2/manifest.json').assets;
for (const [group, manifest, layers] of [
  ['success', success, ['header', 'body', 'footer', 'button']],
  ['failure', failure, ['header', 'body', 'footer', 'mascot', 'secondary-button']],
]) {
  for (const layer of layers) {
    const asset = manifest[layer];
    use(asset.webp, `${group}/${layer}.webp`, asset.webpSha256);
  }
}
assert.deepEqual(read(failure.button.webp), read(success.button.webp), 'Web failure reuses the success primary button');
use('public/ui/painted-v1/petal.webp', 'success/petal.webp');
const display = json('public/fonts/manifest.json').fonts.find(font => font.file === 'flower-display.woff2');
use(`public/fonts/${display.file}`, display.file, display.sha256);
use(`public/fonts/${display.license}`, display.license);
files.set('art_sources.json', serialize({ assets: provenance }));

const knowledgeFiles = [
  'app/game/journey/knowledge.ts',
  'app/game/first-aid/cpr-content.ts',
  'app/game/first-aid/aed-content.ts',
];
const bundle = await dependency('esbuild').build({
  absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm',
  stdin: { resolveDir: root, contents: `export {lessonFor} from './${knowledgeFiles[0]}';` },
});
const { lessonFor } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const ids = json('godot-prototype/data/original_levels.json').maps.flatMap(map =>
  map.stops.filter(stop => stop.was_playable).map(stop => stop.id)).sort();
assert(ids.length > 0, 'No original playable levels');
assert.equal(new Set(ids).size, ids.length, 'Duplicate original level ID');
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const levels = Object.fromEntries(ids.map(id => {
  const lesson = lessonFor(id);
  assert(nonEmptyString(lesson.message) && nonEmptyString(lesson.summary), `Missing original lesson copy: ${id}`);
  assert.equal(lesson.points.length, 3, `Missing original lesson points: ${id}`);
  assert(lesson.points.every(point => nonEmptyString(point.title) && nonEmptyString(point.body)), `Empty point: ${id}`);
  assert(lesson.sources.length && lesson.sources.every(source =>
    nonEmptyString(source.publisher) && new URL(source.url).protocol === 'https:'), `Invalid original source: ${id}`);
  return [id, lesson];
}));
files.set('lessons.json', serialize({
  schema_version: 1,
  source_sha256: Object.fromEntries(knowledgeFiles.map(file => [file, digest(read(file))])),
  levels,
}));

for (const [file, bytes] of files) {
  const dest = path.join(target, file);
  if (existsSync(dest) && readFileSync(dest).equals(bytes)) continue;
  if (check) throw new Error(`Missing or stale settlement asset: ${file}`);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
}
console.log(`${check ? 'Verified' : 'Imported'} ${Object.keys(provenance).length} original settlement assets and ${ids.length} lessons.`);
