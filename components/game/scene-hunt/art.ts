import type { HuntSkin } from '@/app/game/scene-hunt/schema';
export type HuntArt = {
  scene: HTMLImageElement;
  safe: HTMLImageElement;
  clean: HTMLImageElement;
  family: HTMLImageElement;
  mask: Uint8ClampedArray;
};
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
  if (mask.naturalWidth !== s.width || mask.naturalHeight !== s.height)
    throw Error('蒙版与场景坐标不一致');
  const c = document.createElement('canvas');
  c.width = s.width;
  c.height = s.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw Error('浏览器不支持画布');
  ctx.drawImage(mask, 0, 0);
  return {
    scene,
    safe,
    clean,
    family,
    mask: ctx.getImageData(0, 0, s.width, s.height).data,
  };
}
