import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {root,dependency} from './lib/dependencies.mjs';
const output=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'typhoon-50-tests-')),'tests.mjs');
await dependency('esbuild').build({absWorkingDir:root,entryPoints:['tests/typhoon-immersion.test.ts'],bundle:true,platform:'node',format:'esm',outfile:output,logLevel:'silent',banner:{js:"import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);"}});
process.exitCode=spawnSync(process.execPath,['--test',output],{cwd:root,stdio:'inherit'}).status??1;
