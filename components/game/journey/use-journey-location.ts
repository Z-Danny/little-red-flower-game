'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  JOURNEY_LOCATION_KEY,
  parseLocations,
  type JourneyLocations,
} from '@/app/game/journey/resume';
export function useJourneyLocation(playerId?: string) {
  const cache = useRef<JourneyLocations>(Object.create(null));
  const sessionOnly = useRef(false);
  const [locations, setLocations] = useState<JourneyLocations>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    const readStored = () => {
      if (sessionOnly.current) return;
      try {
        cache.current = parseLocations(
          localStorage.getItem(JOURNEY_LOCATION_KEY),
        );
        setLocations(cache.current);
      } catch {
        // Retain this page's bookmarks if storage becomes unavailable.
        sessionOnly.current = true;
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === JOURNEY_LOCATION_KEY || event.key === null)
        readStored();
    };
    window.addEventListener('storage', onStorage);
    queueMicrotask(() => {
      if (!mounted) return;
      readStored();
      setReady(true);
    });
    return () => {
      mounted = false;
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const remember = useCallback(
    (levelId: string) => {
      if (!playerId) return;
      // Re-read to retain other players' bookmarks written by another open tab.
      let stored: JourneyLocations = {};
      if (!sessionOnly.current) {
        try {
          stored = parseLocations(localStorage.getItem(JOURNEY_LOCATION_KEY));
        } catch {
          sessionOnly.current = true;
        }
      }
      const next = {
        // A successful read is authoritative, including deletions in other tabs.
        ...(sessionOnly.current ? cache.current : stored),
        [playerId]: { levelId, visitedAt: Date.now() },
      };
      cache.current = next;
      setLocations(next);
      if (!sessionOnly.current) {
        try {
          localStorage.setItem(JOURNEY_LOCATION_KEY, JSON.stringify(next));
        } catch {
          sessionOnly.current = true;
        }
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
