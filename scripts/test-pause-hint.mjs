import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dependency, root } from './lib/dependencies.mjs';

const directory = mkdtempSync(join(tmpdir(), 'pause-hint-'));
try {
  const outfile = join(directory, 'tests.mjs');
  await dependency('esbuild').build({ absWorkingDir: root, entryPoints: ['tests/pause-hint.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
  process.exitCode = spawnSync(process.execPath, ['--test', outfile], { cwd: root, stdio: 'inherit' }).status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
