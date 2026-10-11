import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COVER_DEPARTURE_MS,
  COVER_IDLE_LEAF_COUNT,
  COVER_GUST_LEAF_COUNT,
  coverGustLeaves,
} from '../app/game/journey/cover-motion';

void test('cover wind uses a bounded deterministic burst rather than unbounded particles', () => {
  const leaves = coverGustLeaves();
  assert.deepEqual(leaves, coverGustLeaves());
  assert.equal(leaves.length, COVER_GUST_LEAF_COUNT);
  assert.equal(COVER_IDLE_LEAF_COUNT, 4);
  assert.equal(COVER_GUST_LEAF_COUNT, 48);
  assert.equal(COVER_DEPARTURE_MS, 1800);
  assert.equal(new Set(leaves.map((leaf) => leaf.id)).size, leaves.length);
  for (const leaf of leaves) {
    assert(leaf.x >= 0 && leaf.x <= 100);
    assert(
      leaf.y >= -8 && leaf.y <= 28,
      'leaves originate in the overhead canopy or left branches',
    );
    assert(leaf.delay >= 0 && leaf.delay <= 380);
    assert(leaf.duration >= 1700 && leaf.duration <= 3100);
    assert(leaf.size >= 11 && leaf.size <= 40);
    assert(
      leaf.turn >= 75 && leaf.turn <= 195,
      'gentle tumbling, not rapid spinning',
    );
  }
  assert.equal(leaves.filter((leaf) => leaf.near).length, 12);
  const average = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  assert(
    average(leaves.filter((leaf) => leaf.near).map((leaf) => leaf.size)) >
      average(leaves.filter((leaf) => !leaf.near).map((leaf) => leaf.size)),
  );
  assert(
    average(leaves.filter((leaf) => leaf.near).map((leaf) => leaf.duration)) <
      average(leaves.filter((leaf) => !leaf.near).map((leaf) => leaf.duration)),
  );
  assert(
    new Set(leaves.map((leaf) => Math.round(leaf.delay / 50))).size > 5,
    'staggered release, not one synchronized sheet',
  );
});
