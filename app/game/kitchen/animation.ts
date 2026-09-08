import { layout, type Box, type ItemId, type Point } from './config';
import { type Run } from './model';
export const center = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
export function mixBox(a: Box, b: Box, p: number): Box {
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) };
}
export function personBox(r: Run): Box {
  if (r.evacuated) return layout.evacuated;
  if (r.action?.item === 'person') {
    const a = r.action;
    const released = { ...layout.person, x: a.at.x - layout.person.w / 2, y: a.at.y - layout.person.h / 2 };
    return mixBox(released, a.kind === 'evacuate' ? layout.evacuated : layout.person, ease(a.age / a.duration));
  }
  const step = r.reaction === 'panicked' ? Math.sin(Math.min(1, (2500 - r.reactionAge) / 400) * Math.PI / 2) * 22 : 0;
  return { ...layout.person, x: layout.person.x + step };
}
export function itemBox(item: ItemId, r: Run): Box {
  return item === 'person' ? personBox(r) : item === 'gas' ? layout.gas : layout.props[item];
}
export function movingItem(r: Run): { box: Box; angle: number; opacity: number } | null {
  const a = r.action;
  if (!a || a.item === 'person' || a.item === 'gas') return null;
  const p = Math.min(1, a.age / a.duration), home = itemBox(a.item, r);
  let to = center(home), point = a.at, angle = 0, t = ease(p);
  if (a.kind === 'cover') to = center(layout.lid);
  else if (a.kind === 'water' || a.kind === 'cloth') {
    if (p < .58) { to = center(layout.pan); angle = a.kind === 'water' ? -.7 * Math.sin(p / .58 * Math.PI) : .15 * Math.sin(p / .58 * Math.PI); t = ease(p / .58); }
    else { point = center(layout.pan); t = ease((p - .58) / .42); }
  } else if (a.kind === 'spray' || a.kind === 'miss-spray') { t = ease(Math.max(0, (p - .62) / .38)); }
  else angle = Math.sin(p * Math.PI * 5) * .15;
  const width = a.kind === 'cover' ? lerp(home.w, layout.lid.w, t) : home.w;
  const height = a.kind === 'cover' ? lerp(home.h, layout.lid.h, t) : home.h;
  return { box: { x: lerp(point.x, to.x, t) - width / 2, y: lerp(point.y, to.y, t) - height / 2 - Math.sin(p * Math.PI) * 18, w: width, h: height }, angle, opacity: 1 };
}
