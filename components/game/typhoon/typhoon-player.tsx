'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Flower2, Lightbulb, RotateCcw, ShieldCheck, Volume2, VolumeX, Wind } from 'lucide-react';
import { actions, assets, goals, level, type ActionId } from '@/app/game/typhoon/config';
import { completedCount, createRun, reduceRun } from '@/app/game/typhoon/model';
import { powerStatus } from '@/app/game/typhoon/animation';
import { SceneCanvas } from './scene-canvas';

type Props = { totalFlowers: number; onBack: () => void; onFinish: (id: string, stars: number) => void; onNext: () => void };

export function TyphoonPlayer({ totalFlowers, onBack, onFinish, onNext }: Props) {
  const [run, dispatch] = useReducer(reduceRun, undefined, createRun);
  const [ready, setReady] = useState(false);
  const [sound, setSound] = useState(true);
  const audio = useRef<AudioContext | null>(null);
  const awarded = useRef(false);
  const playedSerial = useRef(0);
  const completeCallback = useRef(onFinish);
  completeCallback.current = onFinish;
  const count = completedCount(run);
  const safe = run.phase === 'settling' || run.phase === 'complete';
  const power = powerStatus(run);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
    let last = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      if (!document.hidden) dispatch({ type: 'tick', ms: Math.min(100, now - last) });
      last = now;
    }, 33);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (run.phase !== 'complete' || awarded.current) return;
    awarded.current = true;
    completeCallback.current(level.id, run.stars);
  }, [run.phase, run.stars]);

  useEffect(() => {
    if (!sound || !run.notice || playedSerial.current === run.notice.serial || !audio.current) return;
    playedSerial.current = run.notice.serial;
    const ctx = audio.current;
    if (ctx.state !== 'running') return;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(run.notice.kind === 'success' ? 620 : run.notice.kind === 'warning' ? 195 : 370, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(run.notice.kind === 'success' ? 930 : 260, ctx.currentTime + .13);
    gain.gain.setValueAtTime(.027, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .21);
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .22);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    navigator.vibrate?.(run.notice.kind === 'success' ? 22 : 8);
  }, [run.notice, sound]);
  useEffect(() => () => {
    const context = audio.current;
    audio.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }, []);

  const enableSound = () => {
    if (!sound) return;
    try {
      if (!audio.current || audio.current.state === 'closed') audio.current = new AudioContext();
      void audio.current.resume().catch(() => undefined);
    } catch { /* Optional enhancement. */ }
  };
  const restart = () => { awarded.current = false; playedSerial.current = 0; dispatch({ type: 'reset' }); window.scrollTo({ top: 0, left: 0 }); };
  const riskLabel = safe ? '安全' : run.risk < 36 ? '风雨将至' : run.risk < 62 ? '风力增强' : run.risk < 100 ? '及时处理' : '继续排险';

  return (
    <section className={`typhoon-player ${safe ? 'is-safe' : ''}`} data-phase={run.phase}>
      <header className="typhoon-header">
        <button type="button" className="typhoon-icon-button" onClick={onBack} aria-label="返回关卡地图"><ArrowLeft /></button>
        <div className="typhoon-title"><span>01 / 家庭安全 · 找隐患</span><h1>{level.title}</h1></div>
        <button type="button" className="typhoon-icon-button sound-toggle" onClick={() => { setSound(value => !value); if (!sound && !audio.current) { try { audio.current = new AudioContext(); } catch {} } }} aria-label={sound ? '关闭声音' : '打开声音'} aria-pressed={sound}>{sound ? <Volume2 /> : <VolumeX />}</button>
        <span className="typhoon-wallet" aria-label={`${totalFlowers} 朵小红花`}><Flower2 />{totalFlowers}</span>
      </header>
      <div className="typhoon-objective-heading"><span>找到这些物件，让家更安全</span><b aria-live="polite">{count}<small> / 5</small></b></div>
      <div className="typhoon-targets" aria-label="五个目标的真实物件剪影">
        {goals.map((id, index) => {
          const done = run.resolved.includes(id), active = run.action?.id === id;
          return <button key={id} type="button" className={`typhoon-target ${done ? 'is-done' : ''} ${active ? 'is-treating' : ''}`}
            onClick={() => dispatch({ type: 'hint', id })} disabled={done || run.phase !== 'playing' || !!run.action}
            aria-label={`${actions[id].label}${done ? '已完成' : '剪影，点击获得提示'}`}>
            <span className="target-index">0{index + 1}</span>
            <img src={assets[actions[id].sprite]} alt="" draggable={false} />
            <span className="target-name">{actions[id].label}</span>
            {done && <Check className="target-complete" />}
            {active && <span className="target-progress" style={{ width: `${run.action!.elapsed / actions[id].duration * 100}%` }} />}
          </button>;
        })}
      </div>
      <div className={`typhoon-risk ${run.risk >= 62 && !safe ? 'is-warning' : ''}`}>
        {safe ? <ShieldCheck /> : <Wind />}<span>{riskLabel}</span>
        <div className="typhoon-risk-track" role="progressbar" aria-label="环境风险" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safe ? 0 : Math.round(run.risk)}><i style={{ width: `${safe ? 0 : run.risk}%` }} /></div>
        <small>{safe ? '全部排除' : '误点不扣分'}</small>
      </div>
      <div className={`typhoon-world ${run.consequenceAge !== null ? 'gust-impact' : ''}`}>
        <SceneCanvas run={run} onReady={() => setReady(true)} onHit={id => { enableSound(); dispatch({ type: 'hit', id }); }} onMiss={() => dispatch({ type: 'miss' })} onMessage={text => dispatch({ type: 'message', text })} />
        {run.action && <div className="treatment-caption" role="status"><span className="treatment-dot" />{actions[run.action.id].during}</div>}
        {run.phase === 'settling' && <div className="safe-scene-caption"><ShieldCheck /><div><strong>家，安心了。</strong><span>风雨还在，准备让我们从容。</span></div></div>}
        {run.phase === 'briefing' && <div className="typhoon-start-overlay">
          <div className="typhoon-start-card">
            <span className="typhoon-chapter">家庭安全训练 / 01</span>
            <h2>风来之前，<br />把家照顾好。</h2>
            <p>对照上方剪影，点击场景中的物件。<br />每完成一个动作，就少一处隐患。</p>
            <div className="typhoon-start-facts"><span>5 个隐患</span><span>约 1 分钟</span><span>可随时提示</span></div>
            <button type="button" className="typhoon-primary" disabled={!ready} onClick={() => { enableSound(); dispatch({ type: 'start' }); }}>{ready ? '开始找隐患' : '正在准备素材'}<ArrowRight /></button>
          </div>
        </div>}
      </div>
      <footer className="typhoon-footer">
        <output className={`typhoon-feedback ${run.notice?.kind ?? ''}`} aria-live="polite">{run.notice?.kind === 'success' ? <Check /> : <span className="feedback-pin" />}<span>{run.notice?.text ?? (safe ? '五个安全动作，都已完成。' : '观察场景，寻找与剪影相同的物件。')}</span></output>
        <div className="typhoon-footer-actions">
          <span className="power-state-legend" role="status" title="本关状态提示：绿表示接通，红表示断开"><i style={{ backgroundColor: power.color }} />电源：{power.label}</span>
          <button type="button" onClick={() => dispatch({ type: 'hint' })} disabled={run.phase !== 'playing' || !!run.action}><Lightbulb />提示</button>
          <button type="button" onClick={restart} aria-label="重新开始本关"><RotateCcw /></button>
        </div>
      </footer>
      {run.phase === 'complete' && <div className="typhoon-result-overlay">
        <section className="typhoon-result" role="dialog" aria-modal="true" aria-labelledby="result-title">
          <div className="typhoon-result-flower"><Flower2 /></div>
          <span className="typhoon-chapter">第一关 · 训练完成</span>
          <h2 id="result-title">给安心的小家，<br />一朵小红花。</h2>
          <div className="typhoon-earned" aria-label={`获得 ${run.stars} 朵小红花`}>{[1, 2, 3].map(n => <Flower2 key={n} className={n <= run.stars ? 'earned' : ''} />)}</div>
          <blockquote>{level.summary}</blockquote>
          <div className="typhoon-result-stats"><span><b>5 / 5</b>安全动作</span><span><b>{Math.max(1, Math.ceil(run.elapsed / 1000))} 秒</b>本次用时</span></div>
          <button type="button" autoFocus className="typhoon-primary" onClick={onNext}>返回关卡地图<ArrowRight /></button>
          <button type="button" className="typhoon-replay" onClick={restart}><RotateCcw />再练习一次</button>
          <p className="typhoon-safety-note">{level.safetyNote}</p>
        </section>
      </div>}
    </section>
  );
}
