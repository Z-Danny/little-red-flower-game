import test from 'node:test';
import assert from 'node:assert/strict';
import { getPackage } from '../app/game/levels';
import { createRun, reduceRun } from '../app/game/runtime/engine';
import { activeConversation } from '../app/game/runtime/coaching';
import { configuredPauseHint } from '../app/game/runtime/pause-hint';
import { dragFeedback } from '../app/game/runtime/drag-feedback';
import { validatePackage } from '../app/game/runtime/validate';
import type { Input, Run } from '../app/game/runtime/schema';
const pack=getPackage('well-call')!;
const tick=(r:Run,ms=2000)=>{for(let n=0;n<ms;n+=100)r=reduceRun(pack,r,{type:'tick',ms:Math.min(100,ms-n)});return r;};
const input=(id:string):Input=>{const rule=pack.rules.interactions.find(x=>x.id===id)!;return{source:rule.source,mode:rule.mode,target:rule.target,choice:rule.choice?rule.id:undefined};};
const act=(r:Run,id:string)=>tick(reduceRun(pack,r,{type:'interact',input:input(id)}),1500);
const groups=[['back'],['dial-119','report-fire'],['dial-120','report-medical']];
for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]])test('all task orders stay playable: '+order.join(','),()=>{
 let r=createRun(pack);for(const g of order)for(const id of groups[g])r=act(r,id);
 assert.equal(r.phase,'playing');assert.equal(activeConversation(pack,r)?.id,'perimeter-check');
 assert.equal(tick(r,120000).phase,'playing');r=tick(act(r,'confirm-perimeter'));
 assert.equal(r.phase,'complete');assert.equal(r.stars,3);assert.deepEqual(new Set(r.resolved),new Set(pack.rules.completion.requires));
});
test('observing the well is neutral, does not frighten or award; deliberate entry still warns',()=>{
 let r=act(createRun(pack),'inspect');assert.equal(r.mistakes,0);assert.deepEqual(r.resolved,[]);assert.notEqual(r.reaction,'panicked');assert.match(r.notice!.text,/外围观察/);
 assert.match(dragFeedback(pack,'person','well',true,r),/^禁止放置/);r=act(r,'pull-in');assert.equal(r.mistakes,1);assert.equal(r.phase,'playing');assert.deepEqual(r.resolved,[]);
 for(const id of ['back','dial-119','report-fire','dial-120','report-medical','confirm-perimeter'])r=act(r,id);
 assert.equal(tick(r).phase,'complete');
});
test('calls require explicit reports; 120 works first without implying prior 119 call',()=>{
 let r=act(createRun(pack),'dial-120');assert.deepEqual(r.resolved,['medical-connected']);assert.equal(activeConversation(pack,r)?.id,'medical-report');
 assert.equal(reduceRun(pack,r,{type:'interact',input:input('report-fire')}),r);
 assert.equal(reduceRun(pack,r,{type:'interact',input:{source:'medical-call',mode:'tap'}}),r);
 r=act(r,'guess-medical');assert.deepEqual(r.resolved,['medical-connected']);assert.match(r.notice!.text,/不确定/);
 r=act(r,'report-medical');assert.ok(r.resolved.includes('medical-called'));assert.ok(!r.resolved.includes('fire-called'));assert.equal(reduceRun(pack,r,{type:'interact',input:input('report-medical')}),r);
 r=act(r,'dial-119');r=act(r,'vague-fire');assert.ok(!r.resolved.includes('fire-called'));assert.match(r.notice!.text,/准确位置/);
 r=act(r,'report-fire');assert.ok(r.resolved.includes('fire-called'));
});
test('bystander hints, misplaced release and completion use human language',()=>{
 let r=createRun(pack);assert.match(configuredPauseHint(pack,r)!,/提醒.*旁观者/);assert.doesNotMatch(configuredPauseHint(pack,r)!,/把它/);
 r=reduceRun(pack,r,{type:'interact',input:{source:'person',mode:'drop',target:'nowhere'}});assert.match(r.notice!.text,/旁观者回到原位/);assert.doesNotMatch(r.notice!.text,/物品/);
 r=act(tick(r),'back');assert.match(r.notice!.text,/已提醒.*他回应/);assert.doesNotMatch(r.notice!.text,/已放置/);
});
test('end-of-scene temptation is recoverable; no early completion or duplicate award',()=>{
 let r=createRun(pack);assert.equal(reduceRun(pack,r,{type:'interact',input:input('confirm-perimeter')}),r);
 for(const id of ['back','dial-119','report-fire','dial-120','report-medical'])r=act(r,id);
 r=act(r,'approach-after-call');assert.equal(r.phase,'playing');assert.ok(!r.resolved.includes('waiting-confirmed'));assert.match(r.notice!.text,/不代表现场已经安全/);
 r=act(r,'confirm-perimeter');r=tick(r);assert.equal(r.phase,'complete');assert.equal(reduceRun(pack,r,{type:'interact',input:input('confirm-perimeter')}),r);
});
test('report commits after animation; busy input, pause and reset preserve boundaries',()=>{
 let r=act(createRun(pack),'dial-119');r=reduceRun(pack,r,{type:'interact',input:input('report-fire')});
 assert.ok(!r.resolved.includes('fire-called'));assert.equal(reduceRun(pack,r,{type:'interact',input:input('report-fire')}),r);
 assert.equal(reduceRun(pack,r,{type:'tick',ms:100,paused:true}),r);
 assert.deepEqual(reduceRun(pack,r,{type:'reset'}),createRun(pack));assert.equal(activeConversation(pack,createRun(pack)),undefined);
});
test('feedback is opt-in and validation rejects malformed authored text or placement',()=>{
 assert.deepEqual(pack.skin.feedback,{noticePosition:'top',zoneLabelPosition:'above'});assert.equal(getPackage('lift-wait')!.skin.feedback,undefined);
 for(const mutate of [
  (p:any)=>p.skin.feedback.noticePosition='left',
  (p:any)=>p.skin.feedback.zoneLabelPosition='overlay',
  (p:any)=>p.rules.coaching.context='',
  (p:any)=>p.rules.coaching.conversations[0].caption=42,
  (p:any)=>p.rules.interactions[0].hint=false,
  (p:any)=>p.rules.objects.find((o:any)=>o.id==='person').missFeedback=5,
 ]){const p=structuredClone(pack);mutate(p);assert.throws(()=>validatePackage(p.rules,p.skin));}
});
