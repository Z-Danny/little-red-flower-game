/** Versioned, data-only contract. No image filename is a gameplay identifier. */
import type { CueProfile } from '../response/audio-cues';
import type { SceneFraming } from '../display/camera';
export type Point = { x: number; y: number };
export type Box = Point & { w: number; h: number };
export type Emotion = 'worried' | 'panicked' | 'focused' | 'relieved';
export type Condition = { all?: string[]; any?: string[]; not?: string[]; stages?: string[]; notStages?: string[]; emotion?: Emotion; riskAtLeast?: number };
export type ObjectSpec = { id: string; label: string; input: 'tap' | 'drag' | 'both' | 'none'; requires?: string[]; disabledWhen?: string[]; stages?: string[] };
export type Interaction = {
  id: string; source: string; mode: 'tap' | 'drop'; target?: string;
  requires?: string[]; unless?: string[]; stages?: string[]; grants: string[];
  outcome: 'correct' | 'danger' | 'neutral'; animation: string;
  riskDelta?: number; feedback?: string; failure?: boolean;
  /** Safe early exit, not completion: no goals, score, or journey reward. */
  escape?: true;
};
export type Rules = {
  schemaVersion: 1; id: string; kind: 'prevention' | 'response'; title: string;
  order: number; location: string; description: string; safety: string; briefing?: string;
  objects: ObjectSpec[]; goals: { id: string; label: string; object: string; showTarget?: boolean }[];
  interactions: Interaction[];
  /** Monotone teaching time slices, never a real-world survival deadline. */
  stages?: { id: string; requires: string[]; afterMs: number; feedback?: string }[];
  risk: { mode?: 'risk' | 'elapsed'; timeout?: 'continue' | 'fail'; seconds: number; initial: number; warningAt: number; peakFeedback: string };
  completion: { requires: string[]; settleMs: number; observeMs?: number; fixedStars?: number; summary: string; title?: string; status?: string };
};
export type Pose = Box & { asset: string; depth: number; rotation?: number; opacity?: number; pivot?: Point; blockInput?: boolean };
export type Keyframe = Partial<Omit<Pose, 'asset' | 'depth' | 'pivot' | 'blockInput'>> & {
  at: number; asset?: string;
  /** Restore this action's state-composed home before applying explicit patches. */
  restoreHome?: true;
};
export type Motion = { durationMs: number; tracks: { object: string; fromDrop?: boolean; keyframes: Keyframe[] }[] };
export type Skin = {
  schemaVersion: 1; id: string; world: { width: number; height: number };
  /** Actual painted bounds may extend past the unchanged interaction coordinates. */
  framing?: SceneFraming;
  assets: Record<string, { src: string; alpha: boolean; frame?: Box; sceneBounds?: Box }>;
  background: string; poses: Record<string, Pose>; zones: Record<string, Box>;
  states: { object: string; when: Condition; pose: Partial<Pose> }[];
  animations: Record<string, Motion>;
  effects: { object: string; kind: 'fire' | 'wobble'; until: string[] }[];
  /** Text belongs to actual in-world panels/signs; never a second task HUD. */
  labels?: { object: string; text: string; x: number; y: number; size: number; color: string; align?: 'left' | 'center' | 'right'; background?: string; when?: Condition }[];
  /** Only shown while carrying/selecting an object; keys reference zones. */
  zoneLabels?: Record<string, string>;
  /** The same condition gates both the visible zone and drop matching. */
  zoneConditions?: Record<string, Condition>;
  /** Read-only presentation. No effect can award a goal or modify a timer. */
  presentation?: {
    durationMs: number;
    timer?: 'countdown';
    /** Lock immediately on fatal input, then show its authored non-interactive aftermath. */
    failureReveal?: true;
    roomSmoke?: import('./room-smoke').RoomSmokeSpec;
    effects: {
      kind: 'dust' | 'rain' | 'water' | 'smoke' | 'glow' | 'machine' | 'light' | 'alarm' | 'beam';
      box: Box; depth: number; color?: string; strength?: number; when?: Condition;
      /** Union of physical apertures in world coordinates, intersected with box. */
      clipPolygons?: Point[][];
      /** Follow the actually rendered scene, including an in-flight background swap. */
      whenScene?: { object: string; asset: string };
      beam?: import('./attached-beam').BeamAttachment; reductions?: { when: Condition; factor: number }[];
    }[];
    actors?: { object: string; amplitude: number; until?: string[]; performance?: {
      lean: number; periodMs: number;
      /** Same full-canvas framing and foot anchor in every frame; no pose resizing. */
      cycle?: { frames: string[]; periodMs: number; when?: Condition };
      cough?: { asset: string; w: number; h: number; everyMs: number; durationMs: number; until: string[] };
    } }[];
    audio?: { theme: 'quake' | 'outdoor' | 'collapse' | 'medical' | 'water' | 'flood' | 'lift' | 'electric' | 'fire'; cues: Record<string, string>; calmWhen?: string[]; ambientProfile?: 'flood-window'; emergency?: { alarm?: string; alarmUntil?: string[]; heartbeat?: string; cough?: string; coughUntil?: string[]; rescue?: string; rescueAfterMs?: number } };
  };
  /** Opt-in presentation adapter. Mechanics stay in level.json. */
  response?: { kind: 'fire'; actor: string; smokeOrigin: Point; smokeDepth: number; sealed?: string; sourceOff?: string; controlledBy: string[]; cues: CueProfile };
};
export type LevelPackage = { rules: Rules; skin: Skin };
export type Notice = { text: string; remaining: number };
export type Run = {
  phase: 'playing' | 'settling' | 'complete' | 'failed'; resolved: string[];
  /** Committed action times, used by opt-in continuous presentation only. */
  resolvedAt?: Record<string,number>;
  stages?: string[]; stageAges?: Record<string, number>;
  action: { rule: string | null; source: string; age: number; duration: number; point?: Point } | null;
  /** Presentation-only clock: gameplay time and goals are frozen after failure. */
  failure?: { rule: string; age: number; duration: number };
  /** Retain the safe exit's final pose without granting its unmet training goals. */
  escaped?: boolean; escapeRule?: string;
  elapsed: number; risk: number; mistakes: number; peakSeen: boolean; settleAge: number;
  reaction: Emotion | null; reactionMs: number; boost: number; notice: Notice | null; stars: number;
};
export type Input = { source: string; mode: 'tap' | 'drop'; target?: string; point?: Point };
export type Event = { type: 'reset' } | { type: 'hint' } | { type: 'miss' } | { type: 'tick'; ms: number; paused?: boolean } | { type: 'interact'; input: Input };
