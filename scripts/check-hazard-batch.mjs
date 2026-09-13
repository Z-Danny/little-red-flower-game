import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const plan=JSON.parse(readFileSync(join(root,'docs/hazard-batch-v2/production-plan.json'),'utf8'));
const results=[];
for(const card of plan.levels){
  const spec='art-source/hazard-batch-v2/'+card.authorId+'/production.json';
  const proc=spawnSync(process.env.HAZARD_PYTHON || 'python',['scripts/check-hazard-batch-art.py',spec],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
  let detail=null;
  try{detail=JSON.parse(proc.stdout.trim());}catch{detail={stdout:proc.stdout};}
  results.push({authorId:card.authorId,id:card.id,passed:proc.status===0,detail,error:proc.error?.message||proc.stderr?.trim()||null});
  console.log(card.authorId+': '+(proc.status===0?'pixel structure PASS':'FAIL'));
}
const report={createdAt:new Date().toISOString(),status:results.every(r=>r.passed)?'pixel_structure_pass':'failed',scope:'Real input assets and their pixel provenance/permissions, not browser visual approval or human speaker review',levels:results};
const dir=join(root,'docs/hazard-batch-v2/verification');
mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,'art-batch.json'),JSON.stringify(report,null,2)+'\n');
if(results.some(r=>!r.passed)){console.error(JSON.stringify(results.filter(r=>!r.passed),null,2));process.exitCode=1;}
