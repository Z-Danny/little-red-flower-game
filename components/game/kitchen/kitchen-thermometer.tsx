import {useId,type CSSProperties} from 'react';
import skin from '@/content/response/kitchen-thermometer.json';
import {thermometerState} from '@/app/game/kitchen/presentation';

/** Generated artwork + dynamic liquid; no countdown banner or pseudo Celsius. */
export function KitchenThermometer({heat,safe}:{heat:number;safe:boolean}){
 const id=useId().replaceAll(':',''),state=thermometerState(heat,safe),{liquid}=skin;
 // The minimum makes ongoing danger legible, but must not imply danger after resolution.
 const fill=safe?0:liquid.minimumFill+(1-liquid.minimumFill)*state.ratio;
 const y=liquid.bottom-(liquid.bottom-liquid.top)*fill;
 const style={'--meter-width':`${skin.display.width}px`,'--meter-top':`${skin.display.top}px`,'--meter-left':`${skin.display.left}px`,'--meter-transition':`${skin.display.transitionMs}ms`,'--meter-color':liquid.color} as CSSProperties;
 return <div className="kitchen-thermometer" style={style} data-tone={state.tone} data-heat={state.ratio.toFixed(4)} role="meter" aria-label="火势紧急程度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.ratio*100)} aria-valuetext={state.label}>
  <svg viewBox={skin.viewBox.join(' ')} aria-hidden="true">
   <defs>
    <clipPath id={`${id}-chamber`}><path d={liquid.chamberPath}/></clipPath>
    <linearGradient id={`${id}-liquid`}><stop stopColor="var(--meter-color)"/><stop offset=".45" stopColor="var(--meter-color)"/><stop offset=".72" stopColor="var(--meter-color)" stopOpacity=".88"/><stop offset="1" stopColor="var(--meter-color)"/></linearGradient>
   </defs>
   <image href={skin.asset} x="0" y="0" width={skin.image.width} height={skin.image.height}/>
   <g clipPath={`url(#${id}-chamber)`}>
    <rect className="kitchen-thermometer-liquid" x="400" y={y} width="230" height={liquid.bottom-y} fill={`url(#${id}-liquid)`}/>
    <rect className="kitchen-thermometer-highlight" x={liquid.highlightX} y={y+16} width={liquid.highlightWidth} height={Math.max(0,liquid.bottom-y-90)} rx="5" fill="#fff3d2" opacity=".42"/>
    <ellipse cx="459" cy="1250" rx="13" ry="33" transform="rotate(34 459 1250)" fill="#fffaf0" opacity={fill>.15?.35:0}/>
   </g>
  </svg>
 </div>;
}
