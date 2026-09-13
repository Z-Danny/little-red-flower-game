'use client';
import {levelTitle,journeyTiming} from '@/app/game/journey/presentation';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createRun, emotion, enabled, reduceRun } from '@/app/game/runtime/engine';
import { cameraFor, pickObject, pickZone, scenePoses, toWorld } from '@/app/game/runtime/scene';
import type { Input, LevelPackage, Run } from '@/app/game/runtime/schema';
import { alphaAt, loadArt, type Art } from './art';
import { render, type Drag } from './renderer';
import { configuredAudioFrame } from '@/app/game/runtime/response';
import { useResponseAudio } from '../response/use-response-audio';
import { useGameViewport } from '@/app/game/display/use-game-viewport';
import { useCameraObstacles } from '@/app/game/display/use-camera-obstacles';
import { PracticePlayer } from './practice-player';
import {SafeFeedback} from '../journey/safe-feedback';
import { CountdownBar } from '../scene-hunt/countdown-bar';
import { HintToggle } from '../scene-hunt/hint-toggle';
import { useHintDisclosure } from '../scene-hunt/use-hint-disclosure';

import { useCollectionSound } from '../scene-hunt/use-collection-sound';

type Props = { pack: LevelPackage; onBack: () => void; onFinish: (id: string, stars: number) => void; journey?:boolean };
/** Staged practices opt in without changing the established legacy levels. */
export function ConfiguredPlayer(props: Props) {
  return props.pack.skin.presentation ? <PracticePlayer {...props}/> : <LegacyConfiguredPlayer {...props}/>;
}
function LegacyConfiguredPlayer({ pack: originalPack, onBack, onFinish, journey=false }: Props) {
  const [pack]=useState(()=>journey?{...originalPack,rules:{...originalPack.rules,completion:{...originalPack.rules.completion,settleMs:journeyTiming.safeHold}}}:originalPack);
  const immersive = pack.rules.kind === 'response';
  const challenge = pack.rules.kind === 'prevention' && pack.rules.risk.timeout === 'fail';
  const [started, setStarted] = useState(!challenge), [hidden, setHidden] = useState(false);
  const viewport = useGameViewport(pack.skin.world, immersive);
  const surface = useRef<HTMLElement>(null);
  const cameraObstacles = useCameraObstacles(surface, '.configured-hud > *', viewport.viewportKey, immersive);
  const [run, setRun] = useState(() => createRun(pack)), [paused, setPaused] = useState(false), [ready, setReady] = useState(false);
  const [error, setError] = useState(''), [retry, setRetry] = useState(0), [selected, setSelected] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null), art = useRef<Art | null>(null), drag = useRef<Drag | null>(null), dialog = useRef<HTMLDivElement>(null);
  const reported = useRef(false), reduced = useRef(false), latest = useRef({ run, paused, selected, ready, started });
  latest.current = { run, paused, selected, ready, started };
  const modal = paused || run.phase === 'complete' || run.phase === 'failed';
  const disclosure = useHintDisclosure(challenge, `${paused}:${hidden}:${started}:${run.phase}:${run.resolved.length}`);
  const collectionSound = useCollectionSound(challenge, pack.rules.risk.seconds, run, ready && started && !paused && !hidden);
  useEffect(() => { const hide = () => { setHidden(document.hidden); drag.current = null; setSelected(null); }; document.addEventListener('visibilitychange', hide); return () => document.removeEventListener('visibilitychange', hide); }, []);
  const audio = useResponseAudio(configuredAudioFrame(pack, run, ready && !paused), pack.skin.response?.cues);
  useEffect(() => { if (immersive) { drag.current = null; setSelected(null); } }, [immersive, viewport.viewportKey]);
  const interact = (input: Input) => { if (!latest.current.ready || latest.current.paused || !latest.current.started) return; disclosure.close(); setRun(r => reduceRun(pack, r, { type: 'interact', input })); setSelected(null); };
  useEffect(() => {
    let alive = true; setReady(false); art.current = null;
    loadArt(pack.skin).then(result => { if (alive) { art.current = result; setReady(true); } }).catch(e => { if (alive) setError(String(e.message ?? e)); });
    return () => { alive = false; };
  }, [pack, retry]);
  useEffect(() => {
    let frame = 0, last = performance.now(); reduced.current = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loop = (now: number) => {
      const ms = Math.min(100, now - last); last = now;
      if (latest.current.ready && latest.current.started && !latest.current.paused && !document.hidden) setRun(r => reduceRun(pack, r, { type: 'tick', ms }));
      const node = canvas.current, ctx = node?.getContext('2d');
      if (node && ctx && art.current && node.clientWidth && node.clientHeight) {
        // Keep subpixel response viewport sizes identical to pointer coordinates.
        const rect = node.getBoundingClientRect();
        const cssWidth = immersive ? rect.width : node.clientWidth, cssHeight = immersive ? rect.height : node.clientHeight;
        const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(cssWidth * dpr), h = Math.round(cssHeight * dpr);
        if (node.width !== w || node.height !== h) { node.width = w; node.height = h; }
        const camera = cameraFor(pack, cssWidth, cssHeight, cameraObstacles.current);
        if (immersive) {
          node.dataset.cameraX = String(camera.x); node.dataset.cameraY = String(camera.y);
          node.dataset.cameraScale = String(camera.scale);
          node.dataset.criticalClipped = String('clippedCritical' in camera ? camera.clippedCritical : false);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#302b25'; ctx.fillRect(0, 0, w, h);
        // Integer backing compensation is display-only; world input never multiplies DPR.
        const sx = immersive ? w / cssWidth : dpr, sy = immersive ? h / cssHeight : dpr;
        ctx.setTransform(camera.scale * sx, 0, 0, camera.scale * sy, camera.x * sx, camera.y * sy);
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
  const pointAt = (e: ReactPointerEvent<HTMLCanvasElement>) => toWorld(pack, { x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect(), cameraObstacles.current);
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !e.isPrimary || !ready || !started || paused || run.phase !== 'playing' || run.action || drag.current || !art.current) return;
    const point = pointAt(e), id = pickObject(pack, run, point, (asset, local) => alphaAt(art.current!, asset, local), reduced.current, challenge);
    if (point.x < 0 || point.y < 0 || point.x >= pack.skin.world.width || point.y >= pack.skin.world.height) return;
    const object = pack.rules.objects.find(o => o.id === id);
    if (object && !enabled(object, run)) return;
    if (object?.input === 'tap') { interact({ source: object.id, mode: 'tap' }); return; }
    const zone = pickZone(pack, point);
    if (selected && zone) { interact({ source: selected, mode: 'drop', target: zone, point }); return; }
    if (!id || !object) {
      setSelected(null);
      if (challenge) { disclosure.close(); collectionSound.wrong(); setRun(r => reduceRun(pack, r, { type: 'miss' })); }
      return;
    }
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
  const replay = () => { audio.reset(); collectionSound.reset(); collectionSound.unlock(); setStarted(true); disclosure.close(); drag.current = null; reported.current = false; setSelected(null); setPaused(false); setRun(createRun(pack)); };
  const elapsedClock=pack.rules.risk.mode==='elapsed';
  const seconds = elapsedClock ? Math.floor(run.elapsed/1000) : Math.max(0, Math.ceil((100 - run.risk) * pack.rules.risk.seconds / 100));
  return <section ref={surface} style={immersive ? viewport.style : undefined} data-game-surface={immersive ? '' : undefined} data-viewport={immersive ? viewport.viewportKey : undefined} onPointerDownCapture={() => { if (pack.skin.response) audio.unlock(); }} className="configured-player" data-level={pack.rules.id} data-engine="configured-v1" data-challenge={challenge ? '50s' : undefined} data-elapsed={Math.floor(run.elapsed)} data-phase={started ? run.phase : 'ready'} data-emotion={emotion(pack, run)} data-action={run.action?.rule ?? ''} data-resolved={run.resolved.join(',')} data-ready={String(ready)} data-paused={String(paused)}>
    <div className="configured-world" inert={modal}>
      <canvas data-game-canvas={immersive ? '' : undefined} ref={canvas} aria-label={`${levelTitle(pack.rules.id,pack.rules.title)}互动场景`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setSelected(null); }} />
      {!ready && <div className="configured-loading" role="status">{error || '正在准备场景…'}{error && <button onClick={() => { setError(''); setRetry(n => n + 1); }}>重试</button>}</div>}
    </div>
    <header className="configured-hud" inert={modal}>
      <button onClick={onBack} aria-label="返回关卡">‹</button><span><small>LEVEL {String(pack.rules.order).padStart(2, '0')}</small>{levelTitle(pack.rules.id,pack.rules.title)}</span>
      {!challenge && <time aria-label={elapsedClock?'训练用时（不是救援到达时间）':'风险倒计时'}>{run.phase !== 'playing' ? (pack.rules.completion.status ?? '安全') : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`}</time>}
      {challenge && <HintToggle disclosure={disclosure} />}
      <button aria-label="暂停" onClick={() => setPaused(true)}>Ⅱ</button>
      {challenge && <CountdownBar elapsed={run.elapsed} seconds={pack.rules.risk.seconds} resolved={run.phase === 'settling' || run.phase === 'complete'} deadline />}
    </header>
    {pack.rules.kind === 'prevention' && <div id={disclosure.id} {...disclosure.panelProps} hidden={challenge && !disclosure.expanded} className="configured-targets" inert={modal} aria-label="需要寻找的物件">{pack.rules.goals.filter(g => g.showTarget !== false).map(goal => <div key={goal.id} className={run.resolved.includes(goal.id) ? 'done' : ''} aria-label={`${goal.label}${run.resolved.includes(goal.id) ? '已完成' : '待寻找'}`}><img src={pack.skin.assets[pack.skin.poses[goal.object].asset].src} alt={goal.label} draggable={false} />{run.resolved.includes(goal.id) && <b>✓</b>}</div>)}</div>}
    {challenge && !started && ready && !modal && <div className="disaster-entry configured-entry"><span>观察场景 · 点击收齐 {pack.rules.goals.length} 件物品</span><button onClick={() => { setStarted(true); collectionSound.unlock(); }}>进入场景 · 开启声音 <b>›</b></button><small>限时训练，不代表现实中必须在这一时限内完成收纳</small></div>}
    {run.notice && started && !modal && <div className="configured-notice" role="status">{run.notice.text}</div>}
    <nav className="configured-keyboard" aria-label="键盘辅助操作" inert={modal || !started}>
      {pack.rules.objects.filter(o => enabled(o, run)).map(o => <button key={o.id} disabled={!ready || !started || !!run.action || run.phase !== 'playing'} onClick={() => o.input === 'tap' ? interact({ source: o.id, mode: 'tap' }) : setSelected(o.id)}>{o.label}</button>)}
      {selected && Object.entries(pack.skin.zones).map(([id, box]) => <button key={id} onClick={() => interact({ source: selected, mode: 'drop', target: id, point: { x: box.x + box.w / 2, y: box.y + box.h / 2 } })}>放到 {pack.skin.zoneLabels?.[id] ?? id}</button>)}
    </nav>
    {journey&&run.phase==='settling'&&<SafeFeedback label={pack.rules.completion.title}/>}
    {modal && !(journey&&run.phase==='complete'&&!paused) && <div className="configured-shade"><div className="configured-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="configured-dialog-title">
      <h2 id="configured-dialog-title">{paused ? '暂停训练' : run.phase === 'failed' ? '时间到了，再挑战一次吧' : (pack.rules.completion.title ?? '这一关，安全了')}</h2>
      {paused ? <><button onClick={() => setPaused(false)}>继续游戏</button><button onClick={() => { setPaused(false); setRun(r => reduceRun(pack, r, { type: 'hint' })); }}>需要提示</button></> : run.phase === 'failed' ? <><p>还有 {pack.rules.goals.length - run.resolved.length} 件物品未收好。观察剪影，再试一次。</p><small>本次不发放小红花，不影响已有最高纪录。</small></> : <><div className="configured-flowers" aria-label={`获得 ${run.stars} 朵小红花`}>{'✿'.repeat(run.stars)}</div><p>{pack.rules.completion.summary}</p></>}
      {challenge && <button onClick={collectionSound.toggle}>{collectionSound.muted ? '打开声音' : '关闭声音'}</button>}
      {pack.skin.response && <button onClick={() => audio.setSettings(s => ({ ...s, muted: !s.muted }))}>{audio.settings.muted ? '打开声音' : '关闭声音'}</button>}
      <button onClick={replay}>{run.phase === 'failed' ? '重新挑战' : '重新开始'}</button><button onClick={onBack}>返回关卡</button>{paused && <small>{pack.rules.safety}</small>}
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
