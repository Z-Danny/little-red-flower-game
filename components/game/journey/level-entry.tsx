import { rewardRuleLabel } from '@/app/game/journey/time-reward';
import { rewardReferenceSeconds } from '@/app/game/journey/level-reward';
import { getLevel } from '@/app/game/levels';
import { journeyEntryFor } from '@/app/game/journey/entry';
import type { Progress } from '@/app/game/journey/progress';
import { PaintedLevelIntro } from '../painted-ui';

/** The map owns the only introduction in a normal journey. */
export function LevelEntry({ inspect, completed, allLevelsUnlocked = false, setInspect, onStart }: {
  inspect: string | null;
  completed: Progress;
  allLevelsUnlocked?: boolean;
  setInspect: (id: string | null) => void;
  onStart: (id: string) => void;
}) {
  const entry = inspect ? journeyEntryFor(inspect, completed, allLevelsUnlocked) : undefined;
  if (!entry) return null;
  return (
    <PaintedLevelIntro
      key={entry.id}
      levelId={entry.id}
      title={entry.title}
      className="painted-map-entry"
      mapEntry
      lockedReason={entry.lockedReason}
      lockedLabel={entry.lockedLabel}
      startLabel={entry.startLabel}
      note={[entry.note, getLevel(entry.id)?.playable && getLevel(entry.id)?.engine !== 'first-aid-cpr' ? `${rewardRuleLabel(rewardReferenceSeconds(entry.id))}。先正确处置，再挑战速度；重玩只补差额。` : undefined].filter(Boolean).join(' · ')}
      onBack={() => setInspect(null)}
      onStart={() => {
        // Recheck both prerequisites and actual gameplay availability at the action boundary.
        if (!journeyEntryFor(entry.id, completed, allLevelsUnlocked)?.canStart) return;
        onStart(entry.id);
        setInspect(null);
      }}
    />
  );
}
