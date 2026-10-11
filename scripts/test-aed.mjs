import assert from 'node:assert/strict';
import { getRuntime, readJSON, readPackage } from './lib/packages.mjs';
import { dependency, root } from './lib/dependencies.mjs';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
fs.mkdirSync(path.join(root,'outputs/aed-verification'),{recursive:true});
const runtime=await getRuntime();
const bundle=path.join(root,'outputs/aed-verification/scene-test.mjs');
await dependency('esbuild').build({stdin:{contents:"export * from './app/game/runtime/scene';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:bundle,logLevel:'silent'});
const {scenePoses}=await import(pathToFileURL(bundle).href);
const pack=await readPackage({id:'first-aid-aed',skin:'illustrated'});
let checks=0;
const verify=(condition,message)=>{assert(condition,message);checks++};
const advance=(run,ms)=>{for(let t=0;t<ms;t+=100)run=runtime.reduceRun(pack,run,{type:'tick',ms:Math.min(100,ms-t)});return run};
const input=(run,source,mode='tap',target)=>runtime.reduceRun(pack,run,{type:'interact',input:{source,mode,target}});
const act=(run,source,mode='tap',target)=>advance(input(run,source,mode,target),600);
const pose=(run,id)=>scenePoses(pack,run,true).find(p=>p.id===id);
for(const scenario of pack.rules.scenarios){
 let r=runtime.createRun(pack,scenario.id);
 verify(r.scenarioId===scenario.id,'fixed case at entry');
 const moving={...r,elapsed:300};verify(scenePoses(pack,moving,false).find(p=>p.id==='helper').asset==='helper-press-b','CPR has active press/release frames');
 const paused=runtime.reduceRun(pack,r,{type:'tick',ms:250,paused:true});assert.deepEqual(paused,r);
 r=act(r,'shock');verify(!r.resolved.includes('branch-ready'),'no shock before power');
 r=act(r,'device','drop','device-zone');r=act(r,'power');
 const early=act(r,'clear');verify(!early.resolved.includes('cleared')&&pose(early,'helper').asset==='helper-press-a','preparation must not stop CPR');
 r=act(r,'pad-upper','drop','upper-zone');verify(!r.resolved.includes('pad-upper-on'),'cannot attach before exposing/drying');
 r=act(r,'shirt');r=act(r,'cloth','drop','chest-zone');
 const wrong=act(r,'pad-upper','drop','side-zone');verify(!wrong.resolved.includes('pad-upper-on')&&wrong.mistakes>r.mistakes,'wrong location recoverable');
 if(scenario.id==='shock-advised'){r=act(r,'pad-upper','drop','upper-zone');r=act(r,'pad-side','drop','side-zone')}else{r=act(r,'pad-side','drop','side-zone');r=act(r,'pad-upper','drop','upper-zone')}
 verify(pose(r,'pad-upper').x===314&&pose(r,'pad-side').x===392,'pads physically snap');
 verify(pose(r,'lead-upper').opacity===1&&pose(r,'lead-side').opacity===1,'both leads remain connected');
 verify(pose(r,'helper').asset==='helper-press-a','CPR continues during all preparation');
 r=act(r,'clear');verify(pose(r,'helper').asset==='helper-clear','analysis hands off');
 verify(!(r.stages??[]).includes('analyzed'),'analysis not instantaneous');
 const bad=act(r,'helper');verify(!bad.resolved.includes('resumed')&&pose(bad,'helper').asset==='helper-clear','no touching during analysis');
 r=advance(r,1900);verify(r.stages.includes('analyzed'),'analysis result waits for device');
 if(scenario.id==='shock-advised'){
   let badShock=act(r,'shock');verify(!badShock.resolved.includes('branch-ready'),'must reconfirm nobody touching');
   r=act(r,'clear');verify(r.resolved.includes('shock-clear'),'electric shock safety reconfirmed');
   badShock=act(r,'shock');verify(!badShock.resolved.includes('branch-ready'),'no shock before device ready');
   r=advance(r,1000);r=act(r,'shock');verify(r.resolved.includes('branch-ready')&&!r.resolved.includes('resumed'),'shock does not equal restored CPR');
 }else{
   const badShock=act(r,'shock');verify(!badShock.resolved.includes('branch-ready'),'no-shock decision cannot deliver shock');
 }
 r=act(r,'helper');verify(r.resolved.includes('resumed')&&pose(r,'helper').asset==='helper-press-a','immediate CPR resume in both branches');
 verify(r.phase==='playing','resume alone is not handover');
 r=act(r,'handover');r=advance(r,1500);verify(runtime.completedForReward(r)&&r.stars===3,'both branches can complete');
 verify(pose(r,'lead-upper').opacity===1&&pose(r,'pad-side').x===392,'finish does not remove AED');
 const duplicate=act(r,'handover');assert.deepEqual(duplicate,r);
 const reset=runtime.reduceRun(pack,r,{type:'reset'});verify(reset.phase==='playing'&&!reset.resolved.includes('placed')&&!reset.resolved.includes('resumed'),'restart clears player actions');
}
assert.throws(()=>runtime.createRun(pack,'unknown'));
// Every declared scenario must be solvable; immutable scenario facts cannot be awarded.
const broken=structuredClone(pack.rules);broken.interactions=broken.interactions.filter(r=>r.id!=='resume-without-shock');assert.throws(()=>runtime.validatePackage(broken,pack.skin),/无法通关/);
const altered=structuredClone(pack.rules);altered.interactions[0].grants.push('shockable');assert.throws(()=>runtime.validatePackage(altered,pack.skin),/只读/);
const preAward=structuredClone(pack.rules);preAward.scenarios[0].initialGoals.push('placed');assert.throws(()=>runtime.validatePackage(preAward,pack.skin),/预先/);
fs.writeFileSync(path.join(root,'outputs/aed-verification/rules-report.json'),JSON.stringify({status:'passed',checks,scenarios:pack.rules.scenarios.map(s=>s.id)},null,2));
console.log(`PASS: AED ${checks} rule/pose checks, both device branches, pause/reset, validator rejection tests`);
