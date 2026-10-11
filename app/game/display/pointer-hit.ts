import type { Point } from '../runtime/schema';

/** CSS-pixel tolerance, independent of canvas backing resolution. Never a large box hit. */
export function pointerRadius(pointerType: string, scale: number) {
  return Number.isFinite(scale) && scale > 0
    ? Math.min(24, (pointerType === 'touch' ? 10 : 6) / scale)
    : 0;
}

/** Exact pixels win. false denotes a foreground/disabled blocker, null empty space.
 * Nearby opaque pixels are sampled only inside a small disk. Ambiguous neighbours
 * do not auto-select either object; distant transparent holes remain misses. */
export function nearestPixelHit(
  point: Point,
  radius: number,
  probe: (p: Point) => string | null | false,
): string | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const direct = probe(point);
  if (direct !== null) return direct || null;
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const r = Math.min(24, radius),
    distances = new Map<string, number>();
  for (let dy = -Math.ceil(r); dy <= r; dy++)
    for (let dx = -Math.ceil(r); dx <= r; dx++) {
      const distance = Math.hypot(dx, dy);
      if (!distance || distance > r) continue;
      const hit = probe({ x: point.x + dx, y: point.y + dy });
      if (hit && distance < (distances.get(hit) ?? Infinity))
        distances.set(hit, distance);
    }
  const ranked = [...distances].sort((a, b) => a[1] - b[1]);
  if (!ranked.length || (ranked[1] && ranked[1][1] - ranked[0][1] <= 1))
    return null;
  return ranked[0][0];
}
