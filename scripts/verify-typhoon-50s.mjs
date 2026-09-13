import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root} from './lib/dependencies.mjs';
const out=path.join(root,'docs/typhoon-deadline/verification');fs.mkdirSync(out,{recursive:true});
const jobs=['test-typhoon-immersion','test-scene-hunt','test-hazard-performance','test-hazard-batch','test-hunt-pipeline','test-pipeline','test-transcripts','test-journey','test-map-signals','test-kitchen','test-disaster','test-response-experience'];
const report={at:new Date().toISOString(),status:'running',checks:[]};
for(const job of jobs){const run=spawnSync(process.execPath,[`scripts/${job}.mjs`],{cwd:root,encoding:'utf8'});fs.writeFileSync(path.join(out,job+'.log'),run.stdout+'\n'+run.stderr);report.checks.push({name:job,exitCode:run.status,tests:Number(run.stdout.match(/tests (\d+)/)?.[1]??0)});console.log(job,run.status);if(run.status!==0){report.status='failed';break;}}
if(report.status!=='failed'){const run=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','--noEmit'],{cwd:root,encoding:'utf8'});fs.writeFileSync(path.join(out,'typecheck.log'),run.stdout+'\n'+run.stderr);report.checks.push({name:'typecheck',exitCode:run.status});report.status=run.status===0?'passed':'failed';}
fs.writeFileSync(path.join(out,'regression.json'),JSON.stringify(report,null,2));process.exitCode=report.status==='passed'?0:1;
