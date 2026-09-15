'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import type { PlantingSoundStage } from './journey/reward-sound';
import type { Planting } from '@/app/game/journey/progress';
import { useMapJourney } from './journey/use-map-journey';
import { MapScene } from './journey/map-scene';
import { MapChrome } from './journey/map-chrome';
import { LevelEntry } from './journey/level-entry';
import { JourneySettings } from './journey/settings';
import { Archipelago } from './journey/archipelago';
import {
  archipelagoDestinationId,
  type ArchipelagoSound,
} from '@/app/game/journey/archipelago';
import { categoryForRegion } from '@/app/game/journey/categories';
type Props = {
  completed: Record<string, number>;
  onStart: (id: string) => void;
  onReset: () => void;
  onLeaderboard: () => void;
  playerName: string;
  planting: Planting | null;
  onPlanted: () => void;
  onPlantSound?: (stage: PlantingSoundStage) => void;
  onArchipelagoSound?: (cue: ArchipelagoSound) => void;
  focusId: string | null;
  muted: boolean;
  onMute: () => void;
  musicMuted: boolean;
  onMusicMute: () => void;
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
    muted,
    onMute,
  } = props;
  const [inspect, setInspect] = useState<string | null>(null),
    [settings, setSettings] = useState(false);
  const [archipelagoOpen, setArchipelagoOpen] = useState(false);
  const layer = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const view = useMapJourney(props);
  const categoryId = categoryForRegion(view.region.id)?.id ?? 'nature';
  useLayoutEffect(() => {
    if (wasOpen.current && !archipelagoOpen) {
      layer.current
        ?.querySelector<HTMLButtonElement>('[data-map-fan-toggle]')
        ?.focus({ preventScroll: true });
    }
    wasOpen.current = archipelagoOpen;
  }, [archipelagoOpen]);
  return (
    <section
      className="garden-shell"
      data-journey-map
      data-region={view.region.id}
      data-archipelago-open={archipelagoOpen}
      data-planting={planting?.levelId ?? ''}
      data-plant-age={Math.round(view.age)}
    >
      <div
        className="journey-map-layer"
        ref={layer}
        inert={archipelagoOpen}
        aria-hidden={archipelagoOpen || undefined}
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
          planting={planting}
          onHome={props.onHome}
          onArchive={onLeaderboard}
          onSettings={() => setSettings(true)}
          onOpenArchipelago={() => {
            if (planting) return;
            setInspect(null);
            setSettings(false);
            setArchipelagoOpen(true);
          }}
        />
        {settings && (
          <JourneySettings
            onClose={() => setSettings(false)}
            muted={muted}
            onMute={onMute}
            musicMuted={props.musicMuted}
            onMusicMute={props.onMusicMute}
            onReset={onReset}
            navigationLocked={!!planting}
          />
        )}
      </div>
      <LevelEntry
        inspect={inspect}
        setInspect={setInspect}
        completed={completed}
        onStart={onStart}
      />
      {archipelagoOpen && (
        <Archipelago
          currentCategoryId={categoryId}
          onBack={() => setArchipelagoOpen(false)}
          onSound={props.onArchipelagoSound}
          onSelect={(nextCategory) => {
            const destination = archipelagoDestinationId(
              nextCategory,
              completed,
            );
            if (!destination) return;
            if (nextCategory !== categoryId)
              view.focus(destination, false, 0.78);
            setArchipelagoOpen(false);
          }}
        />
      )}
    </section>
  );
}
