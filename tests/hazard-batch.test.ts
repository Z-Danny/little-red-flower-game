import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getHunt,huntPacks} from '../app/game/scene-hunt/registry';
import {createHunt,reduceHunt,pressure,type HuntRun,type HuntRules} from '../app/game/scene-hunt/model';
import {checkHunt,hitMask,camera,type HuntPack} from '../app/game/scene-hunt/schema';
import {presentationOf,endingFade} from '../app/game/scene-hunt/presentation';
import {performanceTier,performanceStage,validatePerformance,feedbackV2} from '../app/game/scene-hunt/performance';
import {levels} from '../app/game/levels';
import {recordBest,flowersFor,type BoardState} from '../app/game/leaderboard/model';
import responseDisplayBaseline from './fixtures/display-response-baseline.json';
type PlanLevel={authorId:string;id:string;order:number;title:string;targets:{id:string;name:string;color:string;lesson:string}[]};
const plan=JSON.parse(readFileSync('docs/hazard-batch-v2/production-plan.json','utf8')) as {levels:PlanLevel[]};
const existingIds=['typhoon-home','oil-fire','fire-patrol','rainstorm','gas-leak','scald','flood-kit','clear-corridor','lift-wait','well-call','charging-bedroom'];
const rgba=(hex:string):[number,number,number]=>[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)) as [number,number,number];
const packFor=(id:string)=>{const p=getHunt(id);assert.ok(p,`Missing registered new pack: ${id}`);return p;};
const started=(rules:HuntRules)=>reduceHunt(rules,createHunt(),{type:'start'});
const tick=(rules:HuntRules,r:HuntRun,ms:number)=>{for(let left=ms;left>0;left-=100)r=reduceHunt(rules,r,{type:'tick',ms:Math.min(left,100)});return r;};
const tap=(rules:HuntRules,r:HuntRun,id:string|null)=>reduceHunt(rules,r,{type:'tap',id,x:36,y:456});
function permutations(a:string[]):string[][]{return a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>j!==i)).map(p=>[v,...p])):[[]];}
test('batch: exact seven additions and preserved original identities',()=>{
  assert.equal(plan.levels.length,7);assert.deepEqual(plan.levels.map(p=>p.order),[14,15,16,17,18,19,20]);
  assert.equal(new Set(plan.levels.map(p=>p.id)).size,7);
  assert.equal(plan.levels.find(p=>p.authorId==='H06')?.id,'clear-corridor-check-v2');
  assert.equal(new Set(levels.map(l=>l.id)).size,levels.length);
  for(const id of existingIds)assert.ok(levels.some(l=>l.id===id),`Old catalog ID lost: ${id}`);
  for(const id of ['typhoon-home','oil-fire','flood-kit','clear-corridor','lift-wait','well-call','charging-bedroom'])assert.equal(levels.find(l=>l.id===id)?.playable,true,id);
  assert.equal(getHunt('typhoon-home')?.rules.order,1);assert.equal(getHunt('charging-bedroom')?.rules.order,13);
  assert.equal(getHunt('charging-bedroom')?.rules.targets.length,3);assert.equal(getHunt('oil-fire'),undefined);
  assert.equal(getHunt('charging-bedroom')?.performance,undefined);assert.equal(getHunt('typhoon-home')?.performance,undefined);
  assert.equal(huntPacks.length,9);
});
test('batch: original art/config bytes remain frozen; only approved lift/well display fields may differ',()=>{
  const audit=JSON.parse(readFileSync('docs/hazard-batch-v2/baseline-source-hashes.json','utf8')) as {files:{path:string;sha256:string}[]};
  const files=audit.files.filter(f=>f.path.startsWith('content/scenes/')||f.path.startsWith('public/levels/')||f.path.startsWith('content/levels/'));
  assert.ok(files.length>10,'Insufficient baseline evidence');
  for(const file of files){
    assert.ok(existsSync(file.path),file.path);
    const review=JSON.parse(readFileSync('docs/challenge-hud/config-review.json','utf8')).files[file.path];
    if(review){const v=JSON.parse(readFileSync(file.path,'utf8'));
      if(file.path.endsWith('level.json')){assert.equal(v.risk.seconds,50);assert.equal(v.risk.timeout,'fail');delete v.risk.seconds;delete v.risk.timeout;delete v.risk.peakFeedback;}
      else if(file.path.endsWith('rules.json')){assert.equal(v.seconds,50);assert.equal(v.timeout,'fail');delete v.seconds;delete v.timeout;}
      else{assert.equal(v.timer,'pressure-bar');assert.equal(v.clues,'on-demand');delete v.timer;delete v.clues;}
      assert.equal(createHash('sha256').update(JSON.stringify(v)).digest('hex'),review.unchangedSemanticSha256,file.path+' non-HUD fields changed');continue;
    }
    const approved=/^content\/levels\/(lift-wait|well-call)\/skins\/paperbook\.json$/.exec(file.path);
    if(!approved){assert.equal(createHash('sha256').update(readFileSync(file.path)).digest('hex'),file.sha256,file.path);continue;}
    const id=approved[1] as 'lift-wait'|'well-call', skin=JSON.parse(readFileSync(file.path,'utf8'));
    const background=id==='lift-wait'?'lift-room':'well-room';
    assert.equal(skin.background,background);
    assert.equal(skin.assets[background].src,`/levels/display-adaptation/${id}-backdrop.webp`);
    assert.deepEqual(skin.assets[background].sceneBounds,{x:0,y:0,w:720,h:id==='lift-wait'?1440:1320});
    assert.deepEqual(skin.framing.sceneBounds,skin.assets[background].sceneBounds);
    assert.deepEqual(skin.framing.critical,id==='lift-wait'?{x:58,y:226,w:607,h:956}:{x:70,y:260,w:600,h:966});
    assert.equal(createHash('sha256').update(JSON.stringify(skin.framing)).digest('hex'),responseDisplayBaseline.levels[id].approvedFramingSha256,'Only reviewed display fields are approved');
    // Normalize ONLY the two explicitly approved display additions. Everything
    // else must still match the old complete JSON, including all animations/masks.
    delete skin.framing;delete skin.assets[background].sceneBounds;
    skin.assets[background].src=`/levels/transcript-v1/${background}.webp`;
    assert.equal(createHash('sha256').update(JSON.stringify(skin)).digest('hex'),responseDisplayBaseline.levels[id].skinSemanticSha256,file.path);
  }
});
test('batch: shared feedback constants match contracted event durations',()=>{
  assert.deepEqual(feedbackV2,{missMs:450,missCooldownMs:500,markMs:800,foundMs:90,missSoundMs:160,silhouetteMs:220,flowerMs:180,revealHoldMs:800,revealFadeMs:1800,revealMs:5500});
});
for(const card of plan.levels){
  const ids=card.targets.map(t=>t.id),orders=permutations(ids);
  test(card.id+': config, timing, source paths and five independent targets',()=>{
    const p=packFor(card.id),r=p.rules,s=p.skin;
    assert.equal(checkHunt(p),p);assert.equal(r.feedbackVersion,2);assert.equal(r.order,card.order);assert.equal(r.title,card.title);
    assert.equal(r.markMs,800);assert.equal(r.revealMs,5500);assert.equal(r.seconds,50);assert.equal(r.timeout,'fail');
    assert.deepEqual(r.targets.map(t=>t.id),ids);assert.equal(orders.length,120);assert.equal(Object.keys(s.targets).length,5);
    assert.equal(s.width,720);assert.equal(s.height,1280);
    assert.ok(p.performance);assert.equal(validatePerformance(p.performance),p.performance);assert.equal(presentationOf(p).timer,'pressure-bar');
    for(const target of card.targets){assert.deepEqual(s.targets[target.id].color,rgba(target.color));assert.ok(r.targets.find(t=>t.id===target.id)?.lesson.trim());}
    for(const name of ['rules','skin','presentation','performance'])assert.ok(existsSync(`content/scenes/${card.id}/${name}.json`));
    for(const asset of [s.scene,s.safe,s.clean,s.mask,s.family,...Object.values(s.targets).map(t=>t.icon),...Object.entries(s.effects??{}).filter(([key])=>key.endsWith('Mask')).map(([,value])=>value as string)]){
      assert.match(asset,/^\/levels\//);assert.ok(existsSync('public'+asset),asset);
    }
    assert.ok(existsSync(`art-source/hazard-batch-v2/${card.authorId}/hit-samples.json`),'Missing actual pixel samples');
  });
  for(const order of orders)test(card.id+': permutation '+order.join(' > '),()=>{
    const {rules}=packFor(card.id);let r=started(rules),reveals=0,completes=0;
    for(const id of order){
      const foundBefore=r.found.length;r=tap(rules,r,id);
      assert.equal(tap(rules,r,id),r);assert.equal(tap(rules,r,ids.find(other=>other!==id)!),r);
      r=tick(rules,r,799);assert.equal(r.found.length,foundBefore);assert.equal(r.marking?.age,799);
      const previousPhase=r.phase;r=tick(rules,r,1);
      assert.equal(r.found.length,foundBefore+1);assert.equal(r.found.at(-1),id);assert.equal(r.marking,null);
      assert.deepEqual(r.foundAt,{id,at:r.elapsed});assert.equal(tap(rules,r,id),r);
      if(previousPhase==='playing'&&r.phase==='reveal')reveals++;
      if(foundBefore<4)assert.equal(r.stars,0);
    }
    assert.equal(reveals,1);assert.equal(r.phase,'reveal');assert.equal(r.revealAge,0);assert.equal(r.stars,3);
    assert.equal(reduceHunt(rules,r,{type:'end'}),r,'End cannot erase a completed finding sequence');
    r=tick(rules,r,800);assert.equal(endingFade(r.phase,r.revealAge),0);
    r=tick(rules,r,1);assert.ok(endingFade(r.phase,r.revealAge)>0);
    r=tick(rules,r,1799);assert.equal(r.revealAge,2600);assert.equal(endingFade(r.phase,r.revealAge),1);
    r=tick(rules,r,2899);assert.equal(r.phase,'reveal');r=tick(rules,r,1);if(r.phase==='complete')completes++;
    assert.equal(completes,1);assert.equal(r.revealAge,5500);
    assert.equal(tick(rules,r,90000),r);assert.equal(tap(rules,r,ids[0]),r);assert.deepEqual(reduceHunt(rules,r,{type:'reset'}),createHunt());
  });
  test(card.id+': each misclick costs 5s, ripple expires at450ms, valid target stays available',()=>{
    const {rules}=packFor(card.id),s=started(rules),miss=tap(rules,s,null);
    assert.equal(miss.elapsed,s.elapsed+5000);assert.equal(pressure(rules,miss),.1);
    assert.equal(miss.stars,0);assert.deepEqual(miss.found,[]);
    assert.equal(tap(rules,miss,'unknown').elapsed,10000);
    const valid=tap(rules,miss,ids[0]);assert.equal(valid.marking?.id,ids[0]);
    const almost=tick(rules,miss,449);assert.equal(almost.miss?.age,449);
    const expired=tick(rules,almost,1);assert.equal(expired.miss,null);assert.equal(tap(rules,expired,null).elapsed,expired.elapsed+5000);
    const eligible=tick(rules,expired,50);assert.equal(tap(rules,eligible,null).miss?.age,0);
    assert.equal(tap(rules,eligible,null).elapsed,eligible.elapsed+5000);
    assert.equal(reduceHunt(rules,s,{type:'tap',id:null,x:NaN,y:0}),s);
  });
  test(card.id+': four normalized stages precede failure and a fresh retry is solvable',()=>{
    const p=packFor(card.id),rules=p.rules;assert.ok(p.performance);
    let r=started(rules);
    for(const [at,tier] of [[0,0],[12499,0],[12500,1],[24999,1],[25000,2],[37499,2],[37500,3],[49999,3]]){
      r=tick(rules,r,at-r.elapsed);assert.equal(r.elapsed,at);assert.equal(performanceTier(r.elapsed,rules.seconds),tier);
      assert.equal(performanceStage(p.performance,r.elapsed,rules.seconds),p.performance.stages[tier]);assert.equal(r.phase,'playing');
      const penalized=tap(rules,r,null);assert.equal(pressure(rules,penalized),Math.min(1,pressure(rules,r)+.1));
    }
    r=tick(rules,r,1);assert.equal(r.phase,'failed');assert.equal(r.stars,0);assert.equal(pressure(rules,r),1);assert.equal(r.peak,true);
    r=reduceHunt(rules,reduceHunt(rules,r,{type:'reset'}),{type:'start'});
    for(const id of ids)r=tick(rules,tap(rules,r,id),800);
    assert.equal(r.phase,'reveal');assert.equal(r.stars,3);
    if(['H02','H04','H06','H08'].includes(card.authorId)){
      assert.equal(p.performance.atmosphere,'indoor');
      for(const s of p.performance.stages){assert.equal(s.rainCount,0);assert.equal(s.smokeCount,0);assert.equal(s.smokeAlpha,0);assert.equal(s.flameScale,1);}
    }
  });
  test(card.id+': end during each partial count cancels in-flight mark, freezes, awards nothing',()=>{
    const {rules}=packFor(card.id);
    for(let count=0;count<5;count++){
      let r=started(rules);for(const id of ids.slice(0,count))r=tick(rules,tap(rules,r,id),800);
      r=tick(rules,tap(rules,r,ids[count]),799);const beforeElapsed=r.elapsed;
      r=reduceHunt(rules,r,{type:'end'});assert.equal(r.phase,'unfinished');assert.equal(r.stars,0);
      assert.equal(r.marking,null);assert.equal(r.found.length,count);assert.equal(r.elapsed,beforeElapsed);
      assert.equal(tick(rules,r,100000),r);assert.equal(tap(rules,r,ids[count]),r);assert.equal(reduceHunt(rules,r,{type:'start'}),r);
      assert.deepEqual(reduceHunt(rules,r,{type:'reset'}),createHunt());
    }
    const ready=createHunt();assert.equal(reduceHunt(rules,ready,{type:'end'}),ready);
  });
  test(card.id+': invalid ticks cannot advance clocks; pause scheduling is verified in browser',()=>{
    const {rules}=packFor(card.id);const r=tick(rules,tap(rules,started(rules),ids[0]),400);
    for(const ms of [0,-1,NaN,Infinity])assert.equal(reduceHunt(rules,r,{type:'tick',ms}),r);
    assert.equal(tick(rules,r,399).found.length,0);assert.equal(tick(rules,r,400).found.length,1);
  });
  test(card.id+': exact RGB masks, blank/white/alpha/nonfinite/margins cannot identify',()=>{
    const {skin}=packFor(card.id),pixels=new Uint8ClampedArray(skin.width*skin.height*4);
    const rejected=[[0,0,0,255],[255,255,255,255],[254,0,0,255],[255,0,0,0]];
    rejected.forEach((c,i)=>pixels.set(c,i*4));
    rejected.forEach((_,i)=>assert.equal(hitMask(skin,pixels,i,0),null));
    Object.entries(skin.targets).forEach(([id,t],i)=>{pixels.set([...t.color,255],(10+i)*4);assert.equal(hitMask(skin,pixels,10+i,0),id);});
    for(const [x,y] of [[-1,0],[0,-1],[720,0],[0,1280],[NaN,4],[4,Infinity]])assert.equal(hitMask(skin,pixels,x,y),null);
    for(const [w,h] of [[320,740],[390,844],[1440,900]]){const c=camera(skin,w,h);assert.ok(c.x>=0&&c.y>=0);
      for(const t of Object.values(skin.targets)){const x=t.bounds.x+t.bounds.w/2,y=t.bounds.y+t.bounds.h/2;
        assert.ok(Math.abs((c.x+x*c.scale-c.x)/c.scale-x)<1e-8);assert.ok(Math.abs((c.y+y*c.scale-c.y)/c.scale-y)<1e-8);}
    }
  });
  test(card.id+': best score is idempotent, original and inactive-player saves preserved',()=>{
    const caps=Object.fromEntries(levels.filter(l=>l.playable).map(l=>[l.id,3]));
    const original:BoardState={version:1,activePlayerId:'qa',players:[{id:'qa',name:'测试',region:'本地',createdAt:1,completed:{'typhoon-home':2,'charging-bedroom':3}},{id:'other',name:'另一位',region:'',createdAt:2,completed:{'oil-fire':3}}]};
    const snapshot=structuredClone(original),once=recordBest(original,card.id,3,caps);
    assert.equal(flowersFor(once.players[0],caps)-flowersFor(original.players[0],caps),3);
    assert.deepEqual(recordBest(once,card.id,3,caps),once);assert.deepEqual(recordBest(once,card.id,1,caps),once);
    assert.deepEqual(original,snapshot);assert.deepEqual(once.players[1],original.players[1]);
    assert.throws(()=>recordBest(original,card.id,0,caps),'Unfinished zero cannot be recorded as a score');
  });
}
