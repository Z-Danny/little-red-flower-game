'use client';
import {levelTitle,journeyTiming} from '@/app/game/journey/presentation';
import { useEffect, useReducer, useRef, useState } from 'react';
import type { DisasterPack, Point } from '@/app/game/disaster/schema';
import {
  createDisaster,
  reduceDisaster,
  remaining,
  pressure,
} from '@/app/game/disaster/model';
import { disasterCamera, objectPose } from '@/app/game/disaster/scene';
import { useGameViewport } from '@/app/game/display/use-game-viewport';
import { useCameraObstacles } from '@/app/game/display/use-camera-obstacles';
import { clientToScene } from '@/app/game/display/camera';
import { HuntSound } from '@/app/game/scene-hunt/sound';
import { loadDisasterArt, type DisasterArt } from './art';
import { hitObject, dropTarget } from './hit';
import { drawDisaster, type DragView } from './render';
import {SafeFeedback} from '../journey/safe-feedback';
import { CountdownBar } from '../scene-hunt/countdown-bar';
import { HintToggle } from '../scene-hunt/hint-toggle';
import { useHintDisclosure } from '../scene-hunt/use-hint-disclosure';
const clock = (ms: number) => {
  const n = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
export function DisasterPlayer({
  pack,
  onBack,
  onFinish,
  journey=false,
}: {
  journey?:boolean;
  pack: DisasterPack;
  onBack: () => void;
  onFinish: (id: string, flowers: number) => void;
}) {
  const viewport = useGameViewport(pack.skin);
  const [run, dispatch] = useReducer(
    (
      s: ReturnType<typeof createDisaster>,
      e: Parameters<typeof reduceDisaster>[2],
    ) => reduceDisaster(journey?{...pack.rules,revealMs:journeyTiming.safeHold}:pack.rules, s, e),
    undefined,
    createDisaster,
  );
  const [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [paused, setPaused] = useState(false),
    [muted, setMuted] = useState(false),
    [hidden, setHidden] = useState(false),
    [music, setMusic] = useState(true),
    [selected, setSelected] = useState<string | null>(null),
    [hint, setHint] = useState<string | null>(null);
  const surface = useRef<HTMLElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    dialog = useRef<HTMLDivElement>(null),
    art = useRef<DisasterArt | null>(null),
    sound = useRef<HuntSound | null>(null);
  const cameraObstacles = useCameraObstacles(surface, '.disaster-hud > button, .disaster-hud > h1, .disaster-hud > time, .disaster-clues > span', viewport.viewportKey);
  const drag = useRef<DragView>(null),
    pointer = useRef<{
      pointerId: number;
      id: string | null;
      start: Point;
      moved: boolean;
      offset: Point;
    } | null>(null);
  const latest = useRef({ run, paused, ready, selected, hint });
  latest.current = { run, paused, ready, selected, hint };
  const awardSent = useRef(false),
    linger = useRef(0),
    clockReset = useRef(true),
    seen = useRef({ goals: 0, notice: 0, phase: 'ready' }),
    hintTime = useRef(0);
  const modal =
      paused || ['complete', 'failed', 'evacuated'].includes(run.phase),
    street = pack.rules.kind === 'prevention';
  const disclosure = useHintDisclosure(street, `${paused}:${hidden}:${run.phase}:${run.goals.length}`);
  const clearInput = () => {
    pointer.current = null;
    drag.current = null;
    setSelected(null);
  };
  useEffect(() => {
    const press = pointer.current, node = canvas.current;
    if (press && node?.hasPointerCapture(press.pointerId)) node.releasePointerCapture(press.pointerId);
    pointer.current = null; drag.current = null; setSelected(null); clockReset.current = true;
  }, [viewport.viewportKey]);
  useEffect(() => {
    let alive = true;
    sound.current = new HuntSound('storm', undefined, { seconds: pack.rules.seconds });
    loadDisasterArt(pack.skin)
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
      clockReset.current = true;
      setHidden(document.hidden);
      sound.current?.setHidden(document.hidden);
      clearInput();
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      alive = false;
      sound.current?.dispose();
      document.removeEventListener('visibilitychange', hide);
    };
  }, [pack]);
  useEffect(() => {
    let frame = 0,
      last = performance.now(),
      meter = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loop = (now: number) => {
      const v = latest.current,
        dt = clockReset.current ? 0 : Math.min(100, now - last);
      clockReset.current = false;
      last = now;
      if (v.ready && !v.paused && !document.hidden) {
        dispatch({ type: 'tick', ms: dt });
        if (hintTime.current > 0) {
          hintTime.current -= dt;
          if (hintTime.current <= 0) setHint(null);
        }
      }
      const c = canvas.current,
        ctx = c?.getContext('2d');
      if (c && ctx && art.current) {
        const rect = c.getBoundingClientRect(),
          d = Math.min(2, devicePixelRatio || 1),
          w = Math.round(rect.width * d),
          h = Math.round(rect.height * d);
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        const cam = disasterCamera(
          rect.width,
          rect.height,
          pack.skin.width,
          pack.skin.height,
          pack.skin.framing,
          cameraObstacles.current,
        );
        ctx.setTransform(
          (cam.scale * w) / rect.width,
          0,
          0,
          (cam.scale * h) / rect.height,
          (cam.x * w) / rect.width,
          (cam.y * h) / rect.height,
        );
        drawDisaster(
          ctx,
          pack,
          art.current,
          journey&&(v.run.phase==='reveal'||v.run.phase==='complete')?{...v.run,revealAge:v.run.revealAge+1100}:v.run,
          drag.current,
          v.selected,
          v.hint,
          reduced,
        );
        if (now - meter > 100) {
          const active =
            !v.paused &&
            (v.run.phase === 'playing' ||
              v.run.phase === 'reveal' ||
              now < linger.current);
          sound.current?.setScene(
            active,
            pressure(pack.rules, v.run),
            v.run.phase === 'reveal' || v.run.phase === 'complete',
            v.run.elapsed + v.run.penalty,
          );
          c.dataset.audioRms = String(sound.current?.level.toFixed(5) ?? 0);
          c.dataset.audioCue = sound.current?.lastCue ?? '';
          meter = now;
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [pack, journey]);
  useEffect(() => {
    const s = sound.current,
      prev = seen.current;
    if (run.goals.length > prev.goals) {
      s?.cue('found');
      setHint(null);
    }
    if (run.notice.seq !== prev.notice && run.notice.tone === 'bad')
      s?.cue('wrong');
    if (run.phase !== prev.phase) {
      clearInput();
      if (run.phase === 'reveal') {
        s?.setScene(true, 0, true);
        s?.cue('resolve');
      }
      if (run.phase === 'failed') {
        if (street) { linger.current = 0; s?.fail(); }
        else { linger.current = performance.now() + 1300; s?.setScene(true, 1); s?.cue('thunder'); s?.cue('wrong'); }
      }
      if (run.phase === 'complete') {
        linger.current = performance.now() + 1000;
        s?.setScene(true, 0, true);
        s?.cue('success');
        if (!awardSent.current) {
          awardSent.current = true;
          onFinish(pack.rules.id, run.stars);
        }
      }
      if (run.phase === 'evacuated') {
        linger.current = performance.now() + 600;
        s?.setScene(true, 0, true);
        s?.cue('resolve');
      }
    }
    prev.goals = run.goals.length;
    prev.notice = run.notice.seq;
    prev.phase = run.phase;
  }, [run.goals.length, run.notice.seq, run.phase, onFinish, pack]);
  useEffect(() => {
    clockReset.current = true;
    if (paused) {
      clearInput();
      sound.current?.setScene(false, 0);
    }
    if (modal)
      dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [paused, modal]);
  const begin = () => {
    if (!ready) return;
    clockReset.current = true;
    dispatch({ type: 'start' });
    void sound.current?.unlock().then(() => sound.current?.setScene(true, 0));
  };
  const replay = () => {
    clearInput();
    setPaused(false);
    setHint(null);
    hintTime.current = 0;
    awardSent.current = false;
    linger.current = 0;
    seen.current = { goals: 0, notice: 0, phase: 'ready' };
    sound.current?.reset();
    sound.current?.setScene(false, 0);
    clockReset.current = true;
    dispatch({ type: 'reset' });
    if (street) { dispatch({ type: 'start' }); void sound.current?.unlock(); }
  };
  const point = (e: { clientX: number; clientY: number }) => {
    const rect = canvas.current!.getBoundingClientRect(),
      cam = disasterCamera(
        rect.width,
        rect.height,
        pack.skin.width,
        pack.skin.height,
        pack.skin.framing,
        cameraObstacles.current,
      );
    return clientToScene(cam, {x:e.clientX,y:e.clientY}, rect);
  };
  const act = (
    source: string | null,
    target: string | null,
    input: 'tap' | 'drop',
  ) => {
    if (!ready || paused || run.phase !== 'playing' || run.pending) return;
    disclosure.close();
    dispatch({ type: 'act', source, target, input });
    setHint(null);
  };
  const finishPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const press = pointer.current;
    if (!press || press.pointerId !== e.pointerId) return;
    pointer.current = null;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    const at = point(e);
    if (street) {
      act(press.id, press.id, 'tap');
      return;
    }
    if (press.moved && press.id) {
      act(press.id, dropTarget(pack, run, at, press.id), 'drop');
      setSelected(null);
      return;
    }
    if (press.id && pack.skin.sprites[press.id].input === 'tap') {
      act(press.id, press.id, 'tap');
      setSelected(null);
      return;
    }
    if (selected) {
      act(selected, dropTarget(pack, run, at, selected), 'drop');
      setSelected(null);
    } else setSelected(press.id);
  };
  return (
    <section
      ref={surface}
      style={viewport.style}
      data-game-surface
      className="disaster-player"
      data-level={pack.rules.id}
      data-challenge={street ? '50s' : undefined}
      data-phase={run.phase}
      data-goals={run.goals.join(',')}
      data-elapsed={Math.floor(run.elapsed)}
      data-penalty={run.penalty}
      data-pending={run.pending?.id ?? ''}
      data-paused={paused}
      data-selected={selected ?? ''}
      data-stars={run.stars}
    >
      <div className="disaster-world" inert={modal}>
        <canvas
          ref={canvas}
          data-game-canvas
          aria-label={`${levelTitle(pack.rules.id,pack.rules.title)}互动场景`}
          onPointerDown={(e) => {
            if (
              !ready ||
              paused ||
              run.phase !== 'playing' ||
              run.pending ||
              !e.isPrimary ||
              e.button !== 0 ||
              !art.current
            )
              return;
            e.preventDefault();
            const at = point(e),
              id = hitObject(pack, run, art.current, at),
              box = id ? objectPose(pack, run, id).box : null;
            pointer.current = {
              pointerId: e.pointerId,
              id,
              start: at,
              moved: false,
              offset: box
                ? { x: at.x - box.x, y: at.y - box.y }
                : { x: 0, y: 0 },
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const press = pointer.current;
            if (!press || press.pointerId !== e.pointerId || street) return;
            const at = point(e);
            if (Math.hypot(at.x - press.start.x, at.y - press.start.y) > 7)
              press.moved = true;
            if (
              press.moved &&
              press.id &&
              pack.skin.sprites[press.id].input === 'drag'
            ) {
              drag.current = { id: press.id, point: at, offset: press.offset };
              setSelected(press.id);
            }
          }}
          onPointerUp={finishPointer}
          onPointerCancel={clearInput}
          onLostPointerCapture={() => {
            pointer.current = null;
            drag.current = null;
          }}
        />
        {!ready && (
          <div className="disaster-loading" role="status">
            {error || '正在准备场景…'}
            {error && <button onClick={onBack}>返回关卡</button>}
          </div>
        )}
      </div>
      <header className="disaster-hud" inert={modal}>
        <button
          aria-label="返回关卡"
          onClick={() => (run.phase === 'ready' ? onBack() : setPaused(true))}
        >
          ‹
        </button>
        <h1>
          <small>
            LEVEL {pack.rules.order} · {street ? '找隐患' : '应急处置'}
          </small>
          {levelTitle(pack.rules.id,pack.rules.title)}
        </h1>
        {!street && <time
          aria-label={street ? '剩余时间' : '已用时间'}
          className={pressure(pack.rules, run) > 0.7 ? 'urgent' : ''}
        >
          {clock(street ? remaining(pack.rules, run) : run.elapsed)}
        </time>}
        {street && <HintToggle disclosure={disclosure} />}
        <button aria-label="暂停游戏" onClick={() => setPaused(true)}>
          Ⅱ
        </button>
        {street && <CountdownBar elapsed={run.elapsed + run.penalty} seconds={pack.rules.seconds} resolved={run.phase === 'reveal' || run.phase === 'complete'} deadline pending={!!run.pending && run.goals.length === pack.rules.goals.length - 1} />}
      </header>
      {street && (
        <div id={disclosure.id} {...disclosure.panelProps} hidden={!disclosure.expanded} className="disaster-clues" aria-label="七个隐患剪影" inert={modal}>
          {pack.rules.goals.map((g) => (
            <span
              key={g.id}
              className={run.goals.includes(g.id) ? 'found' : ''}
              aria-label={
                g.label + (run.goals.includes(g.id) ? '已发现' : '待寻找')
              }
            >
              <img src={pack.skin.sprites[g.id].icon} alt={g.label} />
              {run.goals.includes(g.id) && <b>✓</b>}
            </span>
          ))}
        </div>
      )}
      {!street && (
        <div
          className="disaster-waterline"
          role="meter"
          aria-label="外部水位风险"
          aria-valuenow={Math.round(pressure(pack.rules, run) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${pressure(pack.rules, run) * 100}%` }} />
        </div>
      )}
      {run.phase === 'ready' && ready && (
        <div className="disaster-entry">
          <span>
            {street
              ? '观察整幅场景 · 圈出 7 处隐患'
              : '拿取场景中的物品 · 帮家人转移'}
          </span>
          <button onClick={begin}>
            进入场景 · 开启声音 <b>›</b>
          </button>
          <small>
            {street
              ? '限时挑战 · 误点扣时 · 圈选不等于实际处置'
              : '可随时静音 · 不涉水、不返回取物'}
          </small>
        </div>
      )}
      {run.notice.text &&
        run.effectAge < 4600 &&
        !modal &&
        run.phase === 'playing' && (
          <div
            className="disaster-caption"
            role="status"
            data-tone={run.notice.tone}
          >
            {run.notice.text}
          </div>
        )}
      {run.phase === 'reveal' && (
        <div className="disaster-caption" role="status">
          {street
            ? '灾前安全方案示意 · 积水仍需远离'
            : '已转移到高处 · 等待救援'}
        </div>
      )}
      <nav
        className="disaster-keyboard"
        aria-label="键盘辅助操作"
        inert={modal || run.phase !== 'playing'}
      >
        {Object.entries(pack.skin.sprites).map(([id, s]) => (
          <button
            key={id}
            disabled={!!run.pending}
            onClick={() =>
              street || s.input === 'tap' ? act(id, id, 'tap') : setSelected(id)
            }
          >
            {street ? '圈出' : '选取'}
            {s.label}
          </button>
        ))}
        {selected &&
          !street &&
          [
            ...Object.keys(pack.skin.zones),
            ...Object.keys(pack.skin.sprites).filter((id) => id !== selected),
          ].map((id) => (
            <button
              key={'to-' + id}
              onClick={() => {
                act(selected, id, 'drop');
                setSelected(null);
              }}
            >
              放到{pack.skin.zones[id]?.label ?? pack.skin.sprites[id].label}
            </button>
          ))}
      </nav>
      {journey&&run.phase==='reveal'&&<SafeFeedback label={street?'风险已识别':'已到高处 · 安全待援'}/>}
      {modal && !(journey&&run.phase==='complete'&&!paused) && (
        <div className="disaster-shade">
          <div
            ref={dialog}
            className="disaster-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="disaster-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && paused) setPaused(false);
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
              {paused
                ? '训练暂停'
                : run.phase === 'complete'
                  ? '7 项训练已完成'
                  : run.phase === 'evacuated'
                    ? '已先行转移 · 训练未完成'
                    : '本次训练未完成'}
            </small>
            <h2 id="disaster-title">
              {paused
                ? '休息一下'
                : run.phase === 'complete'
                  ? pack.rules.finishTitle
                  : run.phase === 'evacuated'
                    ? '先避险，是对的'
                    : street ? '时间到了，再挑战一次吧' : '记住这次提醒'}
            </h2>
            {paused ? (
              <>
                <button
                  className="disaster-primary"
                  onClick={() => setPaused(false)}
                >
                  继续游戏
                </button>
                <div className="disaster-options">
                  <button
                    onClick={() => {
                      setMuted(!muted);
                      sound.current?.setMuted(!muted);
                      if (muted) void sound.current?.unlock();
                    }}
                  >
                    {muted ? '打开声音' : '关闭声音'}
                  </button>
                  <button
                    onClick={() => {
                      setMusic(!music);
                      sound.current?.setMusic(!music);
                    }}
                  >
                    音乐：{music ? '开' : '关'}
                  </button>
                  <button
                    onClick={() => {
                      const goal = pack.rules.goals.find(
                        (g) => !run.goals.includes(g.id),
                      );
                      const id = street
                        ? goal?.id
                        : pack.rules.actions.find((a) => a.goal === goal?.id)
                            ?.source;
                      setHint(id ?? null);
                      hintTime.current = 4000;
                      setPaused(false);
                    }}
                  >
                    需要提示
                  </button>
                </div>
                <p>{pack.rules.opening}</p>
                <small>{pack.rules.safety}</small>
              </>
            ) : run.phase === 'complete' ? (
              <>
                <div
                  className="disaster-flowers"
                  aria-label={`获得${run.stars}朵小红花`}
                >
                  {[1, 2, 3].map((i) => (
                    <span key={i} className={i <= run.stars ? 'earned' : ''}>
                      ✿
                    </span>
                  ))}
                </div>
                <p>{pack.rules.summary}</p>
                <small>{pack.rules.safety}</small>
              </>
            ) : (
              <>
                <p>{run.notice.text}</p>
                <small>
                  本次不发放小红花，不影响已有最高纪录。{run.goals.length}/7
                  项完成。
                </small>
              </>
            )}
            <div className="disaster-footer">
              <button onClick={replay}>{street && run.phase === 'failed' ? '重新挑战' : '重新开始'}</button>
              <button
                onClick={() => {
                  sound.current?.setScene(false, 0);
                  onBack();
                }}
              >
                返回关卡
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
