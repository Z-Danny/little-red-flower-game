import assert from 'node:assert/strict';
import test from 'node:test';
import { assets, items, layout, timing, sceneItems, WORLD, type ItemId, type ZoneId } from '../app/game/kitchen/config';
import { createRun, reduceRun, controlled, emotion, fireLevel, smokeLevel, type Run } from '../app/game/kitchen/model';
import { center, itemBox, movingItem, personBox } from '../app/game/kitchen/animation';
import { toWorld, pickZone, pickSceneItem } from '../app/game/kitchen/interaction';
import { render, alphaHit, type Drag } from '../components/game/kitchen/renderer';
import type { Art } from '../components/game/kitchen/asset-loader';
import { levels } from '../app/game/levels';
import { cameraFor } from '../app/game/kitchen/camera';
import { briefFeedback, riskClock, countdown, thermometerState } from '../app/game/kitchen/presentation';
import { kitchenPressure } from '../app/game/kitchen/experience';
import { KitchenThermometer } from '../components/game/kitchen/kitchen-thermometer';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KitchenPlayer } from '../components/game/kitchen/kitchen-player';

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
test('removed extinguisher has no drawing, picking or forged action path in this kitchen', () => {
  const r = start();
  assert.ok(!(sceneItems as readonly string[]).includes('extinguisher'));
  assert.ok(!drawnAssets(r).includes('extinguisher'));
  assert.equal(pickSceneItem(center(layout.props.extinguisher), r, asset => asset === 'extinguisher'), null);
  for (const zone of ['pan','off','miss'] as const) assert.equal(drop(r,'extinguisher',zone),r);
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
  for (const [width,height] of [[320,568],[375,667],[390,844],[430,932],[450,900]]) {
    const rect = { left: 34, top: 150, width, height };
    const camera = cameraFor(width,height);
    for (const zone of ['pan', 'off', 'exit'] as const) {
      const c = center(layout.zones[zone]); assert.equal(pickZone(toWorld({ x: rect.left + camera.x + c.x * camera.scale, y: rect.top + camera.y + c.y * camera.scale }, rect)), zone);
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
test('catalog retains both original modular levels alongside data-driven additions', () => {
  assert.deepEqual(levels.filter(l => l.playable && l.engine !== 'configured-v1' && l.engine !== 'scene-hunt' && l.engine !== 'disaster-v1').map(l => l.id), ['typhoon-home', 'oil-fire']);
  assert.equal(levels.find(l=>l.id==='charging-bedroom')?.engine,'scene-hunt');
  assert.equal(new Set(levels.map(l=>l.id)).size,levels.length);
});
test('gas is a direct click control and never appears in the draggable scene props', () => {
  assert.equal((sceneItems as readonly ItemId[]).includes('gas'), false);
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
  const ctx = new Proxy({ drawImage(image: { id: string }) { drawn.push(image.id); }, createRadialGradient() { return gradient; }, createLinearGradient() { return gradient; } }, { get(target, key) { return key in target ? target[key as keyof typeof target] : () => {}; }, set() { return true; } });
  const art = Object.fromEntries(Object.keys(assets).map(id => [id, { image: { id } }])) as unknown as Art;
  const r = finish(drop(finish(drop(start(), 'gas', 'off')), 'lid', 'pan'));
  render(ctx as unknown as CanvasRenderingContext2D, art, r, { clock: 0, selected: null, drag: null, hover: 'miss', reduced: false });
  assert.ok(drawn.indexOf('lid') > drawn.indexOf('pan')); assert.ok(!drawn.includes('flame')); assert.ok(drawn.includes('relieved'));
  assert.ok(drawn.indexOf('cloth') < drawn.indexOf('relieved'), '人物在台面物件之前方，不让抹布盖住手');
});

// Scene v2 regressions: props, hit regions and return poses share one configuration.
for (const id of sceneItems) test(`${id} is directly pickable at its configured in-room position`, () => {
  const b = layout.props[id];
  assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= WORLD.width && b.y + b.h <= WORLD.height);
  assert.deepEqual(itemBox(id, start()), b);
  assert.equal(pickSceneItem(center(b), start(), asset => asset === id), id);
  assert.equal(pickSceneItem(center(b), start(), () => false), null);
});
test('only the physical gas knob is clickable; no hidden label target survives', () => {
  assert.equal(pickSceneItem(center(layout.gas), start()), 'gas');
  assert.equal(pickSceneItem(center(layout.gas), start(), () => false), null);
  const r = finish(drop(start(), 'gas', 'off'));
  assert.equal(pickSceneItem(center(layout.gas), r), null);
});
for (const [id, zone] of [['water', 'pan'], ['cloth', 'pan'], ['plate', 'pan'], ['knife', 'pan']] as const) test(`${id} returns to its original scene position after ${zone}`, () => {
  const r = drop(start(), id, zone), a = r.action!;
  const result = movingItem({ ...r, action: { ...a, age: a.duration } });
  assert.deepEqual(result?.box, layout.props[id]); assert.equal(result?.opacity, 1);
});
test('premature evacuation smoothly returns the person to the kitchen', () => {
  const r = drop(start(), 'person', 'exit'), a = r.action!;
  assert.notDeepEqual(personBox(r), layout.person);
  assert.deepEqual(personBox({ ...r, action: { ...a, age: a.duration } }), layout.person);
});
function drawnAssets(r: Run, drag: Drag | null = null) {
  const drawn: string[] = [], gradient = { addColorStop() {} };
  const ctx = new Proxy({ drawImage(image: { id: string }) { drawn.push(image.id); }, createRadialGradient() { return gradient; }, createLinearGradient() { return gradient; } }, { get(target, key) { return key in target ? target[key as keyof typeof target] : () => {}; }, set() { return true; } });
  const art = Object.fromEntries(Object.keys(assets).map(id => [id, { image: { id } }])) as unknown as Art;
  render(ctx as unknown as CanvasRenderingContext2D, art, r, { clock: 0, selected: drag?.item ?? null, drag, hover: 'miss', reduced: false });
  return drawn;
}
test('dragged props never have a duplicate remaining on the countertop', () => {
  for (const id of sceneItems) {
    const home = center(layout.props[id]);
    const drag: Drag = { item: id, point: { x: 200, y: 400 }, from: home, pointerStart: home, offset: { x: 0, y: 0 }, pointerId: 1, moved: true };
    assert.equal(drawnAssets(start(), drag).filter(name => name === id).length, 1, id);
    assert.equal(drawnAssets(drop(start(), id, 'pan')).filter(name => name === id).length, 1, id + ' action');
  }
});
test('covered lid has left the prep counter and is no longer pickable there', () => {
  const r = finish(drop(start(), 'lid', 'pan'));
  assert.equal(pickSceneItem(center(layout.props.lid), r), null);
  assert.equal(drawnAssets(r).filter(name => name === 'lid').length, 1);
});
test('dragged character is rendered once, using her current emotion', () => {
  const r = start(), p = center(personBox(r));
  const drag: Drag = { item: 'person', point: { x: 500, y: 500 }, from: p, pointerStart: p, offset: { x: 0, y: 0 }, pointerId: 1, moved: true };
  assert.equal(drawnAssets(r, drag).filter(name => name === emotion(r)).length, 1);
});

test('successful action narration never appears in the immersive HUD', () => {
  for (const [item, zone] of [['gas', 'off'], ['lid', 'pan']] as const) {
    const r = drop(start(), item, zone);
    assert.equal(briefFeedback(r), null); assert.equal(briefFeedback(finish(r)), null);
  }
  assert.equal(briefFeedback(start()), null);
  assert.equal(briefFeedback(drop(start(), 'plate', 'pan')), null);
});
test('danger feedback is one concise cause, not a duplicate action caption', () => {
  assert.equal(briefFeedback(drop(start(), 'water', 'pan')), '油锅起火不能泼水');
  assert.equal(briefFeedback(drop(start(), 'cloth', 'pan')), '这块抹布不能盖严锅口');
});
test('50-second timer is independent of risk and never refills or becomes negative', () => {
  assert.equal(riskClock(start()), '00:50');
  assert.equal(riskClock({ ...start(), risk: 100 }), '00:50');
  assert.equal(riskClock(tick(start(), 5000)), '00:45');
  const r=tick(start(),22000), c=countdown(r);
  assert.equal(c.seconds,28);
  assert.equal(countdown(tick(r,16000)).seconds,12);
  const correct=finish(drop(r,'gas','off'));
  assert.ok(correct.risk<r.risk);assert.ok(countdown(correct).ratio<c.ratio);
  assert.equal(countdown(drop(r,'water','pan')).ratio,c.ratio);
  assert.equal(countdown(tick(start(),51000)).ratio,0);
  assert.equal(riskClock(tick(start(),51000)),'00:00');
});
test('untreated fire reaches its training peak at 50 active seconds, still recoverable',()=>{
  let r=tick(start(),49990);assert.ok(r.risk<100);assert.equal(r.peakReached,false);
  r=tick(r,10);assert.equal(r.risk,100);assert.equal(r.peakReached,true);assert.equal(r.phase,'playing');
  r=finish(drop(r,'gas','off'));r=finish(drop(r,'lid','pan'));r=finish(drop(r,'person','exit'));r=tick(r,timing.settling);
  assert.equal(r.phase,'complete');assert.equal(thermometerState(kitchenPressure(r).heat,controlled(r)).tone,'safe');
});
test('catalog and kitchen configuration share the same 50-second duration',()=>{
  assert.equal(levels.find(l=>l.id==='oil-fire')?.riskSeconds,50);
  assert.equal(levels.find(l=>l.id==='oil-fire')?.duration,'50 秒');
});
test('default screen contains no answer steps, duplicate narration, intro card or footer UI', () => {
  const html = renderToStaticMarkup(createElement(KitchenPlayer, { totalFlowers: 0, onBack() {}, onFinish() {} }));
  for (const removed of ['关闭火源', '盖住油锅', '安全撤离', 'kitchen-footer', 'kitchen-goals', 'kitchen-start-card', '正在平稳盖住锅口']) assert.ok(!html.includes(removed), removed);
  assert.ok(html.includes('火势紧急程度') && html.includes('暂停游戏'));
  assert.ok(html.includes('role="meter"') && html.includes('thermometer-shell.png'));
  assert.ok(!html.includes('处置时间')&&!html.includes('kitchen-countdown')&&!html.includes('aria-label="50 秒'));
});
test('thermometer follows danger, rises with wrong actions and falls after treatment',()=>{
 const initial=start(),idle=tick(initial,25000),wrong=drop(initial,'water','pan'),gas=finish(drop(initial,'gas','off')),lid=finish(drop(initial,'lid','pan'));
 const heat=(r:Run)=>thermometerState(kitchenPressure(r).heat,controlled(r)).ratio;
 assert.ok(heat(idle)>heat(initial));assert.ok(heat(wrong)>heat(initial));assert.ok(heat(gas)<heat(initial));assert.ok(heat(lid)<heat(initial));
 assert.equal(heat(finish(drop(gas,'lid','pan'))),0);
 assert.equal(thermometerState(1,false).tone,'critical');assert.equal(thermometerState(.7,false).tone,'warning');assert.equal(thermometerState(1,true).tone,'safe');
 assert.equal(thermometerState(Infinity,false).ratio,0);
});
test('thermometer uses one red pigment and never changes to yellow or green',()=>{
 for(const [heat,safe] of [[.1,false],[.7,false],[1,false],[0,true]] as const){
  const html=renderToStaticMarkup(createElement(KitchenThermometer,{heat,safe}));
  assert.ok(html.includes('--meter-color:#ce493d'));assert.ok(!html.includes('°C'));
 }
});
test('controlled thermometer has no residual liquid, including its bulb or highlight',()=>{
 for(const heat of [0,.5,1]){
  const html=renderToStaticMarkup(createElement(KitchenThermometer,{heat,safe:true}));
  assert.match(html,/<rect class="kitchen-thermometer-liquid"[^>]*height="0"/);
  assert.match(html,/<rect class="kitchen-thermometer-highlight"[^>]*height="0"/);
  assert.ok(html.includes('thermometer-shell.png'),'keep the original empty glass shell');
 }
 const danger=renderToStaticMarkup(createElement(KitchenThermometer,{heat:.5,safe:false}));
 assert.doesNotMatch(danger,/<rect class="kitchen-thermometer-liquid"[^>]*height="0"/);
});
for (const [width, height] of [[320,740], [390,844], [430,932], [400,800], [360,900]]) test(`fullscreen ${width}x${height}: image and input use the same uniform camera`, () => {
  const c = cameraFor(width, height), rect = { left: 0, top: 0, width, height };
  for (const b of [...Object.values(layout.props), layout.gas, layout.lid]) {
    const p = center(b), screen = { x: c.x + p.x * c.scale, y: c.y + p.y * c.scale };
    const result = toWorld(screen, rect);
    assert.ok(Math.abs(result.x - p.x) < 1e-8 && Math.abs(result.y - p.y) < 1e-8);
    assert.ok(c.x + b.x * c.scale >= -1 && c.x + (b.x + b.w) * c.scale <= width + 1);
    assert.ok(c.y + b.y * c.scale >= 0 && c.y + (b.y + b.h) * c.scale <= height);
  }
});
