import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';import {getRuntime,readPackage} from './lib/packages.mjs';import {dependency,root} from './lib/dependencies.mjs';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.mkdirSync('outputs/aed-v2-verification',{recursive:true});
const baseline={Hash:JSON.parse(fs.readFileSync('art-source/aed-realistic-v2/manifest.json','utf8')).rulesSha256};
assert.equal(hash('content/levels/first-aid-aed/level.json'),baseline.Hash.toLowerCase(),'art/UI must not change rules');
const pack=await readPackage({id:'first-aid-aed',skin:'realistic-v2'}),rt=await getRuntime();
const bundle=path.join(root,'outputs/aed-v2-verification/scene-test.mjs');await dependency('esbuild').build({stdin:{contents:"export * from './app/game/runtime/scene';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:bundle,logLevel:'silent'});const {scenePoses}=await import(pathToFileURL(bundle).href);
const advance=(r,ms)=>{for(let t=0;t<ms;t+=100)r=rt.reduceRun(pack,r,{type:'tick',ms:100});return r};
const act=(r,source,mode='tap',target)=>advance(rt.reduceRun(pack,r,{type:'interact',input:{source,mode,target}}),600);
const pose=(r,id)=>scenePoses(pack,r,false).find(p=>p.id===id);
const hand=p=>({x:p.x+p.w*p.pivot.x,y:p.y+p.h*p.pivot.y});
assert.equal(pack.skin.presentation.noticeAppearance,'scene','AED guidance must not paint a dark bottom panel');
let checks=0;const check=(v,m)=>{assert(v,m);checks++};
for(const scenario of pack.rules.scenarios){
 let r=rt.createRun(pack,scenario.id);const initial=hand(pose(r,'helper'));
 check(Math.hypot(initial.x-355,initial.y-456)<2,'hands meet source-measured sternum');
 const motion0=pose({...r,elapsed:0},'helper'),motion1=pose({...r,elapsed:120},'helper');check(motion0.rotation!==motion1.rotation,'preparation CPR visible posture cycle');
 r=act(r,'device','drop','device-zone');r=act(r,'power');r=act(r,'shirt');r=act(r,'cloth','drop','chest-zone');r=act(r,'pad-upper','drop','upper-zone');r=act(r,'pad-side','drop','side-zone');
 check(pose(r,'pad-upper').y===405&&pose(r,'pad-side').x===373,'pads use NEW image anatomy, not old coordinates');
 check(pose(r,'context').opacity===0&&pose(r,'cue').opacity===0,'old floating text panels hidden after every animation');
 r=act(r,'clear');const cleared=pose(r,'helper'),safe=hand(cleared);
 check(Math.hypot(safe.x-initial.x,safe.y-initial.y)>100,'clear visibly withdraws hands');
 const chest=pack.skin.zones['chest-zone'];check(!(safe.x>=chest.x&&safe.x<=chest.x+chest.w&&safe.y>=chest.y&&safe.y<=chest.y+chest.h),'no contact after clear');
 check(pose({...r,elapsed:r.elapsed+230},'helper').rotation===cleared.rotation,'CPR movement STOPS during analysis');
 r=advance(r,2000);
 if(scenario.id==='shock-advised'){r=act(r,'clear');r=advance(r,1200);r=act(r,'shock');}else{const bad=act(r,'shock');check(!bad.resolved.includes('branch-ready'),'no-shock case remains no-shock');}
 r=act(r,'helper');check(Math.hypot(hand(pose(r,'helper')).x-initial.x,hand(pose(r,'helper')).y-initial.y)<.001,'resume restores same contact anchor');
 r=act(r,'handover');r=advance(r,1400);check(rt.completedForReward(r),'full unchanged branch completes');
}
check(pack.skin.assets.patient.src.includes('aed-realistic-v2'),'realistic patient selected');
check(pack.skin.assets['helper-clear'].src.includes('rescuer.webp'),'real retained cutout; do not pretend generated raised hands');
fs.writeFileSync('outputs/aed-v2-verification/rules-report.json',JSON.stringify({status:'passed',checks,rulesSha256:baseline.Hash.toLowerCase(),rulesUnchanged:true},null,2));console.log(`PASS ${checks} realistic anatomy / unchanged rules / contact-state checks`);
