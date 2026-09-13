import test from 'node:test';
import assert from 'node:assert/strict';
// Restored shipping indoor edition: test the actual production package.
import rules from '../content/levels/flood-highground-practice/level.json';
import skin from '../content/levels/flood-highground-practice/skins/paper-gouache.json';
import alias from '../content/levels/flood-highground-practice/skins/illustrated.json';
import { validatePackage } from '../app/game/runtime/validate';
import { createRun, reduceRun, findRule } from '../app/game/runtime/engine';
import { scenePoses } from '../app/game/runtime/scene';
const pack=validatePackage(rules,skin);
const advance=(run:ReturnType<typeof createRun>,ms:number)=>{for(let t=0;t<ms;t+=20)run=reduceRun(pack,run,{type:'tick',ms:Math.min(20,ms-t)});return run;};
const act=(run:ReturnType<typeof createRun>,id:string)=>{const r=pack.rules.interactions.find(r=>r.id===id)!;assert.equal(findRule(pack,run,r)?.id,id);return reduceRun(pack,run,{type:'interact',input:r});};
const done=(run:ReturnType<typeof createRun>,id:string)=>{const n=act(run,id);return advance(n,n.action!.duration);};
const poses=(run:ReturnType<typeof createRun>)=>Object.fromEntries(scenePoses(pack,run,true).map(p=>[p.id,p]));
const above=()=>done(createRun(pack),'reach-higher-level');
const permutations=(xs:string[]):string[][]=>xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>i!==j)).map(p=>[x,...p])):[[]];

test('both skin aliases validate; all six goals and rule identities retained',()=>{
 validatePackage(rules,alias);assert.deepEqual({...skin,id:''},{...alias,id:''});assert.equal(pack.rules.goals.length,6);
 assert.equal(pack.skin.presentation!.audio!.ambientProfile,'flood-window');
 assert(!pack.skin.presentation!.audio!.emergency);assert.equal(pack.rules.risk.timeout,undefined);
});
test('four upstairs props have separate visible bounds; not present downstairs',()=>{
 const ids=['phone','bottled-water','battery-radio','bright-cloth'],p=poses(above()),initial=poses(createRun(pack));
 for(const id of ids){assert.equal(initial[id].opacity,0);assert.equal(p[id].opacity,1);assert(p[id].x>=0&&p[id].x+p[id].w<=720);}
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
  const a=p[ids[i]],b=p[ids[j]];
  assert(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,ids[i]+' vs '+ids[j]);
 }
});
test('reaching higher floor replaces running with protective standing pose',()=>{
 assert.equal(poses(createRun(pack)).family.asset,'family-initial');
 assert.equal(poses(above()).family.asset,'family-calm');
 assert.equal(poses(above())['world-scene'].asset,'upstairs-background');
});
test('call is a visible in-hand phone pose; table phone hidden only during call',()=>{
 const run=above(),action=act(run,'contact-rescue');
 const mid=poses(advance(action,650));assert.equal(mid.family.asset,'family-calling');assert.equal(mid.phone.opacity,0);
 const end=poses(advance(action,1500));assert.equal(end.phone.opacity,1);assert.equal(end.family.asset,'family-calm');
});
test('signaling consumes standalone cloth and visibly puts it in mother hand',()=>{
 const run=above(),action=act(run,'signal-from-inside');
 const mid=poses(advance(action,700));assert.equal(mid.family.asset,'family-signal-high');assert.equal(mid['bright-cloth'].opacity,0);
 const end=advance(action,1500),p=poses(end);assert.equal(p['bright-cloth'].opacity,0);assert.equal(p['bright-cloth'].blockInput,false);
 const a=scenePoses(pack,{...end,elapsed:2400}).find(p=>p.id==='family')!,b=scenePoses(pack,{...end,elapsed:3100}).find(p=>p.id==='family')!;
 assert.notEqual(a.asset,b.asset);assert.equal(a.y+a.h,b.y+b.h);assert.equal(a.w,b.w);
 assert(p.family.y+p.family.h>800&&p.family.y+p.family.h<880,'feet inside dry room, not on sill');
});
test('call after signaling restores the previous hand-held-cloth pose without a jump',()=>{
 const run=done(above(),'signal-from-inside'),home=poses(run).family,action=act(run,'contact-rescue');
 const last=poses(advance(action,1499)).family,end=poses(advance(action,1500)).family;
 for(const key of ['asset','x','y','w','h']as const){assert.equal(last[key],home[key]);assert.equal(end[key],home[key]);}
 assert.equal(poses(advance(action,1500))['bright-cloth'].opacity,0);
});
test('every ordering of the four upstairs tasks remains playable; waiting needs all',()=>{
 for(const order of permutations(['contact-rescue','place-water','monitor-updates','signal-from-inside'])){
  let run=above();run=done(run,'early-wait');assert.equal(run.resolved.length,1);
  for(const id of order){run=done(run,id);assert.equal(run.stars,0);}
  run=done(run,'wait-at-height');assert.equal(run.phase,'settling');assert.equal(run.stars,3);assert.equal(run.resolved.length,6);
  const p=poses(run);assert.equal(p.family.asset,'family-waiting');assert.equal(p['bright-cloth'].opacity,0);assert.equal(p['bottled-water'].y+p['bottled-water'].h,936.7);
  assert.equal(advance(run,6000).phase,'complete');
 }
});
test('errors award nothing and do not strand the run; restart clears state',()=>{
 let run=done(createRun(pack),'enter-flood-error');assert.equal(run.resolved.length,0);assert.equal(run.mistakes,1);
 run=done(run,'reach-higher-level');run=done(run,'return-lower-error');assert.deepEqual(run.resolved,['at-higher-level']);
 const reset=reduceRun(pack,run,{type:'reset'});assert.deepEqual(reset.resolved,[]);assert.equal(poses(reset).family.asset,'family-initial');
});
