export type LevelKind = 'prevention' | 'response';
export type SceneRoom = 'living' | 'kitchen' | 'aid';

export type IconKey =
  | 'plant' | 'window' | 'shirt' | 'plug' | 'cabinet' | 'heater'
  | 'flame' | 'curtain' | 'flashlight' | 'sandbag' | 'radio'
  | 'lid' | 'gas' | 'person' | 'water' | 'cloth' | 'extinguisher'
  | 'spark' | 'phone' | 'hand' | 'ring' | 'gauze' | 'toothpaste'
  | 'exit' | 'sink';

export type Point = { x: number; y: number };

export type TreatmentKind =
  | 'carry-in' | 'close-window' | 'retract-rail' | 'unplug' | 'secure-cabinet' | 'lift-cushion';

export type TreatmentSpec = {
  kind: TreatmentKind;
  caption: string;
  durationMs: number;
  repairClip?: { top: number; right: number; bottom: number; left: number };
  silhouetteZoom?: number;
  safePosition?: Point;
  persistRepair?: boolean;
};

export type RiskCue = { threshold: number; text: string; tone?: 'neutral' | 'danger' };

export type FindObjective = {
  id: string;
  label: string;
  icon: IconKey;
  position: Point;
  resolvedText: string;
  requires?: string[];
  blockedText?: string;
  size?: number;
  hintText?: string;
  treatment?: TreatmentSpec;
  riskCue?: RiskCue;
};

export type DropZone = { id: string; label: string; icon: IconKey; position: Point };
export type DragItem = { id: string; label: string; icon: IconKey; tone?: 'safe' | 'danger' | 'neutral' };

export type ResponseAction = {
  itemId: string;
  zoneId: string;
  outcome: 'correct' | 'danger' | 'neutral';
  feedback: string;
  goalId?: string;
  requires?: string[];
  blockedText?: string;
};

export type LevelConfig = {
  engine?: 'typhoon-v2' | 'kitchen-v1' | 'configured-v1' | 'scene-hunt' | 'disaster-v1';
  id: string; order: number; kind: LevelKind; title: string; shortTitle: string; location: string;
  knowledge: string; task: string; briefing: string; duration: string; riskSeconds: number; accent: string;
  sceneRoom: SceneRoom; sceneMood: 'storm' | 'fire' | 'smoke' | 'calm'; goals: string[];
  previewImage?: string; safeImage?: string; playable?: boolean;
  objectives?: FindObjective[]; zones?: DropZone[]; items?: DragItem[]; actions?: ResponseAction[];
};

export type Feedback = { type: 'success' | 'danger' | 'neutral'; text: string; nonce: number };
