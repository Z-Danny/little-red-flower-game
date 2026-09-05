'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, CircleHelp, Lightbulb, MapPin, RotateCcw, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { GameIcon } from '@/app/game/icon-map';
import type { LevelConfig } from '@/app/game/types';
import { FindScene, ResponseScene } from './level-scenes';
import { ObjectiveStrip, TreatmentEffects } from './find-hazard-feedback';
import { useLevelEngine } from './use-level-engine';

type Props = { level: LevelConfig; totalFlowers: number; onBack: () => void; onFinish: (levelId: string, stars: number) => void; onNext: () => void };

export function LevelPlayer({ level, totalFlowers, onBack, onFinish, onNext }: Props) {
  const [soundOn, setSoundOn] = useState(true);
  const handleComplete = useCallback((stars: number) => onFinish(level.id, stars), [level.id, onFinish]);
  const engine = useLevelEngine(level, handleComplete);
  const goalCount = engine.completedGoals.length;
  const stars = engine.dangerMistakes === 0 && engine.risk < 72 ? 3 : engine.dangerMistakes <= 2 ? 2 : 1;
  const riskLabel = engine.risk < 42 ? '稳定' : engine.risk < 76 ? '升高' : '危险';
  const sceneSafe = goalCount === level.goals.length;
  const riskStage = engine.risk >= 82 ? 'risk-critical' : engine.risk >= 62 ? 'risk-high' : engine.risk >= 36 ? 'risk-caution' : '';

  useEffect(() => {
    if (!engine.feedback || !soundOn) return;
    navigator.vibrate?.(engine.feedback.type === 'danger' ? [60, 40, 90] : 28);
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = engine.feedback.type === 'danger' ? 145 : engine.feedback.type === 'success' ? 680 : 330;
      gain.gain.setValueAtTime(0.035, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.18);
    } catch { /* Audio is progressive enhancement. */ }
  }, [engine.feedback, soundOn]);

  const miss = () => {
    engine.reportMiss();
    const scene = document.querySelector('.scene-stage');
    scene?.classList.remove('miss-shake');
    window.requestAnimationFrame(() => scene?.classList.add('miss-shake'));
  };

  return (
    <section className="phone-stage play-stage" style={{ '--level-accent': level.accent } as React.CSSProperties}>
      <header className="play-header">
        <button className="icon-button" onClick={onBack} aria-label="返回关卡列表"><ArrowLeft /></button>
        <div><span className="eyebrow">第 {level.order} 关 · {level.kind === 'prevention' ? '找隐患' : '拖拽处置'}</span><h1>{level.title}</h1></div>
        <button className="sound-button" onClick={() => setSoundOn((value) => !value)} aria-label={soundOn ? '关闭声音' : '打开声音'}>{soundOn ? <Volume2 /> : <VolumeX />}</button>
        <span className="flower-count">✦ {totalFlowers}</span>
      </header>

      <div className="risk-row"><span>环境风险</span><div className="risk-track"><i style={{ width: `${engine.risk}%` }} /></div><b data-level={riskLabel}>{riskLabel}</b></div>
      <section className="mission-card">
        <span className="mission-icon"><GameIcon name={level.kind === 'prevention' ? 'flashlight' : 'hand'} /></span>
        <div><p>本关任务</p><strong>{level.task}</strong></div>
        <span className="mission-count">{goalCount}/{level.goals.length}</span>
      </section>

      <div className={`scene-stage typhoon-scene room-${level.sceneRoom} mood-${level.sceneMood} ${riskStage} ${sceneSafe ? 'scene-safe' : ''} ${engine.consequenceActive ? 'storm-consequence' : ''} ${engine.feedback?.type === 'danger' ? 'danger-pulse' : ''}`}>
        <div className="scene-photo" style={{ backgroundImage: `url(${level.previewImage})` }} />
        <div className="scene-photo scene-photo-safe" style={{ backgroundImage: `url(${level.safeImage})` }} />
        {level.kind === 'prevention' && <TreatmentEffects level={level} resolved={engine.resolved} processingId={engine.processingId} risk={engine.risk} />}
        <div className="scene-vignette" />
        {level.sceneMood === 'storm' && !sceneSafe && <div className="weather-fx" />}
        {level.sceneMood === 'fire' && <div className="fire-fx"><i /><i /><i /></div>}
        {level.sceneMood === 'smoke' && <div className="smoke-fx"><i /><i /><i /></div>}

        {level.kind === 'prevention' && (
          <ObjectiveStrip level={level} resolved={engine.resolved} processingId={engine.processingId} onHint={engine.requestHint} />
        )}

        <div className="scene-task-chip">{sceneSafe ? <><Check />全部隐患已排除</> : <><span>{level.goals.length - goalCount}</span> 处隐患待处理</>}</div>

        {level.kind === 'prevention' ? (
          <FindScene level={level} resolved={engine.resolved} hintId={engine.hintId} processingId={engine.processingId} onResolve={engine.resolveObjective} onMiss={miss} />
        ) : (
          <ResponseScene level={level} resolved={engine.resolved} hintId={engine.hintId} selectedItem={engine.selectedItem} setSelectedItem={engine.setSelectedItem} onDrop={engine.applyDrop} />
        )}
      </div>

      {engine.feedback ? (
        <output key={engine.feedback.nonce} className={`feedback-toast ${engine.feedback.type}`} aria-live="polite"><span>{engine.feedback.type === 'success' ? <Check /> : engine.feedback.type === 'danger' ? '!' : <CircleHelp />}</span><p>{engine.feedback.text}</p></output>
      ) : <p className="gesture-hint"><Sparkles /> {level.kind === 'prevention' ? '点击场景中的可疑位置' : '拖动物品到场景目标；也可先点物品再点目标'}</p>}

      <button className="hint-button" onClick={() => engine.requestHint()}><Lightbulb />需要提示</button>

      {engine.phase === 'briefing' && (
        <div className="modal-backdrop">
          <section className="briefing-modal game-briefing-modal">
            <span className="modal-index">MISSION {String(level.order).padStart(2, '0')}</span>
            <div className="briefing-preview" style={{ backgroundImage: `url(${level.previewImage})` }}><span><GameIcon name="flashlight" />找隐患</span></div>
            <p className="modal-location"><MapPin />{level.location}</p>
            <h2>{level.title}</h2>
            <p>{level.briefing}</p>
            <div className="briefing-meta"><span>{level.duration}</span><span>{level.goals.length} 个关键动作</span></div>
          <button className="primary-game-button" onClick={() => engine.setPhase('playing')}>进入场景 <span>→</span></button>
          </section>
        </div>
      )}

      {engine.phase === 'complete' && (
        <div className="modal-backdrop complete-backdrop">
          <section className="result-modal">
            <span className="result-rays" />
            <div className="big-flower">✦</div>
            <span className="modal-index">训练完成</span>
            <h2>危险解除</h2>
            <div className="earned-stars">{[1, 2, 3].map((value) => <span key={value} className={value <= stars ? 'earned' : ''}>✦</span>)}</div>
            <blockquote>{level.knowledge}</blockquote>
            <div className="result-stats"><span><small>完成用时</small><strong>{Math.max(1, Math.round(engine.elapsed))} 秒</strong></span><span><small>危险尝试</small><strong>{engine.dangerMistakes} 次</strong></span></div>
          <button className="primary-game-button" onClick={onNext}>返回关卡地图 <span>→</span></button>
            <button className="text-button" onClick={engine.reset}><RotateCcw />重新练习</button>
          </section>
        </div>
      )}
    </section>
  );
}
