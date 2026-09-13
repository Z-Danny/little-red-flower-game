// Direct local runners: no dependency installation, network, or package-manager auto-repair.
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/charging-bedroom/verification');
mkdirSync(out,{recursive:true});
const jobs=[...['kitchen','typhoon','pipeline','leaderboard','transcripts','scene-hunt'].map(n=>[n,`scripts/test-${n}.mjs`]),
  ['typecheck','node_modules/typescript/bin/tsc','--noEmit'],['sync','scripts/levels.mjs','sync'],
  ['build','node_modules/vinext/dist/cli.js','build'],['offline','scripts/export-offline.mjs']];
const results=[];
for(const [name,...args] of jobs){
  const start=Date.now(),r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
  const log=(r.stdout||'')+(r.stderr||'')+(r.error?String(r.error):'');
  writeFileSync(join(out,`${name}.log`),log);
  const item={name,command:['node',...args].join(' '),exitCode:r.status,durationMs:Date.now()-start};
  results.push(item);console.log(JSON.stringify(item));
  writeFileSync(join(out,'checks.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));
  if(r.status!==0){console.error(log.slice(-6000));process.exit(1);}
}
