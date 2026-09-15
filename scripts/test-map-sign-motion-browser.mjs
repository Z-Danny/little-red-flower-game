// Final artifact QA: a fresh profile, real pointer gameplay and native UI replay.
// No saved completion, rewards, game actions or production test entry points are injected.
// Optional: OFFLINE_FILE, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, MAP_SIGN_MOTION_OUTPUT.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const html = path.resolve(root, process.env.OFFLINE_FILE || 'outputs/本地离线版/小红花应急行动.html');
const output = path.resolve(root, process.env.MAP_SIGN_MOTION_OUTPUT || 'outputs/map-sign-motion-verification');
const signs = read('content/journey-signs.json');
const categories = read('content/journey-categories.json').categories;
const rules = read('content/levels/clear-corridor/level.json');
const skin = read('content/levels/clear-corridor/skins/paperbook.json');
const boardKey = 'little-red-flower-leaderboard-v1';
const first = 'clear-corridor';
const next = 'lift-wait';
const report = {
  status: 'running', html, sha256: null, browser: null, checks: [], screenshots: [], motionEvents: [], animationEvents: [],
  errors: [], network: [], failedRequests: [], contextClosed: false, browserClosed: false,
  contextsCreated: 0, contextsClosed: 0, branches: {},
  gameplay: 'Empty browser storage; the four corridor objects are clicked on the real canvas twice. No progress/reward fixtures or injected game actions.',
  backgroundLifecycle: 'Synthetic document.hidden + visibilityState and visibilitychange; native OS backgrounding not tested.',
  physicalDevice: 'not_run', humanAudio: 'not_run',
};
fs.mkdirSync(output, { recursive: true });
const pass = (name, detail = {}) => { report.checks.push({ name, status: 'passed', ...detail }); console.log(`PASS ${name}`); };
function findPlaywright() {
  const specified = process.env.PLAYWRIGHT_MODULE || process.env.PLAYWRIGHT_PATH;
  const candidates = specified ? [specified.startsWith('file:') ? fileURLToPath(specified) : specified] : [
    'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'), 'playwright-core',
  ];
  for (const candidate of candidates) {
    try { return require(candidate.startsWith('.') ? path.resolve(candidate) : candidate); }
    catch (error) { if (specified) throw error; }
  }
  throw new Error('Playwright unavailable. Set PLAYWRIGHT_MODULE.');
}
function findBrowser(chromium) {
  const candidates = [process.env.BROWSER_EXECUTABLE, process.env.EDGE_PATH, chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'];
  const executable = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  assert(executable, 'Chromium unavailable. Set BROWSER_EXECUTABLE.');
  return executable;
}
async function startMap(page, continuing = false) {
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60_000 });
  await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  const start = page.locator(continuing ? '[data-home-continue]' : '[data-home-start]');
  await start.waitFor({ state: 'visible' });
  // The cover CTA deliberately breathes. Use its actual visible center rather
  // than waiting for an animated button to become geometrically stationary.
  const center = await start.evaluate((button) => {
    const box = button.getBoundingClientRect();
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    if (!button.contains(document.elementFromPoint(point.x, point.y))) throw new Error('Cover CTA center is obstructed');
    return point;
  });
  await page.mouse.click(center.x, center.y);
  await page.locator('[data-map-fan-toggle]').waitFor({ state: 'visible' });
}
async function selectRegion(page, id) {
  const category = categories.find((item) => item.regionIds.includes(id));
  const toggle = page.locator('[data-map-fan-toggle]');
  await toggle.click();
  await page.locator('[data-archipelago]').waitFor({ state: 'visible' });
  await page.locator(`[data-island="${category.id}"]`).click();
  await page.locator('[data-archipelago]').waitFor({ state: 'hidden' });
  await page.locator(`.garden-region[data-region="${id}"]`).waitFor({ state: 'attached' });
}
async function centerNode(page, id) {
  await page.locator(`[data-map-node="${id}"]`).evaluate((node) => {
    const scroll = node.closest('.garden-scroll');
    const box = node.querySelector('.garden-node-label').getBoundingClientRect();
    const view = scroll.getBoundingClientRect();
    scroll.scrollTo({ top: scroll.scrollTop + box.y + box.height / 2 - view.y - view.height / 2, behavior: 'instant' });
  });
}
async function saved(page) {
  return page.evaluate((key) => {
    const board = JSON.parse(localStorage.getItem(key));
    return board?.players.find((player) => player.id === board.activePlayerId)?.completed ?? {};
  }, boardKey);
}
async function observeMotion(page) {
  await page.evaluate(() => {
    window.__mapSignMotionEvents = [];
    window.__mapSignAnimationEvents = [];
    for (const phase of ['start', 'end']) document.addEventListener(`animation${phase}`, (event) => {
      if (!/^garden-sign-(?:sweep|stamp|bud-response)$/.test(event.animationName)) return;
      const target = event.target;
      const css = getComputedStyle(target);
      const names = css.animationName.split(',').map((name) => name.trim());
      const times = css.animationDuration.split(',').map((time) => time.trim());
      const duration = times[names.indexOf(event.animationName) % times.length];
      const durationMs = Number.parseFloat(duration) * (duration?.endsWith('ms') ? 1 : 1000);
      window.__mapSignAnimationEvents.push({ phase, name: event.animationName, id: target.closest('[data-map-node]')?.dataset.mapNode,
        at: performance.now(), elapsedTime: event.elapsedTime, durationMs });
    }, true);
    const prior = new WeakMap();
    const inspect = (label) => {
      const current = { revealing: label.dataset.revealing, stamping: label.dataset.stamping };
      const previous = prior.get(label) ?? {};
      for (const [key, type] of [['revealing', 'sweep'], ['stamping', 'stamp']]) {
        if (current[key] === 'true' && previous[key] !== 'true') {
          window.__mapSignMotionEvents.push({ type, id: label.closest('[data-map-node]')?.dataset.mapNode, at: performance.now(), motion: label.dataset.motion });
        }
      }
      prior.set(label, current);
    };
    const inspectTree = (node) => {
      if (!(node instanceof Element)) return;
      if (node.matches('.garden-node-label')) inspect(node);
      node.querySelectorAll('.garden-node-label').forEach(inspect);
    };
    inspectTree(document.documentElement);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') inspect(record.target);
        else record.addedNodes.forEach(inspectTree);
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-revealing', 'data-stamping'] });
    window.__mapSignMotionObserver?.disconnect();
    window.__mapSignMotionObserver = observer;
  });
}
async function events(page) { return page.evaluate(() => window.__mapSignMotionEvents ?? []); }
async function animationEvents(page) { return page.evaluate(() => window.__mapSignAnimationEvents ?? []); }
async function motion(page, id) {
  return page.locator(`[data-map-node="${id}"] .garden-node-label`).evaluate((label) => ({
    motion: label.dataset.motion, revealing: label.dataset.revealing, stamping: label.dataset.stamping,
    animations: label.getAnimations({ subtree: true }).map((animation) => ({
      name: animation.animationName ?? '', state: animation.playState, currentTime: animation.currentTime,
      duration: animation.effect?.getComputedTiming().duration, iterations: animation.effect?.getComputedTiming().iterations,
    })),
  }));
}
async function waitMotion(page, id, state) {
  await page.waitForFunction(({ id, state }) => document.querySelector(`[data-map-node="${id}"] .garden-node-label`)?.dataset.motion === state, { id, state });
}
async function shot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(output, file) });
  report.screenshots.push(file);
}
async function openCorridor(page) {
  await selectRegion(page, 'public');
  await centerNode(page, first);
  await page.locator(`[data-map-node="${first}"] .garden-node-label`).click();
  const intro = page.locator(`[data-painted-intro][data-level-id="${first}"]`);
  await intro.waitFor({ state: 'visible' });
  await intro.locator('[data-painted-primary]').click();
  await page.locator(`.configured-player[data-level="${first}"][data-ready="true"][data-phase="playing"]`).waitFor({ state: 'visible' });
}
async function completeCorridor(page) {
  const canvas = page.locator('.configured-world canvas');
  for (const goal of rules.goals) {
    const object = rules.objects.find((item) => item.id === goal.object);
    const pose = skin.poses[goal.object];
    // Choose a visible opaque pixel in the actual, embedded object artwork.
    // Scene-camera data and pointer coordinates are read-only observations.
    const point = await canvas.evaluate(async (element, { pose, label, world }) => {
      const sprite = [...document.querySelectorAll('.configured-targets img')].find((image) => image.alt === label);
      if (!sprite) throw new Error(`missing gameplay target sprite: ${label}`);
      await sprite.decode();
      const raster = document.createElement('canvas');
      raster.width = sprite.naturalWidth; raster.height = sprite.naturalHeight;
      const ctx = raster.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(sprite, 0, 0);
      const pixels = ctx.getImageData(0, 0, raster.width, raster.height).data;
      const box = element.getBoundingClientRect();
      const fittedScale = Math.min(box.width / world.width, box.height / world.height);
      // This existing prevention scene uses centered contain fitting and does
      // not expose the response engine's camera attributes.
      const camera = Number(element.dataset.cameraScale) > 0
        ? { x: Number(element.dataset.cameraX), y: Number(element.dataset.cameraY), scale: Number(element.dataset.cameraScale) }
        : { x: (box.width - world.width * fittedScale) / 2, y: (box.height - world.height * fittedScale) / 2, scale: fittedScale };
      const candidates = [];
      for (let y = 0.16; y <= 0.84; y += 0.06) for (let x = 0.16; x <= 0.84; x += 0.06) {
        const px = Math.min(raster.width - 1, Math.floor(x * raster.width));
        const py = Math.min(raster.height - 1, Math.floor(y * raster.height));
        if (pixels[(py * raster.width + px) * 4 + 3] < 230) continue;
        const point = { x: box.x + camera.x + (pose.x + pose.w * x) * camera.scale, y: box.y + camera.y + (pose.y + pose.h * y) * camera.scale };
        if (document.elementFromPoint(point.x, point.y) === element) candidates.push({ ...point, distance: Math.hypot(x - 0.5, y - 0.5) });
      }
      candidates.sort((a, b) => a.distance - b.distance);
      if (!candidates.length) throw new Error(`no visible opaque pointer target: ${label}`);
      return candidates[0];
    }, { pose, label: object.label, world: skin.world });
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction((id) => document.querySelector('.configured-player')?.dataset.resolved.split(',').includes(id), goal.id);
    await page.waitForFunction(() => {
      const player = document.querySelector('.configured-player');
      return !player || !player.dataset.action || player.dataset.phase !== 'playing';
    });
  }
  await page.locator('.garden-settlement').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.painted-settlement-reward > .garden-flower').count(), 3, 'Real correct play must award three flowers');
}
async function returnToMap(page) {
  await page.locator('[data-testid="settlement-primary"]').click();
  await page.locator('.garden-shell').waitFor({ state: 'visible' });
}

let browser, context, page;
try {
  report.sha256 = createHash('sha256').update(fs.readFileSync(html)).digest('hex');
  const { chromium } = findPlaywright();
  browser = await chromium.launch({ headless: true, executablePath: findBrowser(chromium), args: ['--mute-audio'] });
  report.browser = browser.version();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'no-preference', offline: true });
  report.contextsCreated += 1;
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('request', (request) => { if (/^https?:/.test(request.url())) report.network.push(request.url()); });
  page.on('requestfailed', (request) => report.failedRequests.push({ url: request.url().slice(0, 180), error: request.failure()?.errorText }));
  await startMap(page);
  assert.deepEqual(await saved(page), {}, 'Fresh profile unexpectedly has completed levels');
  await observeMotion(page);
  await selectRegion(page, 'public');
  await centerNode(page, first);
  await waitMotion(page, first, 'on');
  const active = await motion(page, first);
  assert(active.animations.some((animation) => animation.state === 'running'), 'Visible available sign must breathe');
  assert.equal((await events(page)).length, 0, 'Opening a fresh map must not synthesize an unlock or stamp');
  await shot(page, 'available-warm-highlight');
  pass('Visible available sign breathes; a fresh map does not play earned unlock/stamp effects');

  const sign = page.locator(`[data-map-node="${first}"] .garden-node-label`);
  const beforeHover = await sign.boundingBox();
  await page.mouse.move(beforeHover.x + beforeHover.width / 2, beforeHover.y + beforeHover.height / 2);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const resting = await sign.boundingBox();
  await page.mouse.move(resting.x + resting.width / 2, resting.y + resting.height / 2);
  await page.mouse.down();
  try {
    // The authored press has a short transform transition. Verify its settled
    // endpoint, rather than an intermediate frame after pointer down.
    await page.waitForFunction(({ id, resting }) => {
      const box = document.querySelector(`[data-map-node="${id}"] .garden-node-label`).getBoundingClientRect();
      return Math.abs(box.y - resting.y - 1) <= 0.15 && Math.abs(box.x - resting.x) <= 0.15;
    }, { id: first, resting }, { timeout: 2000 });
    const pressed = await sign.boundingBox();
    const pressState = await sign.evaluate((label) => {
      const node = label.closest('[data-map-node]');
      const box = label.getBoundingClientRect();
      return { active: node.matches(':active'), pressed: node.dataset.pressed, transform: getComputedStyle(label).transform,
        hit: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('[data-map-node]')?.dataset.mapNode };
    });
    report.press = { beforeHover, resting, pressed, pressState };
    assert(Math.abs(pressed.y - resting.y - 1) <= 0.15 && Math.abs(pressed.x - resting.x) <= 0.15, `Real pointer down must lower the sign by exactly 1px: ${JSON.stringify(report.press)}`);
    const cancelPoint = await page.locator('.garden-scroll').evaluate((scroll) => {
      const box = scroll.getBoundingClientRect();
      for (const y of [0.2, 0.4, 0.6, 0.8]) for (const x of [0.15, 0.35, 0.65, 0.85]) {
        const point = { x: box.x + box.width * x, y: box.y + box.height * y };
        const target = document.elementFromPoint(point.x, point.y);
        if (target && scroll.contains(target) && !target.closest('button,[role="button"],a')) return point;
      }
      throw new Error('No noninteractive map point for a cancelled press');
    });
    await page.mouse.move(cancelPoint.x, cancelPoint.y);
  } finally { await page.mouse.up(); }
  await page.waitForFunction(({ id, resting }) => {
    const label = document.querySelector(`[data-map-node="${id}"] .garden-node-label`);
    const box = label.getBoundingClientRect();
    const transitioning = label.getAnimations().some((animation) => animation.transitionProperty === 'transform' && animation.playState === 'running');
    return Math.abs(box.y - resting.y) <= 0.15 && !transitioning;
  }, { id: first, resting }, { timeout: 2000 });
  const rebounded = await sign.boundingBox();
  assert(Math.abs(rebounded.y - resting.y) <= 0.15, 'Cancelled pointer press must return the sign to its exact resting position');
  assert.equal(await page.locator('[data-painted-intro]').count(), 0, 'Cancelling the press opened a level');
  pass('Real pointer down lowers the sign by 1px; moving away and releasing restores it without entering a level');

  await page.locator('.garden-scroll').evaluate((element) => element.scrollTo({ top: 0, behavior: 'instant' }));
  await waitMotion(page, first, 'off');
  const away = await motion(page, first);
  assert(away.animations.every((animation) => animation.state !== 'running'), 'Offscreen sign still runs animation');
  await centerNode(page, first);
  await waitMotion(page, first, 'on');
  pass('Actual map scrolling pauses offscreen sign animation and resumes it on return');

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitMotion(page, first, 'off');
  const hidden = await motion(page, first);
  assert(hidden.animations.every((animation) => animation.state !== 'running'), 'Background lifecycle leaves sign animation running');
  await page.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
  await waitMotion(page, first, 'on');
  pass('Synthetic hidden/visible lifecycle pauses and resumes the sign');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction((id) => document.querySelector(`[data-map-node="${id}"] .garden-node-label`).getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running'), first);
  await shot(page, 'available-reduced-motion');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await waitMotion(page, first, 'on');
  pass('Reduced motion removes moving effects while retaining the available sign');

  await openCorridor(page);
  await completeCorridor(page);
  assert.equal((await saved(page))[first], 3, 'First pointer completion was not persisted');
  await returnToMap(page);
  await page.waitForFunction((id) => document.querySelector('.garden-shell')?.dataset.planting === id, first);
  await page.waitForFunction(() => document.querySelector('.garden-shell')?.dataset.planting === '');
  await centerNode(page, next);
  await page.waitForFunction((id) => window.__mapSignMotionEvents.some((event) => event.type === 'sweep' && event.id === id), next);
  await page.waitForFunction(() => [...document.querySelectorAll('.garden-node-label')].every((label) => label.dataset.revealing === 'false' && label.dataset.stamping === 'false'));
  const firstEvents = await events(page);
  assert.equal(firstEvents.filter((event) => event.type === 'sweep' && event.id === next).length, 1, 'Newly unlocked next level must sweep exactly once');
  assert.equal(firstEvents.filter((event) => event.type === 'stamp' && event.id === first).length, 1, 'First completion must stamp exactly once');
  assert.equal(firstEvents.filter((event) => event.type === 'sweep').length, 1, 'Unrelated signs must not sweep');
  const firstAnimations = await animationEvents(page);
  for (const [name, id, duration] of [
    ['garden-sign-sweep', next, signs.motion.sweepMs],
    ['garden-sign-stamp', first, signs.motion.stampMs],
    ['garden-sign-bud-response', next, signs.motion.budResponseMs],
  ]) {
    const starts = firstAnimations.filter((event) => event.phase === 'start' && event.name === name && event.id === id);
    assert.equal(starts.length, 1, `${id}: ${name} must actually start once, not merely set a data flag`);
    assert(Math.abs(starts[0].durationMs - duration) < 1, `${id}: ${name} duration differs from configured ${duration}ms`);
  }
  assert.equal(await page.locator(`[data-map-node="${first}"] img.garden-sign-stamp`).count(), 1, 'Completed sign lost its persistent flower stamp');
  await shot(page, 'earned-next-level');
  pass('Four real object clicks earn three flowers and actually start one stamp, one next-level sweep and the 650ms bud response', { firstEvents, firstAnimations });

  await selectRegion(page, 'nature');
  await selectRegion(page, 'public');
  await centerNode(page, next);
  await page.waitForTimeout(signs.motion.sweepMs + 150);
  assert.equal((await events(page)).length, firstEvents.length, 'Revisiting the map replays a consumed unlock/stamp');
  pass('Switching maps does not replay consumed effects');

  await openCorridor(page);
  await completeCorridor(page);
  await returnToMap(page);
  await centerNode(page, next);
  await page.waitForTimeout(signs.motion.sweepMs + signs.motion.stampMs + 200);
  assert.equal(await page.locator('.garden-shell').getAttribute('data-planting'), '', 'Replay must not replant the completed level');
  assert.equal((await events(page)).length, firstEvents.length, 'Replaying a completed level repeats unlock/stamp effects');
  assert.deepEqual(await saved(page), { [first]: 3 }, 'Replay changed earned progress or granted a different level');
  pass('A second real pointer completion preserves rewards and does not repeat planting, stamp or unlock sweep');
  report.motionEvents = await events(page);
  report.animationEvents = await animationEvents(page);

  await startMap(page, true);
  await observeMotion(page);
  await selectRegion(page, 'public');
  await centerNode(page, next);
  await page.waitForTimeout(signs.motion.sweepMs + 150);
  assert.equal((await events(page)).length, 0, 'Reloaded earned save replays old unlock/stamp effects');
  pass('Reloading the legitimately earned save leaves consumed effects silent');
  report.branches.normal = { status: 'passed', description: 'Fresh context: normal first completion, native stamp/sweep/bud starts, map revisit, actual replay and reload; no reduced-motion interruption during the reward.' };

  // A preference change intentionally cancels pending celebration. Exercise its
  // stamp boundary in separate fresh storage, preserving the normal-flow proof.
  await context.close(); report.contextsClosed += 1; context = null;
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'no-preference', offline: true });
  report.contextsCreated += 1;
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => report.errors.push(`stamp preference: ${error.message}`));
  page.on('request', (request) => { if (/^https?:/.test(request.url())) report.network.push(request.url()); });
  page.on('requestfailed', (request) => report.failedRequests.push({ url: request.url().slice(0, 180), error: request.failure()?.errorText }));
  await startMap(page);
  assert.deepEqual(await saved(page), {}, 'Stamp preference branch must have independent empty storage');
  await observeMotion(page);
  await openCorridor(page);
  await completeCorridor(page);
  await returnToMap(page);
  await page.waitForFunction((id) => document.querySelector('.garden-shell')?.dataset.planting === id, first);
  await page.waitForFunction((id) => window.__mapSignAnimationEvents.some((event) => event.phase === 'end' && event.name === 'garden-sign-stamp' && event.id === id), first);
  assert.equal(await page.locator('.garden-shell').getAttribute('data-planting'), first, 'Stamp boundary check must happen inside the original planting window');
  const stampsBeforePreference = (await animationEvents(page)).filter((event) => event.phase === 'start' && event.name === 'garden-sign-stamp' && event.id === first).length;
  assert.equal(stampsBeforePreference, 1, 'Boundary branch must start and finish one real stamp before changing preference');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  assert.equal((await animationEvents(page)).filter((event) => event.phase === 'start' && event.name === 'garden-sign-stamp' && event.id === first).length, stampsBeforePreference, 'Toggling reduced motion after stamp end replays the same completed stamp');
  assert.equal(await page.locator(`[data-map-node="${first}"] .garden-node-label`).getAttribute('data-stamping'), 'false', 'Consumed stamp became active again inside the same planting window');
  await page.waitForFunction(() => document.querySelector('.garden-shell')?.dataset.planting === '');
  assert.deepEqual(await saved(page), { [first]: 3 }, 'Preference changes altered the legitimately earned completion');
  report.branches.stampPreference = { status: 'passed', description: 'Separate fresh context and four real object clicks: after native stamp end, toggle reduced motion inside the same planting window. Pending sweep cancellation is allowed in this branch.', motionEvents: await events(page), animationEvents: await animationEvents(page) };
  await shot(page, 'stamp-preference-no-replay');
  pass('Separate fresh gameplay branch: reduced motion toggled after native stamp end does not replay the stamp');
  assert.equal(report.errors.length, 0, `Browser errors: ${JSON.stringify(report.errors)}`);
  assert.equal(report.network.length, 0, `Offline artifact attempted network access: ${JSON.stringify(report.network)}`);
  assert.equal(report.failedRequests.length, 0, `Failed requests: ${JSON.stringify(report.failedRequests)}`);
  report.finalSha256 = createHash('sha256').update(fs.readFileSync(html)).digest('hex');
  assert.equal(report.finalSha256, report.sha256, 'Final HTML changed during motion verification');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || error.message; process.exitCode = 1;
  if (page) { report.failureMotionEvents = await events(page).catch(() => []); report.failureAnimationEvents = await animationEvents(page).catch(() => []); await shot(page, 'failure').catch(() => {}); }
  console.error(report.failure);
} finally {
  if (context) { await context.close(); report.contextsClosed += 1; }
  report.contextClosed = report.contextsClosed === report.contextsCreated;
  if (browser) { await browser.close(); report.browserClosed = true; }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), [
    '# 标牌动效：真实通关最终 HTML 验证', '', `- 结果：${report.status}`, `- HTML：${html}`, `- SHA-256：${report.sha256}`,
    '- 全新隔离存储；真实点击楼道四件物品两遍；不注入完成记录、奖励或内部动作。',
    '- 正常分支：完整首次通关、原生扫光/盖章/花苞回应各一次、切图、真实重玩和刷新；奖励演出中不切换动效偏好。',
    '- 偏好边界分支：另一个全新隔离context真实点击四件物品；盖章animationend后、种花结束前切换reduce→normal，确认同一盖章不重播；该分支允许取消待播扫光。',
    '- 检查第一次通关盖章及下一关一次扫光、地图重访、重玩和刷新不重播。',
    '- 真实 pointer down 检查下沉1px，移到空地图区域后释放检查复位且不进关；animationstart 检查实际扫光、盖章与650ms花苞回应。',
    '- 实际滚动验证离屏暂停；后台检查为合成 visibilitychange，非操作系统切换。',
    '- reduced-motion 检查移动动画停止；浏览器 --mute-audio。',
    `- finally：context=${report.contextClosed}（${report.contextsClosed}/${report.contextsCreated}），browser=${report.browserClosed}。`,
    '- physicalDevice: not_run', '- humanAudio: not_run', '',
    ...report.checks.map((check) => `- PASS ${check.name}`),
    ...(report.failure ? ['', '## 失败', '', '```text', report.failure, '```'] : []),
    '', '## 截图', '', ...report.screenshots.map((file) => `- [${file}](${file})`), '',
  ].join('\n'));
}
