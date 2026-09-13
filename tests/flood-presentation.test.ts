import test from 'node:test';
import assert from 'node:assert/strict';
// Generic presentation regressions use the frozen indoor six-step fixture.
import rules from './fixtures/flood-indoor-v1/level.json';
import sourceSkin from './fixtures/flood-indoor-v1/skins/paper-gouache.json';
import { validatePackage } from '../app/game/runtime/validate';
import { createRun } from '../app/game/runtime/engine';
import { presentationActors, presentationSceneMatches } from '../app/game/runtime/presentation';
import { scenePoses } from '../app/game/runtime/scene';
import type { Skin, LevelPackage, Pose, Run } from '../app/game/runtime/schema';

const rectangle = (x:number,y:number,w:number,h:number) => [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
function fixture() {
  const skin=structuredClone(sourceSkin) as Skin;
  const asset=skin.assets[skin.poses.family.asset];
  skin.assets['test-high']={...asset}; skin.assets['test-low']={...asset}; skin.assets['test-call']={...asset};
  skin.states=[]; skin.poses.family={...skin.poses.family,asset:'test-high'};
  skin.presentation={durationMs:50000,effects:[{kind:'rain',box:{x:0,y:0,w:400,h:600},depth:2,
    clipPolygons:[rectangle(20,20,140,500),rectangle(180,20,140,500)],
    whenScene:{object:'world-scene',asset:skin.poses['world-scene'].asset}}],
    actors:[{object:'family',amplitude:.3,performance:{lean:.015,periodMs:1800,
      cycle:{frames:['test-high','test-low'],periodMs:1600,when:{all:['visible-signal'],not:['waiting-safely']}}}}],
    audio:{theme:'flood',ambientProfile:'flood-window',cues:{}}};
  return {rules:structuredClone(rules),skin};
}
const valid=()=>{const f=fixture();return validatePackage(f.rules,f.skin);};
const actorPose=(pack:LevelPackage,run:Run,reduced=false,asset='test-high')=>{
  const poses={family:{...pack.skin.poses.family,asset}};
  presentationActors(pack,run,poses,reduced);return poses.family;
};

test('optional contracts validate and an ordinary pack can omit every new field',()=>{
  const f=fixture();validatePackage(f.rules,f.skin);
  delete f.skin.presentation!.audio!.ambientProfile;
  delete f.skin.presentation!.actors![0].performance!.cycle;
  delete f.skin.presentation!.effects[0].clipPolygons;
  delete f.skin.presentation!.effects[0].whenScene;
  validatePackage(f.rules,f.skin);
});

for(const [name,change] of [
  ['empty polygon set',(s:Skin)=>s.presentation!.effects[0].clipPolygons=[]],
  ['two point polygon',(s:Skin)=>s.presentation!.effects[0].clipPolygons=[[{x:0,y:0},{x:2,y:2}]]],
  ['seventeen point polygon',(s:Skin)=>s.presentation!.effects[0].clipPolygons=[Array.from({length:17},(_,i)=>({x:i,y:i%3}))]],
  ['zero area polygon',(s:Skin)=>s.presentation!.effects[0].clipPolygons=[[{x:1,y:1},{x:2,y:2},{x:3,y:3}]]],
  ['infinite point',(s:Skin)=>s.presentation!.effects[0].clipPolygons![0][0].x=Infinity],
  ['NaN point',(s:Skin)=>s.presentation!.effects[0].clipPolygons![0][0].x=NaN],
  ['outside world',(s:Skin)=>s.presentation!.effects[0].clipPolygons![0][0].y=1281],
  ['unknown point field',(s:Skin)=>(s.presentation!.effects[0].clipPolygons![0][0] as any).z=1],
  ['missing scene object',(s:Skin)=>s.presentation!.effects[0].whenScene!.object='not-here'],
  ['missing scene image',(s:Skin)=>s.presentation!.effects[0].whenScene!.asset='not-here'],
  ['one frame',(s:Skin)=>s.presentation!.actors![0].performance!.cycle!.frames=['test-high']],
  ['duplicate frame',(s:Skin)=>s.presentation!.actors![0].performance!.cycle!.frames=['test-high','test-high']],
  ['missing frame asset',(s:Skin)=>s.presentation!.actors![0].performance!.cycle!.frames=['test-high','not-here']],
  ['too fast',(s:Skin)=>s.presentation!.actors![0].performance!.cycle!.periodMs=499],
  ['too slow',(s:Skin)=>s.presentation!.actors![0].performance!.cycle!.periodMs=10001],
  ['unknown cycle goal',(s:Skin)=>s.presentation!.actors![0].performance!.cycle!.when={all:['not-here']}],
  ['unknown sound profile',(s:Skin)=>(s.presentation!.audio as any).ambientProfile='thunder-film'],
] as const)test('validator rejects '+name,()=>{
  const f=fixture();change(f.skin);assert.throws(()=>validatePackage(f.rules,f.skin));
});

test('cycle alternates actual images without resizing or translating the shared pose',()=>{
  const pack=valid(),run={...createRun(pack),resolved:['visible-signal']};
  const home=pack.skin.poses.family;
  for(const [elapsed,asset] of [[0,'test-high'],[799,'test-high'],[800,'test-low'],[1599,'test-low'],[1600,'test-high']] as const){
    const pose=actorPose(pack,{...run,elapsed});assert.equal(pose.asset,asset);
    for(const key of ['x','y','w','h','depth'] as const)assert.equal(pose[key],home[key]);
    assert.equal(pose.y+pose.h,home.y+home.h);assert.deepEqual(pose.pivot,{x:.5,y:1});
  }
});

test('cycle is dormant before signaling, after waiting, when reduced, and outside playing',()=>{
  const pack=valid(),run={...createRun(pack),elapsed:900,resolved:['visible-signal']};
  assert.equal(actorPose(pack,{...run,resolved:[]}).asset,'test-high');
  assert.equal(actorPose(pack,{...run,resolved:['visible-signal','waiting-safely']}).asset,'test-high');
  assert.deepEqual(actorPose(pack,run,true),pack.skin.poses.family);
  for(const phase of ['settling','complete','failed'] as const)assert.equal(actorPose(pack,{...run,phase}).asset,'test-high');
  assert.equal(actorPose(pack,run,false,'test-call').asset,'test-call');
});

test('an action driving the family suppresses idle cycle and foot lean',()=>{
  const pack=valid(),run={...createRun(pack),elapsed:900,resolved:['visible-signal'],
    action:{rule:'reach-higher-level',source:'family',age:300,duration:1500}};
  assert.deepEqual(actorPose(pack,run),pack.skin.poses.family);
});

test('rendered scene—not goals—selects the aperture across a mid-action scene swap',()=>{
  const pack=valid(),effect=pack.skin.presentation!.effects[0],home=pack.skin.poses['world-scene'];
  assert(presentationSceneMatches(effect,[{id:'world-scene',...home}]));
  assert(!presentationSceneMatches(effect,[{id:'world-scene',...home,asset:'upstairs-background'}]));
  assert(!presentationSceneMatches(effect,[{id:'world-scene',...home,opacity:0}]));
  assert(!presentationSceneMatches(effect,[]));
  assert(presentationSceneMatches({...effect,whenScene:undefined},[]));
});

test('restoreHome restores state-composed image and bounds instead of stale prior frame or drop position',()=>{
  const f=fixture();
  f.skin.states=[{object:'family',when:{all:['visible-signal']},pose:{asset:'test-low',x:120,y:340,w:340,h:510}}];
  f.skin.animations['contact-rescue']={durationMs:1000,tracks:[{object:'family',fromDrop:true,keyframes:[
    {at:.3,asset:'test-call',x:200,y:100,w:200,h:300},
    {at:.9,restoreHome:true,opacity:0},
    {at:1,restoreHome:true,opacity:1},
  ]}]};
  const pack=validatePackage(f.rules,f.skin);
  for(const resolved of [[],['visible-signal']]){
    const run={...createRun(pack),resolved};
    const home=scenePoses(pack,run,true).find(p=>p.id==='family')!;
    const pose=scenePoses(pack,{...run,action:{rule:'contact-rescue',source:'family',age:1000,duration:1000,point:{x:690,y:1000}}},true).find(p=>p.id==='family')!;
    assert.deepEqual(pose,{...home,rotation:home.rotation??0,opacity:1});assert(!('restoreHome' in pose));
  }
  (f.skin.animations['contact-rescue'].tracks[0].keyframes[1] as any).restoreHome=false;
  assert.throws(()=>validatePackage(f.rules,f.skin),/restoreHome/);
});
