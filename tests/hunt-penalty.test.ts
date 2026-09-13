import {test} from 'node:test';
import assert from 'node:assert/strict';
import {huntPacks} from '../app/game/scene-hunt/registry';
import {createHunt,reduceHunt} from '../app/game/scene-hunt/model';
import {configuredPackages} from '../app/game/content/generated';
import {createRun,reduceRun} from '../app/game/runtime/engine';
import {HUNT_MISS_PENALTY_SECONDS} from '../app/game/challenge/rules';
import {disasterPacks} from '../app/game/disaster/registry';
test('street configuration shares the same five-second policy',()=>{
 for(const p of disasterPacks.filter(p=>p.rules.kind==='prevention'))assert.equal(p.rules.missPenalty,HUNT_MISS_PENALTY_SECONDS);
});
test('all nine recognition levels: each miss costs 5s; deadline, busy, found, retry',()=>{
 assert.equal(HUNT_MISS_PENALTY_SECONDS,5); assert.equal(huntPacks.length,9);
 for(const p of huntPacks){
  const rules=p.rules,miss={type:'tap' as const,id:null,x:20,y:20};
  const ready=createHunt();assert.equal(reduceHunt(rules,ready,miss),ready);
  let r=reduceHunt(rules,ready,{type:'start'});
  r=reduceHunt(rules,r,miss);assert.equal(r.elapsed,5000);
  r=reduceHunt(rules,r,miss);assert.equal(r.elapsed,10000);
  const target=rules.targets[0].id,found={...r,found:[target]};
  assert.equal(reduceHunt(rules,found,{...miss,id:target}),found);
  const busy={...r,marking:{id:target,age:0}},penalized=reduceHunt(rules,busy,miss);
  assert.equal(penalized.elapsed,busy.elapsed+5000);assert.equal(penalized.marking,busy.marking);
  assert.equal(reduceHunt(rules,busy,{...miss,id:target}),busy);
  r=reduceHunt(rules,{...r,elapsed:46000},miss);
  assert.equal(r.phase,'failed');assert.equal(r.elapsed,50000);assert.equal(r.stars,0);
  assert.equal(reduceHunt(rules,r,miss),r);assert.deepEqual(reduceHunt(rules,r,{type:'reset'}),ready);
 }
});
test('two collections opt in; response levels unaffected; no extra score penalty',()=>{
 const collections=configuredPackages.filter(p=>p.rules.kind==='prevention'&&p.rules.risk.timeout==='fail');assert.equal(collections.length,2);
 for(const p of configuredPackages){
  const start=createRun(p),next=reduceRun(p,start,{type:'miss'});
  if(!collections.includes(p)){assert.equal(next,start);continue;}
  assert.equal(next.elapsed,5000);assert.equal(next.mistakes,0);assert.match(next.notice!.text,/−5/);
  assert.equal(reduceRun(p,next,{type:'miss'}).elapsed,10000);
  const end=reduceRun(p,{...next,elapsed:49000},{type:'miss'});assert.equal(end.phase,'failed');assert.equal(end.stars,0);assert.equal(end.elapsed,50000);
  assert.deepEqual(reduceRun(p,end,{type:'reset'}),start);
  const paused=reduceRun(p,next,{type:'tick',ms:100,paused:true});assert.equal(paused,next);
 }
});
