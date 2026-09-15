import { test, type TestContext } from 'node:test';
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
import { synthesiseHuntFeedback } from '../app/game/scene-hunt/feedback-score';
import { approvedSoundDuration, approvedSoundSamples } from '../app/game/audio/result-samples';
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
test('scope: typhoon and new bedroom routed to scene recognition', () => {
  assert.equal(huntPacks.length, 9);
  assert.ok(getHunt('charging-bedroom'));
  assert.equal(getHunt('oil-fire'), undefined);
  assert.equal(getHunt('flood-kit'), undefined);
});
test('ready has no time pressure or input', () => {
  const r = createHunt();
  assert.equal(tick(r, 5000), r);
  assert.equal(tap(r, 'plant'), r);
});
test('wrong tap deducts five seconds, ripple expires', () => {
  let r = start();
  r = tap(r, null);
  assert.deepEqual(r.found, []);
  assert.equal(r.elapsed, 5000);
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
test('typhoon hard deadline cannot enter a safe scene after timeout', () => {
  const r = tick(start(), 105000);
  assert.equal(r.phase, 'failed');
  assert.equal(r.peak, true);
  assert.equal(pressure(rules, r), 1);
  assert.equal(r.stars, 0);
  assert.equal(tap(r, 'plant'), r);
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
for (const profile of ['storm','quiet_electric'] as const) test('sound lifecycle: ' + profile + ' never autostarts and respects mute / hidden / pause', async () => {
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
    static bufferSources = 0;
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
      C.bufferSources++;
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
  const sound = new HuntSound(profile);
  try {
    assert.equal(C.made, 0);
    assert.equal(sound.status, 'locked');
    await sound.unlock();
    assert.equal(C.made, 1);
    assert.equal(C.bufferSources, profile === 'quiet_electric' ? 0 : 2);
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

class FeedbackParam {
  value = 0;
  setTargetAtTime(value: number) { this.value = value; }
  setValueAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
}
class FeedbackNode {
  next: FeedbackNode | null = null;
  disconnected = false;
  connect(node: FeedbackNode) { this.next = node; return node; }
  disconnect() { this.disconnected = true; this.next = null; }
}
class FeedbackGain extends FeedbackNode { gain = new FeedbackParam(); }
class FeedbackSource extends FeedbackNode {
  buffer: { duration: number; getChannelData: (channel: number) => Float32Array } | null = null;
  loop = false; starts = 0; stops = 0; frequency = new FeedbackParam();
  onended: (() => void) | null = null;
  start() { this.starts++; }
  // Browsers deliver ended asynchronously. Cleanup must not rely on that callback.
  stop() { this.stops++; }
}
class FeedbackContext {
  state = 'suspended'; currentTime = 0; sampleRate = 8000;
  destination = new FeedbackNode(); sources: FeedbackSource[] = [];
  createGain() { return new FeedbackGain(); }
  createBufferSource() { const source = new FeedbackSource(); this.sources.push(source); return source; }
  createOscillator() { return this.createBufferSource(); }
  createDynamicsCompressor() { return Object.assign(new FeedbackNode(), { threshold: new FeedbackParam(), ratio: new FeedbackParam(), attack: new FeedbackParam(), release: new FeedbackParam() }); }
  createAnalyser() { return Object.assign(new FeedbackNode(), { fftSize: 256, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0) }); }
  createBiquadFilter() { return Object.assign(new FeedbackNode(), { type: '', frequency: new FeedbackParam() }); }
  createBuffer(_channels: number, length: number, rate: number) {
    const samples = new Float32Array(length); return { duration: length / rate, getChannelData: () => samples };
  }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}
function feedbackFixture(t: TestContext, profile: 'storm' | 'quiet_electric') {
  const previous = globalThis.AudioContext;
  const contexts: FeedbackContext[] = [];
  t.mock.timers.enable({ apis: ['setInterval'] });
  globalThis.AudioContext = class extends FeedbackContext { constructor() { super(); contexts.push(this); } } as unknown as typeof AudioContext;
  const sound = new HuntSound(profile);
  t.after(() => { sound.dispose(); globalThis.AudioContext = previous; });
  return { sound, get context() { const current = contexts[0]; assert(current); return current; } };
}
const feedbackGainProduct = (source: FeedbackNode) => {
  let product = 1;
  for (let node: FeedbackNode | null = source; node; node = node.next) if (node instanceof FeedbackGain) product *= node.gain.value;
  return product;
};

for (const profile of ['storm', 'quiet_electric'] as const) {
  void test(`${profile}: terminal feedback preserves the approved samples in every scene treatment`, () => {
    for (const performance of [undefined, ...huntPacks.map(pack => pack.performance)]) {
      for (const [cue, kind] of [['success', 'victory'], ['timeout', 'failure']] as const) {
        const samples = synthesiseHuntFeedback(profile, performance, cue, 44100);
        assert.deepEqual(samples, approvedSoundSamples(kind), `${cue} must not retain or mix the old scene melody`);
        assert(Math.abs(samples.length / 44100 - approvedSoundDuration(kind)) < 1 / 44100);
      }
    }
  });

  void test(`${profile}: mute, hidden and inactive cancel feedback immediately without depending on ended callbacks`, async t => {
    const fixture = feedbackFixture(t, profile), { sound } = fixture;
    await sound.unlock(); sound.setScene(true, .3);
    const context = fixture.context, beds = context.sources.filter(source => source.loop);
    for (const mode of ['muted', 'hidden', 'inactive'] as const) {
      sound.cue('resolve'); sound.cue('found'); sound.cue('wrong'); sound.cue('tap');
      const voices = context.sources.filter(source => !source.loop && source.starts && !source.stops);
      assert.equal(voices.length, 3, 'fast taps retain at most three live feedback sources');
      const gates = voices.map(voice => voice.next as FeedbackGain);
      if (mode === 'muted') sound.setMuted(true);
      else if (mode === 'hidden') sound.setHidden(true);
      else sound.setScene(false, .3);
      assert(voices.every(voice => voice.stops > 0 && voice.disconnected));
      assert(gates.every(gate => gate.gain.value === 0));
      const count = context.sources.length;
      if (mode === 'muted') sound.setMuted(false);
      else if (mode === 'hidden') sound.setHidden(false);
      else sound.setScene(true, .3);
      assert.equal(context.sources.length, count, 'restoring policy cannot replay an old tail');
      assert(voices.every(voice => voice.disconnected));
      assert(beds.every(bed => bed.stops === 0 && !bed.disconnected), 'ambient loop ownership survives a pause');
    }
  });

  void test(`${profile}: finish speaks through an inactive scene exactly for its bounded terminal window`, async t => {
    const fixture = feedbackFixture(t, profile), { sound } = fixture;
    await sound.unlock(); sound.setScene(true, .5); sound.cue('resolve');
    const context = fixture.context, previous = context.sources.at(-1)!;
    sound.setScene(false, .5, true); assert(previous.stops > 0);
    sound.finish();
    const first = context.sources.at(-1)!, gate = first.next as FeedbackGain;
    assert.notEqual(first, previous); assert.equal(sound.lastCue, 'success'); assert.equal(first.starts, 1);
    assert(first.buffer!.getChannelData(0).some(value => value !== 0), 'terminal source contains audible PCM');
    assert.deepEqual(first.buffer!.getChannelData(0), approvedSoundSamples('victory'));
    assert(gate.gain.value > 0, 'ordinary scene inactivity cannot block finish');
    assert(context.sources.filter(source => source.loop).every(source => feedbackGainProduct(source) === 0), 'terminal success leaves weather silent');
    sound.finish();
    const replacement = context.sources.at(-1)!;
    assert.notEqual(first, replacement); assert(first.stops > 0 && first.disconnected);
    assert.equal(context.sources.filter(source => !source.loop && source.starts && !source.stops).length, 1);
    const replacementGate = replacement.next as FeedbackGain, count = context.sources.length;
    context.currentTime = 1.2; t.mock.timers.tick(1200); assert(replacementGate.gain.value > 0);
    context.currentTime = 1.4; t.mock.timers.tick(200);
    assert.equal(replacementGate.gain.value, 0, 'deadline silences a missing ended event');
    assert.equal(context.sources.length, count, 'terminal window never schedules music or more environment sources');
    assert(context.sources.filter(source => source.loop).every(source => feedbackGainProduct(source) === 0));
    sound.cue('found'); assert.equal(context.sources.length, count, 'completed scene cannot resume ordinary action cues');
  });

  void test(`${profile}: finish respects locked, muted and hidden states without a backlog on restore`, async t => {
    const fixture = feedbackFixture(t, profile), { sound } = fixture;
    sound.finish(); assert.equal(sound.status, 'locked');
    await sound.unlock(); sound.setScene(false, 0, true);
    const context = fixture.context;
    for (const mode of ['muted', 'hidden'] as const) {
      if (mode === 'muted') sound.setMuted(true); else sound.setHidden(true);
      const count = context.sources.length; sound.finish(); assert.equal(context.sources.length, count);
      if (mode === 'muted') sound.setMuted(false); else sound.setHidden(false);
      context.currentTime += 2; t.mock.timers.tick(2000);
      assert.equal(context.sources.length, count);
      assert(context.sources.filter(source => source.loop).every(source => feedbackGainProduct(source) === 0));
    }
  });

  void test(`${profile}: failure plays the full approved tail, cancels overlap and obeys pause, mute and hidden`, async t => {
    const fixture = feedbackFixture(t, profile), { sound } = fixture;
    sound.fail(); assert.equal(sound.status, 'locked');
    await sound.unlock(); sound.setScene(true, .9);
    const context = fixture.context;
    sound.cue('wrong'); const wrong = context.sources.at(-1)!;
    sound.fail(); const failure = context.sources.at(-1)!, gate = failure.next as FeedbackGain;
    assert(wrong.stops > 0 && wrong.disconnected, 'failure replaces ordinary feedback');
    assert.deepEqual(failure.buffer!.getChannelData(0), approvedSoundSamples('failure'));
    assert.equal(context.sources.filter(source => !source.loop && source.starts && !source.stops).length, 1);
    context.currentTime = approvedSoundDuration('failure') - .01;
    t.mock.timers.tick(1200);
    assert(gate.gain.value > 0, 'the former 850ms deadline must not truncate the approved failure');
    context.currentTime = 1.5; t.mock.timers.tick(300);
    assert.equal(gate.gain.value, 0);
    for (const mode of ['muted', 'hidden', 'paused'] as const) {
      sound.fail(); const voice = context.sources.at(-1)!;
      if (mode === 'muted') sound.setMuted(true);
      else if (mode === 'hidden') sound.setHidden(true);
      else sound.setScene(false, 1);
      assert(voice.stops > 0 && voice.disconnected);
      const count = context.sources.length;
      if (mode !== 'paused') { sound.fail(); assert.equal(context.sources.length, count, 'muted or hidden failures are consumed without playback'); }
      if (mode === 'muted') sound.setMuted(false);
      else if (mode === 'hidden') sound.setHidden(false);
      context.currentTime += 2; t.mock.timers.tick(2000);
      assert.equal(context.sources.length, count, 'restoring sound cannot replay a cancelled terminal cue');
    }
  });
}

void test('collection completion uses the inactive-safe finish API once on its phase transition', () => {
  const hook = readFileSync('components/game/scene-hunt/use-collection-sound.ts', 'utf8');
  assert.match(hook, /run\.phase\s*===\s*'complete'\s*&&\s*seen\.current\.phase\s*!==\s*'complete'\)\s*s\?\.finish\(\)/);
  assert.doesNotMatch(hook, /cue\(['"]success['"]\)/, 'ordinary cue(success) is gated off after setScene(false)');
  assert.match(hook, /seen\.current\s*=\s*\{\s*phase:\s*run\.phase/, 'the next render must remember the completed phase');
});

void test('hunt and disaster terminal transitions use the shared result player without a duplicate wrong cue', () => {
  const hunt = readFileSync('components/game/scene-hunt/player.tsx', 'utf8');
  const disaster = readFileSync('components/game/disaster/player.tsx', 'utf8');
  assert.match(hunt, /r\.phase === 'complete' && prev\.phase !== 'complete'\)\s*\{\s*sound\.current\?\.finish\(\)/);
  assert.match(disaster, /run\.phase === 'failed'\)\s*\{\s*linger\.current = 0;\s*s\?\.fail\(\)/);
  assert.match(disaster, /run\.phase === 'complete'\)\s*\{\s*linger\.current = 0;\s*s\?\.finish\(\)/);
  assert.match(disaster, /run\.phase !== 'failed' && run\.notice\.seq !== prev\.notice/, 'fatal mistakes must not play an ordinary wrong cue as well');
  assert.match(disaster, /if \(v\.paused \|\| \(v\.run\.phase !== 'failed' && v\.run\.phase !== 'complete'\)\)/, 'terminal playback must survive the next metering frame');
});
