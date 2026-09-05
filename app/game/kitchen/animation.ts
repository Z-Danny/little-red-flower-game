import { items, layout, type Box, type ItemId, type Point } from './config';
import { type Run } from './model';
export const center = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
export function mixBox(a: Box, b: Box, p: number): Box {
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) };
}
export function personBox(r: Run): Box {
  if (r.evacuated) return layout.evacuated;
  if (r.action?.kind === 'evacuate') return mixBox(layout.person, layout.evacuated, ease(r.action.age / r.action.duration));
  const step = r.reaction === 'panicked' ? Math.sin(Math.min(1, (2500 - r.reactionAge) / 400) * Math.PI / 2) * 22 : 0;
  return { ...layout.person, x: layout.person.x + step };
}
export function itemBox(item: ItemId, r: Run): Box {
  return item === 'person' ? personBox(r) : item === 'gas' ? layout.gas : { x: 0, y: 0, w: items[item].w, h: items[item].h };
}
export function movingItem(r: Run): { box: Box; angle: number; opacity: number } | null {
  const a = r.action;
  if (!a || a.item === 'person' || a.item === 'gas') return null;
  const p = Math.min(1, a.age / a.duration), item = items[a.item];
  let to = a.from, point = a.at, angle = 0, opacity = 1;
  if (a.kind === 'cover') to = center(layout.lid);
  else if (a.kind === 'water' || a.kind === 'cloth') {
    if (p < .58) { to = center(layout.pan); angle = a.kind === 'water' ? -.7 * Math.sin(p * Math.PI) : .15; }
    else { point = center(layout.pan); }
  } else if (a.kind === 'spray' || a.kind === 'miss-spray') { to = a.at; opacity = p > .75 ? (1 - p) * 4 : 1; }
  else angle = Math.sin(p * Math.PI * 5) * .15;
  const t = ease(a.kind === 'water' || a.kind === 'cloth' ? p < .58 ? p / .58 : (p - .58) / .42 : p);
  const width = a.kind === 'cover' ? lerp(item.w, layout.lid.w, t) : item.w;
  const height = a.kind === 'cover' ? lerp(item.h, layout.lid.h, t) : item.h;
  return { box: { x: lerp(point.x, to.x, t) - width / 2, y: lerp(point.y, to.y, t) - height / 2 - Math.sin(p * Math.PI) * 18, w: width, h: height }, angle, opacity };
}
