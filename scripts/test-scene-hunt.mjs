import { createRequire } from 'node:module';
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const esbuildPath = readdirSync(join(root, 'node_modules/.pnpm'))
  .filter((n) => n.startsWith('esbuild@'))
  .map((n) => join(root, 'node_modules/.pnpm', n, 'node_modules/esbuild'))
  .find((p) => existsSync(join(p, 'lib/main.js')));
const { build } = require(esbuildPath),
  temp = mkdtempSync(join(tmpdir(), 'scene-hunt-tests-')),
  outfile = join(temp, 'tests.mjs');
await build({
  absWorkingDir: root,
  entryPoints: ['tests/scene-hunt.test.ts'],
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
