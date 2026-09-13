import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dependency, root } from './lib/dependencies.mjs';
const sharp=dependency('sharp');
const cards=JSON.parse(fs.readFileSync(path.join(root,'docs/hazard-batch-v2/production-plan.json'),'utf8')).levels;
const html=path.join(root,'outputs/本地离线版/小红花应急行动.html');
const report={htmlSha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),status:'running',checks:[]};
try{
  for(const card of cards){
    const skin=JSON.parse(fs.readFileSync(path.join(root,'content/scenes',card.id,'skin.json'),'utf8'));
    const {data,info}=await sharp(path.join(root,'public',skin.mask)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(const [w,h] of [[320,568],[320,740],[360,740],[390,844],[430,932],[393,852],[360,800]]){
      const scale=Math.max(w/skin.width,h/skin.height),ox=(w-skin.width*scale)/2,oy=(h-skin.height*scale)/2;
      const counts=Object.fromEntries(Object.keys(skin.targets).map(id=>[id,{total:0,visible:0}]));
      const ids=new Map(Object.entries(skin.targets).map(([id,t])=>[(t.color[0]<<16)+(t.color[1]<<8)+t.color[2],id]));
      for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
        const i=(y*info.width+x)*4;if(data[i+3]<128)continue;
        const id=ids.get((data[i]<<16)+(data[i+1]<<8)+data[i+2]);if(!id)continue;
        counts[id].total++;
        if(x*scale+ox>=0&&x*scale+ox<w&&y*scale+oy>=0&&y*scale+oy<h)counts[id].visible++;
      }
      for(const [id,c] of Object.entries(counts)){
        const ratio=c.visible/c.total,check={level:card.id,target:id,w,h,visibleRatio:ratio,passed:ratio>=.25};
        report.checks.push(check);assert.ok(check.passed,JSON.stringify(check));
      }
    }
  }
  report.status='passed';
}catch(e){report.status='failed';report.error=String(e);process.exitCode=1;}
const dir=path.join(root,'docs/hazard-batch-v2/verification/edge-fit-20260910');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'visible-targets.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,checks:report.checks.length,minimumVisibleRatio:Math.min(...report.checks.map(c=>c.visibleRatio)),error:report.error}));
