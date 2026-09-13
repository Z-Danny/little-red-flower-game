import { useEffect, useId, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, PointerEvent } from 'react';
/** Hover for mouse, explicit toggle for touch; no fake mobile hover requirement. */
export function useHintDisclosure(enabled: boolean, dismissKey: string) {
  const id = useId();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelLeave = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
  };
  const close = () => {
    cancelLeave(); setPinned(false); setHovered(false); setFocused(false);
  };
  useEffect(() => { close(); }, [dismissKey]);
  useEffect(() => () => cancelLeave(), []);
  const enter = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') { cancelLeave(); setHovered(true); }
  };
  const leave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      cancelLeave();
      leaveTimer.current = setTimeout(() => setHovered(false), 220);
    }
  };
  const keyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  const expanded = !enabled || pinned || hovered || focused;
  return {
    id, expanded, close,
    buttonProps: {
      'aria-controls': id,
      'aria-expanded': expanded,
      onPointerEnter: enter,
      onPointerLeave: leave,
      onFocus: (e: FocusEvent<HTMLButtonElement>) => {
        if (e.currentTarget.matches(':focus-visible')) setFocused(true);
      },
      onBlur: () => setFocused(false),
      onClick: () => { cancelLeave(); setHovered(false); setFocused(false); setPinned(!pinned); },
      onKeyDown: keyDown,
    },
    panelProps: { onPointerEnter: enter, onPointerLeave: leave, onKeyDown: keyDown },
  };
}
