/** Regression for the user's request to undo the third/fourth-level redesign. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {getHunt} from '../app/game/scene-hunt/registry';
import {lessonFor} from '../app/game/journey/knowledge';
const original='7fdf82b';
for(const id of ['quake-bedroom-v2','storm-street-check-v2']) {
  test(id+' restores exact original art, rules and presentation',()=>{
    const pack=getHunt(id)!;
    for(const name of ['skin.json','rules.json','presentation.json']) {
      const file=`content/scenes/${id}/${name}`;
      assert.deepEqual(fs.readFileSync(file),execFileSync('git',['show',original+':'+file]));
    }
    assert.equal(pack.skin.scene,`/levels/hazard-batch-v2/${id}/scene.webp`);
    assert.equal(pack.rules.targets.length,5);
    assert.equal(pack.rules.seconds,50);
    assert(!('targetFeedback' in pack.presentation!));
    assert(!('retainLastLesson' in pack.presentation!));
    assert(!('compareEnding' in pack.presentation!));
    assert(!('question' in lessonFor(id)));
  });
}
test('unrelated timing/persistence and kitchen failure changes remain',()=>{
  const scene=fs.readFileSync('components/game/scene-hunt/player.tsx','utf8');
  assert.match(scene,/elapsedMs: r\.elapsed/);
  const settlement=fs.readFileSync('components/game/journey/settlement.tsx','utf8');
  assert.match(settlement,/persistence/);assert.match(settlement,/rewardRuleLabel/);
  assert(!settlement.includes('LearningReview'));
  assert.match(fs.readFileSync('content/response/kitchen-experience.json','utf8'),/"failureFeedback": 1900/);
});
