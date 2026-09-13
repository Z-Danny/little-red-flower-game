'use client';
import {useEffect,useRef,type RefObject} from 'react';
import type {SceneBox} from './camera';
/** Read actual local UI rectangles after layout, never invent a full-width blank bar. */
export function useCameraObstacles(surface:RefObject<HTMLElement|null>, selector:string, layoutKey:string, enabled = true) {
  const obstacles=useRef<SceneBox[]>([]);
  useEffect(()=>{
    if(!enabled){obstacles.current=[];return;}
    const node=surface.current;if(!node)return;
    let frame=0;
    const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      const b=node.getBoundingClientRect();
      obstacles.current=Array.from(node.querySelectorAll<HTMLElement>(selector)).map(el=>el.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0).map(r=>({x:r.left-b.left,y:r.top-b.top,w:r.width,h:r.height}));
    });};
    const ro=new ResizeObserver(measure);ro.observe(node);for(const el of node.querySelectorAll(selector))ro.observe(el);
    measure();return()=>{cancelAnimationFrame(frame);ro.disconnect();};
  },[surface,selector,layoutKey,enabled]);
  return obstacles;
}
