'use client';
import { createContext } from 'react';

export type LevelInterfaceSoundPolicy = { muted: boolean; volume: number };

/** Only the active player reports here; the map and result dialog remain siblings. */
export const LevelInterfaceSoundContext = createContext<((policy: LevelInterfaceSoundPolicy) => void) | null>(null);

export function selectInterfaceSoundPolicy(globalMuted: boolean, level: LevelInterfaceSoundPolicy, inLevelResult: boolean): LevelInterfaceSoundPolicy {
  return inLevelResult ? level : { muted: globalMuted, volume: 1 };
}
