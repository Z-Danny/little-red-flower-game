/* oxlint-disable next/no-img-element -- Optional local sprite is embedded offline. */
import { useState, type CSSProperties, type PointerEvent } from 'react';
import { signalFor, sceneAtPoint } from '@/app/game/journey/signals';
import {
  nodeFor,
  regionFor,
  type NodeStatus,
  type Region,
} from '@/app/game/journey/progress';
import { useVisibleMotion } from './use-visible-motion';
import { SceneEffect } from './scene-effect';
/** Buildings respond to the pointer without an invisible button blocking map scrolling. */
export function useSceneHover(region: Region, paused: boolean) {
  const [activeId, setActiveId] = useState<string | null>(null);
  return {
    activeId: paused ? null : activeId,
    sceneHandlers: {
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== 'mouse' || paused) return;
        const button = (event.target as Element).closest<HTMLElement>(
          '[data-map-node]',
        );
        if (button) {
          setActiveId(button.dataset.mapNode ?? null);
          return;
        }
        const box = event.currentTarget.getBoundingClientRect();
        setActiveId(
          sceneAtPoint(
            region.nodes.map((n) => n.id),
            ((event.clientX - box.left) / box.width) * region.width,
            ((event.clientY - box.top) / box.height) * region.height,
          ),
        );
      },
      onPointerLeave: () => setActiveId(null),
    },
  };
}
export function useSignalPress() {
  const [pressedId, setPressedId] = useState<string | null>(null);
  const clear = () => setPressedId(null);
  return {
    pressedId,
    pressHandlers: (id: string) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType !== 'mouse') setPressedId(id);
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onLostPointerCapture: clear,
      onBlur: clear,
    }),
  };
}
/** Transparent scene overlays; no replacement buttons, game rules or save access. */
export function MapSignal({
  levelId,
  status,
  paused = false,
}: {
  levelId: string;
  status: NodeStatus;
  paused?: boolean;
}) {
  const config = signalFor(levelId),
    node = nodeFor(levelId),
    region = regionFor(levelId);
  const { ref, visible } = useVisibleMotion();
  if (!config || !node || !region) return null;
  const unit = 100 / region.width;
  return (
    <span
      ref={ref}
      className="map-signal"
      aria-hidden="true"
      data-signal={config.preset}
      data-effect={config.effect}
      data-state={status}
      data-motion={visible && !paused ? 'on' : 'off'}
      style={
        {
          '--fx-x': `${(config.anchor.x - node.x) * unit}cqw`,
          '--fx-y': `${((config.anchor.y - node.y) * 100) / region.height}cqh`,
          '--fx-width': `${config.width * unit}cqw`,
          '--fx-height': `${(config.height * 100) / region.height}cqh`,
          '--fx-color': config.color,
          '--fx-seconds': `${config.seconds}s`,
          '--fx-rest': config.restOpacity,
        } as CSSProperties
      }
    >
      <SceneEffect
        kind={config.effect}
        particles={config.particles}
        image={config.image}
        motion={config.motion}
      />
    </span>
  );
}
