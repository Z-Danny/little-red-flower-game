import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),dir=join(root,'docs/hazard-batch-v2/verification');
mkdirSync(dir,{recursive:true});
const runners=['test-kitchen','test-typhoon','test-pipeline','test-leaderboard','test-transcripts','test-scene-hunt','test-hazard-performance','test-hazard-batch'];
const results=[];
for(const name of runners){
 const r=spawnSync(process.execPath,['scripts/'+name+'.mjs'],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
 const log=(r.stdout??'')+(r.stderr??'');writeFileSync(join(dir,name+'.log'),log);
 const number=key=>Number(log.match(new RegExp('(?:#|ℹ) '+key+' (\\d+)'))?.[1]??0);
 const entry={name,exitCode:r.status,tests:number('tests'),pass:number('pass'),fail:number('fail')};
 results.push(entry);console.log(JSON.stringify(entry));
}
const report={at:new Date().toISOString(),status:results.every(r=>r.exitCode===0&&r.tests>0&&r.fail===0)?'passed':'failed',tests:results.reduce((n,r)=>n+r.tests,0),results};
writeFileSync(join(dir,'regression-report.json'),JSON.stringify(report,null,2));
if(report.status!=='passed')process.exitCode=1;
