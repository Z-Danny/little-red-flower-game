import { flowerTotal, journeyMap, nodeFor, nodeStatus, type Progress } from './progress';
export const JOURNEY_LOCATION_KEY = 'little-red-flower-journey-location-v1';
export type JourneyLocation = { levelId: string; visitedAt: number };
export type JourneyLocations = Record<string, JourneyLocation>;
/** Presentation bookmarks only. Never changes rewards, level rules or unlocked state. */
export function parseLocations(raw: string | null): JourneyLocations {
  const clean: JourneyLocations = Object.create(null);
  try {
    const value: unknown = JSON.parse(raw ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return clean;
    for (const [id, entry] of Object.entries(value)) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.levelId === 'string' &&
        Number.isFinite(entry.visitedAt) &&
        entry.visitedAt > 0 &&
        nodeFor(entry.levelId)
      ) {
        clean[id] = { levelId: entry.levelId, visitedAt: entry.visitedAt };
      }
    }
  } catch {
    /* A malformed bookmark never affects the leaderboard save. */
  }
  return clean;
}
export function hasJourneyRecord(progress: Progress, location?: JourneyLocation) {
  return flowerTotal(progress) > 0 || !!(
    location &&
    Number.isFinite(location.visitedAt) &&
    location.visitedAt > 0 &&
    nodeStatus(location.levelId, progress) !== 'locked'
  );
}
export function entryNode(progress: Progress) {
  const first = journeyMap.regions[0];
  return (
    first.nodes.find((n) => nodeStatus(n.id, progress) === 'available')?.id ??
    first.nodes[0].id
  );
}
export function resumeNode(progress: Progress, location?: JourneyLocation) {
  if (location && nodeStatus(location.levelId, progress) !== 'locked')
    return location.levelId;
  return (
    journeyMap.regions
      .flatMap((r) => r.nodes)
      .find((n) => nodeStatus(n.id, progress) === 'available')?.id ??
    entryNode(progress)
  );
}
