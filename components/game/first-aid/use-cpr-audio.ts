'use client';
import { useEffect, useRef, useState } from 'react';
import { CprSound, cprInputCue } from '@/app/game/first-aid/cpr-audio';
import type { CprEvent, CprState } from '@/app/game/first-aid/cpr-model';

export function useCprAudio(state: CprState, active: boolean) {
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState({ state: 'locked', played: 0, lastCue: '', voices: 0, rms: 0 });
  const session = useRef<CprSound | null>(null);
  const latest = useRef({ active, muted }); latest.current = { active, muted };
  const observed = useRef({ aedReady: state.aedReady, complete: state.phase === 'complete' });
  useEffect(() => {
    const sound = new CprSound(); session.current = sound;
    const visibility = () => sound.setPolicy(latest.current.active, latest.current.muted, document.hidden);
    visibility(); document.addEventListener('visibilitychange', visibility);
    const timer = window.setInterval(() => setStatus(sound.status), 100);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); sound.dispose(); session.current = null; };
  }, []);
  useEffect(() => { session.current?.setPolicy(active, muted, document.hidden); }, [active, muted]);
  useEffect(() => {
    if (state.phase === 'complete' && !observed.current.complete) session.current?.play('victory');
    else if (state.aedReady && !observed.current.aedReady) session.current?.play('rescue-arrival');
    // Consume even while muted: never replay past arrivals/completion on unmute.
    observed.current = { aedReady: state.aedReady, complete: state.phase === 'complete' };
  }, [state.aedReady, state.phase]);
  return { muted, status, toggle: () => setMuted(value => !value),
    unlock: () => { session.current?.setPolicy(latest.current.active, latest.current.muted, document.hidden); session.current?.unlock(); },
    resume: () => { session.current?.setPolicy(true, latest.current.muted, document.hidden); session.current?.unlock(); },
    input: (event: CprEvent) => { const cue = cprInputCue(state, event); if(cue) session.current?.play(cue); } };
}
