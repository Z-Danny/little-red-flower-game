import approved from '../../../content/audio/approved-results.json';

export type ApprovedSound = 'victory' | 'failure' | 'button';

const cache = new Map<string, Float32Array>();

/** Duration of the exact single-shot WAV approved in the second audition. */
export function approvedSoundDuration(kind: ApprovedSound): number {
  const sound = approved.sounds[kind];
  return sound.frames / sound.sampleRate;
}

/**
 * Synchronously decodes embedded mono PCM; no fetch, media permission, or async
 * decode can delay the gesture. Treat the cached array as read-only and copy it
 * into an AudioBuffer. Native-rate samples are exact PCM16 / 32768 values.
 */
export function approvedSoundSamples(kind: ApprovedSound, sampleRate = 44100): Float32Array {
  if (!Number.isFinite(sampleRate) || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 384000) {
    throw new RangeError('Audio sample rate must be an integer between 8000 and 384000 Hz');
  }
  const key = `${kind}:${sampleRate}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const sound = approved.sounds[kind];
  if (sampleRate !== sound.sampleRate) {
    const original = approvedSoundSamples(kind, sound.sampleRate);
    const output = new Float32Array(Math.round(original.length * sampleRate / sound.sampleRate));
    for (let i = 0; i < output.length; i++) {
      const position = i * sound.sampleRate / sampleRate;
      const left = Math.min(Math.floor(position), original.length - 1);
      const right = Math.min(left + 1, original.length - 1);
      output[i] = original[left] + (original[right] - original[left]) * (position - left);
    }
    cache.set(key, output);
    return output;
  }

  const bytes = atob(sound.pcmBase64);
  if (bytes.length !== sound.frames * 2) throw new Error(`Invalid approved audio payload: ${kind}`);
  const output = new Float32Array(sound.frames);
  for (let i = 0; i < output.length; i++) {
    const unsigned = bytes.charCodeAt(i * 2) | (bytes.charCodeAt(i * 2 + 1) << 8);
    output[i] = (unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned) / 32768;
  }
  cache.set(key, output);
  return output;
}
