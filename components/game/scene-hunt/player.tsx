'use client';
import { huntMissCaption } from '@/app/game/challenge/rules';
import {levelTitle,journeyTiming} from '@/app/game/journey/presentation';
import { useEffect, useReducer, useRef, useState } from 'react';
import { createHunt, pressure, reduceHunt } from '@/app/game/scene-hunt/model';
import { hitMask, type HuntPack } from '@/app/game/scene-hunt/schema';
import {
  clueLayout,
  sceneCamera,
  phoneFrame,
  pointerToScene,
} from '@/app/game/scene-hunt/viewport';
import { useInterfaceSound } from '../use-interface-sound';
import { HuntSound } from '@/app/game/scene-hunt/sound';
import { loadHuntArt, type HuntArt } from './art';
import {SafeFeedback} from '../journey/safe-feedback';
import { drawHunt } from './renderer';
import { useHintDisclosure } from './use-hint-disclosure';
import { CountdownBar } from './countdown-bar';
import { HintToggle } from './hint-toggle';
import { PaintedIcon, PaintedLevelIntro } from '../painted-ui';
import { PaintedFailure } from '../painted-failure';
import { PauseMenu } from '../pause-menu';
import { LevelLaunchStatus, useLevelAutoStart } from '../level-launch';
import {
  presentationOf,
  timerLabel,
  endingFade,
} from '@/app/game/scene-hunt/presentation';
import {
  MISS_CAPTION,
  performanceTier,
} from '@/app/game/scene-hunt/performance';
type Props = {
  journey?: boolean;
  autoStart?: boolean;
  pack: HuntPack;
  onBack: () => void;
  onFinish: (id: string, stars: number) => void;
};
export function SceneHuntPlayer({ pack, onBack, onFinish, journey=false, autoStart=false }: Props) {
  const view = presentationOf(pack),
    count = pack.rules.targets.length,
    v2 = !!pack.performance;
  const [r, dispatch] = useReducer(
    (r: ReturnType<typeof createHunt>, e: Parameters<typeof reduceHunt>[2]) =>
      reduceHunt(journey?{...pack.rules,revealMs:journeyTiming.safeHold}:pack.rules, r, e),
    undefined,
    createHunt,
  );
  const [paused, setPaused] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [muted, setMuted] = useState(false),
    [hint, setHint] = useState<string | null>(null),
    [caption, setCaption] = useState(''),
    [audioState, setAudioState] = useState('locked');
  const interfaceSound = useInterfaceSound(muted);
  const [hidden, setHidden] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const onDemand = view.clues === 'on-demand';
  const disclosure = useHintDisclosure(onDemand, `${paused}:${hidden}:${r.phase}:${r.found.length}`);
  const [clues, setClues] = useState<ReturnType<typeof clueLayout> | null>(
    null,
  );
  const hud = useRef<HTMLElement>(null);
  const surface = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    art = useRef<HuntArt | null>(null),
    sound = useRef<HuntSound | null>(null),
    latest = useRef({ r, paused, ready, hint }),
    award = useRef(false),
    resetFrameClock = useRef(false),
    dialog = useRef<HTMLDivElement>(null),
    seen = useRef({ found: 0, phase: 'ready', warning: 0, resolved: false }),
    captionRemaining = useRef(0),
    hintRemaining = useRef(0);
  latest.current = { r, paused, ready, hint };
  const p = pressure(pack.rules, r),
    modal = paused || r.phase === 'complete' || r.phase === 'unfinished' || r.phase === 'failed';
  const subtitle = (text: string, duration = 4200) => {
    setCaption(text);
    captionRemaining.current = duration;
  };
  useEffect(() => {
    if (!surface.current) return;
    const element = surface.current,
      viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      const style = getComputedStyle(element);
      const inset = (edge: string) =>
        parseFloat(style.getPropertyValue(`--hunt-viewport-safe-${edge}`)) || 0;
      const fitted = phoneFrame(
        pack.skin,
        viewport?.width ?? window.innerWidth,
        viewport?.height ?? window.innerHeight,
        {
          left: inset('left'),
          right: inset('right'),
          top: inset('top'),
          bottom: inset('bottom'),
        },
      );
      element.style.left = `${(viewport?.offsetLeft ?? 0) + fitted.x}px`;
      element.style.top = `${(viewport?.offsetTop ?? 0) + fitted.y}px`;
      element.style.width = `${fitted.width}px`;
      element.style.height = `${fitted.height}px`;
      element.style.setProperty('--hunt-safe-top', `${inset('top')}px`);
      element.style.setProperty('--hunt-safe-bottom', `${inset('bottom')}px`);
      element.style.setProperty(
        '--hunt-safe-left',
        `${Math.max(0, inset('left') - fitted.x)}px`,
      );
      element.style.setProperty(
        '--hunt-safe-right',
        `${Math.max(0, inset('right') - fitted.x)}px`,
      );
      element.dataset.short = String(fitted.height < 440);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('resize', schedule);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      for (const key of ['left', 'top', 'width', 'height'])
        element.style.removeProperty(key);
      delete element.dataset.short;
    };
  }, [pack.skin]);
  useEffect(() => {
    if (!canvas.current || !hud.current) return;
    const update = () => {
      const c = canvas.current!,
        header = hud.current!;
      const style = getComputedStyle(surface.current!);
      const inset = (edge: string) =>
        parseFloat(style.getPropertyValue(`--hunt-safe-${edge}`)) || 0;
      setClues(
        clueLayout(
          pack.skin,
          c.clientWidth,
          c.clientHeight,
          header.offsetHeight,
          {
            left: inset('left'),
            right: inset('right'),
            top: inset('top'),
            bottom: inset('bottom'),
          },
        ),
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(canvas.current);
    observer.observe(hud.current);
    update();
    return () => observer.disconnect();
  }, [pack]);
  useEffect(() => {
    let alive = true;
    setReady(false);
    setError('');
    art.current = null;
    sound.current = new HuntSound(view.audio, pack.performance, {
      character: view.characterAudio,
      seconds: pack.rules.seconds,
      sparks: pack.skin.effects?.electricSparks,
    });
    loadHuntArt(pack.skin)
      .then((a) => {
        if (alive) {
          art.current = a;
          setReady(true);
        }
      })
      .catch((e) => {
        if (alive) setError(String(e.message));
      });
    const hide = () => {
      resetFrameClock.current = true;
      setHidden(document.hidden);
      sound.current?.setHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      alive = false;
      sound.current?.dispose();
      document.removeEventListener('visibilitychange', hide);
    };
  }, [pack, loadAttempt]);
  useEffect(() => {
    let frame = 0,
      last = performance.now(),
      meter = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loop = (now: number) => {
      const v = latest.current,
        dt = resetFrameClock.current ? 0 : Math.min(100, now - last);
      resetFrameClock.current = false;
      last = now;
      if (v.ready && !v.paused && !document.hidden) {
        dispatch({ type: 'tick', ms: dt });
        if (captionRemaining.current > 0 && v.r.phase !== 'ready') {
          captionRemaining.current = Math.max(0, captionRemaining.current - dt);
          if (!captionRemaining.current) setCaption('');
        }
        if (hintRemaining.current > 0) {
          hintRemaining.current = Math.max(0, hintRemaining.current - dt);
          if (!hintRemaining.current) setHint(null);
        }
      }
      const c = canvas.current,
        ctx = c?.getContext('2d');
      if (c && ctx && art.current) {
        const rect = c.getBoundingClientRect();
        const d = Math.min(2, devicePixelRatio || 1),
          w = Math.round(rect.width * d),
          h = Math.round(rect.height * d);
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#222b2c';
        ctx.fillRect(0, 0, w, h);
        const cam = sceneCamera(pack.skin, rect.width, rect.height);
        ctx.setTransform(
          (cam.scaleX * w) / rect.width,
          0,
          0,
          (cam.scaleY * h) / rect.height,
          (cam.x * w) / rect.width,
          (cam.y * h) / rect.height,
        );
        drawHunt(ctx, pack, art.current, journey&&(v.r.phase==='reveal'||v.r.phase==='complete')?{...v.r,revealAge:v.r.revealAge+2600}:v.r, reduced, v.hint);
        if (now - meter > 500) {
          c.dataset.audioRms = String(sound.current?.level.toFixed(5) ?? 0);
          c.dataset.audioCue = sound.current?.lastCue ?? '';
          c.dataset.characterCue = sound.current?.lastCharacterCue ?? '';
          c.dataset.characterCount = String(sound.current?.characterCueCount ?? 0);
          c.dataset.sparkCount = String(sound.current?.sparkCueCount ?? 0);
          meter = now;
          setAudioState(sound.current?.status ?? 'locked');
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [pack, journey]);
  useEffect(() => {
    sound.current?.setScene(
      !paused && (r.phase === 'playing' || r.phase === 'reveal'),
      p,
      v2
        ? endingFade(r.phase, r.revealAge) > 0
        : r.phase === 'reveal' || r.phase === 'complete',
      r.elapsed,
      r.phase === 'playing',
    );
  }, [paused, r.phase, p, r.elapsed, r.revealAge, v2]);
  useEffect(() => {
    const prev = seen.current;
    if (r.phase === 'failed' && prev.phase !== 'failed') {
      setHint(null); setCaption('');
      captionRemaining.current = 0; hintRemaining.current = 0;
      sound.current?.fail();
    }
    if (r.found.length > prev.found && r.phase !== 'failed') {
      const t = pack.rules.targets.find((t) => t.id === r.found.at(-1))!;
      sound.current?.cue('found');
      if (r.phase === 'playing') {
        subtitle(t.lesson, 6000);
      }
    }
    if (r.phase === 'reveal' && prev.phase !== 'reveal') {
      setHint(null);
      if (!v2) sound.current?.cue('resolve');
      subtitle(view.reveal, pack.rules.revealMs);
    }
    if (
      v2 &&
      r.phase === 'reveal' &&
      endingFade(r.phase, r.revealAge) > 0 &&
      !prev.resolved
    ) {
      prev.resolved = true;
      sound.current?.cue('resolve');
    }
    if (r.phase === 'complete' && prev.phase !== 'complete') {
      sound.current?.finish();
      if (!award.current) {
        award.current = true;
        onFinish(pack.rules.id, r.stars);
      }
    }
    const tier = p >= 1 ? 3 : p >= 0.7 ? 2 : p >= 0.42 ? 1 : 0;
    if (
      !v2 &&
      view.warnings.length &&
      r.phase === 'playing' &&
      tier > prev.warning &&
      !r.marking
    ) {
      prev.warning = tier;
      if (!r.found.length || !caption) {
        subtitle(view.warnings[Math.min(tier - 1, view.warnings.length - 1)]);
      }
    }
    prev.found = r.found.length;
    prev.phase = r.phase;
  }, [r.found, r.phase, r.revealAge, p, r.marking, pack, onFinish, v2]);
  useEffect(() => {
    if (modal && !paused)
      dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [modal, paused]);
  const begin = async () => {
    if (!ready || r.phase !== 'ready') return;
    resetFrameClock.current = true;
    dispatch({ type: 'start' });
    await sound.current?.unlock();
    sound.current?.setScene(!latest.current.paused && latest.current.r.phase === 'playing', pressure(pack.rules, latest.current.r), false, latest.current.r.elapsed);
    subtitle(view.opening, 6200);
  };
  useLevelAutoStart(autoStart, ready, () => { void begin(); }, pack.rules.id);
  const reload = () => { setReady(false); setError(''); setLoadAttempt(n => n + 1); };
  const tap = (id: string | null, x = 0, y = 0) => {
    disclosure.close();
    if (!ready || paused || r.phase !== 'playing') return;
    if(r.marking && (id || pack.rules.timeout !== 'fail' || r.found.length === pack.rules.targets.length-1)) return;
    void sound.current?.unlock();
    if (!id) {
      if (pack.rules.timeout !== 'fail' && v2 && r.elapsed < (r.missCooldownUntil ?? -1)) return;
      sound.current?.cue('wrong');
      if (pack.rules.timeout === 'fail') subtitle(huntMissCaption(), 1800);
      else if (v2) subtitle(pack.performance?.missCaption ?? MISS_CAPTION, 2400);
    } else if (!r.found.includes(id)) {
      sound.current?.cue('tap');
      setHint(null);
    }
    dispatch({ type: 'tap', id, x, y });
  };
  const replay = () => {
    award.current = false;
    seen.current = { found: 0, phase: 'ready', warning: 0, resolved: false };
    setPaused(false);
    setCaption('');
    setHint(null);
    captionRemaining.current = 0;
    hintRemaining.current = 0;
    sound.current?.reset();
    resetFrameClock.current = true;
    dispatch({ type: 'reset' });
    if (autoStart) { dispatch({ type: 'start' }); void sound.current?.unlock(); subtitle(view.opening, 4200); }
  };
  const retry = () => {
    replay();
    if (!autoStart) {
      dispatch({ type: 'start' });
      void sound.current?.unlock();
      subtitle(view.opening, 4200);
    }
  };
  return (
    <section
      {...interfaceSound}
      ref={surface}
      className="hunt-player"
      data-layout="portrait-v1"
      data-level={pack.rules.id}
      data-ready={String(ready)}
      data-auto-start={autoStart || undefined}
      data-phase={r.phase}
      data-found={r.found.join(',')}
      data-pressure={p.toFixed(3)}
      data-paused={paused}
      data-audio={audioState}
      data-environment={view.environment}
      data-elapsed={Math.floor(r.elapsed)}
      data-reveal-age={Math.floor(r.revealAge)}
      data-performance={v2 ? 'v2' : 'legacy'}
      data-clues={view.clues ?? 'always'}
      data-timer={view.timer}
      data-stage={v2 ? performanceTier(r.elapsed, pack.performance?.timing === 'quarters' ? pack.rules.seconds : undefined) : undefined}
      data-animation-paused={paused || hidden}
    >
      <div className="hunt-world" inert={modal || r.phase === 'ready'}>
        <canvas
          ref={canvas}
          aria-label={`${levelTitle(pack.rules.id,pack.rules.title)}：点击场景中的隐患，红圈表示发现`}
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const { x, y } = pointerToScene(
              pack.skin,
              rect,
              e.clientX,
              e.clientY,
            );
            if (x < 0 || y < 0 || x >= pack.skin.width || y >= pack.skin.height)
              return;
            if (e.button === 0 && e.isPrimary && art.current)
              tap(hitMask(pack.skin, art.current.mask, x, y), x, y);
          }}
        />
        {!ready && !autoStart && (
          <div className="hunt-loading" role="status">
            {error || '正在准备场景…'}
          </div>
        )}
      </div>
      <header className="hunt-hud painted-game-hud" inert={(!paused && modal) || r.phase === 'ready'} ref={hud}>
        <button
          className="painted-hud-button pause-menu-navigation"
          onClick={onBack}
          aria-label="返回关卡"
        >
          <PaintedIcon name="back" />
        </button>
        <h1 title={levelTitle(pack.rules.id,pack.rules.title)}>
          <small>找隐患</small>
          {levelTitle(pack.rules.id,pack.rules.title)}
        </h1>
        {view.timer !== 'pressure-bar' && <span
          className={p > 0.7 && view.timer === 'countdown' ? 'urgent' : ''}
          aria-label={view.timer === 'elapsed' ? '已用时间' : '风雨增强倒计时'}
        >
          {view.timer === 'elapsed'
            ? timerLabel(r.elapsed)
            : r.phase === 'reveal' || r.phase === 'complete'
              ? '已识别'
              : r.peak
                ? '风雨增强'
                : `${Math.floor(
                    Math.max(0, pack.rules.seconds - r.elapsed / 1000) / 60,
                  )
                    .toString()
                    .padStart(2, '0')}:${Math.floor(
                    Math.max(0, pack.rules.seconds - r.elapsed / 1000) % 60,
                  )
                    .toString()
                    .padStart(2, '0')}`}
        </span>}
        {onDemand && <HintToggle disclosure={disclosure} disabled={paused} />}
        <button className="painted-hud-button pause-menu-navigation" onClick={() => setPaused(value => !value)} aria-label={paused ? '继续游戏' : '暂停游戏'} aria-expanded={paused}>
          <PaintedIcon name="pause" />
        </button>
        {view.timer === 'pressure-bar' && <CountdownBar elapsed={r.elapsed} seconds={pack.rules.seconds} resolved={r.phase === 'reveal' || r.phase === 'complete'} deadline={pack.rules.timeout === 'fail'} pending={!!r.marking && r.found.length === count - 1} />}
      </header>
      <div
        id={disclosure.id}
        {...disclosure.panelProps}
        hidden={onDemand && !disclosure.expanded}
        className="hunt-targets"
        style={
          clues
            ? {
                top: clues.top,
                left: clues.left,
                transform: 'none',
                flexDirection: clues.column ? 'column' : 'row',
                gap: clues.gap,
              }
            : undefined
        }
        inert={modal || r.phase === 'ready'}
        aria-label={`${count}个物件剪影`}
      >
        {pack.rules.targets.map((t) => (
          <span
            key={t.id}
            className={r.found.includes(t.id) ? 'found' : ''}
            style={{
              ...(clues ? { width: clues.tileW, height: clues.tileH } : {}),
              ...(v2 && r.foundAt?.id === t.id
                ? {
                    transform: `scale(${1 + 0.12 * Math.sin(Math.min(1, (r.elapsed - r.foundAt.at + (r.phase === 'reveal' ? r.revealAge : 0)) / 220) * Math.PI)})`,
                  }
                : {}),
            }}
            aria-label={t.name + (r.found.includes(t.id) ? '已发现' : '待寻找')}
          >
            <img src={pack.skin.targets[t.id].icon} alt={t.name} />
            {r.found.includes(t.id) && <b>✓</b>}
          </span>
        ))}
      </div>
      {r.phase === 'ready' && !modal && (autoStart ? <LevelLaunchStatus error={error} onRetry={reload} onBack={onBack} /> :
        <PaintedLevelIntro levelId={pack.rules.id} title={levelTitle(pack.rules.id, pack.rules.title)} ready={ready} error={error} onRetry={reload} onStart={begin} onBack={onBack} />
      )}
      {caption && !modal && r.phase !== 'ready' && (
        <div className="hunt-caption" role="status">
          {caption}
        </div>
      )}
      <nav className="hunt-keyboard" inert={modal || r.phase === 'ready'} aria-label="键盘辅助寻找">
        {pack.rules.targets.map((t) => (
          <button
            disabled={
              r.phase !== 'playing' || !!r.marking || r.found.includes(t.id)
            }
            key={t.id}
            onClick={() => tap(t.id)}
          >
            圈出{t.name}
          </button>
        ))}
      </nav>
      {journey&&r.phase==='reveal'&&<SafeFeedback label="风险已识别 · 看看安全后的场景"/>}
      {r.phase === 'failed' && !paused && <PaintedFailure
        levelId={pack.rules.id}
        levelTitle={levelTitle(pack.rules.id, pack.rules.title)}
        kind="timeout"
        missed={{ count: count - r.found.length, unit: '处' }}
        reason={`还有 ${count - r.found.length} 处隐患未找到。`}
        hint={`给你${pack.rules.seconds}秒，把隐患全揪出来。卡住了就点灯泡。`}
        progress={`已找到 ${r.found.length}/${count} 处隐患`}
        journey={journey}
        onRetry={retry}
        onBack={onBack}
      />}
      {paused && <PauseMenu
        muted={muted}
        onToggleSound={() => {
          const next = !muted;
          setMuted(next);
          sound.current?.setMuted(next);
          if (!next) void sound.current?.unlock();
        }}
        onRestart={retry}
        onResume={() => setPaused(false)}
      />}
      {modal && !paused && r.phase !== 'failed' && !(journey&&r.phase==='complete') && (
        <div className="hunt-shade">
          <div
            className="hunt-dialog"
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="hunt-dialog-title"
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                const buttons = [
                    ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                      'button',
                    ),
                  ],
                  i = buttons.indexOf(
                    document.activeElement as HTMLButtonElement,
                  );
                if (e.shiftKey && i === 0) {
                  e.preventDefault();
                  buttons.at(-1)?.focus();
                } else if (!e.shiftKey && i === buttons.length - 1) {
                  e.preventDefault();
                  buttons[0]?.focus();
                }
              }
            }}
          >
            <small>
              {r.phase === 'unfinished'
                  ? '观察已结束 · 未获得小红花'
                  : `${count}处隐患 · 全部识别`}
            </small>
            <h2 id="hunt-dialog-title">
              {r.phase === 'unfinished'
                  ? `本次观察未完成 ${r.found.length}/${count}`
                  : view.completeTitle}
            </h2>
            {r.phase === 'unfinished' ? (
              <p>
                本次只记录观察结果，不发放小红花、不计入排行榜。可以重新开始，再仔细看看。
              </p>
            ) : (
              <>
                <div
                  className="hunt-flowers"
                  aria-label={`获得${r.stars}朵小红花`}
                >
                  {v2
                    ? [0, 1, 2].map((i) => (
                        <span
                          key={i}
                          style={{ animationDelay: `${i * 180}ms` }}
                        >
                          ✿
                        </span>
                      ))
                    : '✿ ✿ ✿'}
                </div>
                <p>{pack.rules.summary}</p>
                <small>{view.endingNote}</small>
              </>
            )}
            <div className="hunt-footer">
              <button onClick={replay}>重新开始</button>
              <button onClick={onBack}>返回关卡</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
