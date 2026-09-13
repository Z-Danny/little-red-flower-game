import { enabled, matches, findRule } from './engine';
import { contains, pickZone } from './scene';
import type { LevelPackage, Point, Pose, Run } from './schema';

/** Only the selected object's declared destinations, in the skin's draw order.
 * Missing prerequisites remain explainable through neutral/early rules. This
 * filter never invents a correct action or expands a target's visible bounds.
 */
export function relevantZones(pack: LevelPackage, run: Run, source: string): string[] {
  const object = pack.rules.objects.find(o => o.id === source);
  if (!object || !['drag','both'].includes(object.input) || !enabled(object, run)) return [];
  const candidates = new Set(pack.rules.interactions.filter(rule => rule.source === source && rule.mode === 'drop').map(rule => rule.target));
  return Object.keys(pack.skin.zones).filter(id => candidates.has(id)
    && (!pack.skin.zoneConditions?.[id] || matches(pack, run, pack.skin.zoneConditions[id]))
    && !!findRule(pack,run,{source,mode:'drop',target:id}));
}

/** Preserve ordinary hit ordering, but do not let another prop's zone steal a
 * drop where differently purposed regions legitimately overlap. */
export function pickRelevantZone(pack: LevelPackage, run: Run, point: Point, source: string): string | undefined {
  const candidates = relevantZones(pack, run, source), ordinary = pickZone(pack, point, run);
  if (ordinary && candidates.includes(ordinary)) return ordinary;
  return candidates.find(id => contains(pack.skin.zones[id], point));
}

/** The preview and release share this exact resolver. A visible item centered
 * inside the drawn target is accepted even when grabbed near its edge. Pointer
 * wins first, preserving tap-to-place and intentional near-edge drops. */
export function resolveDragPlacement(pack: LevelPackage, run: Run, source: string, point: Point, offset: Point, pose: Pose) {
  const center={x:point.x-offset.x+pose.w/2,y:point.y-offset.y+pose.h/2};
  return {target:pickRelevantZone(pack,run,point,source)??pickRelevantZone(pack,run,center,source),point:center};
}
