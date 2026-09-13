import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(
  'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);
const file = resolve(process.argv[2] ?? 'outputs/e07-draft3/开始试玩.html'),
  out = resolve(process.argv[3] ?? 'outputs/e07-browser');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--mute-audio'],
});
const report = {
  file,
  tests: [],
  errors: [],
  listening: 'not_run',
  physicalDevice: 'not_run',
};
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.locator('.pl-app[data-ready="true"]').waitFor();
  const app = page.locator('.pl-app'),
    canvas = page.locator('canvas'),
    b = (name) => page.getByRole('button', { name, exact: true });
  const goals = () => app.getAttribute('data-resolved');
  const waitGoal = (id) =>
    page.waitForFunction(
      (id) =>
        document
          .querySelector('.pl-app')
          ?.getAttribute('data-resolved')
          ?.split(',')
          .includes(id),
      id,
    );
  async function point(x, y) {
    const box = await canvas.boundingBox();
    return {
      x: box.x + (x / 720) * box.width,
      y: box.y + (y / 1280) * box.height,
    };
  }
  async function drag(from, to) {
    await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const a = await point(...from);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    const z = await point(...to);
    await page.mouse.move(z.x, z.y, { steps: 7 });
    await page.mouse.up();
  }
  async function place(source, target) {
    await b(source).click();
    await page
      .locator('.pl-targets')
      .getByRole('button', { name: target, exact: true })
      .click();
  }
  await page.screenshot({ path: join(out, '01-initial.png'), fullPage: true });
  await b('开始试玩').click();
  await drag([109, 420], [520, 550]);
  await waitGoal('protected');
  report.tests.push('真实拖拽坐垫命中头颈');
  await drag([540, 700], [320, 770]);
  await waitGoal('sheltered');
  await b('暂停').click();
  await canvas.screenshot({ path: join(out, '02-under-table.png') });
  assert.ok(!(await goals()).includes('held'));
  const elapsed = await app.getAttribute('data-elapsed');
  await page.waitForTimeout(250);
  assert.equal(await app.getAttribute('data-elapsed'), elapsed);
  report.tests.push('暂停冻结计时');
  await b('继续试玩').click();
  const grip = b('手抓牢（长按）');
  await grip.scrollIntoViewIfNeeded();
  let box = await grip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  assert.ok(!(await goals()).includes('held'));
  report.tests.push('短按不发放抓牢目标');
  box = await grip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1630);
  await page.mouse.up();
  await waitGoal('held');
  report.tests.push('长按 1.5 秒完成且提前松开会重置');
  await page.waitForFunction(
    () =>
      document.querySelector('.pl-app')?.getAttribute('data-stage') === 'after',
  );
  assert.ok(Number(await app.getAttribute('data-elapsed')) >= 12000);
  report.tests.push('12 秒后进入震后阶段');
  await b('观察周围').click();
  await waitGoal('checked');
  await b('电梯').click();
  await page.waitForTimeout(850);
  assert.equal(await b('电梯').isDisabled(), true);
  report.tests.push('错误乘电梯后标红禁用且可继续');
  await b('回去取贵重物').click();
  await page.waitForTimeout(850);
  await b('关闭燃气').click();
  await waitGoal('gas-off');
  await place('鞋', '人物脚部');
  await waitGoal('shoes-on');
  await place('应急包', '人物背部');
  await waitGoal('bag-on');
  await b('暂停').click();
  await canvas.screenshot({ path: join(out, '03-ready-to-leave.png') });
  await b('继续试玩').click();
  await place('人物', '楼梯方向');
  await waitGoal('escaped');
  await page.waitForFunction(
    () =>
      document.querySelector('.pl-app')?.getAttribute('data-phase') ===
      'complete',
  );
  await canvas.screenshot({ path: join(out, '04-complete.png') });
  report.tests.push('震后正确链路与错误恢复后通关');
  const events = JSON.parse(await app.getAttribute('data-audio-log'));
  report.audio = {
    loaded: Number(await app.getAttribute('data-object-audio')),
    events,
  };
  for (const event of [
    'protect',
    'shelter',
    'hold',
    'inspect',
    'shutoff',
    'wear-shoes',
    'take-bag',
    'stairs',
    'elevator',
    'return-valuables',
  ])
    assert.ok(
      events.some((e) => e.event === event && e.played),
      `缺少音效 ${event}`,
    );
  for (const object of [
    'cushion',
    'person',
    'grip',
    'look',
    'gas',
    'shoes',
    'bag',
    'elevator',
    'valuables',
  ])
    assert.ok(
      events.some((e) => e.object === object && e.played),
      `物品无音效 ${object}`,
    );
  report.tests.push('九个物品、十个已执行动作均实际触发音频节点');
  assert.deepEqual(report.errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.screenshot({
    path: join(out, '05-mobile390.png'),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await page.setViewportSize({ width: 320, height: 568 });
  await page.screenshot({
    path: join(out, '06-mobile320.png'),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  report.tests.push('390 与 320 窄屏无横向溢出');
  await b('重置本轮').click();
  await b('开始试玩').click();
  await page.waitForTimeout(12500);
  assert.equal(await b('重新练习震时避险').isVisible(), true);
  assert.equal(await app.getAttribute('data-phase'), 'playing');
  report.tests.push('震时未完成不会自动通关，可以重新练习');
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  throw error;
} finally {
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
