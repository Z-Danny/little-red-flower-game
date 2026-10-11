/** Real offline settings interactions, isolated saves, muted browser, always closed. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const file = path.resolve(
  process.argv[2] ?? 'outputs/本地离线版/小红花应急行动.html',
);
const out = path.resolve(process.argv[3] ?? 'outputs/settings-verification');
fs.mkdirSync(out, { recursive: true });
const report = {
  file,
  sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  checks: [],
  errors: [],
  external: [],
  physicalDevice: 'not_run',
  humanListening: 'not_run',
  browserClosed: false,
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EDGE_PATH ??
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--mute-audio'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
  hasTouch: true,
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', (e) => report.errors.push(e.message));
page.on('request', (r) => {
  if (/^https?:/.test(r.url())) report.external.push(r.url());
});
const pass = (name) => {
  report.checks.push(name);
  console.log('PASS ' + name);
};
const open = async () => {
  await page.locator('[data-map-settings]').click();
  await page.getByRole('dialog', { name: '游戏设置', exact: true }).waitFor();
};
const board = () =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1')),
  );
const music = () =>
  page.getByRole('switch', { name: '背景音乐：首页与地图', exact: true });
const sound = () =>
  page.getByRole('switch', { name: '游戏音效：按钮与奖励', exact: true });
try {
  await context.addInitScript(() => {
    if (!localStorage.getItem('little-red-flower-leaderboard-v1'))
      localStorage.setItem(
        'little-red-flower-leaderboard-v1',
        JSON.stringify({
          version: 1,
          activePlayerId: 'settings-a',
          players: [
            {
              id: 'settings-a',
              name: '设置测试甲',
              region: '',
              createdAt: 1,
              completed: { 'typhoon-home': 3 },
            },
            {
              id: 'settings-b',
              name: '设置测试乙',
              region: '',
              createdAt: 2,
              completed: { 'clear-corridor': 3 },
            },
          ],
        }),
      );
  });
  await page.goto(pathToFileURL(file).href, {
    waitUntil: 'load',
    timeout: 90000,
  });
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await open();
  await page.locator('.settings-panel-art').evaluate((img) => img.decode());
  assert.equal(
    await page
      .locator('.painted-settings')
      .evaluate((e) => getComputedStyle(e).padding),
    '0px',
  );
  await page.screenshot({ path: path.join(out, '01-settings-on.png') });
  assert.equal(await music().getAttribute('aria-checked'), 'true');
  assert.equal(await sound().getAttribute('aria-checked'), 'true');
  await music().click();
  assert.equal(await music().getAttribute('aria-checked'), 'false');
  assert.equal(await sound().getAttribute('aria-checked'), 'true');
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem('red-flower:journey-music-muted'),
    ),
    'true',
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('.game-page')
        ?.getAttribute('data-journey-music-muted') === 'true',
  );
  await sound().focus();
  await page.keyboard.press('Space');
  assert.equal(await sound().getAttribute('aria-checked'), 'false');
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem('red-flower:interface-muted'),
    ),
    'true',
  );
  await page.screenshot({ path: path.join(out, '02-settings-off.png') });
  pass(
    'switches are independent, mouse and keyboard update real persisted audio settings',
  );
  await page.getByRole('button', { name: '返回游戏', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await open();
  assert.equal(await music().getAttribute('aria-checked'), 'false');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await open();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  pass('return, Escape and close button all dismiss the panel');
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await open();
  assert.equal(await music().getAttribute('aria-checked'), 'false');
  assert.equal(await sound().getAttribute('aria-checked'), 'false');
  pass('both switches retain their state after reloading the final HTML');
  const before = await board();
  let confirms = 0;
  page.once('dialog', async (d) => {
    confirms++;
    assert.equal(d.type(), 'confirm');
    await d.dismiss();
  });
  await page
    .getByRole('button', { name: '重置当前玩家记录', exact: true })
    .click();
  assert.equal(confirms, 1);
  assert.deepEqual(await board(), before);
  pass('cancel reset leaves both players untouched');
  page.once('dialog', async (d) => {
    confirms++;
    await d.accept();
  });
  await page
    .getByRole('button', { name: '重置当前玩家记录', exact: true })
    .click();
  await page.waitForFunction(() => {
    const s = JSON.parse(
      localStorage.getItem('little-red-flower-leaderboard-v1'),
    );
    return (
      Object.keys(s.players.find((p) => p.id === s.activePlayerId).completed)
        .length === 0
    );
  });
  const after = await board();
  assert.equal(confirms, 2);
  assert.deepEqual(
    after.players.find((p) => p.id === 'settings-b'),
    before.players.find((p) => p.id === 'settings-b'),
  );
  assert.equal(after.players[0].name, before.players[0].name);
  pass(
    'confirmed reset affects only current-player progress and preserves identity and other player',
  );
  for (const size of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(200);
    for (const control of [
      music(),
      sound(),
      page.getByRole('button', { name: '重置当前玩家记录', exact: true }),
      page.getByRole('button', { name: '返回游戏', exact: true }),
      page.getByRole('button', { name: '关闭', exact: true }),
    ]) {
      await control.scrollIntoViewIfNeeded();
      const b = await control.boundingBox();
      assert.ok(b.width >= 44 && b.height >= 44, '44px target');
      assert.ok(
        b.x >= 0 &&
          b.x + b.width <= size.width + 1 &&
          b.y >= -1 &&
          b.y + b.height <= size.height + 1,
        'control reachable',
      );
    }
    const overflow = await page
      .locator('.painted-settings')
      .evaluate((e) => e.scrollWidth > e.clientWidth + 1);
    assert.equal(overflow, false, 'no horizontal overflow');
    await page.locator('.painted-settings').evaluate((e) => (e.scrollTop = 0));
    await page.screenshot({
      path: path.join(out, `settings-${size.width}x${size.height}.png`),
    });
    pass(
      `layout ${size.width}x${size.height}: every control reachable, no horizontal overflow`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await music().focus();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(60);
    assert.equal(
      await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      ),
      true,
    );
  }
  pass('keyboard focus stays within modal');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.external, []);
  report.passed = true;
} catch (e) {
  await page
    .screenshot({ path: path.join(out, 'failure.png') })
    .catch(() => {});
  throw e;
} finally {
  await browser.close();
  report.browserClosed = true;
  fs.writeFileSync(
    path.join(out, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
