import assert from 'node:assert/strict';
import test from 'node:test';
import { createCpr, reduceCpr as r, cprRules, canFinishCpr } from '../app/game/first-aid/cpr-model';
import { createCoverCamera } from '../app/game/display/camera';
import skin from '../content/first-aid/cpr/skin.json';
import { getLevel } from '../app/game/levels';
import { journeyEntryFor } from '../app/game/journey/entry';
import { lessonFor } from '../app/game/journey/knowledge';
const advance=(s:ReturnType<typeof createCpr>,ms:number)=>{while(ms>0){const dt=Math.min(100,ms);s=r(s,{type:'tick',dt});ms-=dt;}return s;};
const reviewed=(s:ReturnType<typeof createCpr>)=>r(advance(s,cprRules.reviewMs),{type:'continue'});
const prepared=()=>['call','aed','start'].reduce((s,type)=>reviewed(r(s,{type} as Parameters<typeof r>[1])),createCpr());
const rhythm=()=>['position','hands','posture'].reduce((s,type)=>reviewed(r(s,{type,correct:true} as Parameters<typeof r>[1])),prepared());
const sampled=()=>{let s=r(rhythm(),{type:'tap'});for(let i=0;i<cprRules.sampleIntervals;i++)s=r(advance(s,550),{type:'tap'});return s;};
test('learning actions must follow call, AED, start and physical preparation in order',()=>{
 let s=createCpr();for(const type of ['aed','start','position','hands','posture','tap','handover','finish'] as const)assert.equal(r(s,{type,correct:true}),s,type);
 s=reviewed(r(s,{type:'call'}));assert.equal(r(s,{type:'start'}),s);s=reviewed(r(s,{type:'aed'}));s=reviewed(r(s,{type:'start'}));assert.equal(s.phase,'position');assert.equal(r(s,{type:'hands',correct:true}),s);
 assert.equal(rhythm().phase,'rhythm');
});
test('each accepted action has a three-second minimum plus explicit continue, with no skipping or duplicates',()=>{
 let s=createCpr();for(const type of ['call','aed','start','position','hands','posture'] as const){
  s=r(s,{type,correct:true});assert.equal(s.review?.action,type);assert.equal(s.review?.remainingMs,3000);
  for(const blocked of ['call','aed','start','position','hands','posture','tap','handover','finish'] as const)assert.equal(r(s,{type:blocked,correct:true}),s);
  assert.equal(r(s,{type:'continue'}),s);s=advance(s,2999);assert.equal(s.review?.remainingMs,1);assert.equal(r(s,{type:'continue'}),s);
  const suspended=r(s,{type:'suspend'});assert.deepEqual(suspended.review,s.review);
  s=advance(s,1);assert.equal(s.review?.remainingMs,0);s=r(s,{type:'continue'});assert.equal(s.review,null);assert.equal(r(s,{type:'continue'}),s);
 }
});
test('wrong positions, hands and posture stay recoverable without a success review',()=>{
 let s=prepared();for(const type of ['position','hands','posture'] as const){const phase=s.phase;s=r(s,{type,correct:false});assert.equal(s.phase,phase);assert.equal(s.review,null);s=reviewed(r(s,{type,correct:true}));}assert.equal(s.phase,'rhythm');
});
test('continuous rhythm has no reading gap between taps; handover follows the whole learning segment',()=>{
 let s=r(rhythm(),{type:'tap'});assert(s.aedReady);assert.equal(r(s,{type:'handover'}),s);
 for(let i=0;i<cprRules.sampleIntervals;i++){s=r(advance(s,i%2?800:400),{type:'tap'});assert.equal(s.samples,i+1);if(i<cprRules.sampleIntervals-1)assert.equal(s.review,null);}
 assert.equal(s.review?.action,'rhythm');assert.equal(s.near,0);assert.equal(r(s,{type:'handover'}),s);s=reviewed(s);
 s=r(s,{type:'handover'});assert(s.handedOver);assert.equal(s.review?.action,'handover');assert(!canFinishCpr(s));assert.equal(r(s,{type:'finish'}),s);
 s=reviewed(s);assert(canFinishCpr(s));s=r(s,{type:'finish'});assert.equal(s.phase,'complete');assert.equal(r(s,{type:'tap'}),s);
});
test('rapid clicks, pause and long gaps cannot fake valid rhythm samples',()=>{
 let s=r(rhythm(),{type:'tap'});s=r(advance(s,30),{type:'tap'});assert.equal(s.samples,0);s=r(s,{type:'suspend'});s=r(advance(s,550),{type:'tap'});assert.equal(s.samples,0);s=r(advance(s,550),{type:'tap'});assert.equal(s.samples,1);assert.equal(s.near,1);s=r(advance(s,3000),{type:'tap'});assert.equal(s.samples,1);
});
test('invalid ticks cannot fast-forward feedback or AED arrival; waiting never skips acknowledgement',()=>{
 let s=r(reviewed(r(createCpr(),{type:'call'})),{type:'aed'});for(const dt of [NaN,Infinity,-5,50000])assert.equal(r(s,{type:'tick',dt}),s);
 s=advance(s,12000);assert(s.aedReady);assert.equal(s.review?.action,'aed');assert.equal(s.review?.remainingMs,0);assert.equal(r(s,{type:'start'}),s);
});
test('a fresh entry resets tutorial state; completed segments cannot be farmed',()=>{const done=sampled();assert.equal(r(done,{type:'tap'}),done);const fresh=createCpr();assert.equal(fresh.review,null);assert.equal(fresh.called,false);assert.equal(fresh.samples,0);});
test('shared camera keeps patient, hands and faces visible across acceptance viewports',()=>{
 for(const [w,h] of [[320,568],[320,740],[360,640],[360,900],[375,667],[390,844],[430,932],[520,924],[540,960]]){const c=createCoverCamera({sceneBounds:skin.sceneBounds,criticalRegions:skin.criticalRegions},w,h);assert.equal(c.clippedCritical,false,`${w}x${h}`);assert.equal(c.scale,Math.max(w/skin.sceneBounds.w,h/skin.sceneBounds.h));}
});
test('registered level preserves ID, locks and knowledge completion',()=>{assert(getLevel('first-aid-cpr')?.playable);assert.equal(journeyEntryFor('first-aid-cpr',{})?.canStart,false);assert.equal(journeyEntryFor('first-aid-cpr',{'first-aid-airway':3})?.canStart,true);assert.match(lessonFor('first-aid-cpr').message,/继续/);});

test('CPR references use a Chinese official source consistently',()=>{
 const lesson=lessonFor('first-aid-cpr');
 assert.equal(new URL(lesson.url).hostname,'wjw.beijing.gov.cn');
 assert.match(lesson.publisher,/北京市卫生健康/);
 assert.equal(lesson.sources.length,1);
 assert(lesson.sources.every(source=>new URL(source.url).hostname==='wjw.beijing.gov.cn'));
 assert.equal(lesson.sources[0].url,lesson.url);
});

test('Closer framing keeps original source coordinates, contact anchor and aspect intact',()=>{
 const b=skin.sceneBounds;assert(b.x>=0&&b.y>=0&&b.x+b.w<=skin.width&&b.y+b.h<=skin.height);
 assert.equal(skin.actorBox.x,313);assert.equal(skin.actorBox.y,569);assert.equal(skin.handsAnchor.x,410);assert.equal(skin.handsAnchor.y,835);
 const before=844/skin.height,after=844/b.h;assert(after/before>1.1&&after/before<1.2);
});
