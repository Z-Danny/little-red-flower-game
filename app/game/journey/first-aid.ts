import chapter from '@/content/journey-first-aid.json';

/** Chapter metadata includes playable CPR/AED and six map-only previews. Runtime registration remains authoritative. */
export const firstAidChapter = chapter;
export const firstAidPreview = (id: string) => chapter.levels.find(level => level.id === id);
