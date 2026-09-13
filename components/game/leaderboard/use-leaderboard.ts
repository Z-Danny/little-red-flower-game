'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { levels } from '@/app/game/levels';
import { BOARD_STORAGE_KEY, createLocalLeaderboard } from '@/app/game/leaderboard/local-provider';
import type { BoardSnapshot, LeaderboardProvider, ProfileInput } from '@/app/game/leaderboard/model';
import {canEnter} from '@/app/game/journey/progress';

/** Composition root. Inject a different provider here; players and game engines stay unchanged. */
function browserProvider(): LeaderboardProvider {
  return createLocalLeaderboard({
    caps: Object.fromEntries(levels.filter(level => level.playable).map(level => [level.id, 3])),
    storage: () => window.localStorage,
    canEnter,
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
  const currentPlayerId = snapshot?.current.id;

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
    claimCompletion:useCallback(async(id:string,playerId:string)=>{
      let receipt:import('@/app/game/leaderboard/model').CompletionReceipt|undefined;
      const ok=await run(async()=>{const result=await provider.claimCompletion(id,playerId);receipt=result.receipt;return result.snapshot;});
      return ok?receipt:undefined;
    },[provider,run]),
    refresh: useCallback(() => run(() => provider.read()), [provider, run]),
    recordResult: useCallback((id: string, flowers: number, playerId: string) => { void run(() => provider.recordResult(id, flowers, playerId)); }, [provider, run]),
    createPlayer: (profile: ProfileInput) => run(() => provider.createPlayer(profile)),
    updateProfile: (profile: ProfileInput) => run(() => provider.updateProfile(profile)),
    switchPlayer: (id: string) => run(() => provider.switchPlayer(id)),
    resetProgress: useCallback(() => run(() => provider.resetCurrentProgress(currentPlayerId)), [provider, run, currentPlayerId]),
  };
}

export type LeaderboardController = ReturnType<typeof useLeaderboard>;
