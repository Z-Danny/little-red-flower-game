import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  createJobs,
  cli,
  catalog,
  readPack,
  getHuntRuntime,
  generatePrompts,
} from './hunts.mjs';
import { root } from './lib/dependencies.mjs';
const rt = await getHuntRuntime();
const fixture = () => {
  const base = fs.mkdtempSync(path.join(tmpdir(), 'hunt-pipeline-test-'));
  for (const p of [
    'content/scenes',
    'content/disaster',
    'content/levels',
    'art-source',
  ])
    fs.mkdirSync(path.join(base, p), { recursive: true });
  fs.cpSync(
    path.join(root, 'content/hunt-template'),
    path.join(base, 'content/hunt-template'),
    { recursive: true },
  );
  fs.writeFileSync(path.join(base, 'content/catalog.json'), '[]');
  fs.writeFileSync(path.join(base, 'content/scenes/catalog.json'), '[]');
  return base;
};
const packs = catalog().map((e) => readPack(e));
for (const p of packs)
  for (const [w, h] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [430, 932],
    [540, 960],
    [600, 900],
    [1440, 900],
  ])
    test(`${p.rules.id}: shared full-frame + equal scale + inverse ${w}x${h}`, () => {
      const f = rt.phoneFrame(p.skin, w, h),
        c = rt.sceneCamera(p.skin, f.width, f.height);
      assert.equal(f.y, 0);
      if (w <= 600 && h >= w) {
        assert.equal(f.width, w);
        assert.equal(f.height, h);
      } else {
        assert.ok(f.width <= 520);
        assert.ok(f.height <= h);
      }
      assert.equal(c.scaleX, c.scaleY);
      assert.ok(c.x <= 0.001 && c.y <= 0.001);
      assert.ok(
        c.x + p.skin.width * c.scaleX >= f.width - 0.001 &&
          c.y + p.skin.height * c.scaleY >= f.height - 0.001,
      );
      const rect = { left: f.x, top: 0, width: f.width, height: f.height };
      const a = rt.pointerToScene(
        p.skin,
        rect,
        f.x + c.x + 300 * c.scaleX,
        c.y + 500 * c.scaleY,
      );
      assert.ok(Math.abs(a.x - 300) < 1e-8 && Math.abs(a.y - 500) < 1e-8);
      const row = rt.clueLayout(p.skin, f.width, f.height);
      assert.equal(row.column, false);
      assert.ok(row.left >= 0);
      assert.ok(
        row.left +
          p.rules.targets.length * row.tileW +
          (p.rules.targets.length - 1) * row.gap <=
          f.width + 0.001,
      );
    });
test('whole batch is rejected before writing any first draft', () => {
  const base = fixture();
  assert.throws(() =>
    createJobs(
      [
        { id: 'a', title: 'A', order: 23 },
        { id: '../../bad', title: 'B', order: 24 },
      ],
      base,
    ),
  );
  assert.deepEqual(catalog(base), []);
  assert.equal(fs.existsSync(path.join(base, 'content/scenes/a')), false);
});
for (const count of [3, 4, 5, 6])
  test(`create and prompt ${count} targets, no copied game code or art`, () => {
    const base = fixture();
    createJobs([{ id: 'new-room', title: '测试观察', order: 23, count }], base);
    const [e] = catalog(base),
      p = readPack(e, base);
    assert.equal(e.enabled, false);
    assert.equal(p.rules.targets.length, count);
    assert.ok(!e.migrated);
    rt.checkHunt(p);
    const output = fs.readFileSync(generatePrompts(e, base), 'utf8');
    assert.ok(output.includes('测试观察'));
    assert.ok(output.includes('Architecture & Space'));
    assert.ok(output.includes('等比'));
    assert.equal(/\{\{[A-Z]+\}\}/.test(output), false);
    assert.equal(fs.existsSync(path.join(base, 'components')), false);
    assert.equal(fs.existsSync(path.join(base, 'public')), false);
  });
test('ID/order collision and wrong count reject without catalog mutation', () => {
  const base = fixture();
  createJobs([{ id: 'room-a', title: 'A', order: 23 }], base);
  const before = fs.readFileSync(
    path.join(base, 'content/scenes/catalog.json'),
    'utf8',
  );
  for (const j of [
    { id: 'room-a', title: 'A', order: 24 },
    { id: 'room-b', title: 'B', order: 23 },
    { id: 'room-c', title: 'C', order: 25, count: 7 },
  ])
    assert.throws(() => createJobs([j], base));
  assert.equal(
    fs.readFileSync(path.join(base, 'content/scenes/catalog.json'), 'utf8'),
    before,
  );
});
test('style clone isolates paths, leaves rules and selected skin untouched', async () => {
  const base = fixture();
  createJobs([{ id: 'room', title: 'A', order: 23 }], base);
  const rules = fs.readFileSync(
    path.join(base, 'content/scenes/room/rules.json'),
    'utf8',
  );
  await cli(['skin', '--id', 'room', '--name', 'watercolor'], base);
  assert.equal(
    fs.readFileSync(path.join(base, 'content/scenes/room/rules.json'), 'utf8'),
    rules,
  );
  assert.equal(catalog(base)[0].skin, 'skins/paperbook.json');
  const s = JSON.parse(
    fs.readFileSync(
      path.join(base, 'content/scenes/room/skins/watercolor.json'),
    ),
  );
  assert.ok(s.scene.includes('/watercolor/'));
  assert.ok(!s.scene.includes('/paperbook/'));
  await assert.rejects(
    cli(['skin', '--id', 'room', '--name', 'watercolor'], base),
  );
  await assert.rejects(cli(['enable', '--id', 'room'], base));
});
test('new skin crop audit blocks unsafe border objects; does not shift them', () => {
  const p = structuredClone(packs[2]),
    before = JSON.stringify(p.skin);
  const issues = rt.auditHuntViewport(p.skin);
  assert.ok(issues.length > 0);
  assert.equal(JSON.stringify(p.skin), before);
  p.skin.targets = Object.fromEntries(
    p.rules.targets.map((t, i) => [
      t.id,
      {
        ...p.skin.targets[t.id],
        bounds: { x: 200, y: 360 + i * 110, w: 70, h: 80 },
      },
    ]),
  );
  p.skin.criticalRegions = [{ x: 320, y: 1000, w: 70, h: 80 }];
  assert.deepEqual(rt.auditHuntViewport(p.skin), []);
});
test('unknown check ID rejects instead of silently checking other levels', async () => {
  await assert.rejects(cli(['check', '--id', 'unknown'], fixture()));
});
test('new production working card binds skin identity and draft hash', async () => {
  const base = fixture();
  createJobs([{ id: 'room', title: 'A', order: 23, count: 3 }], base);
  const f = await cli(
      ['production', '--id', 'room', '--name', 'paperbook'],
      base,
    ),
    s = JSON.parse(fs.readFileSync(f));
  assert.equal(s.pipelineVersion, 3);
  assert.equal(s.targets.length, 3);
  assert.equal(s.draftSkinSha256.length, 64);
  assert.equal(s.sourceSha256, 'TODO');
  await assert.rejects(
    cli(['production', '--id', 'room', '--name', 'paperbook'], base),
  );
});
