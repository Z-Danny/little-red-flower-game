import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { dependency, root } from './lib/dependencies.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'staged-response-test-'));
const out=path.join(dir,'test.mjs');
await dependency('esbuild').build({absWorkingDir:root,entryPoints:['tests/staged-response.test.ts'],bundle:true,platform:'node',format:'esm',outfile:out});
const r=spawnSync(process.execPath,['--test',out],{stdio:'inherit'});process.exitCode=r.status??1;
