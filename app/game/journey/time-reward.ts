/** Scoring is independent of engine success/failure, art and save storage.
 * elapsedMs is the engine's active clock (including authored time penalties),
 * captured at success, before the non-interactive ending. */
export type CompletionTiming = { elapsedMs: number };
export type TimeReward = CompletionTiming & { referenceSeconds: number; flowers: number };
export function rewardThresholds(referenceSeconds: number) {
  if (!Number.isFinite(referenceSeconds) || referenceSeconds <= 0) throw new Error('无效的评分参考时长。');
  return { threeMs: referenceSeconds * 500, twoMs: referenceSeconds * 800 };
}
export function timeReward(elapsedMs: number, referenceSeconds: number): TimeReward {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('无效的通关用时。');
  const { threeMs, twoMs } = rewardThresholds(referenceSeconds);
  return { elapsedMs, referenceSeconds, flowers: elapsedMs <= threeMs ? 3 : elapsedMs <= twoMs ? 2 : 1 };
}
/** Round upwards so a run just above a boundary never displays as at/below it. */
export const rewardSecondsLabel = (ms: number) => String(Math.ceil(ms / 100) / 10);
export function rewardRuleLabel(seconds: number) {
  const { threeMs, twoMs } = rewardThresholds(seconds);
  return '≤' + rewardSecondsLabel(threeMs) + '秒：3朵 · ≤' + rewardSecondsLabel(twoMs) + '秒：2朵 · 其余通关：1朵';
}
