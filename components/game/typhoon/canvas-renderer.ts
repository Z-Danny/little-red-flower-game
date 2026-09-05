import { actions, placement, powerVisuals, WORLD, type ActionId } from '@/app/game/typhoon/config';
import { localPoint, powerStatus, progress, sceneSprites, smooth, type SpritePose } from '@/app/game/typhoon/animation';
import type { Run } from '@/app/game/typhoon/model';
import type { AssetPack } from './asset-loader';

export function drawSprite(context: CanvasRenderingContext2D, pack: AssetPack, pose: SpritePose) {
  if (pose.opacity <= 0 || !pack[pose.asset]) return;
  context.save();
  context.globalAlpha *= pose.opacity;
  context.translate(pose.x + pose.w * pose.anchorX, pose.y + pose.h * pose.anchorY);
  context.rotate(pose.rotation);
  context.transform(pose.scaleX, pose.shear, 0, 1, 0, 0);
  if (pose.clipRight < 1) {
    context.beginPath();
    context.rect(-pose.w * pose.anchorX, -pose.h * pose.anchorY, pose.w * pose.clipRight, pose.h);
    context.clip();
  }
  context.drawImage(pack[pose.asset].image, -pose.w * pose.anchorX, -pose.h * pose.anchorY, pose.w, pose.h);
  context.restore();
}

function rain(context: CanvasRenderingContext2D, clock: number, inside: boolean, intensity: number) {
  if (intensity <= .001) return;
  const area = inside ? placement.rainEntry : placement.outside;
  context.save();
  context.beginPath(); context.rect(area.x, area.y, area.w, area.h); context.clip();
  context.lineWidth = inside ? 1.3 : 1.7;
  context.strokeStyle = `rgba(208,236,249,${(inside ? .37 : .6) * intensity})`;
  context.beginPath();
  const count = inside ? 32 : 87;
  for (let i = 0; i < count; i++) {
    const px = ((i * 67.71 + clock * .115) % (area.w + 35)) + area.x - 20;
    const py = ((i * 93.37 + clock * .43) % (area.h + 45)) + area.y - 30;
    context.moveTo(px, py); context.lineTo(px - 13, py + 29);
  }
  context.stroke(); context.restore();
}

function contactShadow(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, opacity: number) {
  context.save(); context.fillStyle = `rgba(39,32,24,${opacity})`;
  context.beginPath(); context.ellipse(x, y, w, h, 0, 0, Math.PI * 2); context.fill(); context.restore();
}

export type RenderOptions = { clock?: number; focus?: ActionId | null; miss?: { x: number; y: number; age: number } | null };
export function renderScene(context: CanvasRenderingContext2D, pack: AssetPack, run: Run, options: RenderOptions = {}) {
  const clock = options.clock ?? run.elapsed;
  const safe = run.phase === 'settling' || run.phase === 'complete';
  const calm = safe ? smooth(run.settleElapsed / 1900) : 0;
  context.clearRect(0, 0, WORLD.width, WORLD.height);
  context.drawImage(pack.room.image, 0, 0, WORLD.width, WORLD.height);
  rain(context, clock, false, 1 - calm * .93);

  const sprites = sceneSprites(run, clock);
  for (const pose of sprites) {
    if (pose.key === 'plant' && progress(run, 'plant') > .9) contactShadow(context, pose.x + pose.w / 2, pose.y + pose.h - 4, pose.w * .35, 8, .19);
    if (pose.key === 'family-standing') contactShadow(context, pose.x + pose.w / 2, pose.y + pose.h - 5, 57, 10, .16 * pose.opacity);
    // The strip and its indicator are below the cushion in both paint and input order.
    drawSprite(context, pack, pose);
    if (pose.key === 'powerstrip') {
      const status = powerStatus(run), lamp = powerVisuals.indicator;
      context.save();
      context.fillStyle = status.color;
      context.shadowColor = status.glow; context.shadowBlur = 4;
      context.fillRect(pose.x + pose.w * lamp.x, pose.y + pose.h * lamp.y, pose.w * lamp.w, pose.h * lamp.h);
      context.restore();
    }
  }
  const windowOpen = 1 - smooth(progress(run, 'window') / .72);
  rain(context, clock, true, windowOpen * (1 - calm) * (.35 + run.risk / 125));
  if (run.risk >= 62 && windowOpen > 0) {
    context.save();
    context.fillStyle = `rgba(151,199,210,${Math.min(.5, (run.risk - 52) / 105) * (1 - calm)})`;
    context.beginPath(); context.ellipse(332, 666, 38 + run.risk * .26, 10 + run.risk * .05, -.1, 0, Math.PI * 2); context.fill();
    context.restore();
  }
  if (run.consequenceAge !== null) {
    const fade = Math.max(0, 1 - run.consequenceAge / 2200);
    context.save(); context.fillStyle = `rgba(204,226,255,${fade * (.12 + Math.sin(run.consequenceAge / 65) * .06)})`;
    context.fillRect(0, 0, WORLD.width, WORLD.height); context.restore();
  }
  if (calm > 0) {
    context.save(); context.globalCompositeOperation = 'soft-light';
    context.fillStyle = `rgba(255,189,91,${calm * .26})`; context.fillRect(0, 0, WORLD.width, WORLD.height); context.restore();
  }
  const highlighted = options.focus ?? run.hint;
  if (highlighted) {
    const pose = sprites.find(item => item.hit === highlighted);
    if (pose) {
      context.save(); context.shadowColor = '#ffe096'; context.shadowBlur = 13;
      context.strokeStyle = '#fff5bb'; context.lineWidth = 4;
      context.setLineDash([9, 6]);
      context.strokeRect(pose.x - 6, pose.y - 6, pose.w + 12, pose.h + 12);
      context.restore();
    }
  }
  const miss = options.miss;
  if (miss && miss.age < 450) {
    context.save(); context.globalAlpha = 1 - miss.age / 450; context.strokeStyle = '#ffedc2'; context.lineWidth = 3;
    context.beginPath(); context.arc(miss.x, miss.y, 9 + miss.age / 23, 0, Math.PI * 2); context.stroke(); context.restore();
  }
}

/** Paint-order alpha picking prevents invisible rectangular button regions. */
export function pickObject(pack: AssetPack, run: Run, x: number, y: number): ActionId | 'umbrella' | 'drawer' | null {
  const poses = sceneSprites(run).reverse();
  for (const pose of poses) {
    if (pose.opacity < .5) continue;
    const point = localPoint(pose, x, y);
    if (point.x < 0 || point.y < 0 || point.x >= pose.w * pose.clipRight || point.y >= pose.h) continue;
    const asset = pack[pose.asset];
    if (!asset) continue;
    const sx = Math.min(asset.width - 1, Math.floor(point.x / pose.w * asset.width));
    const sy = Math.min(asset.height - 1, Math.floor(point.y / pose.h * asset.height));
    if (asset.alpha[(sy * asset.width + sx) * 4 + 3] < 48) continue;
    if (pose.hit === 'umbrella') return 'umbrella';
    if (pose.hit) return run.resolved.includes(pose.hit) ? null : pose.hit;
    // People and opaque decoration cannot be clicked through.
    return null;
  }
  const d = placement.drawer;
  if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) return 'drawer';
  // Window glass is transparent art, but its visible enclosed pane is a valid target.
  const w = sceneSprites(run).find(s => s.key === 'window')!;
  if (!run.resolved.includes('window') && x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return 'window';
  return null;
}
