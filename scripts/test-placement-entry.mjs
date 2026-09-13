import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { root } from './lib/dependencies.mjs';
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH ??
    'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);
const html = resolve(
    root,
    process.argv[2] ?? 'outputs/本地离线版/小红花应急行动.html',
  ),
  out = resolve(
    root,
    process.argv[3] ?? 'outputs/placement-entry-verification',
  );
mkdirSync(out, { recursive: true });
const report = {
  html,
  sha256: createHash('sha256').update(readFileSync(html)).digest('hex'),
  checks: [],
  errors: [],
  network: [],
  browserClosed: false,
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EDGE_PATH ??
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--mute-audio'],
});
let page;
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(String(e)));
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) report.network.push(r.url());
  });
  await page.goto(pathToFileURL(html).href, {
    waitUntil: 'load',
    timeout: 90000,
  });
  await page.locator('.garden-node').first().waitFor();
  const before = await page.evaluate(() =>
    localStorage.getItem('little-red-flower-leaderboard-v1'),
  );
  await page.getByRole('button', { name: /打开守护档案/ }).click();
  await page.getByRole('button', { name: '放置测试引擎', exact: true }).click();
  await page.locator('[data-placement-engine][data-ready=true]').waitFor();
  report.checks.push('正式游戏档案入口打开测试引擎');
  await page.getByRole('button', { name: '开始试玩', exact: true }).click();
  const done = async (goal) =>
    page.waitForFunction(
      (g) =>
        document
          .querySelector('[data-placement-engine]')
          .dataset.resolved.split(',')
          .includes(g),
      goal,
    );
  const b = (name) => page.getByRole('button', { name, exact: true });
  const place = async (source, target) => {
    await b(source).click();
    await page
      .locator('.pl-targets')
      .getByRole('button', { name: target, exact: true })
      .click();
  };
  await place('坐垫', '头颈部');
  await done('protected');
  await place('人物', '牢固桌下');
  await done('sheltered');
  const grip = b('手抓牢（长按）');
  await grip.scrollIntoViewIfNeeded();
  const box = await grip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1630);
  await page.mouse.up();
  await done('held');
  await page.waitForFunction(
    () => document.querySelector('.pl-app').dataset.stage === 'after',
  );
  await b('观察周围').click();
  await done('checked');
  await b('关闭燃气').click();
  await done('gas-off');
  await place('鞋', '人物脚部');
  await done('shoes-on');
  await place('应急包', '人物背部');
  await done('bag-on');
  await place('人物', '楼梯方向');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-placement-engine]').dataset.phase ===
      'complete',
  );
  assert.equal(
    Number(await page.locator('.pl-app').getAttribute('data-object-audio')),
    52,
  );
  report.checks.push('正式单文件中的 E07 两阶段可通关且 52 条音效已加载');
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem('little-red-flower-leaderboard-v1'),
    ),
    before,
  );
  report.checks.push('测试通关不修改正式游戏进度');
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({ path: join(out, 'main-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '返回游戏', exact: true }).click();
  await page.locator('.garden-node').first().waitFor();
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem('little-red-flower-leaderboard-v1'),
    ),
    before,
  );
  report.checks.push('可返回原游戏，存档保持不变');
  await page.goto(pathToFileURL(html).href + '#placement-test', {
    waitUntil: 'load',
    timeout: 90000,
  });
  await page.locator('[data-placement-engine][data-ready=true]').waitFor();
  report.checks.push('独立 hash 入口有效');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.network, []);
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.failure = String(e);
  if (page)
    await page
      .screenshot({ path: join(out, 'failure.png'), fullPage: true })
      .catch(() => {});
  throw e;
} finally {
  await browser.close();
  report.browserClosed = true;
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
