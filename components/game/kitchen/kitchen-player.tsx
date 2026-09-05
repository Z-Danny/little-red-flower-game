'use client';
import { useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Flame, Flower2, Lightbulb, RotateCcw, ShieldCheck, Volume2, VolumeX, X } from 'lucide-react';
import { assets, emotionLabels, goals, items, layout, level, trayItems, type ItemId, type Point, type ZoneId } from '@/app/game/kitchen/config';
import { center, personBox } from '@/app/game/kitchen/animation';
import { controlled, completedCount, createRun, emotion, reduceRun } from '@/app/game/kitchen/model';
import { pickSceneItem, pickZone, toWorld } from '@/app/game/kitchen/interaction';
import type { Art } from './asset-loader';
import { alphaHit, type Drag } from './renderer';
import { KitchenCanvas } from './scene-canvas';

type Props = { totalFlowers: number; onBack: () => void; onFinish: (id: string, stars: number) => void };
export function KitchenPlayer({ totalFlowers, onBack, onFinish }: Props) {
  const [run, dispatch] = useReducer(reduceRun, undefined, createRun);
  const [ready, setReady] = useState(false), [sound, setSound] = useState(true);
  const [selected, setSelected] = useState<ItemId | null>(null), [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null), canvasRef = useRef<HTMLCanvasElement>(null), artRef = useRef<Art | null>(null);
  const audioRef = useRef<AudioContext | null>(null), award = useRef(false), soundSerial = useRef(0);
  const finishRef = useRef(onFinish); finishRef.current = onFinish;
  const safe = controlled(run), count = completedCount(run), mood = emotion(run), enabled = ready && run.phase === 'playing' && !run.action;
  const updateDrag = (value: Drag | null) => { dragRef.current = value; setDrag(value); };
  const cancel = () => { updateDrag(null); setSelected(null); };
  useEffect(() => {
    window.scrollTo(0, 0); let last = performance.now();
    const timer = window.setInterval(() => { const now = performance.now(); if (!document.hidden) dispatch({ type: 'tick', ms: Math.min(100, now - last) }); last = now; }, 33);
    const hide = () => { if (document.hidden) { dragRef.current = null; setDrag(null); setSelected(null); } };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { dragRef.current = null; setDrag(null); setSelected(null); } };
    document.addEventListener('visibilitychange', hide); window.addEventListener('keydown', key); window.addEventListener('blur', hide);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hide); window.removeEventListener('keydown', key); window.removeEventListener('blur', hide); };
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
    setSelected(item); updateDrag({ item, point: point(e), from: point(e), pointerId: e.pointerId, moved: false });
  };
  const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current; if (!d || d.pointerId !== e.pointerId) return;
    const p = point(e), moved = d.moved || Math.hypot(p.x - d.from.x, p.y - d.from.y) > 9;
    updateDrag({ ...d, point: p, moved });
  };
  const drop = (item: ItemId, zone: ZoneId, at: Point, from: Point) => { audio(); dispatch({ type: 'drop', item, zone, at, from }); cancel(); };
  const shutOffGas = () => {
    if (!enabled || run.gasOff) return;
    drop('gas', 'off', center(layout.zones.off), center(layout.gas));
  };
  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current; if (!d || d.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.moved) { const p = point(e); drop(d.item, pickZone(p), p, d.from); } else updateDrag(null);
  };
  const pointerHandlers = { onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: cancel, onLostPointerCapture: () => { if (dragRef.current) updateDrag(null); } };
  const restart = () => { cancel(); award.current = false; soundSerial.current = 0; dispatch({ type: 'reset' }); window.scrollTo(0, 0); };
  return <section className={`kitchen-player ${safe ? 'is-safe' : ''}`} data-phase={run.phase} data-emotion={mood} data-fire={safe ? 'out' : run.covered ? 'covered' : 'burning'}>
    <header className="typhoon-header">
      <button type="button" className="typhoon-icon-button" onClick={onBack} aria-label="返回关卡地图"><ArrowLeft /></button>
      <div className="typhoon-title"><span>02 / 家庭安全 · 拖拽处置</span><h1>{level.title}</h1></div>
      <button type="button" className="typhoon-icon-button" aria-label={sound ? '关闭声音' : '打开声音'} onClick={() => { setSound(!sound); if (!sound) { try { audioRef.current ??= new AudioContext(); void audioRef.current.resume(); } catch {} } }}>{sound ? <Volume2 /> : <VolumeX />}</button>
      <span className="typhoon-wallet"><Flower2 />{totalFlowers}</span>
    </header>
    <div className="kitchen-goals" aria-label="处置目标">
      {goals.map((g, i) => <button key={g.id} type="button" className={run[g.id] ? 'done' : ''} disabled={!enabled || run[g.id]} aria-label={`${g.label}${run[g.id] ? '已完成' : g.item === 'gas' ? '，点击关闭' : '选择操作'}`} onClick={() => { if (g.item === 'gas') shutOffGas(); else { setSelected(g.item); audio(); } }}>
        <span>{run[g.id] ? <Check /> : `0${i + 1}`}</span><b>{g.label}</b>
      </button>)}
    </div>
    <div className={`kitchen-risk ${run.risk >= 70 && !safe ? 'danger' : ''}`}>
      {safe ? <ShieldCheck /> : <Flame />}<span>{safe ? '火已受控' : run.risk >= 70 ? '火势危险' : '及时处置'}</span>
      <div role="progressbar" aria-label="厨房风险" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(run.risk)}><i style={{ width: `${run.risk}%` }} /></div><b>{count}/3</b>
    </div>
    <div className="kitchen-world">
      <KitchenCanvas run={run} drag={drag} selected={selected} canvasRef={canvasRef} artRef={artRef} onReady={() => setReady(true)}
        onPointerDown={e => {
          if (!enabled || !artRef.current) return;
          const p = point(e), hit = pickSceneItem(p, run);
          const actualHit = hit === 'person' ? alphaHit(artRef.current, mood, personBox(run), p) : hit !== null;
          if (hit === 'gas') shutOffGas();
          else if (hit && actualHit) startDrag(hit, e);
        }} onPointerMove={moveDrag} onPointerUp={e => {
          if (dragRef.current) return endDrag(e);
          if (selected && enabled) { const p = point(e); drop(selected, pickZone(p), p, selected === 'person' ? center(personBox(run)) : selected === 'gas' ? center(layout.gas) : { x: p.x, y: 960 }); }
        }} onPointerCancel={cancel} />
      <div className={`kitchen-emotion ${mood}`} role="status" aria-label={`人物表情：${emotionLabels[mood]}`}>
        <span className="kitchen-face"><img src={assets[mood]} alt="" draggable={false} /></span>
        <span><small>她的状态</small><b>{emotionLabels[mood]}</b></span>
      </div>
      {run.action && <div className={`kitchen-action-caption ${run.notice.tone}`}><i />{run.notice.text}</div>}
      {run.phase === 'briefing' && <div className="kitchen-start-overlay">
        <div className="kitchen-start-card"><span className="typhoon-chapter">处置训练 / 02</span><h2>锅里起火了，<br />现在该怎么做？</h2>
          <p>拖动物件到场景中，观察她的表情与火势变化。关火、盖锅盖都要完成，先后均可。</p>
          <div className="kitchen-start-facts"><span>3 个安全动作</span><span>错误后可纠正</span></div>
          <button type="button" className="typhoon-primary" disabled={!ready} onClick={() => { audio(); dispatch({ type: 'start' }); }}>{ready ? '开始处置' : '正在准备素材'}<ArrowRight /></button>
          <small>推荐先关火。现实火势失控时立即撤离。</small>
        </div>
      </div>}
    </div>
    <div className="kitchen-tray" aria-label="可拖拽物品工具架">
      {trayItems.map(id => <button key={id} type="button" aria-label={`选择${items[id].label}`} aria-pressed={selected === id} title={items[id].detail}
        disabled={!enabled || id === 'lid' && run.covered} className={`${selected === id ? 'selected' : ''} ${id === 'lid' && run.covered ? 'used' : ''}`}
        onPointerDown={e => startDrag(id, e)} {...pointerHandlers} onClick={e => { if (e.detail === 0 && enabled) { audio(); setSelected(id); } }}>
        <img src={assets[items[id].asset]} alt="" draggable={false} /><span>{id === 'lid' && run.covered ? '已盖好' : items[id].label}</span>
      </button>)}
    </div>
    <footer className="kitchen-footer">
      <output className={`kitchen-feedback ${run.notice.tone}`} aria-live="polite">{run.notice.tone === 'success' ? <Check /> : run.notice.tone === 'danger' ? <Flame /> : <span className="feedback-pin" />}<span>{run.notice.text}</span></output>
      <div className="kitchen-controls"><span>{selected ? `${items[selected].label}：${items[selected].detail}` : '拖动；也可先选物品，再点击目标。'}</span>
        {selected && <button type="button" aria-label="取消选择" onClick={cancel}><X /></button>}
        <button type="button" disabled={!enabled} onClick={() => dispatch({ type: 'hint' })}><Lightbulb />提示</button><button type="button" onClick={restart} aria-label="重玩厨房关"><RotateCcw /></button>
      </div>
      <details className="kitchen-accessible"><summary>键盘操作 / 安全说明</summary>
        <p>燃气开关直接点击关闭；其他物品可用工具架选择后，再选择目标：</p><div><button type="button" disabled={!enabled || run.gasOff} onClick={shutOffGas}>点击关闭燃气</button>{(['pan', 'exit'] as const).map(z => <button key={z} type="button" disabled={!selected || !enabled} onClick={() => selected && drop(selected, z, center(layout.zones[z]), selected === 'person' ? center(personBox(run)) : { x: 360, y: 960 })}>{z === 'pan' ? '油锅' : '门外安全区'}</button>)}</div>
        <p>{level.safety}</p><p>本关小湿抹布为化纤材质且无法完全盖住锅口，并非所有湿棉布都不能覆盖初起油锅火。灭火器为厨房适用型；喷射反馈仅用于辨认目标，不替代关火与盖锅盖练习。</p>
      </details>
    </footer>
    {run.phase === 'complete' && <div className="kitchen-result-overlay"><section className="typhoon-result" role="dialog" aria-modal="true" aria-labelledby="kitchen-result-title">
      <div className="typhoon-result-flower"><Flower2 /></div><span className="typhoon-chapter">处置训练 · 完成</span><h2 id="kitchen-result-title">火熄了，<br />也把安心带回来了。</h2>
      <div className="typhoon-earned" aria-label={`获得 ${run.stars} 朵小红花`}>{[1, 2, 3].map(n => <Flower2 key={n} className={n <= run.stars ? 'earned' : ''} />)}</div>
      <blockquote>{level.summary}<small>{level.cooling}</small></blockquote>
      <div className="typhoon-result-stats"><span><b>3 / 3</b>安全动作</span><span><b>{Math.ceil(run.elapsed / 1000)} 秒</b>本次用时</span><span><b>{run.mistakes} 次</b>危险操作</span></div>
      <button type="button" className="typhoon-primary" autoFocus onClick={onBack}>返回关卡地图<ArrowRight /></button><button type="button" className="typhoon-replay" onClick={restart}><RotateCcw />再练习一次</button><p className="typhoon-safety-note">{level.safety}</p>
    </section></div>}
  </section>;
}
