import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = path.join(root, 'outputs', '本地离线版', '小红花应急行动.html');
const out = path.join(root, 'outputs', 'landscape-verification');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true,
  args: ['--mute-audio', '--no-first-run'],
});
let context;
try {
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    permissions: [],
    acceptDownloads: false,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(html).href, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.locator('.landscape-home h1').waitFor({ timeout: 60000 });
  assert.match(
    await page.locator('.landscape-masthead .brand-mark').getAttribute('src'),
    /^data:image\/png;base64,/,
    'The home logo must use the portrait game red flower',
  );
  assert.match(
    await page.locator('.landscape-home h1').innerText(),
    /这片儿\s*没我不行/,
  );
  await page.screenshot({ path: path.join(out, 'home-1440.png') });
  await page.getByRole('button', { name: /开始新旅程/ }).click();
  await page.locator('.landscape-map').waitFor({ timeout: 20000 });
  assert.match(
    await page.locator('.landscape-flower-icon img').getAttribute('src'),
    /^data:image\/png;base64,/,
    'The map flower counter must use portrait game artwork',
  );
  assert.equal(
    await page.locator('.landscape-flower-count').getAttribute('aria-label'),
    '累计0朵小红花',
  );
  const chapters = [
    ['nature', 11, 'map-storybook-v2.png'],
    ['public', 7, 'map-public-v2.png'],
    ['home', 6, 'map-home-v2.png'],
    ['first-aid', 8, 'map-first-aid-v2.png'],
  ];
  const images = [];
  for (const [id, count, file] of chapters) {
    if (id !== 'nature')
      await page
        .locator('.chapter-nav button')
        .filter({
          hasText: {
            public: '公共安全',
            home: '居家校园办公',
            'first-aid': '急救岛',
          }[id],
        })
        .click();
    assert.equal(await page.locator('.map-panel').count(), 1);
    assert.equal(await page.locator('.map-stop').count(), count);
    assert.equal(await page.locator('.trail-window,.trail-arrow').count(), 0);
    const image = await page.locator('.map-panel-art').evaluate((node) => ({
      source: node.getAttribute('src'),
      naturalWidth: node.naturalWidth,
      complete: node.complete,
    }));
    assert.match(image.source, /^data:image\/png;base64,/);
    assert.equal(image.complete, true);
    assert(image.naturalWidth >= 1600);
    assert.equal(await page.locator('.map-stop').first().isVisible(), true);
    images.push([id, file, image.source.length]);
    await page.screenshot({ path: path.join(out, `map-${id}-1440.png`) });
  }
  await page
    .locator('.chapter-nav button')
    .filter({ hasText: '公共安全' })
    .click();
  await page.locator('.map-stop').first().click();
  await page.locator('[data-painted-intro]').waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(out, 'intro-1440.png') });
  // Exercise the mounted completion boundary in an isolated profile. This is not a gameplay claim.
  await page
    .locator('[data-painted-intro]')
    .getByRole('button', { name: /开始|进入|出发|检查|清理/ })
    .last()
    .click();
  await page
    .locator('.hunt-player,.disaster-player,.configured-player,.kitchen-player')
    .first()
    .waitFor({ timeout: 20000 });
  await page
    .locator('.hunt-player,.disaster-player,.configured-player,.kitchen-player')
    .first()
    .evaluate((element) => {
      const key = Object.keys(element).find((name) =>
        name.startsWith('__reactFiber$'),
      );
      if (!key) throw new Error('Completion boundary unavailable');
      for (let fiber = element[key]; fiber; fiber = fiber.return) {
        const props = fiber.memoizedProps;
        if (typeof props?.onFinish === 'function' && props.journey === true) {
          props.onFinish('clear-corridor', 3, { elapsedMs: 1000 });
          return;
        }
      }
      throw new Error('Player completion callback unavailable');
    });
  await page
    .locator('[data-testid="settlement-primary"]:not(:disabled)')
    .waitFor({ timeout: 20000 });
  await page.locator('[data-testid="settlement-primary"]').click();
  await page.locator('[data-landscape-page="map"]').waitFor({ timeout: 20000 });
  assert.equal(
    await page.locator('[data-landscape-page="map"]').count(),
    1,
    'Returning from a level opens the map',
  );
  assert.equal(
    await page.locator('.map-stage').getAttribute('data-map-chapter'),
    'public',
  );
  assert.equal(await page.locator('.landscape-road-flower').count(), 1);
  assert.match(
    await page.locator('.landscape-road-flower').getAttribute('src'),
    /^data:image\/png;base64,/,
  );
  assert.equal(
    await page.locator('.landscape-flower-count').getAttribute('aria-label'),
    '累计3朵小红花',
  );
  await page.screenshot({
    path: path.join(out, 'map-after-completion-1440.png'),
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.landscape-home').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /继续旅程/ }).click();
  await page.locator('[data-landscape-page="map"]').waitFor({ timeout: 20000 });
  assert.equal(
    await page.locator('.map-stage').getAttribute('data-map-chapter'),
    'public',
  );
  assert.equal(
    await page.locator('.landscape-road-flower').count(),
    1,
    'The path flower persists in the save',
  );
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(
    JSON.stringify({ html, maps: images, entries: true, errors }, null, 2),
  );
} finally {
  await context?.close();
  await browser.close();
}
