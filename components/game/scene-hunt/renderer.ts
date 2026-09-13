import { pressure, type HuntRun } from '@/app/game/scene-hunt/model';
import type { HuntPack, Box } from '@/app/game/scene-hunt/schema';
import type { HuntArt } from './art';
import { presentationOf, endingFade } from '@/app/game/scene-hunt/presentation';
import { fearMotion } from '@/app/game/scene-hunt/tension';
import {drawElectric} from './electric-renderer';
import {
  drawPerformanceEnvironment,
  drawPerformanceFamily,
} from './performance-renderer';
const clamp = (v: number) => Math.max(0, Math.min(1, v));
function ring(ctx: CanvasRenderingContext2D, b: Box, p: number, time: number) {
  ctx.save();
  const pulse = p < 1 ? 1 + Math.sin(p * Math.PI) * 0.07 : 1;
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  ctx.scale(pulse, pulse);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(
    0,
    0,
    b.w / 2 + 10,
    b.h / 2 + 10,
    -0.06,
    -Math.PI * 0.55,
    -Math.PI * 0.55 + Math.PI * 2 * Math.min(1, p * 1.4),
  );
  ctx.strokeStyle = '#fff2dd';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.strokeStyle = '#ed3d36';
  ctx.lineWidth = 6;
  ctx.shadowColor = '#ce221955';
  ctx.shadowBlur = 7;
  ctx.stroke();
  if (p >= 1) {
    ctx.fillStyle = '#ed3d36';
    ctx.beginPath();
    ctx.arc(b.w * 0.32, -b.h * 0.35, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff7df';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.w * 0.32 - 5, -b.h * 0.35);
    ctx.lineTo(b.w * 0.32 - 1, -b.h * 0.35 + 4);
    ctx.lineTo(b.w * 0.32 + 6, -b.h * 0.35 - 5);
    ctx.stroke();
  }
  ctx.restore();
}
export function drawHunt(
  ctx: CanvasRenderingContext2D,
  pack: HuntPack,
  art: HuntArt,
  r: HuntRun,
  reduced: boolean,
  hint: string | null,
) {
  const s = pack.skin,
    view = presentationOf(pack),
    w = s.width,
    h = s.height,
    t = reduced ? 0 : r.elapsed,
    p = pressure(pack.rules, r),
    transition = r.phase === 'reveal' || r.phase === 'complete',
    fade = endingFade(r.phase, r.revealAge);
  ctx.save();
  ctx.drawImage(
    view.characters === 'static' ? art.scene : art.clean,
    0,
    0,
    w,
    h,
  );
  if (pack.performance && fade < 1)
    drawPerformanceEnvironment(ctx, pack, art, r, reduced);
  if (
    !pack.performance &&
    view.environment === 'storm' &&
    !transition &&
    r.phase !== 'ready'
  ) {
    // Rain is clipped to the outdoor aperture; increased wind drives a small indoor plume.
    const o = s.outside!;
    ctx.save();
    ctx.beginPath();
    ctx.rect(o.x, o.y, o.w, o.h);
    ctx.clip();
    ctx.fillStyle = `rgba(18,34,48,${p * 0.24})`;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = '#d6edee';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 65 + Math.floor(p * 95); i++) {
      // Seeded independent offsets avoid uniform diagonal bands of rain.
      const seed = (n: number) => {
          const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
          return v - Math.floor(v);
        },
        speed = 0.7 + seed(i + 600) * 0.6,
        x = o.x + ((seed(i) * o.w + t * (0.025 + p * 0.05) * speed) % o.w),
        y = o.y + ((seed(i + 300) * o.h + t * (0.21 + p * 0.26) * speed) % o.h);
      ctx.globalAlpha = 0.18 + p * 0.25;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 10 - p * 18, y + 20 + p * 24);
      ctx.stroke();
    }
    ctx.restore();
    if (p > 0.48) {
      const e = s.entry!;
      ctx.save();
      ctx.strokeStyle = '#c7e8ec';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 28; i++) {
        const q = (t / 1050 + i * 0.071) % 1;
        ctx.globalAlpha = (p - 0.4) * (1 - q) * 0.55;
        const x = e.x + (i * e.w) / 28 + q * 26,
          y = e.y + q * e.h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 6, y + 12);
        ctx.stroke();
      }
      ctx.globalAlpha = (p - 0.4) * 0.23;
      ctx.fillStyle = '#689caf';
      ctx.beginPath();
      ctx.ellipse(e.x + e.w * 0.6, e.y + e.h, e.w * 0.48, 10 + p * 11, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    }
    const shade = ctx.createRadialGradient(
      w * 0.48,
      h * 0.48,
      w * 0.2,
      w * 0.5,
      h * 0.5,
      h * 0.66,
    );
    shade.addColorStop(0, '#101d3000');
    shade.addColorStop(1, `rgba(15,29,42,${0.12 + p * 0.45})`);
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    // One gentle lightning swell per 12s, never strobing. Reduced-motion mode has none.
    if (!reduced && p > 0.6) {
      const flash = t % 12000;
      if (flash < 220) {
        ctx.fillStyle = `rgba(229,243,250,${Math.sin((flash / 220) * Math.PI) * 0.16})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }
  // Characters occlude every weather layer: never draw rain or sweat over faces.
  // Only the people are separated from the same original painting. Hazards never move.
  if (fade < 1 && pack.performance)
    drawPerformanceFamily(ctx, pack, art, r, reduced);
  if (fade < 1 && !pack.performance && view.characters !== 'static') {
    const b = s.familyBox,
      motionPressure = view.characters === 'storm' ? p : 0,
      phase = t * (0.003 + motionPressure * 0.004),
      breath = reduced ? 0 : Math.sin(phase) * (1.6 + motionPressure * 3) + (!transition && r.phase === 'playing' && view.characterAudio === 'nonverbal-fear' ? fearMotion(r.elapsed, pack.rules.seconds) : 0),
      lean = reduced
        ? 0
        : Math.sin(t * 0.0017) * (0.003 + motionPressure * 0.008);
    ctx.save();
    ctx.fillStyle = '#503b2530';
    ctx.beginPath();
    ctx.ellipse(b.x + b.w * 0.52, b.y + b.h - 4, b.w * 0.4, 8, 0, 0, 7);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(b.x + b.w * 0.5, b.y + b.h);
    ctx.rotate(lean);
    ctx.globalAlpha = 1;
    // Feet stay anchored. A lightly deforming torso/head avoids a rigid card sliding around.
    const slices = 36;
    for (let i = 0; i < slices; i++) {
      const sy = (i * art.family.height) / slices,
        sh = art.family.height / slices + 1,
        k = 1 - i / slices,
        dx = reduced
          ? 0
          : Math.sin(t * 0.012 + i * 0.07) * motionPressure * 1.8 * k;
      ctx.drawImage(
        art.family,
        0,
        sy,
        art.family.width,
        sh,
        -b.w * 0.5 + dx,
        -b.h + (i * b.h) / slices - breath * k,
        b.w,
        b.h / slices + 1 + breath / slices,
      );
    }
    ctx.restore();
  }
  if(r.phase === 'playing' && s.effects?.electricSparks)drawElectric(ctx,s.effects.electricSparks,r.elapsed,p,reduced);
  if (fade < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - fade;
    for (const id of r.found) ring(ctx, s.targets[id].bounds, 1, t);
    if (r.marking)
      ring(
        ctx,
        s.targets[r.marking.id].bounds,
        r.marking.age / pack.rules.markMs,
        t,
      );
    if (hint && s.targets[hint]) {
      const b = s.targets[hint].bounds;
      ctx.strokeStyle = '#ffe593';
      ctx.lineWidth = 5;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.ellipse(
        b.x + b.w / 2,
        b.y + b.h / 2,
        b.w / 2 + 16,
        b.h / 2 + 16,
        0,
        0,
        7,
      );
      ctx.stroke();
    }
    ctx.restore();
  }
  if (r.miss) {
    ctx.save();
    const v2 = pack.rules.feedbackVersion === 2;
    ctx.globalAlpha = v2
      ? r.miss.age < 120
        ? 1
        : Math.max(0, 1 - (r.miss.age - 120) / 330)
      : 1 - r.miss.age / 420;
    ctx.strokeStyle = v2 ? '#efb75b' : '#fff0cb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.miss.x, r.miss.y, 10 + r.miss.age / 18, 0, 7);
    ctx.stroke();
    if (v2) {
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r.miss.x - 5, r.miss.y - 5);
      ctx.lineTo(r.miss.x + 5, r.miss.y + 5);
      ctx.moveTo(r.miss.x + 5, r.miss.y - 5);
      ctx.lineTo(r.miss.x - 5, r.miss.y + 5);
      ctx.stroke();
    }
    ctx.restore();
  }
  if(r.penaltyFeedback && r.phase === 'playing'){
    const f=r.penaltyFeedback;
    ctx.save();ctx.globalAlpha=Math.min(1,(1600-f.age)/400);
    ctx.font='bold 30px "Flower UI", sans-serif';ctx.textAlign='center';ctx.lineJoin='round';
    const x=Math.max(100,Math.min(w-100,f.x)),y=Math.max(150,Math.min(h-100,f.y-24-f.age*.012));
    ctx.lineWidth=6;ctx.strokeStyle='#fff8e8';ctx.strokeText('−5 秒',x,y);ctx.fillStyle='#c94736';ctx.fillText('−5 秒',x,y);ctx.restore();
  }
  if (fade > 0) {
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.drawImage(art.safe, 0, 0, w, h);
    ctx.restore();
  }
  if (
    view.celebration &&
    transition &&
    r.revealAge > 1800 &&
    r.revealAge < 4700 &&
    !reduced
  ) {
    ctx.save();
    for (let i = 0; i < 22; i++) {
      const q = clamp((r.revealAge - 1800 - i * 33) / 2400),
        x = (i * 167) % w,
        y = h * (0.84 - q * 0.7);
      ctx.globalAlpha = Math.sin(q * Math.PI) * 0.7;
      ctx.fillStyle = i % 3 ? '#f6d57b' : '#ef7463';
      ctx.beginPath();
      ctx.ellipse(x + Math.sin(q * 5 + i) * 22, y, 3, 7, i + q, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}
