import test from 'node:test';
test('flood highground unlocks from existing quake exit save without cross-category completion', () => {
  const saved = Object.freeze({'quake-exit-practice':3});
  assert.equal(nodeStatus('flood-highground-practice', saved), 'available');
  assert.equal(nodeStatus('flood-highground-practice', {}), 'locked');
  assert.equal(nodeStatus('flood-highground-practice', {'flood-highground-practice':3}), 'complete');
  assert.deepEqual(saved, {'quake-exit-practice':3});
});
import {
  entryNode,
  hasJourneyRecord,
  resumeNode,
  parseLocations,
} from '../app/game/journey/resume';
import assert from 'node:assert/strict';
import { levels } from '../app/game/levels';
import { journeyEntryFor } from '../app/game/journey/entry';
import { signMotifFor } from '../app/game/journey/signs';
import { firstAidChapter, firstAidPreview } from '../app/game/journey/first-aid';
import {
  journeyMap,
  withTestUnlock,
  nodeStatus,
  canEnter,
  regionProgress,
  nextNode,
  flowerTotal,
  plantedTotal,
  journeyTiming,
} from '../app/game/journey/progress';
import { lessonFor } from '../app/game/journey/knowledge';
import {
  journeyCategories,
  categoryProgress,
  mapsForCategory,
} from '../app/game/journey/categories';
import {
  createLocalLeaderboard,
  BOARD_STORAGE_KEY,
} from '../app/game/leaderboard/local-provider';
import {
  claimFirstCompletion,
  type BoardState,
} from '../app/game/leaderboard/model';
import fs from 'node:fs';
import path from 'node:path';
import {
  journeyCopy,
  journeySkin,
  levelTitle,
} from '../app/game/journey/presentation';
const ids = journeyMap.regions.flatMap((r) => r.nodes.map((n) => n.id)),
  caps = Object.fromEntries(ids.map((id) => [id, 3]));
void test('map entry helpers preserve rewards and fall back from a locked bookmark', () => {
  const progress = { [ids[0]]: 3 };
  const original = JSON.stringify(progress);
  assert.equal(entryNode({}), ids[0]);
  assert.equal(resumeNode(progress), entryNode(progress));
  const locked = ids.find((id) => nodeStatus(id, progress) === 'locked')!;
  assert.equal(resumeNode(progress, { levelId: locked, visitedAt: 1 }), resumeNode(progress));
  assert.equal(canEnter(locked, progress), false);
  assert.equal(JSON.stringify(progress), original);
});
void test('bookmarks are separate per player and tolerate invalid or retired data', () => {
  for (const raw of [null, '{broken', 'null', '[]', '42']) {
    assert.equal(Object.keys(parseLocations(raw)).length, 0);
  }
  const parsed = parseLocations(
    JSON.stringify({
      a: { levelId: ids[0], visitedAt: 1 },
      b: { levelId: ids[2], visitedAt: 2 },
      retired: { levelId: 'retired-level', visitedAt: 3 },
      malformed: { levelId: ids[0], visitedAt: 'tomorrow' },
      emptyTimestamp: { levelId: ids[0], visitedAt: 0 },
      negativeTimestamp: { levelId: ids[0], visitedAt: -1 },
    }),
  );
  assert.deepEqual(Object.keys(parsed), ['a', 'b']);
  assert.equal(resumeNode({}, parsed.a), ids[0]);
  assert.equal(resumeNode({}, parsed.b), entryNode({}));
  assert.equal(Object.getPrototypeOf(parsed), null);
});
void test('cover resume requires earned progress or a valid explored location', () => {
  const empty = Object.freeze({});
  const locked = ids.find((id) => nodeStatus(id, empty) === 'locked')!;
  assert.equal(hasJourneyRecord(empty), false);
  assert.equal(hasJourneyRecord(empty, { levelId: locked, visitedAt: 1 }), false);
  assert.equal(hasJourneyRecord(empty, { levelId: 'retired-level', visitedAt: 1 }), false);
  assert.equal(hasJourneyRecord(empty, { levelId: ids[0], visitedAt: 0 }), false);
  assert.equal(hasJourneyRecord(empty, { levelId: ids[0], visitedAt: 1 }), true);
  assert.equal(hasJourneyRecord(Object.freeze({ [ids[0]]: 3 })), true);
});
void test('zero-flower exploration resumes each available region entry without awarding progress', () => {
  const progress = Object.freeze({});
  for (const region of journeyMap.regions) {
    const location = Object.freeze({ levelId: region.nodes[0].id, visitedAt: 10 });
    assert.equal(resumeNode(progress, location), levels.some(l=>l.id===location.levelId&&l.playable) ? location.levelId : entryNode(progress));
    assert.equal(flowerTotal(progress), 0);
    assert.equal(nodeStatus(location.levelId, progress), levels.some(l=>l.id===location.levelId&&l.playable) ? 'available' : 'locked');
  }
});
void test('resume preserves enterable legacy completions and rejects every locked or retired destination', () => {
  const saves = [
    {},
    ...ids.map((id) => ({ [id]: 3 })),
    Object.fromEntries(ids.map((id) => [id, 3])),
  ];
  for (const scores of saves) {
    const progress = Object.freeze(scores);
    const before = JSON.stringify(progress);
    for (const levelId of [...ids, 'retired-level']) {
      const location = Object.freeze({ levelId, visitedAt: 1 });
      const resumed = resumeNode(progress, location);
      assert.equal(canEnter(resumed, progress), true);
      assert.equal(
        resumed,
        canEnter(levelId, progress) ? levelId : resumeNode(progress),
      );
    }
    assert.equal(JSON.stringify(progress), before);
  }
});
function setup() {
  const bytes = new Map<string, string>();
  const storage = {
    getItem: (key: string) => bytes.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bytes.set(key, value);
    },
  };
  let n = 0;
  const provider = () =>
    createLocalLeaderboard({
      storage: () => storage,
      id: () => `player-${++n}`,
      caps,
      canEnter,
    });
  return { bytes, provider };
}
const implementedFirstAid = new Set(['first-aid-cpr', 'first-aid-aed']);
void test('map covers 26 enabled levels and six remaining map-only previews once', () => {
  assert.equal(ids.length, 32);
  assert.equal(levels.filter(l => l.playable).length, 26);
  assert.equal(new Set(ids).size, 32);
  for (const id of [
    'bleeding-pressure-practice',
    'electric-isolate-practice',
  ]) {
    assert(!ids.includes(id));
    assert(!levels.some((l) => l.id === id));
    assert(!canEnter(id, {}));
  }
  assert.deepEqual(
    ids.filter(id => !firstAidPreview(id) || implementedFirstAid.has(id)).toSorted(),
    levels
      .filter((l) => l.playable)
      .map((l) => l.id)
      .toSorted(),
  );
});
void test('all map nodes follow their displayed map number; only each map first node starts open', () => {
  for (const r of journeyMap.regions) {
    for (const [index, n] of r.nodes.entries()) {
      assert.equal(n.unlockAfter, index === 0 ? null : r.nodes[index - 1].id,
        `${r.id} #${index + 1}: prerequisite must be the preceding map node`);
      assert.equal(
        nodeStatus(n.id, {}),
        index === 0 && levels.some(l=>l.id===n.id&&l.playable) ? 'available' : 'locked',
      );
      assert.equal(canEnter(n.id, {}), index === 0 && levels.some(l=>l.id===n.id&&l.playable));
    }
  }
});
void test('four topic labels map each playable scene and preview exactly once', () => {
  assert.equal(journeyMap.regions.length, 4);
  assert.deepEqual(
    journeyMap.regions.map((r) => r.nodes.length),
    [11, 7, 6, 8],
  );
  for (const [id, region] of Object.entries({
    'quake-cover-practice': 'nature',
    'quake-exit-practice': 'nature',
    'flood-highground-practice': 'nature',
    'collapse-signal-practice': 'public',
    'car-window-practice': 'public',
    'lift-contact-practice': 'public',
    'fire-shelter-practice': 'home',
    'fire-stairs-practice': 'home',
  }))
    assert.equal(
      journeyMap.regions.find((r) => r.nodes.some((n) => n.id === id))?.id,
      region,
    );
  assert.deepEqual(
    journeyCategories.map((c) => c.name),
    ['自然灾害', '公共安全', '居家校园办公', '急救岛'],
  );
  assert.deepEqual(
    journeyCategories
      .flatMap((c) => mapsForCategory(c).map((r) => r.id))
      .toSorted(),
    journeyMap.regions.map((r) => r.id).toSorted(),
  );
});
void test('map order prerequisites preserve arbitrary legacy saved completions without rewriting rewards', () => {
  const chains = [
    [
      'typhoon-home',
      'flood-kit',
      'quake-bedroom-v2',
      'storm-street-check-v2',
      'thunder-park-v2',
      'forest-fire-sources-v2',
      'rain-street-preparation-v1',
      'flood-house-response-v1',
      'quake-cover-practice',
      'quake-exit-practice',
      'flood-highground-practice',
    ],
    ['clear-corridor', 'lift-wait', 'well-call', 'clear-corridor-check-v2',
      'car-window-practice', 'lift-contact-practice', 'collapse-signal-practice'],
    [
      'oil-fire',
      'charging-bedroom',
      'bedroom-night-check-v2',
      'kitchen-before-cooking-v2',
      'fire-shelter-practice',
      'fire-stairs-practice',
    ],
  ];
  const saves = [
    {},
    ...ids.map((id) => ({ [id]: 3 })),
    ...[0, 1, 2, 3].map((offset) =>
      Object.fromEntries(
        ids.filter((_, i) => (i + offset) % 3 === 0).map((id) => [id, 3]),
      ),
    ),
  ];
  for (const scores of saves)
    for (const chain of chains)
      for (const [i, id] of chain.entries()) {
        const expected = scores[id as keyof typeof scores]
          ? 'complete'
          : i === 0 || scores[chain[i - 1] as keyof typeof scores]
            ? 'available'
            : 'locked';
        assert.equal(nodeStatus(id, scores), expected, id);
      }
  assert.equal(
    nextNode('quake-exit-practice', { 'quake-exit-practice': 3 })?.id,
    'flood-highground-practice',
  );
});
void test('every sequential completion prefix opens exactly the next node and never another map successor', () => {
  for (const region of journeyMap.regions) {
    for (let count = 0; count <= region.nodes.length; count++) {
      const saved = Object.freeze(Object.fromEntries(region.nodes.slice(0, count).map(n => [n.id, 3])));
      for (const r of journeyMap.regions) for (const [index, n] of r.nodes.entries()) {
        const expected = !levels.some(l=>l.id===n.id&&l.playable) ? 'locked' : r.id === region.id
          ? index < count ? 'complete' : index === count ? 'available' : 'locked'
          : index === 0 && levels.some(l=>l.id===n.id&&l.playable) ? 'available' : 'locked';
        assert.equal(nodeStatus(n.id, saved), expected, `${region.id} prefix ${count}: ${n.id}`);
        assert.equal(canEnter(n.id, saved), expected !== 'locked');
      }
      assert.equal(flowerTotal(saved), count * 3);
      if (count > 0 && count < region.nodes.length && levels.some(l=>l.id===region.nodes[count].id&&l.playable))
        assert.equal(nextNode(region.nodes[count - 1].id, saved)?.id, region.nodes[count].id);
    }
  }
  assert.equal(nodeStatus('collapse-signal-practice', { 'quake-exit-practice': 3 }), 'locked');
});
void test('empty categories are pending and never award an empty completion medal', () => {
  for (const category of [{ ...journeyCategories[0], regionIds: [] }]) {
    assert.deepEqual(categoryProgress(category, {}), {
      total: 0,
      completed: 0,
      open: false,
      earned: false,
    });
    assert.deepEqual(mapsForCategory(category), []);
  }
});
void test('each region climbs from its bottom entry toward higher scene locations', () => {
  assert.equal(journeyMap.direction, 'up');
  for (const r of journeyMap.regions)
    for (let i = 1; i < r.nodes.length; i++)
      assert(
        r.nodes[i].y < r.nodes[i - 1].y,
        `${r.id}: next node must be above current node`,
      );
});
void test('completing a level grows its node, opens only direct successor, preserves other regions', () => {
  const p = { 'typhoon-home': 3 };
  assert.equal(nodeStatus('typhoon-home', p), 'complete');
  assert.equal(nodeStatus('flood-kit', p), 'available');
  assert.equal(nodeStatus('quake-bedroom-v2', p), 'locked');
  assert.equal(nodeStatus('oil-fire', p), 'available');
  assert.equal(nextNode('typhoon-home', p)?.id, 'flood-kit');
});
void test('legacy out-of-order completion remains enterable and unlocks its next neighbor', () => {
  const p = { 'lift-wait': 2 };
  assert.equal(nodeStatus('lift-wait', p), 'complete');
  assert.equal(nodeStatus('well-call', p), 'available');
  assert.equal(flowerTotal(p), 2);
  assert.equal(plantedTotal(p), 1);
});
void test('region medal only completes after every node, no bonus flowers fabricated', () => {
  const r = journeyMap.regions[2],
    p = Object.fromEntries(r.nodes.map((n) => [n.id, 3]));
  assert.equal(regionProgress(r, p), 6);
  assert.equal(flowerTotal(p), 18);
  delete p[r.nodes[0].id];
  assert.equal(regionProgress(r, p), 5);
});
void test('all nodes have inside-world positions; playable nodes have sourced narrow lessons', () => {
  for (const r of journeyMap.regions)
    for (const n of r.nodes) {
      assert(n.x >= 100 && n.x <= 620);
      assert(n.y > r.top && n.y < r.top + r.height);
      if (firstAidPreview(n.id) && !implementedFirstAid.has(n.id)) {
        assert(!levels.some(level => level.id === n.id), 'previews must not register fake medical gameplay');
        continue;
      }
      const lesson = lessonFor(n.id);
      assert(lesson.summary.length > 10);
      assert(lesson.url.startsWith('https://'));
      assert(lesson.publisher.length);
    }
});
void test('presentation budget remains 2.5–4 seconds excluding player reading time', () => {
  const total =
    journeyTiming.safeHold + journeyTiming.rewardStep * 3 + journeyTiming.end;
  assert(total >= 2500 && total <= 4000);
});
void test('replaceable artwork and level display names resolve without changing save IDs', () => {
  const paths = [
    ...journeyMap.regions.map((r) => r.image),
    ...Object.values(journeySkin).filter(Boolean),
  ];
  for (const src of paths) {
    assert(
      /^\/levels\/[A-Za-z0-9_./-]+\.(png|webp)$/.test(src),
      'offline-safe asset path: ' + src,
    );
    assert(
      fs.existsSync(path.join(process.cwd(), 'public', src.slice(1))),
      'missing asset ' + src,
    );
  }
  assert.deepEqual(Object.keys(journeyCopy.levels).toSorted(), ids.toSorted());
  for (const l of levels.filter((l) => l.playable))
    assert.equal(l.title, levelTitle(l.id, 'fallback'));
  for (const r of journeyMap.regions)
    for (const p of [...r.restoration.flowers, ...r.restoration.lights])
      assert(p.x >= 0 && p.x <= r.width && p.y >= 0 && p.y <= r.height);
});
void test('claim awards exactly 3 once and receipt survives fresh provider read', async () => {
  const s = setup(),
    p = s.provider(),
    a = await p.read();
  const first = await p.claimCompletion('typhoon-home', a.current.id);
  assert.equal(first.receipt.reward, 3);
  assert.deepEqual(first.receipt.before, {});
  const again = await p.claimCompletion('typhoon-home', a.current.id);
  assert.equal(again.receipt.reward, 0);
  const reload = await s.provider().read();
  assert.equal(reload.current.completed['typhoon-home'], 3);
  assert.equal(nodeStatus('flood-kit', reload.current.completed), 'available');
});
void test('replaying legacy 1/2-flower runs tops up only the improvement', () => {
  for (const score of [1, 2]) {
    const state: BoardState = {
      version: 1,
      activePlayerId: 'a',
      players: [
        {
          id: 'a',
          name: 'a',
          region: '',
          createdAt: 1,
          completed: { 'oil-fire': score },
        },
      ],
    };
    const r = claimFirstCompletion(state, 'oil-fire', 'a', caps, 3);
    assert.equal(r.receipt.reward, 3 - score);
    assert.equal(r.state.players[0].completed['oil-fire'], 3);
    assert.equal(state.players[0].completed['oil-fire'], score);
  }
});
void test('two providers claiming same completed level return a single reward', async () => {
  const s = setup(),
    a = s.provider(),
    b = s.provider(),
    first = await a.read();
  const receipts = await Promise.all([
    a.claimCompletion('oil-fire', first.current.id),
    b.claimCompletion('oil-fire', first.current.id),
  ]);
  assert.equal(
    receipts.reduce((n, r) => n + r.receipt.reward, 0),
    3,
  );
});
void test('provider rejects locked/unknown nodes, leaves storage unchanged', async () => {
  const s = setup(),
    p = s.provider(),
    first = await p.read(),
    before = s.bytes.get(BOARD_STORAGE_KEY);
  await assert.rejects(() => p.claimCompletion('flood-kit', first.current.id));
  for (const r of journeyMap.regions) for (const n of r.nodes.slice(1))
    await assert.rejects(() => p.claimCompletion(n.id, first.current.id), n.id);
  await assert.rejects(() => p.claimCompletion('missing', first.current.id));
  assert.equal(s.bytes.get(BOARD_STORAGE_KEY), before);
});
void test('completion is bound to player starting run, reset and switches remain isolated', async () => {
  const s = setup(),
    p = s.provider(),
    a = await p.read(),
    b = await p.createPlayer({ name: '第二位', region: '' });
  await p.claimCompletion('oil-fire', a.current.id);
  assert.equal((await p.read()).current.id, b.current.id);
  assert.deepEqual((await p.read()).current.completed, {});
  await p.switchPlayer(a.current.id);
  assert.equal((await p.read()).current.completed['oil-fire'], 3);
  await p.resetCurrentProgress();
  assert.equal(flowerTotal((await p.read()).current.completed), 0);
});
void test('new game resets only confirmed player, relocks successors and permits new first-clear rewards', async () => {
  const s = setup(), p = s.provider(), a = await p.read();
  await p.claimCompletion('typhoon-home', a.current.id);
  const b = await p.createPlayer({ name: '保留的玩家', region: '青岛' });
  await p.claimCompletion('oil-fire', b.current.id);
  const before = s.bytes.get(BOARD_STORAGE_KEY);
  await assert.rejects(() => p.resetCurrentProgress(a.current.id), /切换/);
  assert.equal(s.bytes.get(BOARD_STORAGE_KEY), before);
  await p.switchPlayer(a.current.id);
  const reset = await p.resetCurrentProgress(a.current.id);
  assert.deepEqual(reset.current.completed, {});
  assert.equal(reset.current.name, a.current.name);
  assert.equal(nodeStatus('flood-kit', reset.current.completed), 'locked');
  for (const r of journeyMap.regions) for (const [index, n] of r.nodes.entries())
    assert.equal(nodeStatus(n.id, reset.current.completed), index === 0 && levels.some(l=>l.id===n.id&&l.playable) ? 'available' : 'locked');
  assert.deepEqual((await s.provider().read()).current.completed, {});
  const first = await p.claimCompletion('typhoon-home', a.current.id);
  assert.equal(first.receipt.reward, 3);
  assert.equal((await p.claimCompletion('typhoon-home', a.current.id)).receipt.reward, 0);
  await p.switchPlayer(b.current.id);
  assert.deepEqual((await p.read()).current.completed, { 'oil-fire': 3 });
});
void test('storage failure reports session-only persistence, never falsely says saved', async () => {
  const p = createLocalLeaderboard({
    storage: () => ({
      getItem: () => null,
      setItem: () => {
        throw Error('Quota');
      },
    }),
    id: () => 'a',
    caps,
    canEnter,
  });
  const a = await p.read(),
    r = await p.claimCompletion('oil-fire', a.current.id);
  assert.equal(r.snapshot.persistence, 'session');
  assert(r.snapshot.notice);
  assert.equal(r.receipt.reward, 3);
});


test('test unlock opens every mapped level without changing saved scores or rewards', () => {
  const saved = Object.freeze({ 'typhoon-home': 3 });
  const testing = withTestUnlock(saved, true);
  for (const id of ids) {
    assert.equal(canEnter(id, testing), !!levels.find(l => l.id === id)?.playable, id);
    assert.equal(nodeStatus(id, testing), !levels.find(l => l.id === id)?.playable ? 'locked' : id === 'typhoon-home' ? 'complete' : 'available');
  }
  assert.equal(canEnter('unknown-level', testing), false);
  assert.equal(flowerTotal(testing), 3);
  assert.equal(plantedTotal(testing), 1);
  assert.equal(JSON.stringify(testing), JSON.stringify(saved));
  assert.deepEqual(saved, { 'typhoon-home': 3 });
  assert.equal(withTestUnlock(saved, false), saved);
  assert.equal(nodeStatus('flood-kit', withTestUnlock({}, false)), 'locked');
});

test('test unlock allows real completion rewards without granting prerequisite scores', async () => {
  let enabled = true;
  const store = new Map<string, string>();
  const provider = createLocalLeaderboard({
    storage: () => ({ getItem: key => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); } }),
    caps,
    id: () => 'test-player',
    canEnter: (id, progress) => canEnter(id, withTestUnlock(progress, enabled)),
  });
  const initial = await provider.read();
  const result = await provider.claimCompletion('flood-kit', initial.current.id);
  assert.deepEqual(result.snapshot.current.completed, { 'flood-kit': 3 });
  enabled = false;
  await assert.rejects(() => provider.claimCompletion('flood-highground-practice', initial.current.id), /上一关/);
});

void test('chapter four preserves the remaining eight names, difficulty ladder and explicit CPR/AED playable scope', () => {
  assert.equal(firstAidChapter.status, 'partially-playable');
  assert.deepEqual(firstAidChapter.levels.map(l => [l.number, l.title, l.difficulty]), [
    ['4-1', '擦伤处理入门', '入门'], ['4-2', '鼻血应急处置', '入门'],
    ['4-3', '扭伤现场救护', '基础'], ['4-4', '烫伤紧急处理', '基础'],
    ['4-5', '晕倒现场应对', '进阶'], ['4-6', '气道异物急救', '进阶'],
    ['4-7', '心肺复苏实战', '挑战'], ['4-8', '自动除颤协作', '挑战'],
  ]);
  assert.deepEqual(journeyMap.regions.find(r => r.id === 'first-aid')!.nodes.map(n => n.id), firstAidChapter.levels.map(l => l.id));
  for (const preview of firstAidChapter.levels) assert.equal(levels.some(l => l.id === preview.id && l.playable), implementedFirstAid.has(preview.id));
});

void test('chapter four shares prerequisite and completed/replay state with every other map', () => {
  const nodes = journeyMap.regions.find(r => r.id === 'first-aid')!.nodes;
  // Explicit pure-model fixtures, not real medical gameplay or player-save completions.
  for (let count = 0; count <= nodes.length; count++) {
    const scores = Object.freeze(Object.fromEntries(nodes.slice(0, count).map(n => [n.id, 3])));
    for (const [index, node] of nodes.entries()) {
      const entry = journeyEntryFor(node.id, scores)!;
      assert.equal(entry.status, !implementedFirstAid.has(node.id) ? 'locked' : index < count ? 'complete' : index === count ? 'available' : 'locked');
      if (entry.status === 'locked' && implementedFirstAid.has(node.id)) {
        assert.equal(entry.lockedLabel, '尚未解锁');
        assert(entry.lockedReason!.includes(firstAidChapter.levels[index - 1].title));
      }
      if (entry.status === 'complete') assert.equal(entry.startLabel, '再玩一次');
      assert.equal(entry.canStart, implementedFirstAid.has(node.id) && entry.status !== 'locked', 'only implemented CPR/AED can start; other previews remain unavailable');
    }
    assert.equal(flowerTotal(scores), count * 3);
    assert.equal(regionProgress(journeyMap.regions.find(r => r.id === 'first-aid')!, scores), count);
    if (count > 0 && count < nodes.length && implementedFirstAid.has(nodes[count].id)) assert.equal(nextNode(nodes[count - 1].id, scores)?.id, nodes[count].id);
  }
  assert.equal(journeyEntryFor('oil-fire', {})!.canStart, true);
  assert.equal(journeyEntryFor('charging-bedroom', {})!.canStart, false);
  assert.equal(journeyEntryFor('charging-bedroom', {'oil-fire': 3})!.canStart, true);
  assert.equal(journeyEntryFor('oil-fire', {'oil-fire': 3})!.startLabel, '再玩一次');
  assert.equal(journeyEntryFor('unknown-level', {}), undefined);
});

void test('chapter four has eight distinct offline-safe corner motifs and authored restoration positions', () => {
  const motifs = firstAidChapter.levels.map(level => signMotifFor(level.id));
  assert.equal(new Set(motifs).size, 8);
  for (const motif of motifs) {
    assert(motif);
    assert(motif.endsWith('.svg'));
    const svg = fs.readFileSync(path.join(process.cwd(), 'public', motif.slice(1)), 'utf8');
    assert(svg.includes('viewBox="0 0 32 32"'));
    assert(svg.includes('stroke="#d4b17a"'));
    assert(!/<script|<image|<foreignObject/.test(svg));
  }
  const region = journeyMap.regions.find(r => r.id === 'first-aid')!;
  assert.equal(region.restoration.flowers.length, 16);
  assert(region.restoration.lights.length > 0);
});

void test('unimplemented first-aid levels cannot mint real completion rewards', async () => {
  const storage = new Map<string, string>();
  const caps = Object.fromEntries(levels.filter(l => l.playable).map(l => [l.id, 3]));
  const provider = createLocalLeaderboard({storage: () => ({getItem: k => storage.get(k) ?? null, setItem: (k,v) => { storage.set(k,v); }}), caps, id: () => 'first-aid-qa', canEnter});
  const before = await provider.read();
  for (const level of firstAidChapter.levels) await assert.rejects(() => provider.claimCompletion(level.id, before.current.id), /未开放|上一关/);
  assert.deepEqual((await provider.read()).current.completed, before.current.completed);
});

void test('AED formal settlement has readable contextual knowledge, not preview-only rewards', () => {
  const lesson = lessonFor('first-aid-aed');
  assert.equal(lesson.points.length, 3);
  assert.equal(lesson.publisher, '美国红十字会');
  assert(lesson.points.some(p => p.body.includes('不是每次开机都要电击')));
  assert(lesson.message.includes('不代表患者已经恢复'));
  assert.equal(journeyEntryFor('first-aid-aed', {})!.canStart, false);
  assert.equal(journeyEntryFor('first-aid-aed', {'first-aid-cpr':3})!.canStart, true);
});

void test('removed ninth first-aid stop no longer has an entry or progress slot', () => {
  assert.equal(firstAidPreview('first-aid-comprehensive'), undefined);
  assert.equal(journeyEntryFor('first-aid-comprehensive', {}), undefined);
  assert.equal(canEnter('first-aid-comprehensive', {}), false);
  assert(!ids.includes('first-aid-comprehensive'));
  assert.equal(journeyMap.regions.find(r => r.id === 'first-aid')!.nodes.at(-1)!.id, 'first-aid-aed');
});


test('unlock all opens every map node without changing completion or rewards', () => {
  const completed = Object.freeze({ 'typhoon-home': 3 });
  for (const node of journeyMap.regions.flatMap(region => region.nodes)) {
    assert.equal(canEnter(node.id, completed, true), levels.some(l=>l.id===node.id&&l.playable));
    assert.equal(nodeStatus(node.id, completed, true), !levels.some(l=>l.id===node.id&&l.playable) ? 'locked' : node.id === 'typhoon-home' ? 'complete' : 'available');
  }
  assert.equal(nodeStatus('unknown-level', completed, true), 'locked');
  assert.equal(canEnter('unknown-level', completed, true), false);
  assert.equal(flowerTotal(completed), 3);
  assert.equal(plantedTotal(completed), 1);
  const last = journeyMap.regions.at(-1)!.nodes.at(-1)!.id;
  assert.equal(resumeNode({}, { levelId: last, visitedAt: 1 }, true), last);
  assert.equal(nodeStatus(last, {}), 'locked');
});

void test('persistent unlock keeps the local first-aid availability gate', () => {
  assert.equal(journeyEntryFor('first-aid-cpr', {}, true)?.canStart, true);
  assert.equal(journeyEntryFor('first-aid-aed', {}, true)?.canStart, true);
  assert.equal(journeyEntryFor('first-aid-abrasion', {}, true)?.status, 'locked');
  assert.equal(journeyEntryFor('first-aid-abrasion', {}, true)?.canStart, false);
});

test('unimplemented nodes stay locked even with overrides or historical scores',()=>{
 for(const node of journeyMap.regions.flatMap(r=>r.nodes).filter(n=>!levels.find(l=>l.id===n.id)?.playable)){
  for(const scores of [{},{[node.id]:3}]){assert.equal(nodeStatus(node.id,withTestUnlock(scores,true),true),'locked');const entry=journeyEntryFor(node.id,scores,true);assert.equal(entry?.canStart,false);assert.equal(entry?.lockedLabel,'玩法待开放');}
 }
});
