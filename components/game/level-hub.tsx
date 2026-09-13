'use client';
import { useState } from 'react';
import type { Planting } from '@/app/game/journey/progress';
import { useMapJourney } from './journey/use-map-journey';
import { MapScene } from './journey/map-scene';
import { MapChrome } from './journey/map-chrome';
import { LevelEntry } from './journey/level-entry';
import { JourneyArchive } from './journey/archive';
import { CategoryNotice } from './journey/category-notice';
import type { JourneyCategory } from '@/app/game/journey/categories';
type Props = {
  completed: Record<string, number>;
  onStart: (id: string) => void;
  onReset: () => void;
  onLeaderboard: () => void;
  playerName: string;
  planting: Planting | null;
  onPlanted: () => void;
  focusId: string | null;
  muted: boolean;
  onMute: () => void;
  onHome: () => void;
  onVisit: (id: string) => void;
};
/** Composition only: assets/copy, progression, animation and dialogs have separate modules. */
export function LevelHub(props: Props) {
  const {
    completed,
    planting,
    onStart,
    onReset,
    onLeaderboard,
    playerName,
    muted,
    onMute,
  } = props;
  const [inspect, setInspect] = useState<string | null>(null),
    [archive, setArchive] = useState(false);
  const [pendingCategory, setPendingCategory] =
    useState<JourneyCategory | null>(null);
  const view = useMapJourney(props);
  return (
    <section
      className="garden-shell"
      data-journey-map
      data-region={view.region.id}
      data-planting={planting?.levelId ?? ''}
      data-plant-age={Math.round(view.age)}
    >
      <MapScene
        {...view}
        planting={planting}
        onInspect={(id) => {
          props.onVisit(id);
          setInspect(id);
        }}
      />
      <MapChrome
        {...view}
        completed={completed}
        planting={planting}
        muted={muted}
        onMute={onMute}
        onHome={props.onHome}
        onLeaderboard={onLeaderboard}
        onArchive={() => setArchive(true)}
        onPendingCategory={setPendingCategory}
      />
      <LevelEntry
        inspect={inspect}
        setInspect={setInspect}
        completed={completed}
        onStart={onStart}
      />
      <CategoryNotice
        category={pendingCategory}
        onClose={() => setPendingCategory(null)}
      />
      <JourneyArchive
        archive={archive}
        setArchive={setArchive}
        playerName={playerName}
        completed={completed}
        onLeaderboard={onLeaderboard}
        onReset={onReset}
      />
    </section>
  );
}
