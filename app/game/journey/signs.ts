import data from '@/content/journey-signs.json';

/** Original approved artwork and the visible face inside its transparent canvas. */
export type SignTexture = {
  image: string;
  width: number;
  height: number;
  bounds: { left: number; top: number; width: number; height: number };
};

export type SignMotion = {
  breatheMs: number;
  sweepMs: number;
  budResponseMs: number;
  stampMs: number;
};

type SignConfig = {
  version: number;
  regions: Record<string, SignTexture>;
  motifs: Record<string, string>;
  completedStamp: string;
  motion: SignMotion;
};

// Presentation only. Progress, unlock prerequisites and saved level IDs stay elsewhere.
const signConfig: SignConfig = data;

export function signTextureFor(regionId: string): SignTexture {
  return signConfig.regions[regionId] ?? signConfig.regions.nature;
}

export function signMotifFor(levelId: string): string | undefined {
  return signConfig.motifs[levelId];
}

export const signStamp: string = signConfig.completedStamp;
export const signMotion: SignMotion = signConfig.motion;
