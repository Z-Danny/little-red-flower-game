import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePackage } from '../app/game/runtime/validate';
import { createRun, reduceRun, completedForReward, enabled } from '../app/game/runtime/engine';
import { scenePoses } from '../app/game/runtime/scene';
import { CollectionCueTimeline } from '../app/game/scene-hunt/collection-cues';
import type { Run, LevelPackage } from '../app/game/runtime/schema';
const pack = validatePackage(JSON.parse(readFileSync('content/levels/flood-kit/level.json', 'utf8')), JSON.parse(readFileSync('content/levels/flood-kit/skins/paperbook.json', 'utf8')));
const spec = pack.rules.inventory!;
const tick = (run: Run, ms: number) => { for (let n=0;n<ms;n+=100) run=reduceRun(pack,run,{type:'tick',ms:Math.min(100,ms-n)}); return run; };
const tap = (run: Run, id: string) => reduceRun(pack, run, {type:'interact',input:{source:id,mode:'tap'}});
const put = (run: Run, id: string) => tick(tap(run,id),1100);
const fill = (ids: string[]) => ids.reduce(put, createRun(pack));
const combinations = (items: string[], n: number): string[][] => n === 0 ? [[]] : items.flatMap((id,index) => combinations(items.slice(index+1),n-1).map(rest=>[id,...rest]));

for(const items of combinations(spec.items,5)) void test('inventory: departure evaluates '+items.join(','),()=>{
 let run=fill(items);
 assert.equal(run.phase,'playing'); assert.equal(completedForReward(run),false); assert.equal(run.stars,0);
 assert.deepEqual(run.inventory,items);
 const before=tick(run,1000); assert.equal(before.phase,'playing','five items alone never settle');
 run=reduceRun(pack,run,{type:'depart'});
 const correct=items.every(id=>spec.required.includes(id));
 assert.equal(run.phase,correct?'settling':'failed'); assert.equal(run.stars,correct?3:0);
 if(!correct){assert.equal(run.inventoryRejected,true);assert.match(run.notice!.text,/不需要的物品/);assert.match(run.notice!.text,/还缺/);}
 run=tick(run,2000); assert.equal(completedForReward(run),correct);
 assert.equal(reduceRun(pack,run,{type:'depart'}),run,'terminal result cannot be submitted twice');
});

void test('inventory: less than five cannot depart; full inventory rejects sixth item without time penalty',()=>{
 let run=fill(spec.required.slice(0,4)); run=reduceRun(pack,run,{type:'depart'});assert.equal(run.phase,'playing');assert.equal(run.departed,false);
 run=put(run,spec.required[4]);const elapsed=run.elapsed;
 const full=tap(run,'tv-remote');assert.equal(full.inventory?.length,5);assert.equal(full.action,null);assert.equal(full.elapsed,elapsed);assert.match(full.notice!.text,/背包已满/);
 assert.equal(tap(run,'water'),run,'no duplicate item');
});

for(const id of spec.items) void test('inventory: remove '+id+' restores it and clears only its goal',()=>{
 const run=put(createRun(pack),id);assert.deepEqual(run.inventory,[id]);
 assert.equal(scenePoses(pack,run).find(p=>p.id===id)?.opacity,0);
 const next=reduceRun(pack,run,{type:'unpack',source:id});assert.deepEqual(next.inventory,[]);assert.deepEqual(next.resolved,[]);
 assert.equal(enabled(pack.rules.objects.find(o=>o.id===id)!,next),true);
 assert.deepEqual(scenePoses(pack,next).find(p=>p.id===id),{...pack.skin.poses[id],id});
 assert.deepEqual(put(next,id).inventory,[id]);
 assert.deepEqual(reduceRun(pack,run,{type:'reset'}),createRun(pack));
});

void test('inventory: replace unwanted item and succeed; bag inspection never creates a goal',()=>{
 let run=fill(['water','food','torch','radio','tv-remote']);run=reduceRun(pack,run,{type:'unpack',source:'tv-remote'});run=put(run,'whistle');
 assert.equal(reduceRun(pack,run,{type:'depart'}).stars,3);
 assert.equal(pack.rules.goals.length,5);assert.equal(pack.rules.objects.length,8);
});

void test('inventory: action commits late, blocks remove/depart and gives pickup cue to both distractors',()=>{
 for(const id of ['tv-remote','ceramic-ornament']){
  const timeline=new CollectionCueTimeline();let run=tap(createRun(pack),id);
  assert.equal(timeline.advance(run,pack.rules.interactions),'pickup');assert.equal(timeline.advance(run,pack.rules.interactions),null);
  run=tick(run,1099);assert.deepEqual(run.inventory,[]);
  assert.equal(reduceRun(pack,run,{type:'depart'}),run);assert.equal(reduceRun(pack,run,{type:'unpack',source:id}),run);
  assert.deepEqual(tick(run,1).inventory,[id]);
 }
});

void test('inventory: pause freezes packing; timeout and exact departure boundary remain authoritative',()=>{
 let run=tap(createRun(pack),'water');assert.equal(reduceRun(pack,run,{type:'tick',ms:100,paused:true}),run);
 const full=fill(spec.required);run={...full,elapsed:49999};run=reduceRun(pack,run,{type:'depart'});assert.equal(tick(run,2000).phase,'complete');
 run=reduceRun(pack,{...full,elapsed:50000},{type:'depart'});assert.equal(run.phase,'failed');assert.equal(run.stars,0);
 run={...fill(spec.required.slice(0,4)),elapsed:49900};run=tap(run,'whistle');assert.equal(tick(run,1000).phase,'failed','last pickup does not bypass required departure');
 assert.equal(tick({...full,elapsed:49900},200).phase,'failed','full unopened bag still expires');
});

void test('inventory: original artwork, object poses, correct animations and goal IDs remain unchanged',()=>{
 const old=JSON.parse(readFileSync('docs/flood-kit-inventory/previous-config.json','utf8')) as LevelPackage;
 assert.deepEqual(pack.skin.poses,old.skin.poses);assert.deepEqual(pack.skin.assets,old.skin.assets);
 assert.deepEqual(pack.rules.goals,old.rules.goals);assert.deepEqual(pack.rules.completion,old.rules.completion);
 for(const id of spec.required)assert.deepEqual(pack.skin.animations['pack-'+id],old.skin.animations['pack-'+id]);
});

void test('inventory: invalid capacity, duplicates, missing reasons and mismatched goals fail closed',()=>{
 const changes: ((p:LevelPackage)=>void)[]=[p=>{p.rules.inventory!.capacity=4;},p=>{p.rules.inventory!.required[4]='water';},p=>{p.rules.inventory!.items.push('bag');},p=>{delete p.rules.inventory!.failureReasons['tv-remote'];},p=>{p.rules.inventory!.container='nope';},p=>{p.rules.inventory!.items.push('water');},p=>{p.rules.inventory!.capacity=5.5;},p=>{p.rules.interactions[0].failure=true;}];
 for(const change of changes){const clone=structuredClone(pack);change(clone);assert.throws(()=>validatePackage(clone.rules,clone.skin));}
});
