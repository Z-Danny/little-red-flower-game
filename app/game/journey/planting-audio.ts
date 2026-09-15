import timing from '@/content/journey-timing.json';
import {
  isComplete,
  journeyMap,
  nodeStatus,
  type Planting,
  type Progress,
} from './progress';

export type PlantingCue = 'land' | 'sprout' | 'bloom' | 'count' | 'unlock';
const stages: readonly PlantingCue[] = [
  'land',
  'sprout',
  'bloom',
  'count',
  'unlock',
];

/** Only announce access that this newly completed level actually granted. */
export function plantingUnlocks(planting: Planting, completed: Progress) {
  return journeyMap.regions
    .flatMap((region) => region.nodes)
    .filter(
      (node) =>
        node.unlockAfter === planting.levelId &&
        nodeStatus(node.id, planting.before) === 'locked' &&
        nodeStatus(node.id, completed) === 'available',
    )
    .map((node) => node.id);
}

/** Follow the animation's age, including its background pause and reduced motion. */
export class PlantingAudioTracker {
  private readonly played = new Map<number, Set<PlantingCue>>();

  take(
    planting: Planting | null,
    completed: Progress,
    age: number,
  ): PlantingCue[] {
    if (
      !planting ||
      !Number.isFinite(age) ||
      age < 0 ||
      planting.reward <= 0 ||
      isComplete(planting.before, planting.levelId) ||
      !isComplete(completed, planting.levelId)
    )
      return [];
    let seen = this.played.get(planting.nonce);
    if (!seen) {
      seen = new Set<PlantingCue>();
      this.played.set(planting.nonce, seen);
      // A long-running map session only needs recent animation identities.
      if (this.played.size > 32)
        this.played.delete(this.played.keys().next().value!);
    }
    const unlocked = plantingUnlocks(planting, completed).length > 0;
    const due = stages.filter(
      (stage) =>
        age >= timing[stage] &&
        !seen.has(stage) &&
        (stage !== 'unlock' || unlocked),
    );
    for (const stage of due) seen.add(stage);
    return due;
  }
}
