import { pressure, type HuntRun } from '@/app/game/scene-hunt/model';
import type { HuntPack, Box } from '@/app/game/scene-hunt/schema';
import type { HuntArt } from './art';
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
    w = s.width,
    h = s.height,
    t = reduced ? 0 : r.elapsed,
    p = pressure(pack.rules, r),
    transition = r.phase === 'reveal' || r.phase === 'complete',
    fade = transition ? clamp((r.revealAge - 800) / 1800) : 0;
  ctx.save();
  ctx.drawImage(art.clean, 0, 0, w, h);
  if (!transition && r.phase !== 'ready') {
    // Rain is clipped to the outdoor aperture; increased wind drives a small indoor plume.
    const o = s.outside;
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
      const seed = (n: number) => { const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); },
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
      const e = s.entry;
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
  if (fade < 1) {
    const b = s.familyBox,
      phase = t * (0.003 + p * 0.004),
      breath = reduced ? 0 : Math.sin(phase) * (1.6 + p * 3),
      lean = reduced ? 0 : Math.sin(t * 0.0017) * (0.003 + p * 0.008);
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
        dx = reduced ? 0 : Math.sin(t * 0.012 + i * 0.07) * p * 1.8 * k;
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
    ctx.globalAlpha = 1 - r.miss.age / 420;
    ctx.strokeStyle = '#fff0cb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.miss.x, r.miss.y, 10 + r.miss.age / 18, 0, 7);
    ctx.stroke();
    ctx.restore();
  }
  if (fade > 0) {
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.drawImage(art.safe, 0, 0, w, h);
    ctx.restore();
  }
  if (transition && r.revealAge > 1800 && r.revealAge < 4700 && !reduced) {
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
