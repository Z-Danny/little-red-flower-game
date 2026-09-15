import { dependency, root } from './lib/dependencies.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'flower-journey-music-tests-'));
try {
  const outfile = join(directory, 'tests.mjs');
  await dependency('esbuild').build({
    absWorkingDir: root,
    entryPoints: ['tests/journey-music.test.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  });
  process.exitCode = spawnSync(process.execPath, ['--test', outfile], {
    cwd: root,
    stdio: 'inherit',
  }).status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
