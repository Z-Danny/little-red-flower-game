'use client';
import {levelTitle,journeyTiming} from '@/app/game/journey/presentation';
import { useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Flower2, Lightbulb, Maximize, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
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
import { useResponseAudio } from '../response/use-response-audio';
import type { AudioBus } from '@/app/game/response/audio';
import { kitchen50sCues } from '@/app/game/response/audio-cues';
import { KitchenThermometer } from './kitchen-thermometer';
import {SafeFeedback} from '../journey/safe-feedback';

type Props = { totalFlowers: number; onBack: () => void; onFinish: (id: string, stars: number) => void; journey?:boolean };
export function KitchenPlayer({ onBack, onFinish, journey=false }: Props) {
  const viewport = useGameViewport(WORLD);
  const [run, dispatch] = useReducer((r:ReturnType<typeof createRun>,e:Parameters<typeof reduceRun>[1])=>reduceRun(r,e,journey?{settleMs:journeyTiming.safeHold}:undefined), undefined, createRun);
  const [paused, setPaused] = useState(false), [toast, setToast] = useState<string | null>(null), [hint, setHint] = useState<string | null>(null);
  const pausedRef = useRef(false), stageRef = useRef<HTMLElement>(null); pausedRef.current = paused;
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<ItemId | null>(null), [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null), canvasRef = useRef<HTMLCanvasElement>(null), artRef = useRef<Art | null>(null);
  const award = useRef(false);
  const finishRef = useRef(onFinish); finishRef.current = onFinish;
  const safe = controlled(run), mood = emotion(run), enabled = ready && !paused && run.phase === 'playing' && !run.action;
  const pressure = kitchenPressure(run);
  const clock = countdown(run);
  const audio = useResponseAudio({ elapsed: run.elapsed, active: ready && !paused && run.phase !== 'briefing' && run.phase !== 'complete', ...pressure, tempo: kitchenTempo(pressure.intensity),
    action: run.action ? { id: `${run.action.kind}:${Math.round(run.elapsed - run.action.age)}`, kind: run.action.kind, age: run.action.age, duration: run.action.duration } : undefined,
    milestones: [...(run.gasOff ? ['gasOff'] : []), ...(run.covered ? ['covered'] : []), ...(safe ? ['controlled'] : []), ...(run.evacuated ? ['evacuated'] : [])],
  }, kitchen50sCues);
  const visibleToast = toast ?? (run.action ? briefFeedback(run) : null);
  const updateDrag = (value: Drag | null) => { dragRef.current = value; setDrag(value); };
  const cancel = () => { updateDrag(null); setSelected(null); };
  useEffect(() => {
    const active = dragRef.current, node = canvasRef.current;
    if (active && node?.hasPointerCapture(active.pointerId)) node.releasePointerCapture(active.pointerId);
    dragRef.current = null; setDrag(null); setSelected(null);
  }, [viewport.viewportKey]);
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
  const restart = () => { audio.reset(); cancel(); setPaused(false); setToast(null); setHint(null); award.current = false; dispatch({ type: 'reset' }); window.scrollTo(0, 0); };
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
    const buttons = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),summary,input:not(:disabled)')].filter(el => el.offsetParent !== null);
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };
  return <section ref={stageRef} style={viewport.style} data-game-surface onPointerDownCapture={audio.unlock} className={'kitchen-player kitchen-immersive' + (safe ? ' is-safe' : '')} data-phase={run.phase} data-emotion={mood} data-fire={safe ? 'out' : run.covered ? 'covered' : 'burning'} data-paused={paused} data-action={run.action?.kind ?? ''}
    data-elapsed={Math.round(run.elapsed)} data-remaining={clock.seconds} data-pressure-tier={pressure.tier} data-audio-state={audio.status.state} data-audio-loaded={audio.status.loaded} data-audio-missing={audio.status.missing.join(',')} data-audio-cue={audio.status.lastCue} data-audio-rms={audio.status.rms.toFixed(5)} data-audio-loops={audio.status.loops} data-character-cue={audio.status.characterCue} data-character-plays={audio.status.characterPlays} data-music-rate={audio.status.musicRate}>
    <div className="kitchen-world" inert={paused || run.phase === 'complete'}>
      <KitchenCanvas run={run} drag={drag} selected={selected} canvasRef={canvasRef} artRef={artRef} onReady={() => setReady(true)}
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
    <header className="kitchen-hud" aria-label="关卡信息" inert={paused || run.phase === 'complete'}>
      <button type="button" className="kitchen-icon" onClick={onBack} aria-label="返回关卡地图"><ArrowLeft /></button>
      <h1><small>LEVEL 02</small><span>{levelTitle('oil-fire',level.title)}</span></h1>
      <button type="button" className="kitchen-icon" aria-label={audio.settings.muted ? '打开声音' : audio.status.state === 'locked' ? '开启场景声音' : '关闭声音'} onClick={() => { if (audio.status.state !== 'locked') audio.setSettings(s => ({ ...s, muted: !s.muted })); audio.unlock(); }}>{audio.settings.muted || audio.status.state === 'locked' ? <VolumeX /> : <Volume2 />}</button>
      <button type="button" className="kitchen-icon" onClick={openMenu} aria-label="暂停游戏"><Pause /></button>
    </header>
    <KitchenThermometer heat={pressure.heat} safe={safe}/>
    {visibleToast && !paused && run.phase === 'playing' && <div className="kitchen-toast" role="status">{visibleToast}</div>}
    {selected && !drag?.moved && !paused && <button type="button" className="kitchen-cancel kitchen-icon" aria-label="取消选择" onClick={cancel}><X /></button>}
    {paused && <div className="kitchen-menu-shade"><section className="kitchen-menu" role="dialog" aria-modal="true" aria-labelledby="kitchen-menu-title" onKeyDown={trapTab}>
      <span className="kitchen-overline">LEVEL 02</span><h2 id="kitchen-menu-title">已暂停</h2>
      <button type="button" className="kitchen-primary" autoFocus onClick={() => setPaused(false)}><Play />继续游戏</button>
      <div className="kitchen-menu-actions">
        <button type="button" onClick={restart}><RotateCcw />重新开始</button>
        <button type="button" onClick={() => { audio.setSettings(s => ({ ...s, muted: !s.muted })); audio.unlock(); }}>{audio.settings.muted ? <VolumeX /> : <Volume2 />}{audio.settings.muted ? '打开声音' : '关闭声音'}</button>
        <button type="button" onClick={showHint}><Lightbulb />需要提示</button>
        <button type="button" onClick={fullscreen}><Maximize />切换全屏</button>
      </div>
      <details className="kitchen-audio-settings"><summary>音乐 / 环境 / 音效</summary>{([['music', '背景音乐'], ['ambience', '环境声音'], ['sfx', '交互音效'], ['character', '人物语气与动作']] as [AudioBus, string][]).filter(([key]) => key !== 'character' || kitchen50sCues.characterEnabled !== false).map(([key, label]) => <label key={key}>{label}<input type="range" min="0" max="100" value={Math.round(audio.settings[key] * 100)} aria-label={label + '音量'} onChange={e => audio.setSettings(s => ({ ...s, [key]: Number(e.target.value) / 100 }))} /></label>)}<small>{kitchen50sCues.characterEnabled === false ? '本关已关闭人物声音，保留背景音乐、燃烧环境声和交互音效。' : '无台词或文字朗读。'}关键动作时音乐自动降低；暂停或切换标签页时停止声音。{audio.status.missing.length > 0 ? '部分音频未加载，游戏仍可继续。' : ''}</small></details>
      {hint && <p className="kitchen-menu-hint" role="status">{hint}</p>}
      <details className="kitchen-accessible"><summary>操作帮助 / 键盘模式</summary><p>直接拖动物品，也可轻点选中，再点目标。燃气旋钮直接点击。键盘玩家选择物品后返回场景，再按 Tab 选择目标。</p>
        <div>{([...sceneItems, 'person'] as const).map(id => <button key={id} type="button" disabled={!!run.action || id === 'lid' && run.covered || id === 'person' && run.evacuated} onClick={() => { setSelected(id); setPaused(false); }}>{items[id].label}</button>)}</div>
        <button type="button" disabled={!!run.action || run.gasOff} onClick={() => { dispatch({ type: 'drop', item: 'gas', zone: 'off', at: center(layout.gas), from: center(layout.gas) }); setPaused(false); }}>关闭燃气</button>
      </details>
      <p className="kitchen-menu-safety">{level.safety}</p><p className="kitchen-menu-safety">50 秒为训练节奏，不代表现实安全时间；归零仍可练习。本关小化纤抹布不能盖严锅口。</p>
    </section></div>}
    {selected && !paused && <div className="kitchen-keyboard-targets">{(['pan', 'exit'] as const).map(z => <button key={z} type="button" disabled={!enabled} onClick={() => drop(selected, z, center(layout.zones[z]), center(itemBox(selected, run)))}>{z === 'pan' ? '作用于油锅' : '移动到门外'}</button>)}</div>}
    {journey&&run.phase==='settling'&&<SafeFeedback label="危机已解除 · 厨房安全了"/>}
    {!journey&&run.phase === 'complete' && <div className="kitchen-result-shade"><section className="kitchen-result" role="dialog" aria-modal="true" aria-labelledby="kitchen-result-title" onKeyDown={trapTab}>
      <span className="kitchen-overline">LEVEL 02 · 完成</span><h2 id="kitchen-result-title">厨房安全了</h2>
      <div className="kitchen-earned" aria-label={'获得 ' + run.stars + ' 朵小红花'}>{[1, 2, 3].map(n => <Flower2 key={n} className={n <= run.stars ? 'earned' : ''} />)}</div>
      <p>{level.summary}</p><small>{level.cooling}</small>
      <button type="button" className="kitchen-primary" autoFocus onClick={onBack}>返回关卡<ArrowRight /></button><button type="button" className="kitchen-replay" onClick={restart}><RotateCcw />再玩一次</button>
    </section></div>}
  </section>;
}
