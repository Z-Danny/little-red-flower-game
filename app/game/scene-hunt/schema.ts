import type { HuntRules } from './model';
export type Box = { x: number; y: number; w: number; h: number };
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
  outside: Box;
  entry: Box;
  targets: Record<
    string,
    { color: [number, number, number]; bounds: Box; icon: string }
  >;
};
export type HuntPack = { rules: HuntRules; skin: HuntSkin };
export function checkHunt(pack: HuntPack) {
  const { rules: r, skin: s } = pack;
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
    r.revealMs < 2500 ||
    r.seconds < 20
  )
    throw Error('Invalid hunt timing/world');
  if (new Set(r.targets.map((t) => t.id)).size !== r.targets.length)
    throw Error('Duplicate hunt target');
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
  [s.familyBox, s.outside, s.entry].forEach(checkBox);
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
      region.color.every((v) => v === 0)
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
    if (t.color.every((v, i) => Math.abs(v - data[p + i]) < 18)) return id;
  }
  return null;
}
