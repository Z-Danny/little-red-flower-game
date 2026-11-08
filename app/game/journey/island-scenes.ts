import { archipelagoIslands } from './archipelago';
import { journeyMap } from './progress';

/** View-only subsets: original paintings, coordinates and unlock links are untouched. */
export function originalScenesForIsland(islandId: string) {
  const island = archipelagoIslands.find(item => item.id === islandId);
  const ids: readonly string[] = island?.levelIds ?? [];
  return journeyMap.regions.map(region => ({
    region,
    levelIds: ids.filter(id => region.nodes.some(node => node.id === id)),
  })).filter(scene => scene.levelIds.length > 0);
}
