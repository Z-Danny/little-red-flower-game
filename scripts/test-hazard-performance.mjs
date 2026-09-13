import { createRequire } from 'node:module';
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..'),
  require = createRequire(import.meta.url);
const folder = readdirSync(join(root, 'node_modules/.pnpm'))
  .filter((n) => n.startsWith('esbuild@'))
  .map((n) => join(root, 'node_modules/.pnpm', n, 'node_modules/esbuild'))
  .find((p) => existsSync(join(p, 'lib/main.js')));
if (!folder)
  throw Error(
    'Installed esbuild required; this runner does not install packages',
  );
const { build } = require(folder),
  outfile = join(
    mkdtempSync(join(tmpdir(), 'hazard-performance-')),
    'tests.mjs',
  );
await build({
  absWorkingDir: root,
  entryPoints: ['tests/hazard-performance.test.ts'],
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
