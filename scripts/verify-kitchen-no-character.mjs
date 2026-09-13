import fs from 'node:fs';import path from 'node:path';import{spawnSync}from'node:child_process';import{root}from'./lib/dependencies.mjs';
const out=path.join(root,'docs/kitchen-no-character/verification');fs.mkdirSync(out,{recursive:true});
const scripts=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).scripts;
const jobs=scripts.test.split(' && ').map(s=>{if(!s.startsWith('node '))throw Error('Unexpected test runner');return s.split(' ').slice(1);});
jobs.push(['scripts/test-typhoon-immersion.mjs'],['node_modules/typescript/bin/tsc','--noEmit']);
const report={at:new Date().toISOString(),status:'running',checks:[]};
for(const args of jobs){const run=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:24*1024*1024});const name=path.basename(args[0]);fs.writeFileSync(path.join(out,name+'.log'),run.stdout+'\n'+run.stderr);report.checks.push({name,exitCode:run.status,tests:Number(run.stdout?.match(/tests (\d+)/)?.[1]??0)});console.log(name,run.status);if(run.status!==0){report.status='failed';break;}}
if(report.status==='running')report.status='passed';
fs.writeFileSync(path.join(out,'regression.json'),JSON.stringify(report,null,2));process.exitCode=report.status==='passed'?0:1;
