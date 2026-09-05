import type { LevelConfig } from './types';

export type ObjectiveDecision =
  | { status: 'missing' | 'already-done' }
  | { status: 'blocked'; message: string }
  | { status: 'ready'; message: string };

export function decideObjective(level: LevelConfig, resolved: ReadonlySet<string>, id: string): ObjectiveDecision {
  const objective = level.objectives?.find((item) => item.id === id);
  if (!objective) return { status: 'missing' };
  if (resolved.has(id)) return { status: 'already-done' };
  const ready = (objective.requires ?? []).every((requirement) => resolved.has(requirement));
  if (!ready) return { status: 'blocked', message: objective.blockedText ?? '先处理前置隐患。' };
  return { status: 'ready', message: objective.resolvedText };
}

export function completedGoalIds(level: LevelConfig, resolved: ReadonlySet<string>) {
  return level.goals.filter((goal) => resolved.has(goal));
}

export function isLevelComplete(level: LevelConfig, resolved: ReadonlySet<string>) {
  return completedGoalIds(level, resolved).length === level.goals.length;
}
