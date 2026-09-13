import type { DisasterSkin } from '@/app/game/disaster/schema';
export type Raster = {
  image: HTMLImageElement;
  data: Uint8ClampedArray;
  width: number;
  height: number;
};
export type DisasterArt = {
  backdrop?: Raster;
  scene: Raster;
  clean: Raster;
  ending: Raster;
  mask: Raster;
  sprites: Record<string, Raster>;
  faces: Record<string, Raster>;
  repairs: Record<string, Raster>;
};
async function load(src: string): Promise<Raster> {
  const image = new Image();
  image.src = src;
  await new Promise<void>((ok, no) => {
    image.onload = () => ok();
    image.onerror = () => no(Error('场景素材无法载入，请重新打开本地文件。'));
    if (image.complete && image.naturalWidth) ok();
  });
  const c = document.createElement('canvas');
  c.width = image.naturalWidth;
  c.height = image.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  return {
    image,
    data: ctx.getImageData(0, 0, c.width, c.height).data,
    width: c.width,
    height: c.height,
  };
}
export async function loadDisasterArt(s: DisasterSkin): Promise<DisasterArt> {
  const backdrop = s.framing?.backdrop ? await load(s.framing.backdrop) : undefined;
  if (backdrop && s.framing && Math.abs(backdrop.width / backdrop.height - s.framing.sceneBounds.w / s.framing.sceneBounds.h) > .002)
    throw Error('扩画背景比例与 sceneBounds 不一致');
  const [scene, clean, ending, mask, sprites, faces, repairs] =
    await Promise.all([
      load(s.scene),
      load(s.clean),
      load(s.ending),
      load(s.mask),
      Promise.all(
        Object.entries(s.sprites).map(
          async ([k, v]) => [k, await load(v.src)] as const,
        ),
      ),
      Promise.all(
        Object.entries(s.faces ?? {}).map(
          async ([k, v]) => [k, await load(v)] as const,
        ),
      ),
      Promise.all(
        Object.entries(s.sprites)
          .filter(([, v]) => v.repair)
          .map(async ([k, v]) => [k, await load(v.repair!.src)] as const),
      ),
    ]);
  return {
    backdrop,
    scene,
    clean,
    ending,
    mask,
    sprites: Object.fromEntries(sprites),
    faces: Object.fromEntries(faces),
    repairs: Object.fromEntries(repairs),
  };
}
