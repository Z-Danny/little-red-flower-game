import type { FearKind } from './tension';
import { fearClips } from './fear-clips.generated';
/** CC0 recorded nonverbal startles. No narration, synthesis or aspiration loop.
 * Embedded PCM avoids network/codec loading; replace via build-typhoon-fear.mjs.
 */
export function fearSamples(kind: FearKind, sampleRate: number) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
    throw Error('Invalid fear sample rate');
  const clip = fearClips[kind];
  const bytes = atob(clip.pcm16), count = bytes.length / 2;
  const pcm = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const value = bytes.charCodeAt(i * 2) | (bytes.charCodeAt(i * 2 + 1) << 8);
    pcm[i] = (value >= 32768 ? value - 65536 : value) / 32768;
  }
  if (sampleRate === clip.rate) return pcm;
  const output = new Float32Array(Math.round(count * sampleRate / clip.rate));
  for (let i = 0; i < output.length; i++) {
    const pos = i * (count - 1) / (output.length - 1), left = Math.floor(pos);
    output[i] = pcm[left] * (1 - (pos - left)) + pcm[Math.min(count - 1, left + 1)] * (pos - left);
  }
  return output;
}
