import { paintDropFeedback } from './drop-feedback';
import { resolveDragPlacement } from '@/app/game/runtime/drop-zones';
import { scenePoses } from '@/app/game/runtime/scene';
import { canvasLabelFont } from '@/app/game/typography';
import { matches } from '@/app/game/runtime/engine';
import type { LevelPackage, Point, Run } from '@/app/game/runtime/schema';
import type { Art } from './art';
import { configuredPressure } from '@/app/game/runtime/response';
import { smokePlume, heatEdges } from '@/app/game/response/effects';
export type Drag = { id: string; point: Point; offset: Point; start: Point; pointerId: number; moved: boolean };
export function render(ctx: CanvasRenderingContext2D, pack: LevelPackage, art: Art, run: Run, drag: Drag | null, selected: string | null, reduced: boolean) {
  const { width, height } = pack.skin.world;
  const backgroundBox = pack.skin.assets[pack.skin.background].sceneBounds ?? { x: 0, y: 0, w: width, h: height };
  ctx.drawImage(art[pack.skin.background].image, backgroundBox.x, backgroundBox.y, backgroundBox.w, backgroundBox.h);
  const checkingRule = run.action && pack.rules.interactions.find(rule => rule.id === run.action?.rule);
  const checks = checkingRule ? pack.skin.animations[checkingRule.animation].checks : undefined;
  if (checks && run.action) {
    const time = run.action.age / run.action.duration;
    for (const check of checks) if (time >= check.at) {
      const box = pack.skin.zones[check.zone];
      ctx.save(); ctx.fillStyle = '#87cfa329'; ctx.strokeStyle = '#3f805b'; ctx.lineWidth = 4;
      ctx.setLineDash([12, 9]); ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 16); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }
  const poses = scenePoses(pack, run, reduced);
  const source = drag?.id ?? selected;
  const activePose = drag?.moved ? poses.find(p => p.id === drag.id) : undefined;
  const activeZone = drag && activePose ? resolveDragPlacement(pack, run, drag.id, drag.point, drag.offset, activePose).target : undefined;
  const paintZones = () => paintDropFeedback(ctx, pack, run, source, activeZone);
  const response = pack.skin.response, pressure = configuredPressure(pack, run); let smokeDrawn = false;
  // One pose per object; moving/dragged object is not also painted at home.
  if (drag?.moved) { const index = poses.findIndex(p => p.id === drag.id); if (index >= 0) poses.push(...poses.splice(index, 1)); }
  for (const original of poses) {
    if (drag?.moved && original.id === drag.id) paintZones();
    if (response && !smokeDrawn && original.depth >= response.smokeDepth) { smokePlume(ctx, pressure, response.smokeOrigin, run.elapsed, width, reduced); smokeDrawn = true; }
    const pose = drag?.id === original.id && drag.moved ? { ...original, x: drag.point.x - drag.offset.x, y: drag.point.y - drag.offset.y } : original;
    if ((pose.opacity ?? 1) <= 0) continue;
    const pivot = pose.pivot ?? { x: .5, y: .5 };
    ctx.save(); ctx.globalAlpha = pose.opacity ?? 1;
    ctx.translate(pose.x + pose.w * pivot.x, pose.y + pose.h * pivot.y); ctx.rotate(pose.rotation ?? 0);
    if (selected === pose.id || drag?.id === pose.id) { ctx.shadowColor = '#ffe7a1'; ctx.shadowBlur = 14; }
    ctx.drawImage(art[pose.asset].image, -pose.w * pivot.x, -pose.h * pivot.y, pose.w, pose.h);
    for (const label of pack.skin.labels ?? []) if (label.object === pose.id && (!label.when || matches(pack,run,label.when))) {
      if(label.background){ctx.fillStyle=label.background;ctx.beginPath();ctx.roundRect(-pose.w*pivot.x,-pose.h*pivot.y,pose.w,pose.h,6);ctx.fill();}
      ctx.shadowBlur=0; ctx.fillStyle=label.color;ctx.font=canvasLabelFont(label.size);ctx.textAlign='center';ctx.textBaseline='middle';
      const lines=label.text.split('\n'); lines.forEach((line,i)=>ctx.fillText(line,pose.w*(label.x-pivot.x),pose.h*(label.y-pivot.y)+(i-(lines.length-1)/2)*label.size*1.3,pose.w*.91));
    }
    ctx.restore();
  }
  if (!drag?.moved) paintZones();
  if (run.phase !== 'playing') { ctx.fillStyle = `rgba(255,214,141,${Math.min(.12, run.settleAge / 18000)})`; ctx.fillRect(0, 0, width, height); }
  if (response) heatEdges(ctx, pressure, width, height, run.elapsed, reduced);
}
