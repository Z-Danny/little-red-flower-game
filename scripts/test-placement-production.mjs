import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dependency, root } from './lib/dependencies.mjs';
const outfile = join(
  mkdtempSync(join(tmpdir(), 'placement-production-tests-')),
  'tests.mjs',
);
await dependency('esbuild').build({
  absWorkingDir: root,
  entryPoints: ['tests/placement-production.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'silent',
});
const result = spawnSync(process.execPath, ['--test', outfile], {
  cwd: root,
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
