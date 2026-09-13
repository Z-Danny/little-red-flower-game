import test from 'node:test';
import assert from 'node:assert/strict';
import { getPackage } from '../app/game/levels';
import {
  journeyMap,
  canEnter,
  flowerTotal,
  nodeStatus,
} from '../app/game/journey/progress';
import {
  createRun,
  reduceRun,
  findRule,
  hasAll,
} from '../app/game/runtime/engine';
import {
  relevantZones,
  pickRelevantZone,
} from '../app/game/runtime/drop-zones';
import type { LevelPackage, Run } from '../app/game/runtime/schema';
const nodes = journeyMap.regions.flatMap((r) => r.nodes);
const ids = nodes.map((n) => n.id).filter((id) => id.endsWith('-practice'));
const advance = (pack: LevelPackage, initial: Run, ms: number) => {
  let run = initial;
  for (let t = 0; t < ms; t += 20)
    run = reduceRun(pack, run, { type: 'tick', ms: Math.min(20, ms - t) });
  return run;
};
void test('eight approved practices and two explicit exclusions; old 48 flowers preserved', () => {
  assert.equal(ids.length, 8);
  const old = nodes.filter((n) => !ids.includes(n.id));
  const scores = Object.fromEntries(old.map((n) => [n.id, 3]));
  assert.equal(old.length, 16);
  assert.equal(flowerTotal(scores), 48);
  for (const id of [
    'quake-cover-practice',
    'car-window-practice',
    'fire-shelter-practice',
  ])
    assert.equal(nodeStatus(id, scores), 'available');
  for (const id of [
    'bleeding-pressure-practice',
    'electric-isolate-practice',
  ]) {
    assert.equal(getPackage(id), undefined);
    assert.equal(canEnter(id, scores), false);
  }
});
for (const id of ids)
  void test(`${id}: authored errors recover or explicitly fail; goals and observe period survive integration`, () => {
    const pack = getPackage(id)!;
    assert(pack.skin.presentation);
    assert.equal(pack.skin.id, 'paper-gouache');
    let run = createRun(pack),
      waited = false;
    for (const o of pack.rules.objects.filter((o) => o.stages?.length))
      assert(
        !findRule(pack, run, {
          source: o.id,
          mode: o.input === 'tap' ? 'tap' : 'drop',
        }),
      );
    const wrong = pack.rules.interactions.find(
      (r) => r.outcome === 'danger' && findRule(pack, run, r)?.id === r.id,
    );
    if (wrong) {
      run = reduceRun(pack, run, { type: 'interact', input: wrong });
      run = advance(pack, run, 1600);
      assert.deepEqual(run.resolved, []);
      if(wrong.failure){assert.equal(run.phase,'failed');assert.equal(run.stars,0);run=reduceRun(pack,run,{type:'reset'});}
    }
    for (let guard = 0; guard < 35 && run.phase === 'playing'; guard++) {
      const rule = pack.rules.interactions.find(
        (r) => r.outcome === 'correct' && findRule(pack, run, r)?.id === r.id,
      );
      if (!rule) {
        const stages = (pack.rules.stages ?? []).filter(
          (s) =>
            hasAll(run.resolved, s.requires) && !run.stages?.includes(s.id),
        );
        assert(stages.length, 'reachable continuation');
        run = advance(
          pack,
          run,
          Math.max(...stages.map((s) => s.afterMs)) + 20,
        );
        waited = true;
        continue;
      }
      if (rule.target) {
        assert(relevantZones(pack, run, rule.source).includes(rule.target));
        const b = pack.skin.zones[rule.target];
        let hits = 0;
        for (const [x, y] of [
          [0.05, 0.5],
          [0.95, 0.5],
          [0.5, 0.05],
          [0.5, 0.95],
          [0.5, 0.5],
        ])
          if (
            pickRelevantZone(
              pack,
              run,
              { x: b.x + b.w * x, y: b.y + b.h * y },
              rule.source,
            ) === rule.target
          )
            hits++;
        assert(hits, 'drawn target resolves for carried source');
      }
      const before = [...run.resolved];
      run = reduceRun(pack, run, { type: 'interact', input: rule });
      assert.equal(run.action?.rule, rule.id);
      assert.deepEqual(
        reduceRun(pack, run, { type: 'tick', ms: 100, paused: true }),
        run,
        'pause freezes action and stage',
      );
      const duration = pack.skin.animations[rule.animation].durationMs;
      run = advance(pack, run, duration / 2);
      assert.deepEqual(
        run.resolved,
        before,
        'goals commit only after animation',
      );
      run = advance(pack, run, Math.ceil(duration / 2) + 20);
      assert(hasAll(run.resolved, rule.grants));
    }
    assert.equal(run.phase, 'settling');
    assert(hasAll(run.resolved, pack.rules.completion.requires));
    const remaining =
      pack.rules.completion.settleMs +
      (pack.rules.completion.observeMs ?? 0) -
      run.settleAge;
    run = advance(pack, run, remaining - 1);
    assert.equal(run.phase, 'settling');
    run = advance(pack, run, 1);
    assert.equal(run.phase, 'complete');
    assert.equal(run.stars, 3);
    assert.deepEqual(createRun(pack).resolved, []);
    if (pack.rules.stages?.length)
      assert(waited || run.stages?.length, 'stage must be observable');
  });
