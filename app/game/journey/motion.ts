import data from '@/content/journey-motion.json';
export type MotionPoint = [number, number];
export type SpriteTrack = {
  asset: string;
  path: [MotionPoint, MotionPoint, MotionPoint, MotionPoint];
  size: [number, number];
  seconds: number;
  copies?: number;
  phase?: number;
  scale?: [number, number];
  rotate?: [number, number];
  opacity?: [number, number, number];
  pivot?: [number, number];
  envelope?: 'burst' | 'fall';
  waypoints?: MotionPoint[];
};
export type SceneCue =
  | { kind: 'call'; x: number; y: number; color: string }
  | {
      kind: 'footsteps';
      points: { x: number; y: number; rotate: number }[];
      size: number;
      color: string;
      seconds: number;
    }
  | {
      kind: 'route';
      path: string;
      color: string;
      width?: number;
      dash?: [number, number];
    };
export type MotionRecipe = {
  tracks: SpriteTrack[];
  cues?: SceneCue[];
  appearance?: {
    alpha: number;
    saturation: number;
    brightness: number;
    contrast: number;
    edge: string;
  };
};
export type MotionConfig = {
  version: number;
  assets: Record<string, string>;
  recipes: Record<string, MotionRecipe>;
};
// JSON widens tuple lengths; the config test validates every track's dimensions.
export const motionConfig = data as unknown as MotionConfig;
export function motionFor(id?: string, config: MotionConfig = motionConfig) {
  return id ? config.recipes[id] : undefined;
}
/** Cubic Bezier in the effect's 160 × 200 coordinate system, no game state. */
export function sampleMotion(track: SpriteTrack, t: number) {
  const q = 1 - t,
    [a, b, c, d] = track.path;
  const mix = (pair: [number, number]) => pair[0] + (pair[1] - pair[0]) * t;
  const cursor = t * ((track.waypoints?.length ?? 1) - 1);
  const start = track.waypoints?.[Math.floor(cursor)];
  const end = track.waypoints?.[Math.ceil(cursor)];
  const between = cursor - Math.floor(cursor);
  return {
    x:
      start && end
        ? start[0] + (end[0] - start[0]) * between
        : q * q * q * a[0] +
          3 * q * q * t * b[0] +
          3 * q * t * t * c[0] +
          t * t * t * d[0],
    y:
      start && end
        ? start[1] + (end[1] - start[1]) * between
        : q * q * q * a[1] +
          3 * q * q * t * b[1] +
          3 * q * t * t * c[1] +
          t * t * t * d[1],
    scale: mix(track.scale ?? [1, 1]),
    rotate: mix(track.rotate ?? [0, 0]),
  };
}
