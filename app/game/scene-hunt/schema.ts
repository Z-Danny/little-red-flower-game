import type { HuntRules } from './model';
import {validateSparks, type ElectricSpark} from './electric';
import { presentationOf, type HuntPresentation } from './presentation';
import { validatePerformance, type HuntPerformance } from './performance';
export type Box = { x: number; y: number; w: number; h: number };
export type HuntEffects = {
  electricSparks?: ElectricSpark[];
  weatherMask?: string;
  waterMask?: string;
  skyMask?: string;
  fireMask?: string;
  smokeMask?: string;
  characterMask?: string;
  fireSources?: (Box & { kind: 'flame' | 'ember' | 'fountain' })[];
  smokeDrift?: -1 | 1;
};
export type HuntSkin = {
  version: 1;
  width: number;
  height: number;
  scene: string;
  safe: string;
  clean: string;
  mask: string;
  family: string;
  familyBox: Box;
  /** Faces and other non-target semantic regions which a new skin must keep visible. */
  criticalRegions?: Box[];
  outside?: Box;
  entry?: Box;
  effects?: HuntEffects;
  targets: Record<
    string,
    { color: [number, number, number]; bounds: Box; icon: string }
  >;
};
export type HuntPack = {
  rules: HuntRules;
  skin: HuntSkin;
  presentation?: HuntPresentation;
  performance?: HuntPerformance;
};
export function checkHunt(pack: HuntPack) {
  const { rules: r, skin: s } = pack;
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.id) ||
    !r.title?.trim() ||
    !Number.isInteger(r.order) ||
    r.order < 1
  )
    throw Error('Invalid hunt identity');
  if (
    s.version !== 1 ||
    ![s.width, s.height, r.markMs, r.revealMs, r.seconds].every(
      Number.isFinite,
    ) ||
    !Number.isInteger(s.width) ||
    !Number.isInteger(s.height) ||
    s.width <= 0 ||
    s.height <= 0 ||
    r.targets.length < 3 ||
    r.targets.length > 6 ||
    r.markMs < 500 ||
    r.markMs > 1500 ||
    r.revealMs < 3500 ||
    r.seconds < 20
  )
    throw Error('Invalid hunt timing/world');
  if (new Set(r.targets.map((t) => t.id)).size !== r.targets.length)
    throw Error('Duplicate hunt target');
  if (!['continue', 'fail'].includes(r.timeout ?? 'continue'))
    throw Error('Invalid hunt timeout policy');
  const checkBox = (b: Box) => {
    if (
      ![b.x, b.y, b.w, b.h].every(Number.isFinite) ||
      b.w <= 0 ||
      b.h <= 0 ||
      b.x < 0 ||
      b.y < 0 ||
      b.x + b.w > s.width ||
      b.y + b.h > s.height
    )
      throw Error('Out of world bounds');
  };
  checkBox(s.familyBox);
  for (const box of s.criticalRegions ?? []) checkBox(box);
  const view = presentationOf(pack);
  if (
    !['storm', 'none'].includes(view.environment) ||
    !['storm', 'breathing', 'static'].includes(view.characters) ||
    !['storm', 'quiet_electric'].includes(view.audio) ||
    !['countdown', 'elapsed', 'pressure-bar'].includes(view.timer) ||
    !['always', 'on-demand'].includes(view.clues ?? 'always') ||
    !['none', 'nonverbal-fear'].includes(view.characterAudio ?? 'none')
  )
    throw Error('Invalid hunt presentation');
  if (
    ![
      view.location,
      view.opening,
      view.reveal,
      view.completeTitle,
      view.pauseNote,
      view.endingNote,
      view.preview,
    ].every((v) => typeof v === 'string' && v.trim()) ||
    !Array.isArray(view.warnings) ||
    !view.warnings.every((v) => typeof v === 'string') ||
    typeof view.celebration !== 'boolean'
  )
    throw Error('Missing hunt presentation text');
  if (view.environment === 'storm' && (!s.outside || !s.entry))
    throw Error('Storm requires weather regions');
  if (s.outside) checkBox(s.outside);
  if (s.entry) checkBox(s.entry);
  if (r.feedbackVersion !== undefined && r.feedbackVersion !== 2)
    throw Error('Invalid feedback version');
  if (pack.performance) {
    const perf = validatePerformance(pack.performance),
      fx = s.effects;
    if (
      r.feedbackVersion !== 2 ||
      (perf.timing === 'quarters' ? (r.seconds !== 50 || r.timeout !== 'fail') : r.seconds !== 90) ||
      r.markMs !== 800 ||
      r.revealMs !== 5500
    )
      throw Error(
        'V2 recognition contract requires exact timing (target count is 3–6)',
      );
    if (
      !fx?.characterMask ||
      view.characters === 'static' ||
      (perf.timing === 'quarters' ? (view.timer !== 'pressure-bar' || view.clues !== 'on-demand') : view.timer !== 'elapsed')
    )
      throw Error('V2 requires safe character movement and the matching shared challenge HUD');
    if (
      (perf.atmosphere === 'rain' || perf.atmosphere === 'thunder') &&
      !fx.weatherMask
    )
      throw Error('Weather needs approved pixel mask');
    if (perf.atmosphere === 'thunder' && !fx.skyMask)
      throw Error('Distant flash needs approved sky mask');
    if (
      perf.atmosphere === 'fire' &&
      (!fx.fireMask || !fx.smokeMask || !fx.fireSources?.length)
    )
      throw Error('Fire needs approved masks and source anchors');
    if (
      perf.atmosphere !== 'fire' &&
      (fx.fireMask || fx.smokeMask || fx.fireSources?.length)
    )
      throw Error('Unapproved fire effect');
    if (
      perf.atmosphere === 'indoor' &&
      (fx.weatherMask || fx.waterMask || fx.skyMask)
    )
      throw Error('Indoor preparation has no weather');
  }
  if (s.effects) {
    if(s.effects.electricSparks)validateSparks(s.effects.electricSparks,s.width,s.height);
    if (
      s.effects.smokeDrift !== undefined &&
      ![-1, 1].includes(s.effects.smokeDrift)
    )
      throw Error('Invalid smoke direction');
    for (const src of s.effects.fireSources ?? []) {
      checkBox(src);
      if (!['flame', 'ember', 'fountain'].includes(src.kind))
        throw Error('Invalid fire source');
    }
  }
  if (Object.keys(s.targets).length !== r.targets.length)
    throw Error('Unexpected mask region');
  const colors = new Set();
  for (const t of r.targets) {
    if (!t.id || !t.name || !t.lesson) throw Error('Missing target text');
    const region = s.targets[t.id];
    if (!region) throw Error('Missing mask region ' + t.id);
    checkBox(region.bounds);
    if (
      region.color.length !== 3 ||
      !region.color.every((v) => Number.isInteger(v) && v >= 0 && v <= 255) ||
      region.color.every((v) => v === 0) ||
      region.color.every((v) => v === 255)
    )
      throw Error('Invalid mask color');
    const key = region.color.join(',');
    if (colors.has(key)) throw Error('Duplicate mask color');
    colors.add(key);
  }
  const paths = [
    s.scene,
    s.safe,
    s.clean,
    s.mask,
    s.family,
    ...Object.values(s.targets).map((t) => t.icon),
    ...Object.entries(s.effects ?? {})
      .filter(([key]) => key.endsWith('Mask'))
      .map(([, path]) => path as string),
  ];
  for (const p of paths)
    if (
      !/^\/levels\/[a-zA-Z0-9_./-]+\.(png|webp)$/.test(p) &&
      !/^data:image\/(png|webp);base64,/.test(p)
    )
      throw Error('Nonlocal hunt art');
  return pack;
}
export function camera(s: HuntSkin, w: number, h: number) {
  const scale = Math.min(w / s.width, h / s.height);
  return { scale, x: (w - s.width * scale) / 2, y: (h - s.height * scale) / 2 };
}
export function hitMask(
  s: HuntSkin,
  data: Uint8ClampedArray,
  x: number,
  y: number,
): string | null {
  if (
    x < 0 ||
    y < 0 ||
    x >= s.width ||
    y >= s.height ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    return null;
  const p = (Math.floor(y) * s.width + Math.floor(x)) * 4;
  if (data[p + 3] < 128) return null;
  for (const [id, t] of Object.entries(s.targets)) {
    if (t.color.every((v, i) => v === data[p + i])) return id;
  }
  return null;
}
