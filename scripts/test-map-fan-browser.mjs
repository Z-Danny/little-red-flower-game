// Focused final-artifact QA. Run after export:offline; does not modify the game.
// Optional: OFFLINE_FILE, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, MAP_FAN_TEST_OUTPUT.
// Quarter-circle category fan. The 63-flower save is an explicit display fixture, not actual gameplay.
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
const output = path.resolve(root, process.env.MAP_FAN_TEST_OUTPUT || 'outputs/map-fan-verification');
const map = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8'));
const categories = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-categories.json'), 'utf8')).categories;
const copy = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-copy.json'), 'utf8'));
const nodes = map.regions.flatMap((region) => region.nodes);
const sizes = [[320, 568], [390, 844], [430, 932], [520, 960], [1440, 900]];
const selectors = { fan: '[data-map-fan]', toggle: '[data-map-fan-toggle]', tools: '[data-map-corner-tools]', home: '[data-map-home]', settings: '[data-map-settings]', name: '.map-fan-name' };
const boardKey = 'little-red-flower-leaderboard-v1';
const locationKey = 'little-red-flower-journey-location-v1';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = {
  status: 'running', html, sha256: null, browser: null,
  checks: [], assets: [], layouts: [], pinnedScroll: [], mapEdges: [], mapEdgeFailures: [], screenshots: [], errors: [], network: [], failedRequests: [],
  fixtures: {
    fresh: 'Isolated storage; no preset progress.',
    completed63: 'First 21 mapped levels preset to 3 flowers (63 total); last 3 remain incomplete. Display/navigation fixture only, not earned gameplay.',
  },
  physicalDevice: 'not_run', humanAudio: 'not_run', contextClosed: [], browserClosed: false,
};
fs.mkdirSync(output, { recursive: true });
const check = (name, detail = {}) => {
  report.checks.push({ name, status: 'passed', ...detail });
  console.log(`PASS ${name}`);
};

function findPlaywright() {
  const specified = process.env.PLAYWRIGHT_MODULE;
  const candidates = specified ? [specified.startsWith('file:') ? fileURLToPath(specified) : specified] : [
    'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'), 'playwright-core',
  ];
  for (const candidate of candidates) {
    try { return require(candidate.startsWith('.') ? path.resolve(candidate) : candidate); }
    catch (error) { if (specified) throw error; }
  }
  throw new Error('Playwright was not found. Set PLAYWRIGHT_MODULE to its package path.');
}

function findBrowser(chromium) {
  const candidates = process.env.BROWSER_EXECUTABLE ? [process.env.BROWSER_EXECUTABLE] : [
    chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/chromium', '/usr/bin/google-chrome',
  ];
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  assert(executable, 'Chromium/Chrome was not found. Set BROWSER_EXECUTABLE.');
  return executable;
}

async function storage(page) {
  return page.evaluate(({ boardKey, locationKey }) => ({
    board: JSON.parse(localStorage.getItem(boardKey)),
    location: JSON.parse(localStorage.getItem(locationKey)),
  }), { boardKey, locationKey });
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function current(page, category) {
  await page.locator(`.garden-region[data-region="${category.regionIds[0]}"]`).waitFor({ state: 'attached' });
  const toggle = page.locator(selectors.toggle);
  assert((await toggle.innerText()).replace(/\s/g, '').includes(category.name), `${category.id}: current category name is missing`);
  await page.locator(`${selectors.fan} img,${selectors.tools} img`).evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  const src = await toggle.locator('img').getAttribute('src');
  assert(src?.startsWith('data:image/webp;base64,'), 'Current category icon is not embedded');
  assert.equal(hash(Buffer.from(src.slice(src.indexOf(',') + 1), 'base64')), hash(fs.readFileSync(path.join(root, `public/levels/journey-map/map-wheel-v1/category-${category.id}.webp`))), `${category.id}: active category icon is wrong`);
  await settle(page);
}

async function setExpanded(page, expanded, method = 'click') {
  const toggle = page.locator(selectors.toggle);
  if ((await toggle.getAttribute('aria-expanded') === 'true') !== expanded) await toggle[method]();
  await page.waitForFunction(({ selector, expanded }) => document.querySelector(selector)?.getAttribute('aria-expanded') === String(expanded), { selector: selectors.toggle, expanded });
  assert.equal(await page.locator('[data-fan-category]:visible').count(), expanded ? 3 : 0);
  await settle(page);
}

async function select(page, category, method = 'click') {
  await setExpanded(page, true, method);
  const option = page.locator(`[data-fan-category="${category.id}"]`);
  assert((await option.innerText()).replace(/\s/g, '').includes(category.name));
  await option[method]();
  assert.equal(await page.locator(selectors.toggle).getAttribute('aria-expanded'), 'false', 'Selection did not close the fan');
  await current(page, category);
}

async function screenshot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(output, file) });
  report.screenshots.push(file);
}

async function geometry(page, scenario, category, width, height, expanded) {
  const layout = await page.evaluate((selectors) => {
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const fan = document.querySelector(selectors.fan);
    const tools = document.querySelector(selectors.tools);
    const visible = (element) => element.getBoundingClientRect().width > 0 && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none';
    const buttons = [...fan.querySelectorAll('button'), ...tools.querySelectorAll('button')].filter(visible);
    const safeProbe = document.createElement('div');
    safeProbe.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left)';
    document.body.appendChild(safeProbe);
    const style = getComputedStyle(safeProbe);
    const safeArea = Object.fromEntries(['Top', 'Right', 'Bottom', 'Left'].map((side) => [side.toLowerCase(), Number.parseFloat(style[`padding${side}`]) || 0]));
    safeProbe.remove();
    return {
      fan: rect(fan), tools: rect(tools), shell: rect(fan.closest('.garden-shell')), scroll: rect(document.querySelector('.garden-scroll')), safeArea,
      controls: buttons.map((button) => {
        const b = rect(button);
        return { name: button.getAttribute('aria-label') || button.textContent.trim(), ...b, centerHits: document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('button') === button };
      }),
      images: [...fan.querySelectorAll('img'), ...tools.querySelectorAll('img')].filter(visible).map(rect),
      labels: [...fan.querySelectorAll('strong,span')].filter((element) => visible(element) && element.childElementCount === 0 && element.textContent.trim()).map((element) => ({ text: element.textContent.trim(), ...rect(element), fits: element.scrollWidth <= element.clientWidth + 1 && (getComputedStyle(element).overflowY === 'visible' || element.scrollHeight <= element.clientHeight + 1) })),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      viewportScale: window.visualViewport?.scale ?? 1,
    };
  }, selectors);
  report.layouts.push({ scenario, category: category.id, expanded, viewport: { width, height }, ...layout });
  const label = `${scenario} ${category.name} ${expanded ? 'expanded' : 'collapsed'} ${width}x${height}`;
  assert.equal(layout.viewportScale, 1, `${label}: page zoom changed`);
  assert(!layout.horizontalOverflow, `${label}: horizontal page overflow`);
  assert(Math.abs(layout.scroll.y - layout.shell.y - layout.safeArea.top) <= 0.5 && Math.abs(layout.scroll.bottom - layout.shell.bottom) <= 0.5, `${label}: map has a reserved top/bottom band`);
  assert(Math.abs(layout.fan.x - layout.shell.x - layout.safeArea.left) <= 0.5, `${label}: fan is not anchored to the left corner`);
  assert(Math.abs(layout.fan.bottom - layout.shell.bottom + layout.safeArea.bottom) <= 0.5, `${label}: fan is not anchored to the bottom corner`);
  assert(layout.tools.y - layout.shell.y - layout.safeArea.top >= -0.5 && layout.tools.y - layout.shell.y - layout.safeArea.top <= 20.5, `${label}: tools are not at top-right`);
  assert(layout.shell.right - layout.tools.right - layout.safeArea.right >= -0.5 && layout.shell.right - layout.tools.right - layout.safeArea.right <= 20.5, `${label}: tools are not at top-right`);
  for (const box of [layout.fan, layout.tools, ...layout.controls, ...layout.images]) {
    assert(box.width > 0 && box.height > 0, `${label}: zero-size control or image`);
    assert(box.x >= -1 && box.y >= -1 && box.right <= width + 1 && box.bottom <= height + 1, `${label}: element leaves viewport: ${JSON.stringify(box)}`);
  }
  for (const button of layout.controls) {
    assert(button.width >= 43.99 && button.height >= 43.99, `${label}: control below44px: ${JSON.stringify(button)}`);
    assert(button.centerHits, `${label}: control occluded: ${button.name}`);
  }
  assert(layout.labels.every((item) => item.fits), `${label}: category text is clipped`);
  const rightButtons = layout.controls.filter((button) => button.x >= layout.tools.x - 1);
  assert(rightButtons.length === 3 && rightButtons.every((button, index) => index === 0 || rightButtons[index - 1].bottom <= button.y + 1), `${label}: home, wallet and settings must be vertically stacked`);
  await verifyPinnedScroll(page, scenario, category, width, height, expanded);
  check(`${label}: quarter fan and vertical tools fit and stay in their corners`);
}

async function verifyPinnedScroll(page, scenario, category, width, height, expanded) {
  const originalScrollTop = await page.locator('.garden-scroll').evaluate((element) => element.scrollTop);
  let baseline;
  for (const position of ['top', 'middle', 'bottom']) {
    await page.locator('.garden-scroll').evaluate((element, position) => {
      const maximum = element.scrollHeight - element.clientHeight;
      element.scrollTo({ top: position === 'top' ? 0 : position === 'bottom' ? maximum : maximum / 2, behavior: 'instant' });
    }, position);
    await settle(page);
    const snapshot = await page.evaluate((selectors) => {
      const rect = (element) => {
        const r = element.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return { scrollTop: document.querySelector('.garden-scroll').scrollTop, corners: [rect(document.querySelector(selectors.fan)), rect(document.querySelector(selectors.tools))] };
    }, selectors);
    report.pinnedScroll.push({ scenario, category: category.id, expanded, viewport: { width, height }, position, ...snapshot });
    if (baseline) for (let index = 0; index < baseline.length; index += 1) for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(snapshot.corners[index][key] - baseline[index][key]) <= 0.25, `${scenario} ${category.id} ${position}: corner control moved while scrolling`);
    else baseline = snapshot.corners;
  }
  await page.locator('.garden-scroll').evaluate((element, top) => element.scrollTo({ top, behavior: 'instant' }), originalScrollTop);
  await settle(page);
}

async function collectAssets(page, sourceAssets) {
  const images = await page.locator(`${selectors.fan} img,${selectors.tools} img`).evaluateAll(async (elements) => {
    await Promise.all(elements.map((image) => image.decode()));
    return elements.map((image) => ({ src: image.src, width: image.naturalWidth, height: image.naturalHeight }));
  });
  for (const image of images) {
    assert(/^data:image\/(?:png|webp);base64,/.test(image.src), 'Fan/corner icon is not embedded in final HTML');
    const sha256 = hash(Buffer.from(image.src.slice(image.src.indexOf(',') + 1), 'base64'));
    const source = sourceAssets.find((item) => item.sha256 === sha256);
    assert(source, 'Fan/corner icon does not match a current source asset');
    assert(image.width > 0 && image.height > 0, `${source.file}: image did not decode`);
    if (!report.assets.some((item) => item.sha256 === sha256)) report.assets.push({ ...source, width: image.width, height: image.height, embeddedMatchesSource: true });
  }
}

async function verifyDisclosure(page, scenario) {
  const toggle = page.locator(selectors.toggle);
  await select(page, categories[1], 'tap');
  await setExpanded(page, true, 'tap');
  await setExpanded(page, false, 'tap');
  await toggle.focus();
  await page.keyboard.press('Enter');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true', `${scenario}: Enter did not expand the fan`);
  await page.keyboard.press('Escape');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', `${scenario}: Escape did not close the fan`);
  assert(await toggle.evaluate((element) => document.activeElement === element), `${scenario}: Escape did not return focus to the trigger`);
  await page.keyboard.press('Enter');
  const direction = await page.evaluate((selector) => {
    const toggle = document.querySelector(selector);
    const option = document.querySelector('[data-fan-category]');
    return toggle.compareDocumentPosition(option) & Node.DOCUMENT_POSITION_PRECEDING ? 'Shift+Tab' : 'Tab';
  }, selectors.toggle);
  let keyboardCategory;
  for (let step = 0; step < 5; step += 1) {
    keyboardCategory = await page.evaluate(() => document.activeElement?.getAttribute('data-fan-category'));
    if (keyboardCategory) break;
    await page.keyboard.press(direction);
  }
  assert(keyboardCategory, `${scenario}: category options cannot be reached with Tab/Shift+Tab`);
  await page.keyboard.press('Space');
  await current(page, categories.find((category) => category.id === keyboardCategory));
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', `${scenario}: keyboard selection did not close the fan`);
  await setExpanded(page, true);
  const beforeOutside = await page.locator(selectors.fan).getAttribute('data-fan-current');
  const outside = await page.locator('[data-map-fan-dismiss]').boundingBox();
  await page.mouse.click(outside.x + outside.width * 0.85, outside.y + outside.height * 0.45);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', `${scenario}: outside click did not close the fan`);
  assert.equal(await page.locator(selectors.fan).getAttribute('data-fan-current'), beforeOutside);
  assert.equal(await page.locator('.garden-dialog').count(), 0, `${scenario}: outside dismissal accidentally opened a map node`);
  for (const category of categories) await select(page, category);
  check(`${scenario}: touch, Enter/Space, Tab navigation, Escape and outside dismissal work`);
}

async function verifyMapEdges(page, scenario, category) {
  const region = map.regions.find((item) => category.regionIds.includes(item.id));
  const ordered = [...region.nodes].sort((a, b) => a.y - b.y);
  for (const [edge, node] of [['top', ordered[0]], ['bottom', ordered.at(-1)]]) {
    await page.locator('.garden-scroll').evaluate((scroll, edge) => scroll.scrollTo({ top: edge === 'top' ? 0 : scroll.scrollHeight, behavior: 'instant' }), edge);
    await settle(page);
    const surfaces = await page.locator(`[data-map-node="${node.id}"]`).evaluate((element) => {
      return ['.garden-node-label', '.garden-node-bed'].map((selector) => {
        const target = element.querySelector(selector);
        const r = target.getBoundingClientRect();
        return { selector, x: r.x, y: r.y, right: r.right, bottom: r.bottom,
          hits: [0.2, 0.5, 0.8].flatMap((x) => [0.2, 0.5, 0.8].map((y) => document.elementFromPoint(r.x + r.width * x, r.y + r.height * y)?.closest('[data-map-node]') === element)),
        };
      });
    });
    report.mapEdges.push({ scenario, category: category.id, edge, node: node.id, surfaces });
    const failuresBefore = report.mapEdgeFailures.length;
    for (const surface of surfaces) {
      try {
        assert(surface.x >= -1 && surface.right <= 321 && surface.y >= -1 && surface.bottom <= 569, `${scenario} ${category.name} ${edge}: map entry clipped at 320x568: ${JSON.stringify(surface)}`);
        assert(surface.hits.every(Boolean), `${scenario} ${category.name} ${edge} ${node.id}: corner controls or another element obscure map entry: ${JSON.stringify(surface)}`);
      } catch (error) {
        report.mapEdgeFailures.push({ scenario, category: category.id, edge, node: node.id, message: error.message, surface });
        console.error(`FAIL ${error.message}`);
      }
    }
    if (report.mapEdgeFailures.length === failuresBefore) {
      await page.locator(`[data-map-node="${node.id}"] .garden-node-label`).click();
      assert.equal((await page.locator('.garden-dialog h2:not(.garden-sr-only)').innerText()).trim(), copy.levels[node.id].title);
      await page.getByRole('button', { name: '关闭', exact: true }).click();
    }
    if (edge === 'top') await screenshot(page, `${scenario}-${category.id}-map-top-320x568`);
  }
  if (!report.mapEdgeFailures.some((item) => item.scenario === scenario && item.category === category.id)) check(`${scenario} ${category.name}: top/bottom map entries remain visible and clickable at 320x568`);
}

async function verifyArchive(page, scenario, expectedWallet) {
  const before = (await storage(page)).board;
  await page.locator('.garden-wallet').click();
  const dialog = page.getByRole('dialog', { name: '我的守护档案', exact: true });
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await dialog.locator('.garden-archive-count strong').innerText(), String(expectedWallet));
  assert.equal(await dialog.locator('.garden-medals > div').count(), categories.length);
  const progress = before.players.find((player) => player.id === before.activePlayerId).completed;
  const expectedEarned = categories.filter((category) => map.regions.filter((region) => category.regionIds.includes(region.id)).flatMap((region) => region.nodes).every((node) => Number(progress[node.id]) > 0)).length;
  assert.equal(await dialog.locator('.garden-medals .earned').count(), expectedEarned);
  assert.equal(await dialog.getByRole('button', { name: '返回游戏首页', exact: true }).count(), 0);
  assert.equal(await dialog.getByRole('button', { name: /^(打开|关闭)按钮和奖励音效$/ }).count(), 0);
  assert.equal(await dialog.getByRole('button', { name: /^(打开|关闭)首页和地图音乐$/ }).count(), 0);
  assert.equal(await dialog.getByRole('button', { name: '重置当前玩家记录', exact: true }).count(), 0);
  assert.equal(await dialog.getByRole('button', { name: '打开排行榜', exact: true }).count(), 1);
  await screenshot(page, `${scenario}-archive-390x844`);
  await dialog.getByRole('button', { name: '打开排行榜', exact: true }).click();
  await page.getByRole('button', { name: '返回关卡首页', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '返回关卡首页', exact: true }).click();
  await page.locator(selectors.toggle).waitFor({ state: 'visible' });
  assert.deepEqual((await storage(page)).board, before, `${scenario}: archive access mutated rewards`);
  await page.locator(selectors.settings).click();
  const settings = page.getByRole('dialog', { name: '游戏设置', exact: true });
  await settings.waitFor({ state: 'visible' });
  assert.equal(await settings.locator('.garden-archive-count,.garden-medals').count(), 0);
  assert.equal(await settings.getByRole('button', { name: /^(打开|关闭)按钮和奖励音效$/ }).count(), 1);
  assert.equal(await settings.getByRole('button', { name: /^(打开|关闭)首页和地图音乐$/ }).count(), 1);
  assert.equal(await settings.getByRole('button', { name: '重置当前玩家记录', exact: true }).count(), 1);
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await settings.waitFor({ state: 'hidden' });
  await page.locator(selectors.toggle).waitFor({ state: 'visible' });
  assert.deepEqual((await storage(page)).board, before, `${scenario}: settings access mutated rewards`);
  check(`${scenario}: flower archive shows current medals and leaderboard; settings contains audio and reset controls`);
}

async function verifyLevelAndResume(page, scenario, expectedWallet) {
  await select(page, categories[0]);
  const node = map.regions[0].nodes[0];
  const before = (await storage(page)).board;
  await page.locator(`[data-map-node="${node.id}"]`).evaluate((element) => {
    const scroll = element.closest('.garden-scroll');
    const box = element.getBoundingClientRect();
    const view = scroll.getBoundingClientRect();
    scroll.scrollTo({ top: scroll.scrollTop + box.y + box.height / 2 - view.y - view.height / 2, behavior: 'instant' });
  });
  await settle(page);
  await page.locator(`[data-map-node="${node.id}"] .garden-node-label`).click();
  assert.equal((await page.locator('.garden-dialog h2:not(.garden-sr-only)').innerText()).trim(), copy.levels[node.id].title);
  await page.getByRole('button', { name: /^(进入场景|再守护一次)$/ }).click();
  await page.locator('.hunt-entry > button').waitFor({ state: 'visible' });
  await page.locator('.hunt-entry > button').click();
  await page.locator('.hunt-hud button[aria-label="返回关卡"]').click();
  if (await page.locator('.hunt-dialog').count()) await page.locator('.hunt-dialog').getByRole('button', { name: '返回关卡', exact: true }).click();
  await page.locator(selectors.toggle).waitFor({ state: 'visible' });
  assert.deepEqual((await storage(page)).board, before, `${scenario}: returning from unfinished scene changed rewards`);
  const afterPlay = await storage(page);
  assert.equal(afterPlay.location[before.activePlayerId].levelId, node.id);
  await page.locator(selectors.home).click();
  await page.locator('[data-home-continue]').waitFor({ state: 'visible' });
  await page.locator('[data-home-continue]').click();
  await current(page, categories[0]);
  assert.equal(await page.locator('[data-wallet]').innerText(), String(expectedWallet));
  await page.reload({ waitUntil: 'load' });
  await page.locator('[data-home-continue]').click();
  await current(page, categories[0]);
  const resumed = await storage(page);
  assert.deepEqual(resumed.board, before, `${scenario}: reload/continue changed stored progress`);
  assert.equal(resumed.location[before.activePlayerId].levelId, node.id);
  check(`${scenario}: level opens, unfinished return and home/reload continue preserve progress`);
}

let browser;
let activePage;
try {
  report.sha256 = hash(fs.readFileSync(html));
  const assetDirectory = path.join(root, 'public/levels/journey-map/map-wheel-v1');
  const sourceAssets = categories.map((category) => {
    const file = `category-${category.id}.webp`;
    return { file: `/levels/journey-map/map-wheel-v1/${file}`, sha256: hash(fs.readFileSync(path.join(assetDirectory, file))) };
  });
  const cornerManifest = JSON.parse(fs.readFileSync(path.join(root, 'art-source/map-corner-garden-v2/manifest.json'), 'utf8'));
  assert.deepEqual(cornerManifest.assets.map((asset) => path.basename(asset.path)), ['home.png', 'flower-counter.png', 'settings.png']);
  for (const asset of cornerManifest.assets) {
    const sha256 = hash(fs.readFileSync(path.join(root, 'public', asset.path)));
    assert.equal(sha256, asset.sha256, `${asset.path}: source does not match approved manifest`);
    sourceAssets.push({ file: asset.path, sha256 });
  }
  assert.equal(sourceAssets.length, 6, 'Expected three category icons and three current transparent corner icons');
  const { chromium } = findPlaywright();
  browser = await chromium.launch({ headless: true, executablePath: findBrowser(chromium), args: ['--mute-audio'] });
  report.browser = browser.version();
  for (const scenario of ['fresh', 'completed63']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, deviceScaleFactor: 1 });
    try {
      if (scenario === 'completed63') await context.addInitScript(({ ids, boardKey, locationKey }) => {
        if (localStorage.getItem(boardKey)) return;
        const id = 'map-fan-display-fixture';
        localStorage.setItem(boardKey, JSON.stringify({ version: 1, activePlayerId: id, players: [{ id, name: '扇区展示测试', region: '', createdAt: 1, completed: Object.fromEntries(ids.slice(0, 21).map((level) => [level, 3])) }] }));
        localStorage.setItem(locationKey, JSON.stringify({ [id]: { levelId: ids[0], visitedAt: 1 } }));
      }, { ids: nodes.map((node) => node.id), boardKey, locationKey });
      const page = await context.newPage();
      activePage = page;
      page.setDefaultTimeout(15_000);
      page.on('pageerror', (error) => report.errors.push({ scenario, message: error.message }));
      page.on('request', (request) => { if (/^https?:/.test(request.url())) report.network.push({ scenario, url: request.url() }); });
      page.on('requestfailed', (request) => report.failedRequests.push({ scenario, url: request.url().slice(0, 200), failure: request.failure()?.errorText }));
      await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60_000 });
      await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts.ready);
      await page.locator(scenario === 'fresh' ? '[data-home-start]' : '[data-home-continue]').click();
      await page.locator(selectors.toggle).waitFor({ state: 'visible' });
      const expectedWallet = scenario === 'fresh' ? 0 : 63;
      assert.equal(await page.locator('[data-wallet]').innerText(), String(expectedWallet));
      assert.equal(await page.locator('.garden-header,.garden-tabs,.map-wheel-chrome,.map-wheel-dot,.map-wheel-dots,[data-wheel-prev],[data-wheel-next],.garden-map-extension').count(), 0, 'Old topbar/dots/arrows/extension DOM remains');
      assert.equal(await page.locator(selectors.toggle).getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator(selectors.tools).locator('button').count(), 3);
      assert.equal(await page.locator('[data-wheel-achievements]').count(), 0);
      const beforeSwitching = (await storage(page)).board;
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        for (const category of categories) {
          await select(page, category);
          await geometry(page, scenario, category, width, height, false);
          if (width === 390 || (scenario === 'completed63' && category.id === 'nature')) await screenshot(page, `${scenario}-${category.id}-collapsed-${width}x${height}`);
          await setExpanded(page, true);
          assert.equal(await page.locator('[data-fan-category][aria-pressed="true"]').getAttribute('data-fan-category'), category.id);
          await geometry(page, scenario, category, width, height, true);
          if (scenario === 'fresh' && width === 390) await collectAssets(page, sourceAssets);
          if (width === 390 || (scenario === 'completed63' && category.id === 'nature')) await screenshot(page, `${scenario}-${category.id}-expanded-${width}x${height}`);
          await setExpanded(page, false);
          if (width === 320) await verifyMapEdges(page, scenario, category);
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await select(page, categories[0]);
      await verifyDisclosure(page, scenario);
      assert.deepEqual((await storage(page)).board, beforeSwitching, `${scenario}: category/fan navigation changed player/reward data`);
      assert.equal(await page.locator('[data-wallet]').innerText(), String(expectedWallet));
      check(`${scenario}: fan disclosure and all category choices preserve progress`);
      await verifyArchive(page, scenario, expectedWallet);
      await verifyLevelAndResume(page, scenario, expectedWallet);
    } catch (error) {
      if (activePage && !activePage.isClosed()) await screenshot(activePage, `failure-${scenario}`).catch(() => {});
      throw error;
    } finally {
      await context.close();
      report.contextClosed.push(scenario);
      activePage = null;
    }
  }
  assert.equal(report.assets.length, 6, 'Not all six current assets were rendered and checked');
  assert.equal(report.mapEdgeFailures.length, 0, `${report.mapEdgeFailures.length} map edge surface failures; see report.json mapEdgeFailures for exact coordinates`);
  assert.equal(report.errors.length, 0, `Browser errors: ${JSON.stringify(report.errors)}`);
  assert.equal(report.network.length, 0, `Offline artifact attempted HTTP(S): ${JSON.stringify(report.network)}`);
  assert.equal(report.failedRequests.length, 0, `Failed requests: ${JSON.stringify(report.failedRequests)}`);
  check('All six icons decode, match source SHA-256, and are embedded in the final offline HTML');
  check('Final offline HTML runs without browser errors, failed requests or HTTP(S) dependencies');
  report.finalTestedSha256 = hash(fs.readFileSync(html));
  report.initialAndFinalSha256Match = report.finalTestedSha256 === report.sha256;
  assert(report.initialAndFinalSha256Match, 'The exported HTML changed while browser QA was running');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || error.message;
  console.error(report.failure);
  if (activePage && !activePage.isClosed()) await screenshot(activePage, 'failure').catch(() => {});
  process.exitCode = 1;
} finally {
  if (browser) { await browser.close(); report.browserClosed = true; }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), [
    '# 地图左下扇区：最终离线 HTML 验证', '',
    `- 结果：${report.status}`, `- HTML：${html}`, `- SHA-256：${report.sha256}`,
    `- 浏览器：${report.browser}；headless、隔离存储、--mute-audio；finally 已关闭：${report.browserClosed}`,
    `- 视口：${sizes.map((size) => size.join('×')).join('、')}，页面缩放 100%。`,
    `- 布局样本：${report.layouts.length}；当前素材解码及离线内嵌哈希核对：${report.assets.length} / 6。`,
    `- 顶部/中间/底部滚动固定性样本：${report.pinnedScroll.length}；验证左右角落锚定不随地图移动。`,
    `- 320×568 地图上下边缘样本：${report.mapEdges.length}；被遮挡或越界入口：${report.mapEdgeFailures.length}。`,
    '- fresh 为全新存储；completed63 将前 21 关预置为各 3 朵红花，仅用于 63 花的已完成布局和导航验证，不代表实际通关。',
    '- 检查：旧顶部HUD与成就按钮移除、右上首页/红花/设置纵向排列、左下扇区展开/收起、3分类完整名称和当前图、触屏与键盘操作、Escape与外侧关闭、档案花数及奖章与设置功能分离、关卡进入/未完成返回、首页及刷新继续、奖励记录不被导航改写。',
    `- 浏览器错误 ${report.errors.length}；HTTP(S) 请求 ${report.network.length}；失败请求 ${report.failedRequests.length}。`,
    '- physicalDevice: not_run', '- humanAudio: not_run',
    ...(report.failure ? ['', '## 失败', '', '```text', report.failure, '```'] : []),
    '', '## 代表截图', '', ...report.screenshots.map((file) => `- [${file}](${file})`), '',
  ].join('\n'));
}
