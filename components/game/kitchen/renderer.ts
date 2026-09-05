import { WORLD, layout, items, type AssetId, type Box, type ItemId, type Point, type ZoneId } from '@/app/game/kitchen/config';
import { controlled, emotion, fireLevel, smokeLevel, type Run } from '@/app/game/kitchen/model';
import { center, ease, movingItem, personBox } from '@/app/game/kitchen/animation';
import { contains } from '@/app/game/kitchen/interaction';
import type { Art } from './asset-loader';
export type Drag = { item: ItemId; point: Point; from: Point; pointerId: number; moved: boolean };
export type RenderOptions = { drag: Drag | null; selected: ItemId | null; hover: ZoneId; clock: number; reduced: boolean };

function sprite(ctx: CanvasRenderingContext2D, art: Art, id: AssetId, b: Box, angle = 0, opacity = 1) {
  ctx.save(); ctx.globalAlpha *= opacity;
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.rotate(angle);
  ctx.drawImage(art[id].image, -b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
}
function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#294d48', width = 100) {
  ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x - width / 2, y - 18, width, 36, 14); ctx.fill();
  ctx.fillStyle = '#fff5df'; ctx.font = 'bold 18px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y); ctx.restore();
}
export function alphaHit(art: Art, id: AssetId, box: Box, p: Point) {
  if (!contains(box, p)) return false;
  const a = art[id], x = Math.min(a.width - 1, Math.floor((p.x - box.x) / box.w * a.width));
  const y = Math.min(a.height - 1, Math.floor((p.y - box.y) / box.h * a.height));
  return a.data[(y * a.width + x) * 4 + 3] > 35;
}
export function render(ctx: CanvasRenderingContext2D, art: Art, r: Run, o: RenderOptions) {
  const clock = o.reduced ? 0 : o.clock, safe = controlled(r), heat = fireLevel(r), smoke = smokeLevel(r);
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  ctx.save();
  // Correct/wrong feedback remains legible even when reduced motion is preferred.
  if (!o.reduced && r.action && ['water', 'cloth'].includes(r.action.kind) && r.action.age < 360) ctx.translate(Math.sin(r.action.age / 24) * 3, 0);
  sprite(ctx, art, 'room', { x: 0, y: 0, w: 720, h: 960 });
  ctx.fillStyle = safe ? `rgba(255,223,143,${Math.min(.12, r.settlingAge / 10000)})` : `rgba(55,37,31,${.06 + r.risk / 900})`;
  ctx.fillRect(0, 0, 720, 960);
  if (!safe) {
    const glow = ctx.createRadialGradient(185, 435, 10, 185, 435, 240 + heat * 40);
    glow.addColorStop(0, `rgba(255,108,24,${Math.min(.36, heat * .19)})`); glow.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 100, 550, 620);
  }
  // Door drop affordance is interface geometry, not baked into the room artwork.
  const exit = layout.zones.exit;
  if (o.selected === 'person' || safe) {
    ctx.save(); ctx.strokeStyle = safe ? '#b7e1b2' : '#f5cc7b'; ctx.lineWidth = 3;
    ctx.setLineDash([9, 7]); ctx.fillStyle = o.hover === 'exit' ? '#7eb78645' : '#77a88915';
    ctx.beginPath(); ctx.roundRect(exit.x, exit.y, exit.w, exit.h, 18); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  pill(ctx, '门外安全区', 590, 656, safe ? '#477f60' : '#355952', 142);
  // Burner light is below the pan; a sealed lid never has fire drawn above it.
  if (!r.gasOff) {
    ctx.save(); ctx.fillStyle = '#ff9d46'; ctx.shadowColor = '#ffc554'; ctx.shadowBlur = 16;
    ctx.globalAlpha = .7; ctx.beginPath(); ctx.ellipse(185, 475, 58, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  sprite(ctx, art, 'pan', layout.pan);
  const coverProgress = r.action?.kind === 'cover' ? ease(r.action.age / r.action.duration) : r.covered ? 1 : 0;
  if (!safe && coverProgress < 1) {
    const flicker = 1 + Math.sin(clock / 100) * .035 + Math.sin(clock / 53) * .018;
    const scale = Math.max(.05, heat * (1 - coverProgress) * flicker);
    const b = layout.flame, bottom = b.y + b.h;
    sprite(ctx, art, 'flame', { x: b.x + b.w * (1 - Math.min(1.5, scale)) / 2, y: bottom - b.h * scale, w: b.w * Math.min(1.5, scale), h: b.h * scale }, Math.sin(clock / 160) * .015);
  }
  if (r.covered) sprite(ctx, art, 'lid', layout.lid);
  // Smoke uses soft particles, with no opaque rectangles over artwork.
  for (let i = 0; i < 11; i++) {
    const t = ((clock / 3700 + i / 11) % 1), radius = 19 + t * 55;
    const x = 180 + Math.sin(i * 2.4 + t * 3) * (22 + t * 75), y = 401 - t * 300;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(54,56,52,${smoke * (1 - t) * .47})`); gradient.addColorStop(1, 'rgba(54,56,52,0)');
    ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const gasAngle = r.gasOff ? -Math.PI / 2 : r.action?.kind === 'shutoff' ? -Math.PI / 2 * ease(r.action.age / r.action.duration) : 0;
  sprite(ctx, art, 'gas', layout.gas, gasAngle);
  pill(ctx, r.gasOff ? '已关闭' : '点击关闭', 217, 593, r.gasOff ? '#477f60' : '#7e472c', 111);
  const person = personBox(r);
  // Grounding shadow and foot alignment travel with the character, not the drag pointer.
  ctx.save(); ctx.globalAlpha = .14; ctx.fillStyle = '#3b3026'; ctx.beginPath(); ctx.ellipse(person.x + person.w * .55, person.y + person.h * .975, person.w * .20, 9, 0, 0, 7); ctx.fill(); ctx.restore();
  const draggedPerson = o.drag?.item === 'person' && o.drag.moved;
  sprite(ctx, art, emotion(r), person, 0, draggedPerson ? .4 : 1);
  if (o.selected === 'person' && !r.evacuated) pill(ctx, '拖我到门外', person.x + person.w / 2, person.y - 14, '#314e47', 146);
  if (o.selected && o.selected !== 'person' && o.selected !== 'gas') {
    const p = layout.zones.pan; ctx.save(); ctx.strokeStyle = '#f9edbf'; ctx.lineWidth = o.hover === 'pan' ? 4 : 2; ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, p.y + p.h / 2, p.w / 2, p.h / 2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    pill(ctx, r.covered ? '保持覆盖' : '油锅 / 火焰根部', 187, 640, '#6b4632', 180);
  }
  const moving = movingItem(r);
  if (moving && r.action) sprite(ctx, art, items[r.action.item].asset, moving.box, moving.angle, moving.opacity);
  if (r.action?.kind === 'cloth' && r.action.age < 740) {
    sprite(ctx, art, 'flame', { x: 160, y: 370, w: 70, h: 100 }, 0, Math.sin(r.action.age / 740 * Math.PI));
  }
  if (r.action?.kind === 'water' && r.action.age < 520) {
    ctx.save(); ctx.strokeStyle = '#bcdeed'; ctx.lineWidth = 4;
    for (let i = 0; i < 10; i++) {
      const t = r.action.age / 520, x = 183 + Math.cos(i * 2.4) * 110 * t, y = 405 + Math.sin(i * 2.4) * 80 * t + 80 * t * t;
      ctx.globalAlpha = 1 - t; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4, y + 9); ctx.stroke();
    } ctx.restore();
  }
  if (r.action && ['spray', 'miss-spray'].includes(r.action.kind)) {
    const a = r.action, t = a.age / a.duration;
    const start = { x: a.at.x, y: a.at.y - 50 }, end = a.kind === 'spray' ? { x: 187, y: 423 } : { x: Math.max(30, a.at.x - 130), y: Math.max(80, a.at.y - 100) };
    ctx.save();
    for (let i = 0; i < 24; i++) {
      const p = ((t * 2 + i / 24) % 1), x = start.x + (end.x - start.x) * p + Math.sin(i * 2) * 17 * p, y = start.y + (end.y - start.y) * p + Math.cos(i * 3) * 30 * p;
      ctx.fillStyle = `rgba(235,244,214,${(1 - p) * .65})`; ctx.beginPath(); ctx.arc(x, y, 3 + p * 11, 0, Math.PI * 2); ctx.fill();
    } ctx.restore();
  }
  if (o.drag?.moved) {
    const d = o.drag, item = items[d.item], w = d.item === 'person' ? 150 : item.w, h = d.item === 'person' ? 230 : item.h;
    sprite(ctx, art, d.item === 'person' ? emotion(r) : item.asset, { x: d.point.x - w / 2, y: d.point.y - h / 2 - 28, w, h }, -.035, .96);
  }
  if (r.action?.kind === 'cover') pill(ctx, '平稳盖严锅口', 187, 680, '#436747', 168);
  if (safe && !r.evacuated) pill(ctx, '火已受控，带她撤离', 360, 842, '#476d4d', 254);
  if (r.evacuated) pill(ctx, '厨房恢复安全', 360, 810, '#476d4d', 212);
  ctx.restore();
}
