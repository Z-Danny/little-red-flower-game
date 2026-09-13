import profile from '@/content/response/kitchen-cues.json';
export type AudioFrame = {
  elapsed: number; active: boolean; intensity: number; flame: number; smoke: number; resolved: boolean; tier: number;
  action?: { id: string; kind: string; age: number; duration: number };
  milestones: string[];
  /** Optional scene-specific music tempo; all music stems share this rate. */
  tempo?: number;
};
export type Cue = { sound?: string; character?: string };
export type CueProfile = {
  /** Per-scene policy. False disables the character bus, not music, ambience or SFX. */
  characterEnabled?: boolean;
  opening?: string; rising?: string; critical?: string;
  actions: Record<string, Cue & { at: number }>;
  milestones: Record<string, Cue>;
  reactions?: { sound: string; urgentSound: string; intervalMs: number; urgentIntervalMs: number; minIntensity: number };
};
// Keep the legacy preset stable for templates/placement previews that import it.
export const kitchenCues: CueProfile = {
  opening: 'gasp', critical: 'gasp',
  actions: {
    cover: { at: .6, sound: 'fx-lid' }, shutoff: { at: .05, sound: 'fx-gas' },
    water: { at: .14, sound: 'fx-water', character: 'gasp' },
    cloth: { at: .14, sound: 'cloth', character: 'gasp' },
    spray: { at: .08, sound: 'spray' }, 'miss-spray': { at: .08, sound: 'spray' },
    bounce: { at: .15, sound: 'bounce' }, evacuate: { at: .08, sound: 'steps' },
  },
  milestones: { controlled: { character: 'relief' }, evacuated: { sound: 'success' } },
};
/** This level opts in explicitly; changing its cadence never changes other packs. */
export const kitchen50sCues: CueProfile = profile;
/** Dedupe at animation keyframes, not on React rerenders or repeated notices. */
export class CueTimeline {
  private started = false;
  private actions = new Set<string>();
  private milestones = new Set<string>();
  private tier = 0;
  private lastReactionAt = -Infinity;
  constructor(private profile: CueProfile = kitchenCues) {}
  reset() { this.started = false; this.actions.clear(); this.milestones.clear(); this.tier = 0; this.lastReactionAt = -Infinity; }
  advance(frame: AudioFrame): Cue[] {
    if (!frame.active) return [];
    const out: Cue[] = [];
    if (!this.started) { this.started = true; if (this.profile.opening) out.push({ character: this.profile.opening }); }
    const a = frame.action, cue = a && this.profile.actions[a.kind];
    if (a && cue && a.age >= a.duration * cue.at && !this.actions.has(a.id)) {
      this.actions.add(a.id); out.push(cue);
      if (this.actions.size > 64) this.actions.delete(this.actions.values().next().value!);
      if (cue.sound === 'fx-water' || cue.sound === 'cloth') out.push({ sound: 'flare' });
    }
    // Milestones and animation keyframes each emit once. No text-to-speech path exists.
    for (const id of frame.milestones) if (!this.milestones.has(id)) { this.milestones.add(id); const cue = this.profile.milestones[id]; if (cue) out.push(cue); }
    if (frame.tier > this.tier && !frame.resolved) {
      this.tier = frame.tier;
      if (!frame.action && !out.some(c => c.character)) out.push({ character: frame.tier >= 2 ? this.profile.critical : this.profile.rising });
    }
    const reactions = this.profile.reactions;
    if (out.some(c => c.character)) this.lastReactionAt = frame.elapsed;
    else if (reactions && !frame.resolved && !frame.action && frame.intensity >= reactions.minIntensity
      && frame.elapsed - this.lastReactionAt >= (frame.tier >= 2 ? reactions.urgentIntervalMs : reactions.intervalMs)) {
      out.push({ character: frame.tier >= 2 ? reactions.urgentSound : reactions.sound });
      this.lastReactionAt = frame.elapsed;
    }
    return out.filter(c => c.sound || c.character);
  }
}
