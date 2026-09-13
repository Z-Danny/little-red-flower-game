import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
// Keep the original flood-window profile contract independent of new level rules.
import rules from './fixtures/flood-indoor-v1/level.json';
import skin from './fixtures/flood-indoor-v1/skins/paper-gouache.json';
import { createRun } from '../app/game/runtime/engine';
import { validatePackage } from '../app/game/runtime/validate';
import { defaultPracticeAudioSettings, PracticeAudioSession, synthesiseCue } from '../app/game/runtime/practice-audio';
import { floodAmbientMix, floodLoopSeconds, floodSound, synthesiseFloodLoop, usesFloodWindowProfile } from '../app/game/runtime/flood-sound';
import type { FloodLoop } from '../app/game/runtime/flood-sound';

const rms = (data: Float32Array) => Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
const digest = (data: Float32Array) => createHash('sha256').update(new Uint8Array(data.buffer)).digest('hex');
const loops = new Map<FloodLoop, Float32Array>();
for (const kind of ['flood-roar', 'rain-window'] as const) loops.set(kind, synthesiseFloodLoop(kind));

for (const kind of ['flood-roar', 'rain-window'] as const) test(`${kind}: repeatable finite PCM, bounded level, continuous loop boundary`, t => {
  const data = loops.get(kind)!;
  assert.equal(data.length, floodLoopSeconds[kind] * 22050);
  assert.equal(digest(data), digest(synthesiseFloodLoop(kind)));
  let peak = 0, sum = 0, deltaEnergy = 0;
  for (let i = 0; i < data.length; i++) {
    assert(Number.isFinite(data[i])); peak = Math.max(peak, Math.abs(data[i])); sum += data[i];
    if (i) deltaEnergy += (data[i] - data[i - 1]) ** 2;
  }
  assert(peak <= .720001); assert(rms(data) > .1); assert(Math.abs(sum / data.length) < 1e-6);
  // A seam must behave like ordinary adjacent waveform samples, without a silent gap.
  const wrapDelta = Math.abs(data[0] - data[data.length - 1]), typicalDelta = Math.sqrt(deltaEnergy / (data.length - 1));
  assert(wrapDelta < 6 * typicalDelta);
  const seamWindow = new Float32Array([...data.slice(-882), ...data.slice(0, 882)]);
  assert(rms(seamWindow) > rms(data) * .5); assert(rms(seamWindow) < rms(data) * 1.5);
  t.diagnostic(JSON.stringify({ kind, frames: data.length, rms: rms(data), peak, wrapDelta, typicalDelta, sha256: digest(data) }));
});

test('flood roar and window rain have independently identifiable frequency textures', () => {
  const texture = (data: Float32Array) => {
    let crossings = 0, changes = 0;
    for (let i = 1; i < data.length; i++) { if ((data[i] >= 0) !== (data[i - 1] >= 0)) crossings++; changes += (data[i] - data[i - 1]) ** 2; }
    return { crossingRate: crossings / data.length, changeEnergy: changes / data.length };
  };
  const flood = texture(loops.get('flood-roar')!), rain = texture(loops.get('rain-window')!);
  assert(rain.crossingRate > flood.crossingRate * 3);
  assert(rain.changeEnergy > flood.changeEnergy * 4);
  assert.notEqual(digest(loops.get('flood-roar')!), digest(loops.get('rain-window')!));
});

test('pressure increases both layers smoothly and shelter keeps the exterior storm audible', () => {
  for (const calm of [false, true]) {
    let previous = floodAmbientMix(0, calm);
    for (let i = 1; i <= 100; i++) {
      const next = floodAmbientMix(i / 100, calm);
      assert(next.flood >= previous.flood); assert(next.rain >= previous.rain);
      assert(next.flood - previous.flood < .006); assert(next.rain - previous.rain < .004);
      assert(next.flood <= 1.08); assert(next.rain <= .7); previous = next;
    }
  }
  const exposed = floodAmbientMix(.8, false), sheltered = floodAmbientMix(.8, true);
  assert(sheltered.flood < exposed.flood); assert(sheltered.rain < exposed.rain);
  assert(sheltered.flood > exposed.flood * .6); assert(sheltered.rain > exposed.rain * .8);
  assert.deepEqual(floodAmbientMix(-1, false), floodAmbientMix(0, false));
  assert.deepEqual(floodAmbientMix(3, false), floodAmbientMix(1, false));
  assert.deepEqual(floodAmbientMix(NaN, false), floodAmbientMix(0, false));
});

test('three action sounds have distinct finite PCM with faded endpoints, without changing generic cues', () => {
  const signatures = new Set<string>();
  for (const id of ['flood-surge', 'flood-water-impact', 'flood-high-step']) {
    const data = synthesiseCue(id); assert.deepEqual(data, floodSound(id));
    assert.equal(digest(data), digest(synthesiseCue(id))); signatures.add(digest(data));
    for (const value of data) { assert(Number.isFinite(value)); assert(Math.abs(value) <= .720001); }
    assert(rms(data) > .05); assert.equal(Math.abs(data[0]), 0); assert.equal(Math.abs(data[data.length - 1]), 0);
  }
  assert.equal(signatures.size, 3);
  for (const id of ['water-surge', 'footsteps', 'flood', 'voice', 'scream', 'telephone-connect', 'toString', 'constructor']) assert.equal(floodSound(id), null);
  assert(synthesiseCue('bottle-place').length > 0);
});

test('offline synthesis supports browser sample rates and rejects invalid allocations', () => {
  for (const sr of [8000, 44100, 48000]) {
    const data = synthesiseFloodLoop('rain-window', sr);
    assert.equal(data.length, 6 * sr); assert(rms(data) > .05);
  }
  for (const sr of [NaN, Infinity, 0, -1, 1e9, 22050.5]) {
    assert.throws(() => synthesiseFloodLoop('flood-roar', sr), RangeError);
    assert.throws(() => floodSound('flood-surge', sr), RangeError);
  }
});

class MockParam {
  value = 0;
  targets: number[] = [];
  cancelScheduledValues() {}
  setTargetAtTime(value: number) { this.value = value; this.targets.push(value); }
}
class MockNode {
  disconnected = false;
  connect(target: unknown) { return target; }
  disconnect() { this.disconnected = true; }
}
class MockGain extends MockNode { gain = new MockParam(); }
class MockSource extends MockNode {
  loop = false; buffer: { length: number } | null = null; frequency = new MockParam(); type = '';
  started = 0; stopped = 0; onended: (() => void) | null = null;
  start() { this.started++; }
  stop() { this.stopped++; }
}
class MockContext {
  currentTime = 0; state = 'suspended'; destination = new MockNode(); sources: MockSource[] = []; gains: MockGain[] = []; closes = 0;
  createGain() { const node = new MockGain(); this.gains.push(node); return node; }
  createBufferSource() { const node = new MockSource(); this.sources.push(node); return node; }
  createOscillator() { return this.createBufferSource(); }
  createBuffer(_channels: number, length: number, _sr: number) { const data = new Float32Array(length); return { length, getChannelData: () => data }; }
  createBiquadFilter() { return Object.assign(new MockNode(), { type: '', frequency: new MockParam(), Q: new MockParam() }); }
  createDynamicsCompressor() { return Object.assign(new MockNode(), { threshold: new MockParam(), knee: new MockParam(), ratio: new MockParam(), attack: new MockParam(), release: new MockParam() }); }
  createAnalyser() { return Object.assign(new MockNode(), { fftSize: 0, getFloatTimeDomainData: (data: Float32Array) => data.fill(.01) }); }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.closes++; this.state = 'closed'; }
}
function makePack(profile?: 'flood-window') {
  const pack = validatePackage(structuredClone(rules), structuredClone(skin));
  pack.skin.presentation!.audio!.ambientProfile = profile;
  return pack;
}

test('profile gate preserves generic ambience, while opt-in adds exactly two weather loops and existing music', async () => {
  for (const candidate of [undefined, null, 'flood', 'water', 'FLOOD-WINDOW', {}, true]) assert.equal(usesFloodWindowProfile(candidate), false);
  assert.equal(usesFloodWindowProfile('flood-window'), true);
  for (const profile of [undefined, 'flood-window'] as const) {
    const pack = makePack(profile), context = new MockContext();
    let contexts = 0;
    const session = new PracticeAudioSession(pack, () => { contexts++; return context as unknown as AudioContext; });
    assert.equal(session.status().state, 'locked'); assert.equal(contexts, 0);
    session.update(createRun(pack), true);
    await session.unlock(); await session.unlock();
    assert.equal(contexts, 1); assert.equal(session.status().loops, profile ? 3 : 2);
    const looping = context.sources.filter(source => source.loop);
    assert.equal(looping.length, profile ? 3 : 2);
    assert.equal(looping[0].buffer!.length, Math.ceil(8 * 60 / 76 * 22050));
    assert.deepEqual(looping.slice(1).map(source => source.buffer!.length), profile ? [8 * 22050, 6 * 22050] : [2 * 22050]);
    session.dispose(); assert(looping.every(source => source.stopped === 1));
  }
});

test('pause, hidden tab, mute, reset and disposal keep one set of loops and stop one-shots', async () => {
  const pack = makePack('flood-window'), context = new MockContext(), run = createRun(pack);
  const session = new PracticeAudioSession(pack, () => context as unknown as AudioContext);
  session.update(run, true); await session.unlock();
  session.play('flood-water-impact'); assert(session.status().sfx > 0);
  session.update(run, false); assert.equal(context.state, 'suspended'); assert.equal(session.status().sfx, 0); assert.equal(context.gains[0].gain.value, 0);
  session.update(run, true); await Promise.resolve(); await Promise.resolve();
  assert.equal(context.state, 'running'); assert.equal(session.status().loops, 3);
  session.setHidden(true); assert.equal(context.state, 'suspended'); assert.equal(session.status().rms, 0);
  session.setHidden(false); await Promise.resolve(); await Promise.resolve();
  assert.equal(context.state, 'running');
  session.setSettings({ ...defaultPracticeAudioSettings, muted: true });
  assert.equal(context.gains[0].gain.value, 0); const played = session.status().played;
  session.play('flood-surge'); assert.equal(session.status().played, played);
  session.setSettings(defaultPracticeAudioSettings); assert(context.gains[0].gain.value > 0);
  session.reset(); session.update(run, true); await session.unlock();
  assert.equal(session.status().loops, 3); assert.equal(context.sources.filter(source => source.loop).length, 3);
  session.dispose(); session.dispose(); assert.equal(context.closes, 1); assert.equal(session.status().state, 'closed');
  assert.equal(session.status().loops, 0); assert.equal(session.status().sfx, 0);
  assert(context.sources.every(source => source.stopped === 1 && source.disconnected));
  assert(context.gains.every(gain => gain.disconnected));
  await session.unlock(); assert.equal(context.sources.filter(source => source.loop).length, 3);
});
