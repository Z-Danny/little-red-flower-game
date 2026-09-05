import assert from 'node:assert/strict';
import test from 'node:test';
import { actions, assets, goals, level, placement, powerVisuals, type ActionId } from '../app/game/typhoon/config';
import { createRun, reduceRun, completedCount, hintTarget, type Run } from '../app/game/typhoon/model';
import { sceneSprites, localPoint, powerStatus, worldPoint } from '../app/game/typhoon/animation';

const start = () => reduceRun(createRun(), { type: 'start' });
const tick = (run: Run, ms: number) => reduceRun(run, { type: 'tick', ms });
function complete(run: Run, id: ActionId) { return tick(reduceRun(run, { type: 'hit', id }), actions[id].duration); }

test('five goals share actual alpha sprites with their silhouette cards', () => {
  assert.equal(goals.length, 5);
  for (const id of goals) assert.match(assets[actions[id].sprite], /typhoon-v2\/.+\.png$/);
  assert.equal(actions.plug.sprite, 'powerstrip');
  assert.equal(new Set(goals.map(id => actions[id].sprite)).size, 5);
});
test('every action lasts 0.5–1.5 seconds and only commits at its end', () => {
  for (const config of Object.values(actions)) {
    assert.ok(config.duration >= 500 && config.duration <= 1500);
    let run = start();
    for (const req of config.requires) run = complete(run, req);
    run = reduceRun(run, { type: 'hit', id: config.id });
    run = tick(run, config.duration - 1);
    assert.equal(run.resolved.includes(config.id), false);
    run = tick(run, 1);
    assert.equal(run.resolved.includes(config.id), true);
  }
});
test('intro cannot award progress, start risk, or accept hidden controls', () => {
  const initial = createRun();
  assert.deepEqual(reduceRun(initial, { type: 'hit', id: 'plant' }), initial);
  assert.deepEqual(tick(initial, 100000), initial);
});
test('double taps cannot overlap treatments or create duplicated goals', () => {
  const a = reduceRun(start(), { type: 'hit', id: 'plant' });
  assert.deepEqual(reduceRun(a, { type: 'hit', id: 'window' }), a);
  const done = tick(a, 1100);
  assert.deepEqual(reduceRun(done, { type: 'hit', id: 'plant' }), done);
});
test('cushion is a prerequisite, not one of the five goals', () => {
  let run = reduceRun(start(), { type: 'hit', id: 'plug' });
  assert.equal(run.action, null);
  assert.equal(hintTarget(run, 'plug'), 'cushion');
  run = complete(run, 'cushion');
  assert.equal(completedCount(run), 0);
  assert.equal(hintTarget(run, 'plug'), 'plug');
  assert.equal(reduceRun(run, { type: 'hit', id: 'plug' }).action?.id, 'plug');
});
test('wrong clicks do not increase risk or take flowers', () => {
  const before = start(), after = reduceRun(before, { type: 'miss' });
  assert.equal(after.risk, before.risk);
  assert.equal(after.stars, before.stars);
  assert.equal(after.resolved.length, 0);
});
test('unknown action names and prototype keys cannot crash or award progress', () => {
  for (const id of ['unknown', '__proto__', 'constructor', 'toString']) assert.deepEqual(reduceRun(start(), { type: 'hit', id }), start());
});
test('risk reaches 100, shows consequence once, and never prevents completion', () => {
  let run = tick(start(), 100000);
  assert.equal(run.risk, 100); assert.equal(run.consequenceSeen, true);
  assert.equal(run.phase, 'playing'); assert.equal(run.consequenceAge, 0);
  run = tick(run, 2300); assert.equal(run.consequenceAge, null);
  run = tick(run, 5000); assert.equal(run.consequenceAge, null);
  for (const id of ['cushion', ...goals] as ActionId[]) run = complete(run, id);
  assert.equal(run.phase, 'settling');
  assert.equal(tick(run, level.settleMs).phase, 'complete');
  assert.ok(run.stars > 0);
});
test('all goals settle before the result, with frozen risk and elapsed time', () => {
  let run = start();
  for (const id of ['cushion', ...goals] as ActionId[]) run = complete(run, id);
  assert.equal(run.phase, 'settling');
  const elapsed = run.elapsed, risk = run.risk;
  run = tick(run, level.settleMs - 1);
  assert.equal(run.phase, 'settling'); assert.equal(run.elapsed, elapsed); assert.equal(run.risk, risk);
  run = tick(run, 1); assert.equal(run.phase, 'complete'); assert.equal(run.stars, 3);
});
test('all legal objective orders can complete (cushion may be interleaved)', () => {
  function permutations(values: ActionId[]): ActionId[][] { return values.length ? values.flatMap((id, i) => permutations(values.filter((_, j) => i !== j)).map(rest => [id, ...rest])) : [[]]; }
  let valid = 0;
  for (const order of permutations(['cushion', ...goals])) {
    if (order.indexOf('plug') < order.indexOf('cushion')) continue;
    let run = start(); for (const id of order) run = complete(run, id);
    assert.equal(run.phase, 'settling'); valid++;
  }
  assert.equal(valid, 360);
});
test('restart discards active treatments, risk consequences, hints and settlement', () => {
  let run = tick(start(), 100000);
  run = reduceRun(run, { type: 'hint', id: 'plug' });
  run = reduceRun(run, { type: 'hit', id: 'plant' });
  assert.deepEqual(reduceRun(run, { type: 'reset' }), createRun());
});
test('plant trajectory lifts the pot and ends indoors without swapping backgrounds', () => {
  const initial = sceneSprites(start()).find(p => p.key === 'plant')!;
  const run = tick(reduceRun(start(), { type: 'hit', id: 'plant' }), 550);
  const mid = sceneSprites(run).find(p => p.key === 'plant')!;
  const final = sceneSprites(complete(start(), 'plant')).find(p => p.key === 'plant')!;
  assert.ok(mid.x > initial.x); assert.ok(mid.y < (initial.y + final.y) / 2);
  assert.equal(final.y, placement.plantSafe.y); assert.equal(final.asset, initial.asset);
});
test('latest feedback: no floating umbrella; rail moves inward/downward then disappears', () => {
  assert.ok(sceneSprites(start()).every(s => s.key !== 'umbrella'));
  const mid = sceneSprites(tick(reduceRun(start(), { type: 'hit', id: 'rail' }), 500)).find(s => s.key === 'rail')!;
  assert.ok(mid.y > placement.rail.y); assert.ok(mid.w >= placement.rail.w);
  assert.equal(sceneSprites(complete(start(), 'rail')).find(s => s.key === 'rail')!.opacity, 0);
});
test('closed window, disconnected plug, and cabinet strap persist in safe states', () => {
  let run = start(); for (const id of ['window', 'cushion', 'plug', 'cabinet'] as ActionId[]) run = complete(run, id);
  const poses = sceneSprites(run);
  assert.equal(poses.find(p => p.key === 'window')!.x, placement.windowClosed.x);
  assert.equal(poses.find(p => p.key === 'latch')!.asset, 'latchClosed');
  assert.ok(poses.find(p => p.key === 'plug')!.x < placement.plug.x);
  assert.equal(poses.find(p => p.key === 'strap')!.opacity, 1);
  assert.equal(poses.find(p => p.key === 'cabinet')!.scaleX, 1);
});
test('family ends seated on sofa instead of cutting into the room background', () => {
  let run = start(); for (const id of ['cushion', ...goals] as ActionId[]) run = complete(run, id);
  const poses = sceneSprites(tick(run, level.settleMs));
  assert.equal(poses.find(p => p.key === 'family-standing')!.opacity, 0);
  assert.equal(poses.find(p => p.key === 'family-seated')!.opacity, 1);
});
test('alpha picking coordinates invert transformed doors correctly', () => {
  const pose = sceneSprites(start()).find(p => p.key === 'cabinet')!;
  const lx = 23 - pose.w * pose.anchorX, ly = 77 - pose.h * pose.anchorY;
  const ax = pose.scaleX * lx, ay = pose.shear * lx + ly;
  const x = pose.x + pose.w * pose.anchorX + Math.cos(pose.rotation) * ax - Math.sin(pose.rotation) * ay;
  const y = pose.y + pose.h * pose.anchorY + Math.sin(pose.rotation) * ax + Math.cos(pose.rotation) * ay;
  const hit = localPoint(pose, x, y);
  assert.ok(Math.abs(hit.x - 23) < .00001); assert.ok(Math.abs(hit.y - 77) < .00001);
});
test('invalid timer values cannot corrupt a run', () => {
  for (const ms of [NaN, Infinity, -2, 0]) assert.deepEqual(tick(start(), ms), start());
});
test('wall socket stays above the skirting and stowed power strip avoids seated feet', () => {
  assert.ok(placement.socket.y + placement.socket.h < 662);
  const poses = sceneSprites(complete(complete(start(), 'cushion'), 'plug'));
  const board = poses.find(p => p.key === 'powerstrip')!;
  assert.equal(board.x, placement.powerstripSafe.x);
  assert.ok(board.y > placement.familySafe.y + placement.familySafe.h + 20);
  assert.ok(poses.find(p => p.key === 'socket')!.y < placement.powerstrip.y - 60);
});

test('plug starts inserted with hidden prongs and exposes them while pulling out', () => {
  const ready = complete(start(), 'cushion');
  const initial = sceneSprites(ready).find(p => p.key === 'plug')!;
  assert.equal(initial.clipRight, powerVisuals.insertedVisibleWidth);
  const face = worldPoint(initial, initial.w * initial.clipRight, initial.h * .25);
  assert.ok(face.x > placement.socket.x && face.x < placement.socket.x + placement.socket.w);
  assert.ok(face.y > placement.socket.y && face.y < placement.socket.y + placement.socket.h);
  const treating = reduceRun(ready, { type: 'hit', id: 'plug' });
  const mid = sceneSprites(tick(treating, actions.plug.duration * .1)).find(p => p.key === 'plug')!;
  assert.ok(mid.x < initial.x && mid.clipRight > initial.clipRight && mid.clipRight < 1);
  const removed = sceneSprites(tick(treating, actions.plug.duration * powerVisuals.disconnectAt)).find(p => p.key === 'plug')!;
  assert.equal(removed.clipRight, 1);
  assert.ok(removed.x + removed.w < placement.socket.x);
});

test('power status is green when connected and red at disconnection, including replay', () => {
  const ready = complete(start(), 'cushion');
  const treating = reduceRun(ready, { type: 'hit', id: 'plug' });
  const boundary = actions.plug.duration * powerVisuals.disconnectAt;
  assert.equal(powerStatus(start()).color, '#36ce7a');
  assert.equal(powerStatus(tick(treating, boundary - 1)).connected, true);
  assert.equal(powerStatus(tick(treating, boundary)).color, '#ed5948');
  assert.equal(powerStatus(complete(ready, 'plug')).label, '已断开');
  assert.equal(powerStatus(reduceRun(complete(ready, 'plug'), { type: 'reset' })).label, '已接通');
});

test('cushion lifts and fades out, remaining absent after the family sits down', () => {
  const treating = reduceRun(start(), { type: 'hit', id: 'cushion' });
  const mid = sceneSprites(tick(treating, actions.cushion.duration * .5)).find(p => p.key === 'cushion')!;
  assert.ok(mid.y < placement.cushion.y);
  assert.ok(mid.opacity > 0 && mid.opacity < 1);
  let run = complete(start(), 'cushion');
  assert.equal(sceneSprites(run).find(p => p.key === 'cushion')!.opacity, 0);
  for (const goal of goals) run = complete(run, goal);
  assert.equal(sceneSprites(tick(run, level.settleMs)).find(p => p.key === 'cushion')!.opacity, 0);
  assert.equal(sceneSprites(reduceRun(run, { type: 'reset' })).find(p => p.key === 'cushion')!.opacity, 1);
});

test('both cable endpoints follow the strip and moving plug throughout unplugging', () => {
  const treating = reduceRun(complete(start(), 'cushion'), { type: 'hit', id: 'plug' });
  for (let step = 0; step <= 100; step++) {
    const poses = sceneSprites(tick(treating, actions.plug.duration * step / 100));
    const board = poses.find(p => p.key === 'powerstrip')!, plug = poses.find(p => p.key === 'plug')!, cable = poses.find(p => p.key === 'cable')!;
    assert.ok(cable.w > 0 && cable.h > 0);
    for (const [pose, anchor, cableAnchor] of [[board, powerVisuals.boardCableAnchor, powerVisuals.cableStart], [plug, powerVisuals.plugCableAnchor, powerVisuals.cableEnd]] as const) {
      const actual = worldPoint(cable, cable.w * cableAnchor.x, cable.h * cableAnchor.y);
      const expected = worldPoint(pose, pose.w * anchor.x, pose.h * anchor.y);
      assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < .00001);
    }
  }
});
