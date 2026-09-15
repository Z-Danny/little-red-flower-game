import test from 'node:test';
import assert from 'node:assert/strict';
import rules from '../content/levels/quake-cover-practice/level.json';
import skin from '../content/levels/quake-cover-practice/skins/paper-gouache.json';
import { createRun, reduceRun } from '../app/game/runtime/engine';
import { configuredPauseHint } from '../app/game/runtime/pause-hint';
import { validatePackage } from '../app/game/runtime/validate';
import type { Run } from '../app/game/runtime/schema';

const pack = validatePackage(rules, skin);
function begin(run: Run, id: string): Run {
  const rule = pack.rules.interactions.find(rule => rule.id === id)!;
  return reduceRun(pack, run, { type: 'interact', input: { source: rule.source, mode: rule.mode, target: rule.target } });
}
function finishAction(run: Run): Run {
  for (let n = 0; run.action && n < 100; n++) run = reduceRun(pack, run, { type: 'tick', ms: 100 });
  assert.equal(run.action, null);
  return run;
}
function waitingRun(): Run {
  let run = finishAction(begin(createRun(pack), 'combined-cover'));
  return finishAction(begin(run, 'grip-cover'));
}
function afterQuakeRun(): Run {
  let run = waitingRun();
  for (let n = 0; !run.stages?.includes('after-quake') && n < 100; n++) run = reduceRun(pack, run, { type: 'tick', ms: 100 });
  assert.ok(run.stages?.includes('after-quake'));
  return run;
}

test('pause hints follow available goals and do not repeat a completed action', () => {
  const initial = createRun(pack);
  assert.match(configuredPauseHint(pack, initial)!, /桌边成人/);
  const covered = finishAction(begin(initial, 'combined-cover'));
  assert.match(configuredPauseHint(pack, covered)!, /结实桌腿/);
  const checked = finishAction(begin(afterQuakeRun(), 'check-guidance'));
  assert.match(configuredPauseHint(pack, checked)!, /震后自查/);
  assert.doesNotMatch(configuredPauseHint(pack, checked)!, /电池收音机/);
});

test('timed waiting retains the current safety posture and never announces the future stage', () => {
  const run = waitingRun();
  assert.ok(run.resolved.includes('holding-cover'));
  assert.ok(!run.stages?.includes('after-quake'));
  const hint = configuredPauseHint(pack, run)!;
  assert.match(hint, /抓牢桌腿，另一臂继续护头/);
  assert.match(hint, /回到场景后继续等待/);
  assert.doesNotMatch(hint, /晃动停止|电池收音机|震后自查/);
  assert.notEqual(hint, pack.rules.briefing);
  assert.notEqual(hint, pack.rules.safety);
  assert.match(configuredPauseHint(pack, afterQuakeRun())!, /电池收音机/);
});

test('an unfinished action does not suggest its dependent next action', () => {
  const run = begin(afterQuakeRun(), 'check-guidance');
  assert.ok(run.action);
  assert.ok(!run.resolved.includes('guidance-checked'));
  const hint = configuredPauseHint(pack, run)!;
  assert.match(hint, /正在操作电池收音机/);
  assert.match(hint, /等待完成/);
  assert.doesNotMatch(hint, /震后自查|随身手机|观察电池收音机/);
});

test('reading hints preserves the entire run, notices and stage clocks', () => {
  for (const run of [createRun(pack), waitingRun(), afterQuakeRun(), begin(afterQuakeRun(), 'check-guidance')]) {
    const before = structuredClone(run);
    for (let n = 0; n < 5; n++) configuredPauseHint(pack, run);
    assert.deepEqual(run, before);
  }
});

test('settling and ended runs do not surface stale hints or briefing text', () => {
  for (const phase of ['settling', 'complete', 'failed'] as const) {
    assert.equal(configuredPauseHint(pack, { ...waitingRun(), phase }), undefined);
  }
});
