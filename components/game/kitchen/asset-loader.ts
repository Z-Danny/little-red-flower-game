import { assets, framing, type AssetId } from '@/app/game/kitchen/config';
export type Sprite = { image: HTMLImageElement; data: Uint8ClampedArray; width: number; height: number };
export type Art = Record<AssetId, Sprite> & { backdrop?: Sprite };
let pending: Promise<Art> | null = null;
export function loadArt(): Promise<Art> {
  if (pending) return pending;
  const sources: [string, string][] = Object.entries(assets);
  if (framing?.backdrop) sources.push(['backdrop', framing.backdrop]);
  pending = Promise.all(sources.map(async ([id, src]) => {
    const image = new Image(); image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve(); image.onerror = () => reject(new Error(`素材 ${id} 未能加载，请点击重试。`)); image.src = src;
    });
    if (id === 'backdrop' && framing && Math.abs(image.naturalWidth / image.naturalHeight - framing.sceneBounds.w / framing.sceneBounds.h) > .002)
      throw new Error('厨房扩画背景比例与 sceneBounds 不一致。');
    const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('浏览器不支持 Canvas 2D。');
    ctx.drawImage(image, 0, 0);
    return [id, { image, data: ctx.getImageData(0, 0, c.width, c.height).data, width: c.width, height: c.height }] as const;
  })).then(entries => Object.fromEntries(entries) as Art).catch(error => { pending = null; throw error; });
  return pending;
}
