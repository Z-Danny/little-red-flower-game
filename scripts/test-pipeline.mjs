import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dependency, root } from './lib/dependencies.mjs';
const outfile = join(mkdtempSync(join(tmpdir(), 'flower-pipeline-tests-')), 'tests.mjs');
await dependency('esbuild').build({ absWorkingDir: root, entryPoints: ['tests/pipeline.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
const result = spawnSync(process.execPath, ['--test', outfile], { cwd: root, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
