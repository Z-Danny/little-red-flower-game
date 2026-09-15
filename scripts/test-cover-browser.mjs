// Dev: BASE_URL=http://127.0.0.1:3000 node scripts/test-cover-browser.mjs
// Offline: OFFLINE_FILE=outputs/本地离线版/小红花应急行动.html node scripts/test-cover-browser.mjs
// Optional: PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, COVER_TEST_OUTPUT.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const offlineFile = process.env.OFFLINE_FILE
  ? path.resolve(root, process.env.OFFLINE_FILE)
  : null;
const mode = offlineFile ? 'offline' : 'dev';
const target = offlineFile
  ? pathToFileURL(offlineFile).href
  : process.env.BASE_URL || 'http://127.0.0.1:3000';
const output = path.resolve(
  root,
  process.env.COVER_TEST_OUTPUT || `docs/animated-cover/verification/${mode}`,
);
const layerNames = [
  'background',
  'title',
  'button-primary',
  'button-secondary',
  'bud',
  'opening',
  'half-open',
  'bloom',
  'falling-leaves',
];
const flowerFrames = ['bud', 'opening', 'half-open', 'bloom'];
const coverCycleMs = 2_800;
const fullBloomFraction = 0.7;
const gameTitle = '这片儿没我不行';
const leafCount = 10;
const report = {
  status: 'running',
  mode,
  target,
  checks: [],
  layouts: [],
  assets: [],
  errors: [],
  network: [],
  browserClosed: false,
  physicalDevice: 'not_run',
  humanAudio: 'not_run',
};
fs.mkdirSync(output, { recursive: true });
const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};

function findPlaywright() {
  const specified = process.env.PLAYWRIGHT_MODULE;
  const candidates = specified
    ? [specified.startsWith('file:') ? fileURLToPath(specified) : specified]
    : [
        'playwright',
        path.join(
          os.homedir(),
          '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
        ),
        'playwright-core',
      ];
  for (const candidate of candidates) {
    try {
      const resolved = require.resolve(
        candidate.startsWith('.') ? path.resolve(candidate) : candidate,
      );
      return { ...require(resolved), modulePath: resolved };
    } catch (error) {
      if (specified) throw error;
    }
  }
  throw new Error('Playwright was not found. Set PLAYWRIGHT_MODULE to its package path.');
}

function findBrowser(chromium) {
  const specified = process.env.BROWSER_EXECUTABLE;
  if (specified) {
    assert(fs.existsSync(specified), `Browser executable does not exist: ${specified}`);
    return specified;
  }
  const candidates = [
    chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean)
      .map((directory) => path.join(directory, 'Google/Chrome/Application/chrome.exe')),
  ];
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  assert(executable, 'Chromium/Chrome was not found. Set BROWSER_EXECUTABLE.');
  return executable;
}

async function openFreshPage(browser, reducedMotion) {
  // A new context has isolated storage and never reads the user's browser profile.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) report.network.push(request.url());
  });
  const response = await page.goto(target, { waitUntil: 'load', timeout: 60_000 });
  if (response) assert(response.ok(), `Page returned HTTP ${response.status()}`);
  await page.locator('[data-title-screen]').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const start = document.querySelector('[data-home-start]');
    return start && !start.disabled;
  });
  await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-home-continue]').count(), 0, 'Fresh storage must show only start, without a continue button');
  await verifyMinimalCover(page, 'fresh');
  return page;
}

async function verifyMinimalCover(page, scenario, playerName) {
  const screen = page.locator('[data-title-screen]');
  assert.equal(await screen.getByRole('heading', { name: gameTitle, exact: true }).count(), 1, `${scenario}: accessible title must use the corrected game name`);
  assert.equal(await screen.getAttribute('aria-label'), `${gameTitle}首页`);
  assert((await page.title()).startsWith(gameTitle), `${scenario}: document title must use the corrected game name`);
  const removedBlocks = '.title-tagline, .title-progress, .title-welcome, .title-resume-hint, .title-footer, .title-tools, .title-board, [data-home-flowers]';
  assert.equal(await screen.locator(removedBlocks).count(), 0, `${scenario}: removed home UI must not exist`);
  const canContinue = (await screen.locator('[data-home-continue]').count()) === 1;
  const expectedControls = canContinue ? 2 : 1;
  assert.equal(await screen.locator('button').count(), expectedControls, `${scenario}: unexpected menu control count`);
  assert.equal(await screen.locator('button[data-home-start], button[data-home-continue]').count(), expectedControls);
  if (canContinue) assert(await screen.locator('[data-home-continue]').isEnabled(), 'A rendered continue action must have a usable journey record');
  assert.equal(await screen.locator('[data-home-start]').innerText(), canContinue ? '重新开始' : '开始游戏');
  if (canContinue) assert.equal(await screen.locator('[data-home-continue]').innerText(), '继续游戏');
  assert.equal(await screen.locator('.title-buttons button svg').count(), 0, `${scenario}: cover menu buttons must never contain an arrow SVG`);
  assert(await screen.locator(canContinue ? '[data-home-continue]' : '[data-home-start]')
    .evaluate((button) => button.classList.contains('title-primary')), `${scenario}: wrong primary menu action`);
  const home = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-home.json'), 'utf8'));
  const text = await screen.textContent();
  for (const removedText of [
    home.tagline, home.emptyHint, home.continueHint, home.footer,
    '完成关卡后，小红花会留在你的地图上', '已收获', playerName,
  ].filter(Boolean)) {
    assert(!text.includes(removedText), `${scenario}: removed text remains: ${removedText}`);
  }
  check(`${scenario} cover shows ${canContinue ? 'continue/restart' : 'only start'} and none of the removed information blocks`);
}

async function verifyAssets(page) {
  const visibleLayerNames = (await page.locator('[data-home-continue]').count()) ? layerNames : layerNames.filter((name) => name !== 'button-secondary');
  const assets = await page.evaluate(async (names) => {
    const results = [];
    const urlsFrom = (value) => [...value.matchAll(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/g)]
      .map((match) => match[1] || match[2] || match[3]);
    for (const name of names) {
      const layer = document.querySelector(`[data-cover-layer="${name}"]`);
      if (!layer) {
        results.push({ layer: name, error: 'missing layer' });
        continue;
      }
      const sources = new Set();
      for (const element of [layer, ...layer.querySelectorAll('*')]) {
        if (element instanceof HTMLImageElement) sources.add(element.currentSrc || element.src);
        for (const pseudo of [null, '::before', '::after']) {
          for (const source of urlsFrom(getComputedStyle(element, pseudo).backgroundImage)) sources.add(source);
        }
      }
      if (!sources.size) results.push({ layer: name, error: 'no image source' });
      for (const source of sources) {
        const image = new Image();
        image.src = source;
        let error;
        try {
          await Promise.race([
            image.decode(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('image decode timed out')), 10_000)),
          ]);
        } catch (failure) {
          error = failure.message;
        }
        results.push({
          layer: name,
          source: source.startsWith('data:') ? source.slice(0, 32) + '…' : source,
          embeddedPng: source.startsWith('data:image/png;'),
          png: source.startsWith('data:image/png;') || /\.png(?:[?#]|$)/i.test(source),
          width: image.naturalWidth,
          height: image.naturalHeight,
          ...(error ? { error } : {}),
        });
      }
    }
    return results;
  }, visibleLayerNames);
  report.assets = assets;
  for (const asset of assets) {
    assert(!asset.error && asset.width > 0 && asset.height > 0 && asset.png, JSON.stringify(asset));
    if (offlineFile) assert(asset.embeddedPng, `Offline layer is not embedded: ${JSON.stringify(asset)}`);
  }
  assert.equal(assets.filter((asset) => asset.layer === 'falling-leaves').length, 1, 'All leaves should share one decoded PNG source');
  check(`${visibleLayerNames.length} visible cover layers decode as PNG${offlineFile ? ' data URLs' : ''}`);
}

async function verifyLayout(page, width, height, returning = false) {
  await page.setViewportSize({ width, height });
  const layout = await page.locator('[data-title-screen]').evaluate((screen) => {
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };
    const controls = [...screen.querySelectorAll('button')].map((button) => ({
      name: button.getAttribute('aria-label') || button.textContent.trim(),
      ...rect(button),
    }));
    const heading = screen.querySelector('header');
    const menu = screen.querySelector('.title-menu');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      screen: rect(screen),
      controls,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      verticalOverflow: document.documentElement.scrollHeight > innerHeight + 1,
      headingOverlapsMenu: heading.getBoundingClientRect().bottom > menu.getBoundingClientRect().top + 1,
    };
  });
  report.layouts.push(layout);
  assert(!layout.horizontalOverflow && !layout.verticalOverflow && !layout.headingOverlapsMenu, JSON.stringify(layout));
  const withinViewport = (rect) => rect.x >= -1 && rect.y >= -1 &&
    rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1;
  assert(withinViewport(layout.screen) && layout.screen.width > 0 && layout.screen.height > 0, JSON.stringify(layout));
  for (const control of layout.controls) {
    assert(control.width >= 44 && control.height >= 44 && withinViewport(control), JSON.stringify(control));
  }
  assert.equal(layout.controls.length, returning ? 2 : 1, 'Fresh players get one start action; returning players get continue/restart');
  if (returning) {
    const [upper, lower] = layout.controls;
    layout.buttonGap = lower.y - upper.y - upper.height;
    assert(layout.buttonGap >= 18 - 0.1, `Returning menu buttons need at least 18px of separation: ${JSON.stringify(layout)}`);
  }
  await page.screenshot({ path: path.join(output, `cover-${returning ? 'returning-' : ''}${width}x${height}.png`) });
  check(`visible ${returning ? 'returning' : 'fresh'} cover and unclipped 44px controls at ${width}x${height}${returning ? ', with at least 18px between buttons' : ''}`);
}

async function verifyReducedMotion(page) {
  const state = await page.locator('[data-cover-flower]').evaluate((flower, frames) => ({
    frames: Object.fromEntries(frames.map((frame) => {
      const element = flower.querySelector(`[data-cover-layer="${frame}"]`);
      return [frame, element ? Number(getComputedStyle(element).opacity) : null];
    })),
    activeAnimations: flower.getAnimations({ subtree: true })
      .filter((animation) => animation.playState === 'running')
      .map((animation) => animation.animationName || animation.id),
  }), flowerFrames);
  assert.equal(state.frames.bloom, 1, JSON.stringify(state));
  for (const frame of flowerFrames.filter((name) => name !== 'bloom')) assert.equal(state.frames[frame], 0, JSON.stringify(state));
  assert.deepEqual(state.activeAnimations, [], JSON.stringify(state));
  check('reduced-motion shows only the fully open flower with no running flower animation');
  const leaves = page.locator('[data-cover-layer="falling-leaves"]');
  assert.equal(await leaves.locator('.title-leaf-flight img').count(), leafCount);
  assert(!(await leaves.isVisible()), 'Reduced motion must completely hide falling leaves');
  const leafAnimations = await leaves.evaluate((layer) => ({
    names: [layer, ...layer.querySelectorAll('*')].map((element) => getComputedStyle(element).animationName),
    active: layer.getAnimations({ subtree: true }).length,
  }));
  assert(leafAnimations.names.every((name) => name === 'none'), JSON.stringify(leafAnimations));
  assert.equal(leafAnimations.active, 0, JSON.stringify(leafAnimations));
  const titleAnimations = await page.locator('.title-heading h1').evaluate((heading) => heading.getAnimations({ subtree: true }).length);
  assert.equal(titleAnimations, 0, 'Reduced motion must disable title floating and glow animations');
  const allAnimations = await page.locator('[data-title-screen]').evaluate((screen) => screen.getAnimations({ subtree: true }).length);
  assert.equal(allAnimations, 0, 'Reduced motion must disable every cover animation, including CTA, title entrance and lake shimmer');
  check(`reduced-motion hides all ${leafCount} leaves and disables all decorative and CTA animations`);
}

async function verifyTitleMotion(page) {
  const state = await page.locator('.title-heading').evaluate(async (heading) => {
    const animations = heading.getAnimations({ subtree: true });
    const saved = animations.map((animation) => ({ animation, time: animation.currentTime, state: animation.playState }));
    const entrance = animations.filter((animation) => animation.effect.getTiming().iterations === 1);
    const idle = animations.filter((animation) => animation.effect.getTiming().iterations === Infinity);
    const readStyle = () => ({
      entrance: getComputedStyle(heading.querySelector('h1')).transform,
      float: getComputedStyle(heading.querySelector('.title-logo-motion')).transform,
      pulse: getComputedStyle(heading.querySelector('.title-logo-stage')).transform,
      glow: getComputedStyle(heading.querySelector('.title-logo-stage')).filter,
      sheen: getComputedStyle(heading.querySelector('.title-logo-sheen')).opacity,
    });
    let initial;
    let moving;
    let settled;
    try {
      for (const animation of animations) animation.pause();
      await Promise.all(animations.map((animation) => animation.ready));
      for (const animation of animations) animation.currentTime = 0;
      await new Promise(requestAnimationFrame);
      initial = readStyle();
      for (const animation of animations) animation.currentTime = 500;
      await new Promise(requestAnimationFrame);
      moving = readStyle();
      for (const animation of entrance) animation.currentTime = Number(animation.effect.getTiming().duration);
      await new Promise(requestAnimationFrame);
      settled = readStyle();
    } finally {
      for (const { animation, time, state } of saved) {
        animation.currentTime = time;
        if (state === 'running') animation.play();
        else if (state === 'finished') animation.finish();
      }
    }
    return {
      entranceCount: entrance.length,
      idleCount: idle.length,
      idleStates: saved.filter(({ animation }) => idle.includes(animation)).map(({ state }) => state),
      initial, moving, settled,
    };
  });
  report.titleAnimation = state;
  assert(state.entranceCount >= 1, 'The title needs a one-time entrance');
  assert(state.idleCount >= 2 && state.idleStates.every((value) => value === 'running'), 'Title float and highlight must run by default');
  assert.notEqual(state.initial.entrance, state.settled.entrance, 'The title must settle from its entrance pose');
  assert.notEqual(state.initial.float, state.moving.float, 'Title must move before the first flower bloom');
  check('title arrives once and continues moving from its initial idle phase');
}

async function verifyChallengeDecorations(page) {
  const state = await page.locator('[data-title-screen]').evaluate(async (screen) => {
    const infinite = screen.getAnimations({ subtree: true })
      .filter((animation) => animation.effect.getTiming().iterations === Infinity);
    const originalPaused = screen.getAttribute('data-cover-paused');
    const groups = ['.title-lake-light', '.title-pollen', '.title-logo-sheen', '.title-primary .title-button-beacon'];
    const decorations = groups.map((selector) => {
      const layer = screen.querySelector(selector);
      return {
        selector,
        exists: !!layer,
        animations: layer?.getAnimations({ subtree: true }).length ?? 0,
        ignoresPointer: layer && [layer, ...layer.querySelectorAll('*')]
          .every((element) => getComputedStyle(element).pointerEvents === 'none'),
      };
    });
    const secondaryAnimations = screen.querySelector('.title-secondary')?.getAnimations({ subtree: true }).length ?? 0;
    let states;
    let timeDeltas;
    try {
      screen.setAttribute('data-cover-paused', 'true');
      await new Promise(requestAnimationFrame);
      await Promise.all(infinite.map((animation) => animation.ready));
      const times = infinite.map((animation) => Number(animation.currentTime));
      await new Promise((resolve) => setTimeout(resolve, 80));
      states = infinite.map((animation) => animation.playState);
      timeDeltas = infinite.map((animation, index) => Number(animation.currentTime) - times[index]);
    } finally {
      if (originalPaused === null) screen.removeAttribute('data-cover-paused');
      else screen.setAttribute('data-cover-paused', originalPaused);
    }
    await new Promise(requestAnimationFrame);
    return { decorations, secondaryAnimations, count: infinite.length, states, timeDeltas, resumed: infinite.map((animation) => animation.playState) };
  });
  report.challengeDecorations = state;
  for (const decoration of state.decorations) {
    assert(decoration.exists && decoration.animations > 0 && decoration.ignoresPointer, JSON.stringify(decoration));
  }
  assert.equal(state.secondaryAnimations, 0, 'Only the primary menu action should attract attention with a beacon/movement');
  assert(state.states.every((value) => value === 'paused'), 'Every ambient animation must pause with the cover');
  assert(state.timeDeltas.every((delta) => Math.abs(delta) < 1), 'Paused ambient animation clocks must stay stationary');
  assert(state.resumed.every((value) => value === 'running'), 'Ambient animation must resume after clearing the pause');
  check('water shimmer, flower pollen, title sheen and primary CTA animate, ignore pointer input and pause/resume together');
}

async function reloadCover(page) {
  // Reload only for persistence/fixture checks. Map navigation uses its real home button.
  await page.reload({ waitUntil: 'load' });
  await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const start = document.querySelector('[data-home-start]');
    return start && !start.disabled;
  });
}

async function returnToCover(page) {
  await page.locator('.garden-shell').waitFor({ state: 'visible' });
  const before = await readSaveBytes(page);
  const home = page.locator('[data-map-home]');
  assert.equal(await home.getAttribute('aria-label'), '返回游戏首页');
  assert(await home.isEnabled(), 'The map home button should be available during normal exploration');
  const bounds = await home.boundingBox();
  assert(bounds && bounds.width >= 44 && bounds.height >= 44, 'The map home target must be at least 44px');
  if (!report.mapHomeScreenshot) {
    report.mapHomeScreenshot = 'map-home-button.png';
    await page.screenshot({ path: path.join(output, report.mapHomeScreenshot) });
  }
  await home.click();
  await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor({ state: 'visible' });
  assert.deepEqual(await readSaveBytes(page), before, 'Returning home must preserve score and bookmark bytes');
  assert.equal(await page.locator('.garden-shell').count(), 0, 'The map must close when its home button is used');
  check('map home control returns to the cover without changing scores or the saved exploration position');
}

async function verifyMapDeparture(page, reduced = false, selector = '[data-home-start]') {
  // Observe real DOM/user action timing without depending on browser wall-clock
  // speed. Rapid events stress the same handler guard as fast repeated taps.
  await page.evaluate((selector) => {
    const cover = document.querySelector('[data-title-screen]');
    const original = Storage.prototype.setItem;
    const labels = () => [...cover.querySelectorAll('button')].map((button) => button.textContent.trim());
    const state = {
      writes: 0, coverWrites: 0, departing: false, allDisabled: true, elapsed: null, duringDepartureWrites: null,
      initialLabels: labels(), departureLabels: [], labelsStable: true, transitionDurations: [],
    };
    const started = performance.now();
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'little-red-flower-journey-location-v1') {
        state.writes++;
        if (cover.isConnected) state.coverWrites++;
      }
      return original.call(this, key, value);
    };
    const observer = new MutationObserver(() => {
      if (cover.isConnected && cover.dataset.coverDeparting === 'true') {
        // Capture inside the page while the cover is still connected. A second
        // Playwright round trip can outlast this short transition on offline HTML.
        if (!state.departing) {
          state.departureLabels = labels();
          state.transitionDurations = cover.getAnimations({ subtree: true })
            .filter((animation) => animation.effect.getTiming().iterations === 1)
            .map((animation) => animation.effect.getTiming().duration);
        }
        state.departing = true;
        state.allDisabled &&= [...cover.querySelectorAll('button')].every((button) => button.disabled);
        state.labelsStable &&= JSON.stringify(labels()) === JSON.stringify(state.initialLabels);
        state.duringDepartureWrites = state.writes;
      }
      if (!cover.isConnected && state.elapsed === null) state.elapsed = performance.now() - started;
    });
    observer.observe(document.body, { subtree: true, attributes: true, childList: true });
    window.__coverDepartureProbe = { state, restore: () => { observer.disconnect(); Storage.prototype.setItem = original; } };
    const button = document.querySelector(selector);
    button.click();
    button.click();
    button.click();
  }, selector);
  try {
    await page.locator('.garden-shell').waitFor({ state: 'visible' });
    const state = await page.evaluate(() => window.__coverDepartureProbe.state);
    report.departures ??= [];
    report.departures.push({ reduced, selector, ...state });
    assert.equal(state.coverWrites, 1, 'Rapid taps must write only one bookmark while the cover is mounted');
    assert.equal(state.departing, !reduced, JSON.stringify(state));
    if (!reduced) {
      assert(state.allDisabled, 'The primary CTA must be locked as departure begins');
      assert(state.transitionDurations.includes(360), 'The cover should play its authored 360ms departure animation');
      assert(state.labelsStable, 'Menu labels must stay unchanged throughout departure');
      assert.deepEqual(state.departureLabels, state.initialLabels, 'Entering the map must not relabel the fading menu');
      assert.equal(state.duringDepartureWrites, 1, 'Rapid taps must write only one bookmark before leaving the title');
    }
    check(reduced ? 'reduced-motion starts the map directly without a departing animation state' : 'start/continue plays a 360ms departure, locks controls and prevents repeated bookmark writes');
  } finally {
    await page.evaluate(() => {
      window.__coverDepartureProbe.restore();
      delete window.__coverDepartureProbe;
    });
  }
}

async function verifyLeafMotion(page) {
  const leaves = page.locator('[data-cover-layer="falling-leaves"]');
  assert(await leaves.isVisible(), 'Falling leaves should be visible with normal motion');
  const state = await leaves.evaluate(async (layer) => {
    const screen = layer.closest('[data-title-screen]');
    const flights = [...layer.querySelectorAll('.title-leaf-flight')];
    const animations = layer.getAnimations({ subtree: true });
    const saved = animations.map((animation) => ({ animation, time: animation.currentTime, state: animation.playState }));
    const pointerEvents = [layer, ...layer.querySelectorAll('*')].map((element) => getComputedStyle(element).pointerEvents);
    const sample = async (fraction) => {
      for (const animation of animations) {
        const timing = animation.effect.getTiming();
        const duration = Number(timing.duration);
        const delay = Number(timing.delay);
        // Negative CSS delays stagger the leaves. Seek a later equivalent cycle
        // instead of a negative local time, which puts CSS animations before play.
        const cycle = Math.max(1, Math.ceil(-delay / duration));
        animation.currentTime = delay + duration * (cycle + fraction);
      }
      await new Promise(requestAnimationFrame);
      return flights.map((flight) => {
        const rect = flight.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, transform: getComputedStyle(flight).transform };
      });
    };
    let early;
    let later;
    const originalPaused = screen.getAttribute('data-cover-paused');
    let pausedStates;
    let pausedTimeDeltas;
    try {
      screen.setAttribute('data-cover-paused', 'true');
      await new Promise(requestAnimationFrame);
      const paused = layer.getAnimations({ subtree: true });
      await Promise.all(paused.map((animation) => animation.ready));
      const times = paused.map((animation) => Number(animation.currentTime));
      await new Promise((resolve) => setTimeout(resolve, 80));
      pausedStates = paused.map((animation) => animation.playState);
      pausedTimeDeltas = paused.map((animation, index) => Number(animation.currentTime) - times[index]);
    } finally {
      if (originalPaused === null) screen.removeAttribute('data-cover-paused');
      else screen.setAttribute('data-cover-paused', originalPaused);
    }
    await new Promise(requestAnimationFrame);
    const resumedStates = layer.getAnimations({ subtree: true }).map((animation) => animation.playState);
    try {
      for (const animation of animations) animation.pause();
      await Promise.all(animations.map((animation) => animation.ready));
      early = await sample(0.2);
      later = await sample(0.7);
    } finally {
      for (const { animation, time, state } of saved) {
        animation.currentTime = time;
        if (state === 'running') animation.play();
      }
    }
    const buttonHitTargets = [...screen.querySelectorAll('button')].map((button) => {
      const rect = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    });
    return {
      flightCount: flights.length,
      sizes: flights.map((flight) => getComputedStyle(flight).width),
      durations: flights.map((flight) => getComputedStyle(flight).animationDuration),
      imageCount: layer.querySelectorAll('.title-leaf-flight img').length,
      sourceCount: new Set([...layer.querySelectorAll('img')].map((image) => image.currentSrc || image.src)).size,
      pointerEvents,
      animationCount: animations.length,
      early,
      later,
      pausedStates,
      pausedTimeDeltas,
      resumedStates,
      buttonHitTargets,
    };
  });
  report.leaves = state;
  assert.equal(state.flightCount, leafCount, JSON.stringify(state));
  assert.equal(state.imageCount, leafCount, JSON.stringify(state));
  assert.equal(state.sourceCount, 1, JSON.stringify(state));
  assert(state.animationCount >= leafCount, 'Each leaf flight should be animated');
  assert(new Set(state.sizes).size > 1 && new Set(state.durations).size > 1, 'Near/far leaves should have different sizes and fall speeds');
  assert(state.later.some((leaf, index) => Math.abs(leaf.x - state.early[index].x) > 5), 'Leaf paths should drift sideways with the wind');
  assert(state.pointerEvents.every((value) => value === 'none'), 'Decorative leaves must ignore pointer input');
  for (let index = 0; index < state.flightCount; index++) {
    assert(state.later[index].y > state.early[index].y + 20, `Leaf ${index + 1} must fall downward: ${JSON.stringify(state)}`);
  }
  assert(state.pausedStates.length >= leafCount && state.pausedStates.every((value) => value === 'paused'), 'data-cover-paused must pause every leaf animation');
  assert(state.pausedTimeDeltas.every((delta) => Math.abs(delta) < 1), 'Paused leaf clocks must remain stationary');
  assert(state.resumedStates.every((value) => value === 'running'), 'Leaf animations must resume after clearing the paused attribute');
  assert(state.buttonHitTargets.every(Boolean), 'Leaf decoration must not intercept menu controls');
  check(`${leafCount} shared-texture leaves fall downward, pause/resume with the cover and never intercept menu input`);
}

async function captureFlowerPhase(page, time, filename) {
  const phase = await page.locator('[data-title-screen]').evaluate(async (screen, currentTime) => {
    const animations = screen.getAnimations({ subtree: true })
      .filter((animation) => animation.effect.getTiming().iterations === Infinity &&
        animation.effect.target.matches('[data-cover-flower], [data-cover-flower] *, .title-logo-stage, .title-logo-sheen, .title-motes i'));
    for (const animation of animations) animation.pause();
    await Promise.all(animations.map((animation) => animation.ready));
    for (const animation of animations) animation.currentTime = currentTime;
    await new Promise(requestAnimationFrame);
    const title = getComputedStyle(screen.querySelector('.title-logo-stage'));
    return {
      time: currentTime,
      budOpacity: Number(getComputedStyle(screen.querySelector('[data-cover-layer="bud"]')).opacity),
      bloomOpacity: Number(getComputedStyle(screen.querySelector('[data-cover-layer="bloom"]')).opacity),
      frameOpacities: Object.fromEntries(['bud', 'opening', 'half-open', 'bloom'].map((frame) => [
        frame, Number(getComputedStyle(screen.querySelector(`[data-cover-layer="${frame}"]`)).opacity),
      ])),
      titleFilter: title.filter,
      titleTransform: title.transform,
      cycleDurations: [...new Set(animations.map((animation) => animation.effect.getTiming().duration))],
    };
  }, time);
  if (filename) await page.screenshot({ path: path.join(output, filename) });
  return phase;
}

const readSaveBytes = (page) => page.evaluate(() => ({
  board: localStorage.getItem('little-red-flower-leaderboard-v1'),
  locations: localStorage.getItem('little-red-flower-journey-location-v1'),
}));

async function answerNewGameConfirmation(page, accept) {
  const pendingDialog = page.waitForEvent('dialog');
  const pendingClick = page.locator('[data-home-start]').click({ force: true });
  const dialog = await pendingDialog;
  assert.equal(dialog.type(), 'confirm');
  assert(dialog.message().includes('其他玩家'), 'Reset confirmation must explain the scope');
  await (accept ? dialog.accept() : dialog.dismiss());
  await pendingClick;
}

async function startWithoutConfirmation(page) {
  const dialogs = [];
  const dismissals = [];
  const dismissUnexpected = (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    dismissals.push(dialog.dismiss());
  };
  page.on('dialog', dismissUnexpected);
  try {
    await page.locator('[data-home-start]').click({ force: true });
    await Promise.all(dismissals);
    assert.deepEqual(dialogs, [], 'Starting without any completed levels must not ask for confirmation');
    await page.locator('.garden-shell').waitFor({ state: 'visible' });
  } finally {
    page.off('dialog', dismissUnexpected);
  }
}

async function verifyZeroFlowerJourney(page) {
  const fresh = await readSaveBytes(page);
  await verifyMapDeparture(page, true);
  assert.equal(await page.locator('[data-wallet]').innerText(), '0');
  assert.equal((await readSaveBytes(page)).board, fresh.board, 'First map entry must not rewrite the player record');
  await returnToCover(page);
  assert(await page.locator('[data-home-continue]').isEnabled(), 'Exploring the map must enable continue even with zero flowers');
  await verifyMinimalCover(page, 'zero-flower-explorer');

  await reloadCover(page);
  assert(await page.locator('[data-home-continue]').isEnabled());
  await verifyMinimalCover(page, 'zero-flower-explorer-after-reload');
  await page.locator('[data-home-continue]').click({ force: true });
  await page.locator('.garden-shell').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-wallet]').innerText(), '0');
  assert.equal((await readSaveBytes(page)).board, fresh.board);
  await returnToCover(page);
  const beforeRestart = await readSaveBytes(page);

  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let boardWrites = 0;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'little-red-flower-leaderboard-v1') boardWrites++;
      return original.call(this, key, value);
    };
    window.__coverSaveProbe = { read: () => boardWrites, restore: () => { Storage.prototype.setItem = original; } };
  });
  try {
    await startWithoutConfirmation(page);
    assert.equal(await page.locator('[data-wallet]').innerText(), '0');
    assert.equal((await readSaveBytes(page)).board, beforeRestart.board, 'Zero-flower restart must preserve board bytes');
    assert.equal(await page.evaluate(() => window.__coverSaveProbe.read()), 0, 'Zero-flower restart must not call the leaderboard storage writer');
  } finally {
    await page.evaluate(() => {
      window.__coverSaveProbe.restore();
      delete window.__coverSaveProbe;
    });
  }
  check('zero-flower map exploration survives reload, enables continue and restarts without confirmation or leaderboard writes');
}

async function verifyBookmarkStorageEvents(page) {
  const before = await readSaveBytes(page);
  const firstRegion = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8')).regions[0];
  const firstLevelId = firstRegion.nodes[0].id;
  const lockedLevelId = firstRegion.nodes.find((node) => node.unlockAfter !== null)?.id;
  assert(lockedLevelId, 'The bookmark fixture needs a known locked node');
  const setBookmark = async (entry, otherPlayer = false) => {
    await page.evaluate(async ({ entry, otherPlayer }) => {
      const key = 'little-red-flower-journey-location-v1';
      const board = JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1'));
      const oldValue = localStorage.getItem(key);
      const newValue = JSON.stringify({ [otherPlayer ? 'cover-unrelated-player' : board.activePlayerId]: entry });
      localStorage.setItem(key, newValue);
      window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, storageArea: localStorage, url: location.href }));
      await new Promise(requestAnimationFrame);
    }, { entry, otherPlayer });
  };
  for (const [scenario, entry, otherPlayer] of [
    ['another-player-bookmark', { levelId: firstLevelId, visitedAt: 1 }, true],
    ['unknown-level-bookmark', { levelId: 'cover-missing-level', visitedAt: 1 }, false],
    ['invalid-time-bookmark', { levelId: firstLevelId, visitedAt: 0 }, false],
    ['locked-level-without-progress', { levelId: lockedLevelId, visitedAt: 1 }, false],
  ]) {
    await setBookmark(entry, otherPlayer);
    assert.equal(await page.locator('[data-home-continue]').count(), 0, `${scenario} must not masquerade as current-player exploration`);
    await verifyMinimalCover(page, scenario);
  }
  await setBookmark({ levelId: firstLevelId, visitedAt: 1 });
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-home-continue]');
    return button && !button.disabled;
  });
  await verifyMinimalCover(page, 'valid-zero-flower-bookmark-storage-event');
  await page.evaluate(() => {
    localStorage.removeItem('little-red-flower-journey-location-v1');
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage, url: location.href }));
  });
  await page.waitForFunction(() => !document.querySelector('[data-home-continue]'));
  await verifyMinimalCover(page, 'cleared-bookmark-storage-event');
  assert.equal((await readSaveBytes(page)).board, before.board);
  check('only valid current-player exploration or scores enable continue; invalid/foreign bookmarks and cross-tab deletion keep start-only state');
}

async function verifyStaleResetFailure(page, before, otherId) {
  // Emulate a different tab committing a player switch while the native
  // confirmation is open. The callback's saved player id must be rejected.
  await page.evaluate((otherId) => {
    const original = window.confirm;
    window.__coverRestoreConfirm = () => { window.confirm = original; };
    window.confirm = (message) => {
      const accepted = original.call(window, message);
      if (accepted) {
        const key = 'little-red-flower-leaderboard-v1';
        const board = JSON.parse(localStorage.getItem(key));
        board.activePlayerId = otherId;
        localStorage.setItem(key, JSON.stringify(board));
      }
      return accepted;
    };
  }, otherId);
  try {
    await answerNewGameConfirmation(page, true);
    await page.locator('[data-title-screen] [role="alert"]').waitFor({ state: 'visible' });
    assert.notEqual(await page.locator('[data-title-screen]').getAttribute('data-cover-departing'), 'true');
    const after = await readSaveBytes(page);
    assert.deepEqual(JSON.parse(after.board).players, JSON.parse(before.board).players);
    assert.equal(after.locations, before.locations);
    check('a concurrent player switch during reset confirmation reports the stale-player error without clearing saves or departing');
  } finally {
    await page.evaluate((before) => {
      window.__coverRestoreConfirm();
      delete window.__coverRestoreConfirm;
      localStorage.setItem('little-red-flower-leaderboard-v1', before.board);
      localStorage.setItem('little-red-flower-journey-location-v1', before.locations);
    }, before);
    await reloadCover(page);
  }
}

async function verifyReturningPlayer(page) {
  const ids = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8'))
    .regions.flatMap((region) => region.nodes.map((node) => node.id));
  assert(ids.length >= 3, 'Save fixture requires at least three journey nodes');
  // Explicit legacy-save fixture in this isolated context; no completion was earned by this test.
  await page.evaluate((levelIds) => {
    const key = 'little-red-flower-leaderboard-v1';
    const board = JSON.parse(localStorage.getItem(key));
    const current = board.players.find((player) => player.id === board.activePlayerId);
    current.name = '首页回归玩家';
    current.completed = Object.fromEntries(levelIds.slice(0, 3).map((id, index) => [id, index === 2 ? 2 : 3]));
    board.players.push({
      id: 'cover-other-player',
      name: '保留的玩家',
      region: '青岛',
      createdAt: 2,
      completed: { 'oil-fire': 3, 'charging-bedroom': 3 },
    });
    localStorage.setItem(key, JSON.stringify(board));
    localStorage.setItem('little-red-flower-journey-location-v1', JSON.stringify({
      [current.id]: { levelId: levelIds[2], visitedAt: 1 },
      'cover-other-player': { levelId: 'charging-bedroom', visitedAt: 2 },
    }));
  }, ids);
  await reloadCover(page);
  assert(await page.locator('[data-home-continue]').isEnabled());
  assert(await page.locator('[data-home-continue]').evaluate((button) => button.classList.contains('title-primary')));
  assert.equal(await page.locator('[data-home-continue] [data-cover-layer="button-primary"]').count(), 1);
  await verifyMinimalCover(page, 'returning-player', '首页回归玩家');
  await verifyAssets(page);
  await verifyLayout(page, 320, 568, true);
  await verifyLayout(page, 390, 844, true);
  const before = await readSaveBytes(page);
  const saved = JSON.parse(before.board);
  const savedLocations = JSON.parse(before.locations);
  const currentId = saved.activePlayerId;
  const current = saved.players.find((player) => player.id === currentId);
  const other = saved.players.find((player) => player.id === 'cover-other-player');
  await page.screenshot({ path: path.join(output, 'cover-returning-390x844.png') });
  check('legacy save enables the primary continue button without exposing player or flower information on the cover');

  await page.locator('[data-home-continue]').click({ force: true });
  await page.locator('.garden-shell').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-wallet]').innerText(), '8');
  assert.deepEqual(JSON.parse((await readSaveBytes(page)).board), saved);
  check('continue enters the map with the same eight flowers and completion records');

  await returnToCover(page);
  await verifyMinimalCover(page, 'returning-from-map', current.name);

  const beforeCancel = await readSaveBytes(page);
  await answerNewGameConfirmation(page, false);
  assert.deepEqual(await readSaveBytes(page), beforeCancel);
  assert(await page.locator('[data-title-screen]').isVisible());
  assert.notEqual(await page.locator('[data-title-screen]').getAttribute('data-cover-departing'), 'true');
  check('canceling new game preserves all player and bookmark bytes and does not start departure');

  await verifyStaleResetFailure(page, beforeCancel, other.id);

  await answerNewGameConfirmation(page, true);
  await page.locator('.garden-shell').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-wallet]').innerText(), '0');
  const after = await readSaveBytes(page);
  const reset = JSON.parse(after.board);
  const locations = JSON.parse(after.locations);
  assert.equal(reset.activePlayerId, currentId);
  assert.equal(reset.players.length, saved.players.length);
  assert.deepEqual(reset.players.find((player) => player.id === currentId), { ...current, completed: {} });
  assert.deepEqual(reset.players.find((player) => player.id === other.id), other);
  assert.equal(locations[currentId].levelId, ids[0]);
  assert.deepEqual(locations[other.id], savedLocations[other.id]);
  check('confirmed new game clears only current progress, retains the profile and preserves the other player/bookmark');

  // Switch only the active-player fixture in this isolated browser context.
  // The production map no longer exposes a leaderboard/player-switch toolbar.
  await page.evaluate((otherId) => {
    const key = 'little-red-flower-leaderboard-v1';
    const state = JSON.parse(localStorage.getItem(key));
    state.activePlayerId = otherId;
    localStorage.setItem(key, JSON.stringify(state));
  }, other.id);
  await reloadCover(page);
  await verifyMinimalCover(page, 'other-returning-player', other.name);
  await page.locator('[data-home-continue]').click({ force: true });
  await page.locator('.garden-shell').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-wallet]').innerText(), '6');
  assert.deepEqual(JSON.parse((await readSaveBytes(page)).board).players, reset.players);
  check('the preserved other player can still continue their own six-flower save');
}

let browser;
let page;
try {
  if (offlineFile) report.sha256 = createHash('sha256').update(fs.readFileSync(offlineFile)).digest('hex');
  const { chromium, modulePath } = findPlaywright();
  const executablePath = findBrowser(chromium);
  report.runtime = { playwright: modulePath, browser: executablePath };
  browser = await chromium.launch({ headless: true, executablePath, args: ['--mute-audio'] });

  page = await openFreshPage(browser, 'reduce');
  check('fresh isolated storage shows only the start button');
  await verifyAssets(page);
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [1440, 900]]) {
    await verifyLayout(page, width, height);
    await verifyReducedMotion(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await verifyBookmarkStorageEvents(page);
  await verifyZeroFlowerJourney(page);
  await page.context().close();

  page = await openFreshPage(browser, 'no-preference');
  // CSS pause/resume must be checked before any WAAPI sampling: play()
  // overrides later CSS animation-play-state changes on that animation object.
  await verifyChallengeDecorations(page);
  await verifyTitleMotion(page);
  await verifyLeafMotion(page);
  const flower = page.locator('[data-cover-flower]');
  const initial = await flower.evaluate((element) => element.getAnimations({ subtree: true })
    .filter((animation) => animation.effect.getTiming().iterations === Infinity)
    .map((animation) => ({
      name: animation.animationName || animation.id,
      currentTime: Number(animation.currentTime),
      duration: Number(animation.effect.getTiming().duration),
      delay: Number(animation.effect.getTiming().delay),
      playState: animation.playState,
    })));
  assert(initial.length > 0 && initial.every((animation) => animation.playState === 'running'), JSON.stringify(initial));
  const cycleTime = Math.max(...initial.map((animation) => animation.duration + Math.max(0, animation.delay)));
  assert.equal(cycleTime, coverCycleMs, 'The forward flower loop should keep its faster 2.8-second rhythm');
  const bud = await captureFlowerPhase(page, 0, 'flower-bud.png');
  const bloom = await captureFlowerPhase(page, cycleTime * fullBloomFraction, 'flower-bloom.png');
  assert.deepEqual(bud.cycleDurations, [cycleTime], 'Cover decorations should share the forward flower cycle');
  assert.equal(bud.budOpacity, 1, JSON.stringify(bud));
  assert.equal(bud.bloomOpacity, 0, JSON.stringify(bud));
  assert(Math.abs(bloom.bloomOpacity - 1) < 0.001, JSON.stringify(bloom));
  assert.equal(bloom.budOpacity, 0, JSON.stringify(bloom));
  assert.notEqual(bloom.titleFilter, bud.titleFilter, 'Title glow must change when the flower blooms');
  assert.notEqual(bloom.titleTransform, bud.titleTransform, 'Title scale must change when the flower blooms');
  check('seeked bud/bloom screenshots show the flower and title glow/scale changing together');
  const forward = [];
  for (const percent of [0, 6, 16, 26, 37, 48, 59, 70, 85, 95, 99.9]) {
    forward.push(await captureFlowerPhase(page, cycleTime * percent / 100));
  }
  for (const [fraction, frame] of [[0.26, 'opening'], [0.48, 'half-open']]) {
    const peak = forward.find((phase) => Math.abs(phase.time - cycleTime * fraction) < 0.001);
    assert(peak && peak.frameOpacities[frame] > 0.999, `The ${frame} stage should finish before the short bloom hold`);
  }
  const dominantFrames = [];
  for (const phase of forward) {
    const ranked = Object.entries(phase.frameOpacities).sort((a, b) => b[1] - a[1]);
    assert(ranked[0][1] >= 0.45, `The flower must remain visible throughout forward opening: ${JSON.stringify(phase)}`);
    if (dominantFrames.at(-1) !== ranked[0][0]) dominantFrames.push(ranked[0][0]);
    if (phase.time >= cycleTime * fullBloomFraction) {
      assert(Math.abs(phase.bloomOpacity - 1) < 0.001, 'The flower should remain fully open during its short 0.84-second hold');
      for (const frame of ['bud', 'opening', 'half-open']) assert(phase.frameOpacities[frame] < 0.001, 'Open petals must not run backward through earlier frames');
    }
  }
  assert.deepEqual(dominantFrames, ['bud', 'opening', 'half-open', 'bloom'], 'Each cycle must only move forward through the flower frames');
  const restarted = await captureFlowerPhase(page, cycleTime + 1);
  assert.equal(restarted.budOpacity, 1, 'The next cycle should restart directly from the bud');
  assert.equal(restarted.bloomOpacity, 0, 'The new cycle should not reverse the old flower');
  check('flower opens forward on a 2.8-second loop, briefly holds full bloom, then starts the next bud without closing frames');
  await page.locator('[data-title-screen]').evaluate((screen) => {
    for (const animation of screen.getAnimations({ subtree: true })) {
      if (animation.effect.getTiming().iterations !== Infinity ||
        !animation.effect.target.matches('[data-cover-flower], [data-cover-flower] *, .title-logo-stage, .title-logo-sheen, .title-motes i')) continue;
      animation.currentTime = 0;
      animation.play();
    }
  });
  // Let the authored animation really cross a cycle boundary; do not replace its timing.
  await page.waitForTimeout(cycleTime + 250);
  const looping = await flower.evaluate((element) => element.getAnimations({ subtree: true })
    .filter((animation) => animation.effect.getTiming().iterations === Infinity)
    .map((animation) => ({
      name: animation.animationName || animation.id,
      currentIteration: animation.effect.getComputedTiming().currentIteration,
      playState: animation.playState,
    })));
  report.animation = { initial, cycleTime, phases: { bud, bloom, forward, restarted }, dominantOpeningFrames: dominantFrames, afterCycle: looping };
  assert.equal(looping.length, initial.length, JSON.stringify(looping));
  assert(looping.every((animation) => animation.playState === 'running' && animation.currentIteration >= 1), JSON.stringify(looping));
  await verifyMapDeparture(page);
  await returnToCover(page);
  await verifyMapDeparture(page, false, '[data-home-continue]');
  check('flower animation repeats naturally, and both start and continue enter the map');
  await page.context().close();

  page = await openFreshPage(browser, 'reduce');
  await verifyReturningPlayer(page);

  assert.deepEqual(report.errors, [], 'Browser runtime errors');
  if (offlineFile) assert.deepEqual(report.network, [], 'Offline HTML attempted network requests');
  check(`no browser runtime errors${offlineFile ? ' or network requests' : ''}`);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  process.exitCode = 1;
  console.error(error);
  await page?.screenshot({ path: path.join(output, 'FAIL.png') }).catch(() => {});
} finally {
  if (browser) {
    await browser.close();
    report.browserClosed = true;
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${path.join(output, 'report.json')}`);
}
