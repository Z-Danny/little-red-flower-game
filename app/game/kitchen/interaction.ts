import { layout, WORLD, type Box, type ItemId, type Point, type ZoneId } from './config';
import { personBox } from './animation';
import type { Run } from './model';
export const contains = (b: Box, p: Point) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
/** Coordinates always come from the rendered canvas, never from the viewport size. */
export const toWorld = (point: Point, rect: { left: number; top: number; width: number; height: number }): Point => ({
  x: (point.x - rect.left) / rect.width * WORLD.width,
  y: (point.y - rect.top) / rect.height * WORLD.height,
});
export function pickZone(p: Point): ZoneId {
  for (const id of ['pan', 'off', 'exit'] as const) if (contains(layout.zones[id], p)) return id;
  return 'miss';
}
export function pickSceneItem(p: Point, r: Run): ItemId | null {
  if (!r.evacuated && contains(personBox(r), p)) return 'person';
  if (!r.gasOff && contains(layout.gas, p)) return 'gas';
  return null;
}
