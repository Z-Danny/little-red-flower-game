import type { HuntSkin } from '@/app/game/scene-hunt/schema';
export type HuntArt = {
  scene: HTMLImageElement;
  safe: HTMLImageElement;
  clean: HTMLImageElement;
  family: HTMLImageElement;
  mask: Uint8ClampedArray;
  effects?: Partial<
    Record<
      | 'weatherMask'
      | 'waterMask'
      | 'skyMask'
      | 'fireMask'
      | 'smokeMask'
      | 'characterMask',
      HTMLCanvasElement
    >
  >;
  protection?: HTMLCanvasElement;
};
/** Only exact ID colors protect evidence. Pixel permissions never become hit regions. */
export function protectedMaskPixels(
  ids: Uint8ClampedArray,
  colors: number[][],
) {
  const result = new Uint8ClampedArray(ids.length);
  for (let i = 0; i < ids.length; i += 4) {
    const yes =
      ids[i + 3] >= 128 &&
      colors.some((c) => c.every((v, k) => ids[i + k] === v));
    result.set([255, 255, 255, yes ? 255 : 0], i);
  }
  return result;
}
export function permissionMaskPixels(
  source: Uint8ClampedArray,
  protectedPixels: Uint8ClampedArray,
) {
  const result = new Uint8ClampedArray(source.length);
  for (let i = 0; i < source.length; i += 4) {
    const allowed =
      source[i] >= 250 &&
      source[i + 1] >= 250 &&
      source[i + 2] >= 250 &&
      source[i + 3] >= 250 &&
      !protectedPixels[i + 3];
    result.set([255, 255, 255, allowed ? 255 : 0], i);
  }
  return result;
}
const image = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(Error('素材加载失败，请重新打开'));
    img.src = src;
  });
export async function loadHuntArt(s: HuntSkin): Promise<HuntArt> {
  const [scene, safe, clean, family, mask] = await Promise.all(
    [s.scene, s.safe, s.clean, s.family, s.mask].map(image),
  );
  if (
    [scene, safe, clean, mask].some(
      (img) => img.naturalWidth !== s.width || img.naturalHeight !== s.height,
    )
  )
    throw Error('蒙版与场景坐标不一致');
  if (
    family.naturalWidth !== s.familyBox.w ||
    family.naturalHeight !== s.familyBox.h
  )
    throw Error('人物与锚点尺寸不一致');
  const c = document.createElement('canvas');
  c.width = s.width;
  c.height = s.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw Error('浏览器不支持画布');
  ctx.drawImage(mask, 0, 0);
  const ids = ctx.getImageData(0, 0, s.width, s.height).data;
  const art: HuntArt = {
    scene,
    safe,
    clean,
    family,
    mask: ids,
  };
  if (s.effects) {
    const protectedPixels = protectedMaskPixels(
      ids,
      Object.values(s.targets).map((t) => t.color),
    );
    const fromPixels = (pixels: Uint8ClampedArray) => {
      const canvas = document.createElement('canvas');
      canvas.width = s.width;
      canvas.height = s.height;
      const context = canvas.getContext('2d')!;
      const data = context.createImageData(s.width, s.height);
      data.data.set(pixels);
      context.putImageData(data, 0, 0);
      return canvas;
    };
    art.protection = fromPixels(protectedPixels);
    art.effects = {};
    await Promise.all(
      Object.entries(s.effects)
        .filter(([key]) => key.endsWith('Mask'))
        .map(async ([key, src]) => {
          const img = await image(src as string);
          if (img.naturalWidth !== s.width || img.naturalHeight !== s.height)
            throw Error('演出许可蒙版尺寸不一致');
          ctx.clearRect(0, 0, s.width, s.height);
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, s.width, s.height).data;
          art.effects![key as keyof NonNullable<HuntArt['effects']>] =
            fromPixels(permissionMaskPixels(data, protectedPixels));
        }),
    );
  }
  return art;
}
