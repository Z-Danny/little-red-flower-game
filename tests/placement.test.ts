import test from 'node:test';
import assert from 'node:assert/strict';
import { kitchenProject } from '../app/game/placement/sample';
import {
  clone,
  compileProject,
  dropInput,
  inspectProject,
  parseProject,
  simulateProject,
} from '../app/game/placement/model';
import { createRun, reduceRun } from '../app/game/runtime/engine';
import { scenePoses } from '../app/game/runtime/scene';
import type { Run } from '../app/game/runtime/schema';
const pack = compileProject(kitchenProject);
const advance = (r: Run) => {
  for (let n = 0; n < 80 && (r.action || r.phase === 'settling'); n++)
    r = reduceRun(pack, r, { type: 'tick', ms: 100 });
  return r;
};
test('sample validates and all simulations pass', () => {
  assert.deepEqual(
    inspectProject(kitchenProject).filter((i) => i.severity === 'error'),
    [],
  );
  assert.ok(simulateProject(kitchenProject).every((x) => x.passed));
});
for (const order of [
  ['shutoff', 'cover', 'evacuate'],
  ['cover', 'shutoff', 'evacuate'],
])
  test('real reducer completes ' + order.join(' → '), () => {
    let run = createRun(pack);
    for (const id of order) {
      const r = pack.rules.interactions.find((r) => r.id === id)!;
      run = advance(
        reduceRun(pack, run, {
          type: 'interact',
          input: { source: r.source, mode: r.mode, target: r.target },
        }),
      );
    }
    assert.equal(run.phase, 'complete');
    assert.equal(run.mistakes, 0);
  });
test('prerequisites block early evacuation without locking later inputs', () => {
  let run = advance(
    reduceRun(pack, createRun(pack), {
      type: 'interact',
      input: { source: 'person', mode: 'drop', target: 'exit' },
    }),
  );
  assert.deepEqual(run.resolved, []);
  assert.equal(run.mistakes, 0);
  assert.equal(run.action, null);
});
test('goal commits only when animation ends, lid has stable final pose and depth', () => {
  let run = reduceRun(pack, createRun(pack), {
    type: 'interact',
    input: {
      source: 'lid',
      mode: 'drop',
      target: 'pan',
      point: { x: 270, y: 520 },
    },
  });
  run = reduceRun(pack, run, { type: 'tick', ms: 100 });
  assert.deepEqual(run.resolved, []);
  run = advance(run);
  const lid = scenePoses(pack, run, true).find((p) => p.id === 'lid')!;
  assert.equal(lid.x, kitchenProject.placements.cover.snap.x);
  assert.ok(lid.depth > pack.skin.poses.pan.depth);
});
test('anchor determines drop target while animation keeps released center', () => {
  const p = clone(kitchenProject);
  p.placements.cover.anchor = { x: 0, y: 0 };
  const b = { x: 140, y: 460, w: 188, h: 89 };
  const input = dropInput(p, 'lid', b);
  assert.equal(input.target, 'pan');
  assert.deepEqual(input.point, { x: 234, y: 504.5 });
});
test('depth, coverage, bounds, zone ambiguity and inaccessible goal are rejected', () => {
  for (const edit of [
    (p: typeof kitchenProject) => {
      p.placements.cover.snap.depth = 1;
    },
    (p: typeof kitchenProject) => {
      p.placements.cover.snap.w = 10;
    },
    (p: typeof kitchenProject) => {
      p.placements.cover.snap.x = -10;
    },
    (p: typeof kitchenProject) => {
      p.pack.skin.zones.exit = { ...p.pack.skin.zones.pan };
    },
    (p: typeof kitchenProject) => {
      p.pack.rules.interactions[0].requires = ['evacuated'];
    },
  ]) {
    const p = clone(kitchenProject);
    edit(p);
    assert.ok(inspectProject(p).some((i) => i.severity === 'error'));
  }
});
test('invalid and remote JSON never becomes a runnable project', () => {
  assert.throws(() => parseProject('{'));
  assert.throws(() => parseProject('{}'));
  const p = clone(kitchenProject);
  p.pack.skin.assets.lid.src = 'https://example.com/lid.png';
  assert.throws(() => parseProject(JSON.stringify(p)));
  assert.deepEqual(
    parseProject(JSON.stringify(kitchenProject)),
    kitchenProject,
  );
});
test('changing snap updates both last frame and committed state', () => {
  const p = clone(kitchenProject);
  p.placements.cover.snap.x = 145;
  const compiled = compileProject(p);
  assert.equal(
    compiled.skin.animations.cover.tracks[0].keyframes.at(-1)!.x,
    145,
  );
  assert.equal(compiled.skin.states.at(-3)?.object, 'lid');
  assert.ok(
    compiled.skin.states.some((s) => s.object === 'lid' && s.pose.x === 145),
  );
});
test('misplaced item returns to home without granting goals or penalties', () => {
  const run = advance(
    reduceRun(pack, createRun(pack), {
      type: 'interact',
      input: { source: 'lid', mode: 'drop', point: { x: 50, y: 300 } },
    }),
  );
  assert.equal(run.mistakes, 0);
  assert.deepEqual(run.resolved, []);
  assert.equal(
    scenePoses(pack, run, true).find((p) => p.id === 'lid')!.x,
    pack.skin.poses.lid.x,
  );
});
