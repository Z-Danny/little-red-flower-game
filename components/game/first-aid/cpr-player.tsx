'use client';
import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { canFinishCpr, cprStep, cprRules, createCpr, reduceCpr } from '@/app/game/first-aid/cpr-model';
import { cprPresentation as copy, cprSkin as skin } from '@/app/game/first-aid/cpr-content';
import { useGameViewport } from '@/app/game/display/use-game-viewport';
import { createCoverCamera } from '@/app/game/display/camera';
import { responseTrainingArt as art, type ResponseTrainingIcon } from '@/app/game/response/training-art';
import { PaintedIcon } from '../painted-ui';
import { Volume2, VolumeX } from 'lucide-react';
import { useInterfaceSound } from '../use-interface-sound';
import { useCprAudio } from './use-cpr-audio';
import type { CompletionTiming } from '@/app/game/journey/time-reward';
import type { CprEvent } from '@/app/game/first-aid/cpr-model';

const framing = { sceneBounds: skin.sceneBounds, criticalRegions: skin.criticalRegions };
const stages: { name: string; icon: ResponseTrainingIcon }[] = [
  { name: '分工呼救', icon: 'phone' }, { name: '施救定位', icon: 'kneel' },
  { name: '放置双手', icon: 'hands' }, { name: '调整姿势', icon: 'posture' },
  { name: '输入节奏', icon: 'rhythm' }, { name: '交接救助', icon: 'relay' },
];
function Art({ name, className = '' }: { name: ResponseTrainingIcon; className?: string }) {
  return <img className={`response-training-art ${className}`} src={art[name]} alt="" aria-hidden="true" draggable={false} />;
}
export function CprPlayer({ onBack, onFinish }: { onBack: () => void; onFinish: (id: string, stars: number, timing: CompletionTiming) => void }) {
  const [s, send] = useReducer(reduceCpr, undefined, createCpr);
  const [paused, setPaused] = useState(false), [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0), [help, setHelp] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const finished = useRef(false);
  const { style, frame } = useGameViewport({ width: 720, height: 1280 });
  const camera = createCoverCamera(framing, frame.width, frame.height);
  const pos = (p: { x: number; y: number }): CSSProperties => ({ left: camera.x + p.x * camera.scale, top: camera.y + p.y * camera.scale });
  const active = !paused && !help && ready && !failed;
  const audio = useCprAudio(s, active);
  const interfaceSound = useInterfaceSound(audio.muted);
  const act = (event: CprEvent) => { if (!active) return; audio.unlock(); audio.input(event); send(event); };
  useEffect(() => {
    let cancelled = false;
    setReady(false); setFailed(false);
    Promise.all([skin.scene, skin.actor, skin.aed, '/levels/first-aid-cpr/helper.png', ...Object.values(art)].map(src => new Promise<void>((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(); img.onerror = reject; img.src = src;
    }))).then(() => { if (!cancelled) setReady(true); }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { setPaused(true); send({ type: 'suspend' }); } };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  useEffect(() => {
    if (!active) return;
    let id = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      if (dt >= 25) { send({ type: 'tick', dt: Math.min(100, dt) }); last = now; }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active]);
  useEffect(() => {
    if (s.phase === 'complete' && !finished.current) { finished.current = true; onFinish(cprRules.id, 3, { elapsedMs: s.elapsed }); }
  }, [s.phase, onFinish]);
  // Paper modal traps keyboard focus; returning restores the original illustrated control.
  useEffect(() => {
    if (!paused && !help) return;
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); audio.resume(); setHelp(false); setPaused(false); send({ type: 'suspend' }); }
      if (e.key !== 'Tab') return;
      const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const first = buttons[0], last = buttons.at(-1);
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); before?.focus(); };
  }, [paused, help]);
  const pause = () => { send({ type: 'suspend' }); setPaused(true); };
  const openHelp = () => { send({ type: 'suspend' }); setHelp(true); };
  const step = cprStep(s);
  const reviewCopy = s.review ? copy.reasons[s.review.action] : null;
  const phaseIndex = s.phase === 'scene' ? 0 : s.phase === 'position' ? 1 : s.phase === 'hands' ? 2 : s.phase === 'posture' ? 3 : s.handedOver ? 5 : 4;
  const actorVisible = !['scene', 'position'].includes(s.phase);
  const beatPeriod = 60000 / cprRules.guideRate;
  const beat = (s.elapsed % beatPeriod) / beatPeriod;
  const actorPhase = s.handedOver || s.samples >= cprRules.sampleIntervals ? beat : s.pulseAt !== null ? Math.min(1, (s.elapsed - s.pulseAt) / 350) : 1;
  const squash = active ? 1 - Math.sin(actorPhase * Math.PI) * .025 : 1;
  const description = s.phase === 'scene' ? copy.opening : s.phase === 'position' ? copy.position : s.phase === 'hands' ? copy.hands : s.phase === 'posture' ? copy.posture : s.phase === 'complete' ? copy.ending : s.handedOver ? '协助者继续模拟按压。你可完成剩余输入练习；这不是对真人的能力测量。' : copy.rhythm;
  const wrong = /脚边离|不是腹部|不要弯肘/.test(s.feedback);
  const feedbackArt: ResponseTrainingIcon = wrong ? 'retry' : /偏快|太急/.test(s.feedback) ? 'fast' : /偏慢/.test(s.feedback) ? 'slow' : /接近提示|采样完成/.test(s.feedback) ? 'check' : stages[phaseIndex].icon;
  const tone = wrong ? 'retry' : feedbackArt === 'fast' ? 'fast' : feedbackArt === 'slow' ? 'slow' : feedbackArt === 'check' ? 'steady' : 'guide';
  return <section {...interfaceSound} onPointerDownCapture={audio.unlock} onKeyDownCapture={audio.unlock} data-audio-state={audio.status.state} data-audio-played={audio.status.played} data-audio-cue={audio.status.lastCue} data-audio-voices={audio.status.voices} data-audio-rms={audio.status.rms} className="response-training" style={style} data-cpr-player data-ui="painted" data-phase={s.phase} data-step={step} data-review={s.review?.action ?? 'none'} data-review-ms={s.review?.remainingMs ?? 0} data-samples={s.samples} data-handover={s.handedOver} data-aed-ready={s.aedReady} data-paused={paused || help} data-clipped={camera.clippedCritical}>
    <div className="response-training-world" aria-hidden="true" style={{ width: skin.width, height: skin.height, transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})` }}>
      <img className="response-training-backdrop" src={skin.scene} alt="" />
      {s.aedReady && <img src={skin.aed} alt="" style={{ position: 'absolute', left: 661, top: 735, width: 128, height: 103 }} />}
      {actorVisible && <img data-training-actor className="response-training-actor" src={s.handedOver ? '/levels/first-aid-cpr/helper.png' : skin.actor} alt="" style={{ left: skin.actorBox.x, top: skin.actorBox.y, width: skin.actorBox.w, height: skin.actorBox.h, transform: `scaleY(${squash})`, transformOrigin: '35% 90%' }} />}
    </div>
    <div className="response-training-interface" inert={paused || help || !ready || failed}>
      <header className="response-training-header painted-game-hud">
        <button type="button" className="painted-hud-button" aria-label="返回地图" onClick={onBack}><PaintedIcon name="back" /></button>
        <div><small>急救岛 · 情境处置</small><h1>心肺复苏实战</h1></div>
        <button type="button" className="painted-hud-button" data-ui-sound="hint" aria-label="帮助" aria-expanded={help} onClick={openHelp}><PaintedIcon name="hint" /></button>
        <button type="button" className="painted-hud-button" aria-label="暂停" onClick={pause}><PaintedIcon name="pause" /></button>
      </header>
      <button className="response-training-hotspot" data-cpr-call style={pos(skin.caller)} disabled={!!s.review || step !== 'call'} data-current={!s.review && step === 'call'} data-ui-sound="off" onClick={() => act({ type: 'call' })} aria-label={s.called ? '女士已接到呼救任务' : '点击女士，分配呼救任务'}><Art name="phone" />{s.called && <Art name="check" className="response-training-stamp" />}</button>
      <button className="response-training-hotspot" data-cpr-aed style={pos(skin.runner)} disabled={!!s.review || step !== 'aed'} data-current={!s.review && step === 'aed'} data-ui-sound="off" onClick={() => act({ type: 'aed' })} aria-label={s.aedReady ? 'AED已送到' : s.requestedAt !== null ? '正在协作取AED' : '点击男士，分配取AED任务'}><Art name="aed" />{s.requestedAt !== null && <Art name={s.aedReady ? 'check' : 'relay'} className="response-training-stamp" />}</button>
      {s.phase === 'position' && !s.review && <>
        <button className="response-training-target" data-cpr-position style={pos(skin.position)} aria-label="胸部一侧" data-ui-sound="off" onClick={() => act({ type: 'position', correct: true })}><Art name="kneel" /></button>
        <button className="response-training-target" style={pos(skin.wrongPosition)} aria-label="脚边" data-ui-sound="off" onClick={() => act({ type: 'position', correct: false })}><Art name="kneel" /></button>
      </>}
      
      <footer className="response-training-panel" data-feedback={tone}>
        <div className="response-training-feedback" role="status" aria-live="polite"><span className="garden-sr-only">{description} {s.feedback}</span></div>
        {reviewCopy && s.review ? <section className="response-training-review" data-cpr-review aria-labelledby="cpr-review-title">
          <div className="response-training-note" role="status" aria-live="polite"><h2 id="cpr-review-title">✓ {reviewCopy.title}<span className="garden-sr-only">，为什么这样做</span></h2><p aria-label="为什么这样做">{reviewCopy.reason}</p></div>
          <div className="response-training-review-actions"><button className="response-training-primary" data-cpr-continue disabled={s.review.remainingMs > 0} onClick={() => act({ type: 'continue' })} aria-label="理解原因，继续下一步"><span>{s.review.remainingMs > 0 ? '请先阅读 · ' + Math.ceil(s.review.remainingMs / 1000) + ' 秒' : '理解了，继续'}</span></button><small className="response-training-disclaimer">{copy.learningNotice}</small></div>
        </section> : <>
        {s.phase !== 'rhythm' && s.phase !== 'complete' && <p className="response-training-prompt response-training-note">{step === 'call' ? '第1步 · 请女士拨打120' : step === 'aed' ? '第2步 · 请男士取来AED' : step === 'start' ? '第3步 · 开始施救准备' : step === 'position' ? '第4步 · 选择胸部一侧' : step === 'hands' ? '第5步 · 选择正确的双手位置' : '第6步 · 选择正确的施救姿势'}</p>}
        <div className="response-training-action-row">
          {(step === 'call' || step === 'aed') && <div className="response-training-gesture" aria-hidden="true"><Art name={step === 'call' ? 'phone' : 'aed'} /><span className="response-training-note">点击场景中亮起的标记</span></div>}
          {s.handedOver && s.samples < cprRules.sampleIntervals && <span className="response-training-label" role="img" aria-label="接替者持续模拟帮助"><Art name="relay" /><Art name="check" /></span>}
          {step === 'start' && <button className="response-training-primary" data-cpr-start aria-label="立即开始帮助" data-ui-sound="off" onClick={() => act({ type: 'start' })}><span>开始帮助</span><Art name="next" /></button>}
          {s.phase === 'position' && <div className="response-training-gesture" role="img" aria-label="点选患者胸部一侧的跪姿标记"><Art name={wrong ? 'retry' : 'kneel'} /><Art name="next" /><Art name="kneel" /></div>}
          {s.phase === 'hands' && <div className="response-training-choices" aria-label="选择手位示意">
            <button className="response-training-picture" data-cpr-hands aria-label="双手重叠 → 胸部中央" data-ui-sound="off" onClick={() => act({ type: 'hands', correct: true })}><Art name="chest" /></button>
            <button className="response-training-picture" aria-label="放在腹部" data-ui-sound="off" onClick={() => act({ type: 'hands', correct: false })}><Art name="abdomen" /></button>
          </div>}
          {s.phase === 'posture' && <div className="response-training-choices" aria-label="选择施救姿势">
            <button className="response-training-picture" data-cpr-posture aria-label="双臂伸直 · 肩在手正上方" data-ui-sound="off" onClick={() => act({ type: 'posture', correct: true })}><Art name="straight" /></button>
            <button className="response-training-picture" aria-label="弯肘 · 斜着用力" data-ui-sound="off" onClick={() => act({ type: 'posture', correct: false })}><Art name="bent" /></button>
          </div>}
          {s.phase === 'rhythm' && <>
            {s.samples < cprRules.sampleIntervals && <button className="response-training-tap" data-cpr-tap aria-label="跟着节奏点按，仅记录屏幕输入" onKeyDown={e => { if (e.repeat) e.preventDefault(); }} data-ui-sound="off" onClick={() => act({ type: 'tap' })}><Art name="hands" /><span className="response-training-tap-ring" style={{ transform: `scale(${.8 + beat * .2})`, opacity: .65 - beat * .4 }} aria-hidden="true" /></button>}
            {step === 'handover' && s.aedReady && <button className="response-training-handoff" data-cpr-handover aria-label="AED到达，现在交接并配合" data-ui-sound="off" onClick={() => act({ type: 'handover' })}><Art name="aed" /><Art name="relay" /></button>}
            {canFinishCpr(s) && <button className="response-training-primary" data-cpr-finish aria-label="完成练习，协助者继续救助" data-ui-sound="off" onClick={() => act({ type: 'finish' })}><span>完成练习</span><Art name="next" /></button>}
            {s.samples >= cprRules.sampleIntervals && !canFinishCpr(s) && !(s.aedReady && !s.handedOver) && <div className="response-training-gesture" role="img" aria-label={!s.called ? '请指派旁人呼救' : '协助者正在取AED，帮助继续'}><Art name={!s.called ? 'phone' : 'aed'} /><Art name="relay" /></div>}
          </>}
          {s.phase === 'complete' && <div className="response-training-gesture" role="img" aria-label={copy.ending}><Art name="relay" /><Art name="check" /></div>}
        </div>
        {s.phase === 'rhythm' && s.samples < cprRules.sampleIntervals && <div className="response-training-tempo">
          <button className="response-training-feedback-icon" onClick={openHelp} aria-label={`${s.feedback}，打开图示说明`}><Art name={feedbackArt} /></button>
          <div className="response-training-beat-guide"><span>100—120 <small>次/分</small></span><div className="response-training-track" aria-hidden="true"><img src="/ui/painted-v1/timer-empty.webp" alt="" /><img className="response-training-beat" src="/ui/painted-v1/petal.webp" alt="" style={{ left: `${8 + (1 - Math.abs(beat * 2 - 1)) * 84}%` }} /></div></div>
          <div className="response-training-samples" role="img" aria-label={`已记录 ${s.samples} 段输入，共 ${cprRules.sampleIntervals} 段`}>{Array.from({ length: cprRules.sampleIntervals }, (_, i) => <i key={i} data-filled={i < s.samples} />)}</div>
        </div>}
        {wrong && <button className="response-training-correction" onClick={openHelp} aria-label={`${s.feedback}，打开纠正提示`}><Art name="retry" /><PaintedIcon name="hint" /></button>}
        </>}
        {!s.review && <small className="response-training-disclaimer">教学按序进行 · 不评定真实CPR能力</small>}
      </footer>
    </div>
    {(!ready || failed) && <div className="response-training-overlay" role="status"><h2>{failed ? '场景暂时未加载成功' : '正在准备练习场景'}</h2>{failed && <button onClick={() => setAttempt(n => n + 1)}>重新加载</button>}<button onClick={onBack}>返回地图</button></div>}
    {(paused || help) && <div className="response-training-modal-shade"><div ref={dialog} tabIndex={-1} className="response-training-overlay" role="dialog" aria-modal="true" aria-label={help ? '图示与急救提示' : '练习已暂停'}>
      <header><h2>{help ? '图示与急救提示' : '练习已暂停'}</h2><button className="painted-hud-button" aria-label={help ? '关闭帮助' : '关闭暂停'} onClick={() => { audio.resume(); setHelp(false); setPaused(false); send({ type: 'suspend' }); }}><PaintedIcon name="back" /></button></header>
      <div className="response-training-modal-content">
        {help ? <><p>{description}</p><p>{s.feedback}</p><ul className="response-training-legend"><li><Art name="phone" /><span>请旁人拨打120</span></li><li><Art name="aed" /><span>请旁人取AED</span></li><li><Art name="slow" /><span>输入偏慢，跟随节拍</span></li><li><Art name="fast" /><span>输入偏快，稍微放慢</span></li><li><Art name="relay" /><span>交接，救助继续</span></li><li><Art name="retry" /><span>调整后可以重试</span></li></ul><p>中国大陆情境拨打120，其他地区使用当地急救号码。呼救、取AED与开始帮助可以并行，不等道具或连击。真实急救听从调度员和AED提示。</p><p>{copy.learningNotice}本关按教学顺序开放操作，真实救助无需等待阅读、凑满次数或游戏步骤。</p><p>{cprRules.safety}</p></> : <p>仅暂停游戏。真实急救不能为了操作界面而中断。</p>}
      </div>
      <button className="response-training-primary" aria-label={help ? '知道了，返回练习' : '继续练习'} onClick={() => { audio.resume(); setHelp(false); setPaused(false); send({ type: 'suspend' }); }}><Art name="next" /></button>
      {paused && <button className="response-training-map-return" aria-label={audio.muted ? "开启声音" : "关闭声音"} aria-pressed={audio.muted} onClick={audio.toggle}>{audio.muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}<span>{audio.muted ? "开启声音" : "关闭声音"}</span></button>}
      {paused && <button className="response-training-map-return" aria-label="返回地图" onClick={onBack}><PaintedIcon name="back" /><span>返回地图</span></button>}
    </div></div>}
  </section>;
}
