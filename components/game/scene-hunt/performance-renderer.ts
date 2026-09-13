import type { HuntPack } from '@/app/game/scene-hunt/schema';
import type { HuntRun } from '@/app/game/scene-hunt/model';
import {
  performanceStage,
  performanceTier,
  distantThunderAge,
} from '@/app/game/scene-hunt/performance';
import type { HuntArt } from './art';

const canvases = new WeakMap<HuntArt, HTMLCanvasElement>();
const seed = (i: number) => {
  const n = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return n - Math.floor(n);
};
function surface(art: HuntArt, w: number, h: number) {
  let c = canvases.get(art);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    canvases.set(art, c);
  }
  return c;
}
/** Offscreen composition clips all paint, including line edges, to approved pixels. */
function layer(
  ctx: CanvasRenderingContext2D,
  pack: HuntPack,
  art: HuntArt,
  mask: HTMLCanvasElement | undefined,
  paint: (c: CanvasRenderingContext2D) => void,
  maxAlpha = 1,
) {
  const c = surface(art, pack.skin.width, pack.skin.height),
    g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  g.save();
  paint(g);
  g.restore();
  if (mask) {
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(mask, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }
  if (art.protection) {
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(art.protection, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }
  ctx.save();
  ctx.globalAlpha *= maxAlpha;
  ctx.drawImage(c, 0, 0);
  ctx.restore();
}
export function drawPerformanceEnvironment(
  ctx: CanvasRenderingContext2D,
  pack: HuntPack,
  art: HuntArt,
  r: HuntRun,
  reduced: boolean,
) {
  const p = pack.performance!;
  if (r.phase === 'ready' || r.phase === 'complete') return;
  const s = performanceStage(p, r.elapsed, pack.rules.seconds),
    tier = performanceTier(r.elapsed, p.timing === 'quarters' ? pack.rules.seconds : undefined),
    w = pack.skin.width,
    h = pack.skin.height,
    t = reduced ? 0 : r.elapsed;
  // Vignetting and every environment layer leave exact target evidence unchanged.
  if (s.vignette > 0)
    layer(ctx, pack, art, undefined, (g) => {
      const shade = g.createRadialGradient(
        w * 0.5,
        h * 0.48,
        w * 0.22,
        w * 0.5,
        h * 0.48,
        h * 0.72,
      );
      shade.addColorStop(0, 'rgba(18,36,43,0)');
      shade.addColorStop(1, `rgba(18,36,43,${s.vignette})`);
      g.fillStyle = shade;
      g.fillRect(0, 0, w, h);
    });
  if (p.atmosphere === 'rain' || p.atmosphere === 'thunder') {
    const mask = art.effects?.weatherMask;
    if (mask)
      layer(ctx, pack, art, mask, (g) => {
        g.lineWidth = 1.8;
        g.strokeStyle = '#d0e5e8';
        g.globalAlpha = 0.24 + tier * 0.06;
        for (let i = 0; i < s.rainCount; i++) {
          const speed = 0.75 + seed(i + 90) * 0.6,
            x = (seed(i) * w + t * (0.024 + tier * 0.012) * speed) % w,
            y = (seed(i + 300) * h + t * (0.2 + tier * 0.04) * speed) % h;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - 8 - tier * 6, y + 16 + tier * 5);
          g.stroke();
        }
        // Sparse leaves pass behind people and never move the depicted risky sign/fence.
        if (tier >= 2)
          for (let i = 0; i < 9; i++) {
            const x = (seed(i + 800) * w + t * 0.045) % w,
              y = seed(i + 900) * h + Math.sin(t * 0.001 + i) * 12;
            g.save();
            g.translate(x, y);
            g.rotate(i + t * 0.001);
            g.fillStyle = '#657148';
            g.globalAlpha = 0.42;
            g.beginPath();
            g.ellipse(0, 0, 4, 1.7, 0, 0, 7);
            g.fill();
            g.restore();
          }
      });
    const water = art.effects?.waterMask;
    if (water && tier >= 2)
      layer(ctx, pack, art, water, (g) => {
        g.strokeStyle = '#d0e3e4';
        g.lineWidth = 1.4;
        for (let i = 0; i < 22; i++) {
          const q = (t / 1600 + seed(i)) % 1;
          g.globalAlpha = (1 - q) * 0.26;
          g.beginPath();
          g.ellipse(
            seed(i + 20) * w,
            seed(i + 60) * h,
            3 + q * 15,
            1 + q * 3,
            0,
            0,
            7,
          );
          g.stroke();
        }
      });
    const age = distantThunderAge(p, r.elapsed, pack.rules.seconds);
    if (!reduced && age >= 0 && art.effects?.skyMask)
      layer(ctx, pack, art, art.effects.skyMask, (g) => {
        g.fillStyle = `rgba(227,235,238,${Math.sin((age / 700) * Math.PI) * 0.09})`;
        g.fillRect(0, 0, w, h);
      });
  }
  if (p.atmosphere === 'fire') {
    const sources = pack.skin.effects?.fireSources ?? [],
      drift = pack.skin.effects?.smokeDrift ?? -1;
    if (art.effects?.smokeMask)
      layer(
        ctx,
        pack,
        art,
        art.effects.smokeMask,
        (g) => {
          const smoking = sources.filter((src) => src.kind === 'flame');
          for (let i = 0; i < s.smokeCount && smoking.length; i++) {
            const src = smoking[i % smoking.length],
              q = (t / 4200 + seed(i + 600)) % 1;
            const x =
                src.x +
                src.w * 0.5 +
                drift * q * src.w * 1.1 +
                Math.sin(q * 5 + i) * 6,
              y = src.y + src.h * 0.45 - q * (src.h * 2.4 + 38),
              radius = 7 + q * (src.w * 0.35 + 15);
            const grad = g.createRadialGradient(x, y, 0, x, y, radius);
            grad.addColorStop(0, `rgba(41,43,43,${(1 - q) * 0.56})`);
            grad.addColorStop(1, 'rgba(65,67,64,0)');
            g.fillStyle = grad;
            g.beginPath();
            g.arc(x, y, radius, 0, 7);
            g.fill();
          }
        },
        s.smokeAlpha,
      );
    if (art.effects?.fireMask)
      layer(ctx, pack, art, art.effects.fireMask, (g) => {
        for (const [index, src] of sources.entries()) {
          const cx = src.x + src.w / 2,
            base = src.y + src.h;
          if (src.kind === 'ember') {
            const glow = g.createRadialGradient(
              cx,
              src.y + src.h * 0.55,
              0,
              cx,
              src.y + src.h * 0.55,
              src.w * 0.5,
            );
            glow.addColorStop(
              0,
              `rgba(237,106,47,${0.25 + Math.sin(t * 0.003 + index) * 0.08})`,
            );
            glow.addColorStop(1, 'rgba(210,65,25,0)');
            g.fillStyle = glow;
            g.fillRect(src.x, src.y, src.w, src.h);
            continue;
          }
          if (src.kind === 'fountain') {
            g.strokeStyle = '#f1c779';
            g.lineWidth = 1.5;
            g.globalAlpha = 0.65;
            for (let i = 0; i < 7; i++) {
              const q = (t / 900 + i * 0.14) % 1,
                x = cx + (seed(i + 20) - 0.5) * src.w * q,
                y = base - src.h * Math.sin((q * Math.PI) / 2);
              g.beginPath();
              g.moveTo(x, y);
              g.lineTo(x + 1.8, y + 4);
              g.stroke();
            }
            continue;
          }
          for (let j = 0; j < 4; j++) {
            const height =
                src.h *
                s.flameScale *
                (0.68 + 0.19 * Math.sin(t * 0.007 + j + index)),
              x = cx + (j - 1.5) * src.w * 0.16,
              spread = src.w * 0.22;
            const glow = g.createLinearGradient(x, base, x, base - height);
            glow.addColorStop(0, 'rgba(232,90,30,0)');
            glow.addColorStop(0.3, 'rgba(245,123,46,.72)');
            glow.addColorStop(0.8, 'rgba(249,192,89,.72)');
            glow.addColorStop(1, 'rgba(255,224,153,.28)');
            g.fillStyle = glow;
            g.globalAlpha = 0.7;
            g.beginPath();
            g.moveTo(x - spread, base);
            g.bezierCurveTo(
              x - spread * 1.2,
              base - height * 0.45,
              x + spread * 0.35,
              base - height * 0.58,
              x + Math.sin(t * 0.004 + j) * 5,
              base - height,
            );
            g.bezierCurveTo(
              x + spread * 0.7,
              base - height * 0.55,
              x + spread,
              base - height * 0.2,
              x + spread,
              base,
            );
            g.closePath();
            g.fill();
          }
          if (tier >= 2)
            for (let i = 0; i < 3; i++) {
              const q = (t / 1450 + i * 0.3 + index * 0.15) % 1;
              g.globalAlpha = (1 - q) * 0.55;
              g.fillStyle = '#efbd73';
              g.fillRect(
                cx + drift * q * src.w * 0.3,
                base - q * src.h * 1.6,
                2,
                3,
              );
            }
        }
      });
  }
}
export function characterMotion(pack: HuntPack, r: HuntRun, reduced: boolean) {
  const perf = pack.performance!,
    s = performanceStage(perf, r.elapsed, pack.rules.seconds);
  const t = r.phase === 'ready' ? 0 : r.elapsed,
    active = r.phase !== 'ready';
  const miss =
    active && r.miss
      ? Math.sin(Math.min(1, r.miss.age / 450) * Math.PI) * 3
      : 0;
  const age = r.foundAt
    ? t - r.foundAt.at + (r.phase === 'reveal' ? r.revealAge : 0)
    : -1;
  const nod = age >= 0 && age < 360 ? Math.sin((age / 360) * Math.PI) * 3 : 0;
  const thunder = distantThunderAge(perf, t, pack.rules.seconds),
    startle =
      thunder >= 0 && thunder < 180
        ? Math.sin((thunder / 180) * Math.PI) * 2
        : 0;
  return {
    breath:
      reduced || !active
        ? 0
        : Math.sin((t / s.breathMs) * Math.PI * 2) * s.breathPx,
    retract: reduced || !active ? 0 : s.retractPx + miss + startle,
    nod: reduced ? 0 : nod,
    direction: perf.retreatDirection,
  };
}
export function drawPerformanceFamily(
  ctx: CanvasRenderingContext2D,
  pack: HuntPack,
  art: HuntArt,
  r: HuntRun,
  reduced: boolean,
) {
  const b = pack.skin.familyBox,
    m = characterMotion(pack, r, reduced);
  layer(ctx, pack, art, art.effects?.characterMask, (g) => {
    const slices = 48;
    for (let i = 0; i < slices; i++) {
      const sy = (i * art.family.height) / slices,
        sh = Math.min(art.family.height - sy, art.family.height / slices + 1),
        k = 1 - i / (slices - 1),
        upper = Math.max(0, (k - 0.2) / 0.8);
      const dx = m.direction * m.retract * upper * upper,
        nod = m.nod * Math.max(0, (k - 0.7) / 0.3);
      const height =
        Math.min(b.h - (i * b.h) / slices, b.h / slices + 1) +
        (upper > 0 ? m.breath / slices : 0);
      g.drawImage(
        art.family,
        0,
        sy,
        art.family.width,
        sh,
        b.x + dx,
        b.y + (i * b.h) / slices - m.breath * upper + nod,
        b.w,
        height,
      );
    }
  });
}
