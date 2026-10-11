import assert from 'node:assert/strict';import{test}from'node:test';
import{initialState,reduce,result,rules,type State,type Branch}from'../app/game/staged-response/model';
const act=(s:State,type:string,id?:string,target?:string)=>reduce(s,{type,id,target});
const travel=(s:State)=>{for(let i=0;i<18;i++)s=reduce(s,{type:'tick',dt:100});return s};
function help(branch:Branch='shock'){
 let s=act(initialState(branch),'begin');for(const id of rules.inventory)s=act(s,'pack',id);for(const id of rules.siteChecks)s=act(s,'check',id);
 s=act(act(s,'finish-prep'),'open-review');for(const id of rules.reviewTargets)s=act(act(s,'identify',id),'acknowledge');
 s=act(act(s,'finish-review'),'start-event');s=act(s,'safe');s=act(act(s,'examine','response'),'examine','breathing');return act(s,'recognize');
}
const clear=(s:State)=>['self','caller','runner'].reduce((s,id)=>act(s,'clear-person',id),s);
function device(branch:Branch='shock'){
 let s=help(branch);for(const a of ['call','cpr','dispatch'])s=act(s,a);s=travel(s);return act(act(s,'receive-aed'),'power');
}
test('phases cannot skip work or accept stale inputs',()=>{
 let s=initialState();assert.equal(act(s,'handover'),s);s=act(s,'begin');assert.equal(act(s,'finish-prep'),s);assert.equal(act(s,'start-event'),s);assert.equal(act(s,'pack','unknown'),s);
 s=act(s,'pack','gloves');assert.equal(act(s,'pack','gloves'),s);
});
test('read corrections before ending teaching still; duplicate targets stay idempotent',()=>{
 let s=act(initialState(),'begin');for(const id of rules.inventory)s=act(s,'pack',id);for(const id of rules.siteChecks)s=act(s,'check',id);
 s=act(act(s,'finish-prep'),'open-review');s=act(s,'identify','give-water');assert.equal(act(s,'identify','film-patient'),s);assert.equal(act(s,'finish-review'),s);
 s=act(s,'acknowledge');assert.equal(act(s,'identify','give-water'),s);
});
test('actual two-point assessment required, no old single confirmation shortcut',()=>{
 let s=help();s={...s,step:'assess',observations:[]};assert.equal(act(s,'assess'),s);assert.equal(act(s,'recognize'),s);
 s=act(s,'examine','response');assert.equal(s.step,'assess');s=act(s,'examine','breathing');assert.equal(s.step,'recognize');
});
test('help starts before AED returns; arrival pauses with active clock, no tap-count gate',()=>{
 let s=help();s=act(s,'call');s=act(s,'cpr');assert.equal(s.cpr,true);assert.equal(s.dispatched,false);
 s=act(s,'dispatch');assert.equal(act(s,'receive-aed'),s);s=act(s,'pause');const p=s;s=travel(s);assert.equal(s,p);
 s=travel(act(s,'continue'));assert.equal(s.aedReady,true);assert.equal(s.beats,1);assert.equal(act(s,'receive-aed').step,'power');
});
test('pad gestures require exposed chest and correct destination',()=>{
 let s=device();assert.equal(act(s,'place-pad','upper','upper'),s);s=act(s,'expose');s=act(s,'place-pad','upper','side');assert.equal(s.pads.length,0);assert.equal(s.mistakes['action-cooperation'],1);
 s=act(s,'place-pad','side','side');assert.equal(s.step,'pads');assert.equal(act(s,'place-pad','side','side'),s);
 s=act(s,'place-pad','upper','upper');assert.equal(s.step,'analysis');assert.equal(act(s,'shock').step,'analysis');
});
for(const branch of ['shock','no-shock'] as const)test(`${branch}: clearing contact, equipment action, immediate resumption and handover`,()=>{
 let s=device(branch);s=act(s,'expose');s=act(act(s,'place-pad','upper','upper'),'place-pad','side','side');
 s=act(s,'clear-person','self');s=act(s,'clear-person','caller');assert.equal(s.step,'analysis');s=act(s,'clear-person','runner');assert.equal(s.step,'decision');assert.equal(s.clear,false);
 s=act(s,'shock');assert.equal(s.step,'decision');assert.equal(s.mistakes['action-cooperation'],1);
 if(branch==='shock'){s=clear(s);assert.equal(s.clear,true);s=act(s,'shock');assert.equal(s.shocked,true);}
 else assert.equal(s.shocked,false);
 s=act(s,'resume');s=act(s,'handover');assert.equal(s.phase,'complete');assert.ok(result(s).every(r=>r.done));assert.equal(act(s,'handover'),s);
 assert.equal('health' in s,false);assert.equal('flowers' in s,false);assert.deepEqual(act(s,'restart'),initialState(branch));
});
test('pause freezes gameplay and malformed timing never changes state',()=>{
 let s=help();for(const dt of [NaN,-1,5000,Infinity])assert.equal(reduce(s,{type:'tick',dt}),s);
 s=act(s,'pause');assert.equal(act(s,'call'),s);s=act(s,'continue');s=act(s,'wait');assert.equal(s.step,'help');assert.equal(s.mistakes['action-cooperation'],1);
});
