import {test} from 'node:test';import assert from 'node:assert/strict';
import {sparkFrame,validateSparks} from '../app/game/scene-hunt/electric';
import {getHunt,huntPacks} from '../app/game/scene-hunt/registry';
import {createHunt,reduceHunt} from '../app/game/scene-hunt/model';
const pack=getHunt('bedroom-night-check-v2')!;
test('only requested bedroom enables anchored sparks with a bounded cadence',()=>{
 assert.deepEqual(huntPacks.filter(p=>p.skin.effects?.electricSparks).map(p=>p.rules.id),[pack.rules.id]);
 const s=pack.skin.effects!.electricSparks![0];validateSparks([s],720,1280);
 assert.equal(sparkFrame(s,899).active,false);assert.equal(sparkFrame(s,1000).active,true);assert.equal(sparkFrame(s,1260).active,false);
 assert.equal(sparkFrame(s,5100).slot,1);assert.throws(()=>validateSparks([{...s,periodMs:100}],720,1280));
});
test('miss during a circle costs 5s without skipping animation; exhaustion cancels the mark',()=>{
 const rules=pack.rules,start=reduceHunt(rules,createHunt(),{type:'start'}),tap={type:'tap' as const,id:rules.targets[0].id,x:100,y:200};
 const busy=reduceHunt(rules,start,tap),miss={...tap,id:null};
 const next=reduceHunt(rules,busy,miss);assert.equal(next.elapsed,5000);assert.equal(next.marking?.age,0);assert.equal(next.penaltyFeedback?.age,0);
 const failed=reduceHunt(rules,{...busy,elapsed:47000},miss);assert.equal(failed.phase,'failed');assert.equal(failed.marking,null);assert.equal(failed.stars,0);
 const final={...busy,found:rules.targets.slice(1).map(t=>t.id)};assert.equal(reduceHunt(rules,final,miss),final);
});
