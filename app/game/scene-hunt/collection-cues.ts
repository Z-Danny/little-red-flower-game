import type { Interaction, Run } from '../runtime/schema';

export type CollectionActionCue = 'pickup' | 'invalid-return';
export type CollectionAudioRule = Pick<Interaction, 'id' | 'mode' | 'outcome'>;

/** Accepted tap collections pick themselves up; drag pickups belong to pointer/select. */
export class CollectionCueTimeline {
  private lastAction = '';
  advance(run: Run, rules: readonly CollectionAudioRule[]): CollectionActionCue | null {
    if (!run.action || run.phase !== 'playing') { this.lastAction = ''; return null; }
    const key = `${run.action.rule ?? 'bounce'}:${run.action.source}:${Math.round(run.elapsed - run.action.age)}`;
    if (key === this.lastAction) return null;
    this.lastAction = key;
    if (run.action.rule === null) return 'invalid-return';
    const rule = rules.find(rule => rule.id === run.action?.rule);
    return rule?.outcome === 'correct' && rule.mode === 'tap' ? 'pickup' : null;
  }
  reset() { this.lastAction = ''; }
}
