import { useEffect, useRef, useState } from 'react';
import { HuntSound } from '@/app/game/scene-hunt/sound';
import { CollectionCueTimeline, type CollectionAudioRule } from '@/app/game/scene-hunt/collection-cues';
import type { Run } from '@/app/game/runtime/schema';

/** Indoor collection gets the same normalized tension clock, without invented wind/fire. */
export function useCollectionSound(enabled: boolean, seconds: number, run: Run, active: boolean, rules: readonly CollectionAudioRule[]) {
  const sound = useRef<HuntSound | null>(null);
  const seen = useRef({ phase: 'playing', count: 0 });
  const timeline = useRef(new CollectionCueTimeline());
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState({ state: 'locked', lastCue: '', rms: 0 });
  useEffect(() => {
    if (!enabled) return;
    const s = new HuntSound('quiet_electric', undefined, { seconds });
    sound.current = s;
    const hide = () => s.setHidden(document.hidden);
    hide(); document.addEventListener('visibilitychange', hide);
    const timer = setInterval(() => setStatus({ state: s.status, lastCue: s.lastCue, rms: s.level }), 150);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hide); s.dispose(); sound.current = null; };
  }, [enabled, seconds]);
  useEffect(() => {
    const s = sound.current;
    s?.setScene(active && ['playing', 'settling'].includes(run.phase), Math.min(1, run.elapsed / (seconds * 1000)), ['settling', 'complete'].includes(run.phase), run.elapsed);
    const actionCue = timeline.current.advance(run, rules);
    if (actionCue && active) s?.cue(actionCue === 'pickup' ? 'tap' : 'wrong');
    if (run.phase === 'failed' && seen.current.phase !== 'failed') s?.fail();
    else if (run.phase === 'settling' && seen.current.phase !== 'settling') s?.cue('resolve');
    else if (run.phase === 'complete' && seen.current.phase !== 'complete') s?.finish();
    else if (run.resolved.length > seen.current.count && run.phase !== 'failed') s?.cue('found');
    seen.current = { phase: run.phase, count: run.resolved.length };
  }, [active, run, seconds, rules]);
  return {
    muted, status,
    wrong: () => { sound.current?.cue('wrong'); },
    pickup: () => { sound.current?.cue('tap'); },
    unlock: () => { void sound.current?.unlock(); },
    reset: () => { sound.current?.reset(); timeline.current.reset(); seen.current = { phase: 'playing', count: 0 }; },
    toggle: () => { const value = !muted; setMuted(value); sound.current?.setMuted(value); if (!value) void sound.current?.unlock(); },
  };
}
