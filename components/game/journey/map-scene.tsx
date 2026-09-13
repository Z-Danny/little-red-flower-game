/* oxlint-disable next/no-img-element -- Raw local images are embedded as data URLs in the standalone offline build. */
import type { CSSProperties, RefObject } from 'react';
import { Check, LockKeyhole } from 'lucide-react';
import { getLevel } from '@/app/game/levels';
import { journeySkin } from '@/app/game/journey/presentation';
import { Flower } from './flower';
import { MapSignal, useSignalPress, useSceneHover } from './map-signal';
import {
  nodeStatus,
  journeyTiming,
  type Region,
  type Progress,
  type Planting,
  type MapNode,
} from '@/app/game/journey/progress';
type Props = {
  region: Region;
  progress: Progress;
  planting: Planting | null;
  age: number;
  done: number;
  ratio: number;
  current?: MapNode;
  scroller: RefObject<HTMLDivElement | null>;
  world: RefObject<HTMLDivElement | null>;
  onInspect: (id: string) => void;
};
export function MapScene({
  region,
  progress,
  planting,
  age,
  done,
  ratio,
  current,
  scroller,
  world,
  onInspect,
}: Props) {
  const { pressedId, pressHandlers } = useSignalPress();
  const { activeId, sceneHandlers } = useSceneHover(region, !!planting);
  return (
    <div
      className="garden-scroll"
      ref={scroller}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to focus and scroll this scene map.
      tabIndex={0}
      aria-label={`${region.name}场景地图，可上下探索`}
      style={{ overflowY: planting ? 'hidden' : 'auto' }}
    >
      <div
        className="garden-world"
        {...sceneHandlers}
        ref={world}
        key={region.id}
        style={{
          aspectRatio: `${region.width}/${region.height}`,
        }}
      >
        <img
          className="garden-map-art"
          src={region.image}
          alt={`${region.short}：小路连接的场景地图`}
          draggable={false}
        />
        <div
          className="garden-region"
          data-region={region.id}
          data-restoration={
            done === 0
              ? 'dormant'
              : done === region.nodes.length
                ? 'restored'
                : 'growing'
          }
          style={{ '--recovery': ratio } as CSSProperties}
        >
          <div className="garden-atmosphere" />
          {region.restoration.flowers
            .slice(0, Math.floor(ratio * region.restoration.flowers.length))
            .map((p, i) => (
              <span
                key={i}
                className="garden-road-flowers"
                style={{
                  left: `${(p.x / region.width) * 100}%`,
                  top: `${(p.y / region.height) * 100}%`,
                }}
                aria-hidden="true"
              >
                <Flower variant="restorationFlower" />
              </span>
            ))}
          {done > 0 &&
            region.restoration.lights
              .slice(0, Math.ceil(ratio * region.restoration.lights.length))
              .map((p, i) => (
                <span
                  key={i}
                  className="garden-warm-light"
                  style={{
                    left: `${(p.x / region.width) * 100}%`,
                    top: `${(p.y / region.height) * 100}%`,
                  }}
                />
              ))}
        </div>
        <svg
          className="garden-paths"
          viewBox={`0 0 ${region.width} ${region.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {region.nodes.slice(1).map((n, i) => {
            const prev = region.nodes[i],
              live = nodeStatus(n.id, progress) !== 'locked',
              d = `M${prev.x} ${prev.y} C${prev.x} ${(prev.y + n.y) / 2},${n.x} ${(prev.y + n.y) / 2},${n.x} ${n.y}`;
            return (
              <g key={n.id}>
                <path d={d} className="garden-path-bed" />
                <path
                  d={d}
                  className={`garden-path ${live ? 'connected' : ''}`}
                />
              </g>
            );
          })}
        </svg>
        {region.nodes.map((n, i) => {
          const state = nodeStatus(n.id, progress),
            plant = planting?.levelId === n.id,
            flower =
              state === 'complete' || (plant && age >= journeyTiming.land);
          return (
            <button
              key={n.id}
              data-map-node={n.id}
              data-status={state}
              data-pressed={pressedId === n.id}
              data-scene-active={activeId === n.id}
              {...pressHandlers(n.id)}
              aria-label={`${getLevel(n.id)?.title}，${state === 'complete' ? '已完成' : state === 'available' ? '可进入' : '未解锁'}`}
              aria-disabled={!!planting}
              className={`garden-node ${state} ${plant ? 'planting' : ''}`}
              style={{
                left: `${(n.x / region.width) * 100}%`,
                top: `${(n.y / region.height) * 100}%`,
              }}
              onClick={() => {
                if (!planting) onInspect(n.id);
              }}
            >
              {state === 'locked' && <span className="garden-node-fog" />}
              <MapSignal levelId={n.id} status={state} paused={!!planting} />
              {state === 'complete' && (
                <span className="garden-scene-replay">情景回顾 · 已种花</span>
              )}
              {current?.id === n.id && !planting && (
                <span className="garden-next-flag">↑ 出发</span>
              )}
              <span className="garden-node-bed">
                {flower ? (
                  <Flower className={plant ? 'new-flower' : ''} />
                ) : state === 'locked' ? (
                  journeySkin.locked ? (
                    <img
                      className="garden-node-custom"
                      src={journeySkin.locked}
                      alt=""
                    />
                  ) : (
                    <span className="garden-locked-stone">
                      {journeySkin.bud && (
                        <img
                          className="garden-node-custom"
                          src={journeySkin.bud}
                          alt=""
                        />
                      )}
                      <LockKeyhole />
                    </span>
                  )
                ) : journeySkin.bud ? (
                  <img
                    className="garden-node-custom"
                    src={journeySkin.bud}
                    alt=""
                  />
                ) : (
                  <span className="garden-bud">
                    <i />
                    <b />
                    <em />
                  </span>
                )}
                <span className="garden-node-number">
                  {state === 'complete' ||
                  (plant && age >= journeyTiming.bloom) ? (
                    <Check />
                  ) : (
                    String(i + 1).padStart(2, '0')
                  )}
                </span>
              </span>
              <strong className="garden-node-label">
                {getLevel(n.id)?.title}
              </strong>
              {plant &&
                age < 1000 &&
                [0, 1, 2].map((k) => (
                  <span
                    key={k}
                    className="garden-flying-flower"
                    style={{ '--i': k } as CSSProperties}
                  >
                    <Flower />
                  </span>
                ))}
              {plant && age >= journeyTiming.bloom && age < 2200 && (
                <span className="garden-petals" aria-hidden="true">
                  · ✧ ·
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
