import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRun, reduceRun, completedForReward, failureRevealing } from '../app/game/runtime/engine';
import { scenePoses } from '../app/game/runtime/scene';
import { PracticeAudioSession, PracticeCueTimeline } from '../app/game/runtime/practice-audio';
import { validatePackage } from '../app/game/runtime/validate';
import type { LevelPackage, Rules, Run, Skin } from '../app/game/runtime/schema';

// Isolated contract fixture: no production saves, art, unlocks or level data mutation.
function fixture(reveal = true): LevelPackage {
  const goalIds=['at-entrance','power-off','message-sent','water-packed','torch-packed','float-ready','on-roof'];
  const sources=['family','switch','phone','water','torch','foam','family'];
  const rules: Rules={schemaVersion:1,id:'runtime-flood-contract',kind:'response',title:'合成测试',order:1,location:'测试',description:'测试',safety:'测试',
    objects:[{id:'family',label:'人物',input:'drag'},{id:'switch',label:'断电',input:'tap'},{id:'phone',label:'手机',input:'tap'},
      {id:'water',label:'水',input:'drag'},{id:'torch',label:'手电',input:'drag'},{id:'foam',label:'泡沫',input:'drag'},
      {id:'car',label:'汽车',input:'tap'},{id:'furniture',label:'家具',input:'drag'}],
    goals:goalIds.map((id,i)=>({id,label:id,object:sources[i],showTarget:false})),
    interactions:[
      {id:'move',source:'family',mode:'drop',target:'stairs',grants:[goalIds[0]],outcome:'correct',animation:'move'},
      {id:'off',source:'switch',mode:'tap',requires:[goalIds[0]],grants:[goalIds[1]],outcome:'correct',animation:'off'},
      {id:'message',source:'phone',mode:'tap',requires:[goalIds[1]],grants:[goalIds[2]],outcome:'correct',animation:'message'},
      {id:'pack-water',source:'water',mode:'drop',target:'bag',requires:[goalIds[1]],grants:[goalIds[3]],outcome:'correct',animation:'pack-water'},
      {id:'pack-torch',source:'torch',mode:'drop',target:'bag',requires:[goalIds[1]],grants:[goalIds[4]],outcome:'correct',animation:'pack-torch'},
      {id:'make-float',source:'foam',mode:'drop',target:'board',requires:[goalIds[1]],grants:[goalIds[5]],outcome:'correct',animation:'make-float'},
      {id:'roof',source:'family',mode:'drop',target:'roof',requires:goalIds.slice(0,6),grants:[goalIds[6]],outcome:'correct',animation:'roof'},
      {id:'escape',source:'family',mode:'drop',target:'roof',grants:[],outcome:'neutral',animation:'roof',escape:true,feedback:'已先行到达高处，不折返。'},
      ...[['flood','flood','洪流危险'],['wire','wire','触电危险']].map(([id,target,feedback])=>({id,source:'family',mode:'drop' as const,target,grants:[],outcome:'danger' as const,animation:'fatal',failure:true,feedback})),
      {id:'car-error',source:'car',mode:'tap',grants:[],outcome:'danger',animation:'fatal',failure:true,feedback:'车厢进水危险'},
    ],
    risk:{mode:'elapsed',seconds:90,initial:0,warningAt:100,peakFeedback:'继续避险'},
    completion:{requires:goalIds,settleMs:500,observeMs:500,fixedStars:3,summary:'完成训练'}};
  const pose={asset:'idle',x:40,y:400,w:200,h:500,depth:30};
  const skin: Skin={schemaVersion:1,id:'runtime-contract',world:{width:720,height:1280},background:'room',
    assets:Object.fromEntries(['room','roof','aftermath','idle','safe','warning'].map(id=>[id,{src:`/levels/test/${id}.webp`,alpha:['idle','safe','warning'].includes(id)}])),
    poses:{'world-scene':{asset:'room',x:0,y:0,w:720,h:1280,depth:0,blockInput:false},...Object.fromEntries(rules.objects.map((o,i)=>[o.id,{...pose,x:i*50,w:40,h:100}]))},
    zones:Object.fromEntries(['stairs','bag','board','roof','flood','wire'].map((id,i)=>[id,{x:i*100,y:900,w:80,h:100}])),
    states:[{object:'family',when:{all:['on-roof']},pose:{asset:'safe',x:300,y:500}}, {object:'world-scene',when:{all:['on-roof']},pose:{asset:'roof'}}],
    animations:{},effects:[],presentation:{durationMs:60000,...(reveal?{failureReveal:true}:{}),effects:[],audio:{theme:'flood',ambientProfile:'flood-window',
      cues:{opening:'flood-surge',flood:'flood-water-impact',wire:'electric-warning','car-error':'flood-surge',failure:'fatal-fallback',complete:'reward-success'}}}};
  for(const rule of rules.interactions)skin.animations[rule.animation]={durationMs:1000,tracks:[{object:rule.source,keyframes:[{at:.5,rotation:.04},{at:1,rotation:0}]}]};
  skin.animations.roof={durationMs:1000,tracks:[{object:'family',keyframes:[{at:.5,asset:'safe',x:300,y:500},{at:1,asset:'safe',x:300,y:500}]},
    {object:'world-scene',keyframes:[{at:.5,asset:'roof'},{at:1,asset:'roof'}]}]};
  skin.animations.fatal={durationMs:1000,tracks:[{object:'family',keyframes:[{at:.5,x:250,asset:'warning'},{at:1,x:600,opacity:0}]},
    {object:'world-scene',keyframes:[{at:.5,asset:'aftermath'},{at:1,asset:'aftermath'}]}]};
  return validatePackage(rules,skin);
}
function advance(pack:LevelPackage,run:Run,ms:number){for(let t=0;t<ms;t+=20)run=reduceRun(pack,run,{type:'tick',ms:Math.min(20,ms-t)});return run;}
function act(pack:LevelPackage,run:Run,id:string){return reduceRun(pack,run,{type:'interact',input:pack.rules.interactions.find(r=>r.id===id)!});}
function done(pack:LevelPackage,run:Run,id:string){const next=act(pack,run,id);assert(next.action,id);return advance(pack,next,next.action.duration);}

test('fatal choices lock immediately; only bounded presentation clock advances',()=>{
  for(const id of ['flood','wire','car-error']){
    const pack=fixture();const before=advance(pack,createRun(pack),1220);const failed=act(pack,before,id);
    assert.equal(failed.phase,'failed');assert.equal(failed.action,null);assert.equal(failed.stars,0);assert.equal(failed.mistakes,before.mistakes+1);
    assert.deepEqual(failed.resolved,before.resolved);assert.equal(failed.failure?.rule,id);assert(failureRevealing(failed));assert(!completedForReward(failed));
    for(const event of [{type:'hint'},{type:'miss'},{type:'interact',input:pack.rules.interactions[0]}] as const)assert.equal(reduceRun(pack,failed,event),failed);
    assert.equal(reduceRun(pack,failed,{type:'tick',ms:100,paused:true}),failed);
    for(const ms of [0,-20,NaN,Infinity])assert.equal(reduceRun(pack,failed,{type:'tick',ms}),failed);
    const halfway=advance(pack,failed,500), settled=advance(pack,halfway,500);
    assert.equal(halfway.failure?.age,500);assert.equal(halfway.elapsed,before.elapsed);assert.equal(halfway.risk,before.risk);
    assert.equal(halfway.settleAge,0);assert.deepEqual(halfway.resolved,before.resolved);assert.equal(halfway.notice?.text,failed.notice?.text);
    assert.equal(scenePoses(pack,halfway,true).find(p=>p.id==='world-scene')!.asset,'aftermath');
    assert.equal(scenePoses(pack,halfway,true).find(p=>p.id==='family')!.asset,'warning');
    assert.equal(settled.failure?.age,1000);assert(!failureRevealing(settled));assert.equal(scenePoses(pack,settled,true).find(p=>p.id==='family')!.opacity,0);
    assert.equal(advance(pack,settled,10000),settled);assert.deepEqual(reduceRun(pack,settled,{type:'reset'}),createRun(pack));
  }
});
test('non-opted-in fatal levels keep original instant, frozen failure',()=>{
  const pack=fixture(false),failed=act(pack,createRun(pack),'flood');assert.equal(failed.phase,'failed');assert.equal(failed.failure,undefined);
  assert(!failureRevealing(failed));assert.equal(advance(pack,failed,2000),failed);assert.equal(scenePoses(pack,failed,true).find(p=>p.id==='world-scene')!.asset,'room');
  const cue=new PracticeCueTimeline(pack);assert.deepEqual(cue.advance(failed),[{event:'failure',id:'fatal-fallback'}]);assert.deepEqual(cue.advance(failed),[]);
});
test('per-rule fatal sound fires exactly once, never emits opening or success after failure',()=>{
  for(const id of ['flood','wire','car-error']){
    const pack=fixture(),timeline=new PracticeCueTimeline(pack),failed=act(pack,createRun(pack),id);
    assert.deepEqual(timeline.advance(failed),[{event:id,id:pack.skin.presentation!.audio!.cues[id]}]);
    assert.deepEqual(timeline.advance(advance(pack,failed,500)),[]);assert.deepEqual(timeline.advance(advance(pack,failed,2000)),[]);
    timeline.reset();assert.equal(timeline.advance(failed).length,1);
  }
});
test('safe early roof exit preserves aftermath but grants no goals, reward or journey completion',()=>{
  const pack=fixture();let run=done(pack,createRun(pack),'move');const goals=[...run.resolved];run=done(pack,run,'escape');
  assert.equal(run.phase,'settling');assert.equal(run.escaped,true);assert.equal(run.escapeRule,'escape');assert.equal(run.stars,0);assert.deepEqual(run.resolved,goals);
  assert.equal(scenePoses(pack,run,true).find(p=>p.id==='world-scene')!.asset,'roof');assert.equal(scenePoses(pack,run,true).find(p=>p.id==='family')!.asset,'safe');
  const timeline=new PracticeCueTimeline(pack);timeline.advance(run);run=advance(pack,run,1000);assert.equal(run.phase,'complete');assert(!completedForReward(run));
  assert(!timeline.advance(run).some(c=>c.event==='complete'));assert.equal(scenePoses(pack,run,true).find(p=>p.id==='world-scene')!.asset,'roof');
  assert.deepEqual(reduceRun(pack,run,{type:'reset'}),createRun(pack));
});
test('all six permutations of message, water, torch complete seven goals only after final motion',()=>{
  const orders=[['message','pack-water','pack-torch'],['message','pack-torch','pack-water'],['pack-water','message','pack-torch'],['pack-water','pack-torch','message'],['pack-torch','message','pack-water'],['pack-torch','pack-water','message']];
  for(const order of orders){const pack=fixture();let run=createRun(pack);for(const id of ['move','off',...order,'make-float'])run=done(pack,run,id);
    const final=act(pack,run,'roof');assert.equal(final.action!.rule,'roof');assert.equal(final.resolved.length,6);assert.equal(final.stars,0);
    run=advance(pack,final,1000);assert.equal(run.phase,'settling');assert.equal(run.resolved.length,7);assert.equal(run.escaped,undefined);assert.equal(run.stars,3);
    run=advance(pack,run,1000);assert.equal(run.phase,'complete');assert(completedForReward(run));}
});
test('ordinary furniture input remains an unscored bounce, with no failure',()=>{
  const pack=fixture(),initial=createRun(pack),run=reduceRun(pack,initial,{type:'interact',input:{source:'furniture',mode:'drop',target:'bag',point:{x:100,y:900}}});
  assert.equal(run.action?.rule,null);assert.equal(run.mistakes,0);const settled=advance(pack,run,500);
  assert.equal(settled.phase,'playing');assert.equal(settled.failure,undefined);assert.equal(settled.stars,0);assert.deepEqual(settled.resolved,[]);
});
test('invalid escape/reveal configurations fail closed, rather than becoming reward shortcuts',()=>{
  for(const patch of [{escape:false},{escape:true,outcome:'correct'},{escape:true,outcome:'danger',failure:true},{escape:true,grants:['on-roof']}]){
    const pack=fixture();Object.assign(pack.rules.interactions.find(r=>r.id==='escape')!,patch);assert.throws(()=>validatePackage(pack.rules,pack.skin));}
  const pack=fixture();(pack.skin.presentation as any).failureReveal=false;assert.throws(()=>validatePackage(pack.rules,pack.skin));
});
test('player gates terminal reward callback, delays failure overlay and exposes testable reveal state',()=>{
  const source=readFileSync('components/game/configured/practice-player.tsx','utf8');
  assert(source.includes('completedForReward(run) && !reported.current'));assert(source.includes("run.phase === 'failed' && !revealingFailure"));
  assert(source.includes('data-failure-age={run.failure?.age}'));assert(source.includes("run.escaped?'已先行到达高处'"));
  assert(source.includes('!document.hidden'));assert(source.includes('!latest.current.paused'));
});

class Param {value=0;cancelScheduledValues(){}setTargetAtTime(value:number){this.value=value;}}
class Node {connect(target:unknown){return target;}disconnect(){}}
class Gain extends Node {gain=new Param();}
class Source extends Node {loop=false;buffer:unknown;started=0;stopped=0;onended:(()=>void)|null=null;frequency=new Param();start(){this.started++;}stop(){this.stopped++;}}
class Context {
  state='suspended';currentTime=0;destination=new Node();sources:Source[]=[];
  createGain(){return new Gain();}createBufferSource(){const node=new Source();this.sources.push(node);return node;}createOscillator(){return this.createBufferSource();}
  createBuffer(_channels:number,length:number){const pcm=new Float32Array(length);return{getChannelData:()=>pcm};}
  createDynamicsCompressor(){return Object.assign(new Node(),{threshold:new Param(),knee:new Param(),ratio:new Param(),attack:new Param(),release:new Param()});}
  createAnalyser(){return Object.assign(new Node(),{fftSize:0,getFloatTimeDomainData:(data:Float32Array)=>data.fill(0)});}
  async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}
}
test('failure, pause and restart do not spawn additional ambient loops',async()=>{
  const pack=fixture(),context=new Context(),session=new PracticeAudioSession(pack,()=>context as unknown as AudioContext);const initial=createRun(pack);
  session.update(initial,true);await session.unlock();const looping=context.sources.filter(s=>s.loop);assert.equal(looping.length,3);
  const failed=act(pack,initial,'flood');session.update(failed,true);const played=session.status().played;assert.equal(session.status().lastCue,'flood-water-impact');
  session.update(advance(pack,failed,1000),true);assert.equal(session.status().played,played);assert.equal(context.sources.filter(s=>s.loop).length,3);
  session.update(failed,false);assert.equal(context.state,'suspended');assert.equal(session.status().sfx,0);
  session.update(failed,true);await Promise.resolve();await Promise.resolve();assert.equal(context.state,'running');
  session.reset();session.update(initial,true);await session.unlock();assert.equal(context.sources.filter(s=>s.loop).length,3);
  session.dispose();assert(looping.every(source=>source.stopped===1));
});
