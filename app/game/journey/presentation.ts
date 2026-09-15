import copy from '@/content/journey-copy.json';
import skin from '@/content/journey-skin.json';
import timing from '@/content/journey-timing.json';
import fog from '@/content/journey-fog.json';

// View-only overrides. IDs, interaction rules and save keys never depend on display text.
export const journeyCopy = copy;
export const journeySkin = skin;
export const journeyTiming = timing;
// Local scenery bounds belong to the artwork, never to unlock rules or saves.
export const journeyFog: Record<
  string,
  {
    image: string;
    width: number;
    height: number;
    areas: Record<
      string,
      { x: number; y: number; width: number; height: number }
    >;
  }
> = fog.regions;
const levels: Record<string, { title: string; preview: string }> = copy.levels;
export const levelTitle = (id: string, fallback: string) =>
  levels[id]?.title.trim() || fallback;
export const levelPreview = (id: string, fallback: string) =>
  levels[id]?.preview.trim() || fallback;
