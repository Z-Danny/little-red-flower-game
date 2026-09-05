import assert from 'node:assert/strict';
import test from 'node:test';
import { assets, items, layout, timing, trayItems, WORLD, type ItemId, type ZoneId } from '../app/game/kitchen/config';
import { createRun, reduceRun, controlled, emotion, fireLevel, smokeLevel, type Run } from '../app/game/kitchen/model';
import { center, movingItem, personBox } from '../app/game/kitchen/animation';
import { toWorld, pickZone, pickSceneItem } from '../app/game/kitchen/interaction';
import { render, alphaHit } from '../components/game/kitchen/renderer';
import type { Art } from '../components/game/kitchen/asset-loader';
import { levels } from '../app/game/levels';

const start = () => reduceRun(createRun(), { type: 'start' });
function tick(run: Run, ms: number) { let r = run; for (let i = 0; i < ms; i += 10) r = reduceRun(r, { type: 'tick', ms: Math.min(10, ms - i) }); return r; }
const drop = (r: Run, item: ItemId, zone: ZoneId) => reduceRun(r, { type: 'drop', item, zone, at: zone === 'miss' ? { x: -100, y: -100 } : center(layout.zones[zone]), from: { x: 200, y: 950 } });
const finish = (r: Run) => tick(r, r.action!.duration);
for (const order of [['gas', 'lid'], ['lid', 'gas']] as const) test(`${order.join(' then ')} completes and evacuates`, () => {
  let r = start();
  for (const item of order) r = finish(drop(r, item, item === 'gas' ? 'off' : 'pan'));
  assert.equal(controlled(r), true); assert.equal(fireLevel(r), 0); assert.equal(emotion(r), 'relieved');
  r = finish(drop(r, 'person', 'exit')); assert.equal(r.phase, 'settling'); assert.equal(r.evacuated, true);
  r = tick(r, timing.settling); assert.equal(r.phase, 'complete'); assert.equal(r.stars, 3); assert.equal(smokeLevel(r), 0);
});
test('goals commit only when the fixed animation finishes', () => {
  for (const [item, zone, key] of [['lid', 'pan', 'covered'], ['gas', 'off', 'gasOff']] as const) {
    let r = drop(start(), item, zone); const duration = r.action!.duration;
    assert.ok(duration >= 500 && duration <= 1500); r = tick(r, duration - 10); assert.equal(r[key], false);
    r = tick(r, 10); assert.equal(r[key], true); assert.equal(r.action, null);
  }
});
test('gas-off alone does not extinguish burning oil', () => { const r = finish(drop(start(), 'gas', 'off')); assert.ok(fireLevel(r) > 0); assert.equal(r.covered, false); });
test('lid alone still requires gas shutoff', () => { const r = finish(drop(start(), 'lid', 'pan')); assert.equal(r.gasOff, false); assert.equal(controlled(r), false); assert.equal(fireLevel(r), .12); });
test('evacuation gate tests both requirements independently', () => {
  for (let r of [start(), finish(drop(start(), 'gas', 'off')), finish(drop(start(), 'lid', 'pan'))]) {
    r = finish(drop(r, 'person', 'exit')); assert.equal(r.evacuated, false); assert.equal(r.phase, 'playing'); assert.match(r.notice.text, /现实/);
  }
});
for (const item of ['water', 'cloth'] as const) test(`${item} grows fire and changes expression immediately, then is recoverable`, () => {
  const before = start(); let r = drop(before, item, 'pan');
  assert.ok(fireLevel(r) > fireLevel(before) + .5); assert.ok(smokeLevel(r) > smokeLevel(before)); assert.equal(emotion(r), 'panicked');
  assert.equal(r.mistakes, 1); assert.equal(r.notice.tone, 'danger'); r = finish(r);
  r = finish(drop(r, 'gas', 'off')); r = finish(drop(r, 'lid', 'pan')); r = finish(drop(r, 'person', 'exit')); r = tick(r, timing.settling);
  assert.equal(r.phase, 'complete'); assert.equal(r.stars, 2);
});
test('repeated wrong attempts cannot overflow heat or risk', () => {
  let r = start(); for (let i = 0; i < 15; i++) r = finish(drop(r, 'water', 'pan'));
  assert.ok(r.risk <= 100); assert.ok(r.boost <= .9); assert.equal(r.phase, 'playing');
});
test('peak risk never overwrites the water feedback mid-animation', () => {
  const r = tick(drop({ ...start(), risk: 90 }, 'water', 'pan'), 100);
  assert.equal(r.risk, 100); assert.match(r.notice.text, /不能泼水/); assert.equal(r.peakReached, true);
});
for (const item of ['plate', 'knife'] as const) test(`${item} bounce never changes fire or risk at drop`, () => {
  const before = start(), r = drop(before, item, 'pan');
  assert.equal(r.risk, before.risk); assert.equal(fireLevel(r), fireLevel(before)); assert.equal(r.mistakes, 0); assert.equal(r.action?.kind, 'bounce');
  assert.equal(finish(r).action, null);
});
test('extinguisher miss sprays without a goal; root aim temporarily reduces fire', () => {
  const r = start(), missed = drop(r, 'extinguisher', 'off'), hit = drop(r, 'extinguisher', 'pan');
  assert.equal(missed.action?.kind, 'miss-spray'); assert.match(missed.notice.text, /对准火焰根部/);
  assert.equal(fireLevel(missed), fireLevel(r)); assert.ok(fireLevel(hit) < fireLevel(r));
  assert.equal(finish(hit).covered, false); assert.equal(finish(hit).gasOff, false);
});
test('sealed pan cannot be reopened or magically reignited by wrong props', () => {
  let r = finish(drop(start(), 'lid', 'pan')); r = finish(drop(r, 'gas', 'off'));
  assert.equal(drop(r, 'lid', 'pan'), r); assert.equal(drop(r, 'gas', 'off'), r);
  assert.equal(fireLevel(drop(r, 'water', 'pan')), 0); assert.equal(drop(r, 'water', 'pan').mistakes, 0);
});
test('double drops and briefing inputs are ignored', () => {
  const initial = createRun(); assert.equal(drop(initial, 'lid', 'pan'), initial);
  const active = drop(start(), 'lid', 'pan'); assert.equal(drop(active, 'gas', 'off'), active);
});
test('risk reaches 100 without locking progress; notice fires once', () => {
  let r = tick(start(), 100000); assert.equal(r.risk, 100); assert.equal(r.peakReached, true); assert.equal(emotion(r), 'panicked');
  const serial = r.serial; r = tick(r, 5000); assert.equal(r.serial, serial);
  r = finish(drop(r, 'gas', 'off')); r = finish(drop(r, 'lid', 'pan')); r = finish(drop(r, 'person', 'exit')); assert.equal(r.evacuated, true);
});
test('briefing and complete do not advance time; giant or invalid deltas are safe', () => {
  const r = createRun(); assert.equal(tick(r, 5000), r);
  assert.equal(reduceRun(start(), { type: 'tick', ms: Infinity }).elapsed, 0);
  assert.equal(reduceRun(start(), { type: 'tick', ms: 80000 }).elapsed, 100);
});
test('reset clears hazards, feedback, animation and rewards', () => {
  const r = drop(start(), 'water', 'pan'); assert.deepEqual(reduceRun(r, { type: 'reset' }), createRun());
});
test('correct action produces focused expression, both produce relief', () => {
  let r = finish(drop(start(), 'gas', 'off')); assert.equal(emotion(r), 'focused');
  r = finish(drop(r, 'lid', 'pan')); assert.equal(emotion(r), 'relieved');
});
test('phone and desktop coordinates hit the same zones', () => {
  for (const width of [320, 390, 720]) {
    const rect = { left: 34, top: 150, width, height: width * WORLD.height / WORLD.width };
    for (const zone of ['pan', 'off', 'exit'] as const) {
      const c = center(layout.zones[zone]); assert.equal(pickZone(toWorld({ x: rect.left + c.x * width / 720, y: rect.top + c.y * width / 720 }, rect)), zone);
    }
  }
  assert.equal(pickZone({ x: -30, y: 400 }), 'miss');
});
test('person evacuation ends inside doorway, not on the stove', () => {
  let r = finish(drop(finish(drop(start(), 'gas', 'off')), 'lid', 'pan')); r = finish(drop(r, 'person', 'exit'));
  assert.deepEqual(personBox(r), layout.evacuated); assert.ok(personBox(r).x > layout.pan.x + layout.pan.w);
});
test('lid animation ends exactly at configured pan cover and remains above pan', () => {
  const r = drop(start(), 'lid', 'pan'); const pose = movingItem({ ...r, action: { ...r.action!, age: r.action!.duration } });
  assert.deepEqual(pose?.box, layout.lid);
});
test('catalog opens two distinct modular levels', () => { assert.deepEqual(levels.filter(l => l.playable).map(l => l.id), ['typhoon-home', 'oil-fire']); });
test('gas is a direct click control and never appears in the draggable tray', () => {
  assert.equal(trayItems.includes('gas'), false);
  assert.match(items.gas.detail, /点击/);
});
test('transparent margins are not character hits', () => {
  const art = { worried: { width: 2, height: 2, data: new Uint8ClampedArray([0,0,0,0, 0,0,0,255, 0,0,0,0, 0,0,0,0]) } } as unknown as Art;
  assert.equal(alphaHit(art, 'worried', { x: 0, y: 0, w: 20, h: 20 }, { x: 1, y: 1 }), false);
  assert.equal(alphaHit(art, 'worried', { x: 0, y: 0, w: 20, h: 20 }, { x: 15, y: 1 }), true);
  assert.equal(pickSceneItem(center(layout.gas), start()), 'gas');
});
test('safe renderer draws lid after pan and never draws top flame', () => {
  const drawn: string[] = [], gradient = { addColorStop() {} };
  const ctx = new Proxy({ drawImage(image: { id: string }) { drawn.push(image.id); }, createRadialGradient() { return gradient; } }, { get(target, key) { return key in target ? target[key as keyof typeof target] : () => {}; }, set() { return true; } });
  const art = Object.fromEntries(Object.keys(assets).map(id => [id, { image: { id } }])) as unknown as Art;
  const r = finish(drop(finish(drop(start(), 'gas', 'off')), 'lid', 'pan'));
  render(ctx as unknown as CanvasRenderingContext2D, art, r, { clock: 0, selected: null, drag: null, hover: 'miss', reduced: false });
  assert.ok(drawn.indexOf('lid') > drawn.indexOf('pan')); assert.ok(!drawn.includes('flame')); assert.ok(drawn.includes('relieved'));
});
