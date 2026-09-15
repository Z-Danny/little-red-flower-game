import { renderScore, type SoundNote } from '../audio/note-score';
import { normaliseSfx } from '../audio/sfx-levels';
import { approvedSoundSamples } from '../audio/result-samples';
import { quietElectric, performanceAudio } from './audio-profiles';
import type { HuntPerformance } from './performance';

export type HuntFeedback = 'tap' | 'found' | 'wrong' | 'resolve' | 'success' | 'timeout';
export function huntFeedbackScore(profile: 'storm' | 'quiet_electric', performance: HuntPerformance | undefined, cue: HuntFeedback): SoundNote[] {
  const note = (frequency: number, duration: number, gain: number, delay = 0, type: SoundNote['type'] = 'sine', end?: number): SoundNote =>
    ({ frequency, duration, gain, delay, type, end, attack: .015, exponentialAttack: true });
  const chord = (frequencies: readonly number[], duration: number, gain: number, step: number) => frequencies.map((f, i) => note(f, duration, gain, i * step));
  if (cue === 'success' || cue === 'timeout') return [];
  // A little tonal edge keeps the original scratch audible on phone speakers.
  if (cue === 'tap') return [note(720, .09, .025, 0, 'triangle', 540), { frequency: 1800, duration: .16, gain: .022, type: 'noise', attack: .015 }];
  if (performance) {
    const a = performanceAudio[performance.sound];
    if (cue === 'found') return [note(783.991, .09, .07, 0, 'triangle', 690)];
    if (cue === 'wrong') return [note(246.94, .075, .045, 0, 'triangle', 220), note(196, .075, .04, .085, 'triangle', 174.61)];
    return chord(a.ending, a.tail, .055, .24);
  }
  if (profile === 'quiet_electric') {
    if (cue === 'found') return [note(783.991, quietElectric.foundMs / 1000, .065, 0, 'triangle', 690)];
    if (cue === 'wrong') return [note(220, quietElectric.missMs / 1000, .026, 0, 'triangle', 196)];
    return chord(quietElectric.ending, .5, .06, .24);
  }
  if (cue === 'found') return chord([659.25, 880, 1318.5], .2, .11, .075);
  if (cue === 'wrong') return [note(210, .16, .055, 0, 'triangle', 145)];
  return chord([392, 523.25, 659.25], .6, .075, .15);
}
export function synthesiseHuntFeedback(profile: 'storm' | 'quiet_electric', performance: HuntPerformance | undefined, cue: HuntFeedback, sampleRate = 22050) {
  if (cue === 'success' || cue === 'timeout') return approvedSoundSamples(cue === 'success' ? 'victory' : 'failure', sampleRate);
  return normaliseSfx(renderScore(huntFeedbackScore(profile, performance, cue), sampleRate), {
    targetRms: cue === 'tap' ? .085 : cue === 'found' || cue === 'wrong' ? .11 : .125,
    peakLimit: .55, sampleRate,
  });
}
