import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {getHunt,huntPacks} from '../app/game/scene-hunt/registry';
import {createHunt,reduceHunt,pressure,type HuntRun} from '../app/game/scene-hunt/model';
import {camera,hitMask,checkHunt} from '../app/game/scene-hunt/schema';
import {presentationOf,endingFade,timerLabel} from '../app/game/scene-hunt/presentation';
import {quietElectric} from '../app/game/scene-hunt/audio-profiles';
import {levels} from '../app/game/levels';
import {recordBest,type BoardState} from '../app/game/leaderboard/model';
const pack=getHunt('charging-bedroom')!,rules=pack.rules;
const tick=(r:HuntRun,ms:number)=>{for(let left=ms;left>0;left-=100)r=reduceHunt(rules,r,{type:'tick',ms:Math.min(left,100)});return r;};
const tap=(r:HuntRun,id:string|null)=>reduceHunt(rules,r,{type:'tap',id,x:80,y:800});
const start=()=>reduceHunt(rules,createHunt(),{type:'start'});
function permutations(a:string[]):string[][] {return a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>i!==j)).map(p=>[v,...p])):[[]];}
for(const order of permutations(rules.targets.map(t=>t.id)))test('bedroom any order: '+order.join(' > '),()=>{
  let r=start();let reveals=0,completes=0;
  for(const id of order){r=tap(r,id);assert.equal(tap(r,id),r);assert.equal(tap(r,'unknown').elapsed,r.elapsed+(r.found.length===rules.targets.length-1?0:5000));
    r=tick(r,799);assert.ok(!r.found.includes(id));const prior=r.phase;r=tick(r,1);assert.ok(r.found.includes(id));
    if(prior==='playing'&&r.phase==='reveal')reveals++;
    assert.equal(tap(r,id),r);
  }
  assert.equal(r.phase,'reveal');assert.equal(reveals,1);assert.equal(r.stars,3);
  r=tick(r,799);assert.equal(endingFade(r.phase,r.revealAge),0);
  r=tick(r,1801);assert.equal(endingFade(r.phase,r.revealAge),1);
  r=tick(r,2899);assert.equal(r.phase,'reveal');r=tick(r,1);if(r.phase==='complete')completes++;
  assert.equal(completes,1);assert.equal(tick(r,90000),r);assert.equal(tap(r,'covered_phone'),r);
  assert.deepEqual(reduceHunt(rules,r,{type:'reset'}),createHunt());
});
test('new level added; all prior IDs and playable branches stay intact',()=>{
  assert.equal(huntPacks.filter(p=>!p.performance).length,2);assert.equal(getHunt('typhoon-home')?.rules.order,1);
  assert.equal(getHunt('oil-fire'),undefined);
  for(const id of ['typhoon-home','oil-fire','flood-kit','clear-corridor','lift-wait','well-call','charging-bedroom'])assert.equal(levels.find(l=>l.id===id)?.playable,true,id);
  assert.equal(levels.find(l=>l.id==='oil-fire')?.order,2);
  assert.equal(levels.filter(l=>l.id==='charging-bedroom').length,1);
  assert.equal(levels.find(l=>l.id==='charging-bedroom')?.engine,'scene-hunt');
  assert.equal(rules.order,13);assert.equal(rules.targets.length,3);
});
test('independent storage id and repeat result cannot farm flowers',()=>{
  const caps={'typhoon-home':3,'oil-fire':3,'charging-bedroom':3};
  const original:BoardState={version:1,activePlayerId:'qa',players:[{id:'qa',name:'测试',region:'',createdAt:1,completed:{'typhoon-home':3,'oil-fire':2}}]};
  const first=recordBest(original,'charging-bedroom',3,caps);
  assert.deepEqual(recordBest(first,'charging-bedroom',3,caps),first);
  assert.deepEqual(original.players[0].completed,{'typhoon-home':3,'oil-fire':2});
  assert.deepEqual(first.players[0].completed,{'typhoon-home':3,'oil-fire':2,'charging-bedroom':3});
});
test('50-second training deadline fails without inventing an accident; retry stays playable',()=>{
  let r=tick(start(),50000);assert.equal(r.phase,'failed');assert.equal(pressure(rules,r),1);assert.equal(r.peak,true);
  r=tap(r,null);assert.equal(r.found.length,0);assert.equal(r.stars,0);
  r=reduceHunt(rules,reduceHunt(rules,r,{type:'reset'}),{type:'start'});
  for(const t of rules.targets)r=tick(tap(r,t.id),800);assert.equal(r.phase,'reveal');
});
test('no weather, heat, panic warnings or blanket all-safe language',()=>{
  const v=presentationOf(pack);assert.equal(v.environment,'none');assert.equal(v.characters,'breathing');
  assert.equal(v.audio,'quiet_electric');assert.equal(v.timer,'pressure-bar');assert.equal(v.clues,'on-demand');assert.deepEqual(v.warnings,[]);
  assert.equal(v.celebration,false);assert.ok(v.reveal.includes('交专业人员处理'));
  assert.ok(v.endingNote.includes('仍异常'));assert.ok(!/风险.*消除|全屋安全/.test(v.reveal));
  assert.equal(pack.skin.outside,undefined);assert.equal(pack.skin.entry,undefined);
});
test('unknown ID colors, white people and transparent pixels never count',()=>{
  const s=pack.skin,d=new Uint8ClampedArray(s.width*s.height*4);
  [[254,0,0,255],[255,255,255,255],[0,0,0,255],[255,0,0,0]].forEach((c,i)=>d.set(c,i*4));
  for(let i=0;i<4;i++)assert.equal(hitMask(s,d,i,0),null);
  Object.entries(s.targets).forEach(([id,t],i)=>{d.set([...t.color,255],(10+i)*4);assert.equal(hitMask(s,d,10+i,0),id);});
});
test('contain inverse transform at mobile and desktop plus letterbox rejection',()=>{
  for(const [w,h] of [[320,740],[390,844],[1440,900]]){
    const c=camera(pack.skin,w,h);assert.ok(c.x>=0&&c.y>=0);
    for(const t of Object.values(pack.skin.targets)){const b=t.bounds,x=b.x+b.w/2,y=b.y+b.h/2;
      assert.ok(Math.abs(((c.x+x*c.scale)-c.x)/c.scale-x)<1e-8);assert.ok(Math.abs(((c.y+y*c.scale)-c.y)/c.scale-y)<1e-8);
    }
    assert.equal(hitMask(pack.skin,new Uint8ClampedArray(4),-1,0),null);
  }
});
test('elapsed timer is not a manufactured real-world deadline',()=>{
  assert.equal(timerLabel(0),'00:00');assert.equal(timerLabel(90000),'01:30');assert.equal(timerLabel(121250),'02:01');
});
test('profile rejects invalid shape or storm without regions',()=>{
  for(const mutate of [(p:any)=>p.presentation.environment='storm',(p:any)=>p.presentation.audio='voice',(p:any)=>p.skin.targets.covered_phone.color=[255,255,255],(p:any)=>p.rules.revealMs=2600]){
    const bad=structuredClone(pack);mutate(bad);assert.throws(()=>checkHunt(bad));
  }
});
test('audio is local original E/B/G, no ambience, bounded cues',()=>{
  assert.deepEqual(quietElectric.bpm,[60,72]);assert.equal(quietElectric.master,.45);assert.equal(quietElectric.ambienceGain,0);
  assert.equal(quietElectric.markMs,800);assert.equal(quietElectric.foundMs,90);assert.equal(quietElectric.missMs,70);assert.ok(quietElectric.sfxMax<=.08);
  const src=readFileSync('app/game/scene-hunt/sound.ts','utf8');assert.ok(!/speechSynthesis|new Audio\(|fetch\(/.test(src));
});
test('new assets are local; source protection gates recorded',()=>{
  for(const p of [pack.skin.scene,pack.skin.safe,pack.skin.clean,pack.skin.mask,pack.skin.family,...Object.values(pack.skin.targets).map(t=>t.icon)])assert.ok(existsSync('public'+p),p);
  const report=JSON.parse(readFileSync('art-source/charging-bedroom-v1/processing.json','utf8'));
  assert.equal(report.unchangedOutsideAllowedRepair,true);assert.equal(report.hazardPixelsUnchanged,true);assert.equal(report.objectAndHitMasksIdentical,true);
});
