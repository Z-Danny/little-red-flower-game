import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from './lib/dependencies.mjs';
const require = createRequire(import.meta.url);
const {
  chromium,
} = require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = join(root, 'outputs/rain-flood-v1');
mkdirSync(out, { recursive: true });
const html = join(root, 'outputs/本地离线版/小红花应急行动.html');
const report = {
  passed: false,
  checks: [],
  errors: [],
  offlineSha256: createHash('sha256').update(readFileSync(html)).digest('hex'),
  realDeviceTested: false,
  auditoryHumanReview: false,
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--mute-audio'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
page.on('pageerror', (e) => report.errors.push(String(e)));
const external = [];
page.on('request', (r) => {
  if (/^https?:/.test(r.url())) external.push(r.url());
});
const check = (name, condition = true) => {
  assert(condition, name);
  report.checks.push(name);
  console.log('PASS ' + name);
};
const read = (key, file) =>
  JSON.parse(
    readFileSync(
      join(root, `public/levels/rain-flood-v1/${key}/${file}`),
      'utf8',
    ),
  );
const skin = (key) =>
  JSON.parse(
    readFileSync(
      join(
        root,
        `content/disaster/${key === 'street' ? 'rain-street-preparation-v1' : 'flood-house-response-v1'}/skin.json`,
      ),
      'utf8',
    ),
  );
const host = () => page.locator('.disaster-player');
async function map() {
  if (await host().count()) {
    if ((await host().getAttribute('data-phase')) === 'failed')
      await page.locator('.painted-failure').getByRole('button', { name: '返回关卡', exact: true }).click();
    else if (await page.locator('.disaster-dialog').count())
      await page
        .locator('.disaster-dialog')
        .getByRole('button', { name: '返回关卡', exact: true })
        .click();
    else if (await page.locator('.disaster-entry').count())
      await page.getByRole('button', { name: '返回关卡', exact: true }).click();
    else {
      await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
      await page
        .locator('.disaster-dialog')
        .getByRole('button', { name: '返回关卡', exact: true })
        .click();
    }
  }
  await page.locator('.game-hub').waitFor();
}
async function open(key, begin = true) {
  await map();
  await page
    .locator('.map-level')
    .filter({ hasText: key === 'street' ? '暴雨前的街道' : '洪水围困' })
    .click();
  await page.locator('.disaster-entry button').waitFor();
  if (begin) await page.locator('.disaster-entry button').click();
}
async function xy(p) {
  const b = await page.locator('.disaster-world canvas').boundingBox(),
    scale = Math.max(b.width / 720, b.height / 1280);
  return {
    x: b.x + (b.width - 720 * scale) / 2 + p.x * scale,
    y: b.y + (b.height - 1280 * scale) / 2 + p.y * scale,
  };
}
async function tap(p) {
  const q = await xy(p);
  await page.mouse.click(q.x, q.y);
}
async function drag(from, to) {
  const a = await xy(from),
    b = await xy(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}
const middle = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
async function goal(id) {
  await page.waitForFunction(
    (id) =>
      document
        .querySelector('.disaster-player')
        ?.getAttribute('data-goals')
        ?.split(',')
        .includes(id),
    id,
    { timeout: 7000 },
  );
}
async function capture(name) {
  await page.screenshot({ path: join(out, name + '.png') });
}
try {
  await page.goto(pathToFileURL(html).href, {
    waitUntil: 'load',
    timeout: 60000,
  });
  await page.locator('.game-hub').waitFor();
  check(
    'two new map entries',
    (await page
      .locator('.map-level')
      .filter({ hasText: '暴雨前的街道' })
      .count()) === 1 &&
      (await page
        .locator('.map-level')
        .filter({ hasText: '洪水围困' })
        .count()) === 1,
  );
  await open('street', false);
  await capture('street-entry-390x844');
  const initial = await host().getAttribute('data-elapsed');
  await page.waitForTimeout(220);
  check(
    'ready does not spend clock',
    initial === (await host().getAttribute('data-elapsed')),
  );
  const samples = read('street', 'hit-samples.json');
  for (const [w, h] of [
    [320, 568],
    [360, 800],
    [375, 812],
    [390, 844],
    [412, 915],
    [430, 932],
    [1280, 900],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(80);
    const b = await host().boundingBox();
    check(
      `edge-fit ${w}x${h}`,
      Math.abs(b.y) < 0.1 &&
        b.width <= 520.1 &&
        (w > 600 || Math.abs(b.height - h) < 0.1),
    );
    const boxes = await page
      .locator('.disaster-hud button,.disaster-clues>span,.disaster-entry')
      .evaluateAll((ns) =>
        ns.map((n) => {
          const r = n.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
    check(
      `HUD inside ${w}x${h}`,
      boxes.every(
        (r) =>
          r.x >= -0.1 &&
          r.y >= -0.1 &&
          r.x + r.w <= w + 0.1 &&
          r.y + r.h <= h + 0.1,
      ),
    );
    for (const [id, p] of Object.entries(samples)) {
      const q = await xy(p);
      check(
        `visible clue ${id} ${w}x${h}`,
        q.x >= b.x &&
          q.x <= b.x + b.width &&
          q.y > b.y + 60 &&
          q.y < b.y + b.height,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.disaster-entry button').click();
  await tap({ x: 358, y: 996 });
  check(
    'street miss deducts five seconds',
    (await host().getAttribute('data-penalty')) === '5000',
  );
  for (const [id, p] of Object.entries(samples)) {
    await tap(p);
    await goal(id);
    if (id === 'manhole') await capture('street-found-390x844');
  }
  await page.waitForFunction(
    () =>
      document.querySelector('.disaster-player')?.getAttribute('data-phase') ===
      'complete',
  );
  check(
    'street seven-target settlement',
    (await host().getAttribute('data-goals')) ===
      'pool,manhole,cable,sign,car,garage,person',
  );
  await capture('street-success-390x844');
  await open('flood');
  const fs = skin('flood'),
    f = read('flood', 'hit-samples.json');
  await capture('flood-initial-390x844');
  await drag(f.chair, { x: 340, y: 1030 });
  check(
    'irrelevant furniture does not progress',
    (await host().getAttribute('data-goals')) === '',
  );
  await drag(f.person, { x: 591, y: 510 });
  await goal('stairs');
  await capture('flood-on-stairs-390x844');
  await tap(f.breaker);
  await goal('power');
  await drag(f.phone, middle(fs.poses.personStairs));
  await goal('rescue');
  await drag(f.water, middle(fs.sprites.bag.box));
  await goal('drinking');
  await drag(f.flashlight, middle(fs.sprites.bag.box));
  await goal('lighting');
  await drag(f.foam, middle(fs.sprites.panel.box));
  await goal('aid');
  await capture('flood-prepared-390x844');
  await drag(middle(fs.poses.personStairs), middle(fs.zones.roof.box));
  await goal('roof');
  await page.waitForFunction(
    () =>
      document.querySelector('.disaster-player')?.getAttribute('data-phase') ===
      'complete',
  );
  check(
    'flood full seven-action settlement',
    (await host().getAttribute('data-goals')) ===
      'stairs,power,rescue,drinking,lighting,aid,roof',
  );
  await capture('flood-success-390x844');
  await open('flood');
  await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
  await page.waitForTimeout(120);
  const before = await host().getAttribute('data-elapsed');
  await page.waitForTimeout(400);
  check(
    'pause freezes elapsed',
    before === (await host().getAttribute('data-elapsed')),
  );
  check(
    'pause mutes audio bus',
    Number(
      await page
        .locator('.disaster-world canvas')
        .getAttribute('data-audio-rms'),
    ) < 0.002,
  );
  await page.getByRole('button', { name: '关闭声音', exact: true }).click();
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await page.waitForTimeout(200);
  check(
    'mute remains silent after resume',
    Number(
      await page
        .locator('.disaster-world canvas')
        .getAttribute('data-audio-rms'),
    ) < 0.002,
  );
  await drag(f.person, middle(fs.zones.roof.box));
  check(
    'early safe retreat is always available',
    (await host().getAttribute('data-phase')) === 'evacuated',
  );
  await capture('flood-early-retreat');
  for (const zone of ['outside', 'wire', 'car']) {
    await ((await host().getAttribute('data-phase')) === 'failed'
      ? page.locator('.painted-failure').getByRole('button', { name: '不服，再来！', exact: true })
      : page.getByRole('button', { name: '重新开始', exact: true })).click();
    await page.locator('.disaster-entry button').click();
    let target = middle(fs.zones[zone].box);
    if (target.x < 75) target.x = 90;
    await drag(f.person, target);
    check(
      `dangerous drop ${zone} fails`,
      (await host().getAttribute('data-phase')) === 'failed',
    );
    if (zone === 'outside') await capture('flood-danger-390x844');
  }
  await map();
  await page
    .getByRole('button', { name: '打开小红花排行榜', exact: true })
    .click();
  check(
    'leaderboard opens after awards',
    (await page.locator('.lb-page').count()) === 1,
  );
  check('no external requests', external.length === 0);
  check('no JavaScript page errors', report.errors.length === 0);
  report.passed = true;
} catch (e) {
  report.errors.push(String(e));
  await capture('failure-debug').catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  writeFileSync(
    join(out, 'browser-checks.json'),
    JSON.stringify(report, null, 2),
  );
  await context.close();
  await browser.close();
}
