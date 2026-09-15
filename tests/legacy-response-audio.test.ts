import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import liftRules from '../content/levels/lift-wait/level.json';
import liftSkin from '../content/levels/lift-wait/skins/paperbook.json';
import wellRules from '../content/levels/well-call/level.json';
import wellSkin from '../content/levels/well-call/skins/paperbook.json';
import kitRules from '../content/levels/flood-kit/level.json';
import kitSkin from '../content/levels/flood-kit/skins/paperbook.json';
import corridorRules from '../content/levels/clear-corridor/level.json';
import corridorSkin from '../content/levels/clear-corridor/skins/paperbook.json';
import { createRun, reduceRun } from '../app/game/runtime/engine';
import { validatePackage } from '../app/game/runtime/validate';
import { PracticeCueTimeline, PracticeAudioSession } from '../app/game/runtime/practice-audio';
import { createLegacyResponseAudioSession, legacyAudioSettings, legacyMusicBeats, legacyMusicBpm, legacyResponseAudioPack, synthesiseLegacyMusic } from '../app/game/runtime/legacy-response-audio';
import { CollectionCueTimeline } from '../app/game/scene-hunt/collection-cues';
import type { Input, LevelPackage, Run } from '../app/game/runtime/schema';

const packs = [validatePackage(liftRules, liftSkin), validatePackage(wellRules, wellSkin)];
const digest = (data: Float32Array) => createHash('sha256').update(new Uint8Array(data.buffer)).digest('hex');
void test('audio adaptation preserves the exact rules and skin, and gates unrelated engines', () => {
  for (const pack of packs) {
    const before = JSON.stringify(pack), adapted = legacyResponseAudioPack(pack)!;
    assert.equal(adapted.rules, pack.rules); assert.equal(adapted.skin.poses, pack.skin.poses);
    assert.equal(adapted.skin.animations, pack.skin.animations); assert.equal(adapted.skin.presentation!.effects.length, 0);
    assert.equal(pack.skin.presentation, undefined); assert.equal(JSON.stringify(pack), before);
    assert.equal(legacyResponseAudioPack(adapted), null);
    assert.equal(legacyResponseAudioPack({ ...pack, rules: { ...pack.rules, id: 'unknown' } }), null);
    assert.equal(legacyResponseAudioPack({ ...pack, rules: { ...pack.rules, id: 'toString' } }), null);
  }
});
void test('138 BPM backing has deterministic finite PCM, bounded peaks and a continuous loop seam', () => {
  for (const rate of [8000, 22050, 48000]) {
    const samples = synthesiseLegacyMusic(rate);
    assert.equal(samples.length, Math.round(legacyMusicBeats * 60 / legacyMusicBpm * rate));
    assert.equal(digest(samples), digest(synthesiseLegacyMusic(rate)));
    let energy = 0, delta = 0, peak = 0;
    for (let i = 0; i < samples.length; i++) {
      assert(Number.isFinite(samples[i])); energy += samples[i] ** 2; peak = Math.max(peak, Math.abs(samples[i]));
      if (i) delta += (samples[i] - samples[i - 1]) ** 2;
    }
    assert(peak < .7); assert(Math.sqrt(energy / samples.length) > .035);
    assert(Math.abs(samples[0] - samples.at(-1)!) < Math.sqrt(delta / (samples.length - 1)) * 6);
  }
  for (const invalid of [0, NaN, Infinity, 1e9, 22050.5]) assert.throws(() => synthesiseLegacyMusic(invalid), RangeError);
});

function act(pack: LevelPackage, timeline: PracticeCueTimeline, state: Run, input: Input) {
  let run = reduceRun(pack, state, { type: 'interact', input });
  const cues = timeline.advance(run);
  for (let n = 0; n < 30 && run.action; n++) {
    run = reduceRun(pack, run, { type: 'tick', ms: 100 });
    cues.push(...timeline.advance(run));
    assert.deepEqual(timeline.advance(run), []);
  }
  return { run, cues };
}
for (const pack of packs) void test(`${pack.rules.id}: real interactions produce one action cue, goals, recoverable danger and completion`, () => {
  const adapted = legacyResponseAudioPack(pack)!, timeline = new PracticeCueTimeline(adapted);
  let run = createRun(pack); assert.equal(timeline.advance(run).length, 1);
  const wrong = pack.rules.interactions.find(rule => rule.outcome === 'danger')!;
  const mistake = act(pack, timeline, run, { source: wrong.source, mode: wrong.mode, target: wrong.target });
  assert.equal(mistake.run.phase, 'playing'); assert.equal(mistake.run.mistakes, 1);
  assert.equal(mistake.cues.filter(cue => cue.event === 'danger').length, 1);
  assert.equal(mistake.cues.filter(cue => cue.event === wrong.id).length, 1); run = mistake.run;
  const bounce = act(pack, timeline, run, { source: 'person', mode: 'drop', target: 'nowhere' });
  assert.equal(bounce.cues.filter(cue => cue.id === 'invalid-return').length, 1); run = bounce.run;
  for (const rule of pack.rules.interactions.filter(rule => rule.outcome === 'correct')) {
    const result = act(pack, timeline, run, { source: rule.source, mode: rule.mode, target: rule.target });
    assert.equal(result.cues.filter(cue => cue.event === rule.id).length, 1);
    assert.equal(result.cues.filter(cue => cue.event === 'goal').length, 1); run = result.run;
  }
  assert.equal(run.phase, 'settling'); const ending = [];
  for (let n = 0; n < 30 && run.phase !== 'complete'; n++) { run = reduceRun(pack, run, { type: 'tick', ms: 100 }); ending.push(...timeline.advance(run)); }
  assert.equal(run.phase, 'complete'); assert.equal(ending.filter(cue => cue.id === 'training-complete').length, 1);
  assert.deepEqual(timeline.advance(run), []); timeline.reset(); assert.equal(timeline.advance(createRun(pack)).length, 1);
});

class Param { value = 0; cancelScheduledValues() {} setTargetAtTime(value: number) { this.value = value; } }
class Node { disconnected = false; connect(target: unknown) { return target; } disconnect() { this.disconnected = true; } }
class Gain extends Node { gain = new Param(); }
class Source extends Node {
  loop = false; buffer: { length: number; getChannelData: () => Float32Array } | null = null; frequency = new Param(); type = '';
  starts = 0; stops = 0; onended: (() => void) | null = null;
  start() { this.starts++; } stop() { this.stops++; }
}
class Context {
  currentTime = 0; state = 'suspended'; destination = new Node(); sources: Source[] = []; gains: Gain[] = []; closes = 0;
  createGain() { const node = new Gain(); this.gains.push(node); return node; }
  createBufferSource() { const node = new Source(); this.sources.push(node); return node; }
  createOscillator() { return this.createBufferSource(); }
  createBuffer(_channels: number, length: number) { const data = new Float32Array(length); return { length, getChannelData: () => data }; }
  createBiquadFilter() { return Object.assign(new Node(), { type: '', frequency: new Param(), Q: new Param() }); }
  createDynamicsCompressor() { return Object.assign(new Node(), { threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }); }
  createAnalyser() { return Object.assign(new Node(), { fftSize: 0, getFloatTimeDomainData: (data: Float32Array) => data.fill(.01) }); }
  async resume() { this.state = 'running'; } async suspend() { this.state = 'suspended'; } async close() { this.closes++; this.state = 'closed'; }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
void test('optional backing preserves ordinary engine music, reuses one context and disposes every source', async () => {
  for (const pack of packs) {
    const context = new Context(); let created = 0;
    const session = createLegacyResponseAudioSession(pack, () => { created++; return context as unknown as AudioContext; })!;
    const run = createRun(pack); session.update(run, true); assert.equal(created, 0);
    await session.unlock(); await session.unlock(); assert.equal(created, 1);
    const loopCount = pack.rules.id === 'lift-wait' ? 3 : 2;
    assert.equal(session.status().loops, loopCount);
    assert.equal(context.sources[0].buffer!.length, synthesiseLegacyMusic().length);
    session.dispose(); session.dispose(); assert.equal(context.closes, 1); assert.equal(session.status().loops, 0);
    assert(context.sources.every(source => source.stops === 1 && source.disconnected));
    await session.unlock(); assert.equal(created, 1);
    const oldContext = new Context(), ordinary = new PracticeAudioSession(legacyResponseAudioPack(pack)!, () => oldContext as unknown as AudioContext);
    ordinary.update(run, true); await ordinary.unlock();
    assert.equal(oldContext.sources[0].buffer!.length, Math.ceil(8 * 60 / (pack.rules.id === 'lift-wait' ? 60 : 74) * 22050));
    ordinary.dispose();
  }
});
void test('pause/hidden/mute suspend output and clear voices; unmute skips old cues; reset never duplicates loops', async () => {
  const pack = packs[0], context = new Context(), session = createLegacyResponseAudioSession(pack, () => context as unknown as AudioContext)!;
  const run = createRun(pack); session.setSettings(legacyAudioSettings); session.update(run, true); await session.unlock();
  session.pickup(); const played = session.status().played;
  session.pickup(); assert.equal(session.status().played, played);
  session.update(run, false); assert.equal(context.state, 'suspended'); assert.equal(session.status().sfx, 0);
  session.update(run, true); await flush(); assert.equal(context.state, 'running');
  session.setHidden(true); assert.equal(context.state, 'suspended'); assert.equal(session.status().rms, 0);
  session.setHidden(false); await flush(); assert.equal(context.state, 'running');
  session.setSettings({ ...legacyAudioSettings, muted: true }); assert.equal(context.state, 'suspended');
  const call = reduceRun(pack, run, { type: 'interact', input: { source: 'bell', mode: 'tap' } });
  session.update({ ...call, elapsed: 500, action: { ...call.action!, age: 500 } }, true);
  const mutedPlayed = session.status().played;
  session.setSettings(legacyAudioSettings); await flush(); assert.equal(session.status().played, mutedPlayed);
  assert.equal(context.state, 'running'); assert.equal(session.status().loops, 3);
  session.reset(); session.update(run, true); assert.equal(session.status().played, 1); assert.equal(session.status().loops, 3);
  for (let n = 0; n < 20; n++) session.play('object-pickup'); assert(session.status().sfx <= 5);
  const before = session.status().played; session.play('voice-forbidden'); assert.equal(session.status().played, before);
  session.dispose(); assert.equal(context.closes, 1); assert.equal(session.status().sfx, 0);
});
void test('muting before entry creates no audio context', async () => {
  let created = 0;
  const session = createLegacyResponseAudioSession(packs[0], () => { created++; return new Context() as unknown as AudioContext; })!;
  session.setSettings({ ...legacyAudioSettings, muted: true }); session.update(createRun(packs[0]), true); await session.unlock();
  assert.equal(created, 0); session.dispose();
});
void test('collection returns sound once per invalid action and never label a correct drop as wrong', () => {
  const timeline = new CollectionCueTimeline(), run = createRun(packs[0]);
  const rules = packs[0].rules.interactions;
  assert.equal(timeline.advance(run, rules), null);
  const bounce: Run = { ...run, action: { rule: null, source: 'person', age: 0, duration: 450 } };
  assert.equal(timeline.advance(bounce, rules), 'invalid-return');
  for (const ms of [0, 100, 200, 300]) assert.equal(timeline.advance({ ...bounce, elapsed: ms, action: { ...bounce.action!, age: ms } }, rules), null);
  assert.equal(timeline.advance({ ...run, elapsed: 450 }, rules), null);
  assert.equal(timeline.advance({ ...bounce, elapsed: 450 }, rules), 'invalid-return');
  assert.equal(timeline.advance({ ...bounce, elapsed: 1000, action: { ...bounce.action!, rule: 'wait' } }, rules), null);
  assert.equal(timeline.advance({ ...bounce, elapsed: 1500, action: { ...bounce.action!, rule: 'pry' } }, rules), null);
  timeline.reset(); assert.equal(timeline.advance(bounce, rules), 'invalid-return');
});

for (const pack of [validatePackage(kitRules, kitSkin), validatePackage(corridorRules, corridorSkin)]) {
  void test(`${pack.rules.id}: every real tap collection gets one pickup; busy, disabled and rejected inputs stay silent`, () => {
    const timeline = new CollectionCueTimeline(), rules = pack.rules.interactions;
    let run = createRun(pack), pickups = 0, completedGoals = 0;
    assert(pack.rules.objects.every(object => object.input === 'tap'));
    for (const rule of rules) {
      assert.equal(rule.outcome, 'correct'); assert.equal(rule.mode, 'tap');
      // Both canvas taps and keyboard buttons dispatch this same engine input.
      const input: Input = { source: rule.source, mode: 'tap' };
      const invalid = reduceRun(pack, run, { type: 'interact', input: { ...input, mode: 'drop' } });
      assert.equal(invalid, run); assert.equal(timeline.advance(invalid, rules), null);
      assert.equal(timeline.advance(reduceRun(pack, run, { type: 'interact', input: { source: 'missing-object', mode: 'tap' } }), rules), null);
      run = reduceRun(pack, run, { type: 'interact', input });
      assert.equal(run.action?.rule, rule.id); assert.equal(timeline.advance(run, rules), 'pickup'); pickups++;
      assert.equal(run.resolved.length, completedGoals, 'pickup must precede collection confirmation');
      const busy = reduceRun(pack, run, { type: 'interact', input });
      assert.equal(busy, run); assert.equal(timeline.advance(busy, rules), null);
      const nextObject = rules.find(other => other.id !== rule.id)!;
      assert.equal(timeline.advance(reduceRun(pack, run, { type: 'interact', input: { source: nextObject.source, mode: 'tap' } }), rules), null);
      while (run.action) {
        run = reduceRun(pack, run, { type: 'tick', ms: 100 });
        assert.equal(timeline.advance(run, rules), null, 'animation ticks and goal commit cannot duplicate pickup');
      }
      completedGoals += rule.grants.length;
      assert.equal(run.resolved.length, completedGoals);
      const repeated = reduceRun(pack, run, { type: 'interact', input });
      assert.equal(repeated, run); assert.equal(timeline.advance(repeated, rules), null);
    }
    assert.equal(pickups, pack.rules.objects.length); assert.equal(run.phase, 'settling');
    timeline.reset(); run = createRun(pack);
    run = reduceRun(pack, run, { type: 'interact', input: { source: rules[0].source, mode: 'tap' } });
    assert.equal(timeline.advance(run, rules), 'pickup');
  });
}
