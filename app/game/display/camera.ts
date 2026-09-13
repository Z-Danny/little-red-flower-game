/** CSS-pixel camera. Device pixel ratio is applied only by the canvas renderer. */
export type SceneBox = { x: number; y: number; w: number; h: number };
export type Insets = { top: number; right: number; bottom: number; left: number };
export type SceneFraming = { sceneBounds: SceneBox; critical?: SceneBox; criticalRegions?: SceneBox[] };
export type SceneCamera = {
  x: number; y: number; scale: number;
  visibleWorld: SceneBox;
  /** A composition failure, never a request to fall back to contain/stretch. */
  clippedCritical: boolean;
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const obstacleCameras=new WeakMap<SceneFraming,Map<string,SceneCamera>>();
export function createCoverCamera(
  framing: SceneFraming, width: number, height: number,
  protectedInsets: Partial<Insets> = {},
  screenObstacles: SceneBox[] = [],
): SceneCamera {
  const b = framing.sceneBounds;
  const cacheKey=screenObstacles.length?JSON.stringify([width,height,protectedInsets,screenObstacles]):'';
  const cache=obstacleCameras.get(framing);
  if(cacheKey&&cache?.has(cacheKey))return cache.get(cacheKey)!;
  if (![width, height, b.w, b.h].every(n => Number.isFinite(n) && n > 0)) {
    return { x: 0, y: 0, scale: 1, visibleWorld: { ...b }, clippedCritical: !!framing.critical };
  }
  // This scale is invariant: protecting a target may pan, but may NEVER zoom out.
  const scale = Math.max(width / b.w, height / b.h);
  const rangeX = [width - (b.x + b.w) * scale, -b.x * scale];
  const rangeY = [height - (b.y + b.h) * scale, -b.y * scale];
  let x = (width - b.w * scale) / 2 - b.x * scale;
  let y = (height - b.h * scale) / 2 - b.y * scale;
  const regions = framing.criticalRegions ?? [];
  const c = framing.critical ?? (regions.length ? {
    x: Math.min(...regions.map(r=>r.x)), y: Math.min(...regions.map(r=>r.y)),
    w: Math.max(...regions.map(r=>r.x+r.w))-Math.min(...regions.map(r=>r.x)),
    h: Math.max(...regions.map(r=>r.y+r.h))-Math.min(...regions.map(r=>r.y)),
  } : undefined);
  let allowableX=rangeX,allowableY=rangeY;
  if (c) {
    const left = Math.max(rangeX[0], (protectedInsets.left ?? 0) - c.x * scale);
    const right = Math.min(rangeX[1], width - (protectedInsets.right ?? 0) - (c.x + c.w) * scale);
    const top = Math.max(rangeY[0], (protectedInsets.top ?? 0) - c.y * scale);
    const bottom = Math.min(rangeY[1], height - (protectedInsets.bottom ?? 0) - (c.y + c.h) * scale);
    if (left <= right) {x = clamp(x, left, right);allowableX=[left,right];}
    if (top <= bottom) {y = clamp(y, top, bottom);allowableY=[top,bottom];}
  }
  // UI occupies small local rectangles, not a fictitious full-width safe bar.
  // Enumerating contact boundaries finds legal translations without zooming or moving props.
  const overlap=(x:number,y:number,r:SceneBox,o:SceneBox)=>x+r.x*scale<o.x+o.w-.01&&x+(r.x+r.w)*scale>o.x+.01&&y+r.y*scale<o.y+o.h-.01&&y+(r.y+r.h)*scale>o.y+.01;
  if(regions.length&&screenObstacles.length&&regions.some(r=>screenObstacles.some(o=>overlap(x,y,r,o)))){
    const xs=new Set([x,...allowableX]),ys=new Set([y,...allowableY]);
    for(const r of regions)for(const o of screenObstacles){
      for(const nx of [o.x-(r.x+r.w)*scale,o.x+o.w-r.x*scale])if(nx>=allowableX[0]&&nx<=allowableX[1])xs.add(nx);
      for(const ny of [o.y-(r.y+r.h)*scale,o.y+o.h-r.y*scale])if(ny>=allowableY[0]&&ny<=allowableY[1])ys.add(ny);
    }
    let best: {x:number;y:number;distance:number}|undefined;
    for(const nx of xs)for(const ny of ys){const distance=(nx-x)**2+(ny-y)**2;if(best&&distance>=best.distance)continue;if(!regions.some(r=>screenObstacles.some(o=>overlap(nx,ny,r,o))))best={x:nx,y:ny,distance};}
    if(best){x=best.x;y=best.y;}
  }
  const epsilon = .05;
  const clippedCritical = (!!c && (
    x + c.x * scale < (protectedInsets.left ?? 0) - epsilon ||
    y + c.y * scale < (protectedInsets.top ?? 0) - epsilon ||
    x + (c.x + c.w) * scale > width - (protectedInsets.right ?? 0) + epsilon ||
    y + (c.y + c.h) * scale > height - (protectedInsets.bottom ?? 0) + epsilon
  )) || regions.some(r=>screenObstacles.some(o=>overlap(x,y,r,o)));
  const result={ x, y, scale, visibleWorld: { x: -x / scale, y: -y / scale, w: width / scale, h: height / scale }, clippedCritical };
  if(cacheKey){const next=cache??new Map<string,SceneCamera>();if(next.size>32)next.clear();next.set(cacheKey,result);obstacleCameras.set(framing,next);}
  return result;
}
export function sceneToClient(camera: Pick<SceneCamera, 'x'|'y'|'scale'>, point: {x:number;y:number}, rect = {left:0,top:0}) {
  return { x: rect.left + camera.x + point.x * camera.scale, y: rect.top + camera.y + point.y * camera.scale };
}
export function clientToScene(camera: Pick<SceneCamera, 'x'|'y'|'scale'>, point: {x:number;y:number}, rect = {left:0,top:0}) {
  return { x: (point.x - rect.left - camera.x) / camera.scale, y: (point.y - rect.top - camera.y) / camera.scale };
}
