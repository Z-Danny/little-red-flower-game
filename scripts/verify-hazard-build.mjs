import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/hazard-batch-v2/verification');mkdirSync(out,{recursive:true});
const steps=[['typecheck',['node_modules/typescript/bin/tsc','--noEmit']],['production-build',['node_modules/vinext/dist/cli.js','build']]];
const results=[];
for(const [name,args] of steps){const p=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});writeFileSync(join(out,name+'.log'),(p.stdout??'')+(p.stderr??''));results.push({name,exitCode:p.status,error:p.error?.message});console.log(name+': '+p.status);}
const status=results.every(r=>r.exitCode===0)?'passed':'failed';
writeFileSync(join(out,'build-typecheck.json'),JSON.stringify({at:new Date().toISOString(),status,results,htmlSha256:createHash('sha256').update(readFileSync(join(root,'outputs/本地离线版/小红花应急行动.html'))).digest('hex')},null,2));
if(status!=='passed')process.exitCode=1;
