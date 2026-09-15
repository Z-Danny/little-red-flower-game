import data from '@/content/journey-routes.json';
import type { MapNode, Region } from './progress';

type Point = readonly number[];
type RouteMap = {
  image: string;
  width: number;
  height: number;
  segments: { from: string; to: string; points: Point[] }[];
};
const routes: Record<string, RouteMap> = data.regions;

/** Interpolate the surveyed road centreline in the map's own coordinates. */
export function roadPath(points: readonly Point[]) {
  const number = (value: number) => Number(value.toFixed(2));
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)],
      b = points[i];
    const c = points[i + 1],
      e = points[Math.min(points.length - 1, i + 2)];
    d += ` C${number(b[0] + (c[0] - a[0]) / 6)} ${number(b[1] + (c[1] - a[1]) / 6)},${number(c[0] - (e[0] - b[0]) / 6)} ${number(c[1] - (e[1] - b[1]) / 6)},${c[0]} ${c[1]}`;
  }
  return d;
}

export function routeFor(region: Region, from: MapNode, to: MapNode) {
  const map = routes[region.id];
  // An annotation belongs to one composition; never reuse it for a replacement image.
  const segment =
    map?.image === region.image &&
    map.width === region.width &&
    map.height === region.height
      ? map.segments.find(
          (route) => route.from === from.id && route.to === to.id,
        )
      : undefined;
  const points = segment?.points;
  if (
    points &&
    points.length >= 2 &&
    points[0][0] === from.x &&
    points[0][1] === from.y &&
    points[points.length - 1][0] === to.x &&
    points[points.length - 1][1] === to.y
  ) {
    return { d: roadPath(points), source: 'annotated' };
  }
  return {
    d: `M${from.x} ${from.y} C${from.x} ${(from.y + to.y) / 2},${to.x} ${(from.y + to.y) / 2},${to.x} ${to.y}`,
    source: 'automatic',
  };
}
