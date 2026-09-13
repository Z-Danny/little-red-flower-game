import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { root } from './lib/dependencies.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ??
    'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);
const html = resolve(
  root,
  process.argv[2] ?? 'outputs/放置测试引擎/放置测试引擎.html',
);
const out = resolve(root, 'outputs/placement-verification');
mkdirSync(out, { recursive: true });
const report = {
  html,
  sha256: createHash('sha256').update(readFileSync(html)).digest('hex'),
  checks: [],
  errors: [],
  network: [],
  physicalDevice: 'not_run',
  listening: 'not_run',
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
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
  });
  page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') report.errors.push(m.text());
  });
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) report.network.push(r.url());
  });
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await page.locator('[data-placement-engine][data-ready=true]').waitFor();
  await page.screenshot({ path: join(out, '01-desktop.png'), fullPage: true });
  const canvas = page.locator('canvas'),
    app = page.locator('[data-placement-engine]');
  const drag = async (from, to) => {
    await canvas.scrollIntoViewIfNeeded();
    const b = await canvas.boundingBox();
    const at = (p) => ({
      x: b.x + (p.x / 720) * b.width,
      y: b.y + (p.y / 1440) * b.height,
    });
    const a = at(from),
      z = at(to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(z.x, z.y, { steps: 18 });
    await page.mouse.up();
  };
  const tap = async (p) => {
    await canvas.scrollIntoViewIfNeeded();
    const b = await canvas.boundingBox();
    await page.mouse.click(
      b.x + (p.x / 720) * b.width,
      b.y + (p.y / 1440) * b.height,
    );
  };
  const done = async (goal) => {
    await page.waitForFunction(
      (g) =>
        document
          .querySelector('[data-placement-engine]')
          .getAttribute('data-resolved')
          .split(',')
          .includes(g),
      goal,
    );
  };
  await page.getByRole('button', { name: '开始试玩', exact: true }).click();
  await drag({ x: 190, y: 972 }, { x: 280, y: 320 });
  await page.waitForTimeout(600);
  assert.equal(await app.getAttribute('data-resolved'), '');
  report.checks.push('错位拖放返回原位');
  await page.getByRole('button', { name: '人物', exact: true }).click();
  await page.getByRole('button', { name: '门外安全区', exact: true }).click();
  await page.waitForTimeout(600);
  assert.equal(await app.getAttribute('data-resolved'), '');
  report.checks.push('提前撤离被阻止');
  await drag({ x: 392, y: 941 }, { x: 268, y: 520 });
  await page.waitForTimeout(1300);
  assert.match(await page.locator('.pl-pressure').innerText(), /错误 1/);
  report.checks.push('水杯真实拖拽触发危险');
  await page.getByRole('button', { name: /^检查/ }).click();
  const audioDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出检查报告', exact: true }).click();
  const audioFile = join(out, 'audio-report.json');
  await (await audioDownload).saveAs(audioFile);
  report.audio = JSON.parse(readFileSync(audioFile, 'utf8')).audio;
  assert.equal(report.audio.loaded, 18);
  assert.deepEqual(report.audio.missing, []);
  assert.equal(report.audio.state, 'running');
  assert.ok(report.audio.rms > 0);
  report.checks.push('18 项离线声音解码与实际音频信号');
  await page.getByRole('button', { name: '位置', exact: true }).click();
  await tap({ x: 251, y: 598 });
  await done('gas-off');
  await drag({ x: 190, y: 972 }, { x: 266, y: 490 });
  await done('covered');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.screenshot({ path: join(out, '02-covered.png'), fullPage: true });
  const pressure = await page.locator('.pl-pressure').innerText();
  await page.waitForTimeout(550);
  assert.equal(await page.locator('.pl-pressure').innerText(), pressure);
  report.checks.push('暂停冻结风险');
  await page.getByRole('button', { name: '继续试玩', exact: true }).click();
  await page.getByRole('button', { name: '人物', exact: true }).click();
  await page.getByRole('button', { name: '门外安全区', exact: true }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-placement-engine]')
        .getAttribute('data-phase') === 'complete',
  );
  report.checks.push('危险后完成全部目标');
  await page.getByRole('button', { name: '再测一次', exact: true }).click();
  await drag({ x: 190, y: 972 }, { x: 266, y: 490 });
  await done('covered');
  await tap({ x: 251, y: 598 });
  await done('gas-off');
  await drag({ x: 530, y: 600 }, { x: 615, y: 490 });
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-placement-engine]')
        .getAttribute('data-phase') === 'complete',
  );
  report.checks.push('交换顺序与人物真实拖拽通关');
  await page.getByRole('button', { name: '⊞ 摆放编辑', exact: true }).click();
  await page.getByLabel('选中对象', { exact: true }).selectOption('lid');
  await page.getByRole('button', { name: '最终落位', exact: true }).click();
  await page.getByLabel('X 坐标', { exact: true }).fill('152');
  await page.getByRole('button', { name: '↶ 撤销', exact: true }).click();
  assert.equal(
    await page.getByLabel('X 坐标', { exact: true }).inputValue(),
    '146',
  );
  await page.getByRole('button', { name: '↷ 重做', exact: true }).click();
  assert.equal(
    await page.getByLabel('X 坐标', { exact: true }).inputValue(),
    '152',
  );
  report.checks.push('编辑落位与撤销重做');
  await drag({ x: 240, y: 495 }, { x: 234, y: 495 });
  assert.equal(await page.getByLabel('X 坐标', { exact: true }).inputValue(), '146');
  await page.getByRole('button', { name: '↶ 撤销', exact: true }).click();
  assert.equal(await page.getByLabel('X 坐标', { exact: true }).inputValue(), '152');
  report.checks.push('直接拖动画布编辑落位，单步撤销');
  await page.locator('input[type=file]').nth(1).setInputFiles(join(root,'public/levels/paperbook-kitchen-v1/lid.png'));
  await page.locator('[data-ready=true]').waitFor();
  report.checks.push('透明物品素材替换后继续运行');
  await page.getByLabel('绘制层级', { exact: true }).fill('1');
  await page.getByRole('button', { name: /^检查/ }).click();
  assert.match(await page.locator('.pl-health').innerText(), /需要修正/);
  await page.getByRole('button', { name: '▷ 试玩', exact: true }).click();
  assert.ok(
    await page
      .getByRole('button', { name: '开始试玩', exact: true })
      .isDisabled(),
  );
  await page.getByRole('button', { name: '⊞ 摆放编辑', exact: true }).click();
  await page.getByRole('button', { name: '↶ 撤销', exact: true }).click();
  report.checks.push('错误层级给出诊断并阻止试玩，撤销可恢复');
  await page.getByRole('button', { name: /^检查/ }).click();
  await page.getByRole('button', { name: '运行规则仿真', exact: true }).click();
  assert.equal(await page.locator('.pl-case').count(), 4);
  assert.ok(
    !(await page.locator('.pl-case').allTextContents()).some((x) =>
      x.startsWith('×'),
    ),
  );
  report.checks.push('浏览器规则仿真');
  await page.getByRole('button', { name: '记录', exact: true }).click();
  await page.screenshot({ path: join(out, '03-editor.png'), fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出配置', exact: true }).click();
  const download = await downloadPromise;
  const exported = join(out, 'exported.placement.json');
  await download.saveAs(exported);
  const document = JSON.parse(readFileSync(exported, 'utf8'));
  assert.equal(document.placements.cover.snap.x, 152);
  report.checks.push('导出 JSON 保存修改');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{}'),
    });
  assert.match(await page.locator('.pl-notice').innerText(), /导入失败/);
  assert.equal(await page.locator('.pl-brand h1').count(), 1);
  report.checks.push('无效导入不替换项目');
  await page.locator('input[type=file]').first().setInputFiles(exported);
  await page.waitForTimeout(900);
  await page.reload();
  await page.locator('[data-ready=true]').waitFor();
  await page.getByRole('button', { name: '⊞ 摆放编辑', exact: true }).click();
  await page.getByLabel('选中对象', { exact: true }).selectOption('lid');
  await page.getByRole('button', { name: '最终落位', exact: true }).click();
  assert.equal(
    await page.getByLabel('X 坐标', { exact: true }).inputValue(),
    '152',
  );
  report.checks.push('导入与本机草稿恢复');
  for (const size of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(size);
    await page.getByRole('button', { name: '▷ 试玩', exact: true }).click();
    await page.getByRole('button', { name: '开始试玩', exact: true }).click();
    await page.getByRole('button', { name: '锅盖', exact: true }).click();
    await page.getByRole('button', { name: '油锅接收区', exact: true }).click();
    await done('covered');
    await page.getByRole('button', { name: '燃气开关', exact: true }).click();
    await done('gas-off');
    await page.getByRole('button', { name: '人物', exact: true }).click();
    await page.getByRole('button', { name: '门外安全区', exact: true }).click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-placement-engine]')
          .getAttribute('data-phase') === 'complete',
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: join(out, `04-mobile-${size.width}.png`),
      fullPage: true,
    });
    report.checks.push(
      `${size.width}×${size.height} 无横向溢出，点选操作可通关`,
    );
  }
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
  writeFileSync(
    join(out, 'browser-report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
