'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { fitSurface, readViewport } from './viewport';
let locks = 0;
let restoreDocument: (() => void) | undefined;
function lockDocument() {
  if (++locks === 1) {
    const nodes = [document.documentElement, document.body];
    const before = nodes.map(n => [n.style.overflow, n.style.overscrollBehavior]);
    nodes.forEach(n => { n.style.overflow = 'hidden'; n.style.overscrollBehavior = 'none'; });
    restoreDocument = () => nodes.forEach((n, i) => { n.style.overflow = before[i][0]; n.style.overscrollBehavior = before[i][1]; });
  }
  return () => { if (--locks === 0) { restoreDocument?.(); restoreDocument = undefined; } };
}
/** Canvas and HUD share this exact surface; safe-area padding belongs ONLY to the HUD. */
export function useGameViewport(design: {width:number;height:number}, enabled = true) {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    // Legacy players outside the user's current response-only scope retain their layout and scrolling.
    if (!enabled) return;
    const unlock = lockDocument();
    let raf = 0;
    const measure = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setViewport(readViewport())); };
    const vv = window.visualViewport;
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    measure();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', measure); vv?.removeEventListener('resize', measure); vv?.removeEventListener('scroll', measure); unlock(); };
  }, [enabled]);
  const frame = fitSurface(viewport, design);
  const style: CSSProperties = { position: 'fixed', left: frame.x, top: frame.y, width: frame.width, height: frame.height, margin: 0, minWidth: 0, minHeight: 0, maxWidth: 'none', maxHeight: 'none', overflow: 'hidden' };
  return { style, frame, viewportKey: [frame.x, frame.y, frame.width, frame.height].join(':') };
}
