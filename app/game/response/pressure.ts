import profile from '@/content/response/kitchen-experience.json';
export { profile as kitchenExperience };
export const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
export type PressureInput = { risk: number; impulse?: number; suppression?: number; sealed?: boolean; sourceOff?: boolean; resolved?: boolean; settleMs?: number };
export type Pressure = { intensity: number; tier: 0 | 1 | 2; flame: number; smoke: number; heat: number; fear: number; resolved: boolean };
/** Presentation only. Never grants a goal, changes risk or locks interaction. */
export function responsePressure(input: PressureInput, config = profile): Pressure {
  const { resolved = false, sealed = false, sourceOff = false } = input;
  const risk = clamp01(input.risk), impulse = clamp01(input.impulse ?? 0), suppression = clamp01(input.suppression ?? 0);
  const decay = 1 - clamp01((input.settleMs ?? 0) / config.visual.settleMs);
  const intensity = resolved ? 0 : clamp01(config.pressure.initial + risk * config.pressure.riskWeight + impulse * config.pressure.impulseWeight);
  const flame = resolved || sealed ? 0 : Math.max(.24, Math.min(config.visual.flameMaxScale, .65 + intensity * 1.5 + impulse * .65 - (sourceOff ? .4 : 0) - suppression));
  const smoke = resolved ? decay * .46 : clamp01((sealed ? .11 : .25 + intensity * .65) * (sourceOff ? .6 : 1) + impulse * .25);
  const heat = resolved ? decay * .1 : clamp01((sealed ? .25 : .32 + intensity * .66) * (sourceOff ? .64 : 1));
  return { intensity, tier: intensity >= config.thresholds[1] ? 2 : intensity >= config.thresholds[0] ? 1 : 0, flame, smoke, heat, fear: resolved ? 0 : intensity * (sealed ? .4 : sourceOff ? .75 : 1), resolved };
}
export type ActorBox = { x: number; y: number; w: number; h: number };
export type ActorPose = { box: ActorBox; angle: number };
/** Feet stay planted during breathing. Inverse picking uses this exact same pose. */
export function actorMotion(home: ActorBox, timeMs: number, fear: number, reduced = false, recoil = 0): ActorPose {
  if (reduced) return { box: { ...home }, angle: 0 };
  const a = profile.actor, f = clamp01(fear), t = timeMs / 1000;
  const breath = Math.sin(t * Math.PI * 2 * (a.breathHz[0] + (a.breathHz[1] - a.breathHz[0]) * f));
  const stretch = 1 + breath * (a.breathScale[0] + f * a.breathScale[1]);
  const tremor = f * f * Math.sin(t * 19) * a.tremorPx;
  const h = home.h * stretch, w = home.w * (1 - breath * f * .003);
  return { box: { x: home.x + (home.w - w) / 2 + tremor + recoil * a.recoilPx, y: home.y + home.h - h, w, h }, angle: -f * a.leanRadians * (.55 + .45 * Math.sin(t * 2.5)) - recoil * .025 };
}
export function inverseActorPoint(pose: ActorPose, p: { x: number; y: number }) {
  const { box, angle } = pose, cx = box.x + box.w / 2, cy = box.y + box.h;
  const dx = p.x - cx, dy = p.y - cy, c = Math.cos(angle), s = Math.sin(angle);
  return { x: cx + c * dx + s * dy, y: cy - s * dx + c * dy };
}
