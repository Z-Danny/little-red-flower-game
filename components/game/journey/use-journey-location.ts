'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  JOURNEY_LOCATION_KEY,
  parseLocations,
  type JourneyLocations,
} from '@/app/game/journey/resume';
export function useJourneyLocation(playerId?: string) {
  const cache = useRef<JourneyLocations>(Object.create(null));
  const [locations, setLocations] = useState<JourneyLocations>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      cache.current = parseLocations(
        localStorage.getItem(JOURNEY_LOCATION_KEY),
      );
    } catch {
      /* session-only navigation */
    }
    setLocations(cache.current);
    setReady(true);
  }, []);
  const remember = useCallback(
    (levelId: string) => {
      if (!playerId) return;
      // Re-read to retain other players' bookmarks written by another open tab.
      let stored: JourneyLocations = {};
      try {
        stored = parseLocations(localStorage.getItem(JOURNEY_LOCATION_KEY));
      } catch {
        /* use in-memory bookmark */
      }
      const next = {
        ...cache.current,
        ...stored,
        [playerId]: { levelId, visitedAt: Date.now() },
      };
      cache.current = next;
      setLocations(next);
      try {
        localStorage.setItem(JOURNEY_LOCATION_KEY, JSON.stringify(next));
      } catch {
        /* gameplay remains available */
      }
    },
    [playerId],
  );
  return {
    ready,
    location:
      playerId && Object.hasOwn(locations, playerId)
        ? locations[playerId]
        : undefined,
    remember,
  };
}
