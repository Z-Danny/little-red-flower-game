import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nearestPixelHit,
  pointerRadius,
} from '../app/game/display/pointer-hit';
import { pickObject, pickObjectNear } from '../app/game/runtime/scene';
import { createRun, reduceRun } from '../app/game/runtime/engine';
import { getPackage } from '../app/game/levels';
import {
  relevantZones,
  resolveDragPlacement,
} from '../app/game/runtime/drop-zones';
import { dragFeedback } from '../app/game/runtime/drag-feedback';
import type { LevelPackage, Point } from '../app/game/runtime/schema';
const probe = (p: Point) => (p.x === 10 ? 'thin' : null);
test('small disk catches a thin pixel without making the whole box clickable', () => {
  assert.equal(nearestPixelHit({ x: 5, y: 20 }, 6, probe), 'thin');
  assert.equal(nearestPixelHit({ x: 3, y: 20 }, 6, probe), null);
  assert.equal(nearestPixelHit({ x: 5, y: 20 }, 0, probe), null);
});
test('exact hit wins; foreground blockers and equally close neighbours never auto-select', () => {
  const hit = (p: Point) => (p.x === 10 ? 'a' : p.x === 14 ? 'b' : null);
  assert.equal(nearestPixelHit({ x: 10, y: 10 }, 6, hit), 'a');
  assert.equal(nearestPixelHit({ x: 12, y: 10 }, 6, hit), null);
  assert.equal(
    nearestPixelHit({ x: 0, y: 0 }, 6, (p) => (p.x === 0 ? false : 'a')),
    null,
  );
});
test('tolerance is CSS-sized, bounded, and rejects non-finite inputs', () => {
  assert.equal(pointerRadius('touch', 0.5), 20);
  assert.equal(pointerRadius('mouse', 0.5), 12);
  assert.equal(pointerRadius('touch', 0.01), 24);
  assert.equal(pointerRadius('touch', 0), 0);
  assert.equal(nearestPixelHit({ x: NaN, y: 1 }, 6, probe), null);
});
function fixture(): LevelPackage {
  const pack = structuredClone(getPackage('clear-corridor')!);
  pack.rules.objects = [
    { id: 'thin', label: '细杆', input: 'drag', disabledWhen: ['done'] },
  ];
  pack.skin.poses = {
    thin: { asset: 'thin', x: 0, y: 0, w: 100, h: 100, depth: 1 },
  };
  pack.skin.states = [];
  pack.skin.effects = [];
  return pack;
}
const alpha = (_: string, p: Point) => Math.abs(p.x - 0.5) <= 0.005;
test('near-object picker honours visible alpha, not transparent sprite bounds', () => {
  const pack = fixture(),
    run = createRun(pack),
    p = { x: 45, y: 30 };
  assert.equal(pickObject(pack, run, p, alpha), null);
  assert.equal(pickObjectNear(pack, run, p, alpha, 6), 'thin');
  assert.equal(pickObjectNear(pack, run, { x: 20, y: 30 }, alpha, 6), null);
  run.resolved = ['done'];
  assert.equal(pickObjectNear(pack, run, p, alpha, 6), null);
});
test('foreground opacity blocks pickup and response tap buttons are not expanded', () => {
  const pack = fixture(),
    run = createRun(pack),
    p = { x: 45, y: 30 };
  pack.skin.poses.occluder = {
    asset: 'wall',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    depth: 2,
  };
  assert.equal(
    pickObjectNear(
      pack,
      run,
      p,
      (asset, local) => asset === 'wall' || alpha(asset, local),
      6,
    ),
    null,
  );
  delete pack.skin.poses.occluder;
  pack.rules.objects[0].input = 'tap';
  assert.equal(pickObjectNear(pack, run, p, alpha, 6), null);
  assert.equal(
    pickObjectNear(pack, run, p, alpha, 6, false, false, true),
    'thin',
  );
});
test('collection announces selection then committed success, without changing reward rules', () => {
  const pack = getPackage('clear-corridor')!;
  let run = reduceRun(pack, createRun(pack), {
    type: 'interact',
    input: { source: 'scooter', mode: 'drop', target: 'storage' },
  });
  assert.match(run.notice!.text, /已选中玩具滑板车.*正在收纳/);
  assert.deepEqual(run.resolved, []);
  for (let i = 0; i < 13; i++)
    run = reduceRun(pack, run, { type: 'tick', ms: 100 });
  assert.ok(run.resolved.includes('scooter-stored'));
  assert.equal(run.notice!.text, pack.rules.interactions.find(rule => rule.id === 'store-scooter')!.feedback);
  assert.equal(run.stars, 0);
});
test('out-of-zone feedback changes no goals, penalty or risk', () => {
  const pack = getPackage('lift-wait')!,
    before = createRun(pack);
  const source = pack.rules.objects.find((o) => o.input === 'drag')!.id;
  const after = reduceRun(pack, before, {
    type: 'interact',
    input: { source, mode: 'drop', point: { x: 0, y: 0 } },
  });
  assert.match(after.notice!.text, /未放入可用目标区域/);
  assert.deepEqual(after.resolved, before.resolved);
  assert.equal(after.mistakes, before.mistakes);
  assert.equal(after.risk, before.risk);
});
test('destination preview and release share pointer/center resolver, including edge grabs', () => {
  const pack = fixture(),
    run = createRun(pack);
  pack.skin.zones = { home: { x: 100, y: 100, w: 40, h: 40 } };
  pack.rules.interactions = [
    {
      id: 'place',
      source: 'thin',
      target: 'home',
      mode: 'drop',
      outcome: 'correct',
      grants: ['done'],
      animation: 'place',
    },
  ];
  const pose = pack.skin.poses.thin;
  const placement = resolveDragPlacement(
    pack,
    run,
    'thin',
    { x: 80, y: 120 },
    { x: 10, y: 50 },
    pose,
  );
  assert.equal(placement.target, 'home');
  assert.deepEqual(placement.point, { x: 120, y: 120 });
  assert.equal(
    resolveDragPlacement(
      pack,
      run,
      'thin',
      { x: 20, y: 20 },
      { x: 10, y: 50 },
      pose,
    ).target,
    undefined,
  );
  assert.deepEqual(relevantZones(pack, run, 'thin'), ['home']);
  pack.rules.interactions[0].requires = ['unavailable'];
  assert.deepEqual(relevantZones(pack, run, 'thin'), []);
});
test('destination text warns before a dangerous release', () => {
  const pack = getPackage('lift-wait')!;
  assert.match(dragFeedback(pack, 'person', null, false, createRun(pack)), /已选中/);
  assert.match(dragFeedback(pack, 'person', null, true, createRun(pack)), /尚未对准/);
  assert.match(dragFeedback(pack, 'person', 'door', true, createRun(pack)), /^禁止放置/);
  assert.doesNotMatch(
    dragFeedback(pack, 'person', 'door', true, createRun(pack)),
    /松手放到|成功/,
  );
});

test('accepted drop confirms placement only after the animation commits', () => {
  const pack = getPackage('lift-wait')!;
  let run = reduceRun(pack, createRun(pack), {
    type: 'interact', input: { source: 'person', mode: 'drop', target: 'wait' },
  });
  assert.ok(!run.resolved.includes('person-waiting'));
  while (run.action) run = reduceRun(pack, run, { type: 'tick', ms: 100 });
  assert.match(run.notice!.text, /已移至远离门边的等待区/);
  assert.ok(run.resolved.includes('person-waiting'));
});
