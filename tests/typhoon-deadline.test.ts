import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHunt,reduceHunt,type HuntRun} from '../app/game/scene-hunt/model';
import {getHunt,huntPacks} from '../app/game/scene-hunt/registry';
import {checkHunt} from '../app/game/scene-hunt/schema';
const pack=getHunt('typhoon-home')!,rules=pack.rules;
test('typhoon disables scream samples without changing the storm profile or deadline',()=>{
 assert.equal(pack.presentation?.characterAudio,'none');
 assert.equal(pack.presentation?.audio,'storm');
 assert.equal(rules.seconds,50);
 assert.equal(rules.timeout,'fail');
});
const tap=(r:HuntRun,id:string)=>reduceHunt(rules,r,{type:'tap',id,x:100,y:100});
const tick=(r:HuntRun,ms:number)=>{while(ms>0){const dt=Math.min(ms,100);r=reduceHunt(rules,r,{type:'tick',ms:dt});ms-=dt;}return r;};
function found(n:number){let r=reduceHunt(rules,createHunt(),{type:'start'});for(const t of rules.targets.slice(0,n))r=tick(tap(r,t.id),800);return r;}
for(let n=0;n<5;n++)test(`${n}/5 at exactly 50s fails and remains terminal`,()=>{
 let r=found(n);r=tick(r,49999-r.elapsed);assert.equal(r.phase,'playing');
 r=tick(r,1);assert.equal(r.phase,'failed');assert.equal(r.elapsed,50000);assert.equal(r.found.length,n);assert.equal(r.stars,0);
 assert.equal(tap(r,rules.targets[n].id),r);assert.equal(tick(r,2000),r);
 assert.equal(reduceHunt(rules,r,{type:'start'}),r);
 const retry=reduceHunt(rules,r,{type:'reset'});assert.deepEqual(retry,createHunt());
 assert.equal(reduceHunt(rules,retry,{type:'start'}).phase,'playing');
});
test('final valid tap at 49.999s earns completion after required animation',()=>{
 let r=found(4);r=tick(r,49999-r.elapsed);r=tap(r,rules.targets[4].id);
 r=tick(r,799);assert.equal(r.phase,'playing');assert.equal(r.elapsed,50000);assert.equal(r.marking?.age,799);
 r=tick(r,1);assert.equal(r.phase,'reveal');assert.equal(r.stars,3);assert.equal(r.found.length,5);
 r=tick(r,rules.revealMs);assert.equal(r.phase,'complete');
});
test('tap at 50.000s cannot rescue the round even before the next frame tick',()=>{
 const r=tap({...found(4),elapsed:50000},rules.targets[4].id);
 assert.equal(r.phase,'failed');assert.equal(r.stars,0);
});
test('pending nonfinal valid tap is counted in the failure message, not as a win',()=>{
 let r=found(3);r=tick(r,49999-r.elapsed);r=tap(r,rules.targets[3].id);r=tick(r,1);
 assert.equal(r.phase,'failed');assert.equal(r.found.length,4);assert.equal(r.marking,null);assert.equal(r.stars,0);
});
test('timely completion, duplicate taps and reset have no duplicate rewards',()=>{
 let r=found(5);assert.equal(r.phase,'reveal');assert.equal(r.stars,3);
 const after=tap(r,rules.targets[4].id);assert.equal(after,r);
 r=tick(r,rules.revealMs);assert.equal(r.phase,'complete');assert.equal(tick(r,50000),r);
 assert.deepEqual(reduceHunt(rules,r,{type:'reset'}),createHunt());
});
test('all hunt packs fail at the deadline and win after reset with timely input',()=>{
 for(const p of huntPacks.filter(p=>p.rules.id!==rules.id)){
  let r=reduceHunt(p.rules,createHunt(),{type:'start'});
  for(let i=0;i<1100;i++)r=reduceHunt(p.rules,r,{type:'tick',ms:100});
  assert.equal(r.phase,'failed',p.rules.id);assert.equal(r.peak,true);assert.equal(r.stars,0);assert.equal(r.elapsed,50000);
  r=reduceHunt(p.rules,reduceHunt(p.rules,r,{type:'reset'}),{type:'start'});
  for(const t of p.rules.targets){r=reduceHunt(p.rules,r,{type:'tap',id:t.id,x:1,y:1});for(let i=0;i<8;i++)r=reduceHunt(p.rules,r,{type:'tick',ms:100});}
  assert.equal(r.phase,'reveal',p.rules.id);
 }
});
test('unknown timeout policy is rejected by the content gate',()=>{
 const invalid=structuredClone(pack) as any;invalid.rules.timeout='typo';assert.throws(()=>checkHunt(invalid),/timeout/);
});
