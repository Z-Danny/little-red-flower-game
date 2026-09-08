'use client';
import { useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Clock3, Flower2, Lightbulb, Maximize, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { items, layout, level, sceneItems, type ItemId, type Point, type ZoneId } from '@/app/game/kitchen/config';
import { center, itemBox } from '@/app/game/kitchen/animation';
import { controlled, createRun, emotion, reduceRun } from '@/app/game/kitchen/model';
import { pickSceneItem, pickZone, toWorld } from '@/app/game/kitchen/interaction';
import type { Art } from './asset-loader';
import { alphaHit, type Drag } from './renderer';
import { briefFeedback, riskClock } from '@/app/game/kitchen/presentation';
import { KitchenCanvas } from './scene-canvas';

type Props = { totalFlowers: number; onBack: () => void; onFinish: (id: string, stars: number) => void };
export function KitchenPlayer({ onBack, onFinish }: Props) {
  const [run, dispatch] = useReducer(reduceRun, undefined, createRun);
  const [paused, setPaused] = useState(false), [toast, setToast] = useState<string | null>(null), [hint, setHint] = useState<string | null>(null);
  const pausedRef = useRef(false), stageRef = useRef<HTMLElement>(null); pausedRef.current = paused;
  const [ready, setReady] = useState(false), [sound, setSound] = useState(true);
  const [selected, setSelected] = useState<ItemId | null>(null), [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null), canvasRef = useRef<HTMLCanvasElement>(null), artRef = useRef<Art | null>(null);
  const audioRef = useRef<AudioContext | null>(null), award = useRef(false), soundSerial = useRef(0);
  const finishRef = useRef(onFinish); finishRef.current = onFinish;
  const safe = controlled(run), mood = emotion(run), enabled = ready && !paused && run.phase === 'playing' && !run.action;
  const visibleToast = toast ?? (run.action ? briefFeedback(run) : null);
  const updateDrag = (value: Drag | null) => { dragRef.current = value; setDrag(value); };
  const cancel = () => { updateDrag(null); setSelected(null); };
  useEffect(() => {
    window.scrollTo(0, 0); let last = performance.now();
    const timer = window.setInterval(() => { const now = performance.now(); if (!document.hidden && !pausedRef.current) dispatch({ type: 'tick', ms: Math.min(100, now - last) }); last = now; }, 33);
    const clearInput = () => { dragRef.current = null; setDrag(null); setSelected(null); };
    const hide = () => { if (document.hidden) clearInput(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { dragRef.current = null; setDrag(null); setSelected(null); setPaused(false); } };
    document.addEventListener('visibilitychange', hide); window.addEventListener('keydown', key); window.addEventListener('blur', clearInput);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hide); window.removeEventListener('keydown', key); window.removeEventListener('blur', clearInput); };
  }, []);
  useEffect(() => {
    if (run.phase === 'complete' && !award.current) { award.current = true; finishRef.current(level.id, run.stars); }
  }, [run.phase, run.stars]);
  useEffect(() => {
    if (!sound || !audioRef.current || run.notice.serial === soundSerial.current) return;
    soundSerial.current = run.notice.serial;
    const ctx = audioRef.current; if (ctx.state !== 'running') return;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain(), bad = run.notice.tone === 'danger';
    oscillator.type = bad ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(bad ? 180 : 540, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(bad ? 85 : run.notice.tone === 'success' ? 810 : 380, ctx.currentTime + .19);
    gain.gain.setValueAtTime(.026, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .24);
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .25);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    navigator.vibrate?.(bad ? [25, 25, 25] : 15);
  }, [run.notice, sound]);
  useEffect(() => () => { if (audioRef.current) void audioRef.current.close().catch(() => undefined); }, []);
  const audio = () => { if (!sound) return; try { audioRef.current ??= new AudioContext(); void audioRef.current.resume().catch(() => undefined); } catch {} };
  const point = (e: { clientX: number; clientY: number }): Point => toWorld({ x: e.clientX, y: e.clientY }, canvasRef.current!.getBoundingClientRect());
  const startDrag = (item: ItemId, e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || dragRef.current || e.button !== 0 || !e.isPrimary || !canvasRef.current) return;
    e.preventDefault(); audio(); e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e), home = center(itemBox(item, run));
    setSelected(item); updateDrag({ item, point: home, from: home, pointerStart: p, offset: { x: p.x - home.x, y: p.y - home.y }, pointerId: e.pointerId, moved: false });
  };
  const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current; if (!d || d.pointerId !== e.pointerId) return;
    const p = point(e), moved = d.moved || Math.hypot(p.x - d.pointerStart.x, p.y - d.pointerStart.y) > 9;
    updateDrag({ ...d, point: { x: p.x - d.offset.x, y: p.y - d.offset.y }, moved });
  };
  const drop = (item: ItemId, zone: ZoneId, at: Point, from: Point) => { audio(); dispatch({ type: 'drop', item, zone, at, from }); cancel(); };
  const shutOffGas = () => {
    if (!enabled || run.gasOff) return;
    drop('gas', 'off', center(layout.zones.off), center(layout.gas));
  };
  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current; if (!d || d.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.moved) { const p = point(e), at = { x: p.x - d.offset.x, y: p.y - d.offset.y }; drop(d.item, pickZone(at), at, d.from); } else updateDrag(null);
  };
  const restart = () => { cancel(); setPaused(false); setToast(null); setHint(null); award.current = false; soundSerial.current = 0; dispatch({ type: 'reset' }); window.scrollTo(0, 0); };
  useEffect(() => { if (ready) dispatch({ type: 'start' }); }, [ready, run.phase]);
  useEffect(() => {
    setToast(briefFeedback(run));
    const timer = window.setTimeout(() => setToast(null), 2300);
    return () => clearTimeout(timer);
    // A notice is transient, not a persistent action caption or live risk-tick label.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.notice.serial]);
  const openMenu = () => { cancel(); setHint(null); setPaused(true); };
  const showHint = () => setHint(!run.gasOff ? '观察灶台上的燃气旋钮，点击可以关闭。' : !run.covered ? '备菜台上的锅盖可以盖住锅口。' : '火势受控后，将人物拖到右侧门内。');
  const fullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stageRef.current?.requestFullscreen(); }
    catch { setHint('当前浏览器不支持系统全屏，游戏已使用全部可用窗口。'); }
  };
  const trapTab = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab') return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),summary')].filter(el => el.offsetParent !== null);
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };
  return <section ref={stageRef} className={'kitchen-player kitchen-immersive' + (safe ? ' is-safe' : '')} data-phase={run.phase} data-emotion={mood} data-fire={safe ? 'out' : run.covered ? 'covered' : 'burning'} data-paused={paused} data-action={run.action?.kind ?? ''}>
    <div className="kitchen-world" inert={paused || run.phase === 'complete'}>
      <KitchenCanvas run={run} drag={drag} selected={selected} canvasRef={canvasRef} artRef={artRef} onReady={() => setReady(true)}
        onPointerDown={e => {
          if (!enabled || !artRef.current) return;
          const p = point(e), hit = pickSceneItem(p, run, (asset, box, at) => alphaHit(artRef.current!, asset, box, at));
          if (hit === 'gas') shutOffGas(); else if (hit) startDrag(hit, e);
        }} onPointerMove={moveDrag} onPointerUp={e => {
          if (dragRef.current) return endDrag(e);
          if (selected && enabled) { const p = point(e); drop(selected, pickZone(p), p, center(itemBox(selected, run))); }
        }} onPointerCancel={cancel} />
    </div>
    <header className="kitchen-hud" aria-label="关卡信息" inert={paused || run.phase === 'complete'}>
      <button type="button" className="kitchen-icon" onClick={onBack} aria-label="返回关卡地图"><ArrowLeft /></button>
      <h1><small>LEVEL 02</small><span>{level.title}</span></h1>
      <div className={'kitchen-clock' + (run.risk >= 70 && !safe ? ' urgent' : '')} aria-label={safe ? '风险已解除' : '风险倒计时 ' + riskClock(run) + (run.peakReached ? '，仍可继续' : '')}><Clock3 /><span>{safe ? '安全' : riskClock(run)}</span></div>
      <button type="button" className="kitchen-icon" onClick={openMenu} aria-label="暂停游戏"><Pause /></button>
    </header>
    {visibleToast && !paused && run.phase === 'playing' && <div className="kitchen-toast" role="status">{visibleToast}</div>}
    {selected && !drag?.moved && !paused && <button type="button" className="kitchen-cancel kitchen-icon" aria-label="取消选择" onClick={cancel}><X /></button>}
    {paused && <div className="kitchen-menu-shade"><section className="kitchen-menu" role="dialog" aria-modal="true" aria-labelledby="kitchen-menu-title" onKeyDown={trapTab}>
      <span className="kitchen-overline">LEVEL 02</span><h2 id="kitchen-menu-title">已暂停</h2>
      <button type="button" className="kitchen-primary" autoFocus onClick={() => setPaused(false)}><Play />继续游戏</button>
      <div className="kitchen-menu-actions">
        <button type="button" onClick={restart}><RotateCcw />重新开始</button>
        <button type="button" onClick={() => { setSound(!sound); if (!sound) { try { audioRef.current ??= new AudioContext(); void audioRef.current.resume(); } catch {} } }}>{sound ? <Volume2 /> : <VolumeX />}{sound ? '关闭声音' : '打开声音'}</button>
        <button type="button" onClick={showHint}><Lightbulb />需要提示</button>
        <button type="button" onClick={fullscreen}><Maximize />切换全屏</button>
      </div>
      {hint && <p className="kitchen-menu-hint" role="status">{hint}</p>}
      <details className="kitchen-accessible"><summary>操作帮助 / 键盘模式</summary><p>直接拖动物品，也可轻点选中，再点目标。燃气旋钮直接点击。键盘玩家选择物品后返回场景，再按 Tab 选择目标。</p>
        <div>{([...sceneItems, 'person'] as const).map(id => <button key={id} type="button" disabled={!!run.action || id === 'lid' && run.covered || id === 'person' && run.evacuated} onClick={() => { setSelected(id); setPaused(false); }}>{items[id].label}</button>)}</div>
        <button type="button" disabled={!!run.action || run.gasOff} onClick={() => { dispatch({ type: 'drop', item: 'gas', zone: 'off', at: center(layout.gas), from: center(layout.gas) }); setPaused(false); }}>关闭燃气</button>
      </details>
      <p className="kitchen-menu-safety">{level.safety}</p><p className="kitchen-menu-safety">倒计时归零仍可练习。本关小化纤抹布不能盖严锅口；灭火器喷射练习不替代安全动作。</p>
    </section></div>}
    {selected && !paused && <div className="kitchen-keyboard-targets">{(['pan', 'exit'] as const).map(z => <button key={z} type="button" disabled={!enabled} onClick={() => drop(selected, z, center(layout.zones[z]), center(itemBox(selected, run)))}>{z === 'pan' ? '作用于油锅' : '移动到门外'}</button>)}</div>}
    {run.phase === 'complete' && <div className="kitchen-result-shade"><section className="kitchen-result" role="dialog" aria-modal="true" aria-labelledby="kitchen-result-title" onKeyDown={trapTab}>
      <span className="kitchen-overline">LEVEL 02 · 完成</span><h2 id="kitchen-result-title">厨房安全了</h2>
      <div className="kitchen-earned" aria-label={'获得 ' + run.stars + ' 朵小红花'}>{[1, 2, 3].map(n => <Flower2 key={n} className={n <= run.stars ? 'earned' : ''} />)}</div>
      <p>{level.summary}</p><small>{level.cooling}</small>
      <button type="button" className="kitchen-primary" autoFocus onClick={onBack}>返回关卡<ArrowRight /></button><button type="button" className="kitchen-replay" onClick={restart}><RotateCcw />再玩一次</button>
    </section></div>}
  </section>;
}
