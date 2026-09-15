/** Deterministic sample-level calibration, not a perceptual LUFS measurement. */
export type SfxMeasurement = { activeRms: number; rms: number; peak: number; activeFrames: number; frames: number };
export type SfxLevelOptions = { targetRms: number; peakLimit?: number; maxGainDb?: number; sampleRate?: number };

/** Non-overlapping 10 ms energy blocks, gated 20 dB below the loudest block. */
export function measureSfx(samples: Float32Array, sampleRate = 22050): SfxMeasurement {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('Invalid SFX sample rate');
  const block = Math.max(1, Math.round(sampleRate * .01));
  const windows: { energy: number; frames: number }[] = [];
  let peak = 0, energy = 0, loudest = 0;
  for (let start = 0; start < samples.length; start += block) {
    const end = Math.min(start + block, samples.length); let sum = 0;
    for (let i = start; i < end; i++) {
      const value = samples[i]; if (!Number.isFinite(value)) throw new RangeError('Non-finite SFX sample');
      peak = Math.max(peak, Math.abs(value)); sum += value * value;
    }
    const frames = end - start; windows.push({ energy: sum, frames });
    energy += sum; loudest = Math.max(loudest, sum / frames);
  }
  let activeEnergy = 0, activeFrames = 0;
  if (loudest > 1e-12) for (const window of windows) {
    if (window.energy / window.frames >= loudest * .01) { activeEnergy += window.energy; activeFrames += window.frames; }
  }
  return { activeRms: activeFrames ? Math.sqrt(activeEnergy / activeFrames) : 0,
    rms: samples.length ? Math.sqrt(energy / samples.length) : 0, peak, activeFrames, frames: samples.length };
}

/** Linear gain preserves attack/decay and timbre; peaks can take priority over RMS. */
export function sfxGain(samples: Float32Array, { targetRms, peakLimit = .7, maxGainDb = 36, sampleRate = 22050 }: SfxLevelOptions): number {
  if (!Number.isFinite(targetRms) || targetRms < 0 || !Number.isFinite(peakLimit) || peakLimit <= 0 || peakLimit > 1 || !Number.isFinite(maxGainDb)) throw new RangeError('Invalid SFX level target');
  const measured = measureSfx(samples, sampleRate);
  if (!measured.activeRms || !measured.peak || targetRms === 0) return 0;
  return Math.min(targetRms / measured.activeRms, peakLimit / measured.peak, 10 ** (maxGainDb / 20));
}

export function normaliseSfx(samples: Float32Array, options: SfxLevelOptions): Float32Array {
  const gain = sfxGain(samples, options);
  return samples.map(value => value * gain);
}

/** The compressor shapes overlap; this final guard bounds even its attack transient. */
export function connectSfxPeakLimit(context: AudioContext, input: AudioNode, output: AudioNode): WaveShaperNode | null {
  if (typeof context.createWaveShaper !== 'function') { input.connect(output); return null; }
  const limit = context.createWaveShaper(), curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.max(-.7, Math.min(.7, i / (curve.length - 1) * 2 - 1));
  limit.curve = curve; limit.oversample = 'none'; input.connect(limit); limit.connect(output); return limit;
}
