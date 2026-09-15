import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const file = path.resolve(root, process.env.OFFLINE_FILE || 'outputs/本地离线版/小红花应急行动.html');
const output = path.resolve(root, process.env.JOURNEY_MUSIC_TEST_OUTPUT || 'outputs/journey-music-verification');
fs.mkdirSync(output, { recursive: true });
const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'), 'playwright-core'].filter(Boolean);
let playwright;
for (const candidate of candidates) { try { playwright = require(candidate); break; } catch {} }
assert(playwright, 'Playwright is required');
const executablePath = [process.env.BROWSER_EXECUTABLE, playwright.chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(p => p && fs.existsSync(p));
assert(executablePath, 'An isolated Chromium browser is required');
const report = { file, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'), checks: [], errors: [], network: [], browserClosed: false, humanListening: 'not_run', physicalDevice: 'not_run', visibilityCheck: 'synthetic visibilitychange' };
const pass = name => { report.checks.push(name); console.log('PASS', name); };
let browser;
const state = page => page.locator('.game-page').evaluate(node => ({
  playing: node.dataset.journeyMusicPlaying === 'true', decoded: node.dataset.journeyMusicDecoded === 'true', muted: node.dataset.journeyMusicMuted === 'true',
  position: Number(node.dataset.journeyMusicPosition), phase: node.dataset.journeyMusicState,
}));
const waitPlaying = (page, value) => page.waitForFunction(value => document.querySelector('.game-page')?.dataset.journeyMusicPlaying === String(value), value, { timeout: 15000 });
const settings = async page => { await page.locator('[data-map-settings]').click(); await page.getByRole('dialog', { name: '游戏设置', exact: true }).waitFor(); };
const closeDialog = page => page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
const openArchipelago = async page => {
  await page.locator('[data-map-fan-toggle]').click();
  await page.locator('[data-archipelago]').waitFor();
};
const selectIsland = async (page, categoryId) => {
  await page.locator(`[data-island="${categoryId}"]`).click();
  await page.locator('[data-archipelago]').waitFor({ state: 'hidden' });
  await page.locator(`[data-journey-map][data-region="${categoryId}"]`).waitFor();
};

try {
  browser = await playwright.chromium.launch({ headless: true, executablePath, args: ['--mute-audio'] });
  for (const width of [390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 568 }, reducedMotion: 'reduce' });
    let page;
    try {
      await context.addInitScript(() => {
        const probe = window.__journeyMusicProbe = { contexts: 0, starts: 0, active: 0, maxActive: 0, duration: 0 };
        const NativeAudioContext = window.AudioContext;
        window.AudioContext = class extends NativeAudioContext {
          constructor(...args) {
            super(...args); probe.contexts++;
            const create = this.createBufferSource.bind(this);
            this.createBufferSource = (...args) => {
              const source = create(...args), start = source.start.bind(source), stop = source.stop.bind(source);
              let tracked = false;
              source.start = (...args) => {
                const result = start(...args);
                if (source.loop && source.buffer?.duration > 20) {
                  tracked = true; probe.starts++; probe.active++;
                  probe.maxActive = Math.max(probe.maxActive, probe.active);
                  probe.duration = (source.loopEnd || source.buffer.duration) - source.loopStart;
                }
                return result;
              };
              source.stop = (...args) => {
                const result = stop(...args);
                if (tracked && (!args.length || args[0] <= this.currentTime)) {
                  probe.active--; tracked = false;
                }
                return result;
              };
              source.addEventListener('ended', () => { if (tracked) { probe.active--; tracked = false; } });
              return source;
            };
          }
        };
      });
      page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('request', r => { if (/^https?:/.test(r.url())) report.network.push(r.url()); });
      await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 60000 });
      await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor();
      await page.waitForFunction(() => document.querySelector('.game-page')?.dataset.journeyMusicState);
      assert.equal(await page.evaluate(() => window.__journeyMusicProbe.contexts), 0);
      assert.equal((await state(page)).decoded, false);
      assert.equal(await page.locator('[data-title-screen] button').count(), 1);
      pass(`${width}: no audio context or decode before gesture; original minimal homepage preserved`);
      await page.locator('[data-title-screen]').click({ position: { x: 20, y: 120 } });
      await waitPlaying(page, true);
      const beforeStart = await state(page);
      assert(beforeStart.decoded);
      await page.waitForTimeout(650);
      assert((await state(page)).position > beforeStart.position);
      await page.locator('[data-home-start]').click();
      await page.locator('[data-journey-map]').waitFor();
      await waitPlaying(page, true);
      assert.equal(await page.evaluate(() => window.__journeyMusicProbe.starts), 1);
      pass(`${width}: homepage gesture starts decoded music; map transition keeps the same source`);
      await openArchipelago(page);
      const beforeBrowse = await state(page);
      await page.waitForTimeout(450);
      assert((await state(page)).playing);
      assert((await state(page)).position > beforeBrowse.position);
      assert.equal(await page.evaluate(() => window.__journeyMusicProbe.active), 1);
      assert.equal(await page.evaluate(() => window.__journeyMusicProbe.starts), 1);
      await page.locator('[data-archipelago-back]').click();
      await page.locator('[data-archipelago]').waitFor({ state: 'hidden' });
      await page.locator('[data-journey-map][data-region="nature"]').waitFor();
      assert((await state(page)).playing);
      assert.equal(await page.evaluate(() => window.__journeyMusicProbe.starts), 1);
      pass(`${width}: archipelago browsing and return preserve the music source and advance its clock`);
      await openArchipelago(page);
      await selectIsland(page, 'public');
      assert((await state(page)).playing);
      assert.equal(await page.evaluate(() => window.__journeyMusicProbe.active), 1);
      assert.equal(await page.evaluate(() => window.__journeyMusicProbe.starts), 1);
      await openArchipelago(page);
      await selectIsland(page, 'nature');
      assert((await state(page)).playing);
      assert.equal(await page.evaluate(() => window.__journeyMusicProbe.starts), 1);
      await page.locator('[data-map-node="typhoon-home"]').click();
      await page.getByRole('dialog').waitFor();
      assert((await state(page)).playing);
      await page.locator('[data-painted-primary]').click();
      await page.locator('.hunt-player').waitFor();
      await waitPlaying(page, false);
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => window.__journeyMusicProbe.active), 0);
      const frozen = (await state(page)).position;
      await page.waitForTimeout(500);
      assert(Math.abs((await state(page)).position - frozen) < 0.05);
      pass(`${width}: map switching and map preview preserve music; entering a level stops its source and clock`);
      await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
      const end = page.getByRole('button', { name: '结束本次观察', exact: true });
      if (await end.count()) await end.click();
      await page.locator('.hunt-player').getByRole('button', { name: '返回关卡', exact: true }).last().click();
      await page.locator('[data-journey-map]').waitFor();
      await waitPlaying(page, true);
      assert((await state(page)).position >= frozen - 0.3);
      assert.equal(await page.evaluate(() => window.__journeyMusicProbe.maxActive), 1);
      await settings(page);
      await page.getByRole('button', { name: '关闭首页和地图音乐', exact: true }).click();
      await waitPlaying(page, false);
      assert.equal(await page.evaluate(() => localStorage.getItem('red-flower:journey-music-muted')), 'true');
      assert.equal(await page.getByRole('button', { name: '打开首页和地图音乐', exact: true }).getAttribute('aria-pressed'), 'false');
      await page.getByRole('button', { name: '关闭按钮和奖励音效', exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, `music-settings-${width}.png`) });
      pass(`${width}: return resumes position, one source only, independent persistent music toggle visible`);
      await page.reload({ waitUntil: 'load', timeout: 60000 });
      await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor();
      await page.waitForFunction(() => document.querySelector('.game-page')?.dataset.journeyMusicMuted === 'true');
      await page.locator('[data-home-continue]').click();
      await page.locator('[data-journey-map]').waitFor();
      await page.waitForTimeout(400);
      assert.equal((await state(page)).playing, false);
      assert.equal((await state(page)).decoded, false);
      await settings(page);
      await page.getByRole('button', { name: '打开首页和地图音乐', exact: true }).click();
      await waitPlaying(page, true);
      await closeDialog(page);
      pass(`${width}: muted preference survives reload; explicit unmute starts playback`);
      if (width === 390) {
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
        await waitPlaying(page, false);
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(() => window.__journeyMusicProbe.active), 0);
        const paused = (await state(page)).position;
        await page.waitForTimeout(500);
        assert(Math.abs((await state(page)).position - paused) < 0.05);
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
        await waitPlaying(page, true);
        pass('synthetic background visibility pauses music and clock; foreground resumes');
        const probe = await page.evaluate(() => ({ ...window.__journeyMusicProbe }));
        assert(probe.duration > 20 && probe.duration < 35);
        await page.waitForTimeout((probe.duration + 0.8) * 1000);
        assert((await state(page)).playing);
        assert.equal(await page.evaluate(() => window.__journeyMusicProbe.starts), probe.starts);
        assert.equal(await page.evaluate(() => window.__journeyMusicProbe.active), 1);
        assert.equal(await page.evaluate(() => window.__journeyMusicProbe.maxActive), 1);
        pass('one complete loop plays continuously through the native buffer without new or overlapping sources');
      }
    } catch (error) {
      if (page) {
        await page.screenshot({ path: path.join(output, `failure-${width}.png`) }).catch(() => {});
        const text = await page.locator('body').innerText().catch(() => 'unavailable');
        fs.writeFileSync(path.join(output, `failure-${width}.txt`), text);
      }
      throw error;
    } finally { await context.close(); }
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.network, []);
  pass('final offline HTML has no page errors or network requests');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack;
  process.exitCode = 1; console.error(error);
} finally {
  if (browser) { await browser.close(); report.browserClosed = true; }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
