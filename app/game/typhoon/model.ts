import { actions, goals, level, riskCues, type ActionId } from './config';

export type Phase = 'briefing' | 'playing' | 'settling' | 'complete';
export type Notice = { text: string; kind: 'neutral' | 'success' | 'warning'; age: number; serial: number };
export type Run = {
  phase: Phase; resolved: ActionId[]; action: { id: ActionId; elapsed: number } | null;
  elapsed: number; risk: number; consequenceSeen: boolean; consequenceAge: number | null;
  cueFlags: number[]; settleElapsed: number; stars: number;
  notice: Notice | null; serial: number; hint: ActionId | null; hintAge: number; misses: number;
};
export type Event = { type: 'start' | 'reset' | 'miss' } | { type: 'tick'; ms: number } |
  { type: 'hit'; id: string } | { type: 'hint'; id?: ActionId } | { type: 'message'; text: string };

export function createRun(): Run {
  return { phase: 'briefing', resolved: [], action: null, elapsed: 0, risk: 8, consequenceSeen: false,
    consequenceAge: null, cueFlags: [], settleElapsed: 0, stars: 0, notice: null, serial: 0,
    hint: null, hintAge: 0, misses: 0 };
}
function tell(run: Run, text: string, kind: Notice['kind'] = 'neutral'): Run {
  return { ...run, serial: run.serial + 1, notice: { text, kind, age: 0, serial: run.serial + 1 } };
}
export function completedCount(run: Run) { return goals.filter(id => run.resolved.includes(id)).length; }
export function hintTarget(run: Run, requested?: ActionId): ActionId | null {
  const id = requested && !run.resolved.includes(requested) ? requested : goals.find(goal => !run.resolved.includes(goal));
  if (!id) return null;
  return actions[id].requires.find(prerequisite => !run.resolved.includes(prerequisite)) ?? id;
}

/** Pure state machine. Rendering and audio never award progress or alter risk. */
export function reduceRun(current: Run, event: Event): Run {
  if (event.type === 'reset') return createRun();
  if (event.type === 'start') return current.phase === 'briefing' ? { ...current, phase: 'playing' } : current;
  if (event.type === 'tick') {
    if (!Number.isFinite(event.ms) || event.ms <= 0 || current.phase === 'briefing' || current.phase === 'complete') return current;
    const ms = event.ms;
    let run: Run = { ...current,
      notice: current.notice && current.notice.age + ms < 4400 ? { ...current.notice, age: current.notice.age + ms } : null,
      hintAge: current.hintAge + ms, hint: current.hintAge + ms < 3800 ? current.hint : null,
      consequenceAge: current.consequenceAge !== null && current.consequenceAge + ms < 2200 ? current.consequenceAge + ms : null,
    };
    if (run.phase === 'settling') {
      const settleElapsed = run.settleElapsed + ms;
      return { ...run, settleElapsed, phase: settleElapsed >= level.settleMs ? 'complete' : 'settling' };
    }
    run.elapsed += ms;
    run.risk = Math.min(100, run.risk + ms / (level.riskSeconds * 10));
    if (run.action) {
      const elapsed = run.action.elapsed + ms;
      const config = actions[run.action.id];
      if (elapsed >= config.duration) {
        run = tell({ ...run, action: null, resolved: [...run.resolved, config.id], hint: null }, config.done, 'success');
        if (completedCount(run) === goals.length) {
          return { ...run, phase: 'settling', stars: run.risk < 72 ? 3 : 2, settleElapsed: 0, consequenceAge: null };
        }
      } else run.action = { ...run.action, elapsed };
    }
    if (run.risk >= 100 && !run.consequenceSeen) {
      run = tell({ ...run, consequenceSeen: true, consequenceAge: 0 }, '强风袭来！继续处理剩余隐患，仍然可以完成训练。', 'warning');
    }
    if (!run.action && (!run.notice || run.notice.age > 3000)) {
      const cue = riskCues.find(c => run.risk >= c.at && !run.cueFlags.includes(c.at) && !run.resolved.includes(c.goal));
      if (cue) run = tell({ ...run, cueFlags: [...run.cueFlags, cue.at] }, cue.text, 'warning');
    }
    return run;
  }
  if (current.phase !== 'playing') return current;
  if (event.type === 'message') return tell(current, event.text);
  if (event.type === 'miss') return current.action ? current : tell({ ...current, misses: current.misses + 1 }, '这里暂时没有隐患。仔细观察，不扣小红花。');
  if (event.type === 'hint') {
    if (current.action) return current;
    const target = hintTarget(current, event.id);
    return target ? tell({ ...current, hint: target, hintAge: 0 }, actions[target].hint) : current;
  }
  if (event.type === 'hit') {
    if (current.action || !Object.hasOwn(actions, event.id)) return current;
    const config = actions[event.id as ActionId];
    if (current.resolved.includes(config.id)) return current;
    if (config.requires.some(id => !current.resolved.includes(id))) return tell(current, '先移开沙发坐垫，才能看见下面的插线板。');
    return { ...tell(current, config.during), action: { id: config.id, elapsed: 0 }, hint: null };
  }
  return current;
}
