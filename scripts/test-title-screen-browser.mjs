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
const file = path.join(root, 'outputs/本地离线版/小红花应急行动.html');
const out = path.join(root, 'docs/flower-journey/title-screen-verification');
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
const board = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1')),
  );
const location = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem('little-red-flower-journey-location-v1')),
  );
let p;
try {
  p = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  p.on('pageerror', (e) => report.errors.push(e.message));
  p.on('request', (r) => {
    if (/^https?:/.test(r.url())) report.network.push(r.url());
  });
  await p.goto(pathToFileURL(file).href);
  await p.locator('[data-title-screen]').waitFor();
  await p.getByRole('button', { name: '关闭奖励声音', exact: true }).click();
  assert(await p.getByRole('button', { name: '打开奖励声音', exact: true }).isVisible());
  await p.getByRole('button', { name: '打开奖励声音', exact: true }).click();
  check('reward sound control identifies its scope and toggles');
  await p.evaluate(() => document.fonts.ready);
  assert(await p.locator('[data-home-continue]').isDisabled());
  assert(
    await p
      .locator('.title-art')
      .evaluate(
        (n) =>
          n.complete && n.naturalWidth > 500 && n.src.startsWith('data:image/'),
      ),
  );
  const fresh = await board(p),
    firstId = fresh.activePlayerId;
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [540, 960],
    [1440, 900],
  ]) {
    await p.setViewportSize({ width, height });
    const geometry = await p.locator('[data-title-screen]').evaluate((n) => {
      const controls = [...n.querySelectorAll('button')].map((b) => {
        const r = b.getBoundingClientRect();
        return {
          text: b.textContent || b.getAttribute('aria-label'),
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
        };
      });
      const h = n.querySelector('header').getBoundingClientRect(),
        m = n.querySelector('.title-menu').getBoundingClientRect();
      return {
        controls,
        overflow: document.documentElement.scrollWidth > innerWidth,
        overlap: h.bottom > m.top,
      };
    });
    assert(!geometry.overflow && !geometry.overlap, JSON.stringify(geometry));
    for (const c of geometry.controls)
      assert(
        c.w >= 44 &&
          c.h >= 44 &&
          c.x >= 0 &&
          c.y >= 0 &&
          c.x + c.w <= width + 1 &&
          c.y + c.h <= height + 1,
        JSON.stringify(c),
      );
    await p.screenshot({ path: path.join(out, `home-fresh-${width}.png`) });
    check(`title layout and 44px controls ${width}x${height}`);
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.locator('[data-home-start]').focus();
  await p.keyboard.press('Enter');
  await p.locator('.garden-node').first().waitFor();
  assert.deepEqual((await board(p)).players, fresh.players);
  check('keyboard start enters map without changing saved rewards');
  await p.locator('[data-category="public"]').click();
  await p.locator('[data-map-node="clear-corridor"]').scrollIntoViewIfNeeded();
  await p.locator('[data-map-node="clear-corridor"]').click();
  await p.getByRole('button', { name: '关闭', exact: true }).click();
  await p.getByRole('button', { name: '返回游戏首页', exact: true }).click();
  assert(await p.locator('[data-home-continue]').isEnabled());
  assert.equal((await location(p))[firstId].levelId, 'clear-corridor');
  await p.reload();
  await p.locator('[data-home-continue]').click();
  await p.locator('[data-category="public"][aria-pressed="true"]').waitFor();
  const b = await p.locator('[data-map-node="clear-corridor"]').boundingBox();
  assert(b && b.y > 0 && b.y < 800, 'resumed node visible');
  assert.deepEqual((await board(p)).players, fresh.players);
  check(
    'continue restores selected public map node after reload without unlocking or rewarding',
  );
  await p.getByRole('button', { name: '返回游戏首页', exact: true }).click();
  await p.locator('.title-board').click();
  await p.getByRole('button', { name: '添加玩家', exact: true }).click();
  await p.locator('#lb-name').fill('首页独立玩家');
  await p.getByRole('button', { name: '添加并切换玩家', exact: true }).click();
  await p.getByRole('button', { name: '返回关卡首页', exact: true }).click();
  assert(await p.locator('[data-home-continue]').isDisabled());
  await p.locator('[data-home-start]').click();
  await p.locator('[data-category="home"]').click();
  await p.getByRole('button', { name: '返回游戏首页', exact: true }).click();
  await p.locator('.title-board').click();
  await p
    .getByRole('button', {
      name: '切换为 ' + fresh.players[0].name,
      exact: true,
    })
    .click();
  await p.getByRole('button', { name: '返回关卡首页', exact: true }).click();
  assert(await p.locator('[data-home-continue]').isEnabled());
  assert.equal((await location(p))[firstId].levelId, 'clear-corridor');
  check('new player and returning player keep independent map bookmarks');
  // Legacy save fixture: intentionally seed known old completion data, never claim it was earned in this test.
  await p.evaluate(() => {
    const key = 'little-red-flower-leaderboard-v1',
      s = JSON.parse(localStorage.getItem(key));
    s.players.find((p) => p.id === s.activePlayerId).completed = {
      'oil-fire': 3,
    };
    localStorage.setItem(key, JSON.stringify(s));
    localStorage.removeItem('little-red-flower-journey-location-v1');
  });
  await p.reload();
  await p.locator('[data-home-continue]').waitFor();
  assert(await p.locator('[data-home-continue]').isEnabled());
  assert.equal(await p.locator('[data-home-flowers]').innerText(), '3');
  await p.screenshot({ path: path.join(out, 'home-returning-390.png') });
  const legacy = await board(p);
  await p.locator('[data-home-continue]').click();
  await p.locator('.garden-node').first().waitFor();
  assert.deepEqual((await board(p)).players, legacy.players);
  check('legacy save enables continue and retains existing flowers');
  await p.evaluate(() =>
    localStorage.setItem('little-red-flower-journey-location-v1', '{malformed'),
  );
  await p.reload();
  await p.locator('[data-home-continue]').click();
  await p.locator('.garden-node').first().waitFor();
  assert.deepEqual((await board(p)).players, legacy.players);
  check('malformed navigation bookmark does not damage leaderboard save');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.network, []);
  check(
    'standalone embedded artwork with no network requests or browser errors',
  );
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.failure = e.stack;
  process.exitCode = 1;
  console.error(e);
  await p?.screenshot({ path: path.join(out, 'FAIL.png') }).catch(() => {});
} finally {
  await browser.close();
  report.browserClosed = true;
  fs.writeFileSync(
    path.join(out, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
