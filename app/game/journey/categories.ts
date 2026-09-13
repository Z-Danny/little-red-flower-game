import taxonomy from '@/content/journey-categories.json';
import { journeyMap, regionProgress, type Progress } from './progress';
export const journeyCategories = taxonomy.categories;
export const categorySource = taxonomy.source;
export type JourneyCategory = (typeof journeyCategories)[number];
export const mapsForCategory = (category: JourneyCategory) =>
  journeyMap.regions.filter((r) => category.regionIds.includes(r.id));
export const categoryForRegion = (regionId: string) =>
  journeyCategories.find((c) => c.regionIds.includes(regionId));
export function categoryProgress(
  category: JourneyCategory,
  progress: Progress,
) {
  const maps = mapsForCategory(category);
  const total = maps.reduce((n, r) => n + r.nodes.length, 0);
  const completed = maps.reduce((n, r) => n + regionProgress(r, progress), 0);
  return {
    total,
    completed,
    open: total > 0,
    earned: total > 0 && completed === total,
  };
}
