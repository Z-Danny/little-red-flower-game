'use client';
import { useEffect, useRef, useState } from 'react';
import { defaultPracticeAudioSettings, PracticeAudioSession, type PracticeAudioSettings, type PracticeAudioStatus } from '@/app/game/runtime/practice-audio';
import type { LevelPackage, Run } from '@/app/game/runtime/schema';

/** No AudioContext until unlock() is called from the enter-scene gesture. */
export function usePracticeAudio(pack: LevelPackage, run: Run, active: boolean) {
  const director = useRef<PracticeAudioSession | null>(null), latest = useRef({ run, active }); latest.current = { run, active };
  const [settings, setSettings] = useState<PracticeAudioSettings>({ ...defaultPracticeAudioSettings });
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const [status, setStatus] = useState<PracticeAudioStatus>({ state: 'locked', loops: 0, sfx: 0, played: 0, lastCue: '', rms: 0 });
  useEffect(() => {
    const session = new PracticeAudioSession(pack); director.current = session; session.setSettings(settingsRef.current);
    const visibility = () => session.setHidden(document.hidden); document.addEventListener('visibilitychange', visibility); visibility();
    session.update(latest.current.run, latest.current.active);
    const timer = setInterval(() => setStatus(session.status()), 350);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); session.dispose(); if (director.current === session) director.current = null; };
  }, [pack]);
  useEffect(() => { director.current?.setSettings(settings); }, [settings]);
  useEffect(() => { director.current?.update(run, active); }, [run, active]);
  return { settings, setSettings, status, stats: status,
    unlock: () => { director.current?.update(latest.current.run, latest.current.active); void director.current?.unlock(); },
    pickup: () => director.current?.pickup(), reset: () => director.current?.reset() };
}
