/* oxlint-disable next/no-img-element -- Local artwork is embedded in the standalone offline HTML. */
'use client';

import { useCallback, useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { getLevelIntroduction } from '@/app/game/level-introduction';

const PAINTED_ICONS = {
  hint: '/ui/painted-v1/hint.webp',
  pause: '/ui/painted-v1/pause.webp',
  back: '/ui/painted-v1/back.webp',
} as const;

type PaintedIconProps = {
  name: 'hint' | 'pause' | 'back';
  className?: string;
};

/** The surrounding button supplies the accessible name and hit target. */
export function PaintedIcon({ name, className = '' }: PaintedIconProps) {
  return (
    <img
      className={`painted-icon painted-icon-${name} ${className}`.trim()}
      src={PAINTED_ICONS[name]}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={64}
      height={64}
    />
  );
}

type PaintedLevelIntroProps = {
  levelId: string;
  title: string;
  onStart: () => void;
  onBack: () => void;
  ready?: boolean;
  error?: string | null;
  onRetry?: () => void;
  note?: string;
  className?: string;
  mapEntry?: boolean;
  lockedReason?: string;
  startLabel?: string;
};

const stopSceneEvent = (event: SyntheticEvent) => event.stopPropagation();

/** Shared introduction only: the level engine owns readiness, timing and audio. */
export function PaintedLevelIntro({
  levelId,
  title,
  onStart,
  onBack,
  ready = true,
  error,
  onRetry,
  note,
  className = '',
  mapEntry = false,
  lockedReason,
  startLabel: labelOverride,
}: PaintedLevelIntroProps) {
  const { description, startLabel } = getLevelIntroduction(levelId);
  const id = useId();
  const shade = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const back = useRef(onBack);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backdropPress = useRef(false);
  const pointerOrigin = useRef({ x: 0, y: 0, id: -1 });
  const leaving = useRef(false);
  const [closing, setClosing] = useState(false);
  const canRetry = Boolean(error && onRetry);
  const disabled = Boolean(lockedReason) || closing || (canRetry ? false : !ready || Boolean(error));
  const actionLabel = lockedReason ? '尚未解锁' : error
    ? canRetry
      ? '重新准备场景'
      : '场景准备失败'
    : ready
      ? labelOverride || startLabel
      : '场景准备中…';

  const close = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setClosing(true);
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140;
    dismissTimer.current = setTimeout(() => back.current(), duration);
  }, []);

  useEffect(() => {
    back.current = onBack;
  }, [onBack]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const previous = document.activeElement;
    // Preserve the map hierarchy and scroll position while its controls are inert.
    const map = mapEntry ? shade.current?.closest('.garden-shell') : null;
    const siblings = map ? Array.from(map.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child !== shade.current,
    ).map((child) => ({ child, inert: child.inert })) : [];
    siblings.forEach(({ child }) => { child.inert = true; });
    const focusPrimary = () => {
      const target = primary.current;
      (target && !target.disabled ? target : node).focus({
        preventScroll: true,
      });
    };
    focusPrimary();

    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(
        node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
      );
      const first = buttons[0];
      const last = buttons.at(-1);
      if (!first || !last) {
        event.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }
      const active = document.activeElement;
      if (
        event.shiftKey &&
        (active === first || !buttons.includes(active as HTMLButtonElement))
      ) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (
        !event.shiftKey &&
        (active === last || !buttons.includes(active as HTMLButtonElement))
      ) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
      // A level's keyboard controls must not handle a modal's Tab press.
      event.stopImmediatePropagation();
    };
    const keepFocusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !node.contains(event.target))
        focusPrimary();
    };
    document.addEventListener('keydown', keyDown, true);
    document.addEventListener('focusin', keepFocusInside, true);
    return () => {
      document.removeEventListener('keydown', keyDown, true);
      document.removeEventListener('focusin', keepFocusInside, true);
      if (dismissTimer.current !== null) clearTimeout(dismissTimer.current);
      siblings.forEach(({ child, inert }) => { child.inert = inert; });
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        previous !== document.body
      ) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [levelId, mapEntry, close]);

  useEffect(() => {
    // Loading starts with focus on the dialog; readiness may enable its action.
    if (!disabled && document.activeElement === dialog.current) {
      primary.current?.focus({ preventScroll: true });
    }
  }, [disabled]);

  return (
    <div
      ref={shade}
      className={`painted-intro-shade ${className}`.trim()}
      data-painted-intro=""
      data-level-id={levelId}
      data-has-note={Boolean(note || error)}
      data-closing={closing}
      data-locked={Boolean(lockedReason)}
      role="presentation"
      onPointerDown={(event) => {
        backdropPress.current = event.target === event.currentTarget;
        pointerOrigin.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
        stopSceneEvent(event);
      }}
      onPointerUp={(event) => {
        const origin = pointerOrigin.current;
        backdropPress.current = backdropPress.current &&
          event.target === event.currentTarget && event.pointerId === origin.id &&
          Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 8;
        stopSceneEvent(event);
      }}
      onPointerCancel={(event) => { backdropPress.current = false; stopSceneEvent(event); }}
      onClick={(event) => {
        stopSceneEvent(event);
        if (event.target === event.currentTarget && backdropPress.current) close();
        backdropPress.current = false;
      }}
      onDoubleClick={stopSceneEvent}
      onKeyDown={stopSceneEvent}
      onKeyUp={stopSceneEvent}
    >
      <dialog
        ref={dialog}
        className="painted-intro-dialog"
        open
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description${error ? ` ${id}-status` : ''}${note ? ` ${id}-note` : ''}`}
        tabIndex={-1}
      >
        <div className="painted-intro-card">
          <img
            className="painted-intro-art"
            src="/ui/painted-v1/modal-panel-v2.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <h2
            id={`${id}-title`}
            className="painted-intro-title"
            data-long-title={Array.from(title).length > 8}
          >
            {title}
          </h2>
          <p id={`${id}-description`} className="painted-intro-description">
            {lockedReason || description}
          </p>
          <button
            ref={primary}
            type="button"
            className="painted-intro-start"
            data-painted-primary=""
            data-long-label={Array.from(actionLabel).length > 9}
            disabled={disabled}
            aria-busy={!lockedReason && !ready && !error}
            onClick={() => {
              if (lockedReason || leaving.current) return;
              if (canRetry) onRetry?.();
              else if (ready && !error) {
                leaving.current = true;
                onStart();
              }
            }}
          >
            <img className="painted-intro-button-art" src="/ui/painted-v1/modal-button-v2.webp" alt="" aria-hidden="true" draggable={false} />
            <span>{lockedReason && <LockKeyhole aria-hidden="true" />}{actionLabel}</span>
          </button>
        </div>
        {(note || error) && <div className="painted-intro-footer">
          {error && (
            <p
              id={`${id}-status`}
              className="painted-intro-status"
              role="alert"
            >
              场景暂时没有准备好，请重新尝试。
            </p>
          )}
          {note && (
            <p id={`${id}-note`} className="painted-intro-note">
              {note}
            </p>
          )}
        </div>}
      </dialog>
    </div>
  );
}
