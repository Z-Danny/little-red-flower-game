import type { LevelPackage, Run } from './schema';
import { responsePressure } from '../response/pressure';
import type { AudioFrame } from '../response/audio-cues';
export function configuredPressure(pack: LevelPackage, run: Run) {
  const spec = pack.skin.response;
  const resolved = !!spec && spec.controlledBy.every(g => run.resolved.includes(g));
  return responsePressure({ risk: run.risk / 100, impulse: run.boost, sealed: !!spec?.sealed && run.resolved.includes(spec.sealed), sourceOff: !!spec?.sourceOff && run.resolved.includes(spec.sourceOff), resolved, settleMs: resolved ? run.phase === 'playing' ? 1600 : run.settleAge : 0 });
}
export function configuredAudioFrame(pack: LevelPackage, run: Run, active: boolean): AudioFrame {
  const pressure = configuredPressure(pack, run), action = run.action;
  return { ...pressure, elapsed: run.elapsed, active: !!pack.skin.response && active,
    result: pack.skin.response ? run.phase === 'failed' ? 'failure' : run.phase === 'complete' && !run.escaped ? 'victory' : null : undefined,
    paused: !active,
    action: action ? { id: `${action.rule}:${Math.round(run.elapsed - action.age)}`, kind: action.rule ?? 'bounce', age: action.age, duration: action.duration } : undefined,
    milestones: [...run.resolved, ...(pressure.resolved ? ['controlled'] : [])],
  };
}
