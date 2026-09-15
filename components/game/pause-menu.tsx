'use client';

import { useEffect, useId, useRef } from 'react';

type PauseMenuProps = {
  hint?: string;
  muted: boolean;
  onToggleSound: () => void;
  onRestart: () => void;
  onResume: () => void;
};

/** The player owns the clock, current hint and audio. This card only presents them. */
export function PauseMenu({ hint, muted, onToggleSound, onRestart, onResume }: PauseMenuProps) {
  const id = useId();
  const dialog = useRef<HTMLElement>(null);
  const resume = useRef(onResume);
  const press = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const restarting = useRef(false);
  resume.current = onResume;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const surface = dialog.current?.closest('[data-game-surface], .hunt-player, .configured-player, .disaster-player, .kitchen-player');
    dialog.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        resume.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(surface?.querySelectorAll<HTMLButtonElement>(
        '.pause-menu-navigation:not(:disabled), [data-pause-menu] button:not(:disabled)',
      ) ?? []).filter(button => button.getClientRects().length && !button.closest('[inert]'));
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0 || (!event.shiftKey && index === buttons.length - 1) || (event.shiftKey && index === 0)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        (event.shiftKey ? buttons.at(-1) : buttons[0])?.focus();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      if (before?.isConnected && !before.closest('[inert]')) before.focus({ preventScroll: true });
    };
  }, []);

  return <div className="pause-menu-shade" onPointerDown={event => {
    press.current = event.target === event.currentTarget ? { x: event.clientX, y: event.clientY, pointer: event.pointerId } : null;
    event.stopPropagation();
  }} onPointerUp={event => {
    const start = press.current;
    if (start && (start.pointer !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8)) press.current = null;
    event.stopPropagation();
  }} onPointerCancel={event => { press.current = null; event.stopPropagation(); }} onClick={event => {
    event.stopPropagation();
    if (event.target === event.currentTarget && press.current) resume.current();
    press.current = null;
  }} onDoubleClick={event => event.stopPropagation()}>
    <section ref={dialog} className="pause-menu" data-pause-menu="" data-has-hint={Boolean(hint)} role="dialog" aria-label="游戏暂停" aria-description="再次点击暂停按钮、按 Escape 或点击纸卡外继续。页面返回按钮仍可返回地图。" tabIndex={-1}>
      <div className="pause-menu-paper">
        {hint && <div className="pause-menu-hint">
          <h2>提示</h2>
          <p data-pause-hint="">{hint}</p>
        </div>}
        <div className="pause-menu-sound-row">
          <span id={`${id}-sound`}>声音</span>
          <button type="button" className="pause-menu-sound" data-pause-sound="" data-ui-sound="off" role="switch" aria-checked={!muted} aria-labelledby={`${id}-sound`} onClick={onToggleSound}>
            <span aria-hidden="true">{muted ? '关' : '开'}</span><i aria-hidden="true" />
          </button>
        </div>
      </div>
      <button type="button" className="pause-menu-restart" data-pause-restart="" aria-label="重新开始本局游戏" onClick={() => {
        if (restarting.current) return;
        restarting.current = true;
        onRestart();
      }}>重新开始</button>
    </section>
  </div>;
}
