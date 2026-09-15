// Tests the exported HTML with native clicks/keyboard input in a private muted browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url);
const file = path.resolve(root, process.env.OFFLINE_FILE || 'outputs/本地离线版/小红花应急行动.html');
const output = path.join(root, 'outputs/audio-feedback-verification');
fs.mkdirSync(output, { recursive: true });
const map = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-map.json')));
const nodes = map.regions.flatMap(region => region.nodes.map(node => ({ ...node, region: region.id })));
let playwright;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { playwright = require(candidate); break; } catch {}
}
assert(playwright, 'Playwright required');
const executablePath = [process.env.BROWSER_EXECUTABLE, playwright.chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(p => p && fs.existsSync(p));
const report = { file, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'), checks: [], errors: [], network: [], browserClosed: false, humanListening: 'not_run', physicalDevice: 'not_run', fixture: 'Disposable progress unlocks test access; lift-wait and well-call completions are earned with native keyboard interactions. Visibility uses a synthetic document.hidden event.' };
const pass = (name, detail = {}) => { report.checks.push({ name, ...detail }); console.log('PASS', name); };
let browser, context, page;
const surface = () => page.locator('.hunt-player,.disaster-player,.configured-player,.kitchen-player');
const ui = locator => locator.evaluate(n => ({ played: Number(n.dataset.uiAudioPlayed || 0), cue: n.dataset.uiAudioCue || '', voices: Number(n.dataset.uiAudioVoices || 0) }));
const settle = () => page.waitForTimeout(500);
async function open(id) {
  const node = nodes.find(n => n.id === id);
  await page.locator('[data-map-fan-toggle]').waitFor();
  if (await page.locator('.garden-shell').getAttribute('data-region') !== node.region) {
    const toggle = page.locator('[data-map-fan-toggle]');
    await toggle.click();
    await page.locator('[data-archipelago]').waitFor({ state: 'visible' });
    await page.locator(`[data-island="${node.region}"]`).click();
    await page.locator('[data-archipelago]').waitFor({ state: 'hidden' });
    await page.locator(`.garden-shell[data-region="${node.region}"]`).waitFor({ state: 'visible' });
  }
  const entry = page.locator(`[data-map-node="${id}"]`);
  await entry.evaluate(el => {
    const scroll = el.closest('.garden-scroll'), box = el.getBoundingClientRect(), view = scroll.getBoundingClientRect();
    scroll.scrollTo({ top: scroll.scrollTop + box.y + box.height / 2 - view.y - view.height / 2, behavior: 'instant' });
  });
  await entry.locator('.garden-node-label').click();
  await page.locator('[data-painted-primary]').click();
  await page.waitForFunction(id => document.querySelector(`[data-level="${id}"]`)?.getAttribute('data-phase') === 'playing', id);
  await settle();
}
async function pause() { await surface().getByRole('button', { name: /^(暂停|暂停游戏)$/ }).click(); await settle(); }
async function resume() { await page.getByRole('button', { name: '继续游戏', exact: true }).click(); await settle(); }
async function back() {
  if (await page.locator('.kitchen-player').count()) {
    if (await surface().getAttribute('data-paused') === 'true') await resume();
  } else {
    if (await surface().getAttribute('data-paused') !== 'true') await pause();
    const end = page.getByRole('button', { name: '结束本次观察', exact: true });
    if (await end.count()) await end.click();
  }
  const buttons = surface().getByRole('button', { name: /^(返回关卡(?:地图)?|返回地图)$/ });
  const before = await page.evaluate(() => window.__feedbackContexts.map(c => c.__qaSources.length));
  await buttons.last().click();
  await page.locator('.garden-shell').waitFor();
  await settle();
  const tails = await page.evaluate(before => window.__feedbackContexts.flatMap((c, index) =>
    c.__qaClosedAt === null ? [] : c.__qaSources.slice(before[index] ?? 0).filter(s => s.stops.length && s.stops[0] - s.start <= .14).map(s => ({ ...s, closedAt: c.__qaClosedAt }))), before);
  assert(tails.some(s => s.stops.length === 1 && s.closedAt >= s.stops[0] - .01), 'navigation click must finish before its context closes');
}
async function keyboard(name) {
  const button = page.locator('.configured-keyboard').getByRole('button', { name, exact: true });
  await button.focus(); await button.press('Enter');
}
async function solveLegacy(id) {
  const rules = JSON.parse(fs.readFileSync(path.join(root, `content/levels/${id}/level.json`)));
  const skin = JSON.parse(fs.readFileSync(path.join(root, `content/levels/${id}/skins/paperbook.json`)));
  for (const rule of rules.interactions.filter(r => r.outcome === 'correct')) {
    await keyboard(rules.objects.find(o => o.id === rule.source).label);
    if (rule.mode === 'drop') await keyboard(`放到 ${skin.zoneLabels?.[rule.target] ?? rule.target}`);
    await page.waitForFunction(goal => document.querySelector('.configured-player')?.dataset.resolved.split(',').includes(goal), rule.grants[0]);
  }
}
try {
  browser = await playwright.chromium.launch({ headless: true, executablePath, args: ['--mute-audio'] });
  report.browser = browser.version();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', offline: true });
  await context.addInitScript(({ ids }) => {
    if (!localStorage.getItem('little-red-flower-leaderboard-v1')) {
      localStorage.setItem('little-red-flower-leaderboard-v1', JSON.stringify({ version: 1, activePlayerId: 'audio-qa', players: [{ id: 'audio-qa', name: '音效验收样本', region: '', createdAt: 1, completed: Object.fromEntries(ids.filter(id => !['lift-wait', 'well-call'].includes(id)).map(id => [id, 3])) }] }));
      localStorage.setItem('little-red-flower-journey-location-v1', JSON.stringify({ 'audio-qa': { levelId: 'lift-wait', visitedAt: 1 } }));
    }
    const Native = window.AudioContext;
    window.__feedbackContexts = [];
    window.AudioContext = class extends Native {
      constructor(...args) { super(...args); this.__qaSources = []; this.__qaClosedAt = null; window.__feedbackContexts.push(this); }
      createOscillator() {
        const source = super.createOscillator(), record = { start: 0, stops: [] };
        const start = source.start.bind(source), stop = source.stop.bind(source);
        source.start = (at = this.currentTime) => { record.start = at; this.__qaSources.push(record); return start(at); };
        source.stop = (at = this.currentTime) => { record.stops.push(at); return stop(at); };
        return source;
      }
      close() { this.__qaClosedAt = this.currentTime; return super.close(); }
    };
  }, { ids: nodes.map(n => n.id) });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('request', r => { if (/^https?:/.test(r.url())) report.network.push(r.url()); });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 60000 });
  await page.locator('[data-home-continue]').waitFor();
  assert.equal(await page.evaluate(() => window.__feedbackContexts.length), 0);
  await page.locator('[data-home-continue]').click(); await settle();
  assert.equal((await ui(page.locator('.game-page'))).played, 1);
  pass('no context before gesture; first map button sounds once');
  for (const id of ['lift-wait', 'well-call', 'typhoon-home', 'rain-street-preparation-v1', 'flood-kit', 'clear-corridor', 'quake-cover-practice', 'oil-fire']) {
    await open(id);
    const player = surface();
    if (['lift-wait', 'well-call'].includes(id)) {
      await page.waitForFunction(() => Number(document.querySelector('.configured-player')?.dataset.audioRms) > 0.00001);
      const detail = await player.evaluate(n => ({ state: n.dataset.audioState, loops: Number(n.dataset.audioLoops), rms: Number(n.dataset.audioRms) }));
      assert(detail.loops >= 2); pass(`${id}: music and environment produce samples`, detail);
    }
    const before = await ui(player);
    await player.getByRole('button', { name: /^(场景提示|物件剪影提示)$/ }).click(); await settle();
    const hinted = await ui(player);
    assert.equal(hinted.played, before.played + 1); assert.equal(hinted.cue, 'hint'); assert.equal(hinted.voices, 0);
    pass(`${id}: hint plays once, voices released`);
    if (await player.getAttribute('data-paused') !== 'true') await pause();
    await page.getByRole('button', { name: /^(关闭声音|全部静音)$/ }).click(); await settle();
    const muted = await ui(player);
    await resume();
    await player.getByRole('button', { name: /^(场景提示|物件剪影提示)$/ }).click(); await settle();
    assert.equal((await ui(player)).played, muted.played);
    pass(`${id}: level mute also mutes hint/resume UI`);
    if (await player.getAttribute('data-paused') !== 'true') await pause();
    await page.getByRole('button', { name: /^(打开声音|取消静音)$/ }).click(); await settle();
    await resume();
    if (id === 'quake-cover-practice') {
      await pause();
      const slider = page.getByRole('slider', { name: '交互音效音量', exact: true });
      await slider.focus(); await slider.press('Home'); await settle();
      const zero = (await ui(player)).played;
      await resume(); await player.getByRole('button', { name: '场景提示', exact: true }).click(); await settle();
      assert.equal((await ui(player)).played, zero);
      pass('practice SFX volume zero also silences UI cues');
      await pause(); await slider.focus(); await slider.press('End'); await settle(); await resume();
    }
    if (id === 'lift-wait') {
      const hiddenCount = (await ui(player)).played;
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await player.getByRole('button', { name: '场景提示', exact: true }).click(); await settle();
      assert.equal((await ui(player)).played, hiddenCount);
      assert.equal(await player.getAttribute('data-audio-state'), 'suspended');
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
      await settle(); pass('hidden page produces no UI cue; legacy engine pauses');
    }
    if (['flood-kit', 'clear-corridor'].includes(id)) {
      const rules = JSON.parse(fs.readFileSync(path.join(root, `content/levels/${id}/level.json`)));
      const rule = rules.interactions.find(r => r.outcome === 'correct' && r.mode === 'tap');
      const label = rules.objects.find(o => o.id === rule.source).label;
      const beforeTap = (await ui(player)).played;
      await keyboard(label);
      await page.waitForFunction(() => document.querySelector('.configured-player')?.dataset.audioCue === 'tap');
      assert(await page.locator('.configured-keyboard').getByRole('button', { name: label, exact: true }).isDisabled());
      await page.waitForFunction(goal => document.querySelector('.configured-player')?.dataset.resolved.split(',').includes(goal), rule.grants[0]);
      await page.waitForFunction(() => document.querySelector('.configured-player')?.dataset.audioCue === 'found');
      assert.equal((await ui(player)).played, beforeTap);
      assert.equal(await page.locator('.configured-keyboard').getByRole('button', { name: label, exact: true }).count(), 0);
      pass(`${id}: accepted tap produces pickup then found, busy/completed input is disabled, no generic duplicate`);
      for (const remaining of rules.interactions.filter(r => r.outcome === 'correct' && r.mode === 'tap' && r.id !== rule.id)) {
        await keyboard(rules.objects.find(o => o.id === remaining.source).label);
        await page.waitForFunction(goal => document.querySelector('.configured-player')?.dataset.resolved.split(',').includes(goal), remaining.grants[0]);
      }
      await page.waitForFunction(() => {
        const player = document.querySelector('.configured-player');
        return player?.dataset.phase === 'complete' && player?.dataset.audioCue === 'success' && Number(player?.dataset.audioRms) > .01;
      });
      await page.waitForTimeout(1700);
      assert(Number(await player.getAttribute('data-audio-rms')) < .001, 'collection completion must return to silence');
      pass(`${id}: real completion plays success samples after playing ends, then becomes silent`);
      await page.getByRole('button', { name: '回到地图', exact: true }).click();
      await page.locator('.garden-shell').waitFor(); await settle();
    }
    if (['lift-wait', 'well-call'].includes(id)) {
      const beforeActions = await ui(player);
      await solveLegacy(id);
      await page.locator('[data-awarded="true"]').waitFor();
      assert.equal((await ui(player)).played, beforeActions.played, 'keyboard actions do not duplicate generic UI cues');
      const mapBefore = await ui(page.locator('.game-page'));
      await page.getByRole('button', { name: '种下小红花', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.garden-shell')?.dataset.planting === '');
      await settle();
      const mapAfter = await ui(page.locator('.game-page'));
      assert.equal(mapAfter.played - mapBefore.played, id === 'lift-wait' ? 6 : 5);
      pass(`${id}: native actions complete, map planting stages play once`, { finalCue: mapAfter.cue, cues: mapAfter.played - mapBefore.played });
    } else if (!['flood-kit', 'clear-corridor'].includes(id)) await back();
    assert(await page.evaluate(() => window.__feedbackContexts.filter(c => c.state !== 'closed').length <= 2), 'level contexts released after return');
  }
  pass('return-to-map UI tails finish before their audio contexts close');
  await open('lift-wait'); await solveLegacy('lift-wait');
  await page.locator('[data-replay="true"]').waitFor();
  const replayBefore = (await ui(page.locator('.game-page'))).played;
  await page.getByRole('button', { name: '回到地图', exact: true }).click();
  await page.locator('.garden-shell').waitFor(); await page.waitForTimeout(1600);
  assert.equal(await page.locator('.garden-shell').getAttribute('data-planting'), '');
  assert.equal((await ui(page.locator('.game-page'))).played, replayBefore + 1);
  pass('replayed level has button feedback but no repeated planting reward');
  await page.getByRole('button', { name: '打开游戏设置', exact: true }).click();
  await page.getByRole('button', { name: '关闭按钮和奖励音效', exact: true }).click(); await settle();
  const count = (await ui(page.locator('.game-page'))).played;
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click(); await settle();
  assert.equal((await ui(page.locator('.game-page'))).played, count);
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.locator('[data-home-continue]').click(); await settle();
  assert.equal((await ui(page.locator('.game-page'))).played, 0);
  assert.equal(await page.locator('.game-page').getAttribute('data-journey-music-muted'), 'false');
  pass('map UI mute persists; music remains independent');
  await page.getByRole('button', { name: '打开游戏设置', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: '打开按钮和奖励音效', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'settings-320.png') });
  assert.equal(report.errors.length, 0); assert.equal(report.network.length, 0);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = String(error.stack || error);
  if (page) { await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText().catch(() => '')); }
  console.error(error); process.exitCode = 1;
} finally {
  await context?.close(); await browser?.close(); report.browserClosed = true;
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
