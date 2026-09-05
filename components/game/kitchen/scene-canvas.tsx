'use client';
import { useEffect, useRef, useState, type RefObject, type PointerEventHandler } from 'react';
import { WORLD, type ItemId } from '@/app/game/kitchen/config';
import { createRun, type Run } from '@/app/game/kitchen/model';
import { pickZone } from '@/app/game/kitchen/interaction';
import { loadArt, type Art } from './asset-loader';
import { render, type Drag } from './renderer';

type Props = { run?: Run; preview?: boolean; drag?: Drag | null; selected?: ItemId | null;
  canvasRef?: RefObject<HTMLCanvasElement | null>; artRef?: RefObject<Art | null>; onReady?: () => void;
  onPointerDown?: PointerEventHandler<HTMLCanvasElement>; onPointerMove?: PointerEventHandler<HTMLCanvasElement>;
  onPointerUp?: PointerEventHandler<HTMLCanvasElement>; onPointerCancel?: PointerEventHandler<HTMLCanvasElement> };
const initial = createRun();
export function KitchenCanvas(props: Props) {
  const localCanvas = useRef<HTMLCanvasElement>(null), localArt = useRef<Art | null>(null);
  const canvasRef = props.canvasRef ?? localCanvas, artRef = props.artRef ?? localArt;
  const latest = useRef(props); latest.current = props;
  const [error, setError] = useState(''), [ready, setReady] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true, frame = 0; let observer: ResizeObserver | undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    loadArt().then(art => {
      if (!alive || !canvasRef.current) return;
      artRef.current = art; setReady(true); latest.current.onReady?.();
      const canvas = canvasRef.current, ctx = canvas.getContext('2d'); if (!ctx) { setError('浏览器不支持 2D 绘图'); return; }
      const resize = () => {
        canvas.width = Math.round(canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1));
        canvas.height = Math.round(canvas.width * WORLD.height / WORLD.width);
        ctx.setTransform(canvas.width / WORLD.width, 0, 0, canvas.height / WORLD.height, 0, 0);
      };
      resize(); observer = new ResizeObserver(resize); observer.observe(canvas);
      const draw = () => {
        if (!alive) return;
        const p = latest.current, run = p.run ?? initial;
        render(ctx, art, run, { selected: p.selected ?? null, drag: p.drag ?? null, hover: p.drag ? pickZone(p.drag.point) : 'miss', clock: p.preview ? 0 : run.elapsed, reduced });
        if (!p.preview) frame = requestAnimationFrame(draw);
      }; draw();
      if (latest.current.preview) { observer.disconnect(); observer = new ResizeObserver(() => { resize(); draw(); }); observer.observe(canvas); }
    }).catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : '素材加载失败'); });
    return () => { alive = false; cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [canvasRef, artRef, retry]);
  return <div className="kitchen-scene" data-scene="kitchen-v1">
    <canvas ref={canvasRef} width={720} height={850} aria-label="厨房场景：左侧油锅着火，灶台燃气开关，右侧人物和门外安全区" {...{
      onPointerDown: props.onPointerDown, onPointerMove: props.onPointerMove, onPointerUp: props.onPointerUp, onPointerCancel: props.onPointerCancel,
    }} />
    {!ready && <div className="scene-loading" role="status">{error ? <div>{error}<button type="button" onClick={() => { setError(''); setRetry(n => n + 1); }}>重新加载</button></div> : '厨房训练准备中…'}</div>}
  </div>;
}
