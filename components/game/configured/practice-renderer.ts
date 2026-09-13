import { canvasLabelFont } from '@/app/game/typography';
import { scenePoses } from '@/app/game/runtime/scene';
import { matches } from '@/app/game/runtime/engine';
import type { LevelPackage, Point, Run } from '@/app/game/runtime/schema';
import type { Art } from './art';
import { configuredPressure } from '@/app/game/runtime/response';
import { smokePlume, heatEdges } from '@/app/game/response/effects';
import { relevantZones, resolveDragPlacement } from '@/app/game/runtime/drop-zones';
import { drawPresentation } from './presentation';
import { drawRoomSmoke } from './room-smoke';
export type Drag = { id: string; point: Point; offset: Point; start: Point; pointerId: number; moved: boolean };
export function render(ctx: CanvasRenderingContext2D, pack: LevelPackage, art: Art, run: Run, drag: Drag | null, selected: string | null, reduced: boolean) {
  const { width, height } = pack.skin.world;
  const backgroundBox = pack.skin.assets[pack.skin.background].sceneBounds ?? {x:0,y:0,w:width,h:height};
  ctx.drawImage(art[pack.skin.background].image, backgroundBox.x, backgroundBox.y, backgroundBox.w, backgroundBox.h);
  const source = drag?.id ?? selected;
  const poses = scenePoses(pack, run, reduced);
  const activePose=drag?.moved?poses.find(p=>p.id===drag.id):undefined;
  const activeZone=drag&&activePose?resolveDragPlacement(pack,run,drag.id,drag.point,drag.offset,activePose).target:undefined;
  const zones = source ? relevantZones(pack, run, source) : [];
  const paintZones = () => { if (source) for (const [id,label] of Object.entries(pack.skin.zoneLabels ?? {})) {
    if (!zones.includes(id) || (pack.skin.zoneConditions?.[id] && !matches(pack,run,pack.skin.zoneConditions[id]))) continue;
    const b=pack.skin.zones[id]; ctx.save(); ctx.strokeStyle='#f6d89b'; ctx.fillStyle=id===activeZone?'#67b17f88':'#24493b55'; ctx.lineWidth=id===activeZone?5:3; ctx.setLineDash([10,8]);
    ctx.beginPath(); ctx.roundRect(b.x,b.y,b.w,b.h,18); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#fff4d9'; ctx.font=canvasLabelFont(20); ctx.textAlign='center'; ctx.fillText(label,b.x+b.w/2,b.y+b.h-15,b.w-12); ctx.restore();
  } };
  const response = pack.skin.response, pressure = configuredPressure(pack, run); let smokeDrawn = false;
  // World effects are interleaved by depth; carrying an item must not reorder
  // smoke, foreground occluders or the rest of the scene.
  let effectDepth = -Infinity;
  let roomSmokeDrawn=false;
  const draggedPose = drag?.moved ? poses.find(p => p.id === drag.id) : undefined;
  for (const original of poses) {
    if(!roomSmokeDrawn && pack.skin.presentation?.roomSmoke && original.depth>=pack.skin.presentation.roomSmoke.depth){drawRoomSmoke(ctx,pack,art,run,reduced);roomSmokeDrawn=true;}
    drawPresentation(ctx, pack, run, reduced, effectDepth, original.depth, poses);
    effectDepth = original.depth;
    if (response && !smokeDrawn && original.depth >= response.smokeDepth) { smokePlume(ctx, pressure, response.smokeOrigin, run.elapsed, width, reduced); smokeDrawn = true; }
    if (original === draggedPose) continue;
    paint(original);
  }
  drawPresentation(ctx, pack, run, reduced, effectDepth, Infinity, poses);
  if(!roomSmokeDrawn)drawRoomSmoke(ctx,pack,art,run,reduced);
  // Phase backgrounds are ordinary depth-0 poses. Guidance must remain above
  // them, and is only visible for the object currently in the player's hand.
  paintZones();
  if (draggedPose) paint(draggedPose);
  function paint(original: typeof poses[number]) {
    // Only full-scene paintings have sceneBounds; sprite placement/alpha stays unchanged.
    const painted = pack.skin.assets[original.asset].sceneBounds;
    const base = painted ? { ...original, ...painted } : original;
    const pose = drag?.id === original.id && drag.moved ? { ...base, x: drag.point.x - drag.offset.x, y: drag.point.y - drag.offset.y } : base;
    if ((pose.opacity ?? 1) <= 0) return;
    const pivot = pose.pivot ?? { x: .5, y: .5 };
    ctx.save(); ctx.globalAlpha = pose.opacity ?? 1;
    ctx.translate(pose.x + pose.w * pivot.x, pose.y + pose.h * pivot.y); ctx.rotate(pose.rotation ?? 0);
    if (selected === pose.id || drag?.id === pose.id) { ctx.shadowColor = '#ffe7a1'; ctx.shadowBlur = 14; }
    ctx.drawImage(art[pose.asset].image, -pose.w * pivot.x, -pose.h * pivot.y, pose.w, pose.h);
    for (const label of pack.skin.labels ?? []) if (label.object === pose.id && (!label.when || matches(pack,run,label.when))) {
      if(label.background){ctx.fillStyle=label.background;ctx.beginPath();ctx.roundRect(-pose.w*pivot.x,-pose.h*pivot.y,pose.w,pose.h,6);ctx.fill();}
      ctx.shadowBlur=0; ctx.fillStyle=label.color;ctx.font=canvasLabelFont(label.size);ctx.textAlign=label.align??'center';ctx.textBaseline='middle';
      const room=label.align==='left'?1-label.x:label.align==='right'?label.x:2*Math.min(label.x,1-label.x);
      const textWidth=pose.w*(pack.skin.presentation?Math.max(.01,room)*.92:.91);
      const lines=label.text.split('\n'); lines.forEach((line,i)=>ctx.fillText(line,pose.w*(label.x-pivot.x),pose.h*(label.y-pivot.y)+(i-(lines.length-1)/2)*label.size*1.3,textWidth));
    }
    ctx.restore();
  }
  // Practice scenarios may still be awaiting rescue. Completion does not
  // magically remove external flood/fire or heal a patient.
  if (!pack.skin.presentation && run.phase !== 'playing') { ctx.fillStyle = `rgba(255,214,141,${Math.min(.12, run.settleAge / 18000)})`; ctx.fillRect(0, 0, width, height); }
  if (response) heatEdges(ctx, pressure, width, height, run.elapsed, reduced);
}
