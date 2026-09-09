/** Versioned, data-only contract. No image filename is a gameplay identifier. */
export type Point = { x: number; y: number };
export type Box = Point & { w: number; h: number };
export type Emotion = 'worried' | 'panicked' | 'focused' | 'relieved';
export type Condition = { all?: string[]; any?: string[]; not?: string[]; emotion?: Emotion; riskAtLeast?: number };
export type ObjectSpec = { id: string; label: string; input: 'tap' | 'drag' | 'none'; requires?: string[]; disabledWhen?: string[] };
export type Interaction = {
  id: string; source: string; mode: 'tap' | 'drop'; target?: string;
  requires?: string[]; unless?: string[]; grants: string[];
  outcome: 'correct' | 'danger' | 'neutral'; animation: string;
  riskDelta?: number; feedback?: string;
};
export type Rules = {
  schemaVersion: 1; id: string; kind: 'prevention' | 'response'; title: string;
  order: number; location: string; description: string; safety: string; briefing?: string;
  objects: ObjectSpec[]; goals: { id: string; label: string; object: string; showTarget?: boolean }[];
  interactions: Interaction[];
  risk: { mode?: 'risk' | 'elapsed'; seconds: number; initial: number; warningAt: number; peakFeedback: string };
  completion: { requires: string[]; settleMs: number; summary: string; title?: string; status?: string };
};
export type Pose = Box & { asset: string; depth: number; rotation?: number; opacity?: number; pivot?: Point; blockInput?: boolean };
export type Keyframe = Partial<Omit<Pose, 'asset' | 'depth' | 'pivot' | 'blockInput'>> & { at: number; asset?: string };
export type Motion = { durationMs: number; tracks: { object: string; fromDrop?: boolean; keyframes: Keyframe[] }[] };
export type Skin = {
  schemaVersion: 1; id: string; world: { width: number; height: number };
  assets: Record<string, { src: string; alpha: boolean }>;
  background: string; poses: Record<string, Pose>; zones: Record<string, Box>;
  states: { object: string; when: Condition; pose: Partial<Pose> }[];
  animations: Record<string, Motion>;
  effects: { object: string; kind: 'fire' | 'wobble'; until: string[] }[];
  /** Text belongs to actual in-world panels/signs; never a second task HUD. */
  labels?: { object: string; text: string; x: number; y: number; size: number; color: string; background?: string; when?: Condition }[];
  /** Only shown while carrying/selecting an object; keys reference zones. */
  zoneLabels?: Record<string, string>;
};
export type LevelPackage = { rules: Rules; skin: Skin };
export type Notice = { text: string; remaining: number };
export type Run = {
  phase: 'playing' | 'settling' | 'complete'; resolved: string[];
  action: { rule: string | null; source: string; age: number; duration: number; point?: Point } | null;
  elapsed: number; risk: number; mistakes: number; peakSeen: boolean; settleAge: number;
  reaction: Emotion | null; reactionMs: number; boost: number; notice: Notice | null; stars: number;
};
export type Input = { source: string; mode: 'tap' | 'drop'; target?: string; point?: Point };
export type Event = { type: 'reset' } | { type: 'hint' } | { type: 'tick'; ms: number } | { type: 'interact'; input: Input };
