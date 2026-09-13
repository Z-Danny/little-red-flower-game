/** Art-local anchors; visual and audio events share this activity-clock envelope. */
export type ElectricSpark = { x: number; y: number; radius: number; periodMs: number; offsetMs: number };
export function sparkFrame(s: ElectricSpark, elapsed: number) {
  const time = elapsed - s.offsetMs;
  const slot = Math.floor(time / s.periodMs), age = time < 0 ? -1 : time % s.periodMs;
  return { slot, age, active: age >= 0 && age < 360, alpha: age >= 0 && age < 360 ? Math.sin(Math.PI * age / 360) : 0 };
}
export function validateSparks(sparks: ElectricSpark[], width: number, height: number) {
  if (!Array.isArray(sparks) || sparks.length > 3) throw Error('Invalid electrical sources');
  for (const s of sparks) if (![s.x,s.y,s.radius,s.periodMs,s.offsetMs].every(Number.isFinite) || s.radius < 8 || s.radius > 45 || s.x-s.radius < 0 || s.x+s.radius > width || s.y-s.radius < 0 || s.y+s.radius > height || s.periodMs < 3000 || s.offsetMs < 0 || s.offsetMs >= s.periodMs) throw Error('Invalid electrical source bounds or cadence');
}
