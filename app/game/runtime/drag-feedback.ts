import { findRule } from './engine';
import type { Run } from './schema';
import type { LevelPackage } from './schema';
export function dragFeedback(
  pack: LevelPackage,
  source: string,
  target: string | null,
  moving: boolean,
  run: Run,
) {
  const name = pack.rules.objects.find((o) => o.id === source)?.label ?? '物品';
  if (target && run) {
    const rule = findRule(pack, run, { source, mode: 'drop', target });
    if (rule?.outcome === 'danger') return '禁止放置：' + rule.feedback;
  }
  if (target)
    return '松手放到：' + (pack.skin.zoneLabels?.[target] ?? '当前框选区域');
  return moving
    ? '尚未对准目标区域，移动到框内再松手。'
    : '已选中' + name + '：拖到目标框，或点选目标区域。';
}
