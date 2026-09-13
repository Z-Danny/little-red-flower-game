import type { Action, DisasterRules } from './schema';
export type DisasterRun = {
  phase: 'ready' | 'playing' | 'reveal' | 'complete' | 'failed' | 'evacuated';
  elapsed: number;
  penalty: number;
  goals: string[];
  pending: { id: string; age: number } | null;
  revealAge: number;
  stars: number;
  misses: number;
  cooldown: number;
  notice: { text: string; seq: number; tone: 'good' | 'bad' | 'neutral' };
  lastAction: string;
  effectAge: number;
};
export type DisasterEvent =
  | { type: 'start' }
  | { type: 'reset' }
  | { type: 'tick'; ms: number }
  | {
      type: 'act';
      source: string | null;
      target: string | null;
      input: 'tap' | 'drop';
    };
export const createDisaster = (): DisasterRun => ({
  phase: 'ready',
  elapsed: 0,
  penalty: 0,
  goals: [],
  pending: null,
  revealAge: 0,
  stars: 0,
  misses: 0,
  cooldown: 0,
  notice: { text: '', seq: 0, tone: 'neutral' },
  lastAction: '',
  effectAge: 0,
});
export const remaining = (r: DisasterRules, s: DisasterRun) =>
  Math.max(0, r.seconds * 1000 - s.elapsed - s.penalty);
export const pressure = (r: DisasterRules, s: DisasterRun) =>
  Math.min(1, (s.elapsed + s.penalty) / (r.seconds * 1000));
export function award(r: DisasterRules, s: DisasterRun) {
  if (r.kind === 'prevention') {
    const fraction = remaining(r, s) / (r.seconds * 1000);
    return fraction >= .5 ? 3 : fraction >= 2 / 9 ? 2 : 1;
  }
  return s.elapsed <= 60000 ? 3 : s.elapsed <= 90000 ? 2 : 1;
}
const say = (
  s: DisasterRun,
  text: string,
  tone: DisasterRun['notice']['tone'] = 'neutral',
): DisasterRun => ({
  ...s,
  notice: { text, tone, seq: s.notice.seq + 1 },
  effectAge: 0,
});
function fail(s: DisasterRun, text: string) {
  return say({ ...s, phase: 'failed', pending: null, stars: 0 }, text, 'bad');
}
export function actionAvailable(r: DisasterRules, s: DisasterRun, a: Action) {
  return (
    !(a.goal && s.goals.includes(a.goal)) &&
    (a.requires ?? []).every((g) => s.goals.includes(g))
  );
}
export function reduceDisaster(
  r: DisasterRules,
  s: DisasterRun,
  e: DisasterEvent,
): DisasterRun {
  if (e.type === 'reset') return createDisaster();
  if (e.type === 'start')
    return s.phase === 'ready' ? say({ ...s, phase: 'playing' }, r.opening) : s;
  if (e.type === 'tick') {
    // UI ignores hidden/paused frames; this cap prevents a resumed tab spending minutes in one tick.
    const dt = Math.max(0, Math.min(100, Number.isFinite(e.ms) ? e.ms : 0));
    if (s.phase === 'reveal') {
      const age = s.revealAge + dt;
      return {
        ...s,
        revealAge: age,
        effectAge: s.effectAge + dt,
        phase: age >= r.revealMs ? 'complete' : 'reveal',
      };
    }
    if (s.phase !== 'playing') return s;
    let n = {
      ...s,
      elapsed: s.elapsed + dt,
      cooldown: Math.max(0, s.cooldown - dt),
      effectAge: s.effectAge + dt,
    };
    if (remaining(r, n) <= 0) {
      const action = n.pending && r.actions.find(a => a.id === n.pending!.id);
      const finalAccepted = r.kind === 'prevention' && action?.goal && !n.goals.includes(action.goal) && n.goals.length === r.goals.length - 1;
      n.elapsed = Math.max(0, r.seconds * 1000 - n.penalty);
      if (!finalAccepted) return fail(n, r.timeout);
    }
    if (n.pending) {
      const a = r.actions.find((a) => a.id === n.pending!.id)!;
      n = { ...n, pending: { ...n.pending, age: n.pending.age + dt } };
      if (n.pending!.age >= a.duration) {
        n = say(
          {
            ...n,
            pending: null,
            lastAction: a.id,
            goals: a.goal ? [...n.goals, a.goal] : n.goals,
          },
          a.feedback,
          'good',
        );
        if (n.goals.length === r.goals.length)
          return { ...n, phase: 'reveal', revealAge: 0, stars: award(r, n) };
      }
    }
    return n;
  }
  if (s.phase !== 'playing' || s.pending) return s;
  if (r.kind === 'prevention' && remaining(r, s) <= 0) return fail(s, r.timeout);
  const matches = r.actions.filter(
    (a) =>
      a.source === e.source && a.target === e.target && a.input === e.input,
  );
  const danger = matches.find((a) => a.outcome === 'danger');
  if (danger) return fail({ ...s, lastAction: danger.id }, danger.feedback);
  const a = matches.find((a) => actionAvailable(r, s, a));
  if (a?.outcome === 'escape')
    return say(
      { ...s, phase: 'evacuated', pending: null, lastAction: a.id },
      a.feedback,
      'good',
    );
  if (a)
    return {
      ...s,
      pending: { id: a.id, age: 0 },
      lastAction: a.id,
      effectAge: 0,
    };
  // Repeated completed actions are idempotent; never farm points or incur accidental penalties.
  if (matches.some((a) => a.goal && s.goals.includes(a.goal))) return s;
  if (matches.length)
    return say(
      s,
      '先沿干燥路线靠近楼梯，并在可安全到达时断电；来不及准备可直接上楼。',
    );
  if (r.kind === 'prevention') {
    const n = say(
      {
        ...s,
        penalty: s.penalty + r.missPenalty * 1000,
        misses: s.misses + 1,
        cooldown: 0,
      },
      `这里不是本关隐患，剩余时间 −${r.missPenalty} 秒。`,
      'bad',
    );
    return remaining(r, n) <= 0 ? fail(n, r.timeout) : n;
  }
  return say(s, '这次放置没有改变局势，物品已放回。');
}
