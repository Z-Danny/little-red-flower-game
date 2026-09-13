import copy from '@/content/journey-copy.json';
import skin from '@/content/journey-skin.json';
import timing from '@/content/journey-timing.json';

// View-only overrides. IDs, interaction rules and save keys never depend on display text.
export const journeyCopy = copy;
export const journeySkin = skin;
export const journeyTiming = timing;
const levels: Record<string, { title: string; preview: string }> = copy.levels;
export const levelTitle = (id: string, fallback: string) =>
  levels[id]?.title.trim() || fallback;
export const levelPreview = (id: string, fallback: string) =>
  levels[id]?.preview.trim() || fallback;
