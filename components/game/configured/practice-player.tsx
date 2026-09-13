'use client';
import { levelTitle } from '@/app/game/journey/presentation';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { completedForReward, createRun, emotion, enabled, failureRevealing, findRule, reduceRun } from '@/app/game/runtime/engine';
import { cameraFor, pickObject, pickZone, scenePoses, toWorld } from '@/app/game/runtime/scene';
import type { Input, LevelPackage, Run } from '@/app/game/runtime/schema';
import { alphaAt, loadArt, type Art } from './art';
import { render, type Drag } from './practice-renderer';
import { configuredAudioFrame } from '@/app/game/runtime/response';
import { useResponseAudio } from '../response/use-response-audio';
import { usePracticeAudio } from './use-practice-audio';
import { relevantZones, pickRelevantZone, resolveDragPlacement } from '@/app/game/runtime/drop-zones';
import { useGameViewport } from '@/app/game/display/use-game-viewport';
import { useCameraObstacles } from '@/app/game/display/use-camera-obstacles';
import { roomSmokeFrame, trainingRemaining } from '@/app/game/runtime/room-smoke';

type Props = { pack: LevelPackage; onBack: () => void; onFinish: (id: string, stars: number) => void; journey?: boolean };
export function PracticePlayer({ pack, onBack, onFinish, journey=false }: Props) {
  const viewport = useGameViewport(pack.skin.world);
  const surface = useRef<HTMLElement>(null);
  const cameraObstacles = useCameraObstacles(surface, '.configured-hud > *', viewport.viewportKey);
  const practice = !!pack.skin.presentation;
  const [run, setRun] = useState(() => createRun(pack)), [paused, setPaused] = useState(false), [ready, setReady] = useState(false);
  const [runOwner,setRunOwner]=useState(pack.rules.id);
  const [entered, setEntered] = useState(!practice);
  const [error, setError] = useState(''), [retry, setRetry] = useState(0), [selected, setSelected] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null), art = useRef<Art | null>(null), drag = useRef<Drag | null>(null), dialog = useRef<HTMLDivElement>(null);
  const reported = useRef(false), reduced = useRef(false), previousMusic = useRef(.12), latest = useRef({ run, paused, selected, ready, entered });
  latest.current = { run, paused, selected, ready, entered };
  const revealingFailure = failureRevealing(run);
  const entry = practice && !entered, modal = paused || run.phase === 'complete' || (run.phase === 'failed' && !revealingFailure) || entry;
  const audio = useResponseAudio(configuredAudioFrame(pack, run, !practice && ready && !paused), pack.skin.response?.cues);
  const practiceAudio = usePracticeAudio(pack, run, practice && ready && entered && !paused);
  const clearSelection = () => { drag.current = null; setSelected(null); };
  useEffect(() => { drag.current = null; setSelected(null); }, [viewport.viewportKey]);
  const interact = (input: Input) => {
    const state=latest.current;
    if (!state.ready || state.paused || !state.entered || state.run.action || state.run.phase !== 'playing') return;
    setRun(r => reduceRun(pack, r, { type: 'interact', input })); setSelected(null);
  };
  useEffect(() => {
    drag.current=null;reported.current=false;setSelected(null);setPaused(false);setEntered(!pack.skin.presentation);setRunOwner(pack.rules.id);setRun(createRun(pack));
  },[pack]);
  useEffect(() => {
    let alive = true; setReady(false); art.current = null;
    loadArt(pack.skin).then(result => { if (alive) { art.current = result; setReady(true); } }).catch(e => { if (alive) setError(String(e.message ?? e)); });
    return () => { alive = false; };
  }, [pack, retry]);
  useEffect(() => {
    let frame = 0, last = performance.now(); reduced.current = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loop = (now: number) => {
      const ms = Math.min(100, now - last); last = now;
      if (latest.current.ready && latest.current.entered && !latest.current.paused && !document.hidden) setRun(r => reduceRun(pack, r, { type: 'tick', ms }));
      const node = canvas.current, ctx = node?.getContext('2d');
      if (node && ctx && art.current && node.clientWidth && node.clientHeight) {
        // DOMRect retains fractional CSS pixels, exactly as pointer coordinates do.
        const rect = node.getBoundingClientRect();
        const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
        if (node.width !== w || node.height !== h) { node.width = w; node.height = h; }
        const camera = cameraFor(pack, rect.width, rect.height, cameraObstacles.current);
        node.dataset.cameraX = String(camera.x); node.dataset.cameraY = String(camera.y);
        node.dataset.cameraScale = String(camera.scale); node.dataset.criticalClipped = String('clippedCritical' in camera ? camera.clippedCritical : false);
        const carried=drag.current?.moved?scenePoses(pack,latest.current.run,reduced.current).find(p=>p.id===drag.current!.id):undefined;
        node.dataset.dropZone=drag.current&&carried?resolveDragPlacement(pack,latest.current.run,drag.current.id,drag.current.point,drag.current.offset,carried).target??'':'';
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#302b25'; ctx.fillRect(0, 0, w, h);
        // Compensate integer backing dimensions; the final CSS-pixel camera stays isotropic.
        ctx.setTransform(camera.scale * w / rect.width, 0, 0, camera.scale * h / rect.height, camera.x * w / rect.width, camera.y * h / rect.height);
        render(ctx, pack, art.current, latest.current.run, drag.current, latest.current.selected, reduced.current);
      }
      frame = requestAnimationFrame(loop);
    }; frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [pack]);
  useEffect(() => {
    if (runOwner===pack.rules.id && completedForReward(run) && !reported.current) { reported.current = true; onFinish(pack.rules.id, run.stars); }
  }, [run.phase, run.stars, run.escaped, onFinish, pack.rules.id,runOwner]);
  const stageKey=(run.stages??[]).join('|'), resolvedKey=run.resolved.join('|');
  useEffect(() => { if(practice){drag.current=null;setSelected(null);} },[practice,stageKey,resolvedKey,run.phase]);
  useEffect(() => {
    const hide=()=>{if(document.hidden){drag.current=null;setSelected(null);}};
    document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide);
  },[]);
  useEffect(() => {
    if (!modal) return;
    drag.current = null; setSelected(null);
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && paused) setPaused(false);
      if (e.key !== 'Tab') return;
      const buttons = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []);
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && index <= 0) { e.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!e.shiftKey && (index === buttons.length - 1 || index === -1)) { e.preventDefault(); buttons[0].focus(); }
    }; document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); before?.focus(); };
  }, [modal, paused]);
  const pointAt = (e: ReactPointerEvent<HTMLCanvasElement>) => toWorld(pack, { x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect(), cameraObstacles.current);
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!ready || !entered || paused || run.phase !== 'playing' || run.action || drag.current || !art.current) return;
    const point = pointAt(e);
    // Tap-to-place must win over a tappable actor drawn on the destination.
    const selectedZone=practice&&selected?pickRelevantZone(pack,run,point,selected):undefined;
    if(selected&&selectedZone){interact({source:selected,mode:'drop',target:selectedZone,point});return;}
    const id = pickObject(pack, run, point, (asset, local) => alphaAt(art.current!, asset, local), reduced.current);
    const object = pack.rules.objects.find(o => o.id === id);
    if (object?.input === 'tap') { interact({ source: object.id, mode: 'tap' }); return; }
    const zone = selected ? (practice?pickRelevantZone(pack,run,point,selected):pickZone(pack, point,run)) : undefined;
    if (selected && zone) { interact({ source: selected, mode: 'drop', target: zone, point }); return; }
    if (!id || !object) { setSelected(null); return; }
    const pose = scenePoses(pack, run, reduced.current).find(p => p.id === id)!;
    drag.current = { id, point, offset: { x: point.x - pose.x, y: point.y - pose.y }, start: point, moved: false, pointerId: e.pointerId };
    if(practice)practiceAudio.pickup();
    setSelected(id); e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current; if (!d || d.pointerId !== e.pointerId || !entered || paused || run.action) return;
    d.point = pointAt(e); d.moved ||= Math.hypot(d.point.x - d.start.x, d.point.y - d.start.y) > 8;
  };
  const up = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current; if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!entered || paused || run.action) return;
    if (!d.moved) { if(pack.rules.objects.find(o=>o.id===d.id)?.input==='both' && findRule(pack,run,{source:d.id,mode:'tap'})) interact({source:d.id,mode:'tap'}); return; }
    const point = pointAt(e), pose = scenePoses(pack, run, reduced.current).find(p => p.id === d.id);
    if(!pose)return;
    const placement=resolveDragPlacement(pack,run,d.id,point,d.offset,pose);
    interact({ source: d.id, mode: 'drop', target: practice?placement.target:pickZone(pack, point,run), point: placement.point });
  };
  const replay = () => { if(practice)practiceAudio.reset();else audio.reset(); drag.current = null; reported.current = false; setSelected(null); setPaused(false); setRun(createRun(pack)); };
  const enter = () => { if(!ready)return;setEntered(true);practiceAudio.unlock(); };
  const selectObject = (id:string) => {if(!ready||!entered||paused||run.action||run.phase!=='playing')return;setSelected(id);if(practice)practiceAudio.pickup();};
  const elapsedClock=pack.rules.risk.mode==='elapsed';
  const countdown=pack.skin.presentation?.timer==='countdown',smoke=roomSmokeFrame(pack,run);
  const seconds = countdown ? trainingRemaining(pack,run) : elapsedClock ? Math.floor(run.elapsed/1000) : Math.max(0, Math.ceil((100 - run.risk) * pack.rules.risk.seconds / 100));
  return <section ref={surface} style={viewport.style} data-game-surface data-viewport={viewport.viewportKey} onPointerDownCapture={() => { if (!practice && pack.skin.response) audio.unlock(); }} className="configured-player" data-level={pack.rules.id} data-engine="configured-v1" data-phase={run.phase} data-emotion={emotion(pack, run)} data-action={run.action?.rule ?? ''} data-resolved={run.resolved.join(',')}
    data-failure={run.failure?.rule} data-failure-age={run.failure?.age} data-failure-revealing={String(!!revealingFailure)} data-escaped={String(!!run.escaped)}
    data-remaining={countdown?seconds:undefined} data-smoke-load={smoke?.load.toFixed(5)} data-smoke-door={smoke?.door} data-smoke-gap={smoke?.gap} data-elapsed={Math.round(run.elapsed)} data-entered={practice?String(entered):undefined} data-ready={String(ready)} data-paused={String(paused)} data-stages={practice?stageKey:undefined} data-audio-state={practice?practiceAudio.status.state:undefined} data-audio-loops={practice?practiceAudio.status.loops:undefined} data-audio-rms={practice?practiceAudio.status.rms:undefined} data-audio-cue={practice?practiceAudio.status.lastCue:undefined}>
    <div className="configured-world" inert={modal}>
      <canvas data-game-canvas ref={canvas} aria-label={`${levelTitle(pack.rules.id,pack.rules.title)}互动场景`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={clearSelection} />
      {!ready && <div className="configured-loading" role="status">{error || '正在准备场景…'}{error && <button onClick={() => { setError(''); setRetry(n => n + 1); }}>重试</button>}</div>}
    </div>
    <header className="configured-hud" inert={modal}>
      <button onClick={onBack} aria-label="返回关卡">‹</button><span><small>{practice?`关卡 ${pack.rules.order} · ${run.resolved.length}/${pack.rules.goals.length}`:`LEVEL ${String(pack.rules.order).padStart(2, '0')}`}</small>{practice?pack.rules.title.split('：')[0]:pack.rules.title}</span>
      <time style={countdown&&seconds<=10?{color:'#ffac8e'}:undefined} aria-label={countdown?'训练倒计时（归零仍可继续练习）':elapsedClock?'训练用时（不是救援到达时间）':'风险倒计时'}>{!practice && run.phase !== 'playing' ? (pack.rules.completion.status ?? '安全') : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`}</time>
      <button aria-label="暂停" onClick={() => setPaused(true)}>Ⅱ</button>
    </header>
    {pack.rules.kind === 'prevention' && <div className="configured-targets" inert={modal} aria-label="需要寻找的物件">{pack.rules.goals.filter(g => g.showTarget !== false).map(goal => <div key={goal.id} className={run.resolved.includes(goal.id) ? 'done' : ''} aria-label={`${goal.label}${run.resolved.includes(goal.id) ? '已完成' : '待寻找'}`}><img src={pack.skin.assets[pack.skin.poses[goal.object].asset].src} alt={goal.label} draggable={false} />{run.resolved.includes(goal.id) && <b>✓</b>}</div>)}</div>}
    {run.notice && !modal && <div className="configured-notice" role="status">{run.notice.text}</div>}
    <nav className="configured-keyboard" aria-label="键盘辅助操作" inert={modal}>
      {pack.rules.objects.filter(o => enabled(o, run) && (!practice || scenePoses(pack,run,true).some(p=>p.id===o.id&&(p.opacity??1)>.05))).map(o => <button key={o.id} disabled={!ready || !entered || !!run.action || run.phase !== 'playing'} onClick={() => (o.input === 'tap' || (o.input==='both' && findRule(pack,run,{source:o.id,mode:'tap'}))) ? interact({ source: o.id, mode: 'tap' }) : selectObject(o.id)}>{o.label}</button>)}
      {selected && (practice?relevantZones(pack,run,selected):Object.keys(pack.skin.zones)).map(id => {const box=pack.skin.zones[id];return <button key={id} disabled={!ready || !entered || !!run.action || run.phase !== 'playing'} onClick={() => interact({ source: selected, mode: 'drop', target: id, point: { x: box.x + box.w / 2, y: box.y + box.h / 2 } })}>放到 {pack.skin.zoneLabels?.[id] ?? id}</button>;})}
    </nav>
    {modal && !(journey && completedForReward(run) && !paused) && <div className="configured-shade"><div className="configured-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="configured-dialog-title">
      <h2 id="configured-dialog-title">{entry?'情境训练':paused ? '暂停训练' : run.phase==='failed'?'本次训练中止': run.escaped?'已先行到达高处': (pack.rules.completion.title ?? '这一关，安全了')}</h2>
      {entry?<><p><strong>{pack.rules.title}</strong></p><p>{pack.rules.description}</p><small>电话、消息与定位报告均为离线模拟，不会拨打真实电话或发送位置。训练用时不是救援到达时间。</small><small>{pack.rules.safety}</small>{error?<p role="alert">场景资源加载失败。<button onClick={()=>{setError('');setRetry(n=>n+1);}}>重试加载</button></p>:null}<button disabled={!ready} onClick={enter}>{ready?'进入场景':'正在准备场景…'}</button></>:paused ? <><button onClick={() => {setPaused(false);if(practice)practiceAudio.unlock();}}>继续游戏</button><button disabled={run.phase!=='playing'} onClick={() => { setPaused(false); setRun(r => reduceRun(pack, r, { type: 'hint' })); }}>需要提示</button></> : run.phase==='failed'?<><p>{run.notice?.text??'危险操作导致本次训练失败。'}</p><small>本次不发放小红花，可重新开始练习。</small></>: run.escaped?<><p>{pack.rules.interactions.find(rule=>rule.id===run.escapeRule)?.feedback??'已先行转移至安全高处，继续等待救援指引。'}</p><small>安全优先，不为收集物资停留或折返。本次未完成全部训练项目，不发放小红花；可以重新练习。</small></>: <><div className="configured-flowers" aria-label={`获得 ${run.stars} 朵小红花`}>{'✿'.repeat(run.stars)}</div><p>{pack.rules.completion.summary}</p>{practice&&pack.rules.completion.status&&<small>{pack.rules.completion.status}</small>}</>}
      {practice && paused && <fieldset style={{border:'1px solid #a7b59d',borderRadius:12,margin:'12px 0',padding:12}}><legend>声音</legend>
        <button aria-pressed={practiceAudio.settings.muted} onClick={()=>practiceAudio.setSettings(s=>({...s,muted:!s.muted}))}>{practiceAudio.settings.muted?'取消静音':'全部静音'}</button>
        <button aria-pressed={practiceAudio.settings.music>0} onClick={()=>practiceAudio.setSettings(s=>{if(s.music>0){previousMusic.current=s.music;return {...s,music:0};}return {...s,music:previousMusic.current||.12};})}>{practiceAudio.settings.music>0?'关闭背景音乐':'打开背景音乐'}</button>
        {(['ambient','sfx'] as const).map(bus=><label key={bus} style={{display:'flex',alignItems:'center',gap:10,marginTop:10,fontSize:14}}>{bus==='ambient'?'环境音':'交互音效'}<input style={{flex:1,minWidth:0}} aria-label={bus==='ambient'?'环境音音量':'交互音效音量'} type="range" min="0" max="1" step="0.01" value={practiceAudio.settings[bus]} onChange={e=>{const value=Number(e.currentTarget.value);practiceAudio.setSettings(s=>({...s,[bus]:value}));}}/></label>)}
        <small>仅音乐、环境、交互与非语言动作音，不含文字朗读。</small>
      </fieldset>}
      {!practice && pack.skin.response && <button onClick={() => audio.setSettings(s => ({ ...s, muted: !s.muted }))}>{audio.settings.muted ? '打开声音' : '关闭声音'}</button>}
      {!entry&&<button onClick={replay}>重新开始</button>}<button onClick={onBack}>返回关卡</button>{paused && <small>{pack.rules.safety}</small>}
    </div></div>}
  </section>;
}
