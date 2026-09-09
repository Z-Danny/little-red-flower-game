'use client';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createRun, emotion, enabled, reduceRun } from '@/app/game/runtime/engine';
import { cameraFor, pickObject, pickZone, scenePoses, toWorld } from '@/app/game/runtime/scene';
import type { Input, LevelPackage, Run } from '@/app/game/runtime/schema';
import { alphaAt, loadArt, type Art } from './art';
import { render, type Drag } from './renderer';

type Props = { pack: LevelPackage; onBack: () => void; onFinish: (id: string, stars: number) => void };
export function ConfiguredPlayer({ pack, onBack, onFinish }: Props) {
  const [run, setRun] = useState(() => createRun(pack)), [paused, setPaused] = useState(false), [ready, setReady] = useState(false);
  const [error, setError] = useState(''), [retry, setRetry] = useState(0), [selected, setSelected] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null), art = useRef<Art | null>(null), drag = useRef<Drag | null>(null), dialog = useRef<HTMLDivElement>(null);
  const reported = useRef(false), reduced = useRef(false), latest = useRef({ run, paused, selected, ready });
  latest.current = { run, paused, selected, ready };
  const modal = paused || run.phase === 'complete';
  const interact = (input: Input) => { if (!latest.current.ready || latest.current.paused) return; setRun(r => reduceRun(pack, r, { type: 'interact', input })); setSelected(null); };
  useEffect(() => {
    let alive = true; setReady(false); art.current = null;
    loadArt(pack.skin).then(result => { if (alive) { art.current = result; setReady(true); } }).catch(e => { if (alive) setError(String(e.message ?? e)); });
    return () => { alive = false; };
  }, [pack, retry]);
  useEffect(() => {
    let frame = 0, last = performance.now(); reduced.current = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loop = (now: number) => {
      const ms = Math.min(100, now - last); last = now;
      if (latest.current.ready && !latest.current.paused && !document.hidden) setRun(r => reduceRun(pack, r, { type: 'tick', ms }));
      const node = canvas.current, ctx = node?.getContext('2d');
      if (node && ctx && art.current && node.clientWidth && node.clientHeight) {
        const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(node.clientWidth * dpr), h = Math.round(node.clientHeight * dpr);
        if (node.width !== w || node.height !== h) { node.width = w; node.height = h; }
        const camera = cameraFor(pack, node.clientWidth, node.clientHeight);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#302b25'; ctx.fillRect(0, 0, w, h);
        ctx.setTransform(camera.scale * dpr, 0, 0, camera.scale * dpr, camera.x * dpr, camera.y * dpr);
        render(ctx, pack, art.current, latest.current.run, drag.current, latest.current.selected, reduced.current);
      }
      frame = requestAnimationFrame(loop);
    }; frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [pack]);
  useEffect(() => {
    if (run.phase === 'complete' && !reported.current) { reported.current = true; onFinish(pack.rules.id, run.stars); }
  }, [run.phase, run.stars, onFinish, pack.rules.id]);
  useEffect(() => {
    if (!modal) return;
    drag.current = null; setSelected(null);
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && paused) setPaused(false);
      if (e.key !== 'Tab') return;
      const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.shiftKey && index <= 0) { e.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!e.shiftKey && (index === buttons.length - 1 || index === -1)) { e.preventDefault(); buttons[0].focus(); }
    }; document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); before?.focus(); };
  }, [modal, paused]);
  const pointAt = (e: ReactPointerEvent<HTMLCanvasElement>) => toWorld(pack, { x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect());
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!ready || paused || run.phase !== 'playing' || run.action || drag.current || !art.current) return;
    const point = pointAt(e), id = pickObject(pack, run, point, (asset, local) => alphaAt(art.current!, asset, local), reduced.current);
    const object = pack.rules.objects.find(o => o.id === id);
    if (object?.input === 'tap') { interact({ source: object.id, mode: 'tap' }); return; }
    const zone = pickZone(pack, point);
    if (selected && zone) { interact({ source: selected, mode: 'drop', target: zone, point }); return; }
    if (!id || !object) { setSelected(null); return; }
    const pose = scenePoses(pack, run, reduced.current).find(p => p.id === id)!;
    drag.current = { id, point, offset: { x: point.x - pose.x, y: point.y - pose.y }, start: point, moved: false, pointerId: e.pointerId };
    setSelected(id); e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current; if (!d || d.pointerId !== e.pointerId) return;
    d.point = pointAt(e); d.moved ||= Math.hypot(d.point.x - d.start.x, d.point.y - d.start.y) > 8;
  };
  const up = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current; if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.moved) return;
    const point = pointAt(e), pose = scenePoses(pack, run, reduced.current).find(p => p.id === d.id)!;
    interact({ source: d.id, mode: 'drop', target: pickZone(pack, point), point: { x: point.x - d.offset.x + pose.w / 2, y: point.y - d.offset.y + pose.h / 2 } });
  };
  const replay = () => { drag.current = null; reported.current = false; setSelected(null); setPaused(false); setRun(createRun(pack)); };
  const elapsedClock=pack.rules.risk.mode==='elapsed';
  const seconds = elapsedClock ? Math.floor(run.elapsed/1000) : Math.max(0, Math.ceil((100 - run.risk) * pack.rules.risk.seconds / 100));
  return <section className="configured-player" data-level={pack.rules.id} data-engine="configured-v1" data-phase={run.phase} data-emotion={emotion(pack, run)} data-action={run.action?.rule ?? ''} data-resolved={run.resolved.join(',')}>
    <div className="configured-world" inert={modal}>
      <canvas ref={canvas} aria-label={`${pack.rules.title}互动场景`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setSelected(null); }} />
      {!ready && <div className="configured-loading" role="status">{error || '正在准备场景…'}{error && <button onClick={() => { setError(''); setRetry(n => n + 1); }}>重试</button>}</div>}
    </div>
    <header className="configured-hud" inert={modal}>
      <button onClick={onBack} aria-label="返回关卡">‹</button><span><small>LEVEL {String(pack.rules.order).padStart(2, '0')}</small>{pack.rules.title}</span>
      <time aria-label={elapsedClock?'训练用时（不是救援到达时间）':'风险倒计时'}>{run.phase !== 'playing' ? (pack.rules.completion.status ?? '安全') : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`}</time>
      <button aria-label="暂停" onClick={() => setPaused(true)}>Ⅱ</button>
    </header>
    {pack.rules.kind === 'prevention' && <div className="configured-targets" inert={modal} aria-label="需要寻找的物件">{pack.rules.goals.filter(g => g.showTarget !== false).map(goal => <div key={goal.id} className={run.resolved.includes(goal.id) ? 'done' : ''} aria-label={`${goal.label}${run.resolved.includes(goal.id) ? '已完成' : '待寻找'}`}><img src={pack.skin.assets[pack.skin.poses[goal.object].asset].src} alt={goal.label} draggable={false} />{run.resolved.includes(goal.id) && <b>✓</b>}</div>)}</div>}
    {run.notice && !modal && <div className="configured-notice" role="status">{run.notice.text}</div>}
    <nav className="configured-keyboard" aria-label="键盘辅助操作" inert={modal}>
      {pack.rules.objects.filter(o => enabled(o, run)).map(o => <button key={o.id} disabled={!ready || !!run.action || run.phase !== 'playing'} onClick={() => o.input === 'tap' ? interact({ source: o.id, mode: 'tap' }) : setSelected(o.id)}>{o.label}</button>)}
      {selected && Object.entries(pack.skin.zones).map(([id, box]) => <button key={id} onClick={() => interact({ source: selected, mode: 'drop', target: id, point: { x: box.x + box.w / 2, y: box.y + box.h / 2 } })}>放到 {pack.skin.zoneLabels?.[id] ?? id}</button>)}
    </nav>
    {modal && <div className="configured-shade"><div className="configured-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="configured-dialog-title">
      <h2 id="configured-dialog-title">{paused ? '暂停训练' : (pack.rules.completion.title ?? '这一关，安全了')}</h2>
      {paused ? <><button onClick={() => setPaused(false)}>继续游戏</button><button onClick={() => { setPaused(false); setRun(r => reduceRun(pack, r, { type: 'hint' })); }}>需要提示</button></> : <><div className="configured-flowers" aria-label={`获得 ${run.stars} 朵小红花`}>{'✿'.repeat(run.stars)}</div><p>{pack.rules.completion.summary}</p></>}
      <button onClick={replay}>重新开始</button><button onClick={onBack}>返回关卡</button>{paused && <small>{pack.rules.safety}</small>}
    </div></div>}
  </section>;
}

export function ConfiguredPreview({ pack }: { pack: LevelPackage }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true; let observer: ResizeObserver | undefined;
    loadArt(pack.skin).then(art => {
      if (!alive || !ref.current) return;
      const canvas = ref.current;
      const draw = () => {
        canvas.width = Math.max(1, Math.round(canvas.clientWidth * 2)); canvas.height = Math.max(1, Math.round(canvas.clientHeight * 2));
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        const scale = Math.max(canvas.width / pack.skin.world.width, canvas.height / pack.skin.world.height);
        ctx.setTransform(scale, 0, 0, scale, (canvas.width - pack.skin.world.width * scale) / 2, (canvas.height - pack.skin.world.height * scale) * .4);
        render(ctx, pack, art, createRun(pack), null, null, true);
      }; draw(); observer = new ResizeObserver(draw); observer.observe(canvas);
    }).catch(() => undefined);
    return () => { alive = false; observer?.disconnect(); };
  }, [pack]);
  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden="true" />;
}
