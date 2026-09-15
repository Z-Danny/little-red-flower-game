'use client';
import {levelTitle,journeyTiming} from '@/app/game/journey/presentation';
import { useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Flower2, X } from 'lucide-react';
import { items, layout, level, sceneItems, WORLD, type ItemId, type Point, type ZoneId } from '@/app/game/kitchen/config';
import { useGameViewport } from '@/app/game/display/use-game-viewport';
import { center, itemBox } from '@/app/game/kitchen/animation';
import { controlled, createRun, emotion, reduceRun } from '@/app/game/kitchen/model';
import { pickSceneItem, pickZone, toWorld } from '@/app/game/kitchen/interaction';
import type { Art } from './asset-loader';
import { alphaHit, type Drag } from './renderer';
import { briefFeedback, countdown } from '@/app/game/kitchen/presentation';
import { KitchenCanvas } from './scene-canvas';
import { kitchenPressure, kitchenTempo } from '@/app/game/kitchen/experience';
import { useInterfaceSound } from '../use-interface-sound';
import { useResponseAudio } from '../response/use-response-audio';
import { kitchen50sCues } from '@/app/game/response/audio-cues';
import { KitchenThermometer } from './kitchen-thermometer';
import {SafeFeedback} from '../journey/safe-feedback';
import { PaintedIcon, PaintedLevelIntro } from '../painted-ui';
import { CountdownBar } from '../scene-hunt/countdown-bar';
import { LevelLaunchStatus, useLevelAutoStart } from '../level-launch';
import { PauseMenu } from '../pause-menu';

type Props = { totalFlowers: number; onBack: () => void; onFinish: (id: string, stars: number) => void; journey?:boolean; autoStart?:boolean };
export function KitchenPlayer({ onBack, onFinish, journey=false, autoStart=false }: Props) {
  const viewport = useGameViewport(WORLD);
  const [run, dispatch] = useReducer((r:ReturnType<typeof createRun>,e:Parameters<typeof reduceRun>[1])=>reduceRun(r,e,journey?{settleMs:journeyTiming.safeHold}:undefined), undefined, createRun);
  const [paused, setPaused] = useState(false), [toast, setToast] = useState<string | null>(null);
  const pausedRef = useRef(false), stageRef = useRef<HTMLElement>(null); pausedRef.current = paused;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(''), [loadAttempt, setLoadAttempt] = useState(0);
  const readyRef = useRef(ready), resetClock = useRef(true); readyRef.current = ready;
  const [selected, setSelected] = useState<ItemId | null>(null), [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null), canvasRef = useRef<HTMLCanvasElement>(null), artRef = useRef<Art | null>(null);
  const award = useRef(false);
  const finishRef = useRef(onFinish); finishRef.current = onFinish;
  const safe = controlled(run), mood = emotion(run), enabled = ready && !paused && run.phase === 'playing' && !run.action;
  const pressure = kitchenPressure(run);
  const clock = countdown(run);
  const audio = useResponseAudio({ elapsed: run.elapsed, active: ready && !paused && run.phase !== 'briefing' && run.phase !== 'complete', ...pressure, tempo: kitchenTempo(pressure.intensity),
    result: ready && run.phase === 'complete' ? 'victory' : null, paused,
    action: run.action ? { id: `${run.action.kind}:${Math.round(run.elapsed - run.action.age)}`, kind: run.action.kind, age: run.action.age, duration: run.action.duration } : undefined,
    milestones: [...(run.gasOff ? ['gasOff'] : []), ...(run.covered ? ['covered'] : []), ...(safe ? ['controlled'] : []), ...(run.evacuated ? ['evacuated'] : [])],
  }, kitchen50sCues);
  const interfaceSound = useInterfaceSound(audio.settings.muted, audio.settings.sfx);
  const visibleToast = toast ?? (run.action ? briefFeedback(run) : null);
  const updateDrag = (value: Drag | null) => { dragRef.current = value; setDrag(value); };
  const cancel = () => {
    const active = dragRef.current, node = canvasRef.current;
    if (active && node?.hasPointerCapture(active.pointerId)) node.releasePointerCapture(active.pointerId);
    updateDrag(null); setSelected(null);
  };
  useEffect(() => {
    const active = dragRef.current, node = canvasRef.current;
    if (active && node?.hasPointerCapture(active.pointerId)) node.releasePointerCapture(active.pointerId);
    dragRef.current = null; setDrag(null); setSelected(null);
  }, [viewport.viewportKey]);
  useEffect(() => {
    window.scrollTo(0, 0); let last = performance.now();
    const timer = window.setInterval(() => { const now = performance.now(); const ms = resetClock.current ? 0 : Math.min(100, now - last); resetClock.current = false; if (readyRef.current && !document.hidden && !pausedRef.current) dispatch({ type: 'tick', ms }); last = now; }, 33);
    const clearInput = () => { dragRef.current = null; setDrag(null); setSelected(null); };
    const hide = () => { if (document.hidden) clearInput(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { dragRef.current = null; setDrag(null); setSelected(null); setPaused(false); } };
    document.addEventListener('visibilitychange', hide); window.addEventListener('keydown', key); window.addEventListener('blur', clearInput);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hide); window.removeEventListener('keydown', key); window.removeEventListener('blur', clearInput); };
  }, []);
  useEffect(() => {
    if (run.phase === 'complete' && !award.current) { award.current = true; finishRef.current(level.id, run.stars); }
  }, [run.phase, run.stars]);
  const point = (e: { clientX: number; clientY: number }): Point => toWorld({ x: e.clientX, y: e.clientY }, canvasRef.current!.getBoundingClientRect());
  const startDrag = (item: ItemId, e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || dragRef.current || e.button !== 0 || !e.isPrimary || !canvasRef.current) return;
    e.preventDefault(); audio.unlock(); audio.pickup(); e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e), home = center(itemBox(item, run));
    setSelected(item); updateDrag({ item, point: home, from: home, pointerStart: p, offset: { x: p.x - home.x, y: p.y - home.y }, pointerId: e.pointerId, moved: false });
  };
  const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current; if (!d || d.pointerId !== e.pointerId) return;
    const p = point(e), moved = d.moved || Math.hypot(p.x - d.pointerStart.x, p.y - d.pointerStart.y) > 9;
    updateDrag({ ...d, point: { x: p.x - d.offset.x, y: p.y - d.offset.y }, moved });
  };
  const drop = (item: ItemId, zone: ZoneId, at: Point, from: Point) => { audio.unlock(); dispatch({ type: 'drop', item, zone, at, from }); cancel(); };
  const shutOffGas = () => {
    if (!enabled || run.gasOff) return;
    drop('gas', 'off', center(layout.zones.off), center(layout.gas));
  };
  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current; if (!d || d.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.moved) { const p = point(e), at = { x: p.x - d.offset.x, y: p.y - d.offset.y }; drop(d.item, pickZone(at), at, d.from); } else updateDrag(null);
  };
  const begin = () => { if (!ready || run.phase !== 'briefing') return; resetClock.current = true; audio.unlock(); dispatch({ type: 'start' }); };
  useLevelAutoStart(autoStart, ready, begin, level.id);
  const reload = () => { setReady(false); setError(''); artRef.current = null; setLoadAttempt(n => n + 1); };
  const restart = () => { audio.reset(); cancel(); setPaused(false); setToast(null); award.current = false; resetClock.current = true; dispatch({ type: 'reset' }); audio.unlock(); dispatch({ type: 'start' }); window.scrollTo(0, 0); };
  useEffect(() => {
    setToast(briefFeedback(run));
    const timer = window.setTimeout(() => setToast(null), 2300);
    return () => clearTimeout(timer);
    // A notice is transient, not a persistent action caption or live risk-tick label.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.notice.serial]);
  const openMenu = () => { cancel(); setPaused(true); };
  const pauseHint = run.action ? '当前操作正在进行，回到场景后等待动作完成。'
    : !run.gasOff ? '观察灶台上的燃气旋钮，点击可以关闭。'
    : !run.covered ? '备菜台上的锅盖可以盖住锅口。'
    : !run.evacuated ? '火势受控后，将人物拖到右侧门内。'
    : '本关操作已完成，回到场景查看结果。';
  const trapTab = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab') return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),summary,input:not(:disabled)')].filter(el => el.offsetParent !== null);
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };
  return <section {...interfaceSound} ref={stageRef} style={viewport.style} data-game-surface onPointerDownCapture={() => { if (run.phase !== 'briefing') audio.unlock(); }} className={'kitchen-player kitchen-immersive' + (safe ? ' is-safe' : '')} data-level={level.id} data-ready={String(ready)} data-auto-start={autoStart || undefined} data-phase={run.phase} data-emotion={mood} data-fire={safe ? 'out' : run.covered ? 'covered' : 'burning'} data-paused={paused} data-action={run.action?.kind ?? ''}
    data-elapsed={Math.round(run.elapsed)} data-remaining={clock.seconds} data-pressure-tier={pressure.tier} data-audio-state={audio.status.state} data-audio-loaded={audio.status.loaded} data-audio-missing={audio.status.missing.join(',')} data-audio-cue={audio.status.lastCue} data-audio-rms={audio.status.rms.toFixed(5)} data-audio-loops={audio.status.loops} data-character-cue={audio.status.characterCue} data-character-plays={audio.status.characterPlays} data-music-rate={audio.status.musicRate}>
    <div className="kitchen-world" inert={paused || run.phase === 'briefing' || run.phase === 'complete'}>
      <KitchenCanvas key={loadAttempt} run={run} drag={drag} selected={selected} canvasRef={canvasRef} artRef={artRef} onReady={() => setReady(true)} onError={setError} externalLoading={autoStart}
        onPointerDown={e => {
          if (!enabled || !artRef.current) return;
          const p = point(e), zone = pickZone(p);
          // A selected prop/actor may target a zone partly overlapped by the actor itself.
          if (selected && (zone === 'pan' || zone === 'exit')) { drop(selected, zone, p, center(itemBox(selected, run))); return; }
          const hit = pickSceneItem(p, run, (asset, box, at) => alphaHit(artRef.current!, asset, box, at), matchMedia('(prefers-reduced-motion: reduce)').matches);
          if (hit === 'gas') shutOffGas(); else if (hit) startDrag(hit, e);
        }} onPointerMove={moveDrag} onPointerUp={e => {
          if (dragRef.current) return endDrag(e);
          if (selected && enabled) { const p = point(e); drop(selected, pickZone(p), p, center(itemBox(selected, run))); }
        }} onPointerCancel={cancel} />
    </div>
    <header className="kitchen-hud painted-game-hud" aria-label="关卡信息" inert={run.phase === 'briefing' || run.phase === 'complete'}>
      <button type="button" className="kitchen-icon painted-hud-button pause-menu-navigation" onClick={onBack} aria-label="返回关卡地图"><PaintedIcon name="back" /></button>
      <h1><span>{levelTitle('oil-fire',level.title)}</span></h1>
      <button type="button" className="kitchen-icon painted-hud-button" data-ui-sound="hint" aria-label="场景提示" disabled={paused} onClick={openMenu}><PaintedIcon name="hint" /></button>
      <button type="button" className="kitchen-icon painted-hud-button pause-menu-navigation" onClick={() => { cancel(); setPaused(value => !value); }} aria-label={paused ? '继续游戏' : '暂停游戏'} aria-expanded={paused}><PaintedIcon name="pause" /></button>
      <CountdownBar elapsed={run.elapsed} seconds={level.riskSeconds} resolved={run.phase === 'settling' || run.phase === 'complete'} training />
    </header>
    {run.phase === 'briefing' && !paused && (autoStart ? <LevelLaunchStatus error={error} onRetry={reload} onBack={onBack} /> : <PaintedLevelIntro levelId="oil-fire" title={levelTitle('oil-fire',level.title)} ready={ready} error={error} onRetry={reload} onStart={begin} onBack={onBack} />)}
    <KitchenThermometer heat={pressure.heat} safe={safe}/>
    {visibleToast && !paused && run.phase === 'playing' && <div className="kitchen-toast" role="status">{visibleToast}</div>}
    {selected && !drag?.moved && !paused && <button type="button" className="kitchen-cancel kitchen-icon" aria-label="取消选择" onClick={cancel}><X /></button>}
    {paused && <PauseMenu hint={pauseHint} muted={audio.settings.muted}
      onToggleSound={() => { audio.setSettings(s => ({ ...s, muted: !s.muted })); audio.unlock(); }}
      onRestart={restart} onResume={() => setPaused(false)} />}
    <nav className="kitchen-keyboard-targets" aria-label="键盘辅助操作" inert={paused || run.phase !== 'playing'}>
      {([...sceneItems, 'person'] as const).map(id => <button key={id} type="button" disabled={!enabled || id === 'lid' && run.covered || id === 'person' && run.evacuated}
        onClick={() => setSelected(id)}>{items[id].label}</button>)}
      <button type="button" disabled={!enabled || run.gasOff} onClick={shutOffGas}>关闭燃气</button>
    </nav>
    {selected && !paused && <div className="kitchen-keyboard-targets">{(['pan', 'exit'] as const).map(z => <button key={z} type="button" disabled={!enabled} onClick={() => drop(selected, z, center(layout.zones[z]), center(itemBox(selected, run)))}>{z === 'pan' ? '作用于油锅' : '移动到门外'}</button>)}</div>}
    {journey&&run.phase==='settling'&&<SafeFeedback label="危机已解除 · 厨房安全了"/>}
    {!journey&&run.phase === 'complete' && <div className="kitchen-result-shade"><section className="kitchen-result" role="dialog" aria-modal="true" aria-labelledby="kitchen-result-title" onKeyDown={trapTab}>
      <span className="kitchen-overline">完成</span><h2 id="kitchen-result-title">厨房安全了</h2>
      <div className="kitchen-earned" aria-label={'获得 ' + run.stars + ' 朵小红花'}>{[1, 2, 3].map(n => <Flower2 key={n} className={n <= run.stars ? 'earned' : ''} />)}</div>
      <p>{level.summary}</p><small>{level.cooling}</small>
      <button type="button" className="kitchen-primary" autoFocus onClick={onBack}>返回关卡</button><button type="button" className="kitchen-replay" onClick={restart}>再玩一次</button>
    </section></div>}
  </section>;
}
