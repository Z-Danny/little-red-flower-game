import { assets, type AssetId } from '@/app/game/typhoon/config';

export type LoadedAsset = { image: HTMLImageElement; alpha: Uint8ClampedArray; width: number; height: number };
export type AssetPack = Record<AssetId, LoadedAsset>;
let pending: Promise<AssetPack> | undefined;

/** One source image feeds both rendering and hit masks. No duplicated hotspot artwork. */
export function loadAssets(): Promise<AssetPack> {
  if (pending) return pending;
  pending = Promise.all(Object.entries(assets).map(async ([key, src]) => {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      let attempts = 0;
      image.onload = () => resolve();
      image.onerror = () => {
        if (++attempts < 3) window.setTimeout(() => { image.src = src; }, 600);
        else reject(new Error(`无法加载 ${key}，请刷新页面或重新导出完整离线版。`));
      };
      image.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('当前浏览器不支持 2D 游戏画面。');
    context.drawImage(image, 0, 0);
    const alpha = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return [key, { image, alpha, width: canvas.width, height: canvas.height }] as const;
  })).then(entries => Object.fromEntries(entries) as AssetPack).catch(error => { pending = undefined; throw error; });
  return pending;
}
