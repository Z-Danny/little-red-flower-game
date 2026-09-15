import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dependency, root } from './lib/dependencies.mjs';
const dir = mkdtempSync(join(tmpdir(), 'flower-journal-tests-'));
try {
  const outfile = join(dir, 'tests.mjs');
  await dependency('esbuild').build({ absWorkingDir: root, entryPoints: ['tests/journal.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
  const result = spawnSync(process.execPath, ['--test', outfile], { cwd: root, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { rmSync(dir, { recursive: true, force: true }); }
