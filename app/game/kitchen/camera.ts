import { WORLD, framing } from './config';
import { createCoverCamera } from '../display/camera';
/** One uniform cover transform; composition problems must not silently zoom out. */
export function cameraFor(width: number, height: number) {
  return createCoverCamera(framing ?? { sceneBounds: { x: 0, y: 0, w: WORLD.width, h: WORLD.height } }, width, height);
}
