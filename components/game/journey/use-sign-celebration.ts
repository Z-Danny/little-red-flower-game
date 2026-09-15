import { useCallback, useState } from 'react';
import {
  journeyTiming,
  nodeStatus,
  type Planting,
  type Progress,
  type Region,
} from '@/app/game/journey/progress';
import { useReducedMotion } from './use-reduced-motion';

type Reveal = { levelId: string; nonce: number };
type Celebration = {
  regionId: string;
  consumed: number | null;
  reveal: Reveal | null;
};
/** A new unlock gets one sweep after the existing map guide begins. No save writes. */
export function useSignCelebration(
  region: Region,
  progress: Progress,
  planting: Planting | null,
  age: number,
) {
  const [celebration, setCelebration] = useState<Celebration>({
    regionId: region.id,
    consumed: null,
    reveal: null,
  });
  const reduced = useReducedMotion();
  const guideReady = !!planting && age >= journeyTiming.guide;
  // Adjust only when the event/region changes; ordinary animation ticks reuse state.
  if (celebration.regionId !== region.id || (reduced && celebration.reveal)) {
    setCelebration({ ...celebration, regionId: region.id, reveal: null });
  } else if (
    guideReady &&
    planting &&
    celebration.consumed !== planting.nonce
  ) {
    const next = region.nodes.find(
      (node) =>
        node.unlockAfter === planting.levelId &&
        nodeStatus(node.id, planting.before) === 'locked' &&
        nodeStatus(node.id, progress) === 'available',
    );
    setCelebration({
      regionId: region.id,
      consumed: planting.nonce,
      reveal:
        next && !reduced ? { levelId: next.id, nonce: planting.nonce } : null,
    });
  }

  // The sweep survives the planting timer and finishes only after playing visibly.
  const finishReveal = useCallback((nonce: number) => {
    setCelebration((current) =>
      current.reveal?.nonce === nonce ? { ...current, reveal: null } : current,
    );
  }, []);
  return { reveal: celebration.reveal, finishReveal };
}
