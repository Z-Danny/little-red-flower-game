'use client';
/* oxlint-disable next/no-img-element -- Local art is embedded in the standalone HTML. */
import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { X } from 'lucide-react';
import { archipelagoArt, archipelagoCategory, archipelagoIslands, type ArchipelagoSound } from '@/app/game/journey/archipelago';
import { getLevel } from '@/app/game/levels';
import { type Progress } from '@/app/game/journey/progress';
import { islandArcPose, islandArcStep } from '@/app/game/journey/island-orbit';
import { IslandLevelSelect } from './island-level-select';
import { useReducedMotion } from './use-reduced-motion';

type Props = {
  currentCategoryId: string;
  initialShowLevels?: boolean;
  obscured?: boolean;
  completed: Progress;
  allLevelsUnlocked?: boolean;
  onSelect: (levelId: string) => void;
  onBack: () => void;
  onSound?: (cue: ArchipelagoSound) => void;
  levelTools?: ReactNode;
};

/** Nine themed destinations; selecting a level retains its original ID and rules. */
export function Archipelago({ currentCategoryId, completed, initialShowLevels = false, obscured = false, allLevelsUnlocked = false, onSelect, onBack, onSound, levelTools }: Props) {
  const [index, setIndex] = useState(() => archipelagoIslands.indexOf(archipelagoCategory(currentCategoryId)));
  const [showLevels, setShowLevels] = useState(initialShowLevels);
  const [dragOffset, setDragOffset] = useState(0);
  const root = useRef<HTMLDialogElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const reducedMotion = useReducedMotion();
  const callbacks = useRef({ onBack, onSelect, onSound, obscured });
  callbacks.current = { onBack, onSelect, onSound, obscured };
  const selected = archipelagoIslands[index];
  const playable = selected.levelIds.filter(id => getLevel(id)?.playable).length;
  const actions = useRef({ index, showLevels });
  actions.current = { index, showLevels };

  function move(next: number) {
    const bounded = Math.max(0, Math.min(archipelagoIslands.length - 1, next));
    if (bounded === index) return;
    setIndex(bounded);
    setShowLevels(false);
    callbacks.current.onSound?.('select');
  }
  function openLevels() {
    setShowLevels(true);
    callbacks.current.onSound?.('land');
  }
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.querySelector<HTMLButtonElement>('[data-carousel-close]')?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (callbacks.current.obscured) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (actions.current.showLevels) setShowLevels(false);
        else callbacks.current.onBack();
      } else if (!actions.current.showLevels && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 8 : actions.current.index + (event.key === 'ArrowLeft' ? -1 : 1);
        const bounded = Math.max(0, Math.min(8, next));
        if (bounded !== actions.current.index) { setIndex(bounded); callbacks.current.onSound?.('select'); }
      } else if (event.key === 'Tab') {
        const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([tabindex="-1"])') ?? [])]
          .filter(button => !button.closest('[inert]') && button.getClientRects().length > 0);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || !root.current?.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !root.current?.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      requestAnimationFrame(() => {
        if (previous instanceof HTMLElement && previous.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
      });
    };
  }, []);
  useEffect(() => {
    if (obscured) return;
    if (showLevels) root.current?.querySelector<HTMLButtonElement>('[data-levels-close]')?.focus();
    else root.current?.querySelector<HTMLButtonElement>(`[data-island="${selected.id}"]`)?.focus({ preventScroll: true });
  }, [showLevels, selected.id, obscured]);

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    suppressClick.current = false;
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.moved && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      // Native vertical panning is disabled here. Do not turn an ignored
      // vertical swipe into a tap on the island when the finger is lifted.
      suppressClick.current = true;
      drag.current = null;
      return;
    }
    if (Math.abs(dx) > 8) {
      start.moved = true; suppressClick.current = true;
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
      const atEdge = (index === 0 && dx > 0) || (index === 8 && dx < 0);
      const step = (track.current?.clientWidth ?? 390) * islandArcStep;
      setDragOffset(Math.max(-1, Math.min(1, dx / step * (atEdge ? 0.2 : 1))));
    }
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    drag.current = null; setDragOffset(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const dx = event.clientX - start.x;
    const threshold = Math.min(72, (track.current?.clientWidth ?? 390) * 0.14);
    if (!cancelled && start.moved && Math.abs(dx) > threshold) move(index + (dx < 0 ? 1 : -1));
  }

  return (
    <dialog ref={root} open className="archipelago" aria-modal="true" aria-labelledby={showLevels ? 'island-levels-title' : 'archipelago-title'} aria-describedby="archipelago-instruction"
      // The level-intro modal owns sibling inertness and restores it on close.
      // Do not also set inert here: the modal would snapshot and restore true.
      aria-hidden={obscured || undefined}
      data-archipelago data-page={showLevels ? 'levels' : 'islands'} data-phase="idle" data-current-category={selected.id} data-reduced-motion={reducedMotion}>
      <img className="archipelago-sky" src={archipelagoArt.sky} alt="" draggable={false} />
      <div className="archipelago-clouds" aria-hidden="true">
        <img src={archipelagoArt.cloud} alt="" draggable={false} />
        <img src={archipelagoArt.cloud} alt="" draggable={false} />
      </div>
      <header className="archipelago-header" hidden={showLevels}>
        <button type="button" className="island-round-button" data-carousel-close onClick={onBack} aria-label="返回首页"><X /></button>
        <div><p className="archipelago-eyebrow">小红花 · 安全群岛</p><h1 id="archipelago-title">选择你的下一站</h1></div>
        <span className="archipelago-counter" aria-hidden="true">{String(index + 1).padStart(2, '0')} / 09</span>
      </header>
      <div className="archipelago-browser" inert={showLevels} aria-hidden={showLevels || undefined}>
        <div className="archipelago-carousel" ref={track} aria-roledescription="轮播" aria-label="安全主题岛屿"
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event => pointerEnd(event)}
          onPointerCancel={event => pointerEnd(event, true)} onLostPointerCapture={event => {
            // Touch starts with implicit capture on the child button. Its lost-capture
            // event bubbles when we transfer capture to the carousel: do not cancel it.
            if (event.target === event.currentTarget) pointerEnd(event, true);
          }}
          onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
          <div className="archipelago-track" data-dragging={dragOffset !== 0}>
            {archipelagoIslands.map((island, i) => {
              const pose = islandArcPose(i - index + dragOffset);
              const nearby = Math.abs(i - index) <= 1;
              return (
                <div className="archipelago-slide" key={island.id} data-active={i === index}
                  aria-hidden={!nearby} style={{ transform: `rotate(${pose.angle}deg)`, zIndex: pose.zIndex, visibility: pose.visible ? 'visible' : 'hidden' }}>
                  <div className="archipelago-island-slot" style={{ transform: `translateX(-50%) rotate(${-pose.angle}deg) scale(${pose.scale})`, opacity: pose.opacity }}>
                    <button type="button" className="archipelago-island" data-island={island.id} data-selected={i === index}
                      tabIndex={nearby ? 0 : -1} aria-current={i === index ? 'true' : undefined}
                      aria-label={`${island.name}，点击进入关卡选择`}
                      onClick={() => { if (i !== index) move(i); openLevels(); }}>
                      <img data-island-art={island.id} src={island.art} alt="" draggable={false} decoding="async" />
                      <span className="garden-sr-only" data-island-title={island.id}>{island.name}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p id="archipelago-instruction" className="garden-sr-only">左右滑动沿弧线切换岛屿，点击中央岛屿查看关卡；也可点击两侧岛屿或使用方向键切换。</p>
      <output className="garden-sr-only" aria-live="polite" aria-atomic="true">第{index + 1}座，共9座：{selected.name}，{playable}关已开放</output>
      {showLevels && <IslandLevelSelect island={selected} completed={completed} tools={levelTools}
        allLevelsUnlocked={allLevelsUnlocked} onBack={() => setShowLevels(false)} onSelect={id => callbacks.current.onSelect(id)} />}
    </dialog>
  );
}
