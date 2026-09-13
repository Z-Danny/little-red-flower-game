import { dependency, root } from './lib/dependencies.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const path = join(
  mkdtempSync(join(tmpdir(), 'rain-flood-tests-')),
  'tests.mjs',
);
await dependency('esbuild').build({
  absWorkingDir: root,
  entryPoints: ['tests/disaster.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path,
  logLevel: 'silent',
});
process.exitCode =
  spawnSync(process.execPath, ['--test', path], { cwd: root, stdio: 'inherit' })
    .status ?? 1;
