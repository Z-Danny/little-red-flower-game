import test from 'node:test';
import assert from 'node:assert/strict';
import rawRules from './fixtures/flood-rooftop-v2/level.json';
import { createRun, reduceRun, findRule, completedForReward } from '../app/game/runtime/engine';
import { validatePackage } from '../app/game/runtime/validate';
import type { LevelPackage, Rules, Run, Skin } from '../app/game/runtime/schema';

// Gameplay-only fixture skin, deliberately separate from production art acceptance.
// Rooftop is now archived. Keep its rule regression separate from the shipping indoor edition.
const rules=rawRules as Rules;
function makePack():LevelPackage {
  const objectPose={asset:'actor',x:50,y:400,w:100,h:180,depth:30};
  const targets=[...new Set(rules.interactions.flatMap(rule=>rule.target?[rule.target]:[]))];
  const skin:Skin={schemaVersion:1,id:'test-rooftop-logic',world:{width:720,height:1280},background:'scene',
    assets:{scene:{src:'/levels/test/scene.webp',alpha:false},actor:{src:'/levels/test/actor.webp',alpha:true}},
    poses:{'world-scene':{asset:'scene',x:0,y:0,w:720,h:1280,depth:0,blockInput:false},
      ...Object.fromEntries(rules.objects.map((object,i)=>[object.id,{...objectPose,x:10+i*55}]))},
    zones:Object.fromEntries(targets.map((id,i)=>[id,{x:10+i*100,y:900,w:80,h:100}])),
    states:[],animations:Object.fromEntries(rules.interactions.map(rule=>[rule.animation,{durationMs:rule.failure?1500:1000,
      tracks:[{object:rule.source,keyframes:[{at:.5,rotation:.02},{at:1,rotation:0}]}]}])),effects:[],
    presentation:{durationMs:60000,failureReveal:true,effects:[]}};
  return validatePackage(structuredClone(rawRules),skin);
}
const pack=makePack();
const rule=(id:string)=>{const result=pack.rules.interactions.find(r=>r.id===id);assert(result,`missing ${id}`);return result;};
function advance(run:Run,ms:number){for(let t=0;t<ms;t+=20)run=reduceRun(pack,run,{type:'tick',ms:Math.min(20,ms-t)});return run;}
function start(run:Run,id:string){const spec=rule(id);assert.equal(findRule(pack,run,spec)?.id,id);return reduceRun(pack,run,{type:'interact',input:spec});}
function done(run:Run,id:string){const next=start(run,id);assert(next.action,`expected action ${id}`);return advance(next,next.action.duration);}
function powered(){return done(done(createRun(pack),'approach-stairs'),'turn-off-power');}
const middle=['send-location','pack-water','pack-light'];
const permutations=[middle,[middle[0],middle[2],middle[1]],[middle[1],middle[0],middle[2]],
  [middle[1],middle[2],middle[0]],[middle[2],middle[0],middle[1]],[middle[2],middle[1],middle[0]]];

test('seven actual goals, independent props, correct tap/drag contract, no legacy steps',()=>{
  assert.equal(pack.rules.goals.length,7);assert.equal(pack.rules.completion.requires.length,7);assert.equal(pack.rules.id,'flood-highground-practice');assert.equal(pack.rules.order,28);
  assert.deepEqual(pack.rules.goals.map(g=>g.id),['at-stairs','power-off','rescue-contacted','water-packed','light-packed','float-ready','at-rooftop']);
  for(const id of ['breaker','phone','car'])assert.equal(pack.rules.objects.find(o=>o.id===id)!.input,'tap');
  for(const id of ['family','bottled-water','flashlight','foam','stool'])assert.equal(pack.rules.objects.find(o=>o.id===id)!.input,'drag');
  for(const id of ['panel','backpack'])assert.equal(pack.rules.objects.find(o=>o.id===id)!.input,'none');
  for(const id of ['battery-radio','bright-cloth'])assert(!pack.rules.objects.some(o=>o.id===id));
  assert(!pack.rules.interactions.some(r=>r.source==='stool'));assert(pack.rules.goals.every(g=>g.showTarget===false));
});
for(const order of permutations)test(`message, water and light exchange freely: ${order.join(' → ')}`,()=>{
  let run=powered();assert.deepEqual(run.resolved,['at-stairs','power-off']);
  for(const id of [...order,'combine-float'])run=done(run,id);
  assert.equal(run.resolved.length,6);assert.equal(run.phase,'playing');assert.equal(run.stars,0);
  const action=start(run,'evacuate-roof');assert.equal(action.action!.rule,'evacuate-roof');assert.equal(action.resolved.length,6);
  assert.equal(advance(action,999).phase,'playing');run=advance(action,1000);
  assert.equal(run.phase,'settling');assert.equal(run.escaped,undefined);assert.equal(run.resolved.length,7);assert.equal(run.stars,3);
  assert.equal(advance(run,5199).phase,'settling');run=advance(run,5200);assert(completedForReward(run));
});
test('float preparation may happen directly after power-off, without forcing message/packing order',()=>{
  let run=done(powered(),'combine-float');assert.equal(run.resolved.length,3);
  for(const id of ['pack-light','send-location','pack-water'])run=done(run,id);
  assert.equal(done(run,'evacuate-roof').phase,'settling');
});
test('missing prerequisites explain themselves neutrally; no animation can skip the staircase or power-off',()=>{
  const initial=createRun(pack);
  for(const [inputId,blockedId]of [['turn-off-power','blocked-breaker'],['send-location','blocked-phone'],['pack-water','blocked-water'],
    ['pack-light','blocked-light'],['combine-float','blocked-foam'],['evacuate-roof','blocked-roof']]){
    const input=rule(inputId);assert.equal(findRule(pack,initial,input)?.id,blockedId);
    const action=reduceRun(pack,initial,{type:'interact',input});assert.equal(action.action!.rule,blockedId);assert(action.notice?.text);
    const after=advance(action,1000);assert.deepEqual(after.resolved,[]);assert.equal(after.mistakes,0);assert.equal(after.stars,0);assert.equal(after.phase,'playing');
  }
  const atStairs=done(initial,'approach-stairs');assert.equal(findRule(pack,atStairs,rule('turn-off-power'))?.id,'turn-off-power');
  for(const id of [...middle,'combine-float'])assert.equal(findRule(pack,atStairs,rule(id))!.outcome,'neutral');
});
test('busy and repeated inputs cannot grant goals twice; input modes remain explicit',()=>{
  const initial=createRun(pack),approaching=start(initial,'approach-stairs');assert.deepEqual(approaching.resolved,[]);
  assert.equal(reduceRun(pack,approaching,{type:'interact',input:rule('turn-off-power')}),approaching);
  assert.equal(reduceRun(pack,approaching,{type:'tick',ms:100,paused:true}),approaching);
  let run=advance(approaching,1000);run=done(run,'turn-off-power');
  assert.equal(reduceRun(pack,run,{type:'interact',input:rule('turn-off-power')}),run);
  assert.equal(reduceRun(pack,run,{type:'interact',input:{source:'phone',mode:'drop',target:'bag-zone'}}),run);
  assert.equal(reduceRun(pack,run,{type:'interact',input:{source:'family',mode:'tap'}}),run);
  for(const id of middle){run=done(run,id);assert.equal(reduceRun(pack,run,{type:'interact',input:rule(id)}),run);}
  assert.equal(run.resolved.length,5);
});
for(const danger of ['enter-flood','touch-wire','stay-in-car'])test(`${danger}: always immediately fails even after power-off/float preparation`,()=>{
  const spec=rule(danger);assert.equal(spec.failure,true);assert.equal(spec.outcome,'danger');assert.deepEqual(spec.grants,[]);
  assert(!spec.requires?.length);assert(!spec.unless?.length);
  for(const initial of [createRun(pack),powered(),done(powered(),'combine-float')]){
    const failed=start(initial,danger);assert.equal(failed.phase,'failed');assert.equal(failed.action,null);assert.equal(failed.failure!.rule,danger);
    assert.equal(failed.stars,0);assert.equal(failed.mistakes,initial.mistakes+1);assert.deepEqual(failed.resolved,initial.resolved);
    assert.equal(reduceRun(pack,failed,{type:'interact',input:rule('evacuate-roof')}),failed);
    const after=advance(failed,1500);assert.equal(after.phase,'failed');assert.equal(after.failure!.age,1500);assert.equal(after.elapsed,initial.elapsed);
    assert(!completedForReward(after));assert.deepEqual(reduceRun(pack,after,{type:'reset'}),createRun(pack));
  }
});
test('every incomplete supply subset may escape early without punishment or flowers',()=>{
  const preparations=[...middle,'combine-float'];
  const states=[done(createRun(pack),'approach-stairs')];
  for(let mask=0;mask<15;mask++){
    let run=powered();for(let i=0;i<4;i++)if(mask&(1<<i))run=done(run,preparations[i]);states.push(run);
  }
  for(const before of states){
    assert.equal(findRule(pack,before,rule('evacuate-roof'))!.id,'early-roof-escape');
    let escaped=done(before,'early-roof-escape');assert.equal(escaped.phase,'settling');assert.equal(escaped.escaped,true);
    assert.equal(escaped.mistakes,before.mistakes);assert.deepEqual(escaped.resolved,before.resolved);assert.equal(escaped.stars,0);
    escaped=advance(escaped,5200);assert.equal(escaped.phase,'complete');assert(!completedForReward(escaped));
    assert(!escaped.resolved.includes('at-rooftop'));
  }
});
test('ordinary furniture bounces without changing pressure, mistakes or goals',()=>{
  for(const target of Object.keys(pack.skin.zones)){
    const initial=powered(),action=reduceRun(pack,initial,{type:'interact',input:{source:'stool',mode:'drop',target,point:{x:400,y:900}}});
    assert.equal(action.action!.rule,null);assert.equal(action.phase,'playing');assert.equal(action.risk,initial.risk);assert.equal(action.mistakes,initial.mistakes);
    const after=advance(action,500);assert.equal(after.phase,'playing');assert.deepEqual(after.resolved,initial.resolved);assert.equal(after.mistakes,initial.mistakes);assert.equal(after.stars,0);
  }
});
test('elapsed pressure never unlocks wading or forces lingering for supplies',()=>{
  let run=advance(powered(),180000);assert.equal(run.phase,'playing');assert.equal(pack.rules.risk.timeout,'continue');
  assert.equal(findRule(pack,run,rule('evacuate-roof'))!.id,'early-roof-escape');
  for(const danger of ['enter-flood','touch-wire','stay-in-car'])assert.equal(findRule(pack,run,rule(danger))!.failure,true);
  for(const id of [...middle,'combine-float','evacuate-roof'])run=done(run,id);assert.equal(run.phase,'settling');
});
test('scenario states safe breaker limits, hazardous external power, roof protection and offline messaging',()=>{
  const text=[pack.rules.description,pack.rules.safety,pack.rules.completion.summary].join('');
  for(const term of ['干燥','完整','坚固围栏','遮雨','关闭本户电闸不代表外部电线或积水断电','不靠近、不操作','不是救生保证','不为物资停留','离线模拟'])assert(text.includes(term),term);
  assert(rule('send-location').feedback!.includes('2人'));assert(rule('send-location').feedback!.includes('模拟'));
  assert.equal(pack.rules.interactions.filter(r=>r.outcome==='correct').length,7);
});
