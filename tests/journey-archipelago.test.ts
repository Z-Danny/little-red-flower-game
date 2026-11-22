import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { archipelagoDestinationId, archipelagoIslands, islandForLevel, islandNodes } from '../app/game/journey/archipelago';
import { journeyMap, nodeStatus } from '../app/game/journey/progress';
import { islandPlaceholderStops, islandPreviewFor } from '../app/game/journey/island-previews';
import { authoredIslandScenes } from '../app/game/journey/island-scenes';
import { canEnter, flowerTotal, nodeFor, withTestUnlock } from '../app/game/journey/progress';
import { getLevel } from '../app/game/levels';
import { journeyEntryFor } from '../app/game/journey/entry';
import draftCatalog from '../content/scenes/catalog.json';

void test('nine centered-label islands have real local artwork and no star suffix', () => {
  assert.deepEqual(archipelagoIslands.map(island => island.name), ['校园安全', '居家安全', '交通安全', '防溺水安全', '网络安全', '应急防灾', '人身社会安全', '食品安全', '文旅户外安全']);
  for (const island of archipelagoIslands) assert(existsSync(`public${island.art}`));
});
void test('all original map nodes are assigned exactly once, including previews', () => {
  const ids = archipelagoIslands.flatMap(island => [...island.levelIds]);
  const original = journeyMap.regions.flatMap(region => region.nodes.map(node => node.id));
  assert.equal(new Set(ids).size, ids.length, 'no duplicated levels across islands');
  assert.deepEqual([...ids].sort(), [...original].sort(), 'no missing or invented levels');
  for (const id of ids) assert(islandForLevel(id));
});
void test('destination selection preserves progression and never mutates saved scores', () => {
  for (const island of archipelagoIslands) {
    for (const count of [0, 1, island.levelIds.length]) {
      const completed = Object.freeze(Object.fromEntries(island.levelIds.slice(0, count).map(id => [id, 3])));
      const before = JSON.stringify(completed);
      assert.equal(archipelagoDestinationId(island.id, completed), island.levelIds.find(id => nodeStatus(id, completed) === 'available') ?? island.levelIds[0] ?? null);
      assert.equal(JSON.stringify(completed), before);
      assert.deepEqual(islandNodes(island.id).map(node => node.id), island.levelIds);
    }
  }
});
void test('empty and unknown islands do not route to an unrelated level', () => {
  for (const id of ['network', 'food', '', '__proto__', 'retired-category']) assert.equal(archipelagoDestinationId(id, {}), null);
  assert.equal(islandForLevel('unknown'), undefined);
});

void test('all nine authored maps cover the originals and 28 disabled placeholders exactly once', () => {
  assert.deepEqual(authoredIslandScenes.map(scene => scene.region.id), archipelagoIslands.map(island => island.id));
  assert.deepEqual(authoredIslandScenes.map(scene => scene.stops.length), [8, 9, 3, 4, 6, 12, 6, 6, 6]);
  const journeyIds = new Set(journeyMap.regions.flatMap(region => region.nodes.map(node => node.id)));
  const seen = new Set<string>();
  for (const { region, stops, levelIds } of authoredIslandScenes) {
    const art = readFileSync(`public${region.image}`);
    assert.equal(art.readUInt32BE(16), region.width);
    assert.equal(art.readUInt32BE(20), region.height);
    assert.deepEqual(levelIds, region.nodes.map(node => node.id));
    for (const stop of stops) {
      assert(!seen.has(stop.id));
      seen.add(stop.id);
      assert(stop.x > 0 && stop.x < region.width && stop.y > 0 && stop.y < region.height);
      if (stop.placeholder) {
        assert(!journeyIds.has(stop.id));
        assert.equal(draftCatalog.find(entry => entry.id === stop.id)?.enabled, false);
        const rules = JSON.parse(readFileSync(`content/scenes/${stop.id}/rules.json`, 'utf8'));
        assert.equal(stop.title, rules.title);
      } else {
        assert(journeyIds.has(stop.id));
        assert.equal(islandPreviewFor(stop.id), undefined);
      }
    }
  }
  assert.equal(seen.size, 60);
  assert.deepEqual([...seen].sort(), [...journeyIds, ...draftCatalog.filter(entry => !entry.enabled).map(entry => entry.id)].sort());
});

void test('campus is first and all authored-map numbers run from bottom to top without changing rules', () => {
  assert.equal(authoredIslandScenes[0].region.id, 'campus');
  for (const scene of authoredIslandScenes) {
    assert.equal(scene.stops[0].y, Math.max(...scene.stops.map(stop => stop.y)));
    for (let i = 1; i < scene.stops.length; i++) {
      assert(scene.stops[i].y <= scene.stops[i - 1].y, `${scene.region.id}: numbering must rise up the map`);
    }
  }
  assert.equal(nodeFor('oil-fire')?.unlockAfter, null);
  assert.equal(nodeFor('charging-bedroom')?.unlockAfter, 'oil-fire');
  assert.equal(nodeStatus('oil-fire', {}), 'available');
});

void test('placeholder access, awards and saves remain unavailable even with fabricated completion or test unlock', () => {
  assert.equal(islandPlaceholderStops.length, 28);
  for (const stop of islandPlaceholderStops) {
    const progress = Object.freeze({ [stop.id]: 3 });
    const before = JSON.stringify(progress);
    assert.equal(nodeFor(stop.id), undefined);
    assert.equal(getLevel(stop.id), undefined);
    assert.equal(nodeStatus(stop.id, progress, true), 'locked');
    assert.equal(canEnter(stop.id, progress, true), false);
    assert.equal(journeyEntryFor(stop.id, withTestUnlock(progress, true), true)?.canStart, false);
    assert.equal(flowerTotal(progress), 0);
    assert.equal(JSON.stringify(progress), before);
  }
});

void test('arc positions stay on one circle, rise to both sides and keep stable depth', async () => {
  const { islandArcPose, islandArcStep } = await import('../app/game/journey/island-orbit');
  assert(islandArcStep > 0.5 && islandArcStep < 0.7);
  const center = islandArcPose(0), left = islandArcPose(-1), right = islandArcPose(1);
  assert.equal(center.x, 0);
  assert.equal(center.y, 1);
  assert.equal(center.scale, 1);
  assert(left.x < 0 && right.x > 0 && left.y < center.y && right.y < center.y);
  assert.equal(left.y, right.y);
  assert(center.zIndex > left.zIndex);
  for (const distance of [-1.8, -1, -0.5, 0, 0.5, 1, 1.8]) {
    const pose = islandArcPose(distance);
    assert(Math.abs(pose.x ** 2 + pose.y ** 2 - 1) < 1e-10);
  }
  assert.equal(islandArcPose(4).visible, false, 'far islands must not wrap around behind the arc');
});

void test('restored scene views preserve island membership and original node geometry', async () => {
  const { originalScenesForIsland } = await import('../app/game/journey/island-scenes');
  for (const island of archipelagoIslands) {
    const scenes = originalScenesForIsland(island.id);
    assert.deepEqual(scenes.flatMap(scene => scene.levelIds).sort(), [...island.levelIds].sort());
    for (const scene of scenes) {
      const original = journeyMap.regions.find(region => region.id === scene.region.id)!;
      assert.equal(scene.region, original, 'use the exact original map, not reconstructed coordinates');
      for (const id of scene.levelIds) assert(original.nodes.some(node => node.id === id));
    }
  }
  assert.deepEqual(originalScenesForIsland('network'), []);
  assert.deepEqual(originalScenesForIsland('food'), []);
});
