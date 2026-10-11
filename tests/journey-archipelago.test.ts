import { getLevel } from '../app/game/levels';
import test from 'node:test';
import assert from 'node:assert/strict';
import { archipelagoDestinationId, archipelagoIslands } from '../app/game/journey/archipelago';
import {
  journeyCategories,
  mapsForCategory,
} from '../app/game/journey/categories';
import { canEnter, nodeStatus } from '../app/game/journey/progress';

void test('island selection follows the chosen map progress without unlocking or awarding levels', () => {
  for (const category of journeyCategories) {
    const nodes = mapsForCategory(category).flatMap((region) => region.nodes);
    for (let count = 0; count <= nodes.length; count++) {
      const completed = Object.freeze(
        Object.fromEntries(nodes.slice(0, count).map((node) => [node.id, 3])),
      );
      const before = JSON.stringify(completed);
      const destination = archipelagoDestinationId(category.id, completed);
      assert.equal(
        destination,
        nodes.find(n=>nodeStatus(n.id,completed)==='available')?.id ?? nodes[0].id,
        `${category.id}: select the next available level, or the entry after all levels are complete`,
      );
      assert.equal(canEnter(destination!, completed), !!getLevel(destination!)?.playable, 'map previews may be inspected, but never started');
      assert.equal(JSON.stringify(completed), before);
    }
  }
});

void test('island selection tolerates legacy out-of-order saves and stays within the selected category', () => {
  const allNodes = journeyCategories.flatMap((category) =>
    mapsForCategory(category).flatMap((region) => region.nodes),
  );
  for (const savedNode of allNodes) {
    const completed = Object.freeze({ [savedNode.id]: 2 });
    for (const category of journeyCategories) {
      const nodes = mapsForCategory(category).flatMap((region) => region.nodes);
      const destination = archipelagoDestinationId(category.id, completed);
      assert(
        nodes.some((node) => node.id === destination),
        `${category.id}: stay within the requested topic`,
      );
      assert.equal(canEnter(destination!, completed), !!getLevel(destination!)?.playable, 'map previews may be inspected, but never started');
      assert.equal(nodeStatus(destination!, completed), getLevel(destination!)?.playable ? 'available' : 'locked');
      assert.deepEqual(completed, { [savedNode.id]: 2 });
    }
  }
});

void test('unknown or retired island destinations cannot route to an arbitrary map', () => {
  const completed = Object.freeze({ 'typhoon-home': 3 });
  for (const categoryId of ['', 'retired-category', 'Nature', '__proto__']) {
    assert.equal(archipelagoDestinationId(categoryId, completed), null);
  }
  assert.deepEqual(completed, { 'typhoon-home': 3 });
});

void test('four brush-labelled islands include the first-aid map preview', () => {
  assert.deepEqual(archipelagoIslands.map(island => island.id), ['nature', 'public', 'home', 'first-aid']);
  assert.deepEqual(archipelagoIslands.filter(island => island.available).map(island => island.id), journeyCategories.map(category => category.id));
  assert.equal(archipelagoIslands[3].name, '急救生命守护');
  assert.equal(archipelagoDestinationId('first-aid', {}), 'first-aid-abrasion');
});
