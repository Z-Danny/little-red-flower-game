'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PlantingSoundStage } from './journey/reward-sound';
import type { Planting } from '@/app/game/journey/progress';
import { useMapJourney } from './journey/use-map-journey';
import { MapScene } from './journey/map-scene';
import { MapChrome } from './journey/map-chrome';
import { LevelEntry } from './journey/level-entry';
import { JourneySettings } from './journey/settings';
import { Archipelago } from './journey/archipelago';
import {
  islandForLevel,
  type ArchipelagoSound,
} from '@/app/game/journey/archipelago';

type Props = {
  /** Paint the destination beneath the departing cover without accepting input. */
  entering?: boolean;
  initialIslandPage?: 'islands' | 'levels';
  completed: Record<string, number>;
  allLevelsUnlocked?: boolean;
  onStart: (id: string) => void;
  onReset: () => void;
  onManageSave?: () => void;
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
  const [archipelagoOpen, setArchipelagoOpen] = useState(!planting);
  const layer = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const wasPlanting = useRef(!!planting);
  useEffect(() => {
    if (wasPlanting.current && !planting) setArchipelagoOpen(true);
    wasPlanting.current = !!planting;
  }, [planting]);
  const view = useMapJourney(props);
  const [categoryId, setCategoryId] = useState(() => islandForLevel(props.focusId ?? view.current?.id ?? '')?.id ?? 'emergency');
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
      data-map-entering={props.entering || undefined}
      inert={props.entering || undefined}
      aria-hidden={props.entering || undefined}
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
          allLevelsUnlocked={props.allLevelsUnlocked}
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
            onManageSave={()=>{setSettings(false);props.onManageSave?.();}}
            navigationLocked={!!planting}
          />
        )}
      </div>
      <LevelEntry
        inspect={inspect}
        setInspect={setInspect}
        completed={completed}
        allLevelsUnlocked={props.allLevelsUnlocked}
        onStart={onStart}
      />
      {archipelagoOpen && (
        <Archipelago
          currentCategoryId={categoryId}
          initialShowLevels={props.initialIslandPage === 'levels'}
          obscured={!!inspect || !!props.entering}
          completed={completed}
          allLevelsUnlocked={props.allLevelsUnlocked}
          onBack={props.onHome}
          onSound={props.onArchipelagoSound}
          onSelect={(levelId) => {
            setCategoryId(islandForLevel(levelId)?.id ?? 'emergency');
            view.focus(levelId, false, 0.78);
            setInspect(levelId);
          }}
        />
      )}
    </section>
  );
}
