import introductions from '@/content/level-introductions.json';

export type LevelIntroduction = {
  description: string;
  startLabel: string;
};

// Presentation-only copy: changes never affect level rules or save keys.
const byLevel: Record<string, LevelIntroduction> = introductions;

export function getLevelIntroduction(
  id: string,
  fallbackDescription = '观察眼前的场景，开始这次守护行动。',
): LevelIntroduction {
  const introduction = Object.hasOwn(byLevel, id) ? byLevel[id] : undefined;
  return {
    description: introduction?.description || fallbackDescription,
    startLabel: introduction?.startLabel || '开始挑战',
  };
}
