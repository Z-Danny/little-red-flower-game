/** Final HTML only; isolated mobile contexts, muted/offline, always closed. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(path.dirname(process.execPath), 'node_modules/playwright'));
const html = path.resolve(root, process.env.NINE_ISLANDS_HTML || 'outputs/本地离线版/小红花应急行动.html');
const output = path.resolve(root, process.env.ISLAND_SCROLL_REPORT || 'outputs/island-scroll-lock');
fs.mkdirSync(output, { recursive: true });
const report = {
  html, sha256: createHash('sha256').update(fs.readFileSync(html)).digest('hex'),
  checks: [], errors: [], network: [], physicalDevice: 'not_run',
  humanListening: 'not_run', browserClosed: false,
};
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, args: ['--mute-audio'],
  });
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion: 'reduce', offline: true });
    let page;
    try {
      await context.addInitScript(() => localStorage.setItem('red-flower:interface-muted', 'true'));
      page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('request', r => { if (/^https?:/.test(r.url())) report.network.push(r.url()); });
      await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 120000 });
      await page.locator('[data-home-start]:enabled').click();
      const picker = page.locator('[data-archipelago]:not([aria-hidden])');
      await picker.waitFor();
      await page.locator('[data-island-levels="campus"]').waitFor();
      assert(Math.abs(await page.locator('[data-island-level-scroll]').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop))<=2);
      await page.locator('[data-levels-close]').click();
      await page.evaluate(() => {
        window.__islandGestureTrace = [];
        for (const name of ['pointerdown', 'pointerup', 'pointercancel', 'click']) document.addEventListener(name, event => {
          window.__islandGestureTrace.push({ type: name, primary: event.isPrimary, button: event.button, target: event.target.closest('[data-island]')?.dataset.island, x: event.clientX, y: event.clientY });
          window.__islandGestureTrace = window.__islandGestureTrace.slice(-24);
        }, true);
      });
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      assert.equal(await picker.getAttribute('data-current-category'), 'home');
      const cdp = await context.newCDPSession(page);
      const swipe = async (x, y, dx, dy) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        for (let i = 1; i <= 8; i++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 8, y: y + dy * i / 8, id: 1 }] });
          await page.waitForTimeout(16);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        // Let native touch/fling cancellation settle before the next gesture.
        await page.waitForTimeout(600);
      };
      const tap = async locator => {
        const box = await locator.boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        // Keep the same CDP touch stream/id for swipes and taps.
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await page.waitForTimeout(60);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };
      const position = () => picker.evaluate(el => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, windowX: scrollX, windowY: scrollY, ownX: el.scrollLeft, ownY: el.scrollTop };
      });
      const area = await page.locator('.archipelago-carousel').boundingBox();
      const before = await position();
      const touchX = area.x + area.width / 2, touchY = area.y + area.height * .48;
      for (const dy of [-100, 100, -100]) {
        await swipe(touchX, touchY, 0, dy);
        assert.deepEqual(await position(), before, 'vertical swipe must not shift the picker/document');
        assert.equal(await picker.getAttribute('data-page'), 'islands', 'vertical swipe must not click an island');
        assert.equal(await picker.getAttribute('data-current-category'), 'home');
      }
      const frame = await picker.boundingBox();
      if (viewport.height - frame.y - frame.height > 90) {
        await swipe(viewport.width / 2, viewport.height - 20, 0, -65);
        assert.deepEqual(await position(), before, 'letterbox swipe must not scroll the page');
      }
      const styles = await page.evaluate(() => ({
        html: getComputedStyle(document.documentElement).overflowY,
        body: getComputedStyle(document.body).overflowY,
        carousel: getComputedStyle(document.querySelector('.archipelago-carousel')).touchAction,
      }));
      assert.equal(styles.html, 'hidden');
      assert.equal(styles.body, 'hidden');
      assert.equal(styles.carousel, 'pinch-zoom', 'keep pinch zoom while suppressing native one-finger panning');
      await swipe(area.x + area.width * .8, touchY, -area.width * .6, 0);
      assert.equal(await picker.getAttribute('data-current-category'), 'traffic');
      await swipe(area.x + area.width * .2, touchY, area.width * .6, 0);
      assert.equal(await picker.getAttribute('data-current-category'), 'home');
      await page.screenshot({ path: path.join(output, `${viewport.width}-picker.png`) });
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await tap(page.locator('[data-island="home"]'));
      await page.locator('[data-island-levels="home"]').waitFor();
      assert.equal(await picker.getAttribute('data-page'), 'levels');
      assert.equal(await page.evaluate(() => document.documentElement.matches(':has(.archipelago[data-page="islands"])')), false);
      const map = page.locator('[data-island-level-scroll]');
      assert.equal(await map.evaluate(el => getComputedStyle(el).touchAction), 'pan-y');
      assert.equal(await map.evaluate(el => getComputedStyle(el).overflowY), 'auto');
      // Some paintings fit exactly; only overflowing original maps should scroll.
      const metrics = await map.evaluate(el => ({ range: el.scrollHeight - el.clientHeight, top: el.scrollTop }));
      if (metrics.range > 10) {
        await map.evaluate(el => { el.scrollTop = 0; });
        const box = await map.boundingBox();
        await swipe(box.x + box.width / 2, box.y + box.height * .65, 0, -100);
        assert(await map.evaluate(el => el.scrollTop > 0), 'island-internal maps must still scroll');
      }
      await tap(page.locator('[data-levels-close]'));
      await page.waitForFunction(() => document.querySelector('[data-archipelago]')?.dataset.page === 'islands');
      assert.equal(await picker.getAttribute('data-page'), 'islands');
      await tap(page.locator('[data-carousel-close]'));
      await page.locator('[data-home-start]:enabled').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.matches(':has(.archipelago[data-page="islands"])')), false);
      report.checks.push({ viewport, verticalLocked: true, swipeDoesNotClick: true, horizontalSwitching: true, originalMapScrollingPreserved: true, lockReleased: true });
    } catch (error) {
      if (page) {
        report.gestureTrace = await page.evaluate(() => window.__islandGestureTrace).catch(() => []);
        await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
      }
      throw error;
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.network, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await browser?.close();
  report.browserClosed = true;
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
