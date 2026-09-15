import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import manifest from '../content/response/audio-manifest.json';
import { measureSfx, normaliseSfx, sfxGain } from '../app/game/audio/sfx-levels';
import { PracticeAudioSession, defaultPracticeAudioSettings, practiceSfxCalibrationGain, practiceSfxSamples, practiceSfxTarget, synthesiseCue } from '../app/game/runtime/practice-audio';
import { responseSfxSamples } from '../app/game/response/audio';
import { createRun } from '../app/game/runtime/engine';
import { validatePackage } from '../app/game/runtime/validate';

void test('active-block calibration excludes silent padding, preserves shape and reaches target without clipping', () => {
  const raw = Float32Array.from({ length: 22050 }, (_, i) => i < 2205 || i >= 6615 ? 0 : .02 * Math.sin(2 * Math.PI * 440 * i / 22050));
  const before = raw.slice(), gain = sfxGain(raw, { targetRms: .08 });
  const data = normaliseSfx(raw, { targetRms: .08 });
  assert.deepEqual(raw, before); assert(Math.abs(measureSfx(data).activeRms - .08) < 1e-6);
  assert(measureSfx(data).rms < measureSfx(data).activeRms * .5);
  for (let i = 0; i < raw.length; i++) assert(Math.abs(data[i] - raw[i] * gain) < 1e-7);
});
void test('silent, invalid, transient and maximum-gain inputs have explicit safe bounds', () => {
  assert.equal(sfxGain(new Float32Array(100), { targetRms: .08 }), 0);
  assert.equal(measureSfx(new Float32Array()).activeRms, 0);
  assert.throws(() => normaliseSfx(new Float32Array([NaN]), { targetRms: .08 }), RangeError);
  assert.throws(() => sfxGain(new Float32Array([1]), { targetRms: -1 }), RangeError);
  const impulse = new Float32Array(1000); impulse[20] = 1;
  assert(measureSfx(normaliseSfx(impulse, { targetRms: .5 })).peak <= .700001);
  assert(sfxGain(new Float32Array([.001, -.001]), { targetRms: .1, maxGainDb: 6 }) <= 10 ** .3);
});
void test('common practice SFX are consistent by category and preserve quieter returns versus completion', () => {
  for (const id of ['pickup', 'soft-tap', 'wood-tap', 'cloth-move', 'warning', 'invalid-return', 'telephone-connect', 'success']) {
    const result = measureSfx(practiceSfxSamples(id)); assert(Math.abs(result.activeRms - practiceSfxTarget(id)) < .00001, id);
    assert(result.peak <= .700001, id);
  }
  assert(measureSfx(practiceSfxSamples('invalid-return')).activeRms < measureSfx(practiceSfxSamples('success')).activeRms);
  for (const id of ['nonverbal-cough', 'heartbeat', 'fear-inhale']) assert.deepEqual(practiceSfxSamples(id), synthesiseCue(id));
});
void test('kitchen WAVs calibrate only the SFX bus; no character or continuous asset changes', () => {
  for (const [id, asset] of Object.entries(manifest.assets)) {
    const wave = readFileSync('public' + asset.src), samples = new Float32Array((wave.length - 44) / 2);
    for (let i = 0; i < samples.length; i++) samples[i] = wave.readInt16LE(44 + i * 2) / 32768;
    const result = responseSfxSamples(id, samples);
    if (asset.bus !== 'sfx') assert.equal(result, samples);
    else { const measured = measureSfx(result); assert(measured.activeRms >= .075, id); assert(measured.activeRms <= .111, id); assert(measured.peak <= .700001, id); }
  }
});

class Param { value = 0; cancelScheduledValues() {} setTargetAtTime(value: number) { this.value = value; } }
class Node { next: Node | null = null; connect(target: Node) { this.next = target; return target; } disconnect() { this.next = null; } }
class Gain extends Node { gain = new Param(); }
class Source extends Node { buffer: { getChannelData: (channel: number) => Float32Array } | null = null; loop = false; frequency = new Param(); type = ''; onended: (() => void) | null = null; start() {} stop() {} }
class Context {
  state = 'suspended'; currentTime = 0; destination = new Node(); sources: Source[] = [];
  createGain() { return new Gain(); }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
  createOscillator() { return this.createBufferSource(); }
  createBuffer(_channels: number, length: number) { const data = new Float32Array(length); return { getChannelData: () => data }; }
  createBiquadFilter() { return Object.assign(new Node(), { type: '', frequency: new Param(), Q: new Param() }); }
  createDynamicsCompressor() { return Object.assign(new Node(), { threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }); }
  createAnalyser() { return Object.assign(new Node(), { fftSize: 0, getFloatTimeDomainData: (data: Float32Array) => data.fill(0) }); }
  async resume() { this.state = 'running'; } async suspend() { this.state = 'suspended'; } async close() { this.state = 'closed'; }
}
void test('actual session graph calibrates normal and fire masters equally and preserves user volume, mute and character levels', async () => {
  for (const [id, reference] of [['lift-contact-practice', .22], ['fire-shelter-practice', .22], ['lift-contact-practice', .38]] as const) {
    const pack = validatePackage(JSON.parse(readFileSync(`content/levels/${id}/level.json`, 'utf8')), JSON.parse(readFileSync(`content/levels/${id}/skins/paper-gouache.json`, 'utf8')));
    const context = new Context(), session = new PracticeAudioSession(pack, () => context as unknown as AudioContext, { referenceSfx: reference });
    const settings = { ...defaultPracticeAudioSettings, sfx: reference };
    session.setSettings(settings); session.update(createRun(pack), true); await session.unlock(); session.play('pickup');
    const source = context.sources.at(-1)!;
    const gain = () => { let value = 1; for (let n: Node | null = source; n; n = n.next) if (n instanceof Gain) value *= n.gain.value; return value; };
    assert(Math.abs(gain() - practiceSfxCalibrationGain) < 1e-9, id);
    assert(Math.abs(measureSfx(source.buffer!.getChannelData(0)).activeRms - .065) < 1e-6);
    session.setSettings({ ...settings, sfx: reference / 2 }); assert(Math.abs(gain() - practiceSfxCalibrationGain / 2) < 1e-9);
    session.setSettings({ ...settings, sfx: 0 }); assert.equal(gain(), 0);
    session.setSettings(settings); session.play('nonverbal-cough');
    const character = context.sources.at(-1)!; let characterGain = 1;
    for (let n: Node | null = character; n; n = n.next) if (n instanceof Gain) characterGain *= n.gain.value;
    assert(Math.abs(characterGain - (id === 'fire-shelter-practice' ? .65 : .35) * reference) < 1e-9);
    session.setSettings({ ...settings, muted: true }); assert.equal(session.status().sfx, 0);
    session.dispose(); assert.equal(context.state, 'closed');
  }
});
