import data from '@/content/journey-signals.json';
export type SceneEffectKind =
  | 'fire'
  | 'electric'
  | 'wind'
  | 'water'
  | 'quake'
  | 'rain'
  | 'storm'
  | 'exit'
  | 'lift'
  | 'well'
  | 'window'
  | 'heat'
  | 'smoke';
export type SignalLayout = {
  width: number;
  height: number;
  seconds: number;
  particles: number;
  restOpacity: number;
};
export type SignalPreset = Partial<SignalLayout> & {
  effect: SceneEffectKind;
  color: string;
  image?: string;
  motion?: string;
};
export type SignalEntry = Partial<SignalLayout> & {
  preset: string;
  label: string;
  anchor: { x: number; y: number };
  image?: string;
  motion?: string;
  hitArea?: { x: number; y: number; width: number; height: number };
};
export type SignalConfig = {
  version: number;
  defaults: SignalLayout;
  presets: Record<string, SignalPreset>;
  nodes: Record<string, SignalEntry>;
};
export const signalConfig = data as SignalConfig;
export function signalFor(id: string, config: SignalConfig = signalConfig) {
  const entry = config.nodes[id];
  if (!entry || !config.presets[entry.preset]) return undefined;
  return { ...config.defaults, ...config.presets[entry.preset], ...entry };
}
/** Map coordinates, independent of camera scale, progression and effect artwork. */
export function sceneAtPoint(
  ids: string[],
  x: number,
  y: number,
  config: SignalConfig = signalConfig,
) {
  return (
    ids.find((id) => {
      const area = signalFor(id, config)?.hitArea;
      return (
        area &&
        x >= area.x &&
        x <= area.x + area.width &&
        y >= area.y &&
        y <= area.y + area.height
      );
    }) ?? null
  );
}
