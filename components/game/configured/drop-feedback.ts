import { findRule } from '@/app/game/runtime/engine';
import { canvasLabelFont } from '@/app/game/typography';
import { relevantZones } from '@/app/game/runtime/drop-zones';
import type { LevelPackage, Run } from '@/app/game/runtime/schema';

/** Preview the matched rule outcome, not merely that a drop is recognised. */
export function paintDropFeedback(
  ctx: CanvasRenderingContext2D,
  pack: LevelPackage,
  run: Run,
  source: string | null,
  active?: string,
) {
  if (!source) return;
  for (const id of relevantZones(pack, run, source)) {
    const box = pack.skin.zones[id],
      hovered = id === active;
    const danger = findRule(pack, run, { source, mode: 'drop', target: id })?.outcome === 'danger';
    ctx.save();
    ctx.strokeStyle = danger ? '#ffb3a1' : hovered ? '#ffe5a3' : '#f6d89b';
    ctx.fillStyle = danger ? (hovered ? '#8a2d2977' : '#672d2822') : hovered ? '#ca923c66' : '#24493b33';
    ctx.lineWidth = hovered ? 5 : 3;
    ctx.setLineDash(hovered ? [] : [10, 8]);
    ctx.beginPath();
    ctx.roundRect(
      box.x,
      box.y,
      box.w,
      box.h,
      Math.min(18, box.w / 2, box.h / 2),
    );
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    if (danger) {
      // A crossed circle keeps the meaning readable without colour perception.
      const x = box.x + box.w / 2, y = box.y + 36, radius = 22;
      ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 15, y + 15); ctx.lineTo(x + 15, y - 15); ctx.stroke();
    }
    const label = danger ? '禁止 · ' + (pack.skin.zoneLabels?.[id] ?? '危险区域') : pack.skin.zoneLabels?.[id];
    if (label) {
      const above = pack.skin.feedback?.zoneLabelPosition === 'above';
      if (above) {
        ctx.fillStyle = danger ? '#692d26ee' : '#403828ee';
        ctx.beginPath(); ctx.roundRect(box.x, box.y - 40, box.w, 32, 8); ctx.fill();
      }
      ctx.fillStyle = '#fff4d9';
      ctx.shadowColor = '#243326';
      ctx.shadowBlur = 4;
      ctx.font = canvasLabelFont(20);
      ctx.textAlign = 'center';
      ctx.fillText(
        label,
        box.x + box.w / 2,
        above ? box.y - 17 : box.y + box.h - 15,
        Math.max(1, box.w - 12),
      );
    }
    ctx.restore();
  }
}
