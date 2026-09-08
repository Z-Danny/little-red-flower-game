import { WORLD, cameraSafe } from './config';
/** Fill the portrait viewport without stretching sprites or cropping the interaction-safe region. */
export function cameraFor(width: number, height: number) {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) return { scale: 1, x: 0, y: 0 };
  const cover = Math.max(width / WORLD.width, height / WORLD.height);
  const scale = Math.min(cover, width / cameraSafe.width, height / cameraSafe.height);
  return { scale, x: (width - WORLD.width * scale) / 2, y: (height - WORLD.height * scale) / 2 };
}
