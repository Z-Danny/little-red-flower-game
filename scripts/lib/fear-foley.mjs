/** Original non-lexical character Foley. No text, phoneme sequence, TTS, actor
 * recording or reference soundtrack is used. Formants shape a breath/exertion
 * sound; this is stylised synthetic acting, not a recorded human performance. */
function seeded(seed){let s=seed;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/2147483648-1;};}
function resonator(hz,bw,rate){const r=Math.exp(-Math.PI*bw/rate),a=2*r*Math.cos(2*Math.PI*hz/rate),b=r*r;let y1=0,y2=0;return x=>{const y=(1-r)*x+a*y1-b*y2;y2=y1;y1=y;return y;};}
export const fearDurations={'fear-inhale':.78,'fear-tremble':.92,'fear-startle':.68};
export function fearFoley(id,rate=22050){
 if(!(id in fearDurations))throw Error('Unknown fear Foley: '+id);
 const duration=fearDurations[id],out=new Float32Array(Math.round(duration*rate));
 const random=seeded(id==='fear-inhale'?1251:id==='fear-tremble'?4287:6503);
 const closed=id==='fear-tremble',filters=[resonator(closed?410:720,95,rate),resonator(closed?1240:1580,150,rate),resonator(2850,240,rate)];
 let phase=0,low=0,air=0;
 for(let i=0;i<out.length;i++){
  const t=i/rate,p=t/duration,white=random();low=.98*low+.02*white;air=.57*air+.43*white;
  const pitch=(closed?238:id==='fear-startle'?310:285)-(closed?38:85)*p+7*Math.sin(t*2*Math.PI*9)+random()*1.6;
  phase=(phase+pitch/rate)%1;
  const pulse=phase<.42?Math.sin(Math.PI*phase/.42)**2:0;
  const envelope=Math.min(1,t/.045)*Math.min(1,(duration-t)/.18)*Math.exp(-p*.5);
  const flutter=closed?.62+.38*Math.sin(t*2*Math.PI*5.5)**2:1;
  const breath=(air-low)*(.46+(id==='fear-inhale'?.65:0));
  const throat=filters[0](pulse-.2)+.8*filters[1](pulse-.2)+.3*filters[2](pulse-.2);
  const voiced=closed?.95:id==='fear-inhale'?.3+.45*p:.85;
  out[i]=(throat*voiced+breath*(closed?.22:1))*envelope*flutter;
 }
 return out;
}
