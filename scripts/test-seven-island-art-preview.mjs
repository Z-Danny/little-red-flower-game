import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'outputs/island-level-maps/seven-islands');
const file = path.join(out, 'index.html');
const evidence = path.join(out, 'verification');
const { maps, width, height } = JSON.parse(readFileSync(path.join(root, 'art-source/island-level-maps/seven-islands.json'), 'utf8'));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(path.dirname(process.execPath), 'node_modules/playwright'));
const report = {
  status: 'running',
  htmlSha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
  mapChecks: [],
  viewports: [],
  errors: [],
  failedRequests: [],
  externalRequests: [],
  browserClosed: false,
  contextClosed: false,
  physicalDevice: 'not_run',
  humanAudio: 'not_run',
};
mkdirSync(evidence, { recursive: true });
let browser, context;
try {
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--mute-audio'],
  });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, offline: true });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('requestfailed', request => report.failedRequests.push(request.failure()?.errorText));
  page.on('request', request => {
    if (/^https?:/.test(request.url())) report.externalRequests.push(request.url());
  });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  assert.equal(await page.locator('[data-choose]').count(), maps.length);
  for (const map of maps) {
    const tab = page.locator(`[data-choose="${map.id}"]`);
    await tab.click();
    assert.equal(await tab.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#map-title').textContent(), map.title);
    const art = page.locator('.map img');
    assert.deepEqual(await art.evaluate(async img => {
      await img.decode();
      return [img.naturalWidth, img.naturalHeight, img.getAttribute('src')];
    }), [map.width ?? width, map.height ?? height, map.file ?? `${map.id}.png`]);
    assert(Math.abs(await page.locator('.map').evaluate(world => {
      const box = world.getBoundingClientRect(), img = world.querySelector('img');
      return box.width / box.height - img.naturalWidth / img.naturalHeight;
    })) < 0.0001, 'Preview must preserve native aspect ratio');
    const buttons = page.locator('.map .pin');
    assert.deepEqual(await buttons.evaluateAll(items => items.map(button => button.dataset.stop)), map.stops.map(([id]) => id));
    const view = page.locator('dialog');
    for (const [id, , , landmark] of map.stops) {
      const pin = page.locator(`.map .pin[data-stop="${id}"]`);
      await pin.click();
      assert(await view.isVisible());
      assert.equal(await view.getAttribute('data-stop'), id);
      assert.equal(await view.locator('#landmark').textContent(), landmark);
      assert.equal(await view.getByRole('button').count(), 1, 'preview cannot start gameplay');
      await page.keyboard.press('Escape');
      assert(!(await view.isVisible()));
    }
    report.mapChecks.push({ id: map.id, openedStops: map.stops.length });
  }
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    for (const map of maps) {
      await page.locator(`[data-choose="${map.id}"]`).click();
      const { width, fits } = await page.locator('.map').evaluate(world => {
        const box = world.getBoundingClientRect();
        return { width: box.width, fits: [...world.querySelectorAll('.pin')].every(pin => {
          const target = pin.getBoundingClientRect();
          return target.left >= box.left && target.right <= box.right && target.width >= 44 && target.height >= 44;
        }) };
      });
      assert(width > 0 && fits, `${map.id}: ${viewport.width}px`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    report.viewports.push(viewport);
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.failedRequests, []);
  assert.deepEqual(report.externalRequests, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  try {
    if (context) {
      await context.close();
      report.contextClosed = true;
    }
  } finally {
    try {
      if (browser) {
        await browser.close();
        report.browserClosed = true;
      }
    } finally {
      writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    }
  }
}
console.log(JSON.stringify(report, null, 2));
