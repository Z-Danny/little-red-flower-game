import test from 'node:test';
import assert from 'node:assert/strict';
import { examplePlan } from '../app/game/placement/example-plan';
import { kitchenProject } from '../app/game/placement/sample';
import {
  clone,
  compileProject,
  inspectProject,
} from '../app/game/placement/model';
import {
  buildBatch,
  parseBatch,
  type LevelPlan,
} from '../app/game/placement/production';
import { createRun, reduceRun } from '../app/game/runtime/engine';
import { flowPack, stageState } from '../app/game/placement/flow';
import {
  PlacementSoundTimeline,
  synthesize,
  soundWav,
  validateWave,
} from '../app/game/placement/sound';
const batch = buildBatch(examplePlan),
  project = batch.results[0].project!,
  pack = compileProject(project);
const kitchen: LevelPlan = (() => {
  const p = kitchenProject,
    {
      schemaVersion: _version,
      id: _id,
      zones,
      zoneLabels,
      animations,
      ...scene
    } = p.pack.skin,
    r = p.pack.rules;
  return {
    id: r.id,
    title: r.title,
    kind: r.kind,
    location: r.location,
    description: r.description,
    briefing: r.briefing!,
    safety: r.safety,
    objects: r.objects.map((o) => ({
      ...o,
      support: '当前厨房已校准场景与支撑关系',
      sounds: p.audio!.objects[o.id],
    })),
    scene,
    targets: Object.entries(zones).map(([id, box]) => ({
      id,
      box,
      label: zoneLabels![id],
    })),
    actions: r.interactions.map((a) => {
      const { animation, grants, ...rule } = a;
      return {
        ...rule,
        goals: grants.map((id) => ({
          id,
          label: r.goals.find((g) => g.id === id)!.label,
        })),
        durationMs: animations[animation].durationMs,
        ...(p.placements[a.id]
          ? { placement: p.placements[a.id] }
          : { motion: animations[animation].tracks }),
        sounds: p.audio!.actions[a.id],
      };
    }),
    risk: r.risk,
    completion: {
      settleMs: r.completion.settleMs,
      summary: r.completion.summary,
    },
    review: p.review,
  };
})();
test('E07 compiles and real staged simulation completes', () => {
  assert.equal(batch.results[0].status, 'ready');
  assert.ok(batch.results[0].simulation.every((s) => s.passed));
  assert.ok(project.flow);
});
test('same production pipeline builds E07 and kitchen as distinct playable levels', () => {
  const result = buildBatch({ ...examplePlan, levels: [examplePlan.levels[0], kitchen] });
  assert.deepEqual(result.results.map(r => r.status), ['ready', 'ready']);
  assert.notEqual(result.results[0].project!.pack.skin.world.height, result.results[1].project!.pack.skin.world.height);
});
test('a batch compiles two different scenes and isolates a missing sound', () => {
  const p = clone(examplePlan);
  p.levels.push(kitchen);
  delete p.levels[0].objects[0].sounds;
  const r = buildBatch(p);
  assert.equal(r.results[0].status, 'blocked');
  assert.equal(r.results[1].status, 'ready');
  assert.match(r.results[0].issues[0].message, /音效表/);
});
test('unique level ids prevent overwrites', () => {
  const p = clone(examplePlan);
  p.levels.push(clone(p.levels[0]));
  assert.ok(buildBatch(p).results.every((r) => r.status === 'blocked'));
});
test('missing action sound and overlapping targets fail closed', () => {
  for (const mutate of [
    (p: typeof examplePlan) => {
      p.levels[0].actions[0].sounds = [];
    },
    (p: typeof examplePlan) => {
      p.levels[0].targets[0].box = p.levels[0].targets[1].box;
    },
  ]) {
    const p = clone(examplePlan);
    mutate(p);
    assert.equal(buildBatch(p).results[0].status, 'blocked');
  }
});
test('unreachable staged layout is rejected even when generic rules are reachable', () => {
  const p = clone(examplePlan);
  p.levels[0].flow!.stages[0].actions =
    p.levels[0].flow!.stages[0].actions.filter((a) => a !== 'protect');
  p.levels[0].flow!.stages[1].actions.push('protect');
  assert.equal(buildBatch(p).results[0].status, 'blocked');
});
test('unsafe audio names, unknown flow fields and broken WAV are rejected', () => {
  for (const mutate of [
    (p: any) => (p.audio.stages['../bad'] = p.audio.stages.after),
    (p: any) => (p.flow.extra = true),
    (p: any) =>
      (p.audio.objects.person.pickup.src = 'data:audio/wav;base64,AAAA'),
  ]) {
    const p = clone(project);
    mutate(p);
    assert.ok(inspectProject(p).some((i) => i.severity === 'error'));
  }
});
test('12 seconds without protection requires retry and cannot enter second stage', () => {
  let run = createRun(pack);
  for (let i = 0; i < 120; i++)
    run = reduceRun(pack, run, { type: 'tick', ms: 100 });
  const s = stageState(project.flow, run)!;
  assert.equal(s.missed, true);
  assert.equal(s.stage.id, 'shaking');
});
test('postquake objects and actions stay locked during shaking', () => {
  const run = createRun(pack),
    current = flowPack(project, pack, run);
  assert.equal(
    current.rules.objects.find((o) => o.id === 'gas')!.input,
    'none',
  );
  assert.ok(!current.rules.interactions.some((r) => r.id === 'inspect'));
});
test('sound at exactly animation completion is emitted once after action clears', () => {
  const p = clone(project);
  p.audio!.actions.protect[0].at = 1;
  const timeline = new PlacementSoundTimeline(pack, p.audio!);
  let run = createRun(pack);
  const input = { source: 'cushion', mode: 'drop' as const, target: 'head' };
  assert.deepEqual(timeline.begin(run, input), []);
  run = reduceRun(pack, run, { type: 'interact', input });
  while (run.action) run = reduceRun(pack, run, { type: 'tick', ms: 100 });
  assert.equal(
    timeline.advance(run.elapsed).filter((e) => e.event === 'protect').length,
    1,
  );
  assert.deepEqual(timeline.advance(run.elapsed + 100), []);
});
test('reset cancels pending sound and miss returns without a success sound', () => {
  const timeline = new PlacementSoundTimeline(pack, project.audio!),
    run = createRun(pack);
  const events = timeline.begin(run, { source: 'cushion', mode: 'drop' });
  assert.equal(events[0].event, 'miss');
  assert.equal(timeline.advance(450)[0].event, 'return');
  timeline.begin(run, { source: 'cushion', mode: 'drop', target: 'head' });
  timeline.reset();
  assert.deepEqual(timeline.advance(2000), []);
});
test('every supplied synth cue produces finite non-silent PCM WAV', () => {
  const sounds = [
    ...Object.values(project.audio!.objects).flatMap(Object.values),
    ...Object.values(project.audio!.actions)
      .flat()
      .map((c) => c.sound),
    ...Object.values(project.audio!.stages!),
  ];
  assert.equal(sounds.length, 52);
  for (const sound of sounds) {
    const samples = synthesize(sound);
    assert.ok(samples.every(Number.isFinite));
    assert.ok(samples.some((s) => Math.abs(s) > 0.02));
    const wav = soundWav(sound);
    validateWave(
      'data:audio/wav;base64,' + Buffer.from(wav).toString('base64'),
    );
  }
});
test('imported batch is revalidated instead of trusting ready flag', () => {
  const p = clone(batch);
  delete p.results[0].project!.audio;
  assert.throws(() => parseBatch(JSON.stringify(p)), /音效/);
});
