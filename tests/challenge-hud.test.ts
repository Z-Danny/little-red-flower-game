import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {configuredPackages} from '../app/game/content/generated';
import {createRun,reduceRun} from '../app/game/runtime/engine';
import type {LevelPackage,Run} from '../app/game/runtime/schema';
import {huntPacks} from '../app/game/scene-hunt/registry';
import {presentationOf} from '../app/game/scene-hunt/presentation';
import {performanceTier,performanceStage,distantThunderAge} from '../app/game/scene-hunt/performance';
import {CountdownBar} from '../components/game/scene-hunt/countdown-bar';
const collections=configuredPackages.filter(p=>p.rules.kind==='prevention');
const tick=(p:LevelPackage,r:Run,ms:number)=>{while(ms>0){const dt=Math.min(ms,100);r=reduceRun(p,r,{type:'tick',ms:dt});ms-=dt;}return r;};
const collect=(p:LevelPackage,r:Run,n:number)=>{for(const g of p.rules.goals.slice(0,n)){r=reduceRun(p,r,{type:'interact',input:{mode:'tap',source:g.object}});r=tick(p,r,1500);}return r;};
test('all twelve live challenge packs have a single 50-second budget',()=>{
 assert.equal(huntPacks.length,9);assert.equal(collections.length,2);
 for(const p of huntPacks){assert.equal(p.rules.seconds,50);assert.equal(p.rules.timeout,'fail');assert.equal(presentationOf(p).timer,'pressure-bar');assert.equal(presentationOf(p).clues,'on-demand');}
 for(const p of collections){assert.equal(p.rules.risk.seconds,50);assert.equal(p.rules.risk.timeout,'fail');assert.ok(p.rules.objects.every(o=>o.input==='tap'));}
 const street=JSON.parse(readFileSync('content/disaster/rain-street-preparation-v1/rules.json','utf8'));assert.equal(street.seconds,50);assert.equal(street.goals.length,7);
});
test('progress track has no rendered text or seconds, only accessible progress metadata',()=>{
 for(const elapsed of [0,25000,40000,50000]){
  const html=renderToStaticMarkup(createElement(CountdownBar,{elapsed,seconds:50,resolved:false,deadline:true}));
  assert.equal(html.replace(/<[^>]*>/g,''),'');assert.ok(!html.includes('hunt-countdown-label'));
  assert.ok(html.includes('role="progressbar"'));assert.ok(html.includes('transform:scaleX('));
 }
});
for(const p of collections){
 test(p.rules.id+': terminal failure, pause, no late action, reset and timely collection',()=>{
  let r=createRun(p);assert.equal(reduceRun(p,r,{type:'tick',ms:100,paused:true}),r);
  r=tick(p,r,49999);assert.equal(r.phase,'playing');r=tick(p,r,1);assert.equal(r.phase,'failed');assert.equal(r.stars,0);assert.equal(r.elapsed,50000);
  assert.equal(tick(p,r,10000),r);assert.equal(reduceRun(p,r,{type:'interact',input:{mode:'tap',source:p.rules.goals[0].object}}),r);
  r=reduceRun(p,r,{type:'reset'});assert.deepEqual(r,createRun(p));
  r=collect(p,r,p.rules.goals.length);assert.equal(r.phase,'settling');r=tick(p,r,6000);assert.equal(r.phase,'complete');assert.equal(r.stars,3);
 });
 test(p.rules.id+': final valid click finishes its animation across the deadline, late input fails',()=>{
  let r=collect(p,createRun(p),p.rules.goals.length-1);r=tick(p,r,49999-r.elapsed);
  const source=p.rules.goals.at(-1)!.object;
  assert.equal(reduceRun(p,{...r,elapsed:50000},{type:'interact',input:{mode:'tap',source}}).phase,'failed');
  r=reduceRun(p,r,{type:'interact',input:{mode:'tap',source}});r=tick(p,r,1);assert.equal(r.phase,'playing');assert.equal(r.elapsed,50000);
  r=tick(p,r,1500);assert.equal(r.phase,'settling');assert.equal(r.resolved.length,p.rules.goals.length);
 });
}
test('all seven directed performances reach the strongest tier before timeout',()=>{
 const packs=huntPacks.filter(p=>p.performance);assert.equal(packs.length,7);
 for(const p of packs){assert.equal(p.performance!.timing,'quarters');
  for(const [ms,tier] of [[0,0],[12499,0],[12500,1],[24999,1],[25000,2],[37499,2],[37500,3],[49999,3]]){
   assert.equal(performanceTier(ms,p.rules.seconds),tier);assert.equal(performanceStage(p.performance!,ms,p.rules.seconds),p.performance!.stages[tier]);
  }
 }
 const thunder=packs.find(p=>p.performance!.atmosphere==='thunder')!;
 for(const start of [5000,17500,30000,42500]){assert.equal(distantThunderAge(thunder.performance!,start,50),0);assert.equal(distantThunderAge(thunder.performance!,start+700,50),-1);}
});
test('new template cannot silently restore a 90-second elapsed clock',()=>{
 const t=JSON.parse(readFileSync('content/hunt-template/template.json','utf8'));assert.equal(t.rules.seconds,50);assert.equal(t.rules.timeout,'fail');assert.equal(t.presentation.timer,'pressure-bar');assert.equal(t.presentation.clues,'on-demand');assert.equal(t.performance.timing,'quarters');
});
