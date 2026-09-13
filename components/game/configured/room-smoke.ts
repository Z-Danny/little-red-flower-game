import {roomSmokeFrame,smokePoint,smokeRates,type SmokeStream} from '@/app/game/runtime/room-smoke';
import type {LevelPackage,Run} from '@/app/game/runtime/schema';
import type {Art} from './art';
const fract=(x:number)=>x-Math.floor(x),seed=(i:number)=>fract(Math.sin(i*127.1+311.7)*43758.5453);
const plates=new WeakMap<object,{key:string;blur:HTMLCanvasElement;mask:HTMLCanvasElement}>();
/** Bounded source plumes + accumulated ceiling layer, never a fullscreen gray veil. */
export function drawRoomSmoke(ctx:CanvasRenderingContext2D,pack:LevelPackage,art:Art,run:Run,reduced:boolean){
 const frame=roomSmokeFrame(pack,run);if(!frame)return;
 const {spec,load,height}=frame,b=spec.ceiling;
 const scene=pack.skin.states.find(s=>s.object==='world-scene'&&s.when.all?.every(g=>run.resolved.includes(g))&&s.pose.asset)?.pose.asset??pack.skin.background;
 const image=art[scene].image,key=[b.x,b.y,b.w,b.h].join(':');
 let plate=plates.get(image);
 if(!plate||plate.key!==key){
   const blur=document.createElement('canvas'),mask=document.createElement('canvas');blur.width=mask.width=Math.ceil(b.w);blur.height=mask.height=Math.ceil(b.h);
   const c=blur.getContext('2d')!;c.filter='blur(5px)';c.drawImage(image,-b.x,-b.y,pack.skin.world.width,pack.skin.world.height);
   plate={key,blur,mask};plates.set(image,plate);
 }
 const m=plate.mask.getContext('2d')!;m.clearRect(0,0,b.w,b.h);m.globalCompositeOperation='source-over';m.drawImage(plate.blur,0,0);
 const fade=m.createLinearGradient(0,0,0,height);fade.addColorStop(0,'rgba(0,0,0,1)');fade.addColorStop(.65,'rgba(0,0,0,.8)');fade.addColorStop(1,'rgba(0,0,0,0)');
 m.globalCompositeOperation='destination-in';m.fillStyle=fade;m.fillRect(0,0,b.w,b.h);m.globalCompositeOperation='source-over';
 ctx.save();ctx.globalAlpha=.22+load*.65;ctx.drawImage(plate.mask,b.x,b.y);ctx.restore();
 // Overlapping soft lobes spread beneath the ceiling; upper edge is darkest.
 ctx.save();ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();
 const wash=ctx.createLinearGradient(0,b.y,0,b.y+height);wash.addColorStop(0,`rgba(34,32,36,${.10+load*.35})`);wash.addColorStop(.6,`rgba(52,48,52,${load*.22})`);wash.addColorStop(1,'rgba(50,46,50,0)');ctx.fillStyle=wash;ctx.fillRect(b.x,b.y,b.w,height);
 const t=reduced?0:run.elapsed/1000;
 for(let i=0;i<12;i++){const x=b.x+fract(seed(i+1)-t*.012)*b.w,y=b.y+height*(.12+seed(i+40)*.55);puff(ctx,x,y,50+load*55,.035+load*.09,i+t*.4);}
 ctx.restore();
 stream(spec.door,'door',22);stream(spec.gap,'gap',16);
 function stream(s:SmokeStream,type:'door'|'gap',count:number){
   for(let i=0;i<count;i++){
     const progress=reduced?seed(i+80):fract(run.elapsed/s.lifetimeMs+seed(i+80));
     const birth=run.elapsed-progress*s.lifetimeMs,rate=smokeRates(spec,run,birth)[type];if(rate===0)continue;
     const point=smokePoint(s,progress),swirl=reduced?0:Math.sin(progress*9+i)*s.radius*.28;
     const radius=s.radius*(.35+progress*.95),strength=type==='door'?rate:rate/.22;
     const envelope=Math.sin(Math.PI*Math.min(.98,.06+progress*.9));
     puff(ctx,point.x+swirl,point.y+(seed(i+12)-.5)*s.spread*(1-progress*.65),radius,(type==='door'?.20:.16)*strength*envelope,i+progress*5);
   }
 }
}
let smokeStamp:HTMLCanvasElement|undefined;
function stamp(){
 if(smokeStamp)return smokeStamp;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d')!,pixels=c.createImageData(128,128);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
   const nx=(x-64)/64,ny=(y-64)/64;let remain=1;
   for(const [cx,cy] of [[-.20,-.06],[.17,-.15],[.03,.20]]){const d=Math.hypot(nx-cx,ny-cy)/.79;if(d<1)remain*=1-Math.pow(1-d*d,2)*.68;}
   const a=1-remain,i=(y*128+x)*4,shade=Math.round(63-30*a);pixels.data[i]=shade;pixels.data[i+1]=shade-3;pixels.data[i+2]=shade+2;pixels.data[i+3]=Math.round(a*255);
 }c.putImageData(pixels,0,0);smokeStamp=canvas;return canvas;
}
function puff(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,alpha:number,phase:number){
 ctx.save();ctx.globalAlpha=Math.min(1,alpha*2.1);ctx.translate(x,y);ctx.rotate(phase*.25);ctx.drawImage(stamp(),-r,-r,r*2,r*2);ctx.restore();
}
