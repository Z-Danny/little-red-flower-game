import { getLevel, getPackage } from '../levels';
import { getHunt } from '../scene-hunt/registry';
import { getDisaster } from '../disaster/registry';
/** Match GameApp's engine precedence; legacy catalog metadata can differ. */
export function rewardReferenceSeconds(id: string) {
  const seconds = getDisaster(id)?.rules.seconds ?? getHunt(id)?.rules.seconds
    ?? getPackage(id)?.rules.risk.seconds ?? getLevel(id)?.riskSeconds;
  if (!seconds || !Number.isFinite(seconds)) throw new Error('找不到本关评分时长。');
  return seconds;
}
