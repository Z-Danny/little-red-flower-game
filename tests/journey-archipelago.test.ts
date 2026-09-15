import test from 'node:test';
import assert from 'node:assert/strict';
import { archipelagoDestinationId } from '../app/game/journey/archipelago';
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
        nodes[count]?.id ?? nodes[0].id,
        `${category.id}: select the next available level, or the entry after all levels are complete`,
      );
      assert(canEnter(destination!, completed));
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
      assert(canEnter(destination!, completed));
      assert.equal(nodeStatus(destination!, completed), 'available');
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
