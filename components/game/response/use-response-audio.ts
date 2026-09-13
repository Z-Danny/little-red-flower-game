'use client';
import { useEffect, useRef, useState } from 'react';
import { ResponseAudio, defaultAudioSettings, type AudioSettings } from '@/app/game/response/audio';
import { type AudioFrame, type CueProfile, kitchenCues } from '@/app/game/response/audio-cues';
export function useResponseAudio(frame: AudioFrame, cues: CueProfile = kitchenCues) {
  const director = useRef<ResponseAudio | null>(null), latest = useRef(frame); latest.current = frame;
  const [settings, setSettings] = useState<AudioSettings>({ ...defaultAudioSettings });
  const [status, setStatus] = useState({ state: 'locked', loaded: 0, missing: [] as string[], loops: 0, sfx: 0, lastCue: '', characterCue: '', characterPlays: 0, musicRate: 1, rms: 0 });
  useEffect(() => {
    const d = new ResponseAudio(cues); director.current = d;
    const hide = () => d.setHidden(document.hidden); document.addEventListener('visibilitychange', hide); hide();
    const timer = setInterval(() => setStatus(d.status()), 400);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hide); d.dispose(); director.current = null; };
  }, [cues]);
  useEffect(() => { director.current?.setSettings(settings); }, [settings]);
  useEffect(() => { director.current?.update(frame); }, [frame]);
  const unlock = () => { director.current?.update(latest.current); void director.current?.unlock(); };
  return { settings, setSettings, status, unlock, pickup: () => director.current?.pickup(), reset: () => director.current?.reset() };
}
