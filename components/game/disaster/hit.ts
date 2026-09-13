import type { DisasterPack, Point } from '@/app/game/disaster/schema';
import type { DisasterRun } from '@/app/game/disaster/model';
import { objectPose, inside, targetBox } from '@/app/game/disaster/scene';
import type { DisasterArt } from './art';
export function hitObject(
  p: DisasterPack,
  r: DisasterRun,
  art: DisasterArt,
  point: Point,
) {
  if (p.rules.kind === 'prevention') {
    const x = Math.floor(point.x),
      y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= p.skin.width || y >= p.skin.height) return null;
    const at = (y * art.mask.width + x) * 4,
      d = art.mask.data;
    return (
      Object.keys(p.skin.sprites).find((id) =>
        p.skin.sprites[id].color.every((v, i) => d[at + i] === v),
      ) ?? null
    );
  }
  for (const id of Object.keys(p.skin.sprites).reverse()) {
    const { box, alpha } = objectPose(p, r, id);
    if (alpha < 0.2 || !inside(point, box)) continue;
    const a = art.sprites[id],
      x = Math.min(
        a.width - 1,
        Math.floor(((point.x - box.x) / box.w) * a.width),
      ),
      y = Math.min(
        a.height - 1,
        Math.floor(((point.y - box.y) / box.h) * a.height),
      );
    if (a.data[(y * a.width + x) * 4 + 3] >= 96) return id;
  }
  return null;
}
export function dropTarget(
  p: DisasterPack,
  r: DisasterRun,
  point: Point,
  source: string,
) {
  // Explicit safe exit wins at overlapping stair boundaries; hazardous targets never auto-snap.
  const candidates = [
    ...new Set(
      p.rules.actions.filter((a) => a.source === source).map((a) => a.target),
    ),
  ];
  const order = [
    ...['roof', 'wire', 'car', 'outside'].filter((id) =>
      candidates.includes(id),
    ),
    ...candidates.filter(
      (id) => !['roof', 'wire', 'car', 'outside'].includes(id),
    ),
    ...Object.keys(p.skin.sprites).filter((id) => id !== source),
    ...Object.keys(p.skin.zones),
  ];
  return (
    order.find((id) => {
      const b = targetBox(p, r, id);
      return b && inside(point, b);
    }) ?? null
  );
}
