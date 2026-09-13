import map from '@/content/journey-map.json';

export const journeyMap = map;
export type Progress = Readonly<Record<string, number>>;
export type MapNode = (typeof map.regions)[number]['nodes'][number];
export type Region = (typeof map.regions)[number];
export type NodeStatus = 'locked' | 'available' | 'complete';
export const regionFor = (id: string) =>
  map.regions.find((r) => r.nodes.some((n) => n.id === id));
export const nodeFor = (id: string) =>
  regionFor(id)?.nodes.find((n) => n.id === id);
export const isComplete = (progress: Progress, id: string) =>
  Object.hasOwn(progress, id) && progress[id] > 0;
export function nodeStatus(id: string, progress: Progress): NodeStatus {
  const region = regionFor(id);
  if (!region) return 'locked';
  if (isComplete(progress, id)) return 'complete';
  const prerequisite = region.nodes.find((n) => n.id === id)!.unlockAfter;
  // Scene positions may change; saved access follows stable level IDs.
  return prerequisite === null || isComplete(progress, prerequisite)
    ? 'available'
    : 'locked';
}
export const canEnter = (id: string, progress: Progress) =>
  nodeStatus(id, progress) !== 'locked';
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
