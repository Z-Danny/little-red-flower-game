import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/flower-journey/verification');fs.mkdirSync(out,{recursive:true});
const commands=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).scripts.test.split(' && ');
const report=[];
for(const command of commands){const file=command.replace(/^node /,'');const r=spawnSync(process.execPath,[file],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024});fs.writeFileSync(path.join(out,path.basename(file)+'.log'),r.stdout+r.stderr);report.push({command,exitCode:r.status,tests:r.stdout.match(/(?:tests|# tests) (\d+)/)?.[1]??null});console.log(command+': '+r.status);if(r.status!==0){console.log((r.stdout+r.stderr).slice(-3500));process.exitCode=1;break;}}
fs.writeFileSync(path.join(out,'suite-report.json'),JSON.stringify(report,null,2));
