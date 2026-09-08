import { items, layout, sceneItems, WORLD, type AssetId, type Box, type ItemId, type Point, type ZoneId } from './config';
import { personBox } from './animation';
import { cameraFor } from './camera';
import { emotion, type Run } from './model';
export const contains = (b: Box, p: Point) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
/** Coordinates always come from the rendered canvas, never from the viewport size. */
export const toWorld = (point: Point, rect: { left: number; top: number; width: number; height: number }): Point => {
  const camera = cameraFor(rect.width, rect.height);
  return { x: (point.x - rect.left - camera.x) / camera.scale, y: (point.y - rect.top - camera.y) / camera.scale };
};
export function pickZone(p: Point): ZoneId {
  for (const id of ['pan', 'off', 'exit'] as const) if (contains(layout.zones[id], p)) return id;
  return 'miss';
}
export function pickSceneItem(p: Point, r: Run, alpha?: (asset: AssetId, box: Box, p: Point) => boolean): ItemId | null {
  // Front-to-back picking mirrors the renderer. Transparent sprite margins pass through.
  const hit = (asset: AssetId, box: Box) => contains(box, p) && (!alpha || alpha(asset, box, p));
  if (!r.evacuated && hit(emotion(r), personBox(r))) return 'person';
  for (const id of [...sceneItems].reverse()) {
    if (id === 'lid' && r.covered || r.action?.item === id) continue;
    if (hit(items[id].asset, layout.props[id])) return id;
  }
  if (!r.gasOff && hit('gas', layout.gas)) return 'gas';
  return null;
}
