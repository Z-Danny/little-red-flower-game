import { getLevel } from '@/app/game/levels';
import { firstAidPreview } from './first-aid';
import { canEnter, nodeFor, nodeStatus, type Progress } from './progress';

/** One prerequisite and replay policy for every map, including not-yet-playable entries. */
export function journeyEntryFor(id: string, completed: Progress, allLevelsUnlocked = false) {
  const level = getLevel(id);
  const preview = firstAidPreview(id);
  if (!level && !preview) return undefined;
  const status = nodeStatus(id, completed, allLevelsUnlocked);
  const prerequisiteId = nodeFor(id)?.unlockAfter ?? '';
  const prerequisite = getLevel(prerequisiteId)?.title ?? firstAidPreview(prerequisiteId)?.title ?? '前置关卡';
  const playable = !!level?.playable;
  return {
    id,
    title: level?.title ?? preview!.title,
    status,
    canStart: playable && canEnter(id, completed, allLevelsUnlocked),
    lockedReason: !playable
      ? `${preview?.preview ?? ''} 本关玩法尚未开放。`
      : status === 'locked'
        ? `先完成「${prerequisite}」，即可解锁本关。`
        : undefined,
    lockedLabel: !playable ? '玩法待开放' : '尚未解锁',
    startLabel: status === 'complete' ? '再玩一次' : undefined,
    note: preview && playable
      ? `第四章 · ${preview.number} · ${preview.difficulty}｜情境处置与协作练习`
      : preview
      ? `第四章 · ${preview.number} · ${preview.difficulty}｜地图预览，尚未开放训练。`
      : undefined,
  };
}
