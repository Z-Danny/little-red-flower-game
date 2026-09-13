import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createHunt,
  reduceHunt,
  pressure,
  type HuntRules,
  type HuntRun,
} from '../app/game/scene-hunt/model';
import {
  performanceTier,
  performanceStage,
  distantThunderAge,
  validatePerformance,
  performanceSounds,
  type HuntPerformance,
} from '../app/game/scene-hunt/performance';
import {
  performanceAudio,
  performanceMix,
} from '../app/game/scene-hunt/audio-profiles';
import { checkHunt, type HuntPack } from '../app/game/scene-hunt/schema';
import {
  typhoonPresentation,
  endingFade,
} from '../app/game/scene-hunt/presentation';
import { characterMotion } from '../components/game/scene-hunt/performance-renderer';
import {
  permissionMaskPixels,
  protectedMaskPixels,
} from '../components/game/scene-hunt/art';
import { HuntSound } from '../app/game/scene-hunt/sound';

const perf: HuntPerformance = {
  version: 2,
  atmosphere: 'indoor',
  sound: 'quiet_electric',
  retreatDirection: 1,
  stages: [0, 30000, 60000, 90000].map((atMs, i) => ({
    atMs,
    breathMs: [2800, 2300, 1900, 1700][i],
    breathPx: [2, 2.4, 2.8, 3.2][i],
    retractPx: [0, 4, 7, 10][i],
    vignette: [0, 0.06, 0.12, 0.16][i],
    bpm: [64, 71, 77, 84][i],
    rainCount: 0,
    smokeCount: 0,
    smokeAlpha: 0,
    flameScale: 1,
  })),
};
const rules: HuntRules = {
  id: 'test-hunt-v2',
  title: '测试',
  order: 14,
  seconds: 90,
  markMs: 800,
  revealMs: 5500,
  feedbackVersion: 2,
  targets: ['a', 'b', 'c', 'd', 'e'].map((id) => ({
    id,
    name: id,
    lesson: '观察',
  })),
  summary: '仅用于测试',
};
const tick = (r: HuntRun, ms: number, rr = rules) => {
  for (let n = ms; n > 0; n -= 100)
    r = reduceHunt(rr, r, { type: 'tick', ms: Math.min(100, n) });
  return r;
};
const start = () => reduceHunt(rules, createHunt(), { type: 'start' });
const tap = (r: HuntRun, id: string | null) =>
  reduceHunt(rules, r, { type: 'tap', id, x: 20, y: 20 });
const samplePack = (): HuntPack => {
  const skin = JSON.parse(
    readFileSync('content/scenes/typhoon-home/skin.json', 'utf8'),
  );
  const regions = Object.values(skin.targets);
  skin.targets = Object.fromEntries(
    rules.targets.map((r, i) => [r.id, regions[i]]),
  );
  skin.effects = { characterMask: '/levels/test/character-mask.png' };
  return {
    rules: structuredClone(rules),
    skin,
    presentation: {
      ...typhoonPresentation,
      environment: 'none',
      characters: 'breathing',
      timer: 'elapsed',
    },
    performance: structuredClone(perf),
  };
};
test('v2 schema is additive, exact five-target contract validated', () => {
  assert.equal(checkHunt(samplePack()).rules.feedbackVersion, 2);
  for (const mutate of [
    (p: HuntPack) => delete p.rules.feedbackVersion,
    (p: HuntPack) => p.rules.targets.pop(),
    (p: HuntPack) => (p.rules.seconds = 100),
    (p: HuntPack) => delete p.skin.effects,
    (p: HuntPack) => (p.performance!.stages[1].atMs = 29999),
    (p: HuntPack) => delete (p.performance!.stages[0] as any).breathPx,
    (p: HuntPack) => (p.performance!.stages[0].smokeCount = 1),
    (p: HuntPack) => (p.performance!.sound = 'forest_edge'),
    (p: HuntPack) => (p.performance!.missCaption = ''),
  ]) {
    const p = samplePack();
    mutate(p);
    assert.throws(() => checkHunt(p));
  }
});
test('four tiers use activity time and remain capped beyond peak', () => {
  for (const [ms, tier] of [
    [0, 0],
    [29999, 0],
    [30000, 1],
    [59999, 1],
    [60000, 2],
    [89999, 2],
    [90000, 3],
    [9000000, 3],
  ]) {
    assert.equal(performanceTier(ms), tier);
    assert.equal(performanceStage(perf, ms), perf.stages[tier]);
  }
});
test('miss lives450ms, rate limited500ms without adding pressure or blocking valid target', () => {
  let r = tap(start(), null);
  assert.equal(r.elapsed, 0);
  assert.equal(r.missCooldownUntil, 500);
  assert.equal(r.stars, 0);
  const duplicate = tap(r, null);
  assert.equal(duplicate, r);
  r = tick(r, 449);
  assert.ok(r.miss);
  assert.equal(tap(r, null), r);
  r = tick(r, 1);
  assert.equal(r.miss, null);
  assert.equal(tap(r, null), r);
  const valid = tap(r, 'a');
  assert.equal(valid.marking?.id, 'a');
  r = tick(r, 50);
  assert.ok(tap(r, null).miss);
});
test('busy/repeated marks never queue, nod anchored to committed found activity time', () => {
  let r = tap(start(), 'a');
  assert.equal(tap(r, 'b'), r);
  r = tick(r, 799);
  assert.equal(r.found.length, 0);
  r = tick(r, 1);
  assert.deepEqual(r.foundAt, { id: 'a', at: 800 });
  assert.equal(tap(r, 'a'), r);
  const p = samplePack(),
    motion = characterMotion(p, tick(r, 180), false);
  assert.ok(motion.nod > 2.9);
  assert.equal(characterMotion(p, tick(r, 360), false).nod, 0);
  assert.equal(characterMotion(p, tick(r, 180), true).nod, 0);
});
test('unfinished during an in-flight mark freezes all state and grants zero', () => {
  let r = tick(tap(start(), 'a'), 800);
  r = tick(tap(r, 'b'), 400);
  r = reduceHunt(rules, r, { type: 'end' });
  assert.equal(r.phase, 'unfinished');
  assert.deepEqual(r.found, ['a']);
  assert.equal(r.marking, null);
  assert.equal(r.stars, 0);
  assert.equal(tick(r, 50000), r);
  assert.equal(tap(r, 'c'), r);
  assert.equal(reduceHunt(rules, r, { type: 'start' }), r);
  assert.deepEqual(reduceHunt(rules, r, { type: 'reset' }), createHunt());
});
test('end event cannot rewrite legacy rules or cancel full success', () => {
  const legacy = { ...rules, feedbackVersion: undefined };
  assert.equal(reduceHunt(legacy, start(), { type: 'end' }).phase, 'playing');
  let r = start();
  for (const t of rules.targets) r = tick(tap(r, t.id), 800);
  assert.equal(r.phase, 'reveal');
  assert.equal(reduceHunt(rules, r, { type: 'end' }), r);
});
function permutations(a: string[]): string[][] {
  return a.length
    ? a.flatMap((v, i) =>
        permutations(a.filter((_, j) => i !== j)).map((rest) => [v, ...rest]),
      )
    : [[]];
}
for (const order of permutations(rules.targets.map((t) => t.id)))
  test('v2 any-order plus exact ending hold: ' + order.join(','), () => {
    let r = tick(start(), 94000);
    assert.equal(r.peak, true);
    assert.equal(pressure(rules, r), 1);
    for (const id of order) r = tick(tap(r, id), 800);
    assert.equal(r.phase, 'reveal');
    r = tick(r, 800);
    assert.equal(endingFade(r.phase, r.revealAge), 0);
    r = tick(r, 1);
    assert.ok(endingFade(r.phase, r.revealAge) > 0);
    r = tick(r, 1799);
    assert.equal(endingFade(r.phase, r.revealAge), 1);
    r = tick(r, 2899);
    assert.equal(r.phase, 'reveal');
    r = tick(r, 1);
    assert.equal(r.phase, 'complete');
    assert.equal(r.stars, 3);
  });
test('target evidence veto wins over approved effects and character masks', () => {
  const ids = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 254, 0, 0, 255,
  ]);
  const protection = protectedMaskPixels(ids, [[255, 0, 0]]);
  assert.deepEqual(
    [protection[3], protection[7], protection[11], protection[15]],
    [255, 0, 0, 0],
  );
  const allowed = new Uint8ClampedArray([
    255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 0,
  ]);
  const result = permissionMaskPixels(allowed, protection);
  assert.deepEqual(
    [result[3], result[7], result[11], result[15]],
    [0, 255, 0, 0],
  );
});
test('weather/fire need explicit approved masks, invalid physics is rejected', () => {
  const p = samplePack();
  p.performance!.atmosphere = 'rain';
  p.performance!.sound = 'rain_street';
  assert.throws(() => checkHunt(p));
  p.skin.effects!.weatherMask = '/levels/test/rain.png';
  assert.doesNotThrow(() => checkHunt(p));
  p.performance!.atmosphere = 'thunder';
  p.performance!.sound = 'thunder_park';
  assert.throws(() => checkHunt(p));
  p.skin.effects!.skyMask = '/levels/test/sky.png';
  assert.doesNotThrow(() => checkHunt(p));
  const f = samplePack();
  f.performance!.atmosphere = 'fire';
  f.performance!.sound = 'forest_edge';
  assert.throws(() => checkHunt(f));
  f.skin.effects!.fireMask = '/levels/test/fire.png';
  f.skin.effects!.smokeMask = '/levels/test/smoke.png';
  f.skin.effects!.fireSources = [{ kind: 'flame', x: 50, y: 60, w: 50, h: 30 }];
  assert.doesNotThrow(() => checkHunt(f));
  f.performance!.stages[3].smokeAlpha = 0.43;
  assert.throws(() => checkHunt(f));
});
test('distant cloud swell occurs once per tier and never loops after peak', () => {
  const p = {
    ...perf,
    atmosphere: 'thunder' as const,
    sound: 'thunder_park' as const,
  };
  for (const base of [12000, 42000, 72000, 102000]) {
    assert.equal(distantThunderAge(p, base - 1), -1);
    assert.equal(distantThunderAge(p, base), 0);
    assert.equal(distantThunderAge(p, base + 699), 699);
    assert.equal(distantThunderAge(p, base + 700), -1);
  }
  assert.equal(distantThunderAge(p, 132000), -1);
  assert.equal(distantThunderAge(perf, 12000), -1);
});
test('seven original profiles, bounded mix, no indoor invented ambience', () => {
  assert.equal(Object.keys(performanceAudio).length, 7);
  assert.equal(performanceAudio.quiet_electric.ambience, 'none');
  assert.equal(performanceAudio.preparedness.ambience, 'none');
  assert.ok(performanceMix.sfxMax <= 0.08);
  for (const id of performanceSounds)
    assert.ok(performanceAudio[id].notes.every(Number.isFinite));
  assert.equal(performanceMix.missMs, 160);
  assert.equal(performanceMix.foundMs, 90);
});
test('UI emits resolve only when fade is positive and offers unfinished action', () => {
  const src = readFileSync('components/game/scene-hunt/player.tsx', 'utf8');
  assert.match(
    src,
    /endingFade\(r.phase,\s*r.revealAge\)\s*>\s*0\s*&&\s*!prev.resolved/,
  );
  assert.match(src, /结束本次观察/);
  assert.match(src, /本次观察未完成/);
  assert.match(src, /data-stage=/);
  assert.match(src, /animationDelay/);
});
class Param {
  value = 0;
  setValueAtTime(v: number) {
    this.value = v;
  }
  setTargetAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
  }
}
class AudioNodeMock {
  gain = new Param();
  frequency = new Param();
  threshold = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
  onended: null | (() => void) = null;
  connect() {}
  disconnect() {}
  start() {}
  stop() {
    this.onended?.();
  }
}
class ContextMock {
  static made = 0;
  state = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  constructor() {
    ContextMock.made++;
  }
  createGain() {
    return new AudioNodeMock();
  }
  createDynamicsCompressor() {
    return new AudioNodeMock();
  }
  createOscillator() {
    return new AudioNodeMock();
  }
  createBiquadFilter() {
    return new AudioNodeMock();
  }
  createBufferSource() {
    return new AudioNodeMock();
  }
  createBuffer(_: number, n: number) {
    return { getChannelData: () => new Float32Array(n) };
  }
  createAnalyser() {
    return {
      ...new AudioNodeMock(),
      fftSize: 256,
      connect() {},
      getFloatTimeDomainData(a: Float32Array) {
        a.fill(0.01);
      },
    };
  }
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
}
for (const profile of performanceSounds)
  test('v2 audio lifecycle ' + profile, async () => {
    const old = globalThis.AudioContext;
    ContextMock.made = 0;
    globalThis.AudioContext = ContextMock as any;
    const p = structuredClone(perf);
    p.sound = profile;
    p.atmosphere =
      profile === 'forest_edge'
        ? 'fire'
        : profile === 'rain_street'
          ? 'rain'
          : profile === 'thunder_park'
            ? 'thunder'
            : 'indoor';
    const sound = new HuntSound('quiet_electric', p);
    try {
      assert.equal(ContextMock.made, 0);
      await sound.unlock();
      assert.equal(ContextMock.made, 1);
      sound.setScene(true, 1, false, 90000);
      sound.cue('found');
      assert.equal(sound.lastCue, 'found');
      sound.setMuted(true);
      sound.cue('wrong');
      assert.equal(sound.lastCue, 'found');
      sound.setMuted(false);
      sound.setHidden(true);
      sound.cue('wrong');
      assert.equal(sound.lastCue, 'found');
      sound.setHidden(false);
      sound.setScene(false, 1);
      sound.cue('wrong');
      assert.equal(sound.lastCue, 'found');
      sound.setScene(true, 0, true, 90000);
      sound.cue('resolve');
      assert.equal(sound.lastCue, 'resolve');
      sound.cue('success');
      assert.equal(sound.lastCue, 'success');
      sound.setMusic(false);
      sound.setScene(true, 0.5, false, 45000);
      (sound as any).schedule();
      assert.equal((sound as any).musicBus.gain.value, 0);
      sound.reset();
      assert.equal(sound.lastCue, '');
    } finally {
      sound.dispose();
      globalThis.AudioContext = old;
    }
    assert.equal(sound.status, 'locked');
    assert.equal((sound as any).live.size, 0);
  });
