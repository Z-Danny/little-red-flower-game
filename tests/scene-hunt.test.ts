import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  createHunt,
  reduceHunt,
  pressure,
  type HuntRun,
} from '../app/game/scene-hunt/model';
import { getHunt, huntPacks } from '../app/game/scene-hunt/registry';
import { camera, hitMask, checkHunt } from '../app/game/scene-hunt/schema';
import { HuntSound } from '../app/game/scene-hunt/sound';
const pack = getHunt('typhoon-home')!,
  rules = pack.rules;
const tick = (r: HuntRun, ms: number) => {
  for (let remaining = ms; remaining > 0; remaining -= 100)
    r = reduceHunt(rules, r, { type: 'tick', ms: Math.min(100, remaining) });
  return r;
};
const tap = (r: HuntRun, id: string | null) =>
  reduceHunt(rules, r, { type: 'tap', id, x: 20, y: 20 });
const start = () => reduceHunt(rules, createHunt(), { type: 'start' });
function permutations<T>(a: T[]): T[][] {
  return a.length
    ? a.flatMap((v, i) =>
        permutations(a.filter((_, j) => i !== j)).map((p) => [v, ...p]),
      )
    : [[]];
}
for (const order of permutations(rules.targets.map((t) => t.id)))
  test('all five in any order: ' + order.join(' > '), () => {
    let r = start();
    for (const id of order) {
      r = tap(r, id);
      assert.equal(r.marking?.id, id);
      r = tick(r, 799);
      assert.ok(!r.found.includes(id));
      r = tick(r, 1);
      assert.ok(r.found.includes(id));
    }
    assert.equal(r.phase, 'reveal');
    assert.equal(r.stars, 3);
    r = tick(r, rules.revealMs - 1);
    assert.equal(r.phase, 'reveal');
    r = tick(r, 1);
    assert.equal(r.phase, 'complete');
    assert.equal(pressure(rules, r), 0);
    assert.deepEqual(reduceHunt(rules, r, { type: 'reset' }), createHunt());
  });
test('scope: only typhoon routed to scene recognition', () => {
  assert.equal(huntPacks.length, 1);
  assert.equal(getHunt('oil-fire'), undefined);
  assert.equal(getHunt('flood-kit'), undefined);
});
test('ready has no time pressure or input', () => {
  const r = createHunt();
  assert.equal(tick(r, 5000), r);
  assert.equal(tap(r, 'plant'), r);
});
test('wrong tap no deduction, ripple expires', () => {
  let r = start();
  r = tap(r, null);
  assert.deepEqual(r.found, []);
  assert.equal(r.elapsed, 0);
  assert.ok(r.miss);
  r = tick(r, 420);
  assert.equal(r.miss, null);
  assert.equal(r.stars, 0);
});
test('busy tap and double tap cannot duplicate rewards', () => {
  let r = tap(start(), 'plant');
  assert.equal(tap(r, 'window'), r);
  r = tick(r, 800);
  assert.equal(tap(r, 'plant'), r);
  assert.equal(r.found.length, 1);
});
test('peak is recoverable, no automatic safe scene', () => {
  let r = tick(start(), 105000);
  assert.equal(r.phase, 'playing');
  assert.equal(r.peak, true);
  assert.equal(pressure(rules, r), 1);
  for (const t of rules.targets) r = tick(tap(r, t.id), 800);
  assert.equal(r.phase, 'reveal');
});
test('invalid ticks cannot corrupt state and long frame clamps', () => {
  const r = start();
  for (const ms of [NaN, Infinity, 0, -5])
    assert.equal(reduceHunt(rules, r, { type: 'tick', ms }), r);
  assert.equal(reduceHunt(rules, r, { type: 'tick', ms: 30000 }).elapsed, 100);
});
test('exact mask colors, blanks and outside world', () => {
  const s = pack.skin,
    data = new Uint8ClampedArray(s.width * s.height * 4);
  let n = 0;
  for (const t of Object.values(s.targets)) {
    data.set([...t.color, 255], n++ * 4);
  }
  n = 0;
  for (const id of Object.keys(s.targets))
    assert.equal(hitMask(s, data, n++ + 0.4, 0.5), id);
  for (const [x, y] of [
    [30, 30],
    [-1, 0],
    [720, 5],
    [0, 1280],
    [NaN, 0],
    [Infinity, 3],
  ])
    assert.equal(hitMask(s, data, x, y), null);
});
test('contain camera preserves full painting at portrait, tablet and landscape sizes', () => {
  for (const [w, h] of [
    [320, 740],
    [390, 844],
    [768, 1024],
    [1024, 600],
  ]) {
    const c = camera(pack.skin, w, h);
    assert.ok(c.x >= 0 && c.y >= 0);
    assert.ok(c.scale * 720 <= w + 0.001 && c.scale * 1280 <= h + 0.001);
  }
});
test('bad art config fails early', () => {
  for (const mutate of [
    (p: any) => (p.skin.width = NaN),
    (p: any) => (p.rules.markMs = 200),
    (p: any) => (p.skin.targets.plant.color = [1]),
    (p: any) => (p.skin.targets.plant.bounds.x = -1),
    (p: any) => (p.skin.targets.plant.bounds.w = Infinity),
    (p: any) => (p.skin.targets.plant.icon = 'https://bad.test/x.png'),
    (p: any) => p.rules.targets.push(p.rules.targets[0]),
  ]) {
    const bad = structuredClone(pack);
    mutate(bad);
    assert.throws(() => checkHunt(bad));
  }
});
test('local source art and identical pixels outside family repair recorded', () => {
  const report = JSON.parse(
    readFileSync('art-source/typhoon-immersion-v2/processing.json', 'utf8'),
  );
  assert.equal(report.unchangedOutsideFamilyRepair, true);
  for (const path of [
    pack.skin.scene,
    pack.skin.safe,
    pack.skin.clean,
    pack.skin.mask,
    pack.skin.family,
    ...Object.values(pack.skin.targets).map((t) => t.icon),
  ])
    assert.ok(existsSync('public' + path), path);
});
test('no AI narration path or speech API', () => {
  const sound = readFileSync('app/game/scene-hunt/sound.ts', 'utf8'),
    ui = readFileSync('components/game/scene-hunt/player.tsx', 'utf8');
  assert.ok(!/speechSynthesis|voiceClips|decodeAudioData|fetch\(/.test(sound));
  assert.ok(!/人物语音|\.say\(/.test(ui));
});
test('weather draws behind people, no face droplets', () => {
  const src = readFileSync('components/game/scene-hunt/renderer.ts', 'utf8');
  assert.ok(src.search(/art\.family,\s*0,\s*sy/) > src.indexOf('Rain is clipped'));
  assert.ok(!src.includes('#b1dfeb'));
});
test('sound never autostarts; lifecycle cleans nodes and respects mute / hidden / pause', async () => {
  const oldCtx = globalThis.AudioContext,
    oldFetch = globalThis.fetch;
  class Param {
    value = 0;
    setTargetAtTime(v: number) {
      this.value = v;
    }
    setValueAtTime(v: number) {
      this.value = v;
    }
    exponentialRampToValueAtTime(v: number) {
      this.value = v;
    }
    linearRampToValueAtTime(v: number) {
      this.value = v;
    }
  }
  class N {
    gain = new Param();
    frequency = new Param();
    playbackRate = new Param();
    threshold = new Param();
    ratio = new Param();
    attack = new Param();
    release = new Param();
    onended: Function | null = null;
    connect() {}
    disconnect() {}
    start() {}
    stop() {
      this.onended?.();
    }
  }
  class C {
    static made = 0;
    state = 'suspended';
    currentTime = 0;
    sampleRate = 8000;
    destination = {};
    constructor() {
      C.made++;
    }
    createGain() {
      return new N();
    }
    createDynamicsCompressor() {
      return new N();
    }
    createAnalyser() {
      return {
        ...new N(),
        fftSize: 256,
        connect() {},
        getFloatTimeDomainData(a: Float32Array) {
          a.fill(0.01);
        },
      };
    }
    createBufferSource() {
      return new N();
    }
    createOscillator() {
      return new N();
    }
    createBiquadFilter() {
      return new N();
    }
    createBuffer(_: number, length: number) {
      return { getChannelData: () => new Float32Array(length) };
    }
    async decodeAudioData() {
      return {};
    }
    async resume() {
      this.state = 'running';
    }
    async close() {
      this.state = 'closed';
    }
  }
  globalThis.AudioContext = C as any;
  globalThis.fetch = (async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(10),
  })) as any;
  const sound = new HuntSound();
  try {
    assert.equal(C.made, 0);
    assert.equal(sound.status, 'locked');
    await sound.unlock();
    assert.equal(C.made, 1);
    sound.setScene(true, 0.8);
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
    sound.setScene(false, 0.8);
    sound.cue('wrong');
    assert.equal(sound.lastCue, 'found');
    sound.setScene(true, 0, true);
    sound.cue('success');
    assert.equal(sound.lastCue, 'success');
    sound.reset();
    assert.equal(sound.lastCue, '');
  } finally {
    sound.dispose();
    globalThis.AudioContext = oldCtx;
    globalThis.fetch = oldFetch;
  }
  assert.equal(sound.status, 'locked');
});
