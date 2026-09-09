import type { Condition, Emotion, Event, Input, LevelPackage, ObjectSpec, Run } from './schema';

export const hasAll = (resolved: readonly string[], ids: readonly string[] = []) => ids.every(id => resolved.includes(id));
export const finished = (pack: LevelPackage, run: Run) => hasAll(run.resolved, pack.rules.completion.requires);
export const emotion = (pack: LevelPackage, run: Run): Emotion => finished(pack, run) ? 'relieved' : run.reaction ?? (run.risk >= pack.rules.risk.warningAt ? 'panicked' : 'worried');
export function matches(pack: LevelPackage, run: Run, condition: Condition) {
  return hasAll(run.resolved, condition.all) && (!condition.any?.length || condition.any.some(id => run.resolved.includes(id)))
    && !(condition.not ?? []).some(id => run.resolved.includes(id))
    && (!condition.emotion || condition.emotion === emotion(pack, run))
    && (condition.riskAtLeast === undefined || run.risk >= condition.riskAtLeast);
}
export const enabled = (object: ObjectSpec, run: Run) => object.input !== 'none' && hasAll(run.resolved, object.requires)
  && !(object.disabledWhen ?? []).some(id => run.resolved.includes(id));
export function createRun(pack: LevelPackage): Run {
  return { phase: 'playing', resolved: [], action: null, elapsed: 0, risk: pack.rules.risk.initial, mistakes: 0,
    peakSeen: false, settleAge: 0, reaction: null, reactionMs: 0, boost: 0,
    notice: pack.rules.briefing ? { text: pack.rules.briefing, remaining: 5500 } : null, stars: 0 };
}
export function findRule(pack: LevelPackage, run: Run, input: Input) {
  const object = pack.rules.objects.find(o => o.id === input.source);
  if (!object || !enabled(object, run) || (object.input === 'tap' ? input.mode !== 'tap' : input.mode !== 'drop')) return undefined;
  return pack.rules.interactions.find(rule => rule.source === input.source && rule.mode === input.mode
    && (rule.mode !== 'drop' || rule.target === input.target) && hasAll(run.resolved, rule.requires)
    && !(rule.unless ?? []).some(id => run.resolved.includes(id))
    && (!rule.grants.length || !hasAll(run.resolved, rule.grants)));
}
export function reduceRun(pack: LevelPackage, run: Run, event: Event): Run {
  if (event.type === 'reset') return createRun(pack);
  if (event.type === 'hint') {
    if (run.phase !== 'playing' || run.action) return run;
    const rule = pack.rules.interactions.find(rule => rule.outcome === 'correct' && rule.grants.some(g => !run.resolved.includes(g))
      && findRule(pack, run, { source: rule.source, mode: rule.mode, target: rule.target })?.id === rule.id);
    const label = pack.rules.objects.find(o => o.id === rule?.source)?.label;
    return rule ? { ...run, notice: { text: `观察${label}，试着${rule.mode === 'tap' ? '点击它' : '把它移到合适的位置'}。`, remaining: 2800 } } : run;
  }
  if (event.type === 'tick') {
    if (!Number.isFinite(event.ms) || event.ms <= 0 || run.phase === 'complete') return run;
    const ms = Math.min(event.ms, 100);
    let next: Run = { ...run, elapsed: run.elapsed + ms, reactionMs: Math.max(0, run.reactionMs - ms),
      reaction: run.reactionMs > ms ? run.reaction : null, boost: Math.max(0, run.boost - ms / 5000),
      notice: run.notice && run.notice.remaining > ms ? { ...run.notice, remaining: run.notice.remaining - ms } : null };
    if (run.phase === 'settling') {
      next.settleAge += ms; next.risk = Math.max(0, next.risk - ms / 20);
      if (next.settleAge >= pack.rules.completion.settleMs) next.phase = 'complete';
      return next;
    }
    next.risk = pack.rules.risk.mode === 'elapsed' ? 0 : Math.min(100, run.risk + ms / (pack.rules.risk.seconds * 10));
    if (run.action) {
      next.action = { ...run.action, age: run.action.age + ms };
      if (next.action.age >= next.action.duration) {
        const rule = pack.rules.interactions.find(r => r.id === run.action?.rule);
        next.action = null;
        if (rule?.outcome === 'correct') {
          next.resolved = [...new Set([...run.resolved, ...rule.grants])];
          next.reaction = 'focused'; next.reactionMs = 1800;
          next.risk = pack.rules.risk.mode === 'elapsed' ? 0 : Math.max(0, Math.min(100, next.risk + (rule.riskDelta ?? -8)));
          if (rule.feedback) next.notice = { text: rule.feedback, remaining: 4000 };
        }
      }
    }
    if (finished(pack, next)) return { ...next, phase: 'settling', settleAge: 0, notice: null, stars: next.mistakes === 0 && !next.peakSeen ? 3 : 2 };
    if (next.risk >= 100 && !next.peakSeen) {
      next.peakSeen = true; next.boost = Math.max(.4, next.boost);
      if (!next.notice) next.notice = { text: pack.rules.risk.peakFeedback, remaining: 2500 };
    }
    return next;
  }
  if (run.phase !== 'playing' || run.action) return run;
  const object = pack.rules.objects.find(o => o.id === event.input.source);
  if (!object || !enabled(object, run) || (object.input === 'tap' ? event.input.mode !== 'tap' : event.input.mode !== 'drop')) return run;
  const rule = findRule(pack, run, event.input);
  const action = { rule: rule?.id ?? null, source: object.id, age: 0, duration: rule ? pack.skin.animations[rule.animation].durationMs : 450, point: event.input.point };
  if (!rule) return { ...run, action };
  const danger = rule.outcome === 'danger';
  return { ...run, action, mistakes: run.mistakes + Number(danger),
    risk: pack.rules.risk.mode === 'elapsed' ? 0 : danger ? Math.max(0, Math.min(100, run.risk + (rule.riskDelta ?? 15))) : run.risk,
    reaction: danger ? 'panicked' : run.reaction, reactionMs: danger ? 2500 : run.reactionMs,
    boost: danger ? Math.min(1, run.boost + .7) : run.boost,
    notice: rule.outcome !== 'correct' && rule.feedback ? { text: rule.feedback, remaining: 2300 } : null };
}
