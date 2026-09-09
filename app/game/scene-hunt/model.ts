/** Recognition, not treatment: a mark never moves or repairs an object. */
export type HuntRules = {
  id: string;
  title: string;
  order: number;
  seconds: number;
  markMs: number;
  revealMs: number;
  targets: { id: string; name: string; lesson: string }[];
  summary: string;
};
export type HuntRun = {
  phase: 'ready' | 'playing' | 'reveal' | 'complete';
  elapsed: number;
  found: string[];
  marking: null | { id: string; age: number };
  revealAge: number;
  miss: null | { x: number; y: number; age: number };
  peak: boolean;
  stars: number;
};
export type HuntEvent =
  | { type: 'start' | 'reset' }
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
  if (e.type === 'tap') {
    if (r.phase !== 'playing' || r.marking) return r;
    if (!e.id || !rules.targets.some((t) => t.id === e.id))
      return Number.isFinite(e.x) && Number.isFinite(e.y)
        ? { ...r, miss: { x: e.x, y: e.y, age: 0 } }
        : r;
    if (r.found.includes(e.id)) return r;
    return { ...r, marking: { id: e.id, age: 0 }, miss: null };
  }
  if (
    e.type !== 'tick' ||
    !Number.isFinite(e.ms) ||
    e.ms <= 0 ||
    r.phase === 'ready' ||
    r.phase === 'complete'
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
    miss:
      r.miss && r.miss.age + ms < 420
        ? { ...r.miss, age: r.miss.age + ms }
        : null,
  };
  n.peak = n.elapsed >= rules.seconds * 1000;
  if (r.marking) {
    n.marking = { ...r.marking, age: r.marking.age + ms };
    if (n.marking.age >= rules.markMs) {
      n.found = [...r.found, r.marking.id];
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
