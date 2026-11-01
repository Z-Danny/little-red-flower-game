/** Circular rail in frame-width units; CSS rotates the arm, not an x/y chord. */
export const islandArcDegrees = 38;
export const islandArcStep = Math.sin(islandArcDegrees * Math.PI / 180);
export function islandArcPose(distance: number) {
  const angle = -distance * islandArcDegrees;
  const radians = angle * Math.PI / 180;
  return {
    angle,
    x: -Math.sin(radians),
    y: Math.cos(radians),
    scale: Math.max(0.58, 1 - Math.abs(distance) * 0.34),
    opacity: Math.max(0, 1 - Math.abs(distance) * 0.35),
    visible: Math.abs(distance) < 2,
    zIndex: Math.round(100 - Math.abs(distance) * 10),
  };
}
