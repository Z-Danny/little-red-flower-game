/** Preserve and run the maintained project's complete test chain, then display gates. */
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {root} from './lib/dependencies.mjs';
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const testFiles=pkg.scripts.test.split(' && ').map(command=>{
 const match=/^node (scripts\/[a-z0-9-]+\.mjs)$/.exec(command);if(!match)throw Error('Unexpected test command; review before running');return match[1];
});
const commands=[...testFiles.map(p=>[p]),['scripts/test-display-adaptation.mjs'],['scripts/test-game-viewport-assertions.mjs'],['scripts/test-configured-response-display.mjs'],['node_modules/typescript/bin/tsc','--noEmit']];
const output=join(root,'outputs/display-adaptation/regression');mkdirSync(output,{recursive:true});
const report={at:new Date().toISOString(),results:[]};
for(const [file,...args]of commands){const name=file.replace(/^.*\//,'').replace(/\.mjs$/,'');const r=spawnSync(process.execPath,[file,...args],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024});const log=(r.stdout??'')+(r.stderr??'');writeFileSync(join(output,name+'.log'),log);const row={script:file,args,exitCode:r.status,error:r.error?.message,summary:log.split(/\r?\n/).filter(l=>/^(?:# |ℹ )(?:tests |pass |fail |duration_ms )/.test(l)),failures:log.split(/\r?\n/).filter(l=>/^(?:not ok |✖)/.test(l))};report.results.push(row);console.log(JSON.stringify(row));if(r.status!==0)process.exitCode=1;writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
