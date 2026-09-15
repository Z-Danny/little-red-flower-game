'use client';
import { useContext, useEffect, useRef, type MouseEvent } from 'react';
import { RewardSound } from './journey/reward-sound';
import { LevelInterfaceSoundContext } from './level-interface-sound-context';

/** A click covers touch, mouse and keyboard once; scene actions retain their own cues. */
export function useInterfaceSound(
  muted: boolean,
  volume = 1,
  onSession?: (session: RewardSound | null) => void,
  enabled = true,
) {
  const reportLevelPolicy = useContext(LevelInterfaceSoundContext);
  const soundRef = useRef<RewardSound | null>(null);
  const host = useRef<HTMLElement | null>(null);
  useEffect(() => { reportLevelPolicy?.({ muted, volume }); }, [muted, volume, reportLevelPolicy]);
  useEffect(() => {
    const session = new RewardSound();
    soundRef.current = session;
    onSession?.(session);
    const visibility = () => session.setHidden(document.hidden);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    const timer = window.setInterval(() => {
      if (!host.current) return;
      const status = session.status;
      host.current.dataset.uiAudioPlayed = String(status.scheduledCues);
      host.current.dataset.uiAudioCue = status.lastCue ?? '';
      host.current.dataset.uiAudioVoices = String(status.activeVoices);
    }, 150);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      session.retire();
      if (soundRef.current === session) soundRef.current = null;
      onSession?.(null);
    };
  }, [onSession]);
  useEffect(() => {
    soundRef.current?.setMuted(muted);
    soundRef.current?.setVolume(volume);
  }, [muted, volume, onSession]);
  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    host.current = event.currentTarget;
    if (!enabled || muted || volume <= 0 || !(event.target instanceof Element)) return;
    const button = event.target.closest('button');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    if (button.closest('[inert], [data-ui-sound="off"], .configured-keyboard, .disaster-keyboard, .hunt-keyboard, .kitchen-accessible, .kitchen-keyboard-targets')) return;
    soundRef.current?.unlock();
    if (button.dataset.uiSound === 'hint') soundRef.current?.hint();
    else if (button.dataset.uiSound === 'approved-button') soundRef.current?.button();
    else {
      const kind = button.dataset.uiSound;
      soundRef.current?.ui(kind === 'open' || kind === 'close' || kind === 'confirm' ? kind : 'tap');
    }
  };
  return { onClickCapture, 'data-ui-audio-muted': muted || volume <= 0 };
}
