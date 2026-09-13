import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..'),
  require = createRequire(import.meta.url);
const {
  chromium,
} = require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const file = path.join(root, 'outputs/本地离线版/小红花应急行动.html'),
  out = path.join(root, 'docs/flower-journey/corridor-dash-verification');
fs.mkdirSync(out, { recursive: true });
const report = {
  status: 'running',
  sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  checks: [],
  errors: [],
  network: [],
  browserClosed: false,
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--mute-audio'],
});
const check = (name) => {
  report.checks.push(name);
  console.log('PASS ' + name);
};
const save = (p) =>
  p.evaluate(() => localStorage.getItem('little-red-flower-leaderboard-v1'));
try {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', (e) => report.errors.push(e.message));
  p.on('request', (r) => {
    if (/^https?:/.test(r.url())) report.network.push(r.url());
  });
  await p.goto(pathToFileURL(file).href);
  await p.locator('[data-home-start]').click();
  await p.locator('.garden-node').first().waitFor();
  const before = await save(p);
  for (const [width, height] of [
    [320, 568],
    [390, 844],
  ]) {
    await p.setViewportSize({ width, height });
    for (const id of [
      'quake-bedroom-v2',
      'quake-cover-practice',
      'clear-corridor',
    ]) {
      await p
        .locator(
          `[data-category="${id === 'clear-corridor' ? 'public' : 'nature'}"]`,
        )
        .click();
      const node = p.locator(`[data-map-node="${id}"]`);
      await node.scrollIntoViewIfNeeded();
      await node.hover();
      await p.waitForTimeout(400);
      const fx = node.locator('.fx-scene');
      assert.equal(await fx.evaluate((n) => getComputedStyle(n).opacity), '1');
      for (let frame = 0; frame < 3; frame++) {
        await p.screenshot({
          path: path.join(out, `${id}-${width}-${frame}.png`),
        });
        await p.waitForTimeout(220);
      }
      if (id === 'clear-corridor') {
        assert.equal(await node.locator('.fx-footstep').count(), 0);
        const route = node.locator('.fx-route-cue');
        assert.equal(await route.getAttribute('stroke-width'), '8');
        assert.equal(
          await route.evaluate((n) => getComputedStyle(n).strokeDasharray),
          '10px, 12px',
        );
        const offset = await route.evaluate(
          (n) => getComputedStyle(n).strokeDashoffset,
        );
        await p.waitForTimeout(200);
        assert.notEqual(
          await route.evaluate((n) => getComputedStyle(n).strokeDashoffset),
          offset,
        );
        await node.click();
        await p
          .getByRole('button', { name: '进入场景', exact: true })
          .waitFor();
        await p.getByRole('button', { name: '关闭', exact: true }).click();
      } else {
        const stone = node.locator('[data-envelope="fall"]').first();
        assert.equal(await node.locator('[data-envelope="fall"]').count(), 5);
        assert(
          (await stone.locator('image').getAttribute('href')).startsWith(
            'data:image/',
          ),
        );
        const sample = async (t) =>
          stone.evaluate(async (n, t) => {
            const a = n.getAnimations()[0];
            a.pause();
            const timing = a.effect.getTiming();
            a.currentTime = timing.delay + Number(timing.duration) * t;
            await new Promise(requestAnimationFrame);
            const b = n.getBoundingClientRect();
            return b.y + b.height / 2;
          }, t);
        const early = await sample(0.25),
          ground = await sample(0.5),
          bounce = await sample(0.625);
        assert(ground > early + 15);
        assert(bounce < ground - 3);
        await stone.evaluate((n) => n.getAnimations()[0].play());
      }
      assert.equal(await save(p), before);
      check(`${id} visible motion and entry ${width}`);
    }
  }
  await p.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await p
      .locator('.map-signal')
      .evaluateAll(
        (ns) => ns.flatMap((n) => n.getAnimations({ subtree: true })).length,
      ),
    0,
  );
  check('reduced-motion mode');
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  await p.locator('[data-category="nature"]').click();
  const node = p.locator('[data-map-node="quake-cover-practice"]');
  await node.scrollIntoViewIfNeeded();
  await node.hover();
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const key = 'little-red-flower-leaderboard-v1',
      s = JSON.parse(localStorage.getItem(key));
    s.players.find((x) => x.id === s.activePlayerId).completed[
      'quake-cover-practice'
    ] = 3;
    localStorage.setItem(key, JSON.stringify(s));
  });
  await p.reload();
  await p.locator('[data-home-continue]').click();
  await p.locator('.garden-node').first().waitFor();
  const completed = p.locator('[data-map-node="quake-cover-practice"]');
  await completed.scrollIntoViewIfNeeded();
  await p.mouse.move(1, 1);
  await p.waitForTimeout(400);
  assert.equal(
    await completed
      .locator('.fx-scene')
      .evaluate((n) => getComputedStyle(n).visibility),
    'hidden',
  );
  await completed.hover();
  await p.waitForTimeout(400);
  assert.equal(
    await completed
      .locator('.fx-scene')
      .evaluate((n) => getComputedStyle(n).visibility),
    'visible',
  );
  check(
    'completed earthquake scene is safe by default and supports hover replay',
  );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.network, []);
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.failure = String(e.stack ?? e);
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  report.browserClosed = true;
  fs.writeFileSync(
    path.join(out, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
