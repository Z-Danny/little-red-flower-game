/** Optional v2 direction; no level IDs or image coordinates belong in the runtime. */
export type HuntSoundProfile =
  | 'quiet_electric'
  | 'kitchen_check'
  | 'corridor'
  | 'preparedness'
  | 'rain_street'
  | 'thunder_park'
  | 'forest_edge';
export type PerformanceStage = {
  atMs: number;
  breathMs: number;
  breathPx: number;
  retractPx: number;
  vignette: number;
  bpm: number;
  rainCount: number;
  smokeCount: number;
  smokeAlpha: number;
  flameScale: number;
};
export type HuntPerformance = {
  version: 2;
  /** Quarter-length stages follow rules.seconds; atMs retains legacy authoring reference. */
  timing?: 'quarters';
  atmosphere: 'indoor' | 'rain' | 'thunder' | 'fire';
  sound: HuntSoundProfile;
  retreatDirection: -1 | 1;
  missCaption?: string;
  stages: PerformanceStage[];
};
export const performanceSounds: HuntSoundProfile[] = [
  'quiet_electric',
  'kitchen_check',
  'corridor',
  'preparedness',
  'rain_street',
  'thunder_park',
  'forest_edge',
];
export const MISS_CAPTION = '这里没有识别目标，隐患仍未找齐。';
export const feedbackV2 = {
  missMs: 450,
  missCooldownMs: 500,
  markMs: 800,
  foundMs: 90,
  missSoundMs: 160,
  silhouetteMs: 220,
  flowerMs: 180,
  revealHoldMs: 800,
  revealFadeMs: 1800,
  revealMs: 5500,
} as const;
export function performanceTier(elapsed: number, seconds?: number) {
  return Math.min(
    3,
    Math.floor(Math.max(0, Number.isFinite(elapsed) ? elapsed : 0) / (seconds && seconds > 0 ? seconds * 250 : 30000)),
  );
}
export function performanceStage(p: HuntPerformance, elapsed: number, seconds?: number) {
  return p.stages[performanceTier(elapsed, p.timing === 'quarters' ? seconds : undefined)];
}
/** One restrained, 700ms cloud swell per stage, never repeated indefinitely at peak. */
export function distantThunderAge(p: HuntPerformance, elapsed: number, seconds?: number) {
  if (p.atmosphere !== 'thunder') return -1;
  const duration = p.timing === 'quarters' ? seconds : undefined;
  const span = duration && duration > 0 ? duration * 250 : 30000;
  const age = elapsed - (performanceTier(elapsed, duration) * span + span * .4);
  return age >= 0 && age < 700 ? age : -1;
}
export function validatePerformance(p: HuntPerformance) {
  if (
    p.version !== 2 ||
    (p.timing !== undefined && p.timing !== 'quarters') ||
    !['indoor', 'rain', 'thunder', 'fire'].includes(p.atmosphere) ||
    !performanceSounds.includes(p.sound) ||
    ![-1, 1].includes(p.retreatDirection) ||
    p.stages?.length !== 4
  )
    throw Error('Invalid v2 performance');
  const expected = [0, 30000, 60000, 90000];
  if (
    p.missCaption !== undefined &&
    (typeof p.missCaption !== 'string' || !p.missCaption.trim())
  )
    throw Error('Invalid miss caption');
  p.stages.forEach((s, i) => {
    if (
      s.atMs !== expected[i] ||
      ![
        s.breathMs,
        s.breathPx,
        s.retractPx,
        s.vignette,
        s.bpm,
        s.rainCount,
        s.smokeCount,
        s.smokeAlpha,
        s.flameScale,
      ].every(Number.isFinite) ||
      s.breathMs < 1500 ||
      s.breathMs > 4000 ||
      s.breathPx < 0 ||
      s.breathPx > 6 ||
      s.retractPx < 0 ||
      s.retractPx > 12 ||
      s.vignette < 0 ||
      s.vignette > 0.16 ||
      s.bpm < 50 ||
      s.bpm > 100 ||
      !Number.isInteger(s.rainCount) ||
      s.rainCount < 0 ||
      s.rainCount > 170 ||
      !Number.isInteger(s.smokeCount) ||
      s.smokeCount < 0 ||
      s.smokeCount > 64 ||
      s.smokeAlpha < 0 ||
      s.smokeAlpha > 0.42 ||
      s.flameScale < 1 ||
      s.flameScale > 1.8
    )
      throw Error('Invalid v2 stage');
    if (
      p.atmosphere === 'indoor' &&
      (s.rainCount || s.smokeCount || s.smokeAlpha || s.flameScale !== 1)
    )
      throw Error('Indoor scene cannot invent a disaster');
    if (
      p.atmosphere !== 'fire' &&
      (s.smokeCount || s.smokeAlpha || s.flameScale !== 1)
    )
      throw Error('Only approved fire atmosphere may render smoke/fire');
    if (p.atmosphere === 'fire' && s.rainCount)
      throw Error('Fire profile has no rain');
  });
  const audio = {
    indoor: ['quiet_electric', 'kitchen_check', 'corridor', 'preparedness'],
    rain: ['rain_street'],
    thunder: ['thunder_park'],
    fire: ['forest_edge'],
  };
  if (!audio[p.atmosphere].includes(p.sound))
    throw Error('Audio does not match approved environment');
  return p;
}
