/* oxlint-disable next/no-img-element -- Local artwork is embedded in the offline HTML. */
import { useState, type CSSProperties } from 'react';
import type { NodeStatus } from '@/app/game/journey/progress';
import {
  signMotion,
  signMotifFor,
  signStamp,
  signTextureFor,
} from '@/app/game/journey/signs';
import { useVisibleMotion } from './use-visible-motion';
import { useReducedMotion } from './use-reduced-motion';

type Props = {
  levelId: string;
  regionId: string;
  title: string;
  status: NodeStatus;
  revealNonce?: number;
  stampNonce?: number;
  onRevealEnd: (nonce: number) => void;
};

/** Text, material, level engraving and state effects share the existing map sign. */
export function MapSign({
  levelId,
  regionId,
  title,
  status,
  revealNonce,
  stampNonce,
  onRevealEnd,
}: Props) {
  const { ref, visible } = useVisibleMotion();
  const reduced = useReducedMotion();
  const [consumedStampNonce, setConsumedStampNonce] = useState<
    number | undefined
  >();
  // Reduced motion consumes the event too: re-enabling motion must not replay it.
  if (
    reduced &&
    stampNonce !== undefined &&
    consumedStampNonce !== stampNonce
  ) {
    setConsumedStampNonce(stampNonce);
  }
  const stamping =
    stampNonce !== undefined && stampNonce !== consumedStampNonce && !reduced;
  const texture = signTextureFor(regionId);
  const motif = signMotifFor(levelId);
  const crop = texture.bounds;
  return (
    <span
      ref={ref}
      className="garden-node-label"
      aria-hidden="true"
      data-sign-theme={regionId}
      data-motion={visible ? 'on' : 'off'}
      data-revealing={revealNonce !== undefined}
      data-stamping={stamping}
      style={
        {
          '--sign-breathe-ms': `${signMotion.breatheMs}ms`,
          '--sign-sweep-ms': `${signMotion.sweepMs}ms`,
          '--sign-stamp-ms': `${signMotion.stampMs}ms`,
        } as CSSProperties
      }
      onAnimationEnd={(event) => {
        if (
          event.animationName === 'garden-sign-sweep' &&
          revealNonce !== undefined
        )
          onRevealEnd(revealNonce);
        if (
          event.animationName === 'garden-sign-stamp' &&
          stampNonce !== undefined
        )
          setConsumedStampNonce(stampNonce);
      }}
    >
      <span className="garden-sign-surface">
        <img
          className="garden-sign-texture"
          src={texture.image}
          alt=""
          draggable={false}
          style={{
            width: `${(texture.width / crop.width) * 100}%`,
            height: `${(texture.height / crop.height) * 100}%`,
            left: `${(-crop.left / crop.width) * 100}%`,
            top: `${(-crop.top / crop.height) * 100}%`,
          }}
        />
      </span>
      <strong className="garden-node-title">{title}</strong>
      {motif && (
        <img
          className="garden-sign-motif"
          src={motif}
          alt=""
          draggable={false}
        />
      )}
      {status === 'complete' && (
        <img
          className="garden-sign-stamp"
          key={stampNonce ?? 'completed'}
          src={signStamp}
          alt=""
          draggable={false}
        />
      )}
      <span className="garden-sign-rim" />
      {revealNonce !== undefined && (
        <span className="garden-sign-sweep-clip" key={revealNonce}>
          <span className="garden-sign-sweep" />
        </span>
      )}
    </span>
  );
}
