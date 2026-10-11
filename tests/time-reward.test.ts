import test from 'node:test';
import assert from 'node:assert/strict';
import { timeReward, rewardThresholds, rewardSecondsLabel } from '../app/game/journey/time-reward';
import { rewardReferenceSeconds } from '../app/game/journey/level-reward';
import { journeyMap, canEnter, flowerTotal } from '../app/game/journey/progress';
import { claimFirstCompletion, parseState, type BoardState } from '../app/game/leaderboard/model';
import { createLocalLeaderboard } from '../app/game/leaderboard/local-provider';
import { getLevel } from '../app/game/levels';
const ids = journeyMap.regions.flatMap(r => r.nodes.map(n => n.id)).filter(id => getLevel(id)?.playable);
const timedIds = ids.filter(id => getLevel(id)?.engine !== 'first-aid-cpr');
const caps = Object.fromEntries(ids.map(id => [id, 3]));
for (const id of timedIds) test(id + ': three exact time bands, no new timeout', () => {
  const seconds = rewardReferenceSeconds(id), {threeMs, twoMs} = rewardThresholds(seconds);
  for (const [ms, flowers] of [[0,3],[threeMs,3],[threeMs+0.01,2],[twoMs,2],[twoMs+0.01,1],[seconds*10000,1]])
    assert.equal(timeReward(ms, seconds).flowers, flowers);
});
test('actual engine duration overrides legacy level metadata', () => {
  assert.equal(rewardReferenceSeconds('typhoon-home'),50);
  assert.throws(()=>rewardReferenceSeconds('unknown'));
  assert.equal(rewardSecondsLabel(25000.001),'25.1');
});
test('invalid clocks cannot claim a rating', () => {
  for (const n of [NaN, Infinity, -1]) assert.throws(()=>timeReward(n,50));
  for (const n of [NaN, Infinity, 0, -1]) assert.throws(()=>timeReward(0,n));
});
test('all playable levels retain best, award only delta and never lose legacy scores', () => {
  assert.equal(ids.length,26);
  assert.equal(timedIds.length,25);
  let state:BoardState={version:1,activePlayerId:'a',players:[{id:'a',name:'玩家',region:'',createdAt:1,completed:{}}]};
  let awarded=0;
  for(const id of ids) for (const score of [1,1,2,1,3,2,3]) {
    const before=state.players[0].completed[id]??0;
    const result=claimFirstCompletion(state,id,'a',caps,score);
    assert.equal(result.receipt.reward,Math.max(0,score-before));
    awarded+=result.receipt.reward;state=result.state;
    assert.equal(result.receipt.score,score);
    assert.equal(state.players[0].completed[id],Math.max(before,score));
    assert.deepEqual(parseState(state),state);
  }
  assert.equal(awarded,ids.length * 3);assert.equal(flowerTotal(state.players[0].completed),ids.length * 3);
  for(const n of [0,-1,4,1.5,NaN,Infinity]) assert.throws(()=>claimFirstCompletion(state,ids[0],'a',caps,n));
});
test('provider persists 1→2→3, reload and duplicate claims cannot farm flowers', async()=>{
  const bytes=new Map<string,string>(); let seq=0;
  const provider=()=>createLocalLeaderboard({storage:()=>({getItem:k=>bytes.get(k)??null,setItem:(k,v)=>{bytes.set(k,v)}}),id:()=>String(++seq),caps,canEnter});
  const p=provider(), a=await p.read();
  for(const score of [1,2,3]) {
    const result=await p.claimCompletion('typhoon-home',a.current.id,score);
    assert.equal(result.receipt.reward,1);
    assert.equal((await provider().read()).current.completed['typhoon-home'],score);
    assert.equal(canEnter('flood-kit',result.snapshot.current.completed),true);
    assert.equal((await provider().claimCompletion('typhoon-home',a.current.id,score)).receipt.reward,0);
  }
  const b=await p.createPlayer({name:'另一个玩家',region:''});
  await p.claimCompletion('oil-fire',a.current.id,1);
  assert.equal((await p.read()).current.id,b.current.id);
  assert.deepEqual((await p.read()).current.completed,{});
});

test('local CPR stays untimed and preview-only first-aid nodes never receive a rating', () => {
  assert.equal(getLevel('first-aid-cpr')?.riskSeconds, 0);
  assert.throws(() => rewardReferenceSeconds('first-aid-cpr'));
  for (const node of journeyMap.regions.flatMap(region => region.nodes)) {
    if (!getLevel(node.id)?.playable) assert(!ids.includes(node.id));
  }
});
