import { ArrowRight, LockKeyhole } from 'lucide-react';
import { getLevel } from '@/app/game/levels';
import { getHunt } from '@/app/game/scene-hunt/registry';
import { presentationOf } from '@/app/game/scene-hunt/presentation';
import { levelPreview } from '@/app/game/journey/presentation';
import {
  nodeStatus,
  regionFor,
  nodeFor,
  type Progress,
} from '@/app/game/journey/progress';
import { GardenDialog } from './dialog';
export function LevelEntry({
  inspect,
  completed,
  setInspect,
  onStart,
}: {
  inspect: string | null;
  completed: Progress;
  setInspect: (id: string | null) => void;
  onStart: (id: string) => void;
}) {
  const inspected = inspect ? getLevel(inspect) : undefined,
    inspectedHunt = inspect ? getHunt(inspect) : undefined,
    inspectedStatus = inspect ? nodeStatus(inspect, completed) : 'locked';
  return (
    <>
      {inspected && (
        <GardenDialog title={inspected.title} onClose={() => setInspect(null)}>
          <small className="garden-overline">
            {regionFor(inspected.id)?.short} ·{' '}
            {inspected.kind === 'prevention' ? '观察隐患' : '应急处置'}
          </small>
          <h2>{inspected.title}</h2>
          <p>
            {levelPreview(
              inspected.id,
              inspectedHunt
                ? presentationOf(inspectedHunt).preview
                : inspected.briefing,
            )}
          </p>
          <div className="garden-entry-facts">
            <span>{inspected.duration}</span>
            <span>{inspected.goals.length} 个目标</span>
            <span>
              {inspectedStatus === 'complete' ? '花朵已种下' : '首次完成 +3 朵'}
            </span>
          </div>
          {inspectedStatus === 'locked' ? (
            <p className="garden-locked-note">
              <LockKeyhole />
              先完成「
              {getLevel(nodeFor(inspected.id)?.unlockAfter ?? '')?.title ??
                '前置关卡'}
              」，花径就会通向这里。
            </p>
          ) : (
            <button
              className="garden-primary"
              onClick={() => {
                setInspect(null);
                onStart(inspected.id);
              }}
            >
              {inspectedStatus === 'complete' ? '再守护一次' : '进入场景'}
              <ArrowRight />
            </button>
          )}
        </GardenDialog>
      )}
    </>
  );
}
