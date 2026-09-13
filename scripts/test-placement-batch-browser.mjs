import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH ??
    'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);
const dir = resolve(process.argv[2] ?? 'outputs/e07-final-candidate'),
  out = resolve('outputs/e07-batch-browser');
mkdirSync(out, { recursive: true });
const report = {
  tests: [],
  errors: [],
  audio: [],
  listening: 'not_run',
  physicalDevice: 'not_run',
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
    viewport: { width: 1440, height: 1080 },
  });
  page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(pathToFileURL(join(dir, '开始试玩.html')).href);
  await page.locator('.pl-app[data-ready="true"]').waitFor();
  const app = page.locator('.pl-app'),
    b = (name) => page.getByRole('button', { name, exact: true }),
    log = async () => JSON.parse(await app.getAttribute('data-audio-log'));
  const reset = async () => {
    await b('重置本轮').click();
    await b('开始试玩').click();
  };
  const place = async (source, target) => {
    await b(source).click();
    await page
      .locator('.pl-targets')
      .getByRole('button', { name: target, exact: true })
      .click();
  };
  const goal = (id) =>
    page.waitForFunction(
      (id) =>
        document
          .querySelector('.pl-app')
          .getAttribute('data-resolved')
          .split(',')
          .includes(id),
      id,
    );
  for (const [target, event] of [
    ['楼梯方向', 'early-stairs'],
    ['门框', 'doorframe'],
    ['阳台', 'balcony'],
    ['高柜内部', 'wardrobe'],
  ]) {
    await reset();
    await place('人物', target);
    await page.waitForTimeout(950);
    const events = await log();
    assert.ok(events.some((e) => e.event === event));
    assert.ok(
      events.some((e) => e.object === 'person' && e.event === 'return'),
    );
    assert.equal(await app.getAttribute('data-resolved'), '');
    report.audio.push(...events.filter((e) => e.object === 'person'));
    report.tests.push(`震中错误 ${event} 中断、回位、对应音效`);
  }
  await reset();
  await place('人物', '牢固桌下');
  await page.waitForTimeout(600);
  assert.ok((await log()).some((e) => e.event === 'blocked'));
  report.tests.push('前置条件不足使用阻止音效且不提交目标');
  await reset();
  await place('坐垫', '人物背部');
  await page.waitForTimeout(600);
  assert.ok((await log()).some((e) => e.event === 'miss'));
  assert.ok((await log()).some((e) => e.event === 'return'));
  report.tests.push('未命中与回位都有物品对应音效');
  await b('坐垫').click();
  await page
    .locator('.pl-targets')
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await page.waitForTimeout(150);
  assert.ok((await log()).filter((e) => e.event === 'return').length >= 2);
  report.tests.push('取消选择播放回位音效');
  await reset();
  await place('坐垫', '头颈部');
  await goal('protected');
  await place('人物', '牢固桌下');
  await goal('sheltered');
  const grip = b('手抓牢（长按）');
  await grip.scrollIntoViewIfNeeded();
  let box = await grip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.move(box.x + box.width + 40, box.y);
  await page.waitForTimeout(1700);
  await page.mouse.up();
  assert.ok(!(await app.getAttribute('data-resolved')).includes('held'));
  report.tests.push('长按移出可见区域取消，不会在外部累计成功');
  await b('暂停').click();
  const loaded = JSON.parse(
    readFileSync(join(dir, '全部关卡.batch.json'), 'utf8'),
  );
  const kitchen = JSON.parse(
    readFileSync(resolve('outputs/kitchen-v2.placement.json'), 'utf8'),
  );
  loaded.results.push({
    id: kitchen.pack.rules.id,
    title: kitchen.pack.rules.title,
    status: 'ready',
    project: kitchen,
    issues: [],
    simulation: [],
  });
  const inputFile = join(out, 'two-scenes.batch.json');
  writeFileSync(inputFile, JSON.stringify(loaded));
  await page.getByLabel('策划案文件').setInputFiles(inputFile);
  await page.locator('.pl-app[data-ready="true"]').waitFor();
  loaded.results[0].title += ' · 重导入检查';
  loaded.results[0].project.pack.rules.title = loaded.results[0].title;
  writeFileSync(inputFile, JSON.stringify(loaded));
  await page.getByLabel('策划案文件').setInputFiles(inputFile);
  await page
    .getByRole('heading', { name: loaded.results[0].title, exact: true })
    .waitFor();
  report.tests.push('同名批次再次导入确实替换当前关卡');
  await page.getByLabel('批量关卡').selectOption('1');
  await page
    .locator('.pl-app[data-ready="true"][data-stage="single"]')
    .waitFor();
  await b('开始试玩').click();
  await b('燃气开关').click();
  await goal('gas-off');
  await place('锅盖', '油锅接收区');
  await goal('covered');
  await place('人物', '门外安全区');
  await goal('evacuated');
  await page.waitForFunction(
    () =>
      document.querySelector('.pl-app').getAttribute('data-phase') ===
      'complete',
  );
  assert.ok((await log()).some((e) => e.event === 'cover'));
  report.tests.push('同一工作台切换厨房场景并实际通关，锅盖有对应音效');
  await page.getByLabel('批量关卡').selectOption('0');
  await page
    .getByRole('heading', { name: loaded.results[0].title, exact: true })
    .waitFor();
  assert.equal(await app.getAttribute('data-resolved'), '');
  report.tests.push('切回 E07 不串关卡进度');
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  if (page)
    await page.screenshot({ path: join(out, 'failure.png'), fullPage: true });
  throw error;
} finally {
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
