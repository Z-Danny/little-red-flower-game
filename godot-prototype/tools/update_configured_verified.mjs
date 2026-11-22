// Readiness requires a per-ID scene regression on the exact imported package bytes.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const dest = path.resolve(import.meta.dirname, '../assets/configured_runner');
const index = JSON.parse(readFileSync(path.join(dest, 'source_index.json')));
const reportPath = process.argv[2];
assert(reportPath, 'Pass a Godot configured_test_results.json');
const report = JSON.parse(readFileSync(reportPath));
assert.equal(report.schemaVersion, 1);
assert.match(report.godot, /^4\.6\.2[.-]/);
assert.equal(report.errors.length, 0, 'Fix the test failures before updating the gate');
const target = path.join(dest, 'verified.json');
const previous = process.argv.includes('--merge') && existsSync(target) ? JSON.parse(readFileSync(target)).levels : {};
const levels = {};
for (const [id, source] of Object.entries(index.levels)) {
  const file = path.join(dest, 'levels', `${id}.json`);
  const data = readFileSync(file);
  const pack = JSON.parse(data);
  assert.equal(createHash('sha256').update(data).digest('hex'), source.packageSha256, `Stale source index for ${id}`);
  const terminal = pack.rules.inventory ? 'timeout-and-wrong-inventory'
    : pack.rules.risk.timeout === 'fail' ? 'timeout'
    : pack.rules.interactions.some(action => action.failure) ? 'authored-fatal-action'
    : 'recoverable-warnings-only';
  const required = ['native_scene_and_sources', 'original_success_and_finished_signal', terminal === 'recoverable-warnings-only'
    ? 'authored_recoverable_errors' : 'original_failure_and_finished_signal'];
  const evidence = report.levels[id];
  const old = previous[id];
  if (!evidence && old?.packageSha256 === source.packageSha256) {
    levels[id] = old;
    continue;
  }
  const checks = evidence?.checks ?? [];
  const ready = evidence?.passed === true && evidence?.packageSha256 === source.packageSha256 && required.every(check => checks.includes(check));
  const limitations = ['Native fixed portrait stage and HUD; not a pixel-for-pixel browser layout.',
    'Godot mixer and native signal timing; speaker/headphone and phone checks not run.'];
  if (terminal === 'recoverable-warnings-only') limitations.push('Original actions warn and allow recovery; there is no original terminal failure or rescue deadline.');
  if (pack.skin.presentation) limitations.push('Native effects use authored conditions, positions and layer order; particle appearance differs from Canvas 2D.');
  if (pack.skin.presentation?.roomSmoke) limitations.push('Room smoke preserves source rates and persistent ceiling load; browser background diffusion blur is not ported.');
  if (!ready) limitations.push('Native completion and original error/failure paths have not both been verified.');
  levels[id] = { ready, adapter: source.adapter, skinId: source.skinId, sourceHashes: source.sourceHashes,
    packageSha256: source.packageSha256, terminal, assertions: evidence?.assertions ?? 0, checks, limitations };
}
writeFileSync(target, JSON.stringify({ schemaVersion: 1, godot: report.godot, levels }, null, 2) + '\n');
console.log(`Configured readiness: ${Object.values(levels).filter(level => level.ready).length}/${Object.keys(levels).length}`);
