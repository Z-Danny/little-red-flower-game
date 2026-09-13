import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { floodSound, synthesiseFloodLoop } from '../app/game/runtime/flood-sound';
import { synthesiseCue } from '../app/game/runtime/practice-audio';

const expected = { 'flood-alert': 1.5, 'flood-message-sent': .42, 'flood-power-off': .42, 'flood-pack-zip': .85 };
const digest = (data: Float32Array) => createHash('sha256').update(new Uint8Array(data.buffer)).digest('hex');
function stats(data: Float32Array) {
  let sum = 0, energy = 0, peak = 0;
  for (const value of data) { assert(Number.isFinite(value)); sum += value; energy += value * value; peak = Math.max(peak, Math.abs(value)); }
  return { rms: Math.sqrt(energy / data.length), peak, dc: sum / data.length };
}
const segmentRms = (data: Float32Array, from: number, to: number, sr = 22050) => stats(data.slice(Math.round(from * sr), Math.round(to * sr))).rms;

for (const [id, seconds] of Object.entries(expected)) test(`${id}: deterministic offline PCM, exact duration, DC removed, peak limited, soft endpoints`, t => {
  const data = floodSound(id)!; assert(data); assert.equal(data.length, Math.ceil(seconds * 22050));
  assert.deepEqual(synthesiseCue(id), data); assert.equal(digest(data), digest(floodSound(id)!));
  const metrics = stats(data);
  assert(metrics.rms > .035 && metrics.rms <= .18); assert(metrics.peak <= .710001); assert(Math.abs(metrics.dc) < 1e-7);
  assert.equal(Math.abs(data[0]), 0); assert.equal(Math.abs(data[data.length - 1]), 0);
  assert(Math.abs(data[1] - data[0]) < .001); assert(Math.abs(data[data.length - 2] - data[data.length - 1]) < .001);
  assert(segmentRms(data, 0, .003) < metrics.rms * .08);
  assert(segmentRms(data, seconds - .003, seconds) < metrics.rms * .08);
  t.diagnostic(JSON.stringify({ id, seconds, sampleRate: 22050, ...metrics, sha256: digest(data) }));
});

test('alarm is three discrete beeps and the message acknowledgement is short and distinct from completion', () => {
  const alarm = floodSound('flood-alert')!, message = floodSound('flood-message-sent')!;
  for (const [from, to] of [[.1, .28], [.54, .72], [.98, 1.16]]) assert(segmentRms(alarm, from, to) > .15);
  for (const [from, to] of [[.37, .47], [.81, .91], [1.28, 1.4]]) assert(segmentRms(alarm, from, to) < .001);
  assert(segmentRms(message, .05, .12) > .1); assert(segmentRms(message, .15, .18) < .001);
  assert(segmentRms(message, .22, .28) > .08); assert(message.length < synthesiseCue('training-complete').length);
  assert.notEqual(digest(message), digest(synthesiseCue('training-complete')));
  assert.equal(new Set(Object.keys(expected).map(id => digest(floodSound(id)!))).size, 4);
});

test('mechanical power-off has two contacts and the bag has sustained friction followed by zipper texture', () => {
  const power = floodSound('flood-power-off')!, pack = floodSound('flood-pack-zip')!;
  assert(segmentRms(power, .04, .10) > .1); assert(segmentRms(power, .18, .24) > .05);
  assert(segmentRms(power, .36, .40) < .002);
  assert(segmentRms(pack, .1, .25) > .05); assert(segmentRms(pack, .44, .66) > .05);
});

test('new sounds remain bounded at supported sample rates and cannot create voice or unknown IDs', () => {
  for (const sr of [8000, 44100, 48000]) for (const [id, seconds] of Object.entries(expected)) {
    const data = floodSound(id, sr)!; assert.equal(data.length, Math.ceil(seconds * sr));
    const metrics = stats(data); assert(metrics.peak <= .710001); assert(Math.abs(metrics.dc) < 1e-7);
  }
  for (const sr of [NaN, Infinity, -1, 0, 1e9, 22050.5]) for (const id of Object.keys(expected)) assert.throws(() => floodSound(id, sr), RangeError);
  for (const id of ['voice', 'speech', 'scream', 'tts', 'flood-voice', 'flood-scream', 'constructor', 'toString', 'missing']) assert.equal(floodSound(id), null);
});

test('existing flood and rain loop buffers are byte-for-byte unchanged', () => {
  assert.equal(digest(synthesiseFloodLoop('flood-roar')), 'e4d67c3532a01fe384b148ec4bcfe9d1876ab5348adf44e06e723af8a3948682');
  assert.equal(digest(synthesiseFloodLoop('rain-window')), 'bb0b5203c5acdb8a7c6121d5e48a5a138d81f900430879c3bf3a751552f54929');
});
