import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { validatePackage } from '../app/game/runtime/validate';
import { createRun, reduceRun, emotion } from '../app/game/runtime/engine';
import { scenePoses, pickObject, cameraFor, toWorld } from '../app/game/runtime/scene';
import { ConfiguredPlayer } from '../components/game/configured/player';
import type { LevelPackage, Run, Interaction } from '../app/game/runtime/schema';
const ids=['flood-kit','clear-corridor','lift-wait','well-call'];
const json=(p:string)=>JSON.parse(readFileSync(join(process.cwd(),p),'utf8'));
const pack=(id:string)=>validatePackage(json(`content/levels/${id}/level.json`),json(`content/levels/${id}/skins/paperbook.json`));
const tick=(p:LevelPackage,r:Run,ms:number)=>{for(let n=0;n<ms;n+=100)r=reduceRun(p,r,{type:'tick',ms:Math.min(100,ms-n)});return r;};
const start=(p:LevelPackage,r:Run,i:Interaction)=>reduceRun(p,r,{type:'interact',input:{source:i.source,mode:i.mode,target:i.target}});
const act=(p:LevelPackage,r:Run,i:Interaction)=>tick(p,start(p,r,i),p.skin.animations[i.animation].durationMs);
const permutations=<T,>(a:T[]):T[][]=>a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>i!==j)).map(rest=>[v,...rest])):[[]];
test('all 53 manuscripts have explicit dispositions; missing14 and specialist gates not silently enabled',()=>{
 const d=json('docs/transcript-batch-v1/设计与审查清单.json');assert.equal(d.entries.length,53);assert.equal(new Set(d.entries.map((e:any)=>e.number)).size,53);assert.equal(d.entries.some((e:any)=>e.number===14),false);assert.equal(d.firstBatch.length,4);
 for(const e of d.entries){assert.ok(e.excluded.length);assert.ok(e.scene);assert.ok(e.acceptance);assert.match(e.sha256,/^[a-f0-9]{64}$/);}
});
for(const id of ids){
 const p=pack(id),correct=p.rules.interactions.filter(i=>i.outcome==='correct');
 for(const [n,order] of permutations(correct).entries())test(`${id}: legal order ${n+1}/${permutations(correct).length}`,()=>{
  let r=createRun(p);for(const i of order)r=act(p,r,i);r=tick(p,r,2000);
  assert.equal(r.phase,'complete');assert.deepEqual([...r.resolved].sort(),[...p.rules.completion.requires].sort());assert.equal(r.stars,3);
 });
 test(`${id}: waiting for 20 minutes never creates a fictitious disaster or reduces score`,()=>{
  let r=tick(p,createRun(p),20*60*1000);assert.equal(r.risk,0);assert.equal(r.peakSeen,false);assert.equal(r.phase,'playing');
  for(const i of correct)r=act(p,r,i);assert.equal(tick(p,r,2000).stars,3);
 });
 test(`${id}: animation durations, late commits, duplicate immunity, final pose continuity`,()=>{
  let r=createRun(p);
  for(const i of correct){const duration=p.skin.animations[i.animation].durationMs;assert.ok(duration>=500&&duration<=1500);
   let during=tick(p,start(p,r,i),duration-1);assert.ok(i.grants.every(g=>!during.resolved.includes(g)));assert.equal(start(p,during,i),during);
   const endPoses=scenePoses(p,{...during,action:{...during.action!,age:duration}});
   r=tick(p,during,1);assert.ok(i.grants.every(g=>r.resolved.includes(g)));assert.equal(start(p,r,i),r);
   const committed=scenePoses(p,r);for(const t of p.skin.animations[i.animation].tracks){const before=endPoses.find(o=>o.id===t.object)!,after=committed.find(o=>o.id===t.object)!;for(const k of ['x','y','w','h','opacity','rotation'] as const)assert.ok(Math.abs((before[k]??(k==='opacity'?1:0))-(after[k]??(k==='opacity'?1:0)))<.1,`${id}/${i.id}/${k} jumped`);}
  }
 });
 for(const bad of p.rules.interactions.filter(i=>i.outcome==='danger'))test(`${id}: ${bad.id} has expression/feedback but no reward and remains recoverable`,()=>{
  let r=start(p,createRun(p),bad);assert.equal(r.mistakes,1);assert.equal(emotion(p,r),'panicked');assert.ok(r.notice?.text);assert.deepEqual(r.resolved,[]);assert.equal(r.risk,0);
  r=tick(p,r,1500);for(const i of correct)r=act(p,r,i);r=tick(p,r,2000);assert.equal(r.phase,'complete');assert.equal(r.stars,2);
 });
 test(`${id}: reset is local and does not leak state or score`,()=>{let r=act(p,createRun(p),correct[0]);r=reduceRun(p,r,{type:'reset'});assert.deepEqual(r,createRun(p));});
 test(`${id}: image swapping keeps gameplay identical`,()=>{
  const q=structuredClone(p);for(const a of Object.values(q.skin.assets))a.src=a.src.replace('/transcript-v1/','/alternate/');
  validatePackage(q.rules,q.skin);const play=(x:LevelPackage)=>correct.reduce((r,i)=>act(x,r,i),createRun(x));assert.deepEqual(play(p),play(q));
 });
 for(const [w,h] of [[320,740],[390,844]])test(`${id}: ${w}px contain camera cannot crop required objects`,()=>{
  const c=cameraFor(p,w,h);for(const o of p.rules.objects){const b=p.skin.poses[o.id];assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=720&&b.y+b.h<=1280);const pt={x:b.x+b.w/2,y:b.y+b.h/2};const screen={x:c.x+pt.x*c.scale,y:c.y+pt.y*c.scale};assert.ok(screen.x>=0&&screen.x<=w&&screen.y>=0&&screen.y<=h);const back=toWorld(p,screen,{left:0,top:0,width:w,height:h});assert.ok(Math.abs(back.x-pt.x)<.001);}
 });
 test(`${id}: HUD does not expose response answer checklist or fake disaster countdown`,()=>{
  const html=renderToStaticMarkup(createElement(ConfiguredPlayer,{pack:p,onBack:()=>{},onFinish:()=>{}}));assert.ok(html.includes('训练用时'));assert.ok(!html.includes('风险倒计时'));
  if(p.rules.kind==='response')assert.ok(!html.includes('configured-targets'));
  else for(const g of p.rules.goals)assert.ok(html.includes(p.skin.assets[p.skin.poses[g.object].asset].src));
 });
}
test('waiting/rescue endings never open elevator doors or remove the open hazardous well',()=>{
 for(const id of ['lift-wait','well-call']){const p=pack(id);let r=createRun(p);for(const i of p.rules.interactions.filter(i=>i.outcome==='correct'))r=act(p,r,i);r=tick(p,r,2000);assert.equal(p.rules.completion.status,'待援');const object=id==='lift-wait'?'door':'well';assert.deepEqual(scenePoses(p,r).find(o=>o.id===object),{...p.skin.poses[object],id:object});}
});
test('phone call targets remain distinct and tapping one cannot produce the other goal',()=>{
 const p=pack('well-call'),r=createRun(p);for(const id of ['fire-call','medical-call']){const b=p.skin.poses[id];assert.equal(pickObject(p,r,{x:b.x+b.w/2,y:b.y+b.h/2},()=>true),id);}
 const first=p.rules.interactions.find(i=>i.source==='medical-call')!;const after=act(p,r,first);assert.deepEqual(after.resolved,['medical-called']);
});
test('new optional schema fields fail closed on typos or invalid references',()=>{
 for(const mutate of [(p:any)=>p.skin.zoneLabels={nope:'x'},(p:any)=>p.skin.zoneLabels='bad',(p:any)=>p.skin.labels[0].object='nope',(p:any)=>p.skin.labels[0].color='red',(p:any)=>p.skin.labels[0].when={all:['nope']},(p:any)=>p.rules.risk.mode='countdown',(p:any)=>p.rules.risk.initial=50]){const p=pack('lift-wait');mutate(p);assert.throws(()=>validatePackage(p.rules,p.skin));}
});
