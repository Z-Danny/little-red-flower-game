// Final offline artifact QA. Uses disposable storage and a private muted browser.
// Optional: OFFLINE_FILE, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, SINGLE_ENTRY_TEST_OUTPUT.
// SINGLE_ENTRY_FAILURE_ONLY=1 runs the resource-failure supplement alone.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const html = path.resolve(root, process.env.OFFLINE_FILE || process.argv[2] || 'outputs/本地离线版/小红花应急行动.html');
const output = path.resolve(root, process.env.SINGLE_ENTRY_TEST_OUTPUT || 'outputs/single-entry-verification');
const failureOnly = process.env.SINGLE_ENTRY_FAILURE_ONLY === '1';
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const map = read('content/journey-map.json');
const copy = read('content/journey-copy.json').levels;
const introductions = read('content/level-introductions.json');
const nodes = map.regions.flatMap((region) => region.nodes.map((node) => ({ ...node, regionId: region.id })));
const sizes = [[320, 568], [375, 667], [390, 844], [430, 932], [540, 960], [1440, 900]];
const representatives = new Map([
  ['typhoon-home', 'hunt'], ['flood-kit', 'configured'], ['fire-shelter-practice', 'practice'],
  ['rain-street-preparation-v1', 'disaster'], ['oil-fire', 'kitchen'],
]);
const boardKey = 'little-red-flower-leaderboard-v1';
const locationKey = 'little-red-flower-journey-location-v1';
const surfaceSelector = '.hunt-player,.disaster-player,.configured-player,.kitchen-player';
const introSelector = '[data-painted-intro]';
const primarySelector = '[data-painted-primary]';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = {
  status: 'running', startedAt: new Date().toISOString(), html, htmlSha256: null, browser: null,
  checks: [], openings: [], layouts: [], runtime: [], failureRuntime: [], locked: [], dismissals: [], screenshots: [],
  errors: [], network: [], failedRequests: [], contextsCreated: 0, contextsClosed: 0, browserClosed: false,
  fixture: 'Disposable profiles only: an empty progress fixture tests locked/available nodes; a preset 72-flower fixture tests all 24 entries and replay access. Preset progress is not earned gameplay.',
  readinessFixture: 'For five representative engines, the native image src setter is delayed by 900ms only after the map confirmation is visible. No game model, timer, completion or rule state is injected.',
  boundaryFixture: 'A test-only document.modelContext adapter captures the real registered start_emergency_level callback; locked/unknown requests exercise the production entry boundary.',
  syntheticFailureFixture: 'After a map confirmation is visible, exactly one detached Image src assignment dispatches a synthetic error event instead of reading its asset. Real files and game state are not modified; the next retry uses the native image loader.',
  physicalDevice: 'not_run', humanAudio: 'not_run',
};
fs.mkdirSync(output, { recursive: true });
const passed = (name, detail = {}) => { report.checks.push({ name, status: 'passed', ...detail }); console.log(`PASS ${name}`); };

function findPlaywright() {
  const specified = process.env.PLAYWRIGHT_MODULE || process.env.PLAYWRIGHT_PATH;
  const candidates = specified ? [specified.startsWith('file:') ? fileURLToPath(specified) : specified] : [
    'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'), 'playwright-core',
  ];
  for (const candidate of candidates) {
    try { return require(candidate.startsWith('.') ? path.resolve(candidate) : candidate); }
    catch (error) { if (specified) throw error; }
  }
  throw new Error('Playwright unavailable. Set PLAYWRIGHT_MODULE to its package path.');
}

function findBrowser(chromium) {
  const specified = process.env.BROWSER_EXECUTABLE || process.env.EDGE_PATH;
  const candidates = specified ? [specified] : [
    chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium', '/usr/bin/google-chrome',
  ];
  const executable = candidates.find((file) => fs.existsSync(file));
  assert(executable, 'Chromium unavailable. Set BROWSER_EXECUTABLE.');
  return executable;
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function screenshot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(output, file) });
  report.screenshots.push(file);
}

async function board(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), boardKey);
}

let browser;
let page;
const contexts = new Set();
async function fixture(complete, reducedMotion = 'reduce', excludedId = null) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion, hasTouch: true, deviceScaleFactor: 1, offline: true });
  contexts.add(context);
  report.contextsCreated += 1;
  await context.addInitScript(({ ids, complete, excludedId, boardKey, locationKey }) => {
    const id = complete ? 'single-entry-complete-fixture' : 'single-entry-locked-fixture';
    if (!localStorage.getItem(boardKey)) {
      localStorage.setItem(boardKey, JSON.stringify({ version: 1, activePlayerId: id, players: [{ id, name: '单入口验收样本', region: '', createdAt: 1, completed: complete ? Object.fromEntries(ids.filter((level) => level !== excludedId).map((level) => [level, 3])) : {} }] }));
      localStorage.setItem(locationKey, JSON.stringify({ [id]: { levelId: 'typhoon-home', visitedAt: 1 } }));
    }
    window.__singleEntryTools = new Map();
    Object.defineProperty(document, 'modelContext', { configurable: true, value: {
      registerTool(tool, options) {
        window.__singleEntryTools.set(tool.name, tool);
        options?.signal?.addEventListener('abort', () => {
          if (window.__singleEntryTools.get(tool.name) === tool) window.__singleEntryTools.delete(tool.name);
        }, { once: true });
      },
    } });
    // Resource scheduling fixture; preserve the original image implementation.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    window.__singleEntryImageDelay = 0;
    window.__singleEntryDelayedImages = 0;
    window.__singleEntryFailImages = 0;
    window.__singleEntryFailedImages = 0;
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...descriptor, set(value) {
      if (window.__singleEntryFailImages > 0 && !this.isConnected) {
        window.__singleEntryFailImages -= 1;
        window.__singleEntryFailedImages += 1;
        setTimeout(() => this.dispatchEvent(new Event('error')), 0);
        return;
      }
      const delay = window.__singleEntryImageDelay;
      if (delay > 0 && !this.isConnected) {
        window.__singleEntryDelayedImages += 1;
        setTimeout(() => descriptor.set.call(this, value), delay);
      } else descriptor.set.call(this, value);
    } });
  }, { ids: nodes.map((node) => node.id), complete, excludedId, boardKey, locationKey });
  const current = await context.newPage();
  page = current;
  current.setDefaultTimeout(25_000);
  current.on('pageerror', (error) => report.errors.push(error.message));
  current.on('request', (request) => { if (/^https?:/.test(request.url())) report.network.push(request.url()); });
  current.on('requestfailed', (request) => report.failedRequests.push({ url: request.url().slice(0, 160), failure: request.failure()?.errorText }));
  await current.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60_000 });
  const continueButton = current.locator('[data-home-continue]');
  await continueButton.waitFor({ state: 'visible' });
  // The cover button has a continuous breathing animation. Use a real pointer
  // at its observed, unobstructed center instead of waiting for zero movement.
  const continuePoint = await continueButton.evaluate((button) => {
    const box = button.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    return { x, y, hits: document.elementFromPoint(x, y)?.closest('button') === button, enabled: !button.disabled };
  });
  assert(continuePoint.hits && continuePoint.enabled, 'Continue button is occluded or disabled');
  await current.mouse.click(continuePoint.x, continuePoint.y);
  await current.locator('[data-map-fan-toggle]').waitFor({ state: 'visible' });
  await current.evaluate(() => document.fonts.ready);
  return { context, page: current };
}

async function closeContext(context) {
  await context.close();
  contexts.delete(context);
  report.contextsClosed += 1;
}

async function inspect(page, node) {
  await page.locator('[data-map-fan-toggle]').waitFor({ state: 'visible' });
  if (await page.locator('.garden-shell').getAttribute('data-region') !== node.regionId) {
    const toggle = page.locator('[data-map-fan-toggle]');
    await toggle.click();
    await page.locator('[data-archipelago]').waitFor({ state: 'visible' });
    await page.locator(`[data-island="${node.regionId}"]`).click();
    await page.locator('[data-archipelago]').waitFor({ state: 'hidden' });
    await page.locator(`.garden-region[data-region="${node.regionId}"]`).waitFor({ state: 'attached' });
  }
  const entry = page.locator(`[data-map-node="${node.id}"]`);
  await entry.evaluate((element) => {
    const scroller = element.closest('.garden-scroll');
    const box = element.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    scroller.scrollTo({ top: scroller.scrollTop + box.y + box.height / 2 - view.y - view.height / 2, behavior: 'instant' });
  });
  await settle(page);
  await entry.locator('.garden-node-label').click();
  const panel = page.locator(`${introSelector}[data-level-id="${node.id}"]`);
  await panel.waitFor({ state: 'visible' });
  await settle(page);
  assert.equal(await page.locator(introSelector).count(), 1, `${node.id}: expected exactly one introduction`);
  assert(await panel.evaluate((element) => element.classList.contains('painted-map-entry')), `${node.id}: introduction is not the map panel`);
  assert.equal(await page.locator(surfaceSelector).count(), 0, `${node.id}: merely inspecting mounted a game`);
  assert.equal(await page.locator('.garden-dialog').count(), 0, `${node.id}: obsolete white map dialog remains`);
  assert.equal(await panel.getByRole('button', { name: '返回地图', exact: true }).count(), 0, `${node.id}: removed return button remains`);
  return panel;
}

async function geometry(page, node, width, height, capture = true) {
  await page.setViewportSize({ width, height });
  await settle(page);
  const layout = await page.locator(introSelector).evaluate((element) => {
    const rect = (node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const title = element.querySelector('.painted-intro-title');
    const description = element.querySelector('.painted-intro-description');
    const start = element.querySelector('[data-painted-primary]');
    const card = element.querySelector('.painted-intro-card');
    return {
      title: rect(title), description: rect(description), start: rect(start), card: rect(card),
      textFits: [title, description, start].every((node) => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1),
      controls: [...element.querySelectorAll('button')].filter((button) => button.getBoundingClientRect().width > 0).map((button) => {
        const box = rect(button);
        return { ...box, text: button.textContent.trim(), centerHits: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === button };
      }),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      scale: visualViewport?.scale ?? 1,
    };
  });
  const label = `${node.id} ${width}x${height}`;
  report.layouts.push({ id: node.id, width, height, ...layout });
  assert.equal(layout.scale, 1, `${label}: unexpected page zoom`);
  assert(!layout.horizontalOverflow && layout.textFits, `${label}: horizontal overflow or clipped text`);
  for (const box of [layout.card, layout.title, layout.description, ...layout.controls]) {
    assert(box.width > 0 && box.height > 0 && box.x >= -1 && box.y >= -1 && box.right <= width + 1 && box.bottom <= height + 1, `${label}: element leaves viewport: ${JSON.stringify(box)}`);
  }
  assert(layout.title.bottom <= layout.description.y + 1, `${label}: title overlaps description`);
  assert(layout.description.bottom <= layout.start.y + 1, `${label}: description overlaps start`);
  for (const box of [layout.title, layout.description, layout.start]) {
    assert(box.x >= layout.card.x - 1 && box.right <= layout.card.right + 1 && box.y >= layout.card.y - 1 && box.bottom <= layout.card.bottom + 1, `${label}: content leaves panel`);
  }
  assert(layout.controls.every((box) => box.width >= 44 && box.height >= 44 && box.centerHits), `${label}: button smaller than 44px or occluded`);
  if (capture) await screenshot(page, `${node.id}-entry-${width}x${height}`);
}

async function dismiss(page, node, method) {
  if (method === 'escape') await page.keyboard.press('Escape');
  else {
    const point = await page.locator(introSelector).evaluate((shade) => {
      const dialog = shade.querySelector('.painted-intro-dialog');
      const bounds = dialog.getBoundingClientRect();
      const candidates = [[8, innerHeight / 2], [innerWidth - 8, innerHeight / 2], [innerWidth / 2, 8], [innerWidth / 2, innerHeight - 8]];
      return candidates.find(([x, y]) => !(x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) && shade.contains(document.elementFromPoint(x, y)));
    });
    assert(point, `${node.id}: no tappable area outside popup`);
    await page.mouse.click(point[0], point[1]);
  }
  await page.locator(introSelector).waitFor({ state: 'detached' });
  await settle(page);
  assert.equal(await page.locator(surfaceSelector).count(), 0, `${node.id}: dismissal entered a game`);
  assert.equal(await page.locator(introSelector).count(), 0, `${node.id}: outside tap reached another map node`);
  const focused = await page.evaluate(() => document.activeElement?.closest('[data-map-node]')?.getAttribute('data-map-node'));
  assert.equal(focused, node.id, `${node.id}: ${method} did not restore node focus`);
  report.dismissals.push({ id: node.id, method, focusRestored: true, noGameMounted: true });
}

async function verifyShadeDrag(page, node) {
  const points = await page.locator(introSelector).evaluate((shade) => {
    const dialog = shade.querySelector('.painted-intro-dialog').getBoundingClientRect();
    const title = shade.querySelector('.painted-intro-title').getBoundingClientRect();
    const candidates = [[8, innerHeight / 2], [innerWidth - 8, innerHeight / 2], [innerWidth / 2, 8]];
    const start = candidates.find(([x, y]) => !(x >= dialog.left && x <= dialog.right && y >= dialog.top && y <= dialog.bottom) && shade.contains(document.elementFromPoint(x, y)));
    return { start, end: [title.x + title.width / 2, title.y + title.height / 2] };
  });
  assert(points.start, 'No outside drag origin');
  await page.mouse.move(...points.start);
  await page.mouse.down();
  await page.mouse.move(...points.end, { steps: 8 });
  await page.mouse.up();
  await settle(page);
  assert.equal(await page.locator(introSelector).count(), 1, `${node.id}: dragging shade into panel incorrectly dismissed it`);
  assert.equal(await page.locator(surfaceSelector).count(), 0, `${node.id}: shade drag started a game`);
  passed(`${node.id}: shade-to-panel drag does not dismiss or start`);
}

async function observeStart(page) {
  await page.evaluate(({ introSelector, primarySelector, surfaceSelector }) => {
    window.__singleEntryObservation = { primaryClicks: 0, secondIntro: false, unreadyElapsed: [], samples: [] };
    const state = window.__singleEntryObservation;
    const check = () => {
      const intros = [...document.querySelectorAll(introSelector)];
      if (intros.length > 1 || intros.some((intro) => !intro.classList.contains('painted-map-entry'))) state.secondIntro = true;
      const surface = document.querySelector(surfaceSelector);
      if (!surface) return;
      const sample = { ready: surface.dataset.ready, phase: surface.dataset.phase, elapsed: Number(surface.dataset.elapsed || 0) };
      if (sample.ready === 'false' && sample.elapsed > 0) state.unreadyElapsed.push(sample);
      if (state.samples.length < 30 && !state.samples.some((item) => item.ready === sample.ready && item.phase === sample.phase)) state.samples.push(sample);
    };
    document.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest(primarySelector)) state.primaryClicks += 1;
    }, { capture: true, once: true });
    window.__singleEntryObserver?.disconnect();
    window.__singleEntryObserver = new MutationObserver(check);
    window.__singleEntryObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ready', 'data-phase', 'data-elapsed'] });
    check();
  }, { introSelector, primarySelector, surfaceSelector });
}

async function startOnce(page, node, slow = false) {
  const before = await board(page);
  await observeStart(page);
  if (slow) await page.evaluate(() => { window.__singleEntryImageDelay = 900; window.__singleEntryDelayedImages = 0; });
  await page.locator(`${introSelector} ${primarySelector}`).click();
  await page.locator(surfaceSelector).waitFor({ state: 'visible' });
  if (slow) {
    await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.ready === 'false', surfaceSelector);
    await page.waitForTimeout(220);
    assert.equal(await page.locator(surfaceSelector).getAttribute('data-ready'), 'false', `${node.id}: image-delay fixture did not hold readiness`);
    assert.equal(Number(await page.locator(surfaceSelector).getAttribute('data-elapsed')), 0, `${node.id}: timer ran before assets were ready`);
    assert.notEqual(await page.locator(surfaceSelector).getAttribute('data-phase'), 'playing', `${node.id}: gameplay began before assets were ready`);
    assert(await page.evaluate(() => window.__singleEntryDelayedImages > 0), `${node.id}: delayed no scene images`);
    await page.evaluate(() => { window.__singleEntryImageDelay = 0; });
  }
  await page.waitForFunction(({ selector, id }) => {
    const surface = document.querySelector(selector);
    return surface?.dataset.level === id && surface.dataset.ready === 'true' && surface.dataset.phase === 'playing' && Number(surface.dataset.elapsed) > 80;
  }, { selector: surfaceSelector, id: node.id });
  await page.locator(introSelector).waitFor({ state: 'detached' });
  const observation = await page.evaluate(() => window.__singleEntryObservation);
  assert.equal(observation.primaryClicks, 1, `${node.id}: expected exactly one primary click`);
  assert.equal(observation.secondIntro, false, `${node.id}: a second intro was mounted`);
  assert.deepEqual(observation.unreadyElapsed, [], `${node.id}: time advanced during preparation`);
  assert.deepEqual(await board(page), before, `${node.id}: starting changed rewards`);
  return observation;
}

async function elapsed(page) { return Number(await page.locator(surfaceSelector).getAttribute('data-elapsed')); }

async function runtime(page, node) {
  const startedAt = await elapsed(page);
  await page.waitForFunction(({ selector, previous }) => Number(document.querySelector(selector)?.dataset.elapsed) > previous + 350, { selector: surfaceSelector, previous: startedAt });
  await page.locator('header.painted-game-hud').getByRole('button', { name: /^暂停(?:游戏)?$/ }).click();
  await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.paused === 'true', surfaceSelector);
  const pausedAt = await elapsed(page);
  await page.waitForTimeout(420);
  assert.equal(await elapsed(page), pausedAt, `${node.id}: paused timer advanced`);
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await page.waitForFunction(({ selector, previous }) => Number(document.querySelector(selector)?.dataset.elapsed) > previous + 300, { selector: surfaceSelector, previous: pausedAt });
  assert.equal(await page.locator(introSelector).count(), 0, `${node.id}: resuming brought back intro`);
  const observation = await page.evaluate(() => window.__singleEntryObservation);
  assert.equal(observation.secondIntro, false, `${node.id}: intro appeared during runtime`);
  report.runtime.push({ id: node.id, engine: representatives.get(node.id), startedAt, pausedAt, readyGate: true, pauseFrozen: true, resumed: true, observation });
  await screenshot(page, `${node.id}-playing-390x844`);
  passed(`${node.id}: one-click start, delayed-ready gate, timer, pause and resume`);
}

async function returnToMap(page) {
  await page.locator('header.painted-game-hud').getByRole('button', { name: /^返回关卡(?:地图)?$/ }).click();
  await settle(page);
  if (!await page.locator('[data-map-fan-toggle]').count()) {
    const endObservation = page.getByRole('button', { name: '结束本次观察', exact: true });
    if (await endObservation.count()) await endObservation.click();
    await page.locator('.hunt-dialog,.disaster-dialog,.configured-dialog,.kitchen-dialog').getByRole('button', { name: /^返回关卡(?:地图)?$/, exact: true }).click();
  }
  await page.locator('[data-map-fan-toggle]').waitFor({ state: 'visible' });
  assert.equal(await page.locator(introSelector).count(), 0, 'Returning to map reopened the intro');
  await page.evaluate(() => window.__singleEntryObserver?.disconnect());
}

async function verifyLoadFailure(page, node, recovery) {
  const originalBoard = await board(page);
  await inspect(page, node);
  await observeStart(page);
  await page.evaluate(() => { window.__singleEntryFailImages = 1; window.__singleEntryFailedImages = 0; });
  await page.locator(`${introSelector} ${primarySelector}`).click();
  const status = page.locator('[data-load-state="error"]');
  await status.waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => window.__singleEntryFailedImages), 1, `${node.id}: expected one synthetic image failure`);
  assert.equal(await page.locator(introSelector).count(), 0, `${node.id}: resource error brought back introduction`);
  assert.equal(await status.getAttribute('role'), null, `${node.id}: loading error should stay a lightweight status`);
  assert.equal(await page.locator(surfaceSelector).getAttribute('data-ready'), 'false');
  assert.notEqual(await page.locator(surfaceSelector).getAttribute('data-phase'), 'playing');
  assert.equal(await elapsed(page), 0, `${node.id}: error advanced timer`);
  await page.waitForTimeout(250);
  assert.equal(await elapsed(page), 0, `${node.id}: waiting on error advanced timer`);
  await screenshot(page, `${node.id}-load-error-${recovery}`);
  if (recovery === 'retry') {
    await status.getByRole('button', { name: '重新加载', exact: true }).click();
    await page.waitForFunction(({ selector, id }) => {
      const surface = document.querySelector(selector);
      return surface?.dataset.level === id && surface.dataset.ready === 'true' && surface.dataset.phase === 'playing' && Number(surface.dataset.elapsed) > 80;
    }, { selector: surfaceSelector, id: node.id });
    assert.equal(await page.locator(introSelector).count(), 0, `${node.id}: retry requires a second intro`);
    const observation = await page.evaluate(() => window.__singleEntryObservation);
    assert.equal(observation.primaryClicks, 1, `${node.id}: retry required another start confirmation`);
    assert.equal(observation.secondIntro, false, `${node.id}: retry mounted a second intro`);
    assert.deepEqual(observation.unreadyElapsed, []);
    await screenshot(page, `${node.id}-load-retry-playing`);
    await returnToMap(page);
  } else {
    await status.getByRole('button', { name: '返回地图', exact: true }).click();
    await page.locator('[data-map-fan-toggle]').waitFor({ state: 'visible' });
    await page.waitForTimeout(250);
    assert.equal(await page.locator(surfaceSelector).count(), 0, `${node.id}: canceled load reentered the game`);
    assert.equal(await page.locator(introSelector).count(), 0, `${node.id}: cancellation reopened introduction`);
    await page.evaluate(() => window.__singleEntryObserver?.disconnect());
  }
  assert.deepEqual(await board(page), originalBoard, `${node.id}: error ${recovery} changed rewards`);
  report.failureRuntime.push({ id: node.id, recovery, syntheticFailures: 1, errorElapsed: 0, noSecondIntro: true, noReward: true });
  passed(`${node.id}: one synthetic image failure, frozen timer, ${recovery === 'retry' ? 'reload automatically starts' : 'cancel returns to map'}, no reward`);
}

try {
  assert.equal(nodes.length, 24, 'Expected all 24 formal map nodes');
  report.htmlSha256 = hash(fs.readFileSync(html));
  report.scriptSha256 = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
  const { chromium } = findPlaywright();
  browser = await chromium.launch({ headless: true, executablePath: findBrowser(chromium), args: ['--mute-audio'] });
  report.browser = browser.version();

  if (!failureOnly) {
  const lockedFixture = await fixture(false, 'no-preference');
  page = lockedFixture.page;
  const emptyBoard = await board(page);
  for (const region of map.regions) {
    const lockedNode = nodes.find((node) => node.id === region.nodes[1].id);
    const panel = await inspect(page, lockedNode);
    assert.equal(await panel.locator(`${primarySelector}:not(:disabled)`).count(), 0, `${lockedNode.id}: locked start is enabled`);
    assert.equal((await panel.locator('.painted-intro-description').innerText()).trim(), `先完成「${copy[lockedNode.unlockAfter].title}」，即可解锁本关。`, `${lockedNode.id}: locked explanation must name its prerequisite`);
    // A removed HTML disabled attribute must not bypass the actual start guard.
    await panel.locator(primarySelector).evaluate((button) => { button.disabled = false; button.click(); button.disabled = true; });
    await settle(page);
    assert.equal(await page.locator(surfaceSelector).count(), 0, `${lockedNode.id}: removing disabled bypassed lock`);
    const boundary = await page.evaluate(async (id) => {
      const tool = window.__singleEntryTools.get('start_emergency_level');
      if (!tool) return { missing: true };
      try { return { opened: await tool.execute({ levelId: id }) }; }
      catch (error) { return { rejected: true, message: error.message }; }
    }, lockedNode.id);
    assert(boundary.rejected, `${lockedNode.id}: production start boundary did not reject lock: ${JSON.stringify(boundary)}`);
    assert.equal(await page.locator(surfaceSelector).count(), 0);
    await geometry(page, lockedNode, 390, 844);
    await dismiss(page, lockedNode, 'outside');
    await inspect(page, lockedNode);
    await dismiss(page, lockedNode, 'escape');
    assert.deepEqual(await board(page), emptyBoard, `${lockedNode.id}: locked entry mutated progress`);
    report.locked.push({ id: lockedNode.id, prerequisite: lockedNode.unlockAfter, disabled: true, removedDisabledRejected: true, boundary });
  }
  const first = nodes[0];
  const availablePanel = await inspect(page, first);
  assert.equal((await availablePanel.locator(primarySelector).innerText()).trim(), introductions[first.id].startLabel, 'Available level must keep its scene-specific start label');
  assert.equal((await availablePanel.locator('.painted-intro-description').innerText()).trim(), introductions[first.id].description, 'Available level must show its scene introduction');
  await verifyShadeDrag(page, first);
  await page.waitForTimeout(500);
  assert.equal(await page.locator(surfaceSelector).count(), 0, 'Map inspection starts gameplay before confirmation');
  await dismiss(page, first, 'outside');
  await inspect(page, first);
  await dismiss(page, first, 'escape');
  const unknown = await page.evaluate(async () => {
    try { await window.__singleEntryTools.get('start_emergency_level').execute({ levelId: 'missing-single-entry-fixture' }); return false; }
    catch { return true; }
  });
  assert(unknown, 'Unknown level bypassed production entry guard');
  assert.deepEqual(await board(page), emptyBoard);
  passed('Three regions: locked entries, production bypass guard, outside/Escape dismissal and focus restoration');
  await closeContext(lockedFixture.context);

  const completedFixture = await fixture(true);
  page = completedFixture.page;
  const originalBoard = await board(page);
  assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'Reduced-motion fixture is not active');
  for (const node of nodes) {
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = await inspect(page, node);
    const observed = {
      id: node.id,
      title: (await panel.locator('.painted-intro-title').innerText()).trim(),
      description: (await panel.locator('.painted-intro-description').innerText()).trim(),
      button: (await panel.locator(primarySelector).innerText()).trim(),
      status: await page.locator(`[data-map-node="${node.id}"]`).getAttribute('data-status'),
    };
    assert.equal(observed.status, 'complete', `${node.id}: fixture should be a completed replay`);
    assert.equal(observed.title, copy[node.id].title, `${node.id}: wrong title`);
    assert.equal(observed.description, introductions[node.id].description, `${node.id}: wrong introduction`);
    assert.equal(observed.button, '再玩一次', `${node.id}: completed level must show the replay label`);
    assert(await panel.locator(primarySelector).isEnabled(), `${node.id}: completed level cannot replay`);
    await geometry(page, node, 390, 844);
    if (representatives.has(node.id)) {
      for (const [width, height] of sizes.filter(([width]) => width !== 390)) await geometry(page, node, width, height);
      await page.setViewportSize({ width: 390, height: 844 });
      await settle(page);
    }
    const observation = await startOnce(page, node, representatives.has(node.id));
    observed.observation = observation;
    report.openings.push(observed);
    if (representatives.has(node.id)) await runtime(page, node);
    await returnToMap(page);
    assert.deepEqual(await board(page), originalBoard, `${node.id}: replay entry/exit changed flowers or completed records`);
    passed(`${node.id}: one map introduction, one primary click, no second introduction, no replay-entry reward`);
  }
  assert.equal(report.openings.length, 24);
  assert.equal(report.runtime.length, representatives.size);
  await closeContext(completedFixture.context);
  }
  for (const id of ['typhoon-home', 'oil-fire']) {
    const faultFixture = await fixture(true);
    page = faultFixture.page;
    const node = nodes.find((node) => node.id === id);
    await verifyLoadFailure(page, node, 'cancel');
    await verifyLoadFailure(page, node, 'retry');
    await closeContext(faultFixture.context);
  }
  assert.equal(report.failureRuntime.length, 4, 'Expected cancel and retry resource-failure checks for hunt and kitchen');
  if (!failureOnly) {
    const node = nodes.find((node) => node.id === 'storm-street-check-v2');
    const previewFixture = await fixture(true, 'reduce', node.id);
    page = previewFixture.page;
    const panel = await inspect(page, node);
    assert.equal(await page.locator(`[data-map-node="${node.id}"]`).getAttribute('data-status'), 'available');
    const startLabel = (await panel.locator(primarySelector).innerText()).trim();
    assert.equal(startLabel, introductions[node.id].startLabel);
    assert.equal((await panel.locator('.painted-intro-description').innerText()).trim(), introductions[node.id].description);
    await screenshot(page, 'storm-street-available-390x844');
    const before = await board(page);
    const observation = await startOnce(page, node);
    await returnToMap(page);
    assert.deepEqual(await board(page), before);
    report.preview = { id: node.id, fixture: 'Only storm-street-check-v2 is omitted from completed; its prerequisite remains complete.', startLabel, screenshot: 'storm-street-available-390x844.png', availableStartsWithOneClick: true, observation };
    await closeContext(previewFixture.context);
    passed('Original storm-street example: available label, final screenshot and one-click start');
  }
  assert.equal(report.errors.length, 0, `Runtime errors: ${JSON.stringify(report.errors)}`);
  assert.equal(report.network.length, 0, `Offline HTTP(S) requests: ${JSON.stringify(report.network)}`);
  assert.equal(report.failedRequests.length, 0, `Failed requests: ${JSON.stringify(report.failedRequests)}`);
  report.finalHtmlSha256 = hash(fs.readFileSync(html));
  assert.equal(report.finalHtmlSha256, report.htmlSha256, 'HTML changed during QA');
  passed(failureOnly ? 'Hunt and kitchen resource-failure cancellation/retry passed' : '24 formal entries and five engine families passed; six viewport sizes; locks, dismissal, readiness, pause, reduced motion and error recovery');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || error.message;
  console.error(report.failure);
  if (page && !page.isClosed()) await screenshot(page, 'failure').catch(() => {});
  process.exitCode = 1;
} finally {
  for (const context of [...contexts]) {
    try { await closeContext(context); }
    catch (error) { report.errors.push(`Context close: ${error.message}`); }
  }
  if (browser) {
    try { await browser.close(); report.browserClosed = true; }
    catch (error) { report.errors.push(`Browser close: ${error.message}`); }
  }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), [
    '# 单次关卡确认：最终离线 HTML 验收', '',
    `- 结果：${report.status}`, `- HTML：${html}`, `- SHA-256：${report.htmlSha256}`,
    `- 浏览器：${report.browser}；独立 headless、offline、--mute-audio。`,
    `- finally 关闭 contexts：${report.contextsClosed}/${report.contextsCreated}；browser：${report.browserClosed}。`,
    `- 运行范围：${failureOnly ? '加载失败补充验收' : '完整单入口验收'}；24关入口：${report.openings.length}/24；布局样本：${report.layouts.length}；代表引擎计时/暂停：${report.runtime.length}/5。`,
    `- 识别/厨房图片加载失败：${report.failureRuntime.length}/4；错误时不计时，取消不领奖，重试自动开始且不再确认。`,
    ...(report.preview ? [`- 用户原例：${report.preview.screenshot}；可开始状态，按钮「${report.preview.startLabel}」，一次确认进入游戏。`] : []),
    `- 尺寸：${sizes.map((size) => size.join('×')).join('、')}；标题、正文与按钮不重叠，按钮至少44×44 CSS px。`,
    '- 地图仅绘本框；一次开始进入运行状态；关内不出现第二个介绍框；点击外部和Escape关闭并归还节点焦点。',
    '- 三张地图的锁定节点检查禁用按钮、移除disabled后的真实处理器保护及注册工具入口保护。',
    '- 预置已完成关的重玩开始、暂停和退出不改变花朵/成绩；此脚本未执行真实重玩通关领奖。',
    `- 存档样本：${report.fixture}`, `- 就绪测试：${report.readinessFixture}`, `- 入口边界：${report.boundaryFixture}`, `- 加载失败样本：${report.syntheticFailureFixture}`,
    `- 错误 ${report.errors.length}；HTTP(S)请求 ${report.network.length}；失败请求 ${report.failedRequests.length}。`,
    '- physicalDevice: not_run', '- humanAudio: not_run',
    ...(report.failure ? ['', '## 失败', '', '```text', report.failure, '```'] : []),
    '', '## 截图', '', ...report.screenshots.map((file) => `- [${file}](${file})`), '',
  ].join('\n'));
}
