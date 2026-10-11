import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dependency, root } from './lib/dependencies.mjs';
const out = join(root, 'work/well-coaching-tests');
mkdirSync(out, { recursive: true });
const outfile = join(out, 'tests.mjs');
await dependency('esbuild').build({
  absWorkingDir: root,
  entryPoints: ['tests/well-coaching.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'silent',
});
process.exitCode =
  spawnSync(process.execPath, ['--test', outfile], {
    cwd: root,
    stdio: 'inherit',
  }).status ?? 1;
