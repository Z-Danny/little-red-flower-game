import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalLeaderboard, BOARD_STORAGE_KEY } from '../app/game/leaderboard/local-provider';
import { journalEntries } from '../app/game/journey/journal';
import { journeyCategories, categoryProgress } from '../app/game/journey/categories';
import { journeyMap, plantedTotal } from '../app/game/journey/progress';

const ids = journeyMap.regions.flatMap(region => region.nodes.map(node => node.id));
const caps = Object.fromEntries(ids.map(id => [id, 3]));
function fixture() {
  const saved = {
    version: 1, activePlayerId: 'mine', players: [
      { id: 'mine', name: '我', region: '保留地区', createdAt: 1, completed: { [ids[0]]: 1, [ids[1]]: 2 } },
      { id: 'other', name: '朋友', region: '', createdAt: 2, completed: { [ids[0]]: 3 } },
      { id: 'zero', name: '新手', region: '', createdAt: 3, completed: {} },
      { id: 'demo:journal:ahua', name: '特殊 ID', region: '', createdAt: 4, completed: {} },
    ],
  };
  const storage = new Map([[BOARD_STORAGE_KEY, JSON.stringify(saved)]]);
  let writes = 0;
  const provider = createLocalLeaderboard({ caps, id: () => 'created', storage: () => ({
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { writes++; storage.set(key, value); },
  }) });
  return { provider, storage, writes: () => writes };
}

test('detail reads expose sanitized independent progress without changing active save or bytes', async () => {
  const f = fixture();
  const before = f.storage.get(BOARD_STORAGE_KEY);
  const snapshot = await f.provider.read();
  assert.equal(snapshot.current.id, 'mine');
  assert.deepEqual(snapshot.progressByPlayer?.other, { [ids[0]]: 3 });
  snapshot.progressByPlayer!.other[ids[0]] = 1;
  snapshot.progressByPlayer!.mine[ids[0]] = 3;
  assert.equal(snapshot.current.completed[ids[0]], 1);
  const fresh = await f.provider.read();
  assert.equal(fresh.progressByPlayer!.other[ids[0]], 3);
  assert.equal(fresh.current.id, 'mine');
  assert.equal(f.storage.get(BOARD_STORAGE_KEY), before);
  assert.equal(f.writes(), 0);
});

test('journal preserves legacy flower values and actual completion counts, with isolated examples', async () => {
  const f = fixture();
  const snapshot = await f.provider.read();
  const entries = journalEntries(snapshot);
  const mine = entries.find(entry => entry.id === 'mine')!;
  assert.equal(mine.flowers, 3);
  assert.equal(plantedTotal(mine.completed), 2);
  mine.completed[ids[0]] = 3;
  assert.equal(snapshot.current.completed[ids[0]], 1);
  const demos = entries.filter(entry => entry.demo);
  assert.equal(demos.length, 4);
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
  const ahua = demos.find(entry => entry.name === '阿花')!;
  assert.deepEqual(journeyCategories.map(category => categoryProgress(category, ahua.completed).completed), [7, 5, 4]);
  assert.equal(ahua.flowers, 48);
  assert.equal(plantedTotal(ahua.completed), 16);
  assert.equal(entries.find(entry => entry.id === 'other')?.rank, mine.rank);
  assert.equal(entries.find(entry => entry.id === 'zero')?.rank, null);
  assert.equal(f.writes(), 0);
  assert.equal((await f.provider.read()).entries.length, 4);
  await assert.rejects(f.provider.switchPlayer(ahua.id));
  assert.equal((await f.provider.read()).current.id, 'mine');
});

test('journal orders a genuine completed player above demos and preserves competition ties', async () => {
  const f = fixture();
  const snapshot = await f.provider.read();
  snapshot.current.completed = Object.fromEntries(ids.map(id => [id, 3]));
  snapshot.entries.find(entry => entry.id === 'mine')!.flowers = 72;
  const entries = journalEntries(snapshot);
  assert.equal(entries[0].id, 'mine');
  assert.equal(entries[0].rank, 1);
  assert.equal(entries[1].flowers, 48);
  assert.equal(entries[1].rank, 2);
});
