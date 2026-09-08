'use client';
import { useEffect, useRef, useState, type RefObject, type PointerEventHandler } from 'react';
import { WORLD, type ItemId } from '@/app/game/kitchen/config';
import { cameraFor } from '@/app/game/kitchen/camera';
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
        canvas.height = Math.round(canvas.clientHeight * Math.min(2, window.devicePixelRatio || 1));
      };
      resize(); observer = new ResizeObserver(resize); observer.observe(canvas);
      const draw = () => {
        if (!alive) return;
        const p = latest.current, run = p.run ?? initial;
        let camera = cameraFor(canvas.clientWidth, canvas.clientHeight);
        if (p.preview) {
          const scale = Math.max(canvas.clientWidth / WORLD.width, canvas.clientHeight / WORLD.height);
          camera = { scale, x: (canvas.clientWidth - WORLD.width * scale) / 2, y: (canvas.clientHeight - WORLD.height * scale) * .44 };
        }
        const pixelRatio = canvas.width / canvas.clientWidth;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#382e20'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(camera.scale * pixelRatio, 0, 0, camera.scale * pixelRatio, camera.x * pixelRatio, camera.y * pixelRatio);
        render(ctx, art, run, { selected: p.selected ?? null, drag: p.drag ?? null, hover: p.drag ? pickZone(p.drag.point) : 'miss', clock: p.preview ? 0 : run.elapsed, reduced });
        if (!p.preview) frame = requestAnimationFrame(draw);
      }; draw();
      if (latest.current.preview) { observer.disconnect(); observer = new ResizeObserver(() => { resize(); draw(); }); observer.observe(canvas); }
    }).catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : '素材加载失败'); });
    return () => { alive = false; cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [canvasRef, artRef, retry]);
  return <div className="kitchen-scene" data-scene="kitchen-v3">
    <canvas ref={canvasRef} width={WORLD.width} height={WORLD.height} aria-label="厨房互动场景，可以拖动物品或轻点选取" {...{
      onPointerDown: props.onPointerDown, onPointerMove: props.onPointerMove, onPointerUp: props.onPointerUp, onPointerCancel: props.onPointerCancel,
    }} />
    {!ready && <div className="scene-loading" role="status">{error ? <div>{error}<button type="button" onClick={() => { setError(''); setRetry(n => n + 1); }}>重新加载</button></div> : '厨房训练准备中…'}</div>}
  </div>;
}
