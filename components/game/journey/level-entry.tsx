import { getLevel } from '@/app/game/levels';
import { canEnter, nodeStatus, nodeFor, type Progress } from '@/app/game/journey/progress';
import { PaintedLevelIntro } from '../painted-ui';

/** The map owns the only introduction in a normal journey. */
export function LevelEntry({ inspect, completed, setInspect, onStart }: {
  inspect: string | null;
  completed: Progress;
  setInspect: (id: string | null) => void;
  onStart: (id: string) => void;
}) {
  const level = inspect ? getLevel(inspect) : undefined;
  if (!level) return null;
  const status = nodeStatus(level.id, completed);
  const prerequisite = getLevel(nodeFor(level.id)?.unlockAfter ?? '')?.title ?? '前置关卡';
  return (
    <PaintedLevelIntro
      key={level.id}
      levelId={level.id}
      title={level.title}
      className="painted-map-entry"
      mapEntry
      lockedReason={status === 'locked' || !level.playable ? `先完成「${prerequisite}」，即可解锁本关。` : undefined}
      startLabel={status === 'complete' ? '再玩一次' : undefined}
      onBack={() => setInspect(null)}
      onStart={() => {
        // Validate again at the action boundary, including programmatic clicks.
        if (!level.playable || !canEnter(level.id, completed)) return;
        onStart(level.id);
        setInspect(null);
      }}
    />
  );
}
