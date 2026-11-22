import { archipelagoIslands } from './archipelago';
import { journeyMap } from './progress';
import type { Region } from './progress';
import data from '@/content/island-level-maps.json';

// New map coordinates are presentation data; nodeStatus still uses the saved journey graph.
export const authoredIslandScenes = data.maps.map(map => {
  const region: Region = {
    id: map.id, name: map.name, short: map.name, subtitle: '', medal: '',
    image: map.image, width: map.width, height: map.height, top: 0,
    nodes: map.stops.map(stop => ({
      id: stop.id, x: stop.x, y: stop.y, place: stop.title,
      signSide: stop.x <= map.width / 2 ? 'right' : 'left',
      unlockAfter: null,
    })),
    restoration: { flowers: [], lights: [] },
  };
  return { region, levelIds: map.stops.map(stop => stop.id), stops: map.stops };
});

export const islandSceneFor = (islandId: string) =>
  authoredIslandScenes.find(scene => scene.region.id === islandId);

/** View-only subsets: original paintings, coordinates and unlock links are untouched. */
export function originalScenesForIsland(islandId: string) {
  const island = archipelagoIslands.find(item => item.id === islandId);
  const ids: readonly string[] = island?.levelIds ?? [];
  return journeyMap.regions.map(region => ({
    region,
    levelIds: ids.filter(id => region.nodes.some(node => node.id === id)),
  })).filter(scene => scene.levelIds.length > 0);
}
