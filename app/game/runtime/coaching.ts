import type { LevelPackage, Run } from './schema';

/** First matching card owns choice input; no state is stored in the UI. */
export function activeConversation(pack: LevelPackage, run: Pick<Run, 'resolved' | 'phase'>) {
  if (run.phase !== 'playing') return undefined;
  return pack.rules.coaching?.conversations.find(card =>
    card.requires.every(goal => run.resolved.includes(goal)) &&
    !card.unless.some(goal => run.resolved.includes(goal)));
}
