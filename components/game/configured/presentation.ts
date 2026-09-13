import { attachedBeam } from '@/app/game/runtime/attached-beam';
import { presentationFrame, presentationSceneMatches, type EffectFrame } from '@/app/game/runtime/presentation';
import type { LevelPackage, Run, Pose } from '@/app/game/runtime/schema';

const fractional = (n: number) => n - Math.floor(n);
const seed = (n: number) => fractional(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const defaults = { dust: '#ac9475', rain: '#abc8d8', water: '#4e7f8c', smoke: '#484347', glow: '#ef9d55', machine: '#8bb9b6', light: '#f7dfa1', alarm: '#f14c43', beam: '#ffe9a1' };
/** One world-space aperture mask shared by all optional polygon-clipped effects. */
export function clipPresentationRegion(ctx: CanvasRenderingContext2D, frame: EffectFrame) {
  const b=frame.box;
  ctx.beginPath(); ctx.rect(b.x,b.y,b.w,b.h); ctx.clip();
  if(!frame.clipPolygons)return;
  ctx.beginPath();
  for(const polygon of frame.clipPolygons){
    // Normalize winding so overlapping apertures form a union, never a hole.
    const area=polygon.reduce((sum,p,i)=>{const n=polygon[(i+1)%polygon.length];return sum+p.x*n.y-n.x*p.y;},0);
    const points=area<0?[...polygon].reverse():polygon;
    points.forEach((point,i)=>i?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));
    ctx.closePath();
  }
  ctx.clip('nonzero');
}
/** Every primitive is clipped to its authored physical region, never the face/HUD. */
export function drawPresentationEffect(ctx: CanvasRenderingContext2D, frame: EffectFrame) {
  if (frame.intensity <= .0001) return;
  const b = frame.box, level = Math.min(1, frame.intensity), t = frame.reduced ? 0 : frame.time / 1000;
  ctx.save(); clipPresentationRegion(ctx,frame);
  ctx.fillStyle = frame.color ?? defaults[frame.kind]; ctx.strokeStyle = frame.color ?? defaults[frame.kind];
  if (frame.kind === 'dust') {
    const count = frame.reduced ? 7 : 12 + Math.round(level * 21);
    for (let i = 0; i < count; i++) {
      const x = b.x + fractional(seed(i + 1) + t * .014) * b.w;
      const y = b.y + fractional(seed(i + 30) + t * (.045 + seed(i + 80) * .025)) * b.h;
      ctx.globalAlpha = (.1 + seed(i + 13) * .25) * level;
      ctx.beginPath(); ctx.ellipse(x, y, 1.4 + seed(i + 70) * 2.1, 1 + seed(i + 90) * 1.5, 0, 0, Math.PI * 2); ctx.fill();
    }
  } else if (frame.kind === 'rain') {
    const count = frame.reduced ? 8 : 18 + Math.round(level * 28);
    ctx.lineWidth = 1.4; ctx.globalAlpha = .16 + level * .2;
    for (let i = 0; i < count; i++) {
      const x = b.x + fractional(seed(i + 80) - t * .065) * b.w;
      const y = b.y + fractional(seed(i + 40) + t * .7) * b.h;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 13 + seed(i) * 14); ctx.stroke();
    }
  } else if (frame.kind === 'water') {
    const surface = b.y + b.h * (.72 - level * .28);
    ctx.globalAlpha = .2 + level * .18; ctx.fillRect(b.x, surface, b.w, b.y + b.h - surface);
    ctx.globalAlpha = .22 + level * .2; ctx.lineWidth = 2;
    for (let row = 0; row < 4; row++) {
      ctx.beginPath();
      for (let x = 0; x <= b.w + 6; x += 6) {
        const y = surface + row * Math.max(9, b.h / 14) + Math.sin(x / 34 + t * 1.4 + row * 2) * (frame.reduced ? 1 : 3);
        if (!x) ctx.moveTo(b.x, y); else ctx.lineTo(b.x + x, y);
      }
      ctx.stroke();
    }
  } else if (frame.kind === 'smoke') {
    const count = frame.reduced ? 5 : 8 + Math.round(level * 8);
    for (let i = 0; i < count; i++) {
      const progress = fractional(seed(i + 44) + t * (.05 + seed(i + 10) * .035));
      const side = frame.inward === -1 ? 1 - progress : progress;
      const x = b.x + b.w * side;
      const y = b.y + b.h * (.9 - progress * .7) + Math.sin(i * 3) * b.h * .12;
      const radius = Math.max(9, Math.min(b.w, b.h) * (.2 + progress * .28));
      const haze = ctx.createRadialGradient(x, y, radius * .04, x, y, radius);
      haze.addColorStop(0, frame.color ?? defaults.smoke); haze.addColorStop(1, 'rgba(55,52,56,0)');
      ctx.globalAlpha = level * (.1 + Math.sin(progress * Math.PI) * .24);
      ctx.fillStyle = haze; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  } else if (frame.kind === 'glow' || frame.kind === 'light') {
    // Reflective light, not flame geometry; this never manufactures a fire.
    const x = b.x + b.w / 2, y = b.y + b.h / 2;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, Math.max(b.w, b.h) / 1.5);
    glow.addColorStop(0, frame.color ?? defaults[frame.kind]); glow.addColorStop(1, 'rgba(240,211,159,0)');
    ctx.globalAlpha = level * (frame.kind === 'light' ? .25 : .18) * (frame.reduced ? 1 : .95 + .05 * Math.sin(t * 1.7));
    ctx.fillStyle = glow; ctx.fillRect(b.x, b.y, b.w, b.h);
   } else if(frame.kind==='beam'){
    const on=frame.reduced? .5 : (Math.sin(t*2.4)>.05?1:.08);
    const gradient=ctx.createLinearGradient(b.x+b.w,b.y+b.h,b.x,b.y);gradient.addColorStop(0,'rgba(255,245,181,.6)');gradient.addColorStop(1,'rgba(255,241,170,.01)');
    ctx.fillStyle=gradient;ctx.globalAlpha=on*level;ctx.beginPath();ctx.moveTo(b.x+b.w,b.y+b.h);ctx.lineTo(b.x,b.y+60);ctx.lineTo(b.x+b.w*.6,b.y);ctx.closePath();ctx.fill();
  } else if (frame.kind === 'alarm') {
    const pulse=frame.reduced? .6 : .35+.65*Math.pow((1+Math.sin(t*Math.PI))/2,3);
    ctx.fillStyle='#a4987e';ctx.strokeStyle='#534e43';ctx.lineWidth=2;ctx.globalAlpha=1;ctx.beginPath();ctx.roundRect(b.x+8,b.y+7,b.w-16,b.h-14,12);ctx.fill();ctx.stroke();
    ctx.fillStyle=frame.color??defaults.alarm;ctx.globalAlpha=.4+pulse*.5;ctx.beginPath();ctx.ellipse(b.x+b.w/2,b.y+b.h/2,b.w*.23,b.h*.24,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f9d6a6';ctx.globalAlpha=.6;ctx.beginPath();ctx.ellipse(b.x+b.w*.44,b.y+b.h*.43,3,2,-.4,0,Math.PI*2);ctx.fill();
  } else if (frame.kind === 'machine') {
    // Gentle operating indicator; never electric arcs or a strobing warning.
    ctx.globalAlpha = level * .3; ctx.lineWidth = 2;
    const inset = frame.reduced ? 0 : Math.sin(t * 7) * .6;
    ctx.beginPath(); ctx.roundRect(b.x + 3 + inset, b.y + 3, b.w - 6, b.h - 6, 8); ctx.stroke();
  }
  ctx.restore();
}
/** Lower exclusive / upper inclusive depth interval for interleaving with sprites. */
export function drawPresentation(ctx: CanvasRenderingContext2D, pack: LevelPackage, run: Run, reduced = false, minDepth = -Infinity, maxDepth = Infinity, poses: (Pose & {id:string})[] = []) {
  for (const frame of presentationFrame(pack, run, reduced)) if (frame.depth > minDepth && frame.depth <= maxDepth) {
    if(!presentationSceneMatches(frame,poses))continue;
    if(frame.kind==='beam'&&frame.beam){
      const pose=poses.find(p=>p.id===frame.beam!.object);if(!pose)continue;
      const ray=attachedBeam(pose,frame.beam),on=reduced?.5:(Math.sin(run.elapsed/1000*2.4)>.05?1:.08);
      const gradient=ctx.createLinearGradient(ray.origin.x,ray.origin.y,ray.end.x,ray.end.y);
      gradient.addColorStop(0,'rgba(255,245,192,.42)');gradient.addColorStop(1,'rgba(255,243,180,.01)');
      ctx.save();if(frame.clipPolygons)clipPresentationRegion(ctx,frame);ctx.globalAlpha=on*Math.min(1,frame.intensity);ctx.fillStyle=gradient;ctx.beginPath();
      ray.corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.restore();
    }else drawPresentationEffect(ctx,frame);
  }
}
