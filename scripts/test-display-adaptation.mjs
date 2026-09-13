import {dependency,root} from './lib/dependencies.mjs';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const out=join(mkdtempSync(join(tmpdir(),'flower-display-')),'tests.mjs');
await dependency('esbuild').build({absWorkingDir:root,entryPoints:['tests/display-adaptation.test.ts'],bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const result=spawnSync(process.execPath,['--test',out],{stdio:'inherit'});process.exitCode=result.status??1;
