import profiles from '@/content/legacy-response-audio.json';
import { PracticeAudioSession, defaultPracticeAudioSettings } from './practice-audio';
import type { LevelPackage, Skin } from './schema';

type AudioProfile = NonNullable<NonNullable<Skin['presentation']>['audio']>;
const audioProfiles = profiles as Record<string, AudioProfile>;
export const legacyMusicBpm = 138;
export const legacyMusicBeats = 16;
export const legacyAudioSettings = { ...defaultPracticeAudioSettings, music: .24, ambient: .18, sfx: .38 };

/** Separate package for audio only: never give its presentation field to the player. */
export function legacyResponseAudioPack(pack: LevelPackage): LevelPackage | null {
  if (pack.rules.kind !== 'response' || pack.skin.response || pack.skin.presentation || !Object.hasOwn(audioProfiles, pack.rules.id)) return null;
  return { ...pack, skin: { ...pack.skin, presentation: {
    // These are elapsed-time exercises. The music never implies a rescue deadline.
    durationMs: Number.MAX_SAFE_INTEGER, effects: [],
    audio: { ...audioProfiles[pack.rules.id], emergency: {} },
  } } };
}

/** Original short, syncopated action backing; no speech, alarm or catastrophe sound. */
export function synthesiseLegacyMusic(sampleRate = 22050): Float32Array {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('Unsupported sample rate');
  const beat = 60 / legacyMusicBpm, frames = Math.round(legacyMusicBeats * beat * sampleRate), data = new Float32Array(frames);
  const add = (at: number, seconds: number, signal: (time: number, index: number) => number) => {
    const start = Math.round(at * beat * sampleRate), length = Math.ceil(seconds * sampleRate);
    for (let i = 0; i < length; i++) {
      const time = i / sampleRate, envelope = Math.min(1, time / .004, (seconds - time) / .008);
      data[(start + i) % frames] += signal(time, i) * Math.max(0, envelope);
    }
  };
  const notes = [146.83, 146.83, 174.61, 196, 146.83, 220, 196, 174.61];
  let seed = 8263147;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  for (let n = 0; n < legacyMusicBeats; n++) {
    const root = notes[Math.floor(n / 2) % notes.length];
    add(n, .2, time => Math.sin(2 * Math.PI * (48 * time + 36 * (1 - Math.exp(-time * 35)) / 35)) * Math.exp(-time * 23) * .2);
    for (const offset of [0, .75]) add(n + offset, .17, time =>
      (Math.sin(2 * Math.PI * root * time) + .3 * Math.sin(4 * Math.PI * root * time)) * Math.exp(-time * 16) * .18);
    if (n % 2) add(n, .12, time => random() * Math.exp(-time * 42) * .12);
    for (const offset of [0, .5]) add(n + offset, .035, time => random() * Math.exp(-time * 100) * .04);
    if (n % 4 === 3) add(n + .5, .18, time => (Math.sin(4 * Math.PI * root * time) + Math.sin(6 * Math.PI * root * time) * .25) * Math.exp(-time * 18) * .1);
  }
  return data;
}

export function createLegacyResponseAudioSession(pack: LevelPackage, makeContext?: () => AudioContext) {
  const audioPack = legacyResponseAudioPack(pack);
  return audioPack ? new PracticeAudioSession(audioPack, makeContext, { music: synthesiseLegacyMusic, suspendWhenMuted: true, referenceSfx: legacyAudioSettings.sfx }) : null;
}
