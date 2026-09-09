import { scenePoses } from '@/app/game/runtime/scene';
import { matches } from '@/app/game/runtime/engine';
import type { LevelPackage, Point, Run } from '@/app/game/runtime/schema';
import type { Art } from './art';
export type Drag = { id: string; point: Point; offset: Point; start: Point; pointerId: number; moved: boolean };
export function render(ctx: CanvasRenderingContext2D, pack: LevelPackage, art: Art, run: Run, drag: Drag | null, selected: string | null, reduced: boolean) {
  const { width, height } = pack.skin.world;
  ctx.drawImage(art[pack.skin.background].image, 0, 0, width, height);
  if (selected || drag) for (const [id,label] of Object.entries(pack.skin.zoneLabels ?? {})) {
    const b=pack.skin.zones[id]; ctx.save(); ctx.strokeStyle='#f6d89b'; ctx.fillStyle='#24493b55'; ctx.lineWidth=3; ctx.setLineDash([10,8]);
    ctx.beginPath(); ctx.roundRect(b.x,b.y,b.w,b.h,18); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#fff4d9'; ctx.font='600 20px "Microsoft YaHei",sans-serif'; ctx.textAlign='center'; ctx.fillText(label,b.x+b.w/2,b.y+b.h-15,b.w-12); ctx.restore();
  }
  const poses = scenePoses(pack, run, reduced);
  // One pose per object; moving/dragged object is not also painted at home.
  if (drag?.moved) { const index = poses.findIndex(p => p.id === drag.id); if (index >= 0) poses.push(...poses.splice(index, 1)); }
  for (const original of poses) {
    const pose = drag?.id === original.id && drag.moved ? { ...original, x: drag.point.x - drag.offset.x, y: drag.point.y - drag.offset.y } : original;
    if ((pose.opacity ?? 1) <= 0) continue;
    const pivot = pose.pivot ?? { x: .5, y: .5 };
    ctx.save(); ctx.globalAlpha = pose.opacity ?? 1;
    ctx.translate(pose.x + pose.w * pivot.x, pose.y + pose.h * pivot.y); ctx.rotate(pose.rotation ?? 0);
    if (selected === pose.id || drag?.id === pose.id) { ctx.shadowColor = '#ffe7a1'; ctx.shadowBlur = 14; }
    ctx.drawImage(art[pose.asset].image, -pose.w * pivot.x, -pose.h * pivot.y, pose.w, pose.h);
    for (const label of pack.skin.labels ?? []) if (label.object === pose.id && (!label.when || matches(pack,run,label.when))) {
      if(label.background){ctx.fillStyle=label.background;ctx.beginPath();ctx.roundRect(-pose.w*pivot.x,-pose.h*pivot.y,pose.w,pose.h,6);ctx.fill();}
      ctx.shadowBlur=0; ctx.fillStyle=label.color;ctx.font=`600 ${label.size}px "Microsoft YaHei",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      const lines=label.text.split('\n'); lines.forEach((line,i)=>ctx.fillText(line,pose.w*(label.x-pivot.x),pose.h*(label.y-pivot.y)+(i-(lines.length-1)/2)*label.size*1.3,pose.w*.91));
    }
    ctx.restore();
  }
  if (run.phase !== 'playing') { ctx.fillStyle = `rgba(255,214,141,${Math.min(.12, run.settleAge / 18000)})`; ctx.fillRect(0, 0, width, height); }
}
