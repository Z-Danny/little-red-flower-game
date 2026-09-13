/** One normalized level clock for the HUD, voice envelopes and storm pacing. */
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export function countdownState(elapsed: number, seconds: number) {
  const progress = clamp01(elapsed / (seconds * 1000));
  return {
    progress,
    remaining: 1 - progress,
    secondsLeft: Math.max(0, Math.ceil(seconds - elapsed / 1000)),
    stage: progress >= 1 ? 'peak' : progress >= .8 ? 'danger' : progress >= .5 ? 'warning' : 'steady',
    color: progress >= .8 ? '#f07157' : progress >= .5 ? '#efc568' : '#83c9a2',
  };
}
export type FearKind = 'startle' | 'fright' | 'alarm';
export const fearMoments = [
  { at: .16, kind: 'startle' },
  { at: .54, kind: 'fright' },
  { at: .86, kind: 'alarm' },
] as const;
export function fearMoment(elapsed: number, seconds: number) {
  const duration = seconds * 1000;
  if (elapsed >= duration) return null;
  let slot = -1;
  for (let i = 0; i < fearMoments.length; i++) if (elapsed >= fearMoments[i].at * duration) slot = i;
  if (slot < 0) return null;
  const item = fearMoments[slot];
  return {
    slot,
    kind: item.kind,
    age: elapsed - item.at * duration,
    intensity: clamp01(elapsed / duration),
  };
}
export function fearMotion(elapsed: number, seconds: number) {
  const moment = fearMoment(elapsed, seconds);
  if (!moment || moment.age > 1000) return 0;
  return Math.sin(Math.PI * moment.age / 1000) * (1.2 + 1.8 * moment.intensity);
}
