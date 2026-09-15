// Focused final-artifact QA. Run after export:offline; does not modify the game.
// Optional: OFFLINE_FILE, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, MAP_WHEEL_TEST_OUTPUT.
// Arrow-only compact HUD. The 63-flower save is an explicit display fixture, not actual gameplay.
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
const output = path.resolve(root, process.env.MAP_WHEEL_TEST_OUTPUT || 'outputs/map-wheel-verification');
const map = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8'));
const categories = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-categories.json'), 'utf8')).categories;
const copy = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-copy.json'), 'utf8'));
const nodes = map.regions.flatMap((region) => region.nodes);
const sizes = [[320, 568], [390, 844], [430, 932], [520, 960], [1440, 900]];
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
  await page.locator(`[data-wheel-current="${category.id}"]`).waitFor({ state: 'visible' });
  assert.equal((await page.locator('.map-wheel-category-name').innerText()).trim(), category.name);
  assert.equal(await page.locator('[data-wheel-current]').count(), 1);
  const region = map.regions.find((item) => category.regionIds.includes(item.id));
  assert.equal(await page.locator('.garden-region').getAttribute('data-region'), region.id);
  await page.locator('[data-map-wheel] img').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await settle(page);
}

async function select(page, category) {
  for (let step = 0; step < categories.length; step += 1) {
    const active = await page.locator('[data-wheel-current]').getAttribute('data-wheel-current');
    if (active === category.id) break;
    await page.locator('[data-wheel-next]').click();
  }
  await current(page, category);
}

async function screenshot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(output, file) });
  report.screenshots.push(file);
}

async function geometry(page, scenario, category, width, height) {
  const layout = await page.locator('[data-map-wheel]').evaluate((header) => {
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const title = header.querySelector('.map-wheel-category-name');
    const safeAreaProbe = document.createElement('div');
    safeAreaProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);';
    document.body.appendChild(safeAreaProbe);
    const safeAreaTop = Number.parseFloat(getComputedStyle(safeAreaProbe).paddingTop) || 0;
    safeAreaProbe.remove();
    const range = document.createRange();
    range.selectNodeContents(title);
    const controls = [...header.querySelectorAll('button')].map((button) => {
      const bounds = rect(button);
      const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return { name: button.getAttribute('aria-label') || button.textContent.trim(), ...bounds, centerHits: hit?.closest('button') === button };
    });
    return {
      header: rect(header), stage: rect(header.querySelector('.map-wheel-stage')), wheel: rect(header.querySelector('[data-wheel-current]')), wing: rect(header.querySelector('.map-wheel-wing')), shell: rect(header.closest('.garden-shell')), safeAreaTop, title: rect(title),
      textRects: [...range.getClientRects()].filter((r) => r.width > 0).map((r) => ({ x: r.x, y: r.y, right: r.right, bottom: r.bottom })),
      titleFits: title.scrollWidth <= title.clientWidth + 1 && (getComputedStyle(title).overflowY === 'visible' || title.scrollHeight <= title.clientHeight + 1),
      textOverflow: getComputedStyle(title).textOverflow,
      controls, images: [...header.querySelectorAll('img')].map((image) => ({ alt: image.alt, ...rect(image) })),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      viewportScale: window.visualViewport?.scale ?? 1,
      mapScroll: rect(document.querySelector('.garden-scroll')),
    };
  });
  report.layouts.push({ scenario, category: category.id, viewport: { width, height }, ...layout });
  const label = `${scenario} ${category.name} ${width}x${height}`;
  assert.equal(layout.viewportScale, 1, `${label}: page zoom changed`);
  assert(Math.abs(layout.header.y - layout.shell.y) <= 0.5 && Math.abs(layout.stage.y - layout.shell.y - layout.safeAreaTop) <= 0.5, `${label}: HUD has a gap above it: ${JSON.stringify({ header: layout.header, stage: layout.stage, shell: layout.shell, safeAreaTop: layout.safeAreaTop })}`);
  assert(layout.wheel.width <= 108.5 && layout.wheel.height <= 108.5, `${label}: central wheel exceeds compact 108px size`);
  assert(layout.header.height <= 116.5 + layout.safeAreaTop, `${label}: HUD exceeds compact 116px height`);
  assert(layout.mapScroll.y >= layout.wing.bottom - 0.5, `${label}: visible map starts above toolbar backing: ${JSON.stringify({ scroll: layout.mapScroll, wing: layout.wing })}`);
  assert(!layout.horizontalOverflow, `${label}: horizontal page overflow`);
  assert(layout.titleFits && layout.textOverflow !== 'ellipsis', `${label}: category name is clipped`);
  for (const box of [layout.header, ...layout.controls, ...layout.images]) {
    assert(box.width > 0 && box.height > 0, `${label}: zero-size header element`);
    assert(box.x >= -1 && box.y >= -1 && box.right <= width + 1 && box.bottom <= height + 1, `${label}: header element leaves viewport: ${JSON.stringify(box)}`);
  }
  for (const textRect of layout.textRects) {
    // CJK font metric boxes may extend a few pixels beyond a short CSS line box.
    // They must remain fully inside the visible wheel, with no horizontal truncation.
    assert(textRect.x >= layout.title.x - 1 && textRect.right <= layout.title.right + 1 && textRect.y >= layout.wheel.y - 1 && textRect.bottom <= layout.wheel.bottom + 1, `${label}: category glyphs leave visible wheel bounds`);
  }
  assert(layout.controls.every((control) => control.centerHits), `${label}: header control is occluded`);
  assert(layout.mapScroll.height >= height / 2, `${label}: map viewport became unusably short`);
  await verifyPinnedScroll(page, scenario, category, width, height);
  check(`${label}: compact HUD fits, stays pinned at top and contains the map below its toolbar`);
}

async function verifyPinnedScroll(page, scenario, category, width, height) {
  const originalScrollTop = await page.locator('.garden-scroll').evaluate((element) => element.scrollTop);
  let baseline;
  for (const position of ['top', 'middle', 'bottom']) {
    await page.locator('.garden-scroll').evaluate((element, position) => {
      const maximum = element.scrollHeight - element.clientHeight;
      element.scrollTo({ top: position === 'top' ? 0 : position === 'bottom' ? maximum : maximum / 2, behavior: 'instant' });
    }, position);
    await settle(page);
    const snapshot = await page.evaluate(() => {
      const rect = (element) => {
        const r = element.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
      };
      const shell = rect(document.querySelector('.garden-shell'));
      const scroller = document.querySelector('.garden-scroll');
      const scroll = rect(scroller);
      const probes = [0.02, 0.15, 0.35, 0.5, 0.65, 0.85, 0.98].flatMap((x) => [0.1, 0.5, 0.9].map((y) => {
        const px = shell.x + shell.width * x;
        const py = shell.y + (scroll.y - shell.y) * y;
        return { x: px, y: py, mapHit: document.elementsFromPoint(px, py).some((element) => element.closest('.garden-scroll')) };
      }));
      return { scrollTop: scroller.scrollTop, scroll, probes, controls: [...document.querySelectorAll('[data-map-wheel],.map-wheel-selector,.map-wheel-wing,.map-wheel-side')].map(rect) };
    });
    report.pinnedScroll.push({ scenario, category: category.id, viewport: { width, height }, position, ...snapshot });
    const label = `${scenario} ${category.name} ${width}x${height} ${position}`;
    assert(snapshot.probes.every((probe) => !probe.mapHit), `${label}: map content is visible/hittable above its scroller: ${JSON.stringify(snapshot.probes.filter((probe) => probe.mapHit))}`);
    if (baseline) {
      assert.equal(snapshot.controls.length, baseline.length);
      for (let index = 0; index < baseline.length; index += 1) {
        for (const value of ['x', 'y', 'width', 'height']) assert(Math.abs(snapshot.controls[index][value] - baseline[index][value]) <= 0.25, `${label}: toolbar moved while scrolling: ${JSON.stringify(snapshot.controls[index])}`);
      }
    } else baseline = snapshot.controls;
  }
  await page.locator('.garden-scroll').evaluate((element, top) => element.scrollTo({ top, behavior: 'instant' }), originalScrollTop);
  await settle(page);
}

async function collectAssets(page, sourceAssets) {
  const images = await page.locator('[data-map-wheel] img').evaluateAll(async (elements) => {
    await Promise.all(elements.map((image) => image.decode()));
    return elements.map((image) => ({ src: image.src, width: image.naturalWidth, height: image.naturalHeight }));
  });
  for (const image of images) {
    assert(/^data:image\/(?:png|webp);base64,/.test(image.src), 'Wheel asset is not embedded in final HTML');
    const sha256 = hash(Buffer.from(image.src.slice(image.src.indexOf(',') + 1), 'base64'));
    const source = sourceAssets.find((item) => item.sha256 === sha256);
    assert(source, 'Wheel image does not match any current wheel source asset');
    assert(image.width > 0 && image.height > 0, `${source.file}: image did not decode`);
    if (!report.assets.some((item) => item.sha256 === sha256)) report.assets.push({ ...source, width: image.width, height: image.height, embeddedMatchesSource: true });
  }
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
        assert(surface.hits.every(Boolean), `${scenario} ${category.name} ${edge} ${node.id}: wheel or another element obscures map entry: ${JSON.stringify(surface)}`);
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
  for (const selector of ['.garden-wallet', '[data-wheel-achievements]']) {
    await page.locator(selector).click();
    const dialog = page.locator('.garden-dialog');
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.locator('.garden-archive-count strong').innerText(), String(expectedWallet));
    assert.equal(await dialog.locator('.garden-medals > div').count(), categories.length);
    const progress = before.players.find((player) => player.id === before.activePlayerId).completed;
    const expectedEarned = categories.filter((category) => map.regions.filter((region) => category.regionIds.includes(region.id)).flatMap((region) => region.nodes).every((node) => Number(progress[node.id]) > 0)).length;
    assert.equal(await dialog.locator('.garden-medals .earned').count(), expectedEarned);
    assert.equal(await dialog.getByRole('button', { name: '返回游戏首页', exact: true }).count(), 1);
    assert.equal(await dialog.getByRole('button', { name: /^(打开|关闭)按钮和奖励音效$/ }).count(), 1);
    assert.equal(await dialog.getByRole('button', { name: '打开排行榜', exact: true }).count(), 1);
    if (selector === '[data-wheel-achievements]') {
      const sound = dialog.getByRole('button', { name: /^(打开|关闭)按钮和奖励音效$/ });
      const original = await sound.getAttribute('aria-label');
      await sound.click();
      assert.notEqual(await sound.getAttribute('aria-label'), original, `${scenario}: archive sound toggle did not update`);
      await sound.click();
      assert.equal(await sound.getAttribute('aria-label'), original, `${scenario}: archive sound toggle did not restore`);
    }
    if (selector === '[data-wheel-achievements]') await screenshot(page, `${scenario}-achievements-390x844`);
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  }
  await page.locator('[data-wheel-achievements]').click();
  await page.getByRole('button', { name: '打开排行榜', exact: true }).click();
  await page.getByRole('button', { name: '返回关卡首页', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '返回关卡首页', exact: true }).click();
  await page.locator('[data-map-wheel]').waitFor({ state: 'visible' });
  assert.deepEqual((await storage(page)).board, before, `${scenario}: archive access mutated rewards`);
  check(`${scenario}: flower/achievement entries show current medals; archive sound and leaderboard controls work`);
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
  await page.locator('[data-map-wheel]').waitFor({ state: 'visible' });
  assert.deepEqual((await storage(page)).board, before, `${scenario}: returning from unfinished scene changed rewards`);
  const afterPlay = await storage(page);
  assert.equal(afterPlay.location[before.activePlayerId].levelId, node.id);
  await page.locator('[data-wheel-achievements]').click();
  await page.getByRole('button', { name: '返回游戏首页', exact: true }).click();
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
  const sourceAssets = fs.readdirSync(assetDirectory).filter((file) => /\.(png|webp)$/i.test(file)).map((file) => ({ file: `/levels/journey-map/map-wheel-v1/${file}`, sha256: hash(fs.readFileSync(path.join(assetDirectory, file))) }));
  assert.equal(sourceAssets.length, 7, 'Expected seven independently exported wheel assets');
  const { chromium } = findPlaywright();
  browser = await chromium.launch({ headless: true, executablePath: findBrowser(chromium), args: ['--mute-audio'] });
  report.browser = browser.version();
  for (const scenario of ['fresh', 'completed63']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, deviceScaleFactor: 1 });
    try {
      if (scenario === 'completed63') await context.addInitScript(({ ids, boardKey, locationKey }) => {
        if (localStorage.getItem(boardKey)) return;
        const id = 'map-wheel-display-fixture';
        localStorage.setItem(boardKey, JSON.stringify({ version: 1, activePlayerId: id, players: [{ id, name: '轮盘展示测试', region: '', createdAt: 1, completed: Object.fromEntries(ids.slice(0, 21).map((level) => [level, 3])) }] }));
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
      await page.locator('[data-map-wheel]').waitFor({ state: 'visible' });
      const expectedWallet = scenario === 'fresh' ? 0 : 63;
      assert.equal(await page.locator('[data-wallet]').innerText(), String(expectedWallet));
      assert.equal(await page.locator('.garden-header,.garden-tabs').count(), 0);
      assert.equal(await page.locator('.map-wheel-dot,.map-wheel-dots,[data-category],.garden-map-extension').count(), 0, 'Dot navigation or old map extension DOM remains');
      const removedDotCss = await page.evaluate(() => [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]).some((rule) => /\.map-wheel-dot(?:s|\b)/.test(rule.cssText)));
      assert(!removedDotCss, 'Removed dot navigation CSS remains in final HTML');
      assert.equal(await page.locator('[data-wheel-prev]').count(), 1);
      assert.equal(await page.locator('[data-wheel-next]').count(), 1);
      assert.equal(await page.locator('[data-map-wheel] button').count(), 4);
      const beforeSwitching = (await storage(page)).board;
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        for (const category of categories) {
          await select(page, category);
          await geometry(page, scenario, category, width, height);
          if (scenario === 'fresh' && width === 390) await collectAssets(page, sourceAssets);
          if (width === 390 || (scenario === 'completed63' && category.id === 'nature')) await screenshot(page, `${scenario}-${category.id}-${width}x${height}`);
          if (width === 320) await verifyMapEdges(page, scenario, category);
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await select(page, categories[0]);
      for (const index of [1, 2, 0]) {
        await page.locator('[data-wheel-next]').click();
        await current(page, categories[index]);
      }
      for (const index of [2, 1, 0]) {
        await page.locator('[data-wheel-prev]').click();
        await current(page, categories[index]);
      }
      assert.deepEqual((await storage(page)).board, beforeSwitching, `${scenario}: category switching changed player/reward data`);
      assert.equal(await page.locator('[data-wallet]').innerText(), String(expectedWallet));
      check(`${scenario}: arrow-only navigation wraps in both directions without reward changes; all dots are removed`);
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
  assert.equal(report.assets.length, 7, 'Not all seven current assets were rendered and checked');
  assert.equal(report.mapEdgeFailures.length, 0, `${report.mapEdgeFailures.length} map edge surface failures; see report.json mapEdgeFailures for exact coordinates`);
  assert.equal(report.errors.length, 0, `Browser errors: ${JSON.stringify(report.errors)}`);
  assert.equal(report.network.length, 0, `Offline artifact attempted HTTP(S): ${JSON.stringify(report.network)}`);
  assert.equal(report.failedRequests.length, 0, `Failed requests: ${JSON.stringify(report.failedRequests)}`);
  check('All seven assets decode, match source SHA-256, and are embedded in the final offline HTML');
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
    '# 地图分类轮盘：最终离线 HTML 验证', '',
    `- 结果：${report.status}`, `- HTML：${html}`, `- SHA-256：${report.sha256}`,
    `- 浏览器：${report.browser}；headless、隔离存储、--mute-audio；finally 已关闭：${report.browserClosed}`,
    `- 视口：${sizes.map((size) => size.join('×')).join('、')}，页面缩放 100%。`,
    `- 布局样本：${report.layouts.length}；当前素材解码及离线内嵌哈希核对：${report.assets.length} / 7。`,
    `- 顶部/中间/底部滚动固定性样本：${report.pinnedScroll.length}；验证地图不能越过滚动区域顶部。`,
    `- 320×568 地图上下边缘样本：${report.mapEdges.length}；被遮挡或越界入口：${report.mapEdgeFailures.length}。`,
    '- fresh 为全新存储；completed63 将前 21 关预置为各 3 朵红花，仅用于 63 花的已完成布局和导航验证，不代表实际通关。',
    '- 检查：旧上下栏与三个圆点消失、三分类完整名称、仅箭头循环切换、轮盘贴顶且不大于108px、HUD不大于116px、滚动时HUD不移动、档案花数及奖章、关卡进入/未完成返回、首页及刷新继续、奖励记录不被导航改写。',
    `- 浏览器错误 ${report.errors.length}；HTTP(S) 请求 ${report.network.length}；失败请求 ${report.failedRequests.length}。`,
    '- physicalDevice: not_run', '- humanAudio: not_run',
    ...(report.failure ? ['', '## 失败', '', '```text', report.failure, '```'] : []),
    '', '## 代表截图', '', ...report.screenshots.map((file) => `- [${file}](${file})`), '',
  ].join('\n'));
}
