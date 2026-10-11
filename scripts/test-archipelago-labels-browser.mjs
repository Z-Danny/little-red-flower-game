import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(path.dirname(process.execPath), 'node_modules/playwright'));
const html = path.join(root, 'outputs/本地离线版/小红花应急行动.html');
const url = process.env.GAME_URL || pathToFileURL(html).href;
const output = path.join(root, 'outputs/archipelago-labels-verification', process.env.GAME_URL ? 'web' : 'offline');
fs.mkdirSync(output, { recursive: true });
const report = { url, status: 'running', errors: [], failedRequests: [], externalRequests: [], viewports: [], physicalDevice: 'not_run', humanAudio: 'not_run', browserClosed: false, contextClosed: false };
if (!process.env.GAME_URL) report.htmlSha256 = createHash('sha256').update(fs.readFileSync(html)).digest('hex');
let browser, context;
try {
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--mute-audio'] });
  report.browser = browser.version();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', offline: !process.env.GAME_URL });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url().slice(0, 180), error: request.failure()?.errorText }));
  page.on('request', request => { if (/^https?:/.test(request.url()) && !process.env.GAME_URL) report.externalRequests.push(request.url()); });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor();
  await page.locator('[data-home-start]').click();
  await page.locator('[data-journey-map]').waitFor();
  await page.locator('[data-map-fan-toggle]').click();
  await page.locator('[data-archipelago][data-phase="idle"]').waitFor();
  assert.equal(await page.locator('[data-island]').count(), 4);
  assert.deepEqual(await page.locator('[data-island-title]').allTextContents(), ['自然灾害', '公共安全', '居家校园办公', '急救生命守护']);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.querySelectorAll('[data-archipelago] img')].map(image => image.decode())); });
  for (const viewport of [{width:320,height:568},{width:375,height:667},{width:390,height:844},{width:430,height:932},{width:540,height:960},{width:1440,height:900}]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(180);
    const measurements = await page.locator('[data-archipelago]').evaluate(root => {
      const view = root.getBoundingClientRect();
      return [...root.querySelectorAll('[data-island]')].map(button => {
        const box = button.getBoundingClientRect(), label = button.querySelector('.archipelago-island-label').getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        const image = button.querySelector('.archipelago-island-label img');
        return { id: button.dataset.island, hit: button.contains(hit), width: box.width, labelWidth: label.width,
          inside: box.left >= view.left - 1 && box.right <= view.right + 1 && box.top >= view.top && box.bottom <= view.bottom,
          imageReady: image.complete && image.naturalWidth > 0,
          atlasTop: Math.round(parseFloat(getComputedStyle(image).top) / label.height) };
      });
    });
    assert(measurements.every(row => row.hit && row.inside && row.imageReady && row.width >= 44), JSON.stringify({viewport,measurements}));
    assert.deepEqual(measurements.map(row => row.atlasTop), [0,-1,-2,-3]);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
    await page.screenshot({ path: path.join(output, `${viewport.width}x${viewport.height}.png`), animations: 'disabled' });
    report.viewports.push({ ...viewport, measurements });
  }
  const pending = page.locator('[data-island="first-aid"]');
  assert.equal(await pending.getAttribute('aria-disabled'), 'true');
  const pendingBox = await pending.boundingBox();
  await page.mouse.click(pendingBox.x + pendingBox.width / 2, pendingBox.y + pendingBox.height / 2);
  await pending.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('[data-archipelago]').getAttribute('data-phase'), 'idle');
  assert.equal(await page.locator('[data-archipelago]').getAttribute('data-target-category'), '');
  for (const id of ['public', 'home', 'nature']) {
    await page.locator(`[data-island="${id}"]`).click();
    await page.locator('[data-archipelago]').waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-journey-map]').getAttribute('data-region'), id);
    await page.locator('[data-map-fan-toggle]').click();
    await page.locator('[data-archipelago][data-phase="idle"]').waitFor();
    assert.equal(await page.locator('[data-archipelago-flag]').getAttribute('data-flag-category'), id);
  }
  await page.keyboard.press('Escape');
  await page.locator('[data-archipelago]').waitFor({ state: 'detached' });
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.failedRequests.length, 0, JSON.stringify(report.failedRequests));
  assert.equal(report.externalRequests.length, 0);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack; process.exitCode = 1;
} finally {
  try { if (context) { await context.close(); report.contextClosed = true; } }
  finally {
    try { if (browser) { await browser.close(); report.browserClosed = true; } }
    finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
  }
}
console.log(JSON.stringify({status:report.status, viewports:report.viewports.length, failure:report.failure, output}));
