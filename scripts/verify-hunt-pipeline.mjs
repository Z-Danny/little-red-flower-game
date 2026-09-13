import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..'),
  out = path.join(root, 'docs/hunt-pipeline/verification');
fs.mkdirSync(out, { recursive: true });
const commands = [
  'test-kitchen',
  'test-response-experience',
  'test-typhoon',
  'test-pipeline',
  'test-leaderboard',
  'test-transcripts',
  'test-scene-hunt',
  'test-hazard-performance',
  'test-hazard-batch',
  'test-disaster',
  'test-hunt-pipeline',
];
const report = { at: new Date().toISOString(), status: 'passed', checks: [] };
for (const name of commands) {
  const start = Date.now(),
    r = spawnSync(process.execPath, ['scripts/' + name + '.mjs'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  fs.writeFileSync(
    path.join(out, name + '.log'),
    (r.stdout ?? '') + (r.stderr ?? ''),
  );
  report.checks.push({ name, exit: r.status, ms: Date.now() - start });
  console.log(name, r.status === 0 ? 'PASS' : 'FAIL');
  if (r.status !== 0) report.status = 'failed';
}
const r = spawnSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '--noEmit'],
  { cwd: root, encoding: 'utf8' },
);
fs.writeFileSync(
  path.join(out, 'typecheck.log'),
  (r.stdout ?? '') + (r.stderr ?? ''),
);
report.checks.push({ name: 'typecheck', exit: r.status });
if (r.status !== 0) report.status = 'failed';
fs.writeFileSync(
  path.join(out, 'regression.json'),
  JSON.stringify(report, null, 2),
);
if (report.status !== 'passed') process.exitCode = 1;
