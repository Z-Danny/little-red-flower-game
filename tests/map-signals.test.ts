import test from 'node:test';
import assert from 'node:assert/strict';
import {
  signalConfig,
  signalFor,
  sceneAtPoint,
} from '../app/game/journey/signals';
import { journeyMap, regionFor } from '../app/game/journey/progress';
import {
  motionConfig,
  motionFor,
  sampleMotion,
} from '../app/game/journey/motion';
void test('earthquake masonry falls, rebounds and rests; post-quake evacuation stays calm', () => {
  const stones = motionFor('quake')!.tracks.filter((t) => t.asset === 'stone');
  assert(stones.length >= 3);
  for (const stone of stones) {
    assert(sampleMotion(stone, 0.5).y > sampleMotion(stone, 0.25).y);
    assert(sampleMotion(stone, 0.625).y < sampleMotion(stone, 0.5).y);
    assert.equal(sampleMotion(stone, 0.875).y, sampleMotion(stone, 1).y);
  }
  assert(
    !motionFor(signalFor('quake-exit-practice')!.motion)!.tracks.some(
      (t) => t.asset === 'stone',
    ),
  );
});
void test('life corridor restores a larger dashed route without changing other routes', () => {
  const recipe = motionFor(signalFor('clear-corridor')!.motion)!;
  const cue = recipe.cues?.find((c) => c.kind === 'route');
  assert(cue && cue.kind === 'route');
  assert(cue.width! > 3 && cue.dash![0] > 5);
  assert(!recipe.cues?.some((c) => c.kind === 'footsteps'));
  assert.equal(motionFor('exit')!.cues?.[0].kind, 'route');
});
void test('every real level has its own scene attachment and appropriate effect', () => {
  assert.deepEqual(
    Object.keys(signalConfig.nodes).sort(),
    journeyMap.regions.flatMap((r) => r.nodes.map((n) => n.id)).sort(),
  );
  assert.equal(signalFor('oil-fire')?.effect, 'fire');
  assert.equal(signalFor('charging-bedroom')?.effect, 'electric');
  assert.equal(signalFor('flood-house-response-v1')?.effect, 'water');
  assert.equal(signalFor('typhoon-home')?.effect, 'wind');
  for (const id of Object.keys(signalConfig.nodes)) {
    const s = signalFor(id)!,
      r = regionFor(id)!;
    assert(
      s.anchor.x - s.width / 2 >= 0 && s.anchor.x + s.width / 2 <= r.width,
      id,
    );
    assert(s.anchor.y > 0 && s.anchor.y <= r.height, id);
    assert(s.height > 0 && s.height <= 300);
    assert(s.particles >= 0 && s.particles <= 24);
    assert(s.restOpacity >= 0 && s.restOpacity < 0.4);
    assert(s.seconds >= 1.5);
  }
});
void test('scene hit areas follow the building and do not activate empty map space', () => {
  for (const region of journeyMap.regions) {
    const ids = region.nodes.map((n) => n.id);
    for (const id of ids) {
      const area = signalFor(id)!.hitArea!;
      assert(area.x >= 0 && area.y >= 0);
      assert(area.x + area.width <= region.width);
      assert(area.y + area.height <= region.height);
      assert.equal(
        sceneAtPoint(ids, area.x + area.width / 2, area.y + area.height / 2),
        id,
      );
    }
    assert.equal(sceneAtPoint(ids, -1, -1), null);
  }
  assert.equal(sceneAtPoint(['future'], 100, 100), null);
});
void test('scene art remains optional and layout is independent from reusable preset', () => {
  assert.equal(signalFor('future'), undefined);
  const copy = structuredClone(signalConfig);
  copy.nodes.future = {
    preset: 'fire',
    label: '新厨房',
    anchor: { x: 120, y: 200 },
    width: 140,
    image: '/levels/journey-map/fire.webp',
  };
  assert.equal(signalFor('future', copy)?.effect, 'fire');
  assert.equal(signalFor('future', copy)?.width, 140);
  assert.equal(signalFor('future', copy)?.particles, 12);
  assert.equal(signalFor('future'), undefined);
});
void test('painted recipes cover every non-fire level and use bounded reusable tracks', () => {
  for (const region of journeyMap.regions)
    for (const node of region.nodes) {
      const signal = signalFor(node.id)!;
      if (signal.effect === 'fire') {
        assert.equal(signal.motion, undefined);
        continue;
      }
      const recipe = motionFor(signal.motion);
      assert(recipe, node.id);
      for (const track of recipe.tracks) {
        assert.equal(track.path.length, 4);
        assert.equal(track.size.length, 2);
        assert(track.size.every((n) => Number.isFinite(n) && n > 0));
        assert(
          motionConfig.assets[track.asset]?.startsWith(
            '/levels/journey-map/signals/',
          ),
        );
        assert(track.seconds >= 0.6 && track.seconds <= 8);
        assert((track.copies ?? 1) <= 4);
        for (const point of track.path) {
          assert.equal(point.length, 2);
          assert(point.every(Number.isFinite));
        }
      }
    }
  assert.equal(motionFor('missing'), undefined);
});
void test('curve starts and ends at configured points with independent scale and rotation', () => {
  const track = motionConfig.recipes.wind.tracks[0];
  const start = sampleMotion(track, 0),
    end = sampleMotion(track, 1),
    middle = sampleMotion(track, 0.5);
  assert.deepEqual([start.x, start.y], track.path[0]);
  assert.deepEqual([end.x, end.y], track.path[3]);
  assert.equal(start.scale, track.scale![0]);
  assert.equal(end.rotate, track.rotate![1]);
  assert.notEqual(
    middle.x,
    (start.x + end.x) / 2,
    'wind needs a curved trajectory',
  );
});
void test('enhanced cues match stopped lift, directional wind, anchored sparks and smoke refuge', () => {
  for (const id of ['lift-wait', 'lift-contact-practice']) {
    const recipe = motionFor(signalFor(id)!.motion)!;
    assert(recipe.cues?.some((c) => c.kind === 'call'));
    assert(
      recipe.tracks.every((t) => t.asset !== 'electric' && t.asset !== 'water'),
    );
    for (const t of recipe.tracks)
      assert(
        t.path.every((p) => p[0] === t.path[0][0] && p[1] === t.path[0][1]),
      );
  }
  const electric = motionFor('electric')!.tracks;
  assert(electric.filter((t) => t.envelope === 'burst').length >= 2);
  assert(
    electric
      .filter((t) => t.envelope === 'burst')
      .every(
        (t) =>
          t.pivot &&
          t.pivot[1] >= 0.75 &&
          t.path.every((p) => p[0] === 80 && p[1] === 171),
      ),
  );
  const leaves = motionFor('wind')!.tracks.filter((t) => t.asset === 'leaves');
  assert(leaves.length >= 5);
  assert(
    leaves.every((t) => t.path[3][0] - t.path[0][0] > 150 && t.seconds < 1.6),
  );
  assert.equal(signalFor('quake-exit-practice')?.motion, 'evacuate');
  assert.equal(signalFor('fire-shelter-practice')?.effect, 'smoke');
});
