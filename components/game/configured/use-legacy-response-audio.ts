'use client';
import { useEffect, useRef, useState } from 'react';
import { createLegacyResponseAudioSession, legacyAudioSettings, legacyResponseAudioPack } from '@/app/game/runtime/legacy-response-audio';
import type { PracticeAudioSession, PracticeAudioStatus } from '@/app/game/runtime/practice-audio';
import type { LevelPackage, Run } from '@/app/game/runtime/schema';

export function useLegacyResponseAudio(pack: LevelPackage, run: Run, active: boolean) {
  const director = useRef<PracticeAudioSession | null>(null);
  const latest = useRef({ run, active });
  const [muted, setMuted] = useState(false), mutedRef = useRef(muted);
  const [status, setStatus] = useState<PracticeAudioStatus>({ state: 'locked', loops: 0, sfx: 0, played: 0, lastCue: '', rms: 0 });
  const enabled = !!legacyResponseAudioPack(pack);
  useEffect(() => { latest.current = { run, active }; }, [run, active]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => {
    const session = createLegacyResponseAudioSession(pack); if (!session) return;
    director.current = session; session.setSettings({ ...legacyAudioSettings, muted: mutedRef.current });
    const visibility = () => session.setHidden(document.hidden); visibility(); document.addEventListener('visibilitychange', visibility);
    session.update(latest.current.run, latest.current.active);
    const timer = setInterval(() => setStatus(session.status()), 250);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); session.dispose(); if (director.current === session) director.current = null; };
  }, [pack]);
  useEffect(() => { director.current?.update(run, active); }, [run, active]);
  useEffect(() => { director.current?.setSettings({ ...legacyAudioSettings, muted }); }, [muted]);
  return { enabled, muted, status,
    unlock: () => { director.current?.update(latest.current.run, latest.current.active); void director.current?.unlock(); },
    pickup: () => director.current?.pickup(),
    reset: () => director.current?.reset(),
    toggle: () => {
      const next = !muted; setMuted(next); director.current?.setSettings({ ...legacyAudioSettings, muted: next });
      if (!next) void director.current?.unlock();
    },
  };
}
