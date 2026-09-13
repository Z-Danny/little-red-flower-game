import { dependency, root } from './lib/dependencies.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const outfile = join(
  mkdtempSync(join(tmpdir(), 'flower-journey-tests-')),
  'tests.mjs',
);
await dependency('esbuild').build({
  absWorkingDir: root,
  stdin: { contents: "import './tests/journey.test'; import './tests/response-map.test'; import './tests/fire-shelter.test';", resolveDir: root },
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
