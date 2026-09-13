import test from 'node:test';import assert from 'node:assert/strict';
import rules from '../content/levels/fire-stairs-practice/level.json';
import skin from '../content/levels/fire-stairs-practice/skins/paper-gouache.json';
import alias from '../content/levels/fire-stairs-practice/skins/illustrated.json';
import {validatePackage} from '../app/game/runtime/validate';
import {createRun,reduceRun,findRule} from '../app/game/runtime/engine';
import {scenePoses} from '../app/game/runtime/scene';
import {PracticeCueTimeline,synthesiseCue} from '../app/game/runtime/practice-audio';
import {presentationFrame} from '../app/game/runtime/presentation';
const pack=validatePackage(rules,skin),order=['exit-flat','use-stairs','reach-outside-assembly','report-fire'];
const advance=(run:ReturnType<typeof createRun>,ms:number)=>{for(let t=0;t<ms;t+=20)run=reduceRun(pack,run,{type:'tick',ms:Math.min(20,ms-t)});return run;};
const act=(run:ReturnType<typeof createRun>,id:string)=>{const r=pack.rules.interactions.find(r=>r.id===id)!;assert.equal(findRule(pack,run,r)?.id,id);return reduceRun(pack,run,{type:'interact',input:r});};
const done=(run:ReturnType<typeof createRun>,id:string)=>{const n=act(run,id);return advance(n,n.action!.duration);};
test('four real actions; no companion label, separate door action or loose phone',()=>{
 validatePackage(rules,alias);assert.equal(pack.rules.goals.length,4);
 for(const id of ['phone','flat-door','companion-alert']){assert(!pack.rules.objects.some(o=>o.id===id));assert(!pack.skin.poses[id]);}
 assert(!JSON.stringify(pack).includes('一起走'));assert(!pack.rules.interactions.some(i=>i.id==='close-flat-door'));
});
test('leaving automatically closes the door without moving a door sprite',()=>{
 const action=act(createRun(pack),'exit-flat');
 for(const t of [0,200,500,720,900,1199]){
  const poses=scenePoses(pack,advance(action,t),true);assert(!poses.some(p=>p.id.includes('door')&&p.id!=='door-wedge'));
  const background=poses.find(p=>p.id==='world-scene')!;assert.deepEqual([background.x,background.y,background.w,background.h],[0,0,720,1280]);
 }
 const run=advance(action,1200);assert.deepEqual(run.resolved,['flat-exited']);
 assert.equal(scenePoses(pack,run,true).find(p=>p.id==='world-scene')!.asset,'corridor-closed');
 assert.equal(findRule(pack,run,{source:'family',mode:'drop',target:'stairs-route'})?.id,'use-stairs');
});
test('phone action is on the family only after safe assembly and stays foot anchored',()=>{
 let run=createRun(pack);assert.equal(findRule(pack,run,{source:'family',mode:'tap'}),undefined);
 for(const id of order.slice(0,3))run=done(run,id);
 const home=scenePoses(pack,run,true).find(p=>p.id==='family')!;
 const action=act(run,'report-fire');
 for(const [ms,asset]of [[180,'family-taking-phone'],[650,'family-taking-phone'],[1150,'family-calling']]as const){
  const p=scenePoses(pack,advance(action,ms),true).find(p=>p.id==='family')!;
  assert.equal(p.asset,asset);assert.equal(p.x,home.x);assert.equal(p.y+p.h,home.y+home.h);assert.equal(p.w,home.w);
 }
 run=advance(action,1500);assert.equal(run.phase,'settling');assert.equal(run.stars,3);
 assert.equal(scenePoses(pack,run,true).find(p=>p.id==='family')!.asset,'family-calling');
 assert.equal(advance(run,5200).phase,'complete');
});
test('pause, replay and incomplete routes cannot award; action must visibly finish',()=>{
 let run=act(createRun(pack),'exit-flat');assert.deepEqual(run.resolved,[]);
 assert.equal(reduceRun(pack,run,{type:'tick',ms:100,paused:true}),run);
 for(const id of order){run=done(id==='exit-flat'?createRun(pack):run,id);}
 assert.deepEqual(reduceRun(pack,run,{type:'reset'}).resolved,[]);
 assert.equal(reduceRun(pack,run,{type:'reset'}).stars,0);
 const waiting=advance(createRun(pack),120000);assert.equal(waiting.phase,'playing');assert.equal(waiting.stars,0);
});
for(const id of ['ordinary-lift-error','return-home-error','smoke-route-error','prop-door-error'])test(id+' remains recoverable and cannot award',()=>{
 let run=done(createRun(pack),'exit-flat');run=done(run,id);assert.equal(run.mistakes,1);assert.deepEqual(run.resolved,['flat-exited']);assert.equal(run.phase,'playing');
 for(const next of order.slice(1))run=done(run,next);assert.equal(run.phase,'settling');
});
test('alarm and cough run indoors and stop outside, with no heartbeat/rescue/speech',()=>{
 const timeline=new PracticeCueTimeline(pack);let run=createRun(pack);
 assert(timeline.advance(run).some(e=>e.id==='fire-alarm'));
 run=advance(run,6700);const indoor=timeline.advance(run);assert(indoor.some(e=>e.id==='nonverbal-cough'));assert(indoor.some(e=>e.id==='fire-alarm'));
 assert.equal(timeline.advance(run).length,0);assert(presentationFrame(pack,run).some(e=>e.kind==='alarm'));
 for(const id of order.slice(0,2))run=done(run,id);
 run=advance(run,9000);assert(!timeline.advance(run).some(e=>['fire-alarm','nonverbal-cough','heartbeat','rescue-arrival'].includes(e.id)));
 assert(!presentationFrame(pack,run).some(e=>e.kind==='alarm'));
 timeline.reset();assert(timeline.advance(createRun(pack)).some(e=>e.id==='fire-alarm'));
});
test('alarm, cough, exit latch and phone are distinct finite non-speech PCM',()=>{
 const signatures=new Set();for(const id of ['fire-alarm','nonverbal-cough','exit-door-latch','telephone-connect']){
  const data=synthesiseCue(id);let energy=0,peak=0;for(const v of data){assert(Number.isFinite(v));energy+=v*v;peak=Math.max(peak,Math.abs(v));}
  assert(energy/data.length>.0001);assert(peak<=.73);signatures.add(data.length+':'+energy.toFixed(5));
 }assert.equal(signatures.size,4);
});
