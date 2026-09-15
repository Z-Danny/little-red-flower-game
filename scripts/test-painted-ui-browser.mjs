// Final-artifact QA only. Requires export:offline; never edits the game or real browser storage.
// Optional: OFFLINE_FILE, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, PAINTED_UI_TEST_OUTPUT.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const html = path.resolve(root, process.env.OFFLINE_FILE || 'outputs/本地离线版/小红花应急行动.html');
const output = path.resolve(root, process.env.PAINTED_UI_TEST_OUTPUT || 'docs/painted-ui/verification');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const map = read('content/journey-map.json');
const copy = read('content/journey-copy.json').levels;
const introductions = read('content/level-introductions.json');
const nodes = map.regions.flatMap((region) => region.nodes.map((node) => ({ ...node, regionId: region.id })));
const sizes = [[320, 568], [390, 844], [430, 932], [1440, 900]];
const layoutIds = new Set(['typhoon-home', 'flood-kit', 'rain-street-preparation-v1', 'fire-shelter-practice', 'oil-fire']);
const challengeIds = new Set(['typhoon-home', 'flood-kit', 'rain-street-preparation-v1']);
const responseIds = new Set(['fire-shelter-practice', 'oil-fire']);
const boardKey = 'little-red-flower-leaderboard-v1';
const locationKey = 'little-red-flower-journey-location-v1';
const surfaceSelector = '.hunt-player,.disaster-player,.configured-player,.kitchen-player';
const introSelector = '[data-painted-intro]';
const primarySelector = '[data-painted-primary]';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const arrows = /[\u2190-\u21ff\u2794-\u27bf>›»]/;
const report = {
  status: 'running', startedAt: new Date().toISOString(), html, htmlSha256: null, browser: null,
  checks: [], openings: [], layouts: [], hudLayouts: [], runtime: [], assets: [], screenshots: [], errors: [], network: [], failedRequests: [],
  fixture: 'Isolated 69-flower fixture: 23 mapped levels preset complete; typhoon-home remains incomplete. Only for entry/layout access; not earned gameplay. No user profile is opened.',
  physicalDevice: 'not_run', humanAudio: 'not_run', contextClosed: false, browserClosed: false,
};
fs.mkdirSync(output, { recursive: true });
const passed = (name, detail = {}) => { report.checks.push({ name, status: 'passed', ...detail }); console.log(`PASS ${name}`); };

function findPlaywright() {
  const specified = process.env.PLAYWRIGHT_MODULE;
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
  const candidates = process.env.BROWSER_EXECUTABLE ? [process.env.BROWSER_EXECUTABLE] : [
    chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/chromium', '/usr/bin/google-chrome',
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

async function openLevel(page, node) {
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
  // The painted map confirmation is the only level introduction.
  await page.locator(`${introSelector}[data-level-id="${node.id}"]`).waitFor({ state: 'visible' });
  await page.locator(`${primarySelector}:not(:disabled)`).waitFor({ state: 'visible' });
  assert.equal(await page.locator(surfaceSelector).count(), 0, `${node.id}: the scene mounted before map confirmation`);
  await settle(page);
}

async function verifyImages(page, id) {
  const images = await page.locator('img').evaluateAll(async (elements) => {
    return Promise.all(elements.map(async (element) => {
      try { await element.decode(); } catch { /* Record failed dimensions below. */ }
      return { alt: element.alt, width: element.naturalWidth, height: element.naturalHeight, complete: element.complete, embedded: /^(data:|blob:)/.test(element.currentSrc || element.src) };
    }));
  });
  assert(images.every((image) => image.complete && image.width > 0 && image.height > 0), `${id}: failed image decode: ${JSON.stringify(images.filter((image) => !image.complete || !image.width || !image.height))}`);
  assert(images.every((image) => image.embedded), `${id}: an image is not embedded in the offline file`);
  return images.length;
}

async function verifyOpening(page, node, sourceAssets) {
  const panel = page.locator(introSelector);
  const observed = {
    id: node.id,
    title: (await panel.locator('.painted-intro-title').innerText()).trim(),
    description: (await panel.locator('.painted-intro-description').innerText()).trim(),
    startLabel: (await panel.locator(primarySelector).innerText()).trim(),
    imageCount: await verifyImages(page, node.id),
  };
  assert.equal(observed.title, copy[node.id].title, `${node.id}: title changed`);
  assert.equal(observed.description, introductions[node.id].description, `${node.id}: wrong scene description`);
  const status = await page.locator(`[data-map-node="${node.id}"]`).getAttribute('data-status');
  assert.equal(observed.startLabel, status === 'complete' ? '再玩一次' : introductions[node.id].startLabel, `${node.id}: wrong start label`);
  const buttonTexts = await panel.locator('button').allTextContents();
  assert(buttonTexts.every((text) => !arrows.test(text)), `${node.id}: opening button contains an arrow`);
  assert.equal(await panel.locator('button svg[class*="arrow"],button svg[class*="chevron"]').count(), 0, `${node.id}: opening button contains an SVG arrow`);
  const backgroundSources = await panel.evaluate((element) => {
    const urls = [];
    for (const node of [element, ...element.querySelectorAll('*')]) {
      if (node.tagName === 'IMG') urls.push(node.currentSrc || node.src);
      for (const pseudo of [null, '::before', '::after']) {
        const background = getComputedStyle(node, pseudo).backgroundImage;
        for (const match of background.matchAll(/url\(["']?(data:image\/[^"')]+)["']?\)/g)) urls.push(match[1]);
      }
    }
    return [...new Set(urls)].filter((url) => url.startsWith('data:image/'));
  });
  const seen = backgroundSources.map((url) => hash(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')));
  for (const name of ['modal-panel-v2', 'modal-button-v2']) {
    const asset = sourceAssets.find((item) => item.file.endsWith(`/${name}.webp`));
    assert(asset && seen.includes(asset.sha256), `${node.id}: ${name}.webp is absent or not the current embedded asset`);
  }
  for (const asset of sourceAssets.filter((asset) => seen.includes(asset.sha256))) {
    if (!report.assets.some((item) => item.file === asset.file)) report.assets.push({ ...asset, renderedEmbeddedMatch: true });
  }
  report.openings.push(observed);
  passed(`${node.id}: preserved title, scenario copy, arrow-free start button and embedded panel`);
}

async function geometry(page, id, width, height) {
  await page.setViewportSize({ width, height });
  await settle(page);
  const layout = await page.locator(introSelector).evaluate((element) => {
    const rect = (node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const get = (selector) => element.querySelector(selector);
    const title = get('.painted-intro-title');
    const description = get('.painted-intro-description');
    const start = get('.painted-intro-start');
    const card = get('.painted-intro-card');
    return {
      card: rect(card), title: rect(title), description: rect(description), start: rect(start),
      textFits: [title, description, start].every((node) => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1),
      controls: [...element.querySelectorAll('button')].map((button) => {
        const box = rect(button);
        return { text: button.textContent.trim(), ...box, centerHits: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === button };
      }),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      viewportScale: visualViewport?.scale ?? 1,
    };
  });
  report.layouts.push({ id, width, height, ...layout });
  const label = `${id} ${width}x${height}`;
  assert.equal(layout.viewportScale, 1, `${label}: unexpected page zoom`);
  assert(!layout.horizontalOverflow, `${label}: horizontal page overflow`);
  assert(layout.textFits, `${label}: text clipped or overflowing`);
  for (const box of [layout.card, layout.title, layout.description, ...layout.controls]) {
    assert(box.width > 0 && box.height > 0, `${label}: empty element`);
    assert(box.x >= -1 && box.y >= -1 && box.right <= width + 1 && box.bottom <= height + 1, `${label}: element outside viewport: ${JSON.stringify(box)}`);
  }
  assert(Math.abs(layout.card.y + layout.card.height / 2 - height / 2) <= Math.max(70, height * .12), `${label}: popup is not centered vertically`);
  assert(layout.title.bottom <= layout.description.y + 1, `${label}: title overlaps description`);
  assert(layout.description.bottom <= layout.start.y + 1, `${label}: description overlaps start button`);
  for (const box of [layout.title, layout.description, layout.start]) {
    assert(box.x >= layout.card.x - 1 && box.right <= layout.card.right + 1 && box.y >= layout.card.y - 1 && box.bottom <= layout.card.bottom + 1, `${label}: popup content leaves its panel`);
  }
  assert(layout.controls.every((box) => box.width >= 44 && box.height >= 44 && box.centerHits), `${label}: a popup button is too small or occluded`);
  await screenshot(page, `${id}-opening-${width}x${height}`);
  passed(`${label}: centered panel, readable copy and usable button bounds`);
}

async function elapsed(page) {
  return Number(await page.locator(surfaceSelector).getAttribute('data-elapsed'));
}

async function verifyHudImages(page, id, sourceAssets, withTimer = true) {
  const hud = page.locator('header.painted-game-hud');
  for (const [name, roleName] of [['hint', /^(物件剪影提示|场景提示)$/], ['pause', /^暂停(?:游戏)?$/], ['back', /^返回关卡(?:地图)?$/]]) {
    const button = hud.getByRole('button', { name: roleName });
    assert.equal(await button.count(), 1, `${id}: missing ${name} button`);
    assert(await button.locator('img').count() > 0, `${id}: ${name} does not use image artwork`);
    const src = await button.locator('img').first().getAttribute('src');
    assert(src?.startsWith('data:image/'), `${id}: ${name} image is not embedded`);
    const digest = hash(Buffer.from(src.slice(src.indexOf(',') + 1), 'base64'));
    const asset = sourceAssets.find((item) => item.file.endsWith(`/${name}.webp`) && item.sha256 === digest);
    assert(asset, `${id}: ${name} image differs from the selected current artwork`);
    if (!report.assets.some((item) => item.file === asset.file)) report.assets.push({ ...asset, renderedEmbeddedMatch: true });
  }
  for (const [selector, name] of withTimer ? [['.painted-timer-empty', 'timer-empty'], ['.painted-timer-gold', 'timer-full'], ['.painted-timer-pointer', 'petal']] : []) {
    const src = await page.locator(selector).getAttribute('src');
    assert(src?.startsWith('data:image/'), `${id}: ${name} is not embedded`);
    const digest = hash(Buffer.from(src.slice(src.indexOf(',') + 1), 'base64'));
    const asset = sourceAssets.find((item) => item.file.endsWith(`/${name}.webp`) && item.sha256 === digest);
    assert(asset, `${id}: ${name} differs from current countdown artwork`);
    if (!report.assets.some((item) => item.file === asset.file)) report.assets.push({ ...asset, renderedEmbeddedMatch: true });
  }
  await verifyImages(page, id);
}

async function verifyNarrowFloodHud(page, sourceAssets) {
  await page.locator(primarySelector).click();
  await page.locator(introSelector).waitFor({ state: 'detached' });
  await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.phase === 'playing', surfaceSelector);
  await page.setViewportSize({ width: 280, height: 568 });
  await settle(page);
  await verifyHudImages(page, 'flood-house-response-v1', sourceAssets, false);
  const geometry = await page.locator('header.painted-game-hud').evaluate((header) => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    return [...header.children].filter((element) => element.getBoundingClientRect().width > 0).map((element) => {
      const box = rect(element);
      return { ...box, name: element.getAttribute('aria-label') || element.textContent.trim(), button: element.tagName === 'BUTTON', centerHits: element.tagName !== 'BUTTON' || document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === element };
    });
  });
  assert.equal(geometry.filter((box) => box.button).length, 3, 'Narrow flood HUD must retain all three image buttons');
  for (const box of geometry) {
    assert(box.x >= -1 && box.right <= 281 && box.y >= -1 && box.bottom <= 569, `280px flood HUD leaves viewport: ${JSON.stringify(box)}`);
    if (box.button) assert(box.width >= 44 && box.height >= 44 && box.centerHits, `280px flood HUD has a small/occluded button: ${box.name}`);
  }
  for (let i = 0; i < geometry.length; i += 1) for (let j = i + 1; j < geometry.length; j += 1) {
    const a = geometry[i], b = geometry[j];
    const overlapX = Math.min(a.right, b.right) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
    assert(overlapX <= 1 || overlapY <= 1, `280px flood HUD overlap: ${a.name} / ${b.name}`);
  }
  report.narrowFloodHud = { viewport: { width: 280, height: 568 }, elements: geometry, status: 'passed' };
  await screenshot(page, 'flood-house-response-v1-hud-280x568');
  passed('flood-house-response-v1: 280px HUD keeps three image buttons, title and elapsed clock without overlap');
}

async function verifyHudBounds(page, id) {
  const layout = await page.evaluate((selector) => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const surface = document.querySelector(selector);
    const header = surface.querySelector('header');
    const countdown = surface.querySelector('.painted-countdown');
    return {
      surface: rect(surface), countdown: rect(countdown),
      pointer: rect(surface.querySelector('.painted-timer-pointer')),
      controls: [...header.querySelectorAll('button')].map((button) => {
        const box = rect(button);
        return { label: button.getAttribute('aria-label'), ...box, centerHits: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === button };
      }),
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, surfaceSelector);
  report.hudLayouts.push({ id, ...layout });
  for (const box of [layout.countdown, layout.pointer, ...layout.controls]) {
    assert(box.x >= -1 && box.y >= -1 && box.right <= layout.viewport.width + 1 && box.bottom <= layout.viewport.height + 1, `${id}: HUD leaves the viewport: ${JSON.stringify(box)}`);
  }
  assert(layout.countdown.y <= layout.surface.y + layout.surface.height * .15, `${id}: countdown is not at the top of the game`);
  assert(layout.controls.every((box) => box.width >= 44 && box.height >= 44 && box.centerHits), `${id}: HUD control is too small or occluded`);
}

async function verifyRuntime(page, node, sourceAssets) {
  const before = 0;
  assert.equal(await page.locator(surfaceSelector).count(), 0, `${node.id}: scene mounted before map start`);
  await page.waitForTimeout(1100);
  assert.equal(await page.locator(surfaceSelector).count(), 0, `${node.id}: waiting in map confirmation started a scene`);
  const progress = page.getByRole('progressbar', { name: '挑战剩余进度', exact: true });
  await page.locator(primarySelector).click();
  await page.locator(introSelector).waitFor({ state: 'detached' });
  await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.phase === 'playing', surfaceSelector);
  assert.equal(await page.locator(introSelector).count(), 0, `${node.id}: a second introduction appeared`);
  if (challengeIds.has(node.id)) assert(Number(await progress.getAttribute('aria-valuenow')) >= 49, `${node.id}: loading spent the challenge countdown`);
  await page.waitForFunction((selector) => Number(document.querySelector(selector)?.dataset.elapsed) > 650, surfaceSelector);
  const startedAt = await elapsed(page);
  if (responseIds.has(node.id)) {
    report.runtime.push({ id: node.id, before, startedAt, explicitStart: true });
    passed(`${node.id}: one map confirmation starts practice/kitchen without a second introduction`);
    return;
  }
  await verifyHudImages(page, node.id, sourceAssets);
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await settle(page);
    await verifyHudBounds(page, node.id);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page);
  const initialRemaining = Number(await progress.getAttribute('aria-valuenow'));
  const initialFill = Number(await page.locator('.painted-countdown').getAttribute('data-remaining'));
  await page.waitForTimeout(1200);
  const laterRemaining = Number(await progress.getAttribute('aria-valuenow'));
  const laterFill = Number(await page.locator('.painted-countdown').getAttribute('data-remaining'));
  assert(laterRemaining < initialRemaining, `${node.id}: countdown did not decrease`);
  assert(laterFill < initialFill, `${node.id}: painted countdown fill did not decrease`);
  const hint = page.getByRole('button', { name: '物件剪影提示', exact: true });
  await hint.click();
  assert.equal(await hint.getAttribute('aria-expanded'), 'true', `${node.id}: hint did not open`);
  const hintId = await hint.getAttribute('aria-controls');
  assert(hintId && await page.locator(`[id="${hintId}"]`).isVisible(), `${node.id}: hint panel is not visible`);
  await screenshot(page, `${node.id}-playing-hint-390x844`);
  await page.locator('header.painted-game-hud').getByRole('button', { name: /^暂停(?:游戏)?$/ }).click();
  await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.paused === 'true', surfaceSelector);
  const pausedAt = await elapsed(page);
  await page.waitForTimeout(1050);
  assert.equal(await elapsed(page), pausedAt, `${node.id}: elapsed time advanced while paused`);
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await page.waitForFunction(({ selector, previous }) => Number(document.querySelector(selector)?.dataset.elapsed) > previous + 500, { selector: surfaceSelector, previous: pausedAt });
  report.runtime.push({ id: node.id, before, startedAt, initialRemaining, laterRemaining, initialFill, laterFill, pausedAt, hintExpanded: true, pauseFrozen: true, resumed: true });
  if (node.id === 'typhoon-home') {
    const beforeRetry = await board(page);
    await page.locator('header.painted-game-hud').getByRole('button', { name: /^暂停(?:游戏)?$/ }).click();
    await page.getByRole('button', { name: '重新开始', exact: true }).click();
    await page.waitForFunction((selector) => Number(document.querySelector(selector)?.dataset.elapsed) < 250, surfaceSelector);
    assert.equal(Number(await progress.getAttribute('aria-valuenow')), 50, 'Retry did not restore full countdown');
    assert.deepEqual(await board(page), beforeRetry, 'Retry awarded flowers or changed completion records');
    await screenshot(page, 'typhoon-home-retry-reset-390x844');
    passed('typhoon-home: retry resets countdown without awarding flowers');
  }
  passed(`${node.id}: one map start, decreasing timer, hint disclosure, pause freeze and resume`);
}

async function returnToMap(page) {
  if (await page.locator(introSelector).count()) {
    await page.keyboard.press('Escape');
    await page.locator(introSelector).waitFor({ state: 'detached' });
  }
  else {
    await page.locator('header.painted-game-hud').getByRole('button', { name: /^返回关卡(?:地图)?$/ }).click();
    await settle(page);
    if (!await page.locator('[data-map-fan-toggle]').count()) {
      const endObservation = page.getByRole('button', { name: '结束本次观察', exact: true });
      if (await endObservation.count()) await endObservation.click();
      await page.locator('[role="dialog"]').getByRole('button', { name: /^返回关卡(?:地图)?$/, exact: true }).click();
    }
  }
  await page.locator('[data-map-fan-toggle]').waitFor({ state: 'visible' });
}

let browser;
let context;
let page;
try {
  assert.equal(nodes.length, 24);
  assert.deepEqual(Object.keys(introductions).sort(), nodes.map((node) => node.id).sort());
  const htmlBytes = fs.readFileSync(html);
  report.htmlSha256 = hash(htmlBytes);
  const assetDirectory = path.join(root, 'public/ui/painted-v1');
  const sourceAssets = fs.readdirSync(assetDirectory).filter((file) => file.endsWith('.webp')).map((file) => ({ file: `/ui/painted-v1/${file}`, sha256: hash(fs.readFileSync(path.join(assetDirectory, file))) }));
  for (const name of ['modal-panel-v2', 'modal-button-v2', 'hint', 'pause', 'back', 'timer-full', 'timer-empty', 'petal']) {
    const bytes = fs.readFileSync(path.join(assetDirectory, `${name}.webp`));
    assert(htmlBytes.includes(Buffer.from(bytes.toString('base64'))), `${name}.webp is not embedded in the final HTML`);
  }
  report.sourceAssets = sourceAssets;
  const { chromium } = findPlaywright();
  browser = await chromium.launch({ headless: true, executablePath: findBrowser(chromium), args: ['--mute-audio'] });
  report.browser = browser.version();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, deviceScaleFactor: 1, offline: true });
  await context.addInitScript(({ ids, boardKey, locationKey }) => {
    if (localStorage.getItem(boardKey)) return;
    const id = 'painted-ui-isolated-fixture';
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, activePlayerId: id, players: [{ id, name: '界面验收样本', region: '', createdAt: 1, completed: Object.fromEntries(ids.filter((level) => level !== 'typhoon-home').map((level) => [level, 3])) }] }));
    localStorage.setItem(locationKey, JSON.stringify({ [id]: { levelId: 'typhoon-home', visitedAt: 1 } }));
  }, { ids: nodes.map((node) => node.id), boardKey, locationKey });
  page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('request', (request) => { if (/^https?:/.test(request.url())) report.network.push(request.url()); });
  page.on('requestfailed', (request) => report.failedRequests.push({ url: request.url().slice(0, 200), failure: request.failure()?.errorText }));
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60_000 });
  await page.locator('[data-home-continue]').click();
  await page.locator('[data-map-fan-toggle]').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  const originalBoard = await board(page);
  for (const node of nodes) {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLevel(page, node);
    await verifyOpening(page, node, sourceAssets);
    if (layoutIds.has(node.id)) {
      for (const [width, height] of sizes) await geometry(page, node.id, width, height);
      await page.setViewportSize({ width: 390, height: 844 });
      await settle(page);
    }
    if (challengeIds.has(node.id) || responseIds.has(node.id)) await verifyRuntime(page, node, sourceAssets);
    if (node.id === 'flood-house-response-v1') await verifyNarrowFloodHud(page, sourceAssets);
    await returnToMap(page);
    assert.deepEqual(await board(page), originalBoard, `${node.id}: starting, pausing or returning changed rewards`);
  }
  assert.equal(report.openings.length, 24);
  assert.equal(report.assets.length, 8, 'Not all eight painted assets were rendered and matched to current source files');
  assert.equal(report.errors.length, 0, `Runtime errors: ${JSON.stringify(report.errors)}`);
  assert.equal(report.network.length, 0, `Offline HTML attempted HTTP(S): ${JSON.stringify(report.network)}`);
  assert.equal(report.failedRequests.length, 0, `Failed requests: ${JSON.stringify(report.failedRequests)}`);
  report.finalHtmlSha256 = hash(fs.readFileSync(html));
  assert.equal(report.finalHtmlSha256, report.htmlSha256, 'Final artifact changed during browser QA');
  passed('24 scene openings; 20 viewport samples; representative timers, hints and start gates; no new rewards, network or runtime errors');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || error.message;
  console.error(report.failure);
  if (page && !page.isClosed()) await screenshot(page, 'failure').catch(() => {});
  process.exitCode = 1;
} finally {
  if (context) { await context.close(); report.contextClosed = true; }
  if (browser) { await browser.close(); report.browserClosed = true; }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), [
    '# 手绘地图开场与关内 UI：最终离线 HTML 验证', '',
    `- 结果：${report.status}`, `- HTML：${html}`, `- SHA-256：${report.htmlSha256}`,
    `- 浏览器：${report.browser}；headless、隔离存储、离线、--mute-audio。`,
    `- finally 关闭 context：${report.contextClosed}；关闭 browser：${report.browserClosed}。`,
    `- 正式关卡开场：${report.openings.length} / 24；弹窗布局样本：${report.layouts.length} / 20；HUD布局样本：${report.hudLayouts.length} / 12。`,
    `- 视口：${sizes.map((size) => size.join('×')).join('、')}；图片完整解码，面板与图标内嵌图片对照源码 SHA-256。`,
    '- 24关核对标题、场景简介、对应开始文案与无箭头；代表关检查按钮边界、标题/简介/按钮分区。',
    '- 台风识别、暴雨街道、应急包收纳验证点击前不计时、点击后倒计时、提示展开、暂停冻结与继续；台风重新开始恢复倒计时且不发奖。',
    '- 火灾隔烟处置与油锅厨房验证地图确认前不创建场景，一次开始直接游玩且无第二介绍。',
    `- 洪水居家处置280px窄屏HUD三图与标题/计时无重叠：${report.narrowFloodHud?.status || 'not_run'}。`,
    `- 存档样本：${report.fixture}`,
    `- 运行时错误 ${report.errors.length}；HTTP(S)请求 ${report.network.length}；失败请求 ${report.failedRequests.length}。`,
    '- physicalDevice: not_run', '- humanAudio: not_run',
    ...(report.failure ? ['', '## 失败', '', '```text', report.failure, '```'] : []),
    '', '## 截图', '', ...report.screenshots.map((file) => `- [${file}](${file})`), '',
  ].join('\n'));
}
