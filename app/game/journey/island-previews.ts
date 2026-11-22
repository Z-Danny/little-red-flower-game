import data from '@/content/island-level-maps.json';

// Display-only drafts never enter the journey graph, playable registry or saves.
export const islandPlaceholderStops = data.maps.flatMap(map => map.stops.filter(stop => stop.placeholder));
const stopsById = new Map(islandPlaceholderStops.map(stop => [stop.id, stop]));
export const islandPreviewFor = (levelId: string) => stopsById.get(levelId);
