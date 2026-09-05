import assert from 'node:assert/strict';
import test from 'node:test';
import { getLevel } from '../app/game/levels';
import { completedGoalIds, decideObjective, isLevelComplete } from '../app/game/level-rules';

const level = getLevel('typhoon-home');
if (!level) throw new Error('typhoon-home level is missing');

void test('first level exposes five visible goals and a clean layered scene', () => {
  assert.equal(level.playable, true);
  assert.equal(level.goals.length, 5);
  assert.equal(level.previewImage, '/levels/typhoon-v2/room.png');
  assert.equal(level.safeImage, undefined);
});

void test('every catalog goal has a distinct 0.5–1.5 second treatment, with no repair crop', () => {
  const goals = level.objectives?.filter((objective) => level.goals.includes(objective.id)) ?? [];
  assert.equal(goals.length, 5);
  assert.deepEqual(goals.map((objective) => objective.label), ['花盆', '窗户', '晾衣杆', '插线板', '柜门']);
  assert.equal(new Set(goals.map((objective) => objective.treatment?.kind)).size, 5);
  for (const objective of goals) {
    assert.ok(objective.treatment);
    assert.ok((objective.treatment?.durationMs ?? 0) >= 500);
    assert.ok((objective.treatment?.durationMs ?? 0) <= 1500);
    assert.equal(objective.treatment?.repairClip, undefined);
  }
});

void test('power strip requires the recoverable cushion reveal step', () => {
  const resolved = new Set<string>();
  assert.equal(decideObjective(level, resolved, 'plug').status, 'blocked');
  assert.equal(decideObjective(level, resolved, 'cushion').status, 'ready');
  resolved.add('cushion');
  assert.equal(decideObjective(level, resolved, 'plug').status, 'ready');
  assert.equal(completedGoalIds(level, resolved).length, 0);
});

void test('all five hazard actions complete the level without counting the reveal step', () => {
  const resolved = new Set(['cushion', 'plant', 'window', 'rail', 'plug', 'cabinet']);
  assert.deepEqual(completedGoalIds(level, resolved), ['plant', 'window', 'rail', 'plug', 'cabinet']);
  assert.equal(isLevelComplete(level, resolved), true);
});

void test('unknown and repeated objectives never create progress', () => {
  const resolved = new Set(['window']);
  assert.equal(decideObjective(level, resolved, 'unknown').status, 'missing');
  assert.equal(decideObjective(level, resolved, 'window').status, 'already-done');
  assert.deepEqual(completedGoalIds(level, resolved), ['window']);
});

void test('risk feedback is staged before the non-blocking consequence', () => {
  const cues = (level.objectives ?? []).flatMap((objective) => objective.riskCue ? [objective.riskCue.threshold] : []);
  assert.deepEqual(cues, [36, 62, 82]);
  assert.ok(cues.every((threshold) => threshold < 100));
});
