import { createRequire } from 'node:module';
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const esbuildPath = readdirSync(join(root, 'node_modules/.pnpm')).filter(n => n.startsWith('esbuild@')).map(n => join(root, 'node_modules/.pnpm', n, 'node_modules/esbuild')).find(p => existsSync(join(p, 'lib/main.js')));
const { build } = require(esbuildPath);
const temp = mkdtempSync(join(tmpdir(), 'typhoon-tests-'));
const entries = ['tests/typhoon-v2.test.ts', 'tests/typhoon-level-rules.test.ts'];
const files = [];
for (const [i, entry] of entries.entries()) {
  const outfile = join(temp, `typhoon-${i}.test.mjs`);
  await build({ absWorkingDir: root, entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
  files.push(outfile);
}
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
