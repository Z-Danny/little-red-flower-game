/* oxlint-disable next/no-img-element -- Raw local images are embedded as data URLs in the standalone offline build. */
import type { CSSProperties, RefObject } from 'react';
import { LockKeyhole } from 'lucide-react';
import { getLevel } from '@/app/game/levels';
import { journeyFog, journeySkin } from '@/app/game/journey/presentation';
import { routeFor } from '@/app/game/journey/routes';
import { Flower } from './flower';
import { MapSignal, useSignalPress, useSceneHover } from './map-signal';
import { useHudSafeSigns } from './use-hud-safe-signs';
import { MapSign } from './map-sign';
import { useSignCelebration } from './use-sign-celebration';
import { signMotion } from '@/app/game/journey/signs';
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
  scroller,
  world,
  onInspect,
}: Props) {
  const { pressedId, pressHandlers } = useSignalPress();
  const { activeId, sceneHandlers } = useSceneHover(region, !!planting);
  const signOffsets = useHudSafeSigns(scroller, world, region.id);
  const { reveal, finishReveal } = useSignCelebration(
    region,
    progress,
    planting,
    age,
  );
  const fog = journeyFog[region.id];
  // A replacement map must supply its own scenery bounds.
  const fogAreas =
    fog?.image === region.image &&
    fog.width === region.width &&
    fog.height === region.height
      ? fog.areas
      : {};
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
        >
          {region.nodes.map((node) => {
            const area = fogAreas[node.id];
            if (nodeStatus(node.id, progress) !== 'locked' || !area)
              return null;
            return (
              <div
                key={node.id}
                className="garden-location-fog"
                data-fog-node={node.id}
                aria-hidden="true"
                style={{
                  left: `${(area.x / region.width) * 100}%`,
                  top: `${(area.y / region.height) * 100}%`,
                  width: `${(area.width / region.width) * 100}%`,
                  height: `${(area.height / region.height) * 100}%`,
                }}
              />
            );
          })}
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
              route = routeFor(region, prev, n);
            return (
              <g
                key={n.id}
                data-route-from={prev.id}
                data-route-to={n.id}
                data-route-source={route.source}
              >
                <path d={route.d} className="garden-path-bed" />
                <path
                  d={route.d}
                  className={`garden-path ${live ? 'connected' : ''}`}
                />
              </g>
            );
          })}
        </svg>
        {region.nodes.map((n, i) => {
          const signLayout = signOffsets.get(n.id);
          const state = nodeStatus(n.id, progress),
            plant = planting?.levelId === n.id,
            title = getLevel(n.id)?.title,
            signSide =
              signLayout?.side ??
              n.signSide ??
              (n.x <= region.width / 2 ? 'right' : 'left'),
            flower =
              state === 'complete' || (plant && age >= journeyTiming.land);
          const revealing = reveal?.levelId === n.id;
          const signAdjusted =
            !!signLayout &&
            (signLayout.offsetX !== 0 || signLayout.offsetY !== 0);
          return (
            <button
              key={n.id}
              data-map-node={n.id}
              data-status={state}
              data-sign-side={signSide}
              data-sign-adjusted={signAdjusted}
              data-hud-avoiding={signOffsets.has(n.id)}
              data-pressed={pressedId === n.id}
              data-scene-active={activeId === n.id}
              {...pressHandlers(n.id)}
              aria-label={`${title}，${state === 'complete' ? '已完成' : state === 'available' ? '可进入' : '未解锁'}`}
              aria-disabled={!!planting}
              className={`garden-node ${state} ${plant ? 'planting' : ''}`}
              style={
                {
                  left: `${(n.x / region.width) * 100}%`,
                  top: `${(n.y / region.height) * 100}%`,
                  '--sign-room': `${((signSide === 'left' ? n.x : region.width - n.x) / region.width) * 100}cqw`,
                  '--sign-offset-x': `${signLayout?.offsetX ?? 0}px`,
                  '--sign-offset-y': `${signLayout?.offsetY ?? 0}px`,
                  '--sign-width': signLayout
                    ? `${signLayout.width}px`
                    : undefined,
                  '--sign-bud-ms': `${signMotion.budResponseMs}ms`,
                } as CSSProperties
              }
              onClick={() => {
                if (!planting) onInspect(n.id);
              }}
            >
              {signAdjusted && (
                <svg
                  className="garden-sign-connector"
                  viewBox="0 0 56 56"
                  aria-hidden="true"
                >
                  <path
                    d={`M28 40 L${(signSide === 'right' ? 58 : -2) + signLayout.offsetX} ${28 + signLayout.offsetY}`}
                    className="garden-sign-connector-edge"
                  />
                  <path
                    d={`M28 40 L${(signSide === 'right' ? 58 : -2) + signLayout.offsetX} ${28 + signLayout.offsetY}`}
                  />
                </svg>
              )}
              <MapSignal levelId={n.id} status={state} paused={!!planting} />
              <MapSign
                levelId={n.id}
                regionId={region.id}
                title={title ?? ''}
                status={state}
                revealNonce={revealing ? reveal.nonce : undefined}
                stampNonce={
                  !!plant &&
                  state === 'complete' &&
                  nodeStatus(n.id, planting.before) !== 'complete'
                    ? planting.nonce
                    : undefined
                }
                onRevealEnd={finishReveal}
              />
              <span
                className={`garden-node-bed${revealing ? ' sign-unlock-bud' : ''}`}
              >
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
                  {String(i + 1).padStart(2, '0')}
                </span>
              </span>
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
