import { journeyCategories, mapsForCategory } from './categories';
import { nodeStatus, type Progress } from './progress';

export type ArchipelagoCategoryId = 'nature' | 'public' | 'home';
export type ArchipelagoSound = 'select' | 'land';
export type ArchipelagoPhase = 'idle' | 'selecting' | 'landing' | 'departing';

// Literal asset paths are also the standalone HTML exporter's asset manifest.
export const archipelagoArt = {
  entry: '/ui/archipelago-v1/entry-island.png',
  sky: '/ui/archipelago-v1/sky-background.png',
  cloud: '/ui/archipelago-v1/cloud.png',
  plaque: '/ui/archipelago-v1/wood-plaque.png',
  flag: '/ui/archipelago-v1/current-flag.png',
} as const;

export const archipelagoIslands = [
  {
    id: 'nature',
    name: '自然灾害',
    art: '/ui/archipelago-v1/nature-island.png',
    flag: { x: 34, y: 34 },
  },
  {
    id: 'public',
    name: '公共安全',
    art: '/ui/archipelago-v1/public-island.png',
    flag: { x: 12, y: 77 },
  },
  {
    id: 'home',
    name: '居家校园办公',
    art: '/ui/archipelago-v1/home-island.png',
    flag: { x: 63, y: 77 },
  },
] as const;

export const archipelagoTiming = {
  flagTravel: 350,
  departure: 620,
  enter: 800,
  sameEnter: 250,
  reducedEnter: 160,
} as const;

export function archipelagoCategory(id: string) {
  return (
    archipelagoIslands.find((island) => island.id === id) ??
    archipelagoIslands[0]
  );
}

/** Progress and stable level IDs select the destination, never art coordinates. */
export function archipelagoDestinationId(
  categoryId: string,
  completed: Progress,
): string | null {
  const category = journeyCategories.find((item) => item.id === categoryId);
  if (!category) return null;
  const nodes = mapsForCategory(category).flatMap((region) => region.nodes);
  return (
    (
      nodes.find((node) => nodeStatus(node.id, completed) === 'available') ??
      nodes[0]
    )?.id ?? null
  );
}
