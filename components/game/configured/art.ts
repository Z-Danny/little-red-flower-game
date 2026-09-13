import type { Point, Skin } from '@/app/game/runtime/schema';
export type Sprite = { image: HTMLImageElement | HTMLCanvasElement; alpha: Uint8ClampedArray; width: number; height: number };
export type Art = Record<string, Sprite>;
// Cache by complete immutable manifest, never one global promise for all levels/skins.
const cache = new Map<string, Promise<Art>>();
export function loadArt(skin: Skin): Promise<Art> {
  const key = JSON.stringify(skin.assets);
  const cached = cache.get(key); if (cached) { cache.delete(key); cache.set(key, cached); return cached; }
  // Bound retained decoded images when cycling through a large level catalog.
  if (cache.size >= 3) cache.delete(cache.keys().next().value!);
  const pending = Promise.all(Object.entries(skin.assets).map(async ([id, asset]) => {
    const image = new Image(); image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { image.onload = image.onerror = null; reject(new Error(`素材加载超时：${id}`)); }, 15000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(new Error(`素材加载失败：${id}`)); }; image.src = asset.src;
    });
    const frame = asset.frame ?? { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
    if (frame.x + frame.w > image.naturalWidth || frame.y + frame.h > image.naturalHeight) throw new Error(`精灵帧超出素材：${id}`);
    const canvas = document.createElement('canvas'); canvas.width = frame.w; canvas.height = frame.h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) throw new Error('浏览器不支持 Canvas 2D');
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    return [id, { image: asset.frame ? canvas : image, alpha: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height }] as const;
  })).then(entries => Object.fromEntries(entries)).catch(error => { if (cache.get(key) === pending) cache.delete(key); throw error; });
  cache.set(key, pending); return pending;
}
export function alphaAt(art: Art, asset: string, point: Point) {
  const sprite = art[asset]; if (!sprite || point.x < 0 || point.y < 0 || point.x > 1 || point.y > 1) return false;
  const x = Math.min(sprite.width - 1, Math.floor(point.x * sprite.width)), y = Math.min(sprite.height - 1, Math.floor(point.y * sprite.height));
  return sprite.alpha[(y * sprite.width + x) * 4 + 3] > 35;
}
