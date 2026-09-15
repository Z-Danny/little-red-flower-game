import { reduceRun } from './engine';
import type { LevelPackage, Run } from './schema';

/** Read current actions and waiting stages without changing notices or progress. */
export function configuredPauseHint(pack: LevelPackage, run: Run): string | undefined {
  if (run.phase !== 'playing') return undefined;
  if (run.action) {
    const label = pack.rules.objects.find(object => object.id === run.action?.source)?.label;
    return `正在操作${label ?? '当前物件'}，回到场景后等待完成。`;
  }
  const actionHint = reduceRun(pack, { ...run, notice: null }, { type: 'hint' }).notice?.text;
  if (actionHint) return actionHint;
  const waitingStage = pack.rules.stages?.find(stage => !(run.stages ?? []).includes(stage.id)
    && stage.requires.every(goal => run.resolved.includes(goal)));
  if (!waitingStage) return undefined;
  // Stage feedback describes the future transition. Reuse the completed safety
  // action instead, so waiting never suggests that the next stage has begun.
  const currentAction = [...pack.rules.interactions].reverse().find(rule => rule.outcome === 'correct' && rule.feedback
    && rule.grants.some(goal => waitingStage.requires.includes(goal))
    && rule.grants.every(goal => run.resolved.includes(goal)));
  return `${currentAction?.feedback ?? '保持当前状态。'}回到场景后继续等待。`;
}
