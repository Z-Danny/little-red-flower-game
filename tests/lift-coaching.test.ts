import test from 'node:test';
import assert from 'node:assert/strict';
import { getPackage } from '../app/game/levels';
import { createRun, findRule, reduceRun } from '../app/game/runtime/engine';
import { activeConversation } from '../app/game/runtime/coaching';
import { configuredPauseHint } from '../app/game/runtime/pause-hint';
import { dragFeedback } from '../app/game/runtime/drag-feedback';
import { validatePackage } from '../app/game/runtime/validate';
import type { Run, Input } from '../app/game/runtime/schema';
const pack = getPackage('lift-wait')!;
const tick = (r: Run, ms=2000) => { for(let n=0;n<ms;n+=100) r=reduceRun(pack,r,{type:'tick',ms:Math.min(100,ms-n)});return r; };
const input = (id: string): Input => {const rule=pack.rules.interactions.find(x=>x.id===id)!;return {source:rule.source,mode:rule.mode,target:rule.target,choice:rule.choice?rule.id:undefined};};
const act = (r: Run, id: string) => tick(reduceRun(pack,r,{type:'interact',input:input(id)}),1500);
for(const waitingFirst of [false,true])test(`interactive report, waiting acknowledgement; waiting first=${waitingFirst}`,()=>{
 let r=createRun(pack);if(waitingFirst)r=act(r,'wait');
 r=act(r,'call');assert.equal(activeConversation(pack,r)?.id,'location');assert.ok(!r.resolved.includes('alarm-contacted'));
 r=act(r,'report-location');assert.equal(activeConversation(pack,r)?.id,'status');
 r=act(r,'report-status');assert.ok(r.resolved.includes('alarm-contacted'));if(!waitingFirst)r=act(r,'wait');
 assert.equal(activeConversation(pack,r)?.id,'waiting');assert.equal(r.phase,'playing');
 assert.equal(tick(r,120000).phase,'playing','no fake rescue timer or auto-completion');
 r=act(r,'confirm-wait');r=tick(r);assert.equal(r.phase,'complete');assert.equal(r.stars,3);
 assert.deepEqual(new Set(r.resolved),new Set(pack.rules.completion.requires));
});
test('choices cannot bypass report, appear through normal taps, or commit while busy',()=>{
 let r=createRun(pack);assert.equal(act(r,'confirm-wait').resolved.length,0);
 r=act(r,'call');const before=r;
 assert.equal(reduceRun(pack,r,{type:'interact',input:{source:'bell',mode:'tap'}}),before);
 assert.equal(reduceRun(pack,r,{type:'interact',input:input('report-status')}),before);
 r=reduceRun(pack,r,{type:'interact',input:input('report-location')});
 assert.ok(!r.resolved.includes('location-reported'));assert.equal(reduceRun(pack,r,{type:'interact',input:input('report-location')}),r);
 r=tick(r);assert.equal(reduceRun(pack,r,{type:'interact',input:input('report-location')}),r);
});
test('wrong conversation choices explain, award nothing, and remain recoverable',()=>{
 let r=act(createRun(pack),'call');const done=[...r.resolved];r=act(r,'guess-location');
 assert.deepEqual(r.resolved,done);assert.match(r.notice!.text,/不是当前停靠位置/);assert.equal(r.mistakes,0);
 r=act(r,'report-location');r=act(r,'guess-status');assert.ok(!r.resolved.includes('alarm-contacted'));
 r=act(r,'report-status');r=act(r,'wait');r=act(r,'rush-door');assert.equal(r.phase,'playing');assert.ok(!r.resolved.includes('wait-confirmed'));
 r=tick(act(r,'confirm-wait'));assert.equal(r.phase,'complete');
});
test('door preview is a prohibition; unsafe release remains recoverable',()=>{
 let r=createRun(pack);assert.match(dragFeedback(pack,'person','door',true,r),/^禁止放置/);assert.doesNotMatch(dragFeedback(pack,'person','door',true,r),/松手放到/);
 assert.match(dragFeedback(pack,'person','wait',true,r),/松手放到：远离门边/);
 assert.equal(findRule(pack,r,input('leave-door'))?.outcome,'danger');r=act(r,'leave-door');assert.equal(r.mistakes,1);assert.deepEqual(r.resolved,[]);
 for(const id of ['call','report-location','report-status','wait','confirm-wait'])r=act(r,id);assert.equal(tick(r).phase,'complete');
});
test('floor buttons explain; paused conversations neither advance nor expire; reset clears all',()=>{
 for(const id of ['explain-floor-1','explain-floor-2']){const r=act(createRun(pack),id);assert.match(r.notice!.text,/楼层键没有响应.*报警通话/);assert.deepEqual(r.resolved,[]);}
 let r=act(createRun(pack),'call');assert.match(configuredPauseHint(pack,r)!,/电梯标识/);
 assert.equal(reduceRun(pack,r,{type:'tick',ms:100,paused:true}),r);
 assert.deepEqual(reduceRun(pack,r,{type:'reset'}),createRun(pack));
});
test('coaching validation rejects invisible, duplicated, unknown and unreachable choices',()=>{
 for(const mutate of [
  (p:typeof pack)=>{p.rules.coaching!.conversations[0].choices=['missing','guess-location'];},
  (p:typeof pack)=>{p.rules.coaching!.conversations[1].choices[0]='guess-location';},
  (p:typeof pack)=>{delete p.rules.coaching;},
  (p:typeof pack)=>{p.rules.coaching!.conversations[0].requires=['wait-confirmed'];},
  (p:typeof pack)=>{p.rules.objects.find(o=>o.id==='bell')!.disabledWhen=['call-started'];},
 ]){const p=structuredClone(pack);mutate(p);assert.throws(()=>validatePackage(p.rules,p.skin));}
});
