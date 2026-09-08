import { scenePoses } from '@/app/game/runtime/scene';
import type { LevelPackage, Point, Run } from '@/app/game/runtime/schema';
import type { Art } from './art';
export type Drag = { id: string; point: Point; offset: Point; start: Point; pointerId: number; moved: boolean };
export function render(ctx: CanvasRenderingContext2D, pack: LevelPackage, art: Art, run: Run, drag: Drag | null, selected: string | null, reduced: boolean) {
  const { width, height } = pack.skin.world;
  ctx.drawImage(art[pack.skin.background].image, 0, 0, width, height);
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
    ctx.drawImage(art[pose.asset].image, -pose.w * pivot.x, -pose.h * pivot.y, pose.w, pose.h); ctx.restore();
  }
  if (run.phase !== 'playing') { ctx.fillStyle = `rgba(255,214,141,${Math.min(.12, run.settleAge / 18000)})`; ctx.fillRect(0, 0, width, height); }
}
