/** Verify the exported HTML in an isolated, muted browser; never touch a real profile. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { root } from './lib/dependencies.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const html = path.resolve(root, process.argv[2] ?? 'outputs/本地离线版/小红花应急行动.html');
const out = path.join(root, 'outputs/unlock-all-verification');
fs.mkdirSync(out, { recursive: true });
const map = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8'));
const report = { html, sha256: createHash('sha256').update(fs.readFileSync(html)).digest('hex'), checks: [], errors: [], network: [], physicalDevice: 'not_run', humanListening: 'not_run', browserClosed: false };
let browser;
const check = name => { report.checks.push(name); console.log('PASS ' + name); };
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, isMobile: true });
  await context.route(/^https?:/, route => { report.network.push(route.request().url()); return route.abort(); });
  await context.addInitScript(() => { localStorage.setItem('red-flower:interface-muted', 'true'); });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(error.message));
  const load = async () => { await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 120000 }); await page.locator('[data-home-start]:enabled').waitFor(); };
  const saved = () => page.evaluate(() => { const state = JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1')); return state.players.find(p => p.id === state.activePlayerId); });
  const enterMap = async () => { await page.locator('[data-home-continue]').click(); await page.locator('[data-journey-map]').waitFor(); };
  await load();
  await page.locator('[data-home-start]').click();
  await page.locator('[data-map-node][data-status="locked"]').first().waitFor();
  await page.locator('[data-map-home]').click();
  await page.locator('[data-home-unlock-all]').click();
  await page.getByRole('button', { name: '全部关卡已解锁', exact: true }).waitFor();
  assert.equal(await page.locator('[data-home-unlock-all]').isDisabled(), true);
  const unlocked = await saved();
  assert.equal(unlocked.allLevelsUnlocked, true);
  assert.deepEqual(unlocked.completed, {});
  check('home button unlocks without completing levels or awarding flowers');
  for (const [width, height] of [[390, 844], [320, 568], [1280, 900]]) {
    await page.setViewportSize({ width, height });
    const buttons = await page.locator('.title-buttons button').evaluateAll(buttons => buttons.map(button => { const b = button.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom }; }));
    for (const b of buttons) assert(b.x >= 0 && b.y >= 0 && b.right <= width && b.bottom <= height && b.height >= 44);
    for (let i = 1; i < buttons.length; i++) assert(buttons[i].y >= buttons[i - 1].bottom);
    await page.screenshot({ path: path.join(out, `home-${width}x${height}.png`) });
    check(`home controls fit ${width}x${height}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await load();
  assert.equal(await page.locator('[data-home-unlock-all]').isDisabled(), true);
  assert.equal((await saved()).allLevelsUnlocked, true);
  check('unlock persists after reloading exported HTML');
  await enterMap();
  let count = 0;
  for (const region of map.regions) {
    if (await page.locator('[data-journey-map]').getAttribute('data-region') !== region.id) {
      await page.locator('[data-map-fan-toggle]').click();
      await page.locator(`[data-island="${region.id}"]`).click();
      await page.locator(`[data-journey-map][data-region="${region.id}"]`).waitFor();
      await page.locator('[data-archipelago]').waitFor({ state: 'detached' });
    }
    assert.equal(await page.locator('[data-map-node][data-status="locked"]').count(), 0);
    for (const node of region.nodes) {
      assert.equal(await page.locator(`[data-map-node="${node.id}"]`).getAttribute('data-status'), 'available');
      count++;
    }
    const last = region.nodes.at(-1).id;
    await page.locator(`[data-map-node="${last}"]`).scrollIntoViewIfNeeded();
    await page.locator(`[data-map-node="${last}"]`).click();
    const intro = page.locator(`[data-painted-intro][data-level-id="${last}"]`);
    await intro.waitFor();
    assert.equal(await intro.locator('[data-painted-primary]').isEnabled(), true);
    await intro.locator('[data-painted-primary]').click();
    await page.locator('[data-journey-map]').waitFor({ state: 'detached' });
    await page.locator('.hunt-player, .disaster-player, .configured-player, .kitchen-player').waitFor();
    assert.deepEqual((await saved()).completed, {});
    check(`${region.id}: every node available and final level starts without prerequisites`);
    await load();
    await enterMap();
    assert.equal(await page.locator('[data-journey-map]').getAttribute('data-region'), region.id);
  }
  assert.equal(count, 24);
  check('all 24 levels unlocked; resume preserves late-level region');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.network, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  throw error;
} finally {
  if (browser) { await browser.close(); report.browserClosed = true; }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
}