/** Shared challenge policy. Skins, masks and presentation must not own time penalties. */
export const HUNT_MISS_PENALTY_SECONDS = 5;
export const huntMissCaption = (seconds = HUNT_MISS_PENALTY_SECONDS) => `点错了，剩余时间 −${seconds} 秒。`;
export function penalizedElapsed(elapsed: number, durationSeconds: number) {
  return Math.min(durationSeconds * 1000, elapsed + HUNT_MISS_PENALTY_SECONDS * 1000);
}
