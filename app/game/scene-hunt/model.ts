import { penalizedElapsed } from '../challenge/rules';
/** Recognition, not treatment: a mark never moves or repairs an object. */
export type HuntRules = {
  feedbackVersion?: 2;
  id: string;
  title: string;
  order: number;
  seconds: number;
  /** Opt-in hard deadline. Omitted preserves observation-only levels. */
  timeout?: 'continue' | 'fail';
  markMs: number;
  revealMs: number;
  targets: { id: string; name: string; lesson: string }[];
  summary: string;
};
export type HuntRun = {
  phase: 'ready' | 'playing' | 'reveal' | 'complete' | 'unfinished' | 'failed';
  elapsed: number;
  found: string[];
  marking: null | { id: string; age: number };
  revealAge: number;
  miss: null | { x: number; y: number; age: number };
  penaltyFeedback?: { x: number; y: number; age: number } | null;
  peak: boolean;
  stars: number;
  missCooldownUntil?: number;
  foundAt?: { id: string; at: number };
};
export type HuntEvent =
  | { type: 'start' | 'reset' | 'end' }
  | { type: 'tick'; ms: number }
  | { type: 'tap'; id: string | null; x: number; y: number };
export const createHunt = (): HuntRun => ({
  phase: 'ready',
  elapsed: 0,
  found: [],
  marking: null,
  revealAge: 0,
  miss: null,
  peak: false,
  stars: 0,
});
export const pressure = (rules: HuntRules, r: HuntRun) =>
  r.phase === 'reveal' || r.phase === 'complete'
    ? 0
    : Math.min(1, r.elapsed / (rules.seconds * 1000));
export function reduceHunt(
  rules: HuntRules,
  r: HuntRun,
  e: HuntEvent,
): HuntRun {
  if (e.type === 'reset') return createHunt();
  if (e.type === 'start')
    return r.phase === 'ready' ? { ...r, phase: 'playing' } : r;
  if (e.type === 'end')
    return rules.feedbackVersion === 2 &&
      r.phase === 'playing' &&
      r.found.length < rules.targets.length
      ? { ...r, phase: 'unfinished', marking: null, stars: 0 }
      : r;
  if (e.type === 'tap') {
    if (r.phase !== 'playing') return r;
    const wrong = !e.id || !rules.targets.some(t=>t.id===e.id);
    // During a non-final circle, wrong taps still cost time; valid taps are not queued.
    if (r.marking && (!wrong || rules.timeout !== 'fail' || r.found.length === rules.targets.length-1)) return r;
    if (rules.timeout === 'fail' && r.elapsed >= rules.seconds * 1000)
      return { ...r, phase: 'failed', elapsed: rules.seconds * 1000, peak: true, stars: 0, miss: null };
    if (!e.id || !rules.targets.some((t) => t.id === e.id)) {
      if (rules.timeout === 'fail') {
        if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) return r;
        const elapsed = penalizedElapsed(r.elapsed, rules.seconds);
        return { ...r, elapsed, miss: { x: e.x, y: e.y, age: 0 }, penaltyFeedback: { x:e.x,y:e.y,age:0 },
          marking: elapsed >= rules.seconds * 1000 ? null : r.marking,
          phase: elapsed >= rules.seconds * 1000 ? 'failed' : 'playing',
          peak: elapsed >= rules.seconds * 1000, stars: 0 };
      }
      if (
        rules.feedbackVersion === 2 &&
        r.elapsed < (r.missCooldownUntil ?? -1)
      )
        return r;
      return Number.isFinite(e.x) && Number.isFinite(e.y)
        ? {
            ...r,
            miss: { x: e.x, y: e.y, age: 0 },
            ...(rules.feedbackVersion === 2
              ? { missCooldownUntil: r.elapsed + 500 }
              : {}),
          }
        : r;
    }
    if (r.found.includes(e.id)) return r;
    return { ...r, marking: { id: e.id, age: 0 }, miss: null };
  }
  if (
    e.type !== 'tick' ||
    !Number.isFinite(e.ms) ||
    e.ms <= 0 ||
    r.phase === 'ready' ||
    r.phase === 'complete' ||
    r.phase === 'unfinished' ||
    r.phase === 'failed'
  )
    return r;
  const ms = Math.min(100, e.ms);
  if (r.phase === 'reveal') {
    const age = r.revealAge + ms;
    return {
      ...r,
      revealAge: age,
      phase: age >= rules.revealMs ? 'complete' : 'reveal',
    };
  }
  const n = {
    ...r,
    elapsed: r.elapsed + ms,
    ...(r.penaltyFeedback ? {penaltyFeedback:r.penaltyFeedback.age+ms<1600?{...r.penaltyFeedback,age:r.penaltyFeedback.age+ms}:null}:{}),
    miss:
      r.miss && r.miss.age + ms < (rules.feedbackVersion === 2 ? 450 : 420)
        ? { ...r.miss, age: r.miss.age + ms }
        : null,
  };
  n.peak = n.elapsed >= rules.seconds * 1000;
  // A valid final tap before the deadline has already identified the final target.
  // Let its compulsory circle animation finish, without accepting any late taps.
  const lastTargetInTime = r.marking !== null &&
    r.found.length === rules.targets.length - 1;
  if (rules.timeout === 'fail' && n.peak) {
    n.elapsed = rules.seconds * 1000;
    if (!lastTargetInTime) return { ...n, phase: 'failed', found: r.marking ? [...r.found, r.marking.id] : r.found, marking: null, miss: null, stars: 0 };
  }
  if (r.marking) {
    n.marking = { ...r.marking, age: r.marking.age + ms };
    if (n.marking.age >= rules.markMs) {
      n.found = [...r.found, r.marking.id];
      if (rules.feedbackVersion === 2)
        n.foundAt = { id: r.marking.id, at: n.elapsed };
      n.marking = null;
      if (n.found.length === rules.targets.length) {
        n.phase = 'reveal';
        n.revealAge = 0;
        n.stars = 3;
      }
    }
  }
  return n;
}
