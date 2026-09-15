'use client';
/* oxlint-disable next/no-img-element -- Local art is embedded in the standalone offline build. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  archipelagoArt,
  archipelagoCategory,
  archipelagoIslands,
  archipelagoTiming,
  type ArchipelagoCategoryId,
  type ArchipelagoPhase,
  type ArchipelagoSound,
} from '@/app/game/journey/archipelago';
import { useReducedMotion } from './use-reduced-motion';

type Props = {
  currentCategoryId: string;
  onSelect: (categoryId: string) => void;
  onBack: () => void;
  onSound?: (cue: ArchipelagoSound) => void;
};

type Journey = {
  target: ArchipelagoCategoryId;
  elapsed: number;
  resumedAt: number;
  landAt: number;
  departAt: number;
  finishAt: number;
  moveFlag: boolean;
  landed: boolean;
  departing: boolean;
};

/** Full-page map destination picker inside the existing, shared garden frame. */
export function Archipelago({
  currentCategoryId,
  onSelect,
  onBack,
  onSound,
}: Props) {
  const current = archipelagoCategory(currentCategoryId);
  const [flagCategory, setFlagCategory] = useState<ArchipelagoCategoryId>(
    current.id,
  );
  const [target, setTarget] = useState<ArchipelagoCategoryId | null>(null);
  const [phase, setPhase] = useState<ArchipelagoPhase>('idle');
  const [hidden, setHidden] = useState(
    () => typeof document !== 'undefined' && document.hidden,
  );
  const reducedMotion = useReducedMotion();
  const root = useRef<HTMLDialogElement>(null);
  const flag = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const nextFrame = useRef<(now: number) => void>(() => {});
  const flight = useRef<Animation | null>(null);
  const journey = useRef<Journey | null>(null);
  const closing = useRef(false);
  const callbacks = useRef({ onSelect, onBack, onSound });
  const flagPosition = archipelagoCategory(flagCategory).flag;

  useEffect(() => {
    callbacks.current = { onSelect, onBack, onSound };
  }, [onSelect, onBack, onSound]);

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    flight.current?.cancel();
    flight.current = null;
    journey.current = null;
  }, []);

  const back = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    stop();
    callbacks.current.onBack();
  }, [stop]);

  const advance = useCallback(
    (now: number) => {
      const active = journey.current;
      if (!active || document.hidden || closing.current) return;
      const elapsed = active.elapsed + now - active.resumedAt;
      if (!active.landed && elapsed >= active.landAt) {
        active.landed = true;
        setPhase('landing');
        if (active.moveFlag) {
          setFlagCategory(active.target);
          flight.current?.cancel();
          flight.current = null;
          callbacks.current.onSound?.('land');
        }
      }
      if (!active.departing && elapsed >= active.departAt) {
        active.departing = true;
        setPhase('departing');
      }
      if (elapsed >= active.finishAt) {
        closing.current = true;
        const destination = active.target;
        stop();
        callbacks.current.onSelect(destination);
        return;
      }
      frame.current = requestAnimationFrame((time) => nextFrame.current(time));
    },
    [stop],
  );

  useEffect(() => {
    nextFrame.current = advance;
  }, [advance]);

  const select = useCallback(
    (categoryId: ArchipelagoCategoryId) => {
      if (journey.current || closing.current || document.hidden) return;
      const moveFlag = categoryId !== flagCategory;
      const finishAt = reducedMotion
        ? archipelagoTiming.reducedEnter
        : moveFlag
          ? archipelagoTiming.enter
          : archipelagoTiming.sameEnter;
      const landAt = moveFlag
        ? reducedMotion
          ? 80
          : archipelagoTiming.flagTravel
        : finishAt;
      const departAt = reducedMotion
        ? 90
        : moveFlag
          ? archipelagoTiming.departure
          : 140;
      journey.current = {
        target: categoryId,
        elapsed: 0,
        resumedAt: performance.now(),
        landAt,
        departAt,
        finishAt,
        moveFlag,
        landed: !moveFlag,
        departing: false,
      };
      setTarget(categoryId);
      setPhase('selecting');
      callbacks.current.onSound?.('select');

      // The single flag travels independently of the islands' stable hit boxes.
      const element = flag.current;
      if (moveFlag && element && typeof element.animate === 'function') {
        const from = archipelagoCategory(flagCategory).flag;
        const to = archipelagoCategory(categoryId).flag;
        const start = { left: `${from.x}%`, top: `${from.y}%` };
        const end = { left: `${to.x}%`, top: `${to.y}%` };
        const keyframes = reducedMotion
          ? [
              { ...start, opacity: 1 },
              { ...start, opacity: 0, offset: 0.45 },
              { ...end, opacity: 0, offset: 0.55 },
              { ...end, opacity: 1 },
            ]
          : [
              { ...start, transform: 'translate(-16%, -100%) rotate(0deg)' },
              {
                left: `${(from.x + to.x) / 2}%`,
                top: `${Math.min(from.y, to.y) - 7}%`,
                transform: `translate(-16%, -100%) rotate(${to.x > from.x ? 10 : -10}deg)`,
                offset: 0.5,
              },
              { ...end, transform: 'translate(-16%, -100%) rotate(0deg)' },
            ];
        flight.current = element.animate(keyframes, {
          duration: landAt,
          easing: 'cubic-bezier(.25,.65,.35,1)',
          fill: 'forwards',
        });
      }
      frame.current = requestAnimationFrame(advance);
    },
    [advance, flagCategory, reducedMotion],
  );

  useEffect(() => {
    const previousFocus = document.activeElement;
    const surface = root.current;
    closing.current = false;
    root.current
      ?.querySelector<HTMLButtonElement>(`[data-island="${current.id}"]`)
      ?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        back();
      } else if (event.key === 'Tab') {
        const buttons = Array.from(
          root.current?.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled)',
          ) ?? [],
        );
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !root.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !root.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const onVisibilityChange = () => {
      setHidden(document.hidden);
      const active = journey.current;
      if (!active) return;
      if (document.hidden) {
        active.elapsed += performance.now() - active.resumedAt;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        flight.current?.pause();
      } else {
        active.resumedAt = performance.now();
        flight.current?.play();
        frame.current = requestAnimationFrame(advance);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // Wait for the parent to remove inert from the preserved map below us.
      requestAnimationFrame(() => {
        if (surface?.isConnected) return;
        if (
          previousFocus instanceof HTMLElement &&
          previousFocus.isConnected &&
          !previousFocus.closest('[inert]')
        ) {
          previousFocus.focus({ preventScroll: true });
        }
      });
    };
  }, [advance, back, current.id, stop]);

  return (
    <dialog
      ref={root}
      open
      className="archipelago"
      aria-modal="true"
      aria-labelledby="archipelago-title"
      aria-describedby="archipelago-instruction"
      aria-busy={phase !== 'idle'}
      data-archipelago
      data-phase={phase}
      data-current-category={current.id}
      data-target-category={target ?? ''}
      data-hidden={hidden}
      data-reduced-motion={reducedMotion}
    >
      <img
        className="archipelago-sky"
        src={archipelagoArt.sky}
        alt=""
        draggable={false}
      />
      <div className="archipelago-clouds" aria-hidden="true">
        <img
          className="archipelago-cloud archipelago-cloud-far"
          data-archipelago-cloud="far"
          src={archipelagoArt.cloud}
          alt=""
          draggable={false}
        />
        <img
          className="archipelago-cloud archipelago-cloud-mid"
          data-archipelago-cloud="middle"
          src={archipelagoArt.cloud}
          alt=""
          draggable={false}
        />
        <img
          className="archipelago-cloud archipelago-cloud-near"
          data-archipelago-cloud="near"
          src={archipelagoArt.cloud}
          alt=""
          draggable={false}
        />
      </div>
      <header className="archipelago-header">
        <button
          type="button"
          className="archipelago-back"
          data-archipelago-back
          onClick={back}
          aria-label="返回刚才的地图"
        >
          <X aria-hidden="true" />
        </button>
        <h1
          id="archipelago-title"
          className="archipelago-title"
          data-archipelago-title
        >
          <img src={archipelagoArt.plaque} alt="" draggable={false} />
          <span>选择地图</span>
        </h1>
      </header>
      <div className="archipelago-map">
        <div className="archipelago-island-group" data-archipelago-island-group>
          {archipelagoIslands.map((island) => (
            <button
              type="button"
              key={island.id}
              className="archipelago-island"
              data-island={island.id}
              data-selected={target === island.id}
              data-ui-sound="off"
              aria-label={`${island.name}${island.id === current.id ? '，当前地图' : ''}，点击前往`}
              aria-pressed={island.id === flagCategory}
              aria-disabled={phase !== 'idle'}
              onClick={() => select(island.id)}
            >
              <span className="archipelago-island-float">
                <span className="archipelago-island-press">
                  <img
                    className="archipelago-island-art"
                    data-island-art={island.id}
                    src={island.art}
                    alt=""
                    draggable={false}
                  />
                  <span className="archipelago-island-label">
                    <img src={archipelagoArt.plaque} alt="" draggable={false} />
                    <span data-island-title={island.id}>{island.name}</span>
                  </span>
                </span>
              </span>
            </button>
          ))}
          <div
            ref={flag}
            className="archipelago-flag"
            data-archipelago-flag
            data-flag-category={flagCategory}
            data-traveling={phase === 'selecting' && target !== flagCategory}
            style={{ left: `${flagPosition.x}%`, top: `${flagPosition.y}%` }}
            aria-hidden="true"
          >
            <span className="archipelago-flag-float">
              <span className="archipelago-flag-landing">
                <img
                  className="archipelago-flag-pole-art"
                  src={archipelagoArt.flag}
                  alt=""
                  draggable={false}
                />
                <span className="archipelago-flag-face">
                  <img src={archipelagoArt.flag} alt="" draggable={false} />
                  <span>当前</span>
                </span>
              </span>
            </span>
          </div>
        </div>
      </div>
      <p id="archipelago-instruction" className="archipelago-instruction">
        <span aria-hidden="true">✿</span> 点击岛屿，前往地图{' '}
        <span aria-hidden="true">✿</span>
      </p>
      <output className="garden-sr-only" aria-live="polite" aria-atomic="true">
        {target
          ? `正在前往${archipelagoCategory(target).name}`
          : `当前地图：${current.name}`}
      </output>
      <div className="archipelago-departure-fog" aria-hidden="true" />
    </dialog>
  );
}
