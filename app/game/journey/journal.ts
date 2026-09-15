import type { BoardSnapshot } from '@/app/game/leaderboard/model';
import { journeyCategories, mapsForCategory } from './categories';
import { flowerTotal } from './progress';

export type JournalPlayer = {
  id: string;
  name: string;
  flowers: number;
  rank: number | null;
  completed: Record<string, number>;
  demo: boolean;
};

/** Presentation-only examples. These records never enter the persistence provider. */
const examples = [
  { id: 'ahua', name: '阿花', counts: [7, 5, 4] },
  { id: 'wang', name: '隔壁老王', counts: [6, 4, 3] },
  { id: 'lin', name: '小林', counts: [1, 1, 1] },
  { id: 'yuan', name: '阿圆', counts: [1, 1, 0] },
];

export function journalEntries(snapshot: BoardSnapshot): JournalPlayer[] {
  const entries: JournalPlayer[] = snapshot.entries.map(entry => ({
    ...entry,
    completed: { ...(entry.id === snapshot.current.id ? snapshot.current.completed : snapshot.progressByPlayer?.[entry.id] ?? {}) },
    demo: false,
  }));
  const ids = new Set(entries.map(entry => entry.id));
  for (const example of examples) {
    let id = `demo:journal:${example.id}`;
    // Existing save IDs are unconstrained text; even an unusual collision stays harmless.
    while (ids.has(id)) id += ':';
    ids.add(id);
    const completed = Object.fromEntries(journeyCategories.flatMap((category, index) =>
      mapsForCategory(category).flatMap(region => region.nodes).slice(0, example.counts[index] ?? 0).map(node => [node.id, 3]),
    ));
    entries.push({ id, name: example.name, flowers: flowerTotal(completed), rank: null, completed, demo: true });
  }
  // Stable sorting retains the real provider's tie order; sample ties follow real records.
  entries.sort((a, b) => b.flowers - a.flowers);
  let previous = -1;
  let rank = 0;
  return entries.map((entry, index) => {
    if (entry.flowers !== previous) rank = index + 1;
    previous = entry.flowers;
    return { ...entry, rank: entry.flowers > 0 ? rank : null };
  });
}
