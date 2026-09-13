import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import preventionRules from './fixtures/legacy-prevention/level.json';
import preventionSkin from './fixtures/legacy-prevention/skins/illustrated.json';
import responseRules from '../content/templates/response/level.json';
import responseSkin from '../content/templates/response/skins/illustrated.json';
import kitchenSkin from '../content/presets/kitchen/skin.json';
import typhoonSkin from '../content/presets/typhoon/skin.json';
import { assets as kitchenAssets, layout as kitchenLayout } from '../app/game/kitchen/config';
import { assets as typhoonAssets, placement as typhoonPlacement } from '../app/game/typhoon/config';
import { validatePackage } from '../app/game/runtime/validate';
import { createRun, emotion, reduceRun } from '../app/game/runtime/engine';
import { cameraFor, localPoint, pickObject, scenePoses, toWorld } from '../app/game/runtime/scene';
import type { LevelPackage, Run, Input } from '../app/game/runtime/schema';
import { ConfiguredPlayer } from '../components/game/configured/player';
import { render } from '../components/game/configured/renderer';
const prevention = () => validatePackage(structuredClone(preventionRules), structuredClone(preventionSkin));
const response = () => validatePackage(structuredClone(responseRules), structuredClone(responseSkin));
const tick = (p: LevelPackage, r: Run, ms: number) => { for (let n = 0; n < ms; n += 100) r = reduceRun(p, r, { type: 'tick', ms: Math.min(100, ms - n) }); return r; };
const perform = (p: LevelPackage, r: Run, input: Input) => tick(p, reduceRun(p, r, { type: 'interact', input }), 1500);
const lid: Input = { source: 'lid', mode: 'drop', target: 'pan', point: { x: 245, y: 610 } };
const gas: Input = { source: 'gas', mode: 'tap' };
const leave: Input = { source: 'person', mode: 'drop', target: 'exit' };
test('both templates validate, with three prevention silhouettes plus a hidden prerequisite', () => {
  assert.equal(prevention().rules.goals.filter(g => g.showTarget !== false).length, 3); assert.equal(response().rules.kind, 'response');
});
test('original players import extracted artwork and geometry with no copied fallback', () => {
  assert.deepEqual(kitchenAssets, kitchenSkin.assets); assert.deepEqual(kitchenLayout, kitchenSkin.layout);
  assert.deepEqual(typhoonAssets, typhoonSkin.assets); assert.deepEqual(typhoonPlacement, typhoonSkin.placement);
});
for (const inputs of [[gas,lid],[lid,gas]]) test(`response accepts both orders: ${inputs[0].source} first`, () => {
  const p = response(); let r = createRun(p);
  for (const input of [...inputs, leave]) r = perform(p, r, input);
  r = tick(p, r, 1500); assert.equal(r.phase, 'complete'); assert.equal(r.stars, 3); assert.equal(emotion(p,r), 'relieved');
});
test('goals commit after animation, busy input and duplicate actions never award twice', () => {
  const p = response(), r = reduceRun(p, createRun(p), { type:'interact',input:gas });
  assert.deepEqual(r.resolved, []); assert.equal(reduceRun(p,r,{type:'interact',input:lid}),r);
  const after = tick(p,r,800); assert.deepEqual(after.resolved,['gas-off']);
  assert.equal(reduceRun(p,after,{type:'interact',input:gas}),after);
});
test('gas is tap-only, not an implicit drag rule', () => {
  const p = response(), r = createRun(p); assert.equal(reduceRun(p,r,{type:'interact',input:{source:'gas',mode:'drop',target:'pan'}}),r);
});
test('prevention prerequisite blocks powerstrip until cushion animation has ended', () => {
  const p = prevention(); let r = createRun(p);
  const input: Input = {source:'strip',mode:'tap'};
  assert.equal(reduceRun(p,r,{type:'interact',input}),r);
  r = perform(p,r,{source:'cushion',mode:'tap'}); r = perform(p,r,input);
  assert.ok(r.resolved.includes('power-safe'));
  for (const source of ['plant','rail']) r = perform(p,r,{source,mode:'tap'});
  r = tick(p,r,1500); assert.equal(r.phase,'complete');
});
test('early evacuation only bounces and never completes the game', () => {
  const p = response(), r = perform(p,createRun(p),leave); assert.deepEqual(r.resolved,[]); assert.equal(r.mistakes,0);
});
test('wrong water visibly enlarges fire and changes expression without blocking later success', () => {
  const p = response(), initial = createRun(p), before = scenePoses(p,initial).find(p=>p.id==='flame')!;
  let r = reduceRun(p,initial,{type:'interact',input:{source:'water',mode:'drop',target:'pan'}});
  assert.equal(emotion(p,r),'panicked'); assert.equal(r.mistakes,1); assert.ok(r.risk > initial.risk);
  assert.ok(scenePoses(p,r).find(p=>p.id==='flame')!.h > before.h); assert.equal(r.notice?.text,'油锅起火不能泼水');
  r = tick(p,r,1500); for (const input of [lid,gas,leave]) r=perform(p,r,input); r=tick(p,r,1500);
  assert.equal(r.phase,'complete'); assert.equal(r.stars,2);
});
test('neutral prop/miss does not mutate risk or mistake count at release', () => {
  const p=response(), initial=createRun(p), r=reduceRun(p,initial,{type:'interact',input:{source:'plate',mode:'drop',target:'pan'}});
  assert.equal(r.risk,initial.risk); assert.equal(r.mistakes,0); assert.equal(r.notice,null); assert.equal(r.action?.rule,null);
});
test('water cannot reignite a covered pan in this scenario', () => {
  const p=response(), r=perform(p,createRun(p),lid), after=perform(p,r,{source:'water',mode:'drop',target:'pan'});
  assert.equal(after.mistakes,0); assert.equal(scenePoses(p,after).find(p=>p.id==='flame')!.opacity,0);
});
test('risk reaching peak is recoverable, peak consequence triggers once', () => {
  const p=response(); let r=tick(p,createRun(p),100000); assert.equal(r.risk,100); assert.equal(r.peakSeen,true);
  r=tick(p,r,3000); assert.equal(r.notice,null);
  for (const input of [gas,lid,leave]) r=perform(p,r,input); assert.equal(tick(p,r,1500).phase,'complete');
});
test('reset and independent instances do not leak completion or reactions', () => {
  const p=response(), a=perform(p,createRun(p),gas), b=createRun(p);
  assert.deepEqual(b.resolved,[]); assert.deepEqual(reduceRun(p,a,{type:'reset'}),b);
});
test('changing skin filenames/layout never changes pure gameplay trace', () => {
  const p=response(), alternative=structuredClone(p);
  alternative.skin.assets.lid.src='/levels/alternate/lid.webp'; alternative.skin.poses.lid.x+=25;
  validatePackage(alternative.rules,alternative.skin);
  const play = (pack:LevelPackage) => [gas,lid,leave].reduce((r,i)=>perform(pack,r,i),createRun(pack));
  assert.deepEqual(play(p),play(alternative));
});
test('engine is not hardcoded to kitchen IDs: rename every object, goal, rule and zone', () => {
  const p=response(), all=new Set([...p.rules.objects.map(o=>o.id),...p.rules.goals.map(g=>g.id),...Object.keys(p.skin.poses),...Object.keys(p.skin.zones),...p.rules.interactions.map(r=>r.id)]);
  const replace=(v:any):any => typeof v==='string' && all.has(v) ? `new-${v}` : Array.isArray(v) ? v.map(replace) : v && typeof v==='object' ? Object.fromEntries(Object.entries(v).map(([k,v])=>[all.has(k)?`new-${k}`:k,replace(v)])) : v;
  // Assets/motion map keys participate in renaming too; the same manifest remains coherent.
  const renamed=replace(p); const pack=validatePackage(renamed.rules,renamed.skin);
  let r=createRun(pack); for(const input of [gas,lid,leave]) r=perform(pack,r,replace(input));
  assert.equal(tick(pack,r,1500).phase,'complete');
});
test('animation interpolates exactly once and final lid sits above the pan', () => {
  const p=response(); let r=reduceRun(p,createRun(p),{type:'interact',input:lid}); r=tick(p,r,500);
  const poses=scenePoses(p,r), moving=poses.filter(p=>p.id==='lid'); assert.equal(moving.length,1); assert.notEqual(moving[0].x,p.skin.poses.lid.x);
  r=tick(p,r,500); const end=scenePoses(p,r), cover=end.find(p=>p.id==='lid')!;
  assert.equal(cover.x,156); assert.ok(cover.depth>end.find(p=>p.id==='pan')!.depth);
});
test('state image changes do not move the actor anchor', () => {
  const p=response(), r=createRun(p), initial=scenePoses(p,r).find(p=>p.id==='person')!;
  const panic=scenePoses(p,{...r,reaction:'panicked',reactionMs:1000}).find(p=>p.id==='person')!;
  assert.equal(initial.x,panic.x); assert.equal(initial.h,panic.h); assert.equal(panic.asset,'panicked');
});
test('exact alpha picking passes through transparent margins and respects occluders', () => {
  const p=prevention(), r=createRun(p);
  assert.equal(pickObject(p,r,{x:140,y:740},()=>true),'cushion');
  const after=perform(p,r,{source:'cushion',mode:'tap'});
  assert.equal(pickObject(p,after,{x:140,y:740},()=>true),'strip');
  assert.equal(pickObject(p,after,{x:140,y:740},()=>false),null);
});
test('rotated pose inverse transform matches visible shape', () => {
  const p=response().skin.poses.gas; const result=localPoint({...p,rotation:Math.PI/2},{x:p.x+p.w/2,y:p.y+p.h});
  assert.ok(Math.abs(result.x-1)<1e-9); assert.ok(Math.abs(result.y-.5)<1e-9);
});
for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[800,500]]) test(`response uniform cover and exact input round trip ${width}x${height}`,()=>{
  const p=response(), c=cameraFor(p,width,height), point={x:250,y:650};
  const local=toWorld(p,{x:12+c.x+point.x*c.scale,y:17+c.y+point.y*c.scale},{left:12,top:17,width,height});
  assert.ok(Math.abs(local.x-point.x)<1e-8 && Math.abs(local.y-point.y)<1e-8);
  assert.equal(c.scale,Math.max(width/p.skin.world.width,height/p.skin.world.height));
  assert.ok(c.x<=.001 && c.y<=.001);
  assert.ok(c.x+p.skin.world.width*c.scale>=width-.001);
  assert.ok(c.y+p.skin.world.height*c.scale>=height-.001);
});
test('renderer paints no duplicate home sprite during drag and no persistent action subtitles',()=>{
  const p=response(), r=createRun(p), draw:any[]=[];
  const ctx=new Proxy({drawImage:(...args:any[])=>draw.push(args),createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})}, {get:(target,key)=>key in target?target[key as keyof typeof target]:(()=>{})}) as unknown as CanvasRenderingContext2D;
  const art=Object.fromEntries(Object.keys(p.skin.assets).map(id=>[id,{image:id}])) as any;
  render(ctx,p,art,r,{id:'lid',point:{x:250,y:650},offset:{x:90,y:40},start:{x:170,y:950},pointerId:1,moved:true},'lid',true);
  assert.equal(draw.filter(args=>args[0]==='lid').length,1);
});
test('minimal response UI hides goal answers; prevention uses the same source images for silhouettes',()=>{
  const res=renderToStaticMarkup(createElement(ConfiguredPlayer,{pack:response(),onBack:()=>{},onFinish:()=>{}}));
  assert.ok(!res.includes('configured-targets')); assert.ok(!res.includes('正在平稳'));
  const pre=renderToStaticMarkup(createElement(ConfiguredPlayer,{pack:prevention(),onBack:()=>{},onFinish:()=>{}}));
  assert.ok(pre.includes('configured-targets')); assert.ok(pre.includes(preventionSkin.assets.plant.src));
});
const invalid: [string,(p:any)=>void][]=[
  ['unknown asset',p=>p.skin.poses.lid.asset='missing'],['unknown zone',p=>p.rules.interactions[0].target='missing'],
  ['cycle',p=>p.rules.interactions[0].requires=['evacuated']],['disabled dead end',p=>p.rules.objects.find((o:any)=>o.id==='person').disabledWhen=['covered']],
  ['mistake awards a goal',p=>{p.rules.interactions[0].outcome='danger';p.rules.interactions[0].feedback='bad';}],
  ['too short animation',p=>p.skin.animations.cover.durationMs=200],['unknown animation',p=>p.rules.interactions[0].animation='missing'],
  ['out of bounds',p=>p.skin.poses.water.x=900],['zero size',p=>p.skin.poses.water.w=0],
  ['wrong type',p=>p.rules.objects=null],['unknown field',p=>p.skin.animations.cover.duratonMs=1000],
  ['unversioned',p=>p.rules.schemaVersion=2],['duplicate object',p=>p.rules.objects.push({...p.rules.objects[0]})],
  ['network asset',p=>p.skin.assets.lid.src='https://example.com/lid.png'],['traversal',p=>p.skin.assets.lid.src='/levels/../../private.png'],
  ['missing last frame',p=>p.skin.animations.cover.tracks[0].keyframes[0].at=.9],['duplicate track',p=>p.skin.animations.cover.tracks.push(p.skin.animations.cover.tracks[0])],
  ['empty completion',p=>p.rules.completion.requires=[]],['input mismatch',p=>p.rules.objects[0].input='tap'],
];
for(const [name,change] of invalid) test(`reject invalid package: ${name}`,()=>{const p:any=response();change(p);assert.throws(()=>validatePackage(p.rules,p.skin));});
test('offline embedded images are accepted only by explicitly marked runtime registration',()=>{
  const p=response();p.skin.assets.lid.src='data:image/png;base64,YWJj';assert.throws(()=>validatePackage(p.rules,p.skin));
  assert.ok(validatePackage(p.rules,p.skin,{embedded:true}));
});
test('draft packages are not in the production registry by default',()=>{
  const root=process.cwd(), entries=JSON.parse(readFileSync(join(root,'content/catalog.json'),'utf8'));
  assert.ok(entries.filter((e:any)=>e.id.startsWith('example-')).every((e:any)=>e.enabled===false));
});
test('CLI rejects existing ID without modifying catalog',()=>{
  const root=process.cwd(), path=join(root,'content/catalog.json'), before=readFileSync(path,'utf8');
  const result=spawnSync(process.execPath,['scripts/levels.mjs','create','--id','example-response','--kind','response','--title','重复','--order','30'],{cwd:root,encoding:'utf8'});
  assert.notEqual(result.status,0); assert.equal(readFileSync(path,'utf8'),before);
});
test('batch preflight fails before any creation when a later row is invalid',()=>{
  const root=process.cwd(), temp=mkdtempSync(join(tmpdir(),'flower-batch-test-')), input=join(temp,'jobs.json'), first=`test-${Date.now()}`;
  writeFileSync(input,JSON.stringify([{id:first,kind:'prevention',title:'试制',order:90},{id:'../../outside',kind:'response',title:'错误',order:91}]));
  const path=join(root,'content/catalog.json'), before=readFileSync(path,'utf8');
  const result=spawnSync(process.execPath,['scripts/levels.mjs','batch','--file',input],{cwd:root,encoding:'utf8'});
  assert.notEqual(result.status,0); assert.ok(!existsSync(join(root,'content/levels',first))); assert.equal(readFileSync(path,'utf8'),before);
});
