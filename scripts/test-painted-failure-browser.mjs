/** Final exported HTML QA. Isolated offline headless Chromium, --mute-audio.
 * First failures use actual RAF time advanced by Playwright and actual pointer
 * input. A second timeout after retry uses a explicitly recorded controlled
 * clock boundary to test the failure Back action without another long wait.
 * Does not build/export the game, add production hooks, or touch real saves.
 * Optional: OFFLINE_FILE, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE,
 * PAINTED_FAILURE_TEST_OUTPUT.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dependency, root } from './lib/dependencies.mjs';

const require = createRequire(import.meta.url);
const html = path.resolve(root, process.env.OFFLINE_FILE || 'outputs/本地离线版/小红花应急行动.html');
const quickSmoke = process.env.PAINTED_FAILURE_QUICK_SMOKE === '1';
const smokeLevelIds = (process.env.PAINTED_FAILURE_SMOKE_LEVELS || 'quake-bedroom-v2,typhoon-home,fire-shelter-practice').split(',').filter(Boolean);
const output = path.resolve(root, process.env.PAINTED_FAILURE_TEST_OUTPUT || (quickSmoke ? 'docs/painted-failure/latest-artifact-smoke' : 'docs/painted-failure/verification'));
const map = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8'));
const nodes = map.regions.flatMap(region => region.nodes);
const sizes = [[390, 844], [320, 568], [430, 932], [1440, 900]];
const smokeSizes = sizes.slice(0, process.env.PAINTED_FAILURE_SINGLE_VIEWPORT === '1' ? 1 : 2);
const boardKey = 'little-red-flower-leaderboard-v1';
const host = '.hunt-player,.disaster-player,.configured-player,.kitchen-player';
const popup = '.painted-failure';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {
  status: 'running', startedAt: new Date().toISOString(), html, htmlSha256: null,
  browser: null, cases: [], layouts: [], checks: [], screenshots: [], errors: [], network: [], failedRequests: [],
  mode: quickSmoke ? 'latest-artifact-three-entry-smoke' : 'full-fourteen-entry-verification',
  contextsCreated: 0, contextsClosed: 0, browserClosed: false, physicalDevice: 'not_run', humanAudio: 'not_run',
  fixture: 'Each isolated test profile presets the other 23 levels complete only to unlock entry; the tested level is uncompleted. No real user profile is opened. Initial timeouts use actual mounted engines driven by Playwright RAF/timer advancement; scene progress and practice mistakes use real pointer input. After verifying Retry, a controlled reducer tick/state clock boundary may trigger a second timeout solely to exercise Back. No success or reward callback is injected.',
};
fs.mkdirSync(output, { recursive: true });
const passed = (name, detail = {}) => { report.checks.push({ name, status: 'passed', ...detail }); console.log(`PASS ${name}`); };
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
let browser, runtime, temp;

function findPlaywright() {
  const specified = process.env.PLAYWRIGHT_MODULE;
  for (const item of specified ? [specified] : ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'), 'playwright-core']) {
    try { return require(item.startsWith('file:') ? fileURLToPath(item) : item); } catch (error) { if (specified) throw error; }
  }
  throw new Error('Playwright unavailable; set PLAYWRIGHT_MODULE.');
}
function findBrowser(chromium) {
  const file = (process.env.BROWSER_EXECUTABLE ? [process.env.BROWSER_EXECUTABLE] : [chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/chromium']).find(file => fs.existsSync(file));
  assert(file, 'Chromium unavailable; set BROWSER_EXECUTABLE.');
  return file;
}
const board = page => page.evaluate(key => localStorage.getItem(key), boardKey);
const scene = page => page.locator(host);
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function shot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(output, file) });
  report.screenshots.push(file);
}
async function withPage(id, task) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, deviceScaleFactor: 1, offline: true });
  report.contextsCreated++;
  let page;
  try {
    await context.addInitScript(({ ids, id, boardKey }) => {
      const player = `failure-QA-${id}`;
      localStorage.setItem(boardKey, JSON.stringify({ version: 1, activePlayerId: player, players: [{ id: player, name: '失败弹窗验收', region: '', createdAt: 1, completed: Object.fromEntries(ids.filter(item => item !== id).map(item => [item, 3])) }] }));
      const registry = new Map();
      Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool(tool, options) {
        registry.set(tool.name, tool);
        options?.signal?.addEventListener('abort', () => { if (registry.get(tool.name) === tool) registry.delete(tool.name); });
      } } });
      window.__failureQaTools = registry;
    }, { ids: nodes.map(node => node.id), id, boardKey });
    page = await context.newPage();
    page.setDefaultTimeout(20_000);
    page.on('pageerror', error => report.errors.push({ id, message: error.message }));
    page.on('request', request => { if (/^https?:/.test(request.url())) report.network.push({ id, url: request.url() }); });
    page.on('requestfailed', request => report.failedRequests.push({ id, url: request.url().slice(0, 160), failure: request.failure()?.errorText }));
    await page.clock.install();
    await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60_000 });
    await page.locator('[data-home-start]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.__failureQaTools?.has('start_emergency_level'));
    await page.evaluate(() => document.fonts.ready);
    await task(page);
  } catch (error) {
    if (page && !page.isClosed()) await shot(page, `${id}-failure`).catch(() => {});
    throw error;
  } finally {
    await context.close();
    report.contextsClosed++;
  }
}
async function open(page, id) {
  await page.evaluate(id => window.__failureQaTools.get('start_emergency_level').execute({ levelId: id }), id);
  await page.waitForFunction(({ host, id }) => document.querySelector(`[data-painted-intro][data-level-id="${id}"]`) || document.querySelector(host)?.dataset.ready === 'true', { host, id });
  const intro = page.locator(`[data-painted-intro][data-level-id="${id}"]`);
  if (await intro.count()) {
    await intro.locator('.painted-intro-start:not(:disabled)').click();
    await intro.waitFor({ state: 'detached' });
  }
  await scene(page).waitFor({ state: 'visible' });
  await page.waitForFunction(host => document.querySelector(host)?.dataset.ready === 'true', host);
  await page.clock.runFor(400);
  assert.equal(await scene(page).getAttribute('data-level'), id, 'Expected level must be mounted');
  assert.equal(await scene(page).getAttribute('data-phase'), 'playing', 'Intro or auto-start must begin the actual scene');
  assert.equal(await page.locator('[data-painted-intro]').count(), 0, 'No extra introduction may cover the active scene');
}
async function visiblePoint(page, points, label) {
  const chosen = await page.evaluate(points => {
    const usable = points.filter(point => document.elementFromPoint(point.x, point.y)?.tagName === 'CANVAS');
    return usable[Math.floor(usable.length / 2)];
  }, points);
  assert(chosen, `${label}: no visible canvas input point`);
  return chosen;
}
async function huntTarget(page, pack, target) {
  const skin = pack.skin;
  const { data } = await dependency('sharp')(path.join(root, 'public', skin.mask.slice(1))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const box = await page.locator('.hunt-world canvas').boundingBox();
  const cam = runtime.huntViewport.sceneCamera(skin, box.width, box.height), points = [];
  for (let y = 0; y < skin.height; y += 3) for (let x = 0; x < skin.width; x += 3) {
    const index = (y * skin.width + x) * 4;
    if (data[index + 3] > 128 && skin.targets[target.id].color.every((value, i) => data[index + i] === value)) {
      const point = { x: box.x + cam.x + (x + .5) * cam.scaleX, y: box.y + cam.y + (y + .5) * cam.scaleY };
      if (point.x > box.x + 5 && point.x < box.x + box.width - 5 && point.y > box.y + 80 && point.y < box.y + box.height - 25) points.push(point);
    }
  }
  const point = await visiblePoint(page, points, target.id);
  await page.touchscreen.tap(point.x, point.y);
  await page.clock.runFor(pack.rules.markMs + 120);
  assert((await scene(page).getAttribute('data-found')).split(',').includes(target.id), `${target.id}: actual hit did not commit`);
  return target.id;
}
const rasterCache = new Map();
async function configuredSource(page, pack, id) {
  const current = await scene(page).evaluate(element => ({ resolved: element.dataset.resolved.split(',').filter(Boolean), stages: (element.dataset.stages || '').split('|').filter(Boolean), elapsed: Number(element.dataset.elapsed), phase: element.dataset.phase }));
  const run = { ...runtime.engine.createRun(pack), ...current };
  for (const [name, asset] of Object.entries(pack.skin.assets)) {
    const src = typeof asset === 'string' ? asset : asset.src;
    if (!rasterCache.has(src)) rasterCache.set(src, await dependency('sharp')(path.join(root, 'public', src.slice(1))).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  }
  const alpha = (name, local) => {
    const asset = pack.skin.assets[name], raster = rasterCache.get(typeof asset === 'string' ? asset : asset.src);
    const x = Math.floor(local.x * raster.info.width), y = Math.floor(local.y * raster.info.height);
    return x >= 0 && y >= 0 && x < raster.info.width && y < raster.info.height && raster.data[(y * raster.info.width + x) * 4 + 3] > 60;
  };
  const pose = runtime.configuredScene.scenePoses(pack, run, true).find(pose => pose.id === id);
  assert(pose, `${id}: pose absent`);
  const canvas = page.locator('.configured-world canvas'), box = await canvas.boundingBox();
  const dataCam = await canvas.evaluate(canvas => ({ x: Number(canvas.dataset.cameraX), y: Number(canvas.dataset.cameraY), scale: Number(canvas.dataset.cameraScale) }));
  const cam = dataCam.scale ? dataCam : runtime.configuredScene.cameraFor(pack, box.width, box.height);
  const points = [];
  for (let y = .1; y < .92; y += .045) for (let x = .1; x < .92; x += .045) {
    const point = { x: pose.x + pose.w * x, y: pose.y + pose.h * y };
    if (runtime.configuredScene.pickObject(pack, run, point, alpha, true) === id) points.push({ x: box.x + cam.x + point.x * cam.scale, y: box.y + cam.y + point.y * cam.scale });
  }
  return visiblePoint(page, points, id);
}
async function configuredTap(page, pack, ruleId) {
  const rule = pack.rules.interactions.find(rule => rule.id === ruleId);
  assert(rule?.mode === 'tap', `Expected tappable ${ruleId}`);
  const point = await configuredSource(page, pack, rule.source);
  await page.touchscreen.tap(point.x, point.y);
  return rule;
}
async function disasterPoint(page, pack, point) {
  const box = await page.locator('.disaster-world canvas').boundingBox();
  const obstacles = await scene(page).evaluate(element => {
    const box = element.getBoundingClientRect();
    return [...element.querySelectorAll('.disaster-hud > button, .disaster-hud > h1, .disaster-hud > time, .disaster-clues > span')].map(node => node.getBoundingClientRect()).filter(rect => rect.width && rect.height).map(rect => ({ x: rect.x - box.x, y: rect.y - box.y, w: rect.width, h: rect.height }));
  });
  const cam = runtime.disasterScene.disasterCamera(box.width, box.height, pack.skin.width, pack.skin.height, pack.skin.framing, obstacles);
  return { x: box.x + cam.x + point.x * cam.scale, y: box.y + cam.y + point.y * cam.scale };
}
async function rainOne(page, pack) {
  const sample = read('public/levels/rain-flood-v1/street/hit-samples.json');
  const id = pack.rules.goals[0].id, point = await disasterPoint(page, pack, sample[id]);
  await page.touchscreen.tap(point.x, point.y);
  const action = pack.rules.actions.find(action => action.goal === id);
  await page.clock.runFor(action.duration + 120);
  assert((await scene(page).getAttribute('data-goals')).split(',').includes(id), 'Rain actual target did not commit');
  return id;
}
async function floodDrop(page, pack, target) {
  const samples = read('public/levels/rain-flood-v1/flood/hit-samples.json');
  const from = await disasterPoint(page, pack, samples.person);
  const box = pack.skin.zones[target]?.box || pack.skin.sprites[target]?.box;
  assert(box, `${target}: flood destination missing`);
  const to = await disasterPoint(page, pack, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up();
  await page.clock.runFor(80);
}
async function progress(page, spec) {
  const key = spec.family === 'hunt' ? 'data-found' : spec.family === 'disaster' ? 'data-goals' : 'data-resolved';
  return (await scene(page).getAttribute(key) || '').split(',').filter(Boolean);
}

async function verifyPanel(page, spec, { kind = 'timeout', reason } = {}) {
  const panel = page.locator(popup);
  await panel.waitFor({ state: 'visible' });
  const count = (await progress(page, spec)).length;
  assert.equal((await panel.locator('[data-testid="failure-title"]').innerText()).trim(), '怎么回事！');
  assert.equal((await panel.locator('[data-testid="failure-level"]').innerText()).trim(), runtime.catalog.getLevel(spec.id).title);
  assert.equal(await panel.locator('[data-failure-kind]').getAttribute('data-failure-kind'), kind);
  const renderedReason = (await panel.locator('[data-testid="failure-reason"]').innerText()).trim();
  assert(renderedReason.length > 5, `${spec.id}: empty failure reason`);
  if (reason) assert(renderedReason.includes(reason), `${spec.id}: authored failure reason missing`);
  const progressText = await panel.locator('[data-testid="failure-progress"]').innerText();
  assert(progressText.replace(/\s+/g, '').includes(`${count}/${spec.total}`), `${spec.id}: dynamic progress wrong: ${progressText}`);
  if (kind === 'timeout' && spec.unit !== '训练') assert(renderedReason.includes(String(spec.total - count)), `${spec.id}: missing count should be derived from actual progress`);
  assert.equal((await panel.locator('[data-testid="failure-retry"]').innerText()).trim(), '不服，再来！');
  assert.equal((await panel.locator('[data-testid="failure-back"]').innerText()).trim(), '返回地图');
  assert.equal((await panel.locator('[data-testid="failure-no-reward"]').innerText()).replace(/\s+/g, ''), '本局小红花：0朵');
  const roast = (await panel.locator('[data-testid="failure-roast"]').innerText()).replace(/\s+/g, '');
  const missed = Math.max(0, spec.total - count);
  const expectedRoast = kind === 'unsafe-action' ? '这操作，小红花都看愣了。'
    : spec.unit === '训练' || missed === 0 ? '时间可不等人，这局先交卷！'
    : spec.unit === '物品' ? `还剩${missed}件，这就收工了？` : `漏了${missed}处，还想领花？`;
  assert.equal(roast, expectedRoast, `${spec.id}: failure copy must use the actual missing count or unsafe-action wording`);
  assert((await panel.locator('[data-testid="failure-hint"]').innerText()).trim().length > 5);
  assert.equal(await page.locator('.painted-settlement').count(), 0, `${spec.id}: failure displayed a completion reward dialog`);
  assert(!/\+\s*3|种下小红花/.test(await panel.innerText()), `${spec.id}: failure implies success reward`);
  const images = await panel.locator('img').evaluateAll(async images => Promise.all(images.map(async image => {
    try { await image.decode(); } catch { /* dimensions below record failure */ }
    return { embedded: /^(data:|blob:)/.test(image.currentSrc || image.src), width: image.naturalWidth, height: image.naturalHeight };
  })));
  assert(images.length > 0 && images.every(image => image.embedded && image.width > 0 && image.height > 0), `${spec.id}: artwork missing or external`);
  if (!report.renderedArtwork) {
    const urls = await panel.evaluate(element => {
      const sources = [];
      for (const node of [element, ...element.querySelectorAll('*')]) {
        if (node.tagName === 'IMG') sources.push(node.currentSrc || node.src);
        for (const pseudo of [null, '::before', '::after']) for (const match of getComputedStyle(node, pseudo).backgroundImage.matchAll(/url\(["']?(data:image\/[^"')]+)["']?\)/g)) sources.push(match[1]);
      }
      return [...new Set(sources)].filter(url => url.startsWith('data:image/'));
    });
    const rendered = urls.map(url => hash(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')));
    for (const asset of report.sourceArtwork) assert(rendered.includes(asset.sha256), `${asset.name}: selected failure artwork not actually rendered`);
    report.renderedArtwork = report.sourceArtwork.map(asset => ({ ...asset, embeddedAndRenderedMatch: true }));
  }
  return { id: spec.id, family: spec.family, kind, completed: count, total: spec.total, reason: renderedReason, progress: progressText };
}
async function layout(page, spec, width, height) {
  await page.setViewportSize({ width, height }); await settle(page);
  const panel = page.locator(popup);
  await panel.evaluate(element => { element.scrollTop = 0; });
  const geometry = await panel.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { box: { x: box.x, y: box.y, right: box.right, bottom: box.bottom },
      overflow: document.documentElement.scrollWidth > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1,
      scrollable: element.scrollHeight <= element.clientHeight + 1 || /auto|scroll/.test(getComputedStyle(element).overflowY),
      clippedText: [...element.querySelectorAll('[data-testid]')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.getAttribute('data-testid')),
      animations: element.getAnimations({ subtree: true }).map(animation => animation.effect?.getComputedTiming().duration),
      buttons: ['failure-retry', 'failure-back'].map(id => { const b = element.querySelector(`[data-testid="${id}"]`).getBoundingClientRect(); return { id, x: b.x, top: b.top, bottom: b.bottom, width: b.width }; }),
    };
  });
  const label = `${spec.id} ${width}x${height}`;
  assert(!geometry.overflow && geometry.scrollable && geometry.clippedText.length === 0, `${label}: overflow/clipped text ${JSON.stringify(geometry)}`);
  assert(geometry.box.x >= -1 && geometry.box.right <= width + 1 && geometry.box.y >= -1 && geometry.box.bottom <= height + 1, `${label}: popup outside viewport`);
  assert(geometry.animations.every(duration => typeof duration === 'number' && duration <= 100), `${label}: reduced-motion retains large animations`);
  const [primary, secondary] = geometry.buttons;
  assert(secondary.top >= primary.bottom && Math.abs(primary.x - secondary.x) <= 1 && Math.abs(primary.width - secondary.width) <= 1, `${label}: buttons must form an aligned vertical stack`);
  if (['quake-bedroom-v2', 'typhoon-home', 'fire-shelter-practice'].includes(spec.id)) await shot(page, `${spec.id}-${width}x${height}`);
  for (const id of ['failure-retry', 'failure-back']) {
    const button = panel.locator(`[data-testid="${id}"]`);
    await button.scrollIntoViewIfNeeded(); await settle(page);
    const bounds = await button.evaluate(button => { const b = button.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height, hit: document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('button') === button }; });
    assert(bounds.width >= 44 && bounds.height >= 44 && bounds.x >= -1 && bounds.right <= width + 1 && bounds.y >= -1 && bounds.bottom <= height + 1 && bounds.hit, `${label}: inaccessible ${id}`);
  }
  await panel.locator('[data-testid="failure-retry"]').focus();
  for (const key of ['Tab', 'Shift+Tab']) for (let i = 0; i < 4; i++) {
    await page.keyboard.press(key); await settle(page);
    assert(await panel.evaluate(element => element.contains(document.activeElement)), `${label}: focus escaped after ${key}`);
  }
  report.layouts.push({ id: spec.id, width, height, ...geometry });
}
async function retry(page, spec) {
  await page.locator(`${popup} [data-testid="failure-retry"]`).click();
  await page.clock.runFor(260);
  await page.locator(popup).waitFor({ state: 'detached' });
  // Disaster response retry intentionally returns to its existing start gate.
  if (await page.locator('[data-painted-intro]').count()) await page.locator('.painted-intro-start:not(:disabled)').click();
  await page.clock.runFor(80);
  assert.equal(await scene(page).getAttribute('data-phase'), 'playing', `${spec.id}: retry did not resume a fresh run`);
  assert.deepEqual(await progress(page, spec), [], `${spec.id}: retry retained targets`);
  assert(Number(await scene(page).getAttribute('data-elapsed')) < 1000, `${spec.id}: retry did not reset clock`);
  if (spec.family === 'disaster') assert.equal(Number(await scene(page).getAttribute('data-penalty')), 0, `${spec.id}: retry retained time penalty`);
  assert.equal(await scene(page).getAttribute('data-failure') || '', '', `${spec.id}: retry retained failure rule`);
  const timer = page.getByRole('progressbar');
  if (await timer.count()) assert(Number(await timer.getAttribute('aria-valuenow')) >= spec.seconds - 1, `${spec.id}: timer did not refill`);
}
/** Second-run boundary only. Actual reducers still decide failed; no reward callback. */
async function controlledTimeout(page, spec) {
  const mode = await scene(page).evaluate((element, seconds) => {
    const key = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
    for (let fiber = element[key]; fiber; fiber = fiber.return) for (let hook = fiber.memoizedState; hook; hook = hook.next) {
      const run = hook.memoizedState;
      if (!hook.queue?.dispatch || !run || typeof run !== 'object' || run.phase !== 'playing') continue;
      if (Array.isArray(run.found) || Array.isArray(run.goals)) {
        for (let i = 0; i < seconds * 10 + 2; i++) hook.queue.dispatch({ type: 'tick', ms: 100 });
        return 'controlled mounted useReducer tick events';
      }
      if (Array.isArray(run.resolved)) {
        hook.queue.dispatch(previous => ({ ...previous, elapsed: seconds * 1000 }));
        return 'controlled mounted state elapsed boundary; next real RAF evaluates timeout';
      }
    }
    throw new Error('Active engine clock hook not found');
  }, spec.seconds);
  await page.clock.runFor(150);
  await page.locator(popup).waitFor({ state: 'visible' });
  return mode;
}
async function unsafeShelter(page, pack) {
  const close = await configuredTap(page, pack, 'close-room-door');
  await page.clock.runFor(pack.skin.animations[close.animation].durationMs + 120);
  assert((await scene(page).getAttribute('data-resolved')).split(',').includes('door-closed'), 'Correct door close failed');
  const bad = await configuredTap(page, pack, 'reopen-door-error');
  assert.equal(await scene(page).getAttribute('data-phase'), 'failed');
  if (pack.skin.presentation?.failureReveal) {
    assert.equal(await page.locator(popup).count(), 0, 'Failure card covered an authored failure reveal');
    await page.clock.runFor(pack.skin.animations[bad.animation].durationMs + 120);
  }
  return bad;
}
async function runCase(page, spec) {
  const original = await board(page);
  await open(page, spec.id);
  let actualReason, input;
  if (spec.family === 'practice') {
    const rule = await unsafeShelter(page, spec.pack); actualReason = rule.feedback;
    input = 'real canvas clicks: close door, then reopen it';
  } else {
    if (spec.family === 'hunt') await huntTarget(page, spec.pack, spec.pack.rules.targets[0]);
    else if (spec.family === 'collection') {
      const rule = spec.pack.rules.interactions.find(rule => rule.outcome === 'correct');
      await configuredTap(page, spec.pack, rule.id);
      await page.clock.runFor(spec.pack.skin.animations[rule.animation].durationMs + 120);
      assert((await progress(page, spec)).length === 1, `${spec.id}: actual collected item did not commit`);
    } else if (spec.pack.rules.kind === 'prevention') await rainOne(page, spec.pack);
    await page.clock.runFor(spec.seconds * 1000 + 300);
    input = 'real engine timeout via Playwright RAF/timer advancement; actual pointer progress first where available';
  }
  assert.equal(await scene(page).getAttribute('data-phase'), 'failed');
  const result = await verifyPanel(page, spec, { kind: spec.family === 'practice' ? 'unsafe-action' : 'timeout', reason: actualReason });
  assert.equal(await board(page), original, `${spec.id}: failure changed persistent score bytes`);
  for (const [width, height] of sizes) await layout(page, spec, width, height);
  await page.setViewportSize({ width: 390, height: 844 }); await settle(page);
  await retry(page, spec);
  assert.equal(await board(page), original, `${spec.id}: retry changed rewards`);
  if (spec.id === 'typhoon-home') {
    // End-to-end recovery: failure -> Retry -> all real target taps -> the
    // existing successful Settlement. No completion callback is injected.
    for (const target of spec.pack.rules.targets) await huntTarget(page, spec.pack, target);
    await page.clock.runFor(1200);
    await page.locator('.painted-settlement').waitFor({ state: 'visible' });
    assert.equal(await page.locator(popup).count(), 0, 'Failure overlay blocked successful recovery');
    assert.equal((await page.locator('[data-testid="settlement-reward"]').innerText()).trim(), '+3 朵小红花');
    const state = JSON.parse(await board(page));
    const current = state.players.find(player => player.id === state.activePlayerId);
    assert.equal(current.completed[spec.id], 3, 'Successful retry did not award exactly three');
    assert.equal(Object.values(current.completed).reduce((sum, value) => sum + value, 0), 72, 'Successful retry duplicated or omitted flowers');
    await shot(page, 'typhoon-failure-retry-genuine-success');
    await page.locator('[data-testid="settlement-primary"]').click();
    await page.locator('[data-map-node]').first().waitFor({ state: 'attached' });
    report.cases.push({ ...result, input, retryBoundary: 'all five real target taps; original successful Settlement awards exactly three', failureSavePreserved: true, genuineRetryCompletion: true });
    passed('typhoon-home: real timeout earns zero, Retry resets all targets, five real taps reach successful Settlement and award exactly three');
    return;
  }
  let secondBoundary;
  if (spec.family === 'practice') { await unsafeShelter(page, spec.pack); secondBoundary = 'real repeated door clicks'; }
  else secondBoundary = await controlledTimeout(page, spec);
  await page.locator(`${popup} [data-testid="failure-back"]`).click();
  await page.locator('[data-map-node]').first().waitFor({ state: 'attached' });
  assert.equal(await board(page), original, `${spec.id}: failure back changed rewards`);
  assert.equal(await page.locator('.garden-shell').getAttribute('data-planting'), '', `${spec.id}: failure planted a flower`);
  report.cases.push({ ...result, input, retryBoundary: secondBoundary, originalSavePreserved: true, existingFailureRevealEnabled: Boolean(spec.pack.skin.presentation?.failureReveal) });
  passed(`${spec.id}: real failure, correct reason/count, four viewports, no reward, fresh retry and map return`);
}
async function negativeCases(page, spec) {
  const original = await board(page);
  await open(page, spec.id);
  if (spec.id === 'fire-shelter-practice' || spec.id === 'oil-fire') {
    await page.clock.runFor(spec.seconds * 1000 + 600);
    assert.equal(await scene(page).getAttribute('data-phase'), 'playing', `${spec.id}: continue training timer became a failure`);
    assert.equal(await page.locator(popup).count(), 0);
    assert.equal(await page.locator('.painted-settlement').count(), 0);
    assert.equal(await board(page), original);
    passed(`${spec.id}: zero training countdown remains playable without failure or reward`);
  } else {
    await floodDrop(page, spec.pack, 'roof');
    assert.equal(await scene(page).getAttribute('data-phase'), 'evacuated');
    assert.equal(await page.locator(popup).count(), 0, 'Safe early evacuation was mislabeled as failure');
    assert.equal(await page.locator('.painted-settlement').count(), 0);
    assert.match(await page.locator('.disaster-dialog').innerText(), /高处|转移/);
    assert.equal(await board(page), original);
    passed('flood-house-response-v1: real early high-ground evacuation retains safe-exit dialog and no new reward');
  }
}
async function floodUnsafe(page, spec) {
  const original = await board(page); await open(page, spec.id);
  await floodDrop(page, spec.pack, 'outside');
  const rule = spec.pack.rules.actions.find(action => action.id === 'danger-outside');
  const result = await verifyPanel(page, spec, { kind: 'unsafe-action', reason: rule.feedback });
  assert.equal(await board(page), original);
  await shot(page, 'flood-unsafe-action');
  report.cases.push({ ...result, input: 'real canvas drag of person toward outside floodwater', originalSavePreserved: true });
  await page.locator(`${popup} [data-testid="failure-back"]`).click();
  await page.locator('[data-map-node]').first().waitFor({ state: 'attached' });
  passed('flood-house-response-v1: real unsafe drag preserves authored reason and no reward');
}
async function quickCase(page, spec) {
  const original = await board(page); await open(page, spec.id);
  let reason, boundary;
  if (spec.family === 'practice') {
    const rule = await unsafeShelter(page, spec.pack); reason = rule.feedback;
    boundary = 'real canvas close-door/reopen-door clicks';
  } else {
    await huntTarget(page, spec.pack, spec.pack.rules.targets[0]);
    boundary = await controlledTimeout(page, spec);
  }
  const result = await verifyPanel(page, spec, { kind: spec.family === 'practice' ? 'unsafe-action' : 'timeout', reason });
  for (const [width, height] of smokeSizes) await layout(page, spec, width, height);
  await page.setViewportSize({ width: 390, height: 844 }); await settle(page);
  await retry(page, spec);
  if (spec.family === 'practice') await unsafeShelter(page, spec.pack);
  else await controlledTimeout(page, spec);
  await page.locator(`${popup} [data-testid="failure-back"]`).click();
  await page.locator('[data-map-node]').first().waitFor({ state: 'attached' });
  assert.equal(await board(page), original, `${spec.id}: quick latest-artifact smoke changed rewards`);
  report.cases.push({ ...result, input: boundary, originalSavePreserved: true });
  passed(`${spec.id}: latest artifact ${smokeSizes.map(([width]) => width).join('/')} rendering, dynamic reason, Retry and Back smoke`);
}

try {
  const bytes = fs.readFileSync(html); report.htmlSha256 = hash(bytes);
  assert(bytes.includes(Buffer.from('painted-failure')), 'Export the candidate final HTML first; painted-failure is absent');
  report.sourceArtwork = [
    ...['header', 'body', 'footer', 'mascot', 'secondary-button'].map(name => ({ name, asset: `ui/painted-failure-v2/${name}.webp` })),
    { name: 'primary-button', asset: 'ui/painted-settlement-v1/button.webp' },
  ].map(({ name, asset }) => {
    const file = path.join(root, 'public', asset), image = fs.readFileSync(file);
    assert(bytes.includes(Buffer.from(image.toString('base64'))), `${name}: final HTML is missing the current asset`);
    return { name, file, sha256: hash(image) };
  });
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'painted-failure-qa-'));
  const moduleFile = path.join(temp, 'runtime.mjs');
  await dependency('esbuild').build({ absWorkingDir: root, stdin: { contents: [
    "export * as catalog from './app/game/levels';", "export * as hunts from './app/game/scene-hunt/registry';",
    "export * as huntViewport from './app/game/scene-hunt/viewport';", "export * as engine from './app/game/runtime/engine';",
    "export * as configuredScene from './app/game/runtime/scene';", "export * as disasters from './app/game/disaster/registry';",
    "export * as disasterScene from './app/game/disaster/scene';",
  ].join('\n'), resolveDir: root }, bundle: true, platform: 'node', format: 'esm', outfile: moduleFile, logLevel: 'silent' });
  runtime = await import(pathToFileURL(moduleFile));
  const specs = [];
  for (const node of nodes) {
    const hunt = runtime.hunts.getHunt(node.id), disaster = runtime.disasters.getDisaster(node.id), pack = runtime.catalog.getPackage(node.id);
    if (hunt?.rules.timeout === 'fail') specs.push({ id: node.id, family: 'hunt', unit: '隐患', seconds: hunt.rules.seconds, total: hunt.rules.targets.length, pack: hunt });
    else if (disaster) specs.push({ id: node.id, family: 'disaster', unit: disaster.rules.kind === 'prevention' ? '隐患' : '训练', seconds: disaster.rules.seconds, total: disaster.rules.goals.length, pack: disaster });
    else if (pack?.rules.risk.timeout === 'fail') specs.push({ id: node.id, family: 'collection', unit: '物品', seconds: pack.rules.risk.seconds, total: pack.rules.goals.length, pack });
    else if (pack?.rules.interactions.some(rule => rule.failure)) specs.push({ id: node.id, family: 'practice', unit: '训练', seconds: pack.rules.risk.seconds, total: pack.rules.goals.length, pack });
  }
  assert.equal(specs.length, 14, 'Failure entry inventory changed; review coverage intentionally');
  const priority = ['quake-bedroom-v2', 'typhoon-home', 'fire-shelter-practice', 'rain-street-preparation-v1', 'flood-kit'];
  specs.sort((a, b) => (priority.includes(a.id) ? priority.indexOf(a.id) : 100) - (priority.includes(b.id) ? priority.indexOf(b.id) : 100));
  report.expectedEntries = specs.map(({ id, family, seconds, total }) => ({ id, family, seconds, total }));
  const { chromium } = findPlaywright();
  browser = await chromium.launch({ headless: true, executablePath: findBrowser(chromium), args: ['--mute-audio'] }); report.browser = browser.version();
  if (quickSmoke) {
    const selected = specs.filter(spec => smokeLevelIds.includes(spec.id));
    assert.equal(selected.length, smokeLevelIds.length, 'An unknown or unsupported smoke level was requested');
    for (const spec of selected) await withPage(spec.id, page => quickCase(page, spec));
    assert.equal(report.layouts.length, selected.length * smokeSizes.length); assert.equal(report.cases.length, selected.length);
  } else {
    for (const spec of specs) await withPage(spec.id, page => runCase(page, spec));
    const flood = specs.find(spec => spec.id === 'flood-house-response-v1');
    await withPage(flood.id, page => floodUnsafe(page, flood));
    await withPage(flood.id, page => negativeCases(page, flood));
    const shelter = specs.find(spec => spec.id === 'fire-shelter-practice');
    await withPage(shelter.id, page => negativeCases(page, shelter));
    await withPage('oil-fire', page => negativeCases(page, { id: 'oil-fire', seconds: runtime.catalog.getLevel('oil-fire').riskSeconds }));
    assert.equal(report.layouts.length, 56); assert.equal(report.cases.length, 15);
  }
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.network.length, 0, JSON.stringify(report.network));
  assert.equal(report.failedRequests.length, 0, JSON.stringify(report.failedRequests));
  report.finalHtmlSha256 = hash(fs.readFileSync(html)); assert.equal(report.finalHtmlSha256, report.htmlSha256);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || error.message; console.error(report.failure); process.exitCode = 1;
} finally {
  if (browser) { await browser.close(); report.browserClosed = true; }
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), [
    '# 挑战失败弹窗：最终离线 HTML 验证', '', `- 结果：${report.status}`, `- HTML：${html}`, `- SHA-256：${report.htmlSha256}`,
    `- 模式：${report.mode}`,
    `- 浏览器：${report.browser}；隔离存储、offline、headless、--mute-audio。`,
    `- finally关闭：${report.contextsClosed}/${report.contextsCreated} contexts；browserClosed=${report.browserClosed}。`,
    quickSmoke ? `- 最新文件抽验：${report.cases.length}/${smokeLevelIds.length}入口；布局：${report.layouts.length}/${smokeLevelIds.length * smokeSizes.length}。受控时钟仅检验最新导出渲染/CTA，不宣称重新做了14关真实超时。` : `- 失败入口：${report.cases.filter(item => item.retryBoundary).length}/14；布局：${report.layouts.length}/56。`,
    quickSmoke ? '- 本轮在最新文件用实际目标点击＋受控时钟触发找隐患失败，用真实开门错误触发practice失败；完整真实时钟覆盖见 ../verification。' : '- 初次失败由真实引擎时钟（Playwright加速RAF）或真实指针危险动作触发；已完成数来自真正目标点击/收纳。',
    '- 重新挑战后，二次超时通过受控React reducer tick/elapsed边界触发，只用于验证失败页返回按钮；未调用成功或奖励回调。',
    '- 保存23关的隔离夹具仅用于解锁；逐次核对失败/重试/返回的存档字节不变，不重复发花。',
    '- 当前未开启failureReveal的正式practice即时失败；如果既有flag开启，则先验证演出期间没有失败弹窗，再验证演出结束出现。',
    ...(!quickSmoke ? ['- 台风恢复闭环：真实超时0花 → 重新挑战 → 5个真实目标点击 → 原成功Settlement → 仅发3花。'] : []),
    '- 覆盖窄屏滚动、两按钮可达、无横向溢出、正反Tab焦点限制、reduced-motion、来源图片内嵌完整解码。',
    ...(!quickSmoke ? ['- 单独核对洪水危险动作的实际原因、提前转移高处仍为安全退出，以及火灾隔烟/油锅训练计时归零仍可继续。'] : []),
    `- 运行时错误 ${report.errors.length}；HTTP(S)请求 ${report.network.length}；失败请求 ${report.failedRequests.length}。`,
    '- physicalDevice: not_run', '- humanAudio: not_run',
    ...(report.failure ? ['', '## 失败', '', '```text', report.failure, '```'] : []),
    '', '## 截图', '', ...report.screenshots.map(file => `- [${file}](${file})`), '',
  ].join('\n'));
}
