'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { levels } from '@/app/game/levels';
import { BOARD_STORAGE_KEY, createLocalLeaderboard } from '@/app/game/leaderboard/local-provider';
import type { BoardSnapshot, LeaderboardProvider, ProfileInput } from '@/app/game/leaderboard/model';

/** Composition root. Inject a different provider here; players and game engines stay unchanged. */
function browserProvider(): LeaderboardProvider {
  return createLocalLeaderboard({
    caps: Object.fromEntries(levels.filter(level => level.playable).map(level => [level.id, 3])),
    storage: () => window.localStorage,
    id: () => crypto.randomUUID(),
    listen(callback) {
      const onStorage = (event: StorageEvent) => { if (event.key === BOARD_STORAGE_KEY || event.key === null) callback(); };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
  });
}

export function useLeaderboard(provided?: LeaderboardProvider) {
  const [provider] = useState(() => provided ?? browserProvider());
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const pending = useRef(0);
  const alive = useRef(false);

  const run = useCallback(async (action: () => Promise<BoardSnapshot>) => {
    const request = ++sequence.current;
    pending.current++;
    setBusy(true);
    setError('');
    try {
      const next = await action();
      if (alive.current && request === sequence.current) setSnapshot(next);
      return true;
    } catch (cause) {
      if (alive.current && request === sequence.current) setError(cause instanceof Error ? cause.message : '排行榜暂时不可用，请重试。');
      return false;
    } finally {
      pending.current--;
      if (alive.current) setBusy(pending.current > 0);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void run(() => provider.read());
    const unsubscribe = provider.subscribe?.(() => { void run(() => provider.read()); });
    return () => { alive.current = false; sequence.current++; unsubscribe?.(); };
  }, [provider, run]);

  return {
    snapshot, error, busy,
    refresh: useCallback(() => run(() => provider.read()), [provider, run]),
    recordResult: useCallback((id: string, flowers: number, playerId: string) => { void run(() => provider.recordResult(id, flowers, playerId)); }, [provider, run]),
    createPlayer: (profile: ProfileInput) => run(() => provider.createPlayer(profile)),
    updateProfile: (profile: ProfileInput) => run(() => provider.updateProfile(profile)),
    switchPlayer: (id: string) => run(() => provider.switchPlayer(id)),
    resetProgress: useCallback(() => { void run(() => provider.resetCurrentProgress()); }, [provider, run]),
  };
}

export type LeaderboardController = ReturnType<typeof useLeaderboard>;
