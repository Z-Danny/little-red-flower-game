import {sparkFrame, type ElectricSpark} from '@/app/game/scene-hunt/electric';
/** Small source-anchored arcs, never a screen flash, never changes target masks. */
export function drawElectric(ctx: CanvasRenderingContext2D, sources: ElectricSpark[], elapsed: number, pressure: number, reduced: boolean) {
  for(const s of sources){
    const f=sparkFrame(s,elapsed);if(!f.active && !reduced)continue;
    const radius=s.radius*(.72+pressure*.28),alpha=reduced?.22:f.alpha;
    ctx.save();ctx.translate(s.x,s.y);ctx.globalAlpha=alpha;
    const glow=ctx.createRadialGradient(0,0,1,0,0,radius);
    glow.addColorStop(0,'#fff8c2cc');glow.addColorStop(.4,'#ffc65b55');glow.addColorStop(1,'#ffbc3300');
    ctx.fillStyle=glow;ctx.fillRect(-radius,-radius,radius*2,radius*2);
    if(!reduced)for(let i=0;i<6;i++){
      const angle=i*Math.PI/3+f.slot*.7,len=radius*(.65+.25*Math.sin(i*7+f.slot));
      ctx.save();ctx.rotate(angle);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(len*.35,3);ctx.lineTo(len*.5,-3);ctx.lineTo(len,0);
      ctx.lineCap='round';ctx.strokeStyle='#e8a03d';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#fffbe2';ctx.lineWidth=1.6;ctx.stroke();ctx.restore();
    }
    ctx.restore();
  }
}
