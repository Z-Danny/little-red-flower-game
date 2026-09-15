'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { JourneyMusic } from '@/app/game/journey/music';
import config from '@/content/journey-audio.json';

const STORAGE_KEY = 'red-flower:journey-music-muted';
function readMuted() {
  try { return typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true'; }
  catch { return false; }
}

/** One music session survives navigation across the public pages. */
export function useJourneyMusic(active: boolean) {
  const player = useRef<JourneyMusic | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const latestActive = useRef(active);
  const [muted, setMuted] = useState(readMuted);

  useEffect(() => {
    const music = new JourneyMusic(config);
    player.current = music;
    music.setMuted(readMuted());
    music.setActive(latestActive.current);
    const visibility = () => music.setHidden(document.hidden);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    const observe = () => {
      const node = containerRef.current;
      if (!node) return;
      const state = music.status;
      node.dataset.journeyMusicState = state.phase;
      node.dataset.journeyMusicPlaying = String(state.playing);
      node.dataset.journeyMusicDecoded = String(state.decoded);
      node.dataset.journeyMusicMuted = String(state.muted);
      node.dataset.journeyMusicPosition = state.position.toFixed(3);
      node.dataset.journeyMusicActive = String(latestActive.current);
    };
    observe();
    // Update diagnostics without re-rendering the scene or map on every tick.
    const timer = window.setInterval(observe, 200);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      music.dispose();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    latestActive.current = active;
    player.current?.setActive(active);
  }, [active]);
  const unlock = useCallback(() => { void player.current?.unlock(); }, []);
  const toggle = useCallback(() => {
    const next = !muted;
    setMuted(next);
    player.current?.setMuted(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* Keep session preference. */ }
    if (!next) void player.current?.unlock();
  }, [muted]);
  return { muted, toggle, unlock, containerRef };
}
