import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_PLAYERS, parseState, rankPlayers, recordBest, sanitizeScores, validateProfile, type BoardState, type Player } from '../app/game/leaderboard/model';
import { BOARD_STORAGE_KEY, LEGACY_STORAGE_KEY, createLocalLeaderboard, type StoragePort } from '../app/game/leaderboard/local-provider';

const caps = { 'typhoon-home': 3, 'oil-fire': 3 };
const player = (id: string, flowerCount = 0, createdAt = 1): Player => ({ id, name: id, region: '山东 · 青岛', createdAt, completed: { 'oil-fire': flowerCount } });
const state = (): BoardState => ({ version: 1, activePlayerId: 'a', players: [player('a'), player('b')] });
class MemoryStorage implements StoragePort {
  data = new Map<string, string>();
  failRead = false;
  failWrite = false;
  getItem(key: string) { if (this.failRead) throw Error('Blocked'); return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrite) throw Error('Quota'); this.data.set(key, value); }
}
function setup(storage = new MemoryStorage(), idPrefix = 'player', scoreCaps: Record<string, number> = caps) {
  let count = 0;
  const provider = createLocalLeaderboard({ storage: () => storage, caps: scoreCaps, id: () => `${idPrefix}-${++count}`, now: () => count });
  return { storage, provider };
}

test('compiler excludes source backups and generated output', () => {
  const config = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
  for (const path of ['outputs', 'work', 'dist']) assert.ok(config.exclude.includes(path));
});

test('profile trims text and accepts an optional region', () => {
  assert.deepEqual(validateProfile({ name: '  小花  ', region: '' }), { name: '小花', region: '' });
});
test('profile removes invisible controls and normalizes whitespace', () => {
  assert.deepEqual(validateProfile({ name: '小\u202e花', region: '山东   青岛' }), { name: '小花', region: '山东 青岛' });
});
test('profile rejects empty, overlong and malformed names', () => {
  for (const name of ['', '  ', '花'.repeat(13), 42, null]) assert.throws(() => validateProfile({ name: name as string, region: '' }));
});
test('profile character limits count Unicode codepoints, not UTF-16 units', () => {
  assert.equal(validateProfile({ name: '🌸'.repeat(12), region: '区'.repeat(20) }).name.length, 24);
  assert.throws(() => validateProfile({ name: '花', region: '区'.repeat(21) }));
});
test('scores ignore closed/unknown keys and reject nonnumeric/negative values', () => {
  assert.deepEqual(sanitizeScores({ 'oil-fire': -2, 'typhoon-home': '3', unknown: 20 }, caps), {});
  assert.deepEqual(sanitizeScores({ 'oil-fire': Infinity, 'typhoon-home': NaN }, caps), {});
});
test('migration clamps oversized scores and floors fractions', () => {
  assert.deepEqual(sanitizeScores({ 'oil-fire': 100, 'typhoon-home': 2.7 }, caps), { 'typhoon-home': 2, 'oil-fire': 3 });
});
test('array/null scores and inherited score properties cannot contribute', () => {
  assert.deepEqual(sanitizeScores(null, caps), {});
  assert.deepEqual(sanitizeScores([], caps), {});
  assert.deepEqual(sanitizeScores(Object.create({ 'oil-fire': 3 }), caps), {});
});
test('rank uses descending total and 1,1,3 competition ranks', () => {
  const ranked = rankPlayers([player('c', 2), player('b', 3, 2), player('a', 3)], caps);
  assert.deepEqual(ranked.map(p => [p.id, p.rank]), [['a', 1], ['b', 1], ['c', 3]]);
});
test('zero-score players are visible but unranked; empty list is valid', () => {
  assert.equal(rankPlayers([player('a')], caps)[0].rank, null);
  assert.deepEqual(rankPlayers([], caps), []);
});
test('ties use stable creation order then ID and do not mutate input', () => {
  const players = [player('b', 3), player('a', 3), player('c', 3, 0)];
  assert.deepEqual(rankPlayers(players, caps).map(p => p.id), ['c', 'a', 'b']);
  assert.deepEqual(players.map(p => p.id), ['b', 'a', 'c']);
});
test('recording a lower or repeated result never farms flowers', () => {
  const best = recordBest(state(), 'oil-fire', 3, caps);
  assert.deepEqual(recordBest(best, 'oil-fire', 2, caps), best);
  assert.deepEqual(recordBest(best, 'oil-fire', 3, caps), best);
});
test('new level best adds flowers, other players remain untouched', () => {
  const source = state();
  const changed = recordBest(recordBest(source, 'oil-fire', 2, caps), 'typhoon-home', 3, caps);
  assert.equal(rankPlayers(changed.players, caps)[0].flowers, 5);
  assert.deepEqual(changed.players[1], source.players[1]);
  assert.equal(source.players[0].completed['oil-fire'], 0);
});
test('reject invalid score submissions, unknown levels and players', () => {
  for (const value of [0, -1, 4, 1.5, NaN, Infinity]) assert.throws(() => recordBest(state(), 'oil-fire', value, caps));
  assert.throws(() => recordBest(state(), 'closed-level', 3, caps));
  assert.throws(() => recordBest(state(), '__proto__', 3, caps));
  assert.throws(() => recordBest(state(), 'oil-fire', 3, caps, 'missing'));
});
test('result stays bound to the player who started the level after switching', () => {
  const source = { ...state(), activePlayerId: 'b' };
  const result = recordBest(source, 'oil-fire', 3, caps, 'a');
  assert.equal(result.players[0].completed['oil-fire'], 3);
  assert.equal(result.players[1].completed['oil-fire'], 0);
});
test('parser repairs missing active selection and strips unsafe score keys', () => {
  const parsed = parseState({ ...state(), activePlayerId: 'missing', players: [{ ...player('a'), completed: JSON.parse('{"__proto__":3,"constructor":3,"prototype":3,"oil-fire":2,"future-level":3}') }] });
  assert.equal(parsed.activePlayerId, 'a');
  assert.deepEqual(parsed.players[0].completed, { 'oil-fire': 2, 'future-level': 3 });
});
test('parser rejects duplicate IDs, bad schema versions and oversized saves', () => {
  for (const bad of [null, {}, [], { ...state(), version: 2 }, { ...state(), players: [] }, { ...state(), players: [player('a'), player('a')] }, { ...state(), players: Array.from({ length: 51 }, (_, i) => player(String(i))) }]) assert.throws(() => parseState(bad));
});
test('fresh install creates one real local profile, no fabricated competitors', async () => {
  const { provider, storage } = setup();
  const board = await provider.read();
  assert.equal(board.entries.length, 1);
  assert.equal(board.current.name, '小红花玩家');
  assert.equal(board.current.region, '');
  assert.equal(board.maxFlowers, 6);
  assert.equal(board.scope, 'local');
  assert.equal(board.persistence, 'saved');
  assert.ok(storage.data.has(BOARD_STORAGE_KEY));
});
test('legacy record migrates once and original bytes remain unchanged', async () => {
  const { provider, storage } = setup();
  const legacy = '{"oil-fire":2,"typhoon-home":3}';
  storage.setItem(LEGACY_STORAGE_KEY, legacy);
  const first = await provider.read();
  assert.equal(first.entries[0].flowers, 5);
  await provider.createPlayer({ name: '家人', region: '北京' });
  const reloaded = await setup(storage, 'reload').provider.read();
  assert.equal(reloaded.entries.length, 2);
  assert.equal(reloaded.current.name, '家人');
  assert.equal(reloaded.current.completed['oil-fire'], undefined);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), legacy);
});
test('corrupt legacy storage is recoverable without deleting original', async () => {
  const { storage, provider } = setup();
  storage.setItem(LEGACY_STORAGE_KEY, '{bad');
  assert.equal((await provider.read()).entries[0].flowers, 0);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), '{bad');
});
test('profiles isolate progress and editing does not change scores', async () => {
  const { provider } = setup();
  const first = await provider.read();
  await provider.recordResult('oil-fire', 3, first.current.id);
  const second = await provider.createPlayer({ name: '第二位', region: '上海' });
  assert.deepEqual(second.current.completed, {});
  await provider.updateProfile({ name: '改昵称', region: '山东 · 青岛' });
  const back = await provider.switchPlayer(first.current.id);
  assert.equal(back.current.completed['oil-fire'], 3);
  assert.equal(back.entries.find(p => p.id === second.current.id)?.region, '山东 · 青岛');
});
test('reset only clears current player and does not reimport legacy', async () => {
  const { provider, storage } = setup();
  storage.setItem(LEGACY_STORAGE_KEY, '{"oil-fire":3}');
  const first = await provider.read();
  const second = await provider.createPlayer({ name: '二', region: '' });
  await provider.recordResult('oil-fire', 2, second.current.id);
  await provider.resetCurrentProgress();
  const reloaded = await setup(storage).provider.read();
  assert.deepEqual(reloaded.current.completed, {});
  assert.equal(reloaded.entries.find(p => p.id === first.current.id)?.flowers, 3);
});
test('invalid switch or profile does not modify stored data', async () => {
  const { provider, storage } = setup();
  await provider.read();
  const before = storage.getItem(BOARD_STORAGE_KEY);
  await assert.rejects(provider.switchPlayer('missing'));
  await assert.rejects(provider.createPlayer({ name: '', region: '' }));
  assert.equal(storage.getItem(BOARD_STORAGE_KEY), before);
});
test('local player limit is enforced', async () => {
  const { provider } = setup();
  await provider.read();
  for (let i = 1; i < MAX_PLAYERS; i++) await provider.createPlayer({ name: `玩家${i}`, region: '' });
  await assert.rejects(provider.createPlayer({ name: '多出一位', region: '' }));
  assert.equal((await provider.read()).entries.length, MAX_PLAYERS);
});
test('read-denied mode keeps session playable and visibly warns', async () => {
  const { provider, storage } = setup();
  storage.failRead = true;
  const first = await provider.read();
  const board = await provider.recordResult('oil-fire', 3, first.current.id);
  assert.equal(board.persistence, 'session');
  assert.ok(board.notice);
  assert.equal((await provider.read()).entries[0].flowers, 3);
});
test('quota failure keeps latest score in session without overwriting saved data', async () => {
  const { provider, storage } = setup();
  const first = await provider.read();
  const before = storage.getItem(BOARD_STORAGE_KEY);
  storage.failWrite = true;
  const board = await provider.recordResult('oil-fire', 3, first.current.id);
  assert.equal(board.persistence, 'session');
  assert.ok(board.notice.includes('当前页面'));
  assert.equal(board.entries[0].flowers, 3);
  assert.equal(storage.getItem(BOARD_STORAGE_KEY), before);
});
test('unreadable/newer-format leaderboard is never silently overwritten', async () => {
  for (const raw of ['{bad', '{"version":999}', 'null']) {
    const { storage, provider } = setup();
    storage.setItem(BOARD_STORAGE_KEY, raw);
    const first = await provider.read();
    await provider.recordResult('oil-fire', 3, first.current.id);
    assert.equal(first.persistence, 'session');
    assert.equal(storage.getItem(BOARD_STORAGE_KEY), raw);
  }
});
test('sequential writes from two providers preserve other players and session ownership', async () => {
  const { provider: a, storage } = setup();
  const first = await a.read();
  const b = setup(storage, 'b').provider;
  const second = await b.createPlayer({ name: '另一个窗口', region: '' });
  const board = await a.recordResult('oil-fire', 3, first.current.id);
  assert.equal(board.current.id, second.current.id);
  assert.equal(board.entries.find(p => p.id === first.current.id)?.flowers, 3);
  assert.equal((await b.read()).entries.length, 2);
});
test('new enabled levels change caps and rankings without editing UI or provider', async () => {
  const { provider, storage } = setup();
  const first = await provider.read();
  const expanded = setup(storage, 'b', { ...caps, 'future-level': 3 }).provider;
  const board = await expanded.recordResult('future-level', 3, first.current.id);
  assert.equal(board.maxFlowers, 9);
  assert.equal(board.entries[0].flowers, 3);
  // Disabling a level hides its score from total without destroying the stored best.
  assert.equal((await provider.read()).entries[0].flowers, 0);
  await provider.updateProfile({ name: '改名保留成绩', region: '' });
  assert.equal((await expanded.read()).entries[0].flowers, 3);
});
