import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import approved from '../content/audio/approved-results.json';
import archive from '../art-source/settlement-audio-v1/manifest.json';
import { approvedSoundDuration, approvedSoundSamples, type ApprovedSound } from '../app/game/audio/result-samples';
import { measureSfx } from '../app/game/audio/sfx-levels';

const kinds: ApprovedSound[] = ['victory', 'failure', 'button'];
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function pcmFromWave(path: string) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  let sampleRate = 0;
  let data: Buffer | undefined;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    assert(offset + 8 + size <= bytes.length);
    if (type === 'fmt ') {
      assert.equal(bytes.readUInt16LE(offset + 8), 1, 'uncompressed integer PCM');
      assert.equal(bytes.readUInt16LE(offset + 10), 1, 'mono');
      sampleRate = bytes.readUInt32LE(offset + 12);
      assert.equal(bytes.readUInt16LE(offset + 22), 16);
    }
    if (type === 'data') data = bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size & 1);
  }
  assert(data && data.length > 0);
  assert.equal(data.length % 2, 0);
  return { bytes, data, sampleRate };
}

void test('all approved samples preserve the exact archived PCM16 and WAV fingerprints', () => {
  for (const kind of kinds) {
    const entry = archive.sounds.find(sound => sound.kind === kind)!;
    const wave = pcmFromWave(entry.approved.path);
    const meta = approved.sounds[kind];
    const embedded = Buffer.from(meta.pcmBase64, 'base64');
    const samples = approvedSoundSamples(kind);
    assert.equal(sha256(wave.bytes), entry.approved.sha256, kind);
    assert.equal(sha256(wave.bytes), meta.approvedWavSha256, kind);
    assert.deepEqual(embedded, wave.data, `${kind}: no post-approval processing`);
    assert.equal(sha256(embedded), meta.pcmSha256, kind);
    assert.equal(wave.sampleRate, meta.sampleRate);
    assert.equal(samples.length, wave.data.length / 2);
    for (let i = 0; i < samples.length; i++) assert.equal(samples[i], wave.data.readInt16LE(i * 2) / 32768, `${kind} frame ${i}`);
  }
});

void test('single-shot durations match the approved choices, with no repeated preview or padding', () => {
  const frames = { victory: 42399, failure: 52755, button: 1524 };
  for (const kind of kinds) {
    assert.equal(approvedSoundDuration(kind), frames[kind] / 44100);
    assert.equal(approvedSoundSamples(kind).length, frames[kind]);
  }
});

void test('native and resampled caches reuse arrays without changing the source PCM', () => {
  for (const kind of kinds) {
    const native = approvedSoundSamples(kind);
    const snapshot = native.slice();
    assert.equal(approvedSoundSamples(kind, 44100), native);
    const resampled = approvedSoundSamples(kind, 48000);
    assert.equal(approvedSoundSamples(kind, 48000), resampled);
    assert.notEqual(resampled, native);
    assert.deepEqual(native, snapshot);
  }
});

void test('linear resampling handles lower, higher, and fractional-ratio rates with bounded duration and amplitude', () => {
  for (const kind of kinds) {
    const native = approvedSoundSamples(kind);
    const sourcePeak = measureSfx(native, 44100).peak;
    for (const rate of [8000, 22050, 48000, 96000]) {
      const samples = approvedSoundSamples(kind, rate);
      assert.equal(samples.length, Math.round(native.length * rate / 44100));
      assert(Math.abs(samples.length / rate - approvedSoundDuration(kind)) <= .5 / rate + 1e-12);
      for (let i = 0; i < samples.length; i++) {
        const position = i * 44100 / rate;
        const left = Math.min(Math.floor(position), native.length - 1);
        const right = Math.min(left + 1, native.length - 1);
        const expected = native[left] + (native[right] - native[left]) * (position - left);
        assert(Math.abs(samples[i] - expected) <= 3e-8, `${kind}/${rate}/${i}`);
        assert(Number.isFinite(samples[i]));
        assert(Math.abs(samples[i]) <= sourcePeak + 1e-7);
      }
    }
  }
});

void test('approved playback has nonempty audible signal, retains the approved levels and has headroom', () => {
  for (const kind of kinds) {
    const result = measureSfx(approvedSoundSamples(kind), 44100);
    assert(result.peak > .1 && result.peak <= .65, kind);
    if (kind === 'button') assert(result.activeRms > .085 && result.activeRms < .105);
    else assert(result.activeRms > .11 && result.activeRms < .15);
  }
});

void test('source evidence names and verifies the actual public Kenney assets and licenses', () => {
  const originals = { victory: 'jingles_SAX02.ogg', failure: 'jingles_SAX07.ogg', button: 'click_001.ogg' };
  for (const kind of kinds) {
    const entry = archive.sounds.find(sound => sound.kind === kind)!;
    assert(entry.original.path.endsWith('/' + originals[kind]));
    assert.equal(sha256(readFileSync(entry.original.path)), entry.original.sha256);
    assert.equal(readFileSync(entry.original.path).length, entry.original.bytes);
  }
  for (const source of Object.values(archive.packages)) {
    assert.equal(source.author, 'Kenney');
    assert.equal(source.license, 'CC0 1.0');
    assert(source.downloadUrl.startsWith('https://kenney.nl/'));
    assert.equal(sha256(readFileSync(source.archive.path)), source.archive.sha256);
    assert.equal(sha256(readFileSync(source.licenseFile.path)), source.licenseFile.sha256);
    assert.match(readFileSync(source.licenseFile.path, 'utf8'), /Creative Commons Zero, CC0/);
  }
});

void test('invalid sample rates fail before allocating a playback buffer', () => {
  for (const rate of [NaN, Infinity, -1, 0, 1, 44100.5, 400000]) {
    assert.throws(() => approvedSoundSamples('button', rate), RangeError);
  }
});
