import { test } from 'node:test';
import assert from 'node:assert/strict';
import rules from '../content/levels/clear-corridor/level.json';
import skin from '../content/levels/clear-corridor/skins/paperbook.json';
import { validatePackage } from '../app/game/runtime/validate';
import { createRun, reduceRun, enabled, completedForReward } from '../app/game/runtime/engine';
import { relevantZones, resolveDragPlacement } from '../app/game/runtime/drop-zones';
import { scenePoses } from '../app/game/runtime/scene';
import { CollectionCueTimeline } from '../app/game/scene-hunt/collection-cues';
import type { Run } from '../app/game/runtime/schema';
const pack=validatePackage(rules,skin);
const items=['box','chair','case','scooter'];
const tick=(run:Run,ms:number)=>{for(let n=0;n<ms;n+=100)run=reduceRun(pack,run,{type:'tick',ms:Math.min(100,ms-n)});return run;};
const act=(run:Run,id:string)=>{const rule=pack.rules.interactions.find(r=>r.id===id)!;return tick(reduceRun(pack,run,{type:'interact',input:{source:rule.source,mode:rule.mode,target:rule.target}}),pack.skin.animations[rule.animation].durationMs);};
const sorted=()=>items.reduce((run,id)=>act(run,'store-'+id),createRun(pack));
test('corridor keeps stable identity and four existing visible props, plus gated inspection',()=>{
 assert.equal(pack.rules.id,'clear-corridor');assert.equal(pack.rules.risk.seconds,50);
 assert.deepEqual(pack.rules.goals.filter(g=>g.showTarget!==false).map(g=>g.object),items);
 for(const id of items)assert.equal(pack.skin.assets[id].src,`/levels/transcript-v1/${id}.png`);
 assert.equal(pack.rules.objects.find(o=>o.id==='inspector')?.hudAction,true);
 assert.equal(pack.skin.background,'corridor-room');
});
for(const id of items)test(`corridor ${id}: selecting/tapping alone never awards; only own storage works`,()=>{
 const initial=createRun(pack);assert.equal(reduceRun(pack,initial,{type:'interact',input:{source:id,mode:'tap'}}),initial);
 assert.deepEqual(relevantZones(pack,initial,id),['storage','corner','fire-access']);
 for(const target of ['corner','fire-access']){
  const start=reduceRun(pack,initial,{type:'interact',input:{source:id,mode:'drop',target,point:{x:500,y:700}}});
  assert.match(start.notice!.text,/公共楼道|消防设施/);assert.equal(start.mistakes,0);
  const returned=tick(start,700);assert.deepEqual(returned.resolved,[]);assert.equal(returned.phase,'playing');
  const pose=scenePoses(pack,returned).find(p=>p.id===id)!;assert.equal(pose.x,pack.skin.poses[id].x);assert.equal(pose.y,pack.skin.poses[id].y);assert.equal(pose.opacity??1,1);
  const recovered=act(returned,'store-'+id);assert(recovered.resolved.includes(id+'-stored'));assert.equal(recovered.stars,0);
 }
});
test('corridor inspection cannot start early or be skipped for a reward',()=>{
 let run=createRun(pack);const inspector=pack.rules.objects.find(o=>o.hudAction)!;
 for(const id of items){assert.equal(enabled(inspector,run),false);assert.equal(reduceRun(pack,run,{type:'interact',input:{source:'inspector',mode:'tap'}}),run);run=act(run,'store-'+id);}
 assert.equal(enabled(inspector,run),true);assert.equal(run.phase,'playing');assert.equal(completedForReward(run),false);assert.equal(run.stars,0);
 const checking=reduceRun(pack,run,{type:'interact',input:{source:'inspector',mode:'tap'}});
 assert.equal(checking.action?.rule,'check-route');assert.equal(tick(checking,4799).phase,'playing');
 const end=tick(checking,4800);assert.equal(end.phase,'settling');assert.equal(end.stars,3);
 assert.equal(completedForReward(tick(end,2000)),true);
});
test('corridor final inspection accepted before deadline finishes safely, but late checks fail',()=>{
 const before={...sorted(),elapsed:49999};
 const checking=reduceRun(pack,before,{type:'interact',input:{source:'inspector',mode:'tap'}});
 assert.equal(tick(checking,4800).phase,'settling');
 const late=reduceRun(pack,{...before,elapsed:50000},{type:'interact',input:{source:'inspector',mode:'tap'}});
 assert.equal(late.phase,'failed');assert.equal(late.stars,0);
 assert.equal(tick({...sorted(),elapsed:49999},1).phase,'failed');
});
test('corridor pause freezes inspection, duplicate taps do not double-award, retry resets',()=>{
 const checking=reduceRun(pack,sorted(),{type:'interact',input:{source:'inspector',mode:'tap'}});
 assert.equal(reduceRun(pack,checking,{type:'tick',ms:100,paused:true}),checking);
 assert.equal(reduceRun(pack,checking,{type:'interact',input:{source:'inspector',mode:'tap'}}),checking);
 const finished=tick(checking,7000);assert.equal(finished.stars,3);assert.equal(finished.resolved.length,5);
 assert.deepEqual(reduceRun(pack,finished,{type:'reset'}),createRun(pack));
});
test('corridor drop preview and near-edge release agree; check-only zones cannot receive objects',()=>{
 const run=createRun(pack),pose=pack.skin.poses.box;
 assert(!relevantZones(pack,run,'box').includes('clear-path'));
 const placement=resolveDragPlacement(pack,run,'box',{x:578,y:735},{x:0,y:pose.h/2},pose);
 assert.equal(placement.target,'storage');
});
test('corridor authored wrong choices have one gentle return cue, not a success cue',()=>{
 const timeline=new CollectionCueTimeline();const run=reduceRun(pack,createRun(pack),{type:'interact',input:{source:'box',mode:'drop',target:'corner'}});
 assert.equal(timeline.advance(run,pack.rules.interactions),'invalid-return');assert.equal(timeline.advance(run,pack.rules.interactions),null);
});
test('corridor animated resident is hidden before checking and uses valid alpha frames',()=>{
 assert.equal(scenePoses(pack,createRun(pack)).find(p=>p.id==='inspector')!.opacity,0);
 const run=reduceRun(pack,sorted(),{type:'interact',input:{source:'inspector',mode:'tap'}});
 const during=scenePoses(pack,tick(run,2000)).find(p=>p.id==='inspector')!;assert.equal(during.opacity,1);assert.match(during.asset,/resident-walk-/);
 for(let i=0;i<4;i++){const a=pack.skin.assets['resident-walk-'+i];assert.equal(a.alpha,true);assert.equal(a.src,`/levels/corridor-learning-v2/resident-walk-${i}.png`);}
});
test('inspection schema rejects unknown zones, unordered checks and unsupported action types',()=>{
 for(const mutate of [
  (p:any)=>p.skin.animations['check-route'].checks[0].zone='missing',
  (p:any)=>p.skin.animations['check-route'].checks[1].at=0,
  (p:any)=>p.skin.animations['check-route'].durationMs=6001,
  (p:any)=>p.skin.animations['check-route'].checks=[],
  (p:any)=>p.rules.objects[0].hudAction=true,
 ]){const p=structuredClone(pack);mutate(p);assert.throws(()=>validatePackage(p.rules,p.skin));}
});