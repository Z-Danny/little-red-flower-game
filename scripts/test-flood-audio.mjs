import { dependency, root } from './lib/dependencies.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const outfile = join(mkdtempSync(join(tmpdir(), 'flood-audio-tests-')), 'tests.mjs');
await dependency('esbuild').build({ absWorkingDir: root, entryPoints: ['tests/flood-audio.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
process.exitCode = spawnSync(process.execPath, ['--test', outfile], { cwd: root, stdio: 'inherit' }).status ?? 1;
