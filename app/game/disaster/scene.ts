import type { Box, DisasterPack, Point } from './schema';
import type { DisasterRun } from './model';
import { createCoverCamera, type SceneFraming } from '../display/camera';
export const center = (b: Box): Point => ({
  x: b.x + b.w / 2,
  y: b.y + b.h / 2,
});
export const inside = (p: Point, b: Box) =>
  p.x >= b.x && p.y >= b.y && p.x <= b.x + b.w && p.y <= b.y + b.h;
const interpolate = (a: Box, b: Box, t: number): Box => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  w: a.w + (b.w - a.w) * t,
  h: a.h + (b.h - a.h) * t,
});
export function objectPose(
  p: DisasterPack,
  r: DisasterRun,
  id: string,
): { box: Box; alpha: number } {
  const base = p.skin.sprites[id].box;
  let box = base,
    alpha = 1;
  if (p.rules.kind === 'prevention') return { box, alpha };
  if (id === 'person') {
    if (r.goals.includes('stairs')) box = p.skin.poses.personStairs;
    if (r.goals.includes('roof') || r.phase === 'evacuated')
      box = p.skin.poses.personRoof;
  }
  if (
    (id === 'water' && r.goals.includes('drinking')) ||
    (id === 'flashlight' && r.goals.includes('lighting')) ||
    (id === 'phone' && r.goals.includes('rescue'))
  )
    alpha = 0;
  if (['panel', 'foam', 'rope'].includes(id) && r.goals.includes('aid')) {
    box = p.skin.poses[id + 'Stored'] ?? base;
  }
  if (id === 'bag' && r.goals.includes('roof')) alpha = 0;
  if (r.pending) {
    const a = p.rules.actions.find((a) => a.id === r.pending!.id)!;
    const t = Math.min(1, r.pending.age / a.duration),
      ease = 1 - Math.pow(1 - t, 3);
    if (a.source === id) {
      if (a.motion === 'move')
        box = interpolate(box, p.skin.poses.personStairs, ease);
      if (a.motion === 'exit')
        box = interpolate(box, p.skin.poses.personRoof, ease);
      if (a.motion === 'pack' || a.motion === 'call') {
        const destination =
            a.motion === 'pack'
              ? p.skin.sprites.bag.box
              : r.goals.includes('stairs')
                ? p.skin.poses.personStairs
                : p.skin.sprites.person.box,
          c = center(destination);
        box = interpolate(
          base,
          {
            x: c.x - base.w * 0.1,
            y: c.y - base.h * 0.1,
            w: base.w * 0.2,
            h: base.h * 0.2,
          },
          ease,
        );
        alpha = 1 - t;
      }
    }
    if (a.motion === 'assemble' && ['panel', 'foam', 'rope'].includes(id))
      box = interpolate(base, p.skin.poses[id + 'Stored'] ?? base, ease);
    if (a.motion === 'exit' && id === 'bag') {
      const b = p.skin.poses.personRoof;
      box = interpolate(
        base,
        { x: b.x + 8, y: b.y + b.h * 0.4, w: base.w * 0.25, h: base.h * 0.25 },
        ease,
      );
      alpha = 1 - t;
    }
  }
  return { box, alpha };
}
export function targetBox(p: DisasterPack, r: DisasterRun, id: string) {
  return p.skin.sprites[id] ? objectPose(p, r, id).box : p.skin.zones[id]?.box;
}
/** UI and pointer inverse share one uniform scale. No independent x/y stretching. */
export function disasterCamera(
  width: number,
  height: number,
  w = 720,
  h = 1280,
  framing?: SceneFraming,
  screenObstacles: Box[] = [],
) {
  return createCoverCamera(framing ?? {sceneBounds:{x:0,y:0,w,h}}, width, height, {}, screenObstacles);
}
