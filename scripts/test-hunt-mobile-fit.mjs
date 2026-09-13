/** Silent isolated mobile-layout acceptance; no user browser/profile/storage. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
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
  errors: [],
  browserClosed: false,
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--mute-audio'],
});
async function layout(page, card, label) {
  // Viewport events/ResizeObserver settle asynchronously; assert the resulting
  // layout instead of racing the next animation frame with a fixed 100ms sleep.
  await page.waitForFunction(
    () => {
      const r = document.querySelector('.hunt-player').getBoundingClientRect(),
        v = visualViewport;
      const width = Math.min(520, v.width, v.width <= 600 && v.height >= v.width ? v.width : v.height * 720 / 1280);
      const height=v.width<=600&&v.height>=v.width?v.height:width*1280/720;
      return Math.abs(r.width - width) < .1 && Math.abs(r.height - height) < .1;
    },
    null,
    { timeout: 3000 },
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const data = await page.evaluate(() => {
    const vv = window.visualViewport;
    const view = {
      x: vv?.offsetLeft ?? 0,
      y: vv?.offsetTop ?? 0,
      w: vv?.width ?? innerWidth,
      h: vv?.height ?? innerHeight,
      scale: vv?.scale ?? 1,
    };
    const selector =
      '.hunt-hud, .hunt-hud > button, .hunt-hud > h1, .hunt-hud > span, .hunt-targets, .hunt-targets > span, .hunt-entry, .hunt-entry > button, .hunt-dialog, .hunt-footer > button';
    const boxes = [...document.querySelectorAll(selector)].map((el) => ({
      tag: el.tagName,
      cls: el.className,
      label: el.getAttribute('aria-label') ?? '',
      ...el.getBoundingClientRect().toJSON(),
    }));
    const canvas = document.querySelector('.hunt-world canvas'),
      ctx = canvas.getContext('2d');
    const edgePixels = [
      [0, 0],
      [canvas.width - 1, 0],
      [0, canvas.height - 1],
      [canvas.width - 1, canvas.height - 1],
    ].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
    return {
      view,
      boxes,
      root: document
        .querySelector('.hunt-player')
        .getBoundingClientRect()
        .toJSON(),
      backdrop: !!document.querySelector('.hunt-backdrop'),
      direction: getComputedStyle(document.querySelector('.hunt-targets'))
        .flexDirection,
      scaleX: ctx.getTransform().a * canvas.getBoundingClientRect().width / canvas.width,
      scaleY: ctx.getTransform().d * canvas.getBoundingClientRect().height / canvas.height,
      edgePixels,
    };
  });
  const item = { id: card.id, label, ...data };
  report.checks.push(item);
  assert.equal(data.backdrop, false, 'No blurred filler');
  assert.equal(data.direction, 'row', 'Reference uses a fixed horizontal row');
  assert.ok(Math.abs(data.scaleX - data.scaleY) < 1e-6, 'Actual canvas transform must be uniform like typhoon');
  assert.ok(data.root.width <= 520.1, 'Normal phone width, not stretched across desktop');
  assert.ok(Math.abs(data.root.y-data.view.y)<.1, 'No top blank band');
  if(data.view.w<=600 && data.view.h>=data.view.w) assert.ok(Math.abs(data.root.height-data.view.h)<.1, 'No bottom blank band on phone');
  else assert.ok(Math.abs(data.root.width/data.root.height-720/1280)<.001, 'Wide windows keep normal portrait frame');
  assert.ok(Math.abs(data.root.x + data.root.width / 2 - data.view.x - data.view.w / 2) < 1);
  for (const pixel of data.edgePixels) {
    assert.equal(pixel[3], 255);
    assert.notDeepEqual(
      pixel.slice(0, 3),
      [34, 43, 44],
      'Painting must reach every corner',
    );
  }
  for (const b of data.boxes) {
    assert.ok(
      b.x >= data.root.x - 1 &&
        b.y >= data.root.y - 1 &&
        b.right <= data.root.right + 1 &&
        b.bottom <= data.root.bottom + 1,
      `${card.id}/${label}: ${JSON.stringify(b)} outside ${JSON.stringify(data.view)}`,
    );
    if (
      !process.argv.includes('--baseline') &&
      (b.label === '返回关卡' || b.label === '暂停游戏')
    )
      assert.ok(
        b.width >= 43 && b.height >= 43,
        'Mobile action target must be at least 44 CSS pixels',
      );
  }
  item.passed = true;
}
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
      page.on('pageerror', (e) => report.errors.push(e.message));
      await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
      await page
        .locator('button.map-level')
        .filter({
          has: page
            .locator('.map-copy > strong')
            .getByText(card.title, { exact: true }),
        })
        .tap();
      await page.locator('.hunt-entry > button').waitFor();
      for (const [w, h] of process.argv.includes('--baseline')
        ? [[600, 900]]
        : [
            [320, 568],
            [360, 640],
            [375, 667],
            [390, 844],
            [430, 932],
            [542, 817],
            [600, 900],
            [844, 390],
            [667, 240],
            [1280, 900],
            [1920, 1080],
          ]) {
        await page.setViewportSize({ width: w, height: h });
        await layout(page, card, `${w}x${h}-ready`);
      }
      const cdp = await context.newCDPSession(page);
      await page.setViewportSize({ width: 600, height: 900 });
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.1 });
      await layout(page, card, 'visual-viewport-110%-ready');
      await page.screenshot({
        path: path.join(output, card.authorId + '-zoom.png'),
      });
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
      await layout(page, card, 'visual-viewport-200%-ready');
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.hunt-entry > button').tap();
      const samples = JSON.parse(
        fs.readFileSync(
          path.join(
            root,
            'art-source/hazard-batch-v2',
            card.authorId,
            'hit-samples.json',
          ),
          'utf8',
        ),
      );
      const sizes = [
        [320, 568],
        [360, 740],
        [390, 650],
        [430, 932],
        [390, 844],
      ];
      let i = 0;
      for (const [id, [x, y]] of Object.entries(samples.targets)) {
        const [w, h] = sizes[i++];
        await page.setViewportSize({ width: w, height: h });
        await layout(page, card, `${w}x${h}-playing-rotation`);
        const box = await page.locator('.hunt-world canvas').boundingBox();
        const scale=Math.max(box.width/720,box.height/1280);
        let at={x:box.x+(box.width-720*scale)/2+x*scale,y:box.y+(box.height-1280*scale)/2+y*scale};
        assert.equal(
          await page.evaluate(
            (p) => document.elementFromPoint(p.x, p.y)?.tagName,
            at,
          ),
          'CANVAS',
          'Target sample obscured after rotation',
        );
        await page.touchscreen.tap(at.x, at.y);
        await page.waitForFunction(
          (id) =>
            document
              .querySelector('.hunt-player')
              .dataset.found.split(',')
              .includes(id),
          id,
        );
      }
      await page.locator('.hunt-dialog .hunt-flowers').waitFor();
      await layout(page, card, 'complete');
      await page.screenshot({
        path: path.join(output, card.authorId + '-complete.png'),
      });
      console.log(
        card.authorId + ' mobile layout, zoom, rotate and finish passed',
      );
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(report.errors, []);
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
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
