'use client';

import { useEffect, useRef, useState } from 'react';
import { actions, WORLD, type ActionId } from '@/app/game/typhoon/config';
import { createRun, type Run } from '@/app/game/typhoon/model';
import { loadAssets, type AssetPack } from './asset-loader';
import { pickObject, renderScene } from './canvas-renderer';

type Props = { run?: Run; preview?: boolean; onHit?: (id: string) => void; onMiss?: () => void; onMessage?: (text: string) => void; onReady?: (pack: AssetPack) => void };
const previewRun = createRun();

export function SceneCanvas({ run = previewRun, preview = false, onHit, onMiss, onMessage, onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runRef = useRef(run);
  const packRef = useRef<AssetPack | null>(null);
  const readyRef = useRef(onReady);
  const focusRef = useRef<ActionId | null>(null);
  const missRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  runRef.current = run; readyRef.current = onReady;

  useEffect(() => {
    let mounted = true;
    let frame = 0;
    let observer: ResizeObserver | undefined;
    void loadAssets().then(pack => {
      if (!mounted || !canvasRef.current) return;
      packRef.current = pack; setLoaded(true); readyRef.current?.(pack);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;
      const resize = () => {
        const width = canvas.getBoundingClientRect().width;
        const scale = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.round(canvas.width * WORLD.height / WORLD.width);
        context.setTransform(canvas.width / WORLD.width, 0, 0, canvas.height / WORLD.height, 0, 0);
      };
      resize(); observer = new ResizeObserver(resize); observer.observe(canvas);
      const draw = (now: number) => {
        if (!mounted) return;
        const miss = missRef.current;
        renderScene(context, pack, runRef.current, { clock: preview ? 0 : runRef.current.elapsed, focus: focusRef.current, miss: miss ? { ...miss, age: now - miss.at } : null });
        frame = window.requestAnimationFrame(draw);
      };
      frame = window.requestAnimationFrame(draw);
    }).catch((reason: unknown) => { if (mounted) setError(reason instanceof Error ? reason.message : '素材加载失败'); });
    return () => { mounted = false; window.cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [preview]);

  return (
    <div className={`layered-scene ${preview ? 'layered-preview' : ''}`} data-scene="typhoon-v2">
      <canvas ref={canvasRef} width={720} height={960}
        aria-label={preview ? '台风前的家：客厅、窗台、五件隐患与家人的实景预览' : '客厅连接阳台。寻找与上方剪影相同的五个物件。'}
        onPointerUp={event => {
          if (preview || !packRef.current || run.phase !== 'playing' || run.action) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width * WORLD.width;
          const y = (event.clientY - rect.top) / rect.height * WORLD.height;
          const hit = pickObject(packRef.current, run, x, y);
          if (hit === 'umbrella') return onMessage?.('雨伞后面还有东西，看看露出的花朵和花盆。');
          if (hit === 'drawer') return onMessage?.('这是普通抽屉。需要固定的是上方的大柜门。');
          if (hit) onHit?.(hit);
          else { missRef.current = { x, y, at: performance.now() }; onMiss?.(); }
        }}
      />
      {!loaded && <div className="scene-loading" role="status">{error || '正在布置你的安全小屋…'}</div>}
      {!preview && <div className="scene-keyboard-targets" aria-label="场景物件键盘操作">
        {(Object.keys(actions) as ActionId[]).map(id => <button key={id} type="button"
          className="scene-keyboard-target" disabled={!loaded || run.phase !== 'playing' || !!run.action || run.resolved.includes(id) || actions[id].requires.some(required => !run.resolved.includes(required))}
          aria-label={`处理${actions[id].label}`} onFocus={() => { focusRef.current = id; }} onBlur={() => { focusRef.current = null; }}
          onClick={() => onHit?.(id)}>{actions[id].label}</button>)}
      </div>}
    </div>
  );
}
