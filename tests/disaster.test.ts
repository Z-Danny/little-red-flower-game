import test from 'node:test';
import assert from 'node:assert/strict';
import { disasterPacks } from '../app/game/disaster/registry';
import {
  createDisaster,
  reduceDisaster,
  remaining,
  award,
  type DisasterRun,
} from '../app/game/disaster/model';
import {
  disasterCamera,
  objectPose,
  targetBox,
  center,
} from '../app/game/disaster/scene';
import { dropTarget } from '../components/game/disaster/hit';
import { phoneFrame } from '../app/game/scene-hunt/viewport';
const [street, flood] = disasterPacks;
const step = (p: typeof street, s: DisasterRun, id: string) => {
  const a = p.rules.actions.find((a) => a.id === id)!;
  let n = reduceDisaster(p.rules, s, {
    type: 'act',
    source: a.source,
    target: a.target,
    input: a.input,
  });
  for (let t = 0; t < a.duration; t += 50)
    n = reduceDisaster(p.rules, n, {
      type: 'tick',
      ms: Math.min(50, a.duration - t),
    });
  return n;
};
const start = (p: typeof street) =>
  reduceDisaster(p.rules, createDisaster(), { type: 'start' });
test('two independent packages use seven goals, valid sources and 0.5–1.5s animations', () => {
  assert.equal(disasterPacks.length, 2);
  assert.equal(new Set(disasterPacks.map((p) => p.rules.id)).size, 2);
  for (const p of disasterPacks) {
    assert.equal(p.rules.goals.length, 7);
    for (const a of p.rules.actions)
      assert(a.duration >= 500 && a.duration <= 1500);
  }
});
test('street all seven settle once; final flower score frozen while ending plays', () => {
  let s = start(street);
  for (const a of street.rules.actions) s = step(street, s, a.id);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.stars, 3);
  assert.equal(s.goals.length, 7);
  const elapsed = s.elapsed;
  for (let i = 0; i < 80; i++)
    s = reduceDisaster(street.rules, s, { type: 'tick', ms: 50 });
  assert.equal(s.phase, 'complete');
  assert.equal(s.elapsed, elapsed);
  assert.equal(
    reduceDisaster(street.rules, s, {
      type: 'act',
      source: 'car',
      target: 'car',
      input: 'tap',
    }),
    s,
  );
});
test('every street miss costs five seconds; repeated found target is free', () => {
  let s = start(street);
  s = reduceDisaster(street.rules, s, {
    type: 'act',
    source: null,
    target: null,
    input: 'tap',
  });
  assert.equal(s.penalty, 5000);
  assert.equal(s.misses, 1);
  const same = reduceDisaster(street.rules, s, {
    type: 'act',
    source: null,
    target: null,
    input: 'tap',
  });
  assert.equal(same.penalty, 10000);
  assert.equal(same.misses, 2);
  s = step(street, s, 'mark-car');
  const repeated = reduceDisaster(street.rules, s, {
    type: 'act',
    source: 'car',
    target: 'car',
    input: 'tap',
  });
  assert.equal(repeated, s);
  assert.equal(repeated.penalty, 5000);
});
test('street zero remaining fails even during animation, no partial award', () => {
  const s = {
    ...start(street),
    elapsed: 49950,
    pending: { id: 'mark-car', age: 0 },
  };
  const n = reduceDisaster(street.rules, s, { type: 'tick', ms: 50 });
  assert.equal(n.phase, 'failed');
  assert.equal(n.stars, 0);
  assert.equal(n.goals.length, 0);
});

test('street final accepted click may finish across deadline, but a late click fails', () => {
  let s = start(street);
  const actions = street.rules.actions;
  for (const a of actions.slice(0, -1)) s = step(street, s, a.id);
  const last = actions.at(-1)!;
  s = { ...s, elapsed: 49999 };
  assert.equal(reduceDisaster(street.rules, { ...s, elapsed: 50000 }, { type: 'act', source: last.source, target: last.target, input: last.input }).phase, 'failed');
  s = step(street, s, last.id);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.elapsed, 50000);
  assert.equal(s.goals.length, 7);
  assert.equal(s.stars, 1);
});
test('street grades scale proportionally with the 50-second challenge', () => {
  for (const [left, want] of [
    [25000, 3],
    [24999, 2],
    [12000, 2],
    [10000, 1],
    [1, 1],
    [0, 1],
  ])
    assert.equal(
      award(street.rules, { ...createDisaster(), elapsed: 50000 - left }),
      want,
    );
});
test('event delta is finite, clamped and never charges ready/terminal states', () => {
  for (const bad of [-10, NaN, Infinity])
    assert.equal(
      reduceDisaster(flood.rules, start(flood), { type: 'tick', ms: bad })
        .elapsed,
      0,
    );
  assert.equal(
    reduceDisaster(flood.rules, start(flood), { type: 'tick', ms: 999999 })
      .elapsed,
    100,
  );
  const ready = createDisaster();
  assert.equal(
    reduceDisaster(flood.rules, ready, { type: 'tick', ms: 100 }),
    ready,
  );
});
function permutations(xs: string[]): string[][] {
  return xs.length
    ? xs.flatMap((x, i) =>
        permutations(xs.filter((_, j) => i !== j)).map((t) => [x, ...t]),
      )
    : [[]];
}
for (const order of permutations(['rescue-call', 'pack-water', 'pack-light']))
  test('flood flexible preparation: ' + order.join(' → '), () => {
    let s = step(flood, start(flood), 'approach');
    s = step(flood, s, 'power-off');
    for (const id of order) s = step(flood, s, id);
    s = step(flood, s, 'assemble-foam');
    s = step(flood, s, 'reach-roof');
    assert.equal(s.phase, 'reveal');
    assert.equal(s.stars, 3);
    assert.equal(s.goals.length, 7);
  });
test('flood breaker also safely turns off before moving nearer stairs', () => {
  let s = step(flood, start(flood), 'power-off');
  assert(s.goals.includes('power'));
  s = step(flood, s, 'approach');
  assert(s.goals.includes('stairs'));
});
test('flood supplies cannot silently satisfy prerequisite; neutral drops do not alter progress', () => {
  let s = step(flood, start(flood), 'pack-water');
  assert.equal(s.goals.length, 0);
  s = reduceDisaster(flood.rules, s, {
    type: 'act',
    source: 'chair',
    target: 'bag',
    input: 'drop',
  });
  assert.equal(s.goals.length, 0);
  assert.equal(s.misses, 0);
  assert.equal(s.penalty, 0);
});
for (const id of ['danger-outside', 'danger-wire', 'danger-car'])
  test(id + ' fails immediately without requiring prior preparation', () => {
    const a = flood.rules.actions.find((a) => a.id === id)!;
    const s = reduceDisaster(flood.rules, start(flood), {
      type: 'act',
      source: a.source,
      target: a.target,
      input: 'drop',
    });
    assert.equal(s.phase, 'failed');
    assert.equal(s.stars, 0);
    assert.equal(s.lastAction, id);
  });
test('escape remains open without collecting all objects', () => {
  const s = reduceDisaster(flood.rules, start(flood), {
    type: 'act',
    source: 'person',
    target: 'roof',
    input: 'drop',
  });
  assert.equal(s.phase, 'evacuated');
  assert.equal(s.goals.length, 0);
  assert.equal(s.stars, 0);
});
test('flood water risk fails at 120 s; elapsed scoring thresholds', () => {
  assert.equal(
    reduceDisaster(
      flood.rules,
      { ...start(flood), elapsed: 119999 },
      { type: 'tick', ms: 1 },
    ).phase,
    'failed',
  );
  for (const [elapsed, want] of [
    [60000, 3],
    [60001, 2],
    [90000, 2],
    [90001, 1],
  ])
    assert.equal(award(flood.rules, { ...createDisaster(), elapsed }), want);
});
test('replay clears state and no old pending animation can commit', () => {
  let s = step(flood, start(flood), 'approach');
  s = reduceDisaster(flood.rules, s, { type: 'reset' });
  assert.deepEqual(s, createDisaster());
  assert.equal(remaining(flood.rules, s), 120000);
});
test('moving person remains a phone target even while overlapping stairs; bag outranks stairs', () => {
  const s = step(flood, start(flood), 'approach');
  assert.equal(
    dropTarget(flood, s, center(objectPose(flood, s, 'person').box), 'phone'),
    'person',
  );
  assert.equal(
    dropTarget(flood, s, center(targetBox(flood, s, 'bag')!), 'water'),
    'bag',
  );
  assert.equal(
    dropTarget(flood, s, center(flood.skin.zones.roof.box), 'person'),
    'roof',
  );
});
test('stair pose feet stay above the backpack, never standing on it', () => {
  const b = flood.skin.poses.personStairs,
    bag = flood.skin.sprites.bag.box;
  assert(b.y + b.h < bag.y - 10);
});
test('packed objects disappear; fixed power hardware never moves; assembling is one goal', () => {
  let s = step(flood, step(flood, start(flood), 'approach'), 'power-off');
  s = step(flood, s, 'pack-water');
  assert.equal(objectPose(flood, s, 'water').alpha, 0);
  assert.deepEqual(
    objectPose(flood, s, 'breaker').box,
    flood.skin.sprites.breaker.box,
  );
  s = step(flood, s, 'assemble-panel');
  s = step(flood, s, 'assemble-foam');
  assert.equal(s.goals.filter((g) => g === 'aid').length, 1);
});
for (const [w, h] of [
  [320, 568],
  [360, 800],
  [375, 812],
  [390, 844],
  [412, 915],
  [430, 932],
  [520, 900],
  [1280, 900],
])
  test(`uniform edge-fit viewport ${w}x${h}`, () => {
    const f = phoneFrame(flood.skin, w, h),
      c = disasterCamera(f.width, f.height);
    assert.equal(f.y, 0);
    assert(f.width <= 520);
    if (w <= 520) assert.equal(f.height, h);
    assert(c.x <= 0.001 && c.y <= 0.001);
    assert(c.x + 720 * c.scale >= f.width - 0.001);
    assert(c.y + 1280 * c.scale >= f.height - 0.001);
    for (const id of ['phone', 'water', 'flashlight', 'breaker', 'person']) {
      const b = flood.skin.sprites[id].box,
        q = center(b),
        x = q.x * c.scale + c.x,
        y = q.y * c.scale + c.y;
      assert(x > 0 && x < f.width);
      assert(y > 0 && y < f.height);
      assert(Math.abs((x - c.x) / c.scale - q.x) < 1e-8);
    }
  });
