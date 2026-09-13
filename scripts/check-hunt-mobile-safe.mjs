import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..'),
  require = createRequire(import.meta.url);
const {
  chromium,
} = require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html = path.resolve(
  root,
  process.argv[2] ?? 'outputs/本地离线版/小红花应急行动.html',
);
const output = path.join(
  root,
  'docs/hazard-batch-v2/verification/edge-fit-20260910',
);
fs.mkdirSync(output, { recursive: true });
const cards = JSON.parse(
  fs.readFileSync(
    path.join(root, 'docs/hazard-batch-v2/production-plan.json'),
    'utf8',
  ),
).levels;
const report = {
  at: new Date().toISOString(),
  htmlSha256: createHash('sha256').update(fs.readFileSync(html)).digest('hex'),
  status: 'running',
  checks: [],
  browserClosed: false,
  scope:
    'Simulated CSS safe-area insets and real CDP visual-viewport zoom; not physical phone testing',
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--mute-audio'],
});
try {
  for (const card of cards) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page = await context.newPage();
      await page.goto(pathToFileURL(html).href);
      await page
        .locator('button.map-level')
        .filter({
          has: page
            .locator('.map-copy > strong')
            .getByText(card.title, { exact: true }),
        })
        .tap();
      await page.locator('.hunt-entry > button').waitFor();
      for (const [width, height, left, right, top, bottom] of [
        [390, 844, 0, 0, 47, 34],
        [844, 390, 44, 44, 0, 21],
      ]) {
        await page.evaluate(
          (s) => {
            const el = document.querySelector('.hunt-player');
            for (const [key, value] of Object.entries(s))
              el.style.setProperty('--hunt-viewport-safe-' + key, value + 'px');
          },
          { left, right, top, bottom },
        );
        await page.setViewportSize({ width: width - 1, height });
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(120);
        const boxes = await page
          .locator('.hunt-hud > button,.hunt-targets > span,.hunt-entry')
          .evaluateAll((els) =>
            els.map((el) => el.getBoundingClientRect().toJSON()),
          );
        for (const b of boxes)
          assert.ok(
            b.x >= left &&
              b.y >= top &&
              b.right <= width - right &&
              b.bottom <= height - bottom,
            JSON.stringify({
              card: card.id,
              width,
              height,
              left,
              right,
              top,
              bottom,
              b,
            }),
          );
        report.checks.push({
          id: card.id,
          width,
          height,
          safe: { left, right, top, bottom },
          passed: true,
        });
      }
      await page.evaluate(() => {
        const el = document.querySelector('.hunt-player');
        for (const side of ['left', 'right', 'top', 'bottom'])
          el.style.removeProperty('--hunt-viewport-safe-' + side);
      });
      await page.setViewportSize({ width: 390, height: 844 });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
      await page.waitForTimeout(200);
      const metrics = await page.evaluate(() => {
        const v = visualViewport;
        return {
          view: {
            x: v.offsetLeft,
            y: v.offsetTop,
            w: v.width,
            h: v.height,
            scale: v.scale,
          },
          boxes: [
            ...document.querySelectorAll(
              '.hunt-hud > button,.hunt-targets,.hunt-entry',
            ),
          ].map((e) => e.getBoundingClientRect().toJSON()),
        };
      });
      for (const b of metrics.boxes)
        assert.ok(
          b.x >= metrics.view.x - 1 &&
            b.y >= metrics.view.y - 1 &&
            b.right <= metrics.view.x + metrics.view.w + 1 &&
            b.bottom <= metrics.view.y + metrics.view.h + 1,
          JSON.stringify(metrics),
        );
      // Use the browser's element-based touch path; do not double-apply page scale.
      async function touch(selector) {
        await page.locator(selector).tap({ timeout: 4000 });
      }
      await touch('.hunt-entry > button');
      await page.waitForFunction(
        () =>
          document.querySelector('.hunt-player').dataset.phase === 'playing',
        null,
        { timeout: 4000 },
      );
      await touch('.hunt-hud > button[aria-label="暂停游戏"]');
      await page.waitForFunction(
        () => document.querySelector('.hunt-player').dataset.paused === 'true',
        null,
        { timeout: 4000 },
      );
      const dialog = await page.locator('.hunt-dialog').boundingBox();
      assert.ok(
        dialog.x >= 0 &&
          dialog.y >= 0 &&
          dialog.x + dialog.width <= 195 + 1 &&
          dialog.y + dialog.height <= 422 + 1,
      );
      await page.screenshot({
        path: path.join(output, card.authorId + '-phone-200-pause.png'),
      });
      await touch('.hunt-dialog > .hunt-primary');
      await page.waitForFunction(
        () => document.querySelector('.hunt-player').dataset.paused === 'false',
        null,
        { timeout: 4000 },
      );
      report.checks.push({
        id: card.id,
        phoneZoom: 2,
        beginPauseResumeTouch: true,
        passed: true,
      });
      console.log(
        card.authorId + ' safe insets and zoomed phone controls passed',
      );
    } finally {
      await context.close();
    }
  }
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.error = String(e.stack ?? e);
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  report.browserClosed = true;
  fs.writeFileSync(
    path.join(output, 'safe-area.json'),
    JSON.stringify(report, null, 2),
  );
}
