import { kitchenExperience, type Pressure } from './pressure';
/** Bounded, deterministic particles. Objects and characters are drawn after this pass. */
export function smokePlume(ctx: CanvasRenderingContext2D, p: Pressure, origin: { x: number; y: number }, clock: number, width: number, reduced: boolean) {
  if (p.smoke <= .002) return;
  const count = reduced ? 14 : kitchenExperience.visual.smokeParticles;
  const rise = 370 + p.intensity * 240;
  for (let i = 0; i < count; i++) {
    const t = ((reduced ? 0 : clock / (4300 - p.intensity * 1400)) + i / count) % 1;
    const radius = 23 + t * (64 + p.intensity * 40);
    const x = origin.x + Math.sin(i * 2.4 + t * 3) * (16 + t * 100), y = origin.y - t * rise;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(26,25,26,${p.smoke * (1 - t * .8) * .52})`); g.addColorStop(.5, `rgba(40,37,36,${p.smoke * (1 - t) * .2})`); g.addColorStop(1, 'rgba(40,37,36,0)');
    ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const ceiling = ctx.createLinearGradient(0, 45, 0, 470);
  ceiling.addColorStop(0, `rgba(20,18,21,${p.smoke * p.intensity * kitchenExperience.visual.ceilingOpacity})`); ceiling.addColorStop(1, 'rgba(20,18,21,0)');
  ctx.fillStyle = ceiling; ctx.fillRect(0, 45, width, 425);
}
export function heatEdges(ctx: CanvasRenderingContext2D, p: Pressure, width: number, height: number, time: number, reduced: boolean) {
  const opacity = p.heat * kitchenExperience.visual.heatOpacity * (reduced ? 1 : .87 + .13 * Math.sin(time / 550));
  const g = ctx.createRadialGradient(width / 2, height * .52, width * .3, width / 2, height * .52, height * .66);
  g.addColorStop(0, 'rgba(153,41,8,0)'); g.addColorStop(1, `rgba(177,40,7,${opacity})`); ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
}
