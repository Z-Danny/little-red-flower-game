import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const html = path.resolve(root, process.env.NINE_ISLANDS_HTML || 'outputs/本地离线版/小红花应急行动.html');
const output = path.resolve(root, process.env.ISLAND_LAYOUT_REPORT || 'outputs/nine-islands-all-integration/layout');
const { maps } = JSON.parse(readFileSync(path.join(root, 'content/island-level-maps.json'), 'utf8'));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(path.dirname(process.execPath), 'node_modules/playwright'));
const report = {
  status: 'running', html, sha256: createHash('sha256').update(readFileSync(html)).digest('hex'),
  checks: [], errors: [], network: [], failedRequests: [], physicalDevice: 'not_run', humanAudio: 'not_run',
  browserClosed: false, contextClosed: false,
};
mkdirSync(output, { recursive: true });
let browser, context;
try {
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, args: ['--mute-audio'],
  });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, offline: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('requestfailed', request => report.failedRequests.push(request.failure()?.errorText));
  page.on('request', request => { if (/^https?:/.test(request.url())) report.network.push(request.url()); });
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-home-start]:enabled').click();
  await page.locator('[data-archipelago]:not([aria-hidden])').waitFor();
  await page.locator('[data-island-levels="campus"]').waitFor();
  await page.locator('[data-levels-close]').click();
  for (const viewport of [
    { width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 },
    { width: 430, height: 932 }, { width: 540, height: 960 }, { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [index, map] of maps.entries()) {
      const currentId = await page.locator('[data-archipelago]').getAttribute('data-current-category');
      const current = maps.findIndex(item => item.id === currentId);
      for (let i = 0; i < Math.abs(index - current); i++) await page.keyboard.press(index > current ? 'ArrowRight' : 'ArrowLeft');
      await page.locator(`[data-island="${map.id}"]`).click();
      const scene = page.locator(`[data-island-authored-scene="${map.id}"]`);
      await scene.waitFor();
      assert(Math.abs(await page.locator('[data-island-level-scroll]').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop))<=2,'map starts at the bottom');
      const geometry = await scene.evaluate(async section => {
        await document.fonts.ready;
        const img = section.querySelector('.garden-map-art');
        await img.decode();
        const world = section.querySelector('.garden-world').getBoundingClientRect();
        const signs = [...section.querySelectorAll('[data-island-level]')].map(node => {
          const label = node.querySelector('.garden-node-label'), title = node.querySelector('.garden-node-title');
          const box = label.getBoundingClientRect();
          return { id: node.dataset.islandLevel, left: box.left, right: box.right, top: box.top, bottom: box.bottom,
            width: box.width, height: box.height, textFits: title.scrollWidth <= title.clientWidth + 1 };
        });
        return { world: { left: world.left, right: world.right, top: world.top, bottom: world.bottom }, signs };
      });
      assert.equal(geometry.signs.length, map.stops.length);
      for (const sign of geometry.signs) {
        const frame = geometry.world;
        assert(sign.left >= frame.left - 1 && sign.right <= frame.right + 1 &&
          sign.top >= frame.top - 1 && sign.bottom <= frame.bottom + 1, `${map.id}/${sign.id}: sign cropped at ${viewport.width}px`);
        assert(sign.width >= 72 && sign.height >= 44 && sign.textFits, `${sign.id}: text/touch size at ${viewport.width}px`);
        for (const other of geometry.signs) if (other.id !== sign.id) {
          assert(!(sign.left < other.right - 1 && sign.right > other.left + 1 &&
            sign.top < other.bottom - 1 && sign.bottom > other.top + 1), `${sign.id}: overlaps ${other.id}`);
        }
      }
      report.checks.push({ viewport, id: map.id, signs: geometry.signs.length });
      await page.locator('[data-levels-close]').click();
    }
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.network, []);
  assert.deepEqual(report.failedRequests, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  try { if (context) { await context.close(); report.contextClosed = true; } }
  finally {
    try { if (browser) { await browser.close(); report.browserClosed = true; } }
    finally { writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
  }
}
console.log(JSON.stringify(report, null, 2));
