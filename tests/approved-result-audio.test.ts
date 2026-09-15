import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { approvedSoundDuration, approvedSoundSamples } from '../app/game/audio/result-samples';
import { PracticeAudioSession, defaultPracticeAudioSettings } from '../app/game/runtime/practice-audio';
import { legacyResponseAudioPack, createLegacyResponseAudioSession, legacyAudioSettings } from '../app/game/runtime/legacy-response-audio';
import { createRun, reduceRun } from '../app/game/runtime/engine';
import { configuredAudioFrame } from '../app/game/runtime/response';
import { validatePackage } from '../app/game/runtime/validate';
import type { LevelPackage, Run } from '../app/game/runtime/schema';
import { ResponseAudio, defaultAudioSettings } from '../app/game/response/audio';
import { kitchen50sCues, type AudioFrame } from '../app/game/response/audio-cues';
import { createRun as createKitchen, reduceRun as reduceKitchen, controlled, type Run as KitchenRun } from '../app/game/kitchen/model';
import { kitchenPressure } from '../app/game/kitchen/experience';

// No native output is created: these fixtures record actual engine sources,
// exact copied PCM and the connected gain graph, including cancellation.
class Param { value = 0; cancelScheduledValues() {} setTargetAtTime(v: number) { this.value = v; } }
class Node {
  output: Node | null = null; disconnected = false;
  connect(target: Node) { this.output = target; return target; }
  disconnect() { this.disconnected = true; this.output = null; }
}
class Gain extends Node { gain = new Param(); }
class Buffer {
  numberOfChannels = 1; data: Float32Array;
  constructor(readonly length: number, readonly sampleRate: number) { this.data = new Float32Array(length); }
  getChannelData() { return this.data; }
}
class Source extends Node {
  buffer: Buffer | null = null; loop = false; starts = 0; stops = 0; playbackRate = new Param(); frequency = new Param(); type = '';
  onended: (() => void) | null = null;
  start() { this.starts++; } stop() { this.stops++; this.onended?.(); }
}
class Context {
  currentTime = 10; state = 'suspended'; destination = new Node(); sources: Source[] = []; gains: Gain[] = []; closes = 0;
  createGain() { const g = new Gain(); this.gains.push(g); return g; }
  createBufferSource() { const s = new Source(); this.sources.push(s); return s; }
  createOscillator() { return this.createBufferSource(); }
  createBuffer(_channels: number, length: number, sr: number) { return new Buffer(length, sr); }
  createBiquadFilter() { return Object.assign(new Node(), { frequency: new Param(), Q: new Param(), type: '' }); }
  createDynamicsCompressor() { return Object.assign(new Node(), { threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }); }
  createWaveShaper() { return Object.assign(new Node(), { curve: null, oversample: '' }); }
  createAnalyser() { return Object.assign(new Node(), { fftSize: 0, getFloatTimeDomainData: (data: Float32Array) => data.fill(.01) }); }
  async decodeAudioData() { return new Buffer(64, 22050); }
  async resume() { this.state = 'running'; } async suspend() { this.state = 'suspended'; } async close() { this.state = 'closed'; this.closes++; }
}
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
function packFor(id: string): LevelPackage {
  const base = `content/levels/${id}`, names = readdirSync(`${base}/skins`);
  const name = names.includes('paper-gouache.json') ? 'paper-gouache.json' : names.includes('paperbook.json') ? 'paperbook.json' : 'illustrated.json';
  return validatePackage(json(`${base}/level.json`), json(`${base}/skins/${name}`));
}
const ids = ['car-window-practice', 'collapse-signal-practice', 'fire-shelter-practice', 'fire-stairs-practice', 'flood-highground-practice', 'lift-contact-practice', 'quake-cover-practice', 'quake-exit-practice', 'lift-wait', 'well-call'];
const plainPack = packFor('fire-stairs-practice');
const flush = async () => { for (let n = 0; n < 5; n++) await Promise.resolve(); };
function resultSources(c: Context, kind?: 'victory' | 'failure') {
  return c.sources.filter(s => !s.loop && s.buffer?.sampleRate === 44100 && (!kind || s.buffer.length === approvedSoundSamples(kind).length));
}
function assertResult(s: Source, kind: 'victory' | 'failure', gain = 1) {
  assert.equal(s.starts, 1); assert.equal(s.loop, false);
  assert.equal(s.buffer!.length / s.buffer!.sampleRate, approvedSoundDuration(kind));
  assert.deepEqual(s.buffer!.data, approvedSoundSamples(kind), 'approved PCM is copied exactly, without Foley normalization');
  const sourceGain = s.output as Gain, resultBus = sourceGain.output as Gain;
  assert.equal(sourceGain.gain.value, 1); assert.equal(resultBus.gain.value, gain);
  assert.ok(resultBus.output && 'curve' in resultBus.output, 'result routes directly to the final peak guard');
}
function practice(t: TestContext, pack = plainPack) {
  const c = new Context(), a = new PracticeAudioSession(pack, () => c as unknown as AudioContext);
  t.after(() => a.dispose()); return { a, c };
}
function response(t: TestContext) {
  const c = new Context(), originalContext = globalThis.AudioContext, originalFetch = globalThis.fetch;
  globalThis.AudioContext = class { constructor() { return c; } } as unknown as typeof AudioContext;
  globalThis.fetch = async () => new Response(new ArrayBuffer(8), { status: 200 });
  const a = new ResponseAudio(kitchen50sCues);
  t.after(() => { a.dispose(); globalThis.AudioContext = originalContext; globalThis.fetch = originalFetch; });
  return { a, c };
}
const frame: AudioFrame = { elapsed: 1000, active: true, result: null, paused: false, intensity: .6, flame: 1, smoke: .4, resolved: false, tier: 1, milestones: [] };
const win: AudioFrame = { ...frame, active: false, result: 'victory', resolved: true, milestones: ['evacuated'] };

for (const id of ids) test(`${id}: real completion phase plays approved victory exactly once and silences beds`, async t => {
  const pack = packFor(id), legacy = legacyResponseAudioPack(pack), c = new Context();
  const a = legacy ? createLegacyResponseAudioSession(pack, () => c as unknown as AudioContext)! : new PracticeAudioSession(pack, () => c as unknown as AudioContext);
  t.after(() => a.dispose()); if (legacy) a.setSettings(legacyAudioSettings);
  const initial = createRun(pack); a.update(initial, true); await a.unlock();
  // Completion is decided by the real state machine after its authored settle period.
  let run: Run = { ...initial, phase: 'settling', resolved: [...pack.rules.completion.requires] };
  for (let n = 0; n < 200 && run.phase !== 'complete'; n++) { run = reduceRun(pack, run, { type: 'tick', ms: 100 }); a.update(run, true); }
  assert.equal(run.phase, 'complete'); assert.equal(resultSources(c).length, 1); assertResult(resultSources(c)[0], 'victory');
  assert.equal(a.status().lastCue, 'victory'); assert.equal(a.status().sfx, 1);
  assert.equal(c.gains[0].gain.value, 0, 'normal master is silent while result bus plays');
  for (let i = 0; i < 10; i++) a.update(run, true);
  a.play('training-complete'); a.pickup(); assert.equal(resultSources(c).length, 1); assert.equal(a.status().sfx, 1);
});

test('actual fatal input uses failure PCM even when failure rule has a custom cue; early escape never celebrates', async t => {
  const { a, c } = practice(t), run = createRun(plainPack); a.update(run, true); await a.unlock();
  const rule = plainPack.rules.interactions.find(rule => rule.failure)!; assert.ok(rule, 'production fatal interaction');
  const failed = reduceRun(plainPack, run, { type: 'interact', input: { source: rule.source, mode: rule.mode, target: rule.target } });
  assert.equal(failed.phase, 'failed'); assert.equal(failed.failure?.rule, rule.id);
  a.update(failed, true); a.update({ ...failed, failure: { ...failed.failure!, age: 300 } }, true);
  assert.equal(resultSources(c).length, 1); assertResult(resultSources(c)[0], 'failure'); assert.equal(a.status().lastCue, 'failure');
  a.reset(); a.update(run, true); await flush();
  a.update({ ...run, phase: 'complete', escaped: true }, true);
  assert.equal(resultSources(c).length, 1); assert.equal(a.status().sfx, 0); assert.equal(c.state, 'suspended');
});

function kitchenFrame(run: KitchenRun): AudioFrame {
  return { ...kitchenPressure(run), elapsed: run.elapsed, active: run.phase !== 'briefing' && run.phase !== 'complete', paused: false,
    result: run.phase === 'complete' ? 'victory' : null,
    action: run.action ? { id: `${run.action.kind}:${Math.round(run.elapsed - run.action.age)}`, kind: run.action.kind, age: run.action.age, duration: run.action.duration } : undefined,
    milestones: [...(controlled(run) ? ['controlled'] : []), ...(run.evacuated ? ['evacuated'] : [])] };
}
test('kitchen full gas/lid/evacuate chain waits through settling, then plays victory with active=false and no character', async t => {
  const { a, c } = response(t); let run = reduceKitchen(createKitchen(), { type: 'start' });
  a.update(kitchenFrame(run)); await a.unlock();
  for (const [item, zone] of [['gas', 'off'], ['lid', 'pan'], ['person', 'exit']] as const) {
    run = reduceKitchen(run, { type: 'drop', item, zone, at: { x: 0, y: 0 }, from: { x: 0, y: 0 } });
    a.update(kitchenFrame(run));
    for (let i = 0; i < 30 && run.action; i++) { run = reduceKitchen(run, { type: 'tick', ms: 100 }); a.update(kitchenFrame(run)); }
    assert.notEqual(a.status().lastCue, 'success'); assert.equal(resultSources(c).length, 0);
  }
  assert.equal(run.evacuated, true); assert.equal(run.phase, 'settling');
  for (let i = 0; i < 40 && run.phase !== 'complete'; i++) { run = reduceKitchen(run, { type: 'tick', ms: 100 }); a.update(kitchenFrame(run)); }
  assert.equal(run.phase, 'complete'); assert.equal(kitchenFrame(run).active, false); assert.equal(a.status().state, 'running');
  assert.equal(resultSources(c).length, 1); assertResult(resultSources(c)[0], 'victory');
  assert.equal(a.status().characterPlays, 0); assert.equal(a.status().loops, 5); assert.equal(c.gains[0].gain.value, 0);
  for (const source of c.sources.filter(s => s.loop)) assert.equal((source.output as Gain).gain.value, 0);
  a.update(kitchenFrame(run)); a.play('success'); assert.equal(resultSources(c).length, 1); assert.equal(a.status().sfx, 1);
  const player = readFileSync('components/game/kitchen/kitchen-player.tsx', 'utf8');
  assert.match(player, /result:\s*ready\s*&&\s*run\.phase\s*===\s*'complete'\s*\?\s*'victory'\s*:\s*null,\s*paused/);
});

test('configured response adapter distinguishes complete/failure from resolved/escaped and carries explicit pause', () => {
  const pack = packFor('example-response'), run = createRun(pack);
  assert.equal(configuredAudioFrame(pack, { ...run, resolved: pack.rules.completion.requires }, true).result, null);
  assert.equal(configuredAudioFrame(pack, { ...run, phase: 'complete' }, true).result, 'victory');
  assert.equal(configuredAudioFrame(pack, { ...run, phase: 'complete', escaped: true }, true).result, null);
  assert.equal(configuredAudioFrame(pack, { ...run, phase: 'failed', failure: { rule: 'custom-rule', age: 0, duration: 500 } }, true).result, 'failure');
  assert.equal(configuredAudioFrame(pack, run, false).paused, true);
});

for (const engine of ['practice', 'response'] as const) {
  test(`${engine}: approved result honors SFX level without music/ambient or Foley gain`, async t => {
    if (engine === 'practice') {
      const { a, c } = practice(t); const run = createRun(plainPack); a.update(run, true); await a.unlock();
      a.setSettings({ ...defaultPracticeAudioSettings, sfx: defaultPracticeAudioSettings.sfx / 2, music: 0, ambient: 0 });
      a.update({ ...run, phase: 'complete' }, true); assertResult(resultSources(c)[0], 'victory', .5);
    } else {
      const { a, c } = response(t); a.update(frame); await a.unlock();
      a.setSettings({ ...defaultAudioSettings, sfx: defaultAudioSettings.sfx / 2, music: 0, ambience: 0 });
      a.update({ ...win, result: 'failure' }); assertResult(resultSources(c)[0], 'failure', .5);
    }
  });
  test(`${engine}: terminal deadline stops every one-shot and suspends beds even without onended`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const fixture = engine === 'practice' ? practice(t) : response(t), { a, c } = fixture;
    const update = (done: boolean) => engine === 'practice' ? (a as PracticeAudioSession).update({ ...createRun(plainPack), phase: done ? 'complete' : 'playing' }, true) : (a as ResponseAudio).update(done ? win : frame);
    update(false); await a.unlock(); update(true); const source = resultSources(c)[0];
    t.mock.timers.tick(1399); assert.equal(source.stops, 0); assert.equal(c.state, 'running');
    t.mock.timers.tick(1); assert.equal(source.stops, 1); assert.equal(source.disconnected, true); assert.equal(c.state, 'suspended'); assert.equal(a.status().sfx, 0);
    update(true); await a.unlock(); assert.equal(resultSources(c).length, 1); assert.equal(c.state, 'suspended');
    a.dispose(); a.dispose(); assert.equal(c.closes, 1); assert(c.sources.every(s => s.stops === 1));
  });
  for (const gate of ['mute', 'hidden', 'pause', 'zero'] as const) test(`${engine}: ${gate} consumes an unheard terminal and cancels a playing tail without replay`, async t => {
    const { a, c } = engine === 'practice' ? practice(t) : response(t);
    let done = false, paused = false;
    const update = () => engine === 'practice' ? (a as PracticeAudioSession).update({ ...createRun(plainPack), phase: done ? 'complete' : 'playing' }, !paused) : (a as ResponseAudio).update({ ...(done ? win : frame), paused });
    const block = (on: boolean) => {
      if (gate === 'hidden') a.setHidden(on);
      else if (gate === 'pause') { paused = on; update(); }
      else if (engine === 'practice') (a as PracticeAudioSession).setSettings({ ...defaultPracticeAudioSettings, muted: gate === 'mute' && on, sfx: gate === 'zero' && on ? 0 : defaultPracticeAudioSettings.sfx });
      else (a as ResponseAudio).setSettings({ ...defaultAudioSettings, muted: gate === 'mute' && on, sfx: gate === 'zero' && on ? 0 : defaultAudioSettings.sfx });
    };
    update(); await a.unlock(); block(true); done = true; update(); block(false); update(); await a.unlock();
    assert.equal(resultSources(c).length, 0, 'unheard terminal is consumed, never queued on restore');
    a.reset(); done = false; update(); await flush(); done = true; update();
    assert.equal(resultSources(c).length, 1); const source = resultSources(c)[0]; block(true);
    assert.equal(source.stops, 1); assert.equal(a.status().sfx, 0); assert.equal(c.state, 'suspended');
    block(false); update(); await a.unlock(); assert.equal(resultSources(c).length, 1); assert.equal(a.status().sfx, 0);
  });
  test(`${engine}: reset plus immediate unlock of stale completed frame cannot replay last result`, async t => {
    const { a, c } = engine === 'practice' ? practice(t) : response(t);
    const update = (done: boolean) => engine === 'practice' ? (a as PracticeAudioSession).update({ ...createRun(plainPack), phase: done ? 'complete' : 'playing' }, true) : (a as ResponseAudio).update(done ? win : frame);
    update(false); await a.unlock(); update(true); assert.equal(resultSources(c).length, 1);
    a.reset(); await a.unlock(); update(true); assert.equal(resultSources(c).length, 1);
    update(false); await flush(); update(true); assert.equal(resultSources(c).length, 2);
    assert.equal(a.status().sfx, 1); assert.equal(c.sources.filter(s => s.loop).length, a.status().loops);
  });
  test(`${engine}: locked terminal is consumed and disposal cancels every later unlock`, async t => {
    const { a, c } = engine === 'practice' ? practice(t) : response(t);
    if (engine === 'practice') (a as PracticeAudioSession).update({ ...createRun(plainPack), phase: 'complete' }, true);
    else (a as ResponseAudio).update(win);
    await a.unlock(); assert.equal(resultSources(c).length, 0); assert.equal(c.state, 'suspended');
    a.dispose(); const sources = c.sources.length; await a.unlock(); assert.equal(c.sources.length, sources); assert.equal(c.closes, 1);
  });
}
