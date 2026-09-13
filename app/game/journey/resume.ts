import { journeyMap, nodeFor, nodeStatus, type Progress } from './progress';
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
export function entryNode(progress: Progress) {
  const first = journeyMap.regions[0];
  return (
    first.nodes.find((n) => nodeStatus(n.id, progress) === 'available')?.id ??
    first.nodes[0].id
  );
}
export function resumeNode(progress: Progress, location?: JourneyLocation) {
  if (location && nodeFor(location.levelId)) return location.levelId;
  return (
    journeyMap.regions
      .flatMap((r) => r.nodes)
      .find((n) => nodeStatus(n.id, progress) === 'available')?.id ??
    entryNode(progress)
  );
}
