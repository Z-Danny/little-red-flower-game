import { getLevel } from '@/app/game/levels';
import map from '@/content/journey-map.json';

export const journeyMap = map;
const TEST_UNLOCK = Symbol('test-unlock-all');
export type Progress = Readonly<Record<string, number>> & { readonly [TEST_UNLOCK]?: boolean };
/** Runtime-only access override: never invent scores or persist a test flag in saves. */
export function withTestUnlock(progress: Progress, enabled: boolean): Progress {
  return enabled ? { ...progress, [TEST_UNLOCK]: true } : progress;
}
export type MapNode = (typeof map.regions)[number]['nodes'][number];
export type Region = (typeof map.regions)[number];
export type NodeStatus = 'locked' | 'available' | 'complete';
export const regionFor = (id: string) =>
  map.regions.find((r) => r.nodes.some((n) => n.id === id));
export const nodeFor = (id: string) =>
  regionFor(id)?.nodes.find((n) => n.id === id);
export const isComplete = (progress: Progress, id: string) =>
  Object.hasOwn(progress, id) && progress[id] > 0;
export function nodeStatus(id: string, progress: Progress, allLevelsUnlocked = false): NodeStatus {
  const region = regionFor(id);
  if (!region || !getLevel(id)?.playable) return 'locked';
  if (isComplete(progress, id)) return 'complete';
  if (progress[TEST_UNLOCK]) return 'available';
  const prerequisite = region.nodes.find((n) => n.id === id)!.unlockAfter;
  // Scene positions may change; saved access follows stable level IDs.
  return allLevelsUnlocked || prerequisite === null || isComplete(progress, prerequisite)
    ? 'available'
    : 'locked';
}
export const canEnter = (id: string, progress: Progress, allLevelsUnlocked = false) =>
  nodeStatus(id, progress, allLevelsUnlocked) !== 'locked';
export const regionProgress = (region: Region, progress: Progress) =>
  region.nodes.filter((n) => isComplete(progress, n.id)).length;
export function nextNode(id: string, progress: Progress) {
  const region = regionFor(id);
  if (!region) return undefined;
  const index = region.nodes.findIndex((n) => n.id === id);
  return (
    map.regions
      .flatMap((r) => r.nodes)
      .find(
        (n) =>
          n.unlockAfter === id && nodeStatus(n.id, progress) === 'available',
      ) ??
    region.nodes
      .slice(index + 1)
      .find((n) => nodeStatus(n.id, progress) === 'available') ??
    region.nodes.find((n) => nodeStatus(n.id, progress) === 'available') ??
    map.regions
      .flatMap((r) => r.nodes)
      .find((n) => nodeStatus(n.id, progress) === 'available')
  );
}
export const flowerTotal = (p: Progress) =>
  map.regions
    .flatMap((r) => r.nodes)
    .reduce((n, node) => n + (p[node.id] ?? 0), 0);
export const plantedTotal = (p: Progress) =>
  map.regions.reduce((n, r) => n + regionProgress(r, p), 0);
export type Planting = {
  levelId: string;
  before: Record<string, number>;
  reward: number;
  nonce: number;
};
export { journeyTiming } from './presentation';
