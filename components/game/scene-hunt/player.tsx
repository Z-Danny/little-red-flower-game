'use client';
import { useEffect, useReducer, useRef, useState } from 'react';
import { createHunt, pressure, reduceHunt } from '@/app/game/scene-hunt/model';
import { camera, hitMask, type HuntPack } from '@/app/game/scene-hunt/schema';
import { HuntSound } from '@/app/game/scene-hunt/sound';
import { loadHuntArt, type HuntArt } from './art';
import { drawHunt } from './renderer';
type Props = {
  pack: HuntPack;
  onBack: () => void;
  onFinish: (id: string, stars: number) => void;
};
export function SceneHuntPlayer({ pack, onBack, onFinish }: Props) {
  const [r, dispatch] = useReducer(
    (r: ReturnType<typeof createHunt>, e: Parameters<typeof reduceHunt>[2]) =>
      reduceHunt(pack.rules, r, e),
    undefined,
    createHunt,
  );
  const [paused, setPaused] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [muted, setMuted] = useState(false),
    [music, setMusic] = useState(true),
    [hint, setHint] = useState<string | null>(null),
    [caption, setCaption] = useState(''),
    [audioState, setAudioState] = useState('locked');
  const canvas = useRef<HTMLCanvasElement>(null),
    art = useRef<HuntArt | null>(null),
    sound = useRef<HuntSound | null>(null),
    latest = useRef({ r, paused, ready, hint }),
    award = useRef(false),
    dialog = useRef<HTMLDivElement>(null),
    seen = useRef({ found: 0, phase: 'ready', warning: 0 }),
    captionTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = { r, paused, ready, hint };
  const p = pressure(pack.rules, r),
    modal = paused || r.phase === 'complete';
  const subtitle = (text: string, duration = 4200) => {
    setCaption(text);
    if (captionTimer.current) clearTimeout(captionTimer.current);
    captionTimer.current = setTimeout(() => setCaption(''), duration);
  };
  useEffect(() => {
    let alive = true;
    sound.current = new HuntSound();
    loadHuntArt(pack.skin)
      .then((a) => {
        if (alive) {
          art.current = a;
          setReady(true);
        }
      })
      .catch((e) => setError(String(e.message)));
    const hide = () => sound.current?.setHidden(document.hidden);
    document.addEventListener('visibilitychange', hide);
    return () => {
      alive = false;
      sound.current?.dispose();
      if (captionTimer.current) clearTimeout(captionTimer.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
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
        dt = Math.min(100, now - last);
      last = now;
      if (v.ready && !v.paused && !document.hidden)
        dispatch({ type: 'tick', ms: dt });
      const c = canvas.current,
        ctx = c?.getContext('2d');
      if (c && ctx && art.current) {
        const d = Math.min(2, devicePixelRatio || 1),
          w = Math.round(c.clientWidth * d),
          h = Math.round(c.clientHeight * d);
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#222b2c';
        ctx.fillRect(0, 0, w, h);
        const cam = camera(pack.skin, c.clientWidth, c.clientHeight);
        ctx.setTransform(
          cam.scale * d,
          0,
          0,
          cam.scale * d,
          cam.x * d,
          cam.y * d,
        );
        drawHunt(ctx, pack, art.current, v.r, reduced, v.hint);
        if (now - meter > 500) {
          c.dataset.audioRms = String(sound.current?.level.toFixed(5) ?? 0);
          c.dataset.audioCue = sound.current?.lastCue ?? '';
          meter = now;
          setAudioState(sound.current?.status ?? 'locked');
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [pack]);
  useEffect(() => {
    sound.current?.setScene(
      !paused && r.phase !== 'ready',
      p,
      r.phase === 'reveal' || r.phase === 'complete',
    );
  }, [paused, r.phase, p]);
  useEffect(() => {
    const prev = seen.current;
    if (r.found.length > prev.found) {
      const t = pack.rules.targets.find((t) => t.id === r.found.at(-1))!;
      sound.current?.cue('found');
      if (r.phase === 'playing') {
        subtitle('已识别：' + t.lesson, 6000);
      }
    }
    if (r.phase === 'reveal' && prev.phase !== 'reveal') {
      setHint(null);
      sound.current?.cue('resolve');
      subtitle('五处已识别 · 正在展示规范处置后的情景', 3200);
    }
    if (r.phase === 'complete' && prev.phase !== 'complete') {
      sound.current?.cue('success');
      if (!award.current) {
        award.current = true;
        onFinish(pack.rules.id, r.stars);
      }
    }
    const tier = p >= 1 ? 3 : p >= 0.7 ? 2 : p >= 0.42 ? 1 : 0;
    if (r.phase === 'playing' && tier > prev.warning && !r.marking) {
      prev.warning = tier;
      if (!r.found.length || !caption) {
        subtitle(
          tier === 3
            ? '风雨已经很强，仍可继续找。现实中优先保证人身安全。'
            : tier === 2
              ? '雨开始飘入室内，风声更强了。'
              : '风正在增强，还有隐患没有找到。',
        );
      }
    }
    prev.found = r.found.length;
    prev.phase = r.phase;
  }, [r.found, r.phase, p, r.marking, pack, onFinish]);
  useEffect(() => {
    if (modal)
      dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [modal]);
  const begin = async () => {
    if (!ready) return;
    dispatch({ type: 'start' });
    await sound.current?.unlock();
    sound.current?.setScene(true, 0);
    subtitle('对照剪影，圈出五处隐患。红圈只表示“已发现”。', 6200);
  };
  const tap = (id: string | null, x = 0, y = 0) => {
    if (!ready || paused || r.phase !== 'playing' || r.marking) return;
    void sound.current?.unlock();
    if (!id) {
      sound.current?.cue('wrong');
    } else if (!r.found.includes(id)) {
      sound.current?.cue('tap');
      setHint(null);
    }
    dispatch({ type: 'tap', id, x, y });
  };
  const replay = () => {
    award.current = false;
    seen.current = { found: 0, phase: 'ready', warning: 0 };
    setPaused(false);
    setCaption('');
    setHint(null);
    sound.current?.reset();
    dispatch({ type: 'reset' });
  };
  const askHint = () => {
    const id = pack.rules.targets.find((t) => !r.found.includes(t.id))?.id;
    if (!id) return;
    setPaused(false);
    setHint(id);
    sound.current?.setScene(r.phase !== 'ready', p);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 3500);
  };
  return (
    <section
      className="hunt-player"
      data-level={pack.rules.id}
      data-phase={r.phase}
      data-found={r.found.join(',')}
      data-pressure={p.toFixed(3)}
      data-paused={paused}
      data-audio={audioState}
    >
      <div className="hunt-world" inert={modal}>
        <canvas
          ref={canvas}
          aria-label="台风前的家：点击场景中的隐患，红圈表示发现"
          onPointerDown={(e) => {
            const c = e.currentTarget,
              rect = c.getBoundingClientRect(),
              cam = camera(pack.skin, rect.width, rect.height),
              x = (e.clientX - rect.left - cam.x) / cam.scale,
              y = (e.clientY - rect.top - cam.y) / cam.scale;
            if (e.button === 0 && e.isPrimary && art.current)
              tap(hitMask(pack.skin, art.current.mask, x, y), x, y);
          }}
        />
        {!ready && (
          <div className="hunt-loading" role="status">
            {error || '正在准备风雨场景…'}
          </div>
        )}
      </div>
      <header className="hunt-hud" inert={modal}>
        <button onClick={onBack} aria-label="返回关卡">
          ‹
        </button>
        <h1>
          <small>LEVEL 01 · 找隐患</small>
          {pack.rules.title}
        </h1>
        <span className={p > 0.7 ? 'urgent' : ''} aria-label="风雨增强倒计时">
          {r.phase === 'reveal' || r.phase === 'complete'
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
        </span>
        <button onClick={() => setPaused(true)} aria-label="暂停游戏">
          Ⅱ
        </button>
      </header>
      <div className="hunt-targets" inert={modal} aria-label="五个物件剪影">
        {pack.rules.targets.map((t) => (
          <span
            key={t.id}
            className={r.found.includes(t.id) ? 'found' : ''}
            aria-label={t.name + (r.found.includes(t.id) ? '已发现' : '待寻找')}
          >
            <img src={pack.skin.targets[t.id].icon} alt={t.name} />
            {r.found.includes(t.id) && <b>✓</b>}
          </span>
        ))}
      </div>
      {r.phase === 'ready' && ready && (
        <div className="hunt-entry">
          <span>观察整幅场景 · 圈出 5 处隐患</span>
          <button onClick={begin}>
            进入场景 · 开启声音 <b>›</b>
          </button>
          <small>可随时静音 · 圈选不是实际处置</small>
        </div>
      )}
      {caption && !modal && r.phase !== 'ready' && (
        <div className="hunt-caption" role="status">
          {caption}
        </div>
      )}
      <nav className="hunt-keyboard" inert={modal} aria-label="键盘辅助寻找">
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
      {modal && (
        <div className="hunt-shade">
          <div
            className="hunt-dialog"
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="hunt-dialog-title"
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
            <small>{paused ? '训练暂停' : '五处隐患 · 全部识别'}</small>
            <h2 id="hunt-dialog-title">
              {paused ? '休息一下' : '做好准备，家更安心'}
            </h2>
            {paused ? (
              <>
                <button
                  className="hunt-primary"
                  onClick={() => setPaused(false)}
                >
                  继续游戏
                </button>
                <div className="hunt-options">
                  <button
                    onClick={() => {
                      const next = !muted;
                      setMuted(next);
                      sound.current?.setMuted(next);
                      if (!next) void sound.current?.unlock();
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
                    背景音乐：{music ? '开' : '关'}
                  </button>
                  <button onClick={askHint}>需要提示</button>
                </div>
                <p>
                  这是识别训练。现实中应提前准备；风雨猛烈或电器周围潮湿时，不要冒险操作。
                </p>
              </>
            ) : (
              <>
                <div
                  className="hunt-flowers"
                  aria-label={`获得${r.stars}朵小红花`}
                >
                  ✿ ✿ ✿
                </div>
                <p>{pack.rules.summary}</p>
                <small>画面为规范处置后的效果示意</small>
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
