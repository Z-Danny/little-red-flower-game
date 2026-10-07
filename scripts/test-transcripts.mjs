import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dependency, root } from './lib/dependencies.mjs';
const outfile=join(mkdtempSync(join(tmpdir(),'flower-transcripts-')),'tests.mjs');
await dependency('esbuild').build({absWorkingDir:root,stdin:{contents:"import './tests/transcripts.test'; import './tests/corridor-learning.test'; import './tests/flood-kit-distractors.test';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile,logLevel:'silent',banner:{js:"import { createRequire } from 'node:module'; const require=createRequire(import.meta.url);"}});
process.exitCode=spawnSync(process.execPath,['--test',outfile],{cwd:root,stdio:'inherit'}).status??1;
