'use client';

import { ChevronRight, Clock3, HeartHandshake, LockKeyhole, Map, RotateCcw, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { levels } from '@/app/game/levels';
import { SceneCanvas } from './typhoon/scene-canvas';
import { KitchenCanvas } from './kitchen/scene-canvas';
import { useState } from 'react';

type Props = { completed: Record<string, number>; onStart: (id: string) => void; onReset: () => void };

export function LevelHub({ completed, onStart, onReset }: Props) {
  const playable = levels.filter(level => level.playable).sort((a, b) => a.order - b.order);
  const [previewId, setPreviewId] = useState('oil-fire');
  const current = playable.find(level => level.id === previewId) ?? playable[0];
  const stars = playable.reduce((sum, level) => sum + (completed[level.id] ?? 0), 0);
  const futureLevels = levels.filter((level) => !level.playable);
  const kitchen = current.id === 'oil-fire';

  return (
    <section className="phone-stage hub-stage game-hub">
      <header className="brand-header game-brand-header">
        <div className="brand-mark"><HeartHandshake /></div>
        <div><span className="eyebrow">公益应急训练</span><h1>小红花应急行动</h1></div>
        <button className="hub-icon-button" onClick={onReset} aria-label="重置训练记录"><RotateCcw /></button>
      </header>

      <div className="hub-progress-row">
        <div><span>训练册 · 第一章</span><strong>家庭安全</strong></div>
        <div className="flower-wallet"><span>✦</span><b>{stars}</b><small>/ {playable.length * 3}</small></div>
      </div>

      <div className="mission-picker" aria-label="选择关卡预览">{playable.map(level => <button type="button" key={level.id} className={current.id === level.id ? 'selected' : ''} aria-pressed={current.id === level.id} onClick={() => setPreviewId(level.id)}>{String(level.order).padStart(2, '0')} · {level.title}</button>)}</div>
      <section className="current-mission" style={{ '--mission-image': `url(${current.previewImage})` } as React.CSSProperties}>
        <div className="mission-image hub-live-preview" aria-hidden="true">{kitchen ? <KitchenCanvas preview /> : <SceneCanvas preview />}</div>
        <div className="mission-image-shade" />
        <div className="current-mission-top">
          <span className="live-pill"><i />当前关卡</span>
          <span className="mission-type"><Target />{kitchen ? '拖拽处置' : '找隐患'}</span>
        </div>
        <div className="current-mission-copy">
          <span className="mission-kicker">MISSION {String(current.order).padStart(2, '0')} · {current.location}</span>
          <h2>{current.title}</h2>
          <p>{kitchen ? '关火、盖锅盖，带她安全撤离。每个选择，都能看到变化。' : '台风来临前，找出并处理屋内的 5 处安全隐患。'}</p>
          <div className="mission-facts"><span><Clock3 />约 1 分钟</span><span><ShieldCheck />{current.goals.length} 个目标</span><span><Sparkles />最多 3 朵花</span></div>
          <button className="start-level-button" onClick={() => onStart(current.id)}>开始关卡 <ChevronRight /></button>
        </div>
      </section>

      <section className="level-map-section">
        <div className="map-title"><div><span><Map />关卡地图</span><h3>家庭应急训练</h3></div><small>{playable.length} / {levels.length} 已开放</small></div>
        {playable.map(level => <button key={level.id} className={`map-level active ${level.kind === 'response' ? 'kitchen-map' : ''}`} onClick={() => onStart(level.id)}>
          <span className="map-node"><b>{String(level.order).padStart(2, '0')}</b><i>{completed[level.id] ? '✦'.repeat(completed[level.id]) : 'GO'}</i></span>
          <span
            className="map-thumb"
            aria-hidden="true"
            style={{ '--map-thumb-image': `url(${level.previewImage})` } as React.CSSProperties}
          />
          <span className="map-copy"><small>{level.kind === 'response' ? '拖拽处置 · 火情应对' : '找隐患 · 入门训练'}</small><strong>{level.title}</strong><em>{completed[level.id] ? '再次训练' : '等待开始'}</em></span>
          <ChevronRight />
        </button>)}
        <div className="future-level-grid">
          {futureLevels.map((level) => (
            <div key={level.id} className="future-level" style={{ '--future-accent': level.accent } as React.CSSProperties}>
              <span className="future-number">{String(level.order).padStart(2, '0')}</span>
              <LockKeyhole />
              <strong>{level.title}</strong>
              <small>后续开放</small>
            </div>
          ))}
        </div>
      </section>

      <footer className="safety-note">本游戏用于公益科普训练，不能替代专业救援。现实中请先确保自身安全。</footer>
    </section>
  );
}
