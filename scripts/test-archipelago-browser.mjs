// Final offline-artifact navigation QA: real pointer/keyboard inputs, isolated storage.
// Usage: node scripts/test-archipelago-browser.mjs --html /absolute/final.html
// Optional: OFFLINE_HTML, ARCHIPELAGO_TEST_OUTPUT, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE.
// Never injects scores or completion data. Audio reaches a muted browser only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const htmlIndex = process.argv.indexOf('--html');
if (htmlIndex >= 0)
  assert(process.argv[htmlIndex + 1], '--html requires a file path');
const html = path.resolve(
  root,
  (htmlIndex >= 0 ? process.argv[htmlIndex + 1] : process.env.OFFLINE_HTML) ||
    'outputs/本地离线版/小红花应急行动.html',
);
const output = path.resolve(
  root,
  process.env.ARCHIPELAGO_TEST_OUTPUT || 'outputs/archipelago-verification',
);
const categories = JSON.parse(
  fs.readFileSync(path.join(root, 'content/journey-categories.json'), 'utf8'),
).categories;
const map = JSON.parse(
  fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8'),
);
const oldNavigationTests = [
  'test-journey-music-browser.mjs',
  'test-audio-feedback-browser.mjs',
  'test-map-corner-storybook-browser.mjs',
  'test-map-signs-browser.mjs',
  'test-painted-ui-browser.mjs',
  'test-single-entry-browser.mjs',
  'test-map-sign-motion-browser.mjs',
  'test-map-fan-browser.mjs',
];
const report = {
  status: 'running',
  html,
  sha256: null,
  browser: null,
  checks: [],
  layouts: [],
  timelines: [],
  screenshots: [],
  errors: [],
  consoleErrors: [],
  network: [],
  failedRequests: [],
  storage:
    'Fresh isolated contexts. Only the reduced-motion context seeds existing music/interface mute preferences; no gameplay progress is injected.',
  legacyNavigationTests: oldNavigationTests.map((file) => ({
    file: `scripts/${file}`,
    containsOldFanSelectors: /data-fan-category|data-map-fan-options/.test(
      fs.readFileSync(path.join(root, 'scripts', file), 'utf8'),
    ),
  })),
  physicalDevice: 'not_run',
  humanListening: 'not_run',
  nonzeroSafeArea: 'not_run',
  contextsClosed: [],
  browserClosed: false,
};
fs.mkdirSync(output, { recursive: true });
const pass = (name, details = {}) => {
  report.checks.push({ name, status: 'passed', ...details });
  console.log('PASS', name);
};
let browser;

function playwrightModule() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    process.env.PLAYWRIGHT_PATH,
    'playwright',
    path.join(
      os.homedir(),
      '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
    ),
    'playwright-core',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(
        candidate.startsWith('file:') ? fileURLToPath(candidate) : candidate,
      );
    } catch {}
  }
  throw new Error('Playwright is unavailable; set PLAYWRIGHT_MODULE.');
}

function browserExecutable(chromium) {
  const candidates = [
    process.env.BROWSER_EXECUTABLE,
    process.env.EDGE_PATH,
    chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  const executable = candidates.find((file) => fs.existsSync(file));
  assert(executable, 'Chromium is unavailable; set BROWSER_EXECUTABLE.');
  return executable;
}

async function screenshot(page, name) {
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(output, filename) });
  report.screenshots.push(filename);
}

async function pointerClick(page, locator) {
  await locator.waitFor({ state: 'visible' });
  const box = await locator.boundingBox();
  assert(box && box.width > 0 && box.height > 0, 'Pointer target has no area');
  // Floating art animates continuously; real coordinates avoid Playwright's
  // element-stability wait while still exercising actual browser hit testing.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const frame = (page) => page.locator('[data-journey-map]');
const archipelago = (page) => page.locator('[data-archipelago]');
const categoryForRegion = (id) =>
  categories.find((category) => category.regionIds.includes(id));
const activeRegion = (page) => frame(page).getAttribute('data-region');
const scrollTop = (page) =>
  page.locator('.garden-scroll').evaluate((element) => element.scrollTop);
const snapshotAudio = (page) =>
  page.locator('.game-page').evaluate((element) => ({
    playing: element.dataset.journeyMusicPlaying === 'true',
    muted: element.dataset.journeyMusicMuted === 'true',
    decoded: element.dataset.journeyMusicDecoded === 'true',
    position: Number(element.dataset.journeyMusicPosition),
    uiMuted: element.dataset.uiAudioMuted === 'true',
    uiPlayed: Number(element.dataset.uiAudioPlayed || 0),
    uiCue: element.dataset.uiAudioCue || '',
    probe: { ...window.__archipelagoAudioProbe },
  }));
const completedSnapshot = (page) =>
  page.evaluate(() => {
    const board = JSON.parse(
      localStorage.getItem('little-red-flower-leaderboard-v1') || 'null',
    );
    return (
      board?.players.map((player) => ({
        id: player.id,
        completed: player.completed,
      })) || []
    );
  });

async function installProbes(context, muted) {
  await context.addInitScript(
    ({ muted }) => {
      if (muted) {
        localStorage.setItem('red-flower:journey-music-muted', 'true');
        localStorage.setItem('red-flower:interface-muted', 'true');
      }
      const probe = (window.__archipelagoAudioProbe = {
        contexts: 0,
        starts: 0,
        active: 0,
        maxActive: 0,
        duration: 0,
      });
      const NativeAudioContext = window.AudioContext;
      if (NativeAudioContext)
        window.AudioContext = class extends NativeAudioContext {
          constructor(...args) {
            super(...args);
            probe.contexts++;
            const create = this.createBufferSource.bind(this);
            this.createBufferSource = (...args) => {
              const source = create(...args),
                start = source.start.bind(source),
                stop = source.stop.bind(source);
              let tracked = false;
              const retire = () => {
                if (tracked) {
                  probe.active--;
                  tracked = false;
                }
              };
              source.start = (...args) => {
                const result = start(...args);
                if (source.loop && source.buffer?.duration > 20) {
                  tracked = true;
                  probe.starts++;
                  probe.active++;
                  probe.maxActive = Math.max(probe.maxActive, probe.active);
                  probe.duration =
                    (source.loopEnd || source.buffer.duration) -
                    source.loopStart;
                }
                return result;
              };
              source.stop = (...args) => {
                const result = stop(...args);
                if (!args.length || args[0] <= this.currentTime) retire();
                return result;
              };
              source.addEventListener('ended', retire);
              return source;
            };
          }
        };
      window.__archipelagoTimeline = [];
      let last = '';
      const sample = () => {
        const surface = document.querySelector('[data-archipelago]');
        const flag = document.querySelector('[data-archipelago-flag]');
        const entry = {
          region:
            document
              .querySelector('[data-journey-map]')
              ?.getAttribute('data-region') || '',
          open: !!surface,
          phase: surface?.getAttribute('data-phase') || '',
          current: surface?.getAttribute('data-current-category') || '',
          target: surface?.getAttribute('data-target-category') || '',
          flag: flag?.getAttribute('data-flag-category') || '',
        };
        const signature = JSON.stringify(entry);
        if (signature !== last) {
          last = signature;
          window.__archipelagoTimeline.push({
            at: performance.now(),
            ...entry,
          });
        }
      };
      new MutationObserver(sample).observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          'data-region',
          'data-phase',
          'data-current-category',
          'data-target-category',
          'data-flag-category',
        ],
      });
    },
    { muted },
  );
}

async function openMap(page) {
  await page.goto(pathToFileURL(html).href, {
    waitUntil: 'load',
    timeout: 60000,
  });
  await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor();
  assert.equal(
    await page.evaluate(() => window.__archipelagoAudioProbe.contexts),
    0,
    'Audio must remain gesture-gated',
  );
  await pointerClick(page, page.locator('[data-home-start]'));
  await frame(page).waitFor();
  await page.locator('.garden-map-art').evaluate((image) => image.decode());
  await page.waitForTimeout(250);
}

async function openArchipelago(page) {
  const category = categoryForRegion(await activeRegion(page));
  assert(category, 'Current map has a valid category');
  await pointerClick(page, page.locator('[data-map-fan-toggle]'));
  await archipelago(page).waitFor({ state: 'visible' });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-archipelago]')?.dataset.phase === 'idle',
  );
  assert.equal(
    await archipelago(page).getAttribute('data-current-category'),
    category.id,
  );
  assert.equal(
    await page
      .locator('[data-archipelago-flag]')
      .getAttribute('data-flag-category'),
    category.id,
  );
  assert.equal(
    await page.locator('[data-map-fan-options]').count(),
    0,
    'Old circular selector must be absent',
  );
  assert.equal(await page.locator('[data-island]').count(), 3);
  await archipelago(page)
    .locator('img')
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode())),
    );
  return category;
}

async function waitMap(page, category) {
  await archipelago(page).waitFor({ state: 'detached' });
  await page
    .locator(`[data-journey-map][data-region="${category.regionIds[0]}"]`)
    .waitFor();
  await page.waitForFunction(() => {
    const node = document
      .querySelector('[data-map-node][data-status="available"]')
      ?.getBoundingClientRect();
    const shell = document
      .querySelector('[data-journey-map]')
      ?.getBoundingClientRect();
    return (
      node && shell && node.top >= shell.top && node.bottom <= shell.bottom
    );
  });
  await page.waitForTimeout(150);
}

async function checkAvailableFocus(page, category) {
  const expected = map.regions
    .find((region) => region.id === category.regionIds[0])
    .nodes.find((node) => !node.unlockAfter);
  const current = page
    .locator('[data-map-node][data-status="available"]')
    .first();
  assert.equal(
    await current.getAttribute('data-map-node'),
    expected.id,
    'Fresh category focuses its first playable node',
  );
  const node = await current.boundingBox(),
    shell = await frame(page).boundingBox();
  assert(
    node &&
      shell &&
      node.y >= shell.y &&
      node.y + node.height <= shell.y + shell.height,
    'Available node is visible after switching',
  );
}

async function checkLayout(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(180);
  const layout = await archipelago(page).evaluate((element) => {
    const rect = (node) => node.getBoundingClientRect().toJSON();
    const shell = element.closest('.garden-shell');
    const lineInfo = (node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const lines = [...range.getClientRects()].filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );
      const tops = [...new Set(lines.map((rect) => Math.round(rect.top)))];
      return {
        text: node.textContent.trim(),
        box: rect(node),
        lineCount: tops.length,
        whiteSpace: getComputedStyle(node).whiteSpace,
        fontSize: getComputedStyle(node).fontSize,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      };
    };
    return {
      shell: shell ? rect(shell) : null,
      surface: rect(element),
      heading: rect(
        element.querySelector('[data-archipelago-title]') ||
          element.querySelector('h1,h2'),
      ),
      back: rect(element.querySelector('[data-archipelago-back]')),
      islands: [...element.querySelectorAll('[data-island]')].map((button) => ({
        id: button.dataset.island,
        box: rect(button),
        art: rect(
          button.querySelector('[data-island-art]') ||
            button.querySelector('img'),
        ),
        title: lineInfo(
          button.querySelector('[data-island-title]') ||
            button.querySelector('span'),
        ),
      })),
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      overflowY: document.documentElement.scrollHeight > innerHeight + 1,
      images: [...element.querySelectorAll('img')].map((image) => ({
        embedded: image.src.startsWith('data:image/'),
        width: image.naturalWidth,
        height: image.naturalHeight,
      })),
    };
  });
  const inside = (box, boundary, slack = 1) =>
    box.x >= boundary.x - slack &&
    box.y >= boundary.y - slack &&
    box.right <= boundary.right + slack &&
    box.bottom <= boundary.bottom + slack;
  const overlaps = (a, b) =>
    Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1;
  assert(layout.shell, 'Archipelago must use the shared garden-shell viewport');
  assert.equal(layout.overflowX, false);
  assert.equal(layout.overflowY, false);
  assert(
    inside(layout.surface, layout.shell),
    'Archipelago stays in the shared frame',
  );
  assert(
    inside(layout.heading, layout.surface) &&
      inside(layout.back, layout.surface),
    'Heading and back remain visible',
  );
  assert(
    !overlaps(layout.heading, layout.back),
    'Heading and back must not overlap',
  );
  const spread = (values) => Math.max(...values) - Math.min(...values);
  const equalSize = {
    widthSpread: spread(layout.islands.map((island) => island.box.width)),
    heightSpread: spread(layout.islands.map((island) => island.box.height)),
    artWidthSpread: spread(layout.islands.map((island) => island.art.width)),
    artHeightSpread: spread(layout.islands.map((island) => island.art.height)),
  };
  for (const [dimension, difference] of Object.entries(equalSize)) {
    assert(
      difference <= 1,
      `${width}x${height}: all three island ${dimension} must be within 1px, received ${difference.toFixed(3)}px`,
    );
  }
  const center = (island) => ({
    x: island.box.x + island.box.width / 2,
    y: island.box.y + island.box.height / 2,
  });
  const nature = layout.islands.find((island) => island.id === 'nature');
  const publicIsland = layout.islands.find((island) => island.id === 'public');
  const home = layout.islands.find((island) => island.id === 'home');
  const centers = {
    nature: center(nature),
    public: center(publicIsland),
    home: center(home),
  };
  const horizontalMiddle = layout.surface.x + layout.surface.width / 2;
  assert(
    Math.abs(centers.nature.x - horizontalMiddle) <= 2 &&
      Math.abs(centers.nature.x - (centers.public.x + centers.home.x) / 2) <= 2,
    'Natural-disaster island is centered above the lower two islands',
  );
  assert(
    centers.public.x < centers.nature.x && centers.home.x > centers.nature.x,
    'Public island is lower-left and home island is lower-right',
  );
  assert(
    centers.nature.y + nature.box.height * 0.2 < centers.public.y &&
      centers.nature.y + nature.box.height * 0.2 < centers.home.y &&
      Math.abs(publicIsland.box.y - home.box.y) <= 1,
    'The equal-size islands form an upper-center/lower-left/lower-right triangle',
  );
  layout.equalTriangle = { ...equalSize, centers };
  for (const island of layout.islands) {
    assert(
      inside(island.art, layout.surface, 2),
      `${island.id}: artwork is clipped by viewport`,
    );
    assert(
      inside(island.title.box, layout.surface),
      `${island.id}: title is clipped`,
    );
    assert.equal(
      island.title.lineCount,
      1,
      `${island.id}: title must be one line`,
    );
    assert(
      island.title.scrollWidth <= island.title.clientWidth + 1,
      `${island.id}: title text overflows`,
    );
    assert.equal(
      island.title.text.replace(/\s/g, ''),
      categories.find((category) => category.id === island.id).name,
    );
    assert(
      !overlaps(island.art, layout.heading) &&
        !overlaps(island.art, layout.back),
      `${island.id}: artwork overlaps header`,
    );
    assert(
      island.box.width >= 44 && island.box.height >= 44,
      `${island.id}: tap target is too small`,
    );
    for (const other of layout.islands.filter(
      (other) => other.id !== island.id,
    )) {
      assert(
        !overlaps(island.art, other.title.box),
        `${island.id}: artwork collides with ${other.id} title`,
      );
      assert(
        !overlaps(island.title.box, other.title.box),
        `${island.id}: island titles collide`,
      );
    }
  }
  assert(
    layout.images.every(
      (image) => image.embedded && image.width > 0 && image.height > 0,
    ),
    'All displayed artwork must decode from the offline file',
  );
  report.layouts.push({ width, height, ...layout });
  await screenshot(page, `archipelago-${width}x${height}`);
  pass(`Complete islands and single-line titles fit ${width}x${height}`);
  pass(
    `Three equal-size islands form a triangle at ${width}x${height}`,
    layout.equalTriangle,
  );
}

async function timelineSince(page, index) {
  return page.evaluate(
    (index) => window.__archipelagoTimeline.slice(index),
    index,
  );
}

async function checkMotion(page) {
  const snapshot = () =>
    archipelago(page).evaluate((element) => ({
      clouds: [...element.querySelectorAll('[data-archipelago-cloud]')].map(
        (node) => ({
          transform: getComputedStyle(node).transform,
          x: node.getBoundingClientRect().x,
          y: node.getBoundingClientRect().y,
        }),
      ),
      islands: [...element.querySelectorAll('[data-island-art]')].map(
        (node) => ({
          transform: getComputedStyle(node).transform,
          x: node.getBoundingClientRect().x,
          y: node.getBoundingClientRect().y,
        }),
      ),
      running: element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.playState === 'running')
        .map((animation) => ({
          name: animation.animationName || '',
          duration: animation.effect.getTiming().duration,
        })),
    }));
  const before = await snapshot();
  await page.waitForTimeout(450);
  const after = await snapshot();
  assert(
    before.clouds.length >= 2,
    'Separate drifting cloud layers are present',
  );
  assert(
    before.islands.length === 3,
    'Three island artwork layers are present',
  );
  assert(
    before.clouds.some(
      (cloud, index) =>
        Math.abs(cloud.x - after.clouds[index].x) +
          Math.abs(cloud.y - after.clouds[index].y) >
        0.1,
    ),
    'Cloud positions drift',
  );
  assert(
    before.islands.some(
      (island, index) => Math.abs(island.y - after.islands[index].y) > 0.1,
    ),
    'Islands float vertically',
  );
  pass('Cloud layers drift and islands float', { before, after });
}

async function navigateWithSequence(
  page,
  category,
  { rapid = false, screenshots = false } = {},
) {
  const source = await activeRegion(page);
  const startIndex = await page.evaluate(
    () => window.__archipelagoTimeline.length,
  );
  const baseline = await page
    .locator(`[data-island="${category.id}"] [data-island-art]`)
    .boundingBox();
  const initialFlag = await page
    .locator('[data-archipelago-flag]')
    .boundingBox();
  const beforeAudio = await snapshotAudio(page);
  const startedAt = Date.now();
  await pointerClick(page, page.locator(`[data-island="${category.id}"]`));
  if (rapid) {
    for (const other of categories.filter((other) => other.id !== category.id))
      await pointerClick(page, page.locator(`[data-island="${other.id}"]`));
  }
  await page.waitForTimeout(95);
  if (screenshots) await screenshot(page, 'selection-01-island-press');
  const pressed = await page
    .locator(`[data-island="${category.id}"] [data-island-art]`)
    .boundingBox();
  assert(
    pressed.width > baseline.width * 1.015,
    'Selected island visibly enlarges',
  );
  assert.equal(
    await activeRegion(page),
    source,
    'Map does not change before flag feedback',
  );
  await page.waitForFunction((target) => {
    const element = document.querySelector('[data-archipelago]');
    return (
      element &&
      ['landing', 'departing'].includes(element.dataset.phase) &&
      document
        .querySelector('[data-archipelago-flag]')
        ?.getAttribute('data-flag-category') === target
    );
  }, category.id);
  const landedFlag = await page
    .locator('[data-archipelago-flag]')
    .boundingBox();
  assert(
    Math.hypot(landedFlag.x - initialFlag.x, landedFlag.y - initialFlag.y) > 25,
    'Flag physically moves to another island',
  );
  if (screenshots) await screenshot(page, 'selection-02-flag-landed');
  assert.equal(
    await activeRegion(page),
    source,
    'Flag arrives before destination map appears',
  );
  await waitMap(page, category);
  const timeline = await timelineSince(page, startIndex);
  const phases = [
    ...new Set(timeline.map((item) => item.phase).filter(Boolean)),
  ];
  assert.deepEqual(
    phases,
    ['selecting', 'landing', 'departing'],
    'Selection phase sequence',
  );
  assert(
    timeline.some(
      (item) =>
        item.open && item.flag === category.id && item.region === source,
    ),
    'Flag reaches the selected island before route change',
  );
  const changedRegions = [
    ...new Set(
      timeline
        .map((item) => item.region)
        .filter((region) => region && region !== source),
    ),
  ];
  assert.deepEqual(
    changedRegions,
    [category.regionIds[0]],
    'Exactly one destination is entered',
  );
  const audio = await snapshotAudio(page);
  assert.equal(
    audio.probe.starts,
    beforeAudio.probe.starts,
    'Map selection must retain its existing music source',
  );
  assert.equal(
    audio.probe.maxActive,
    1,
    'Map music sources must never overlap',
  );
  assert(audio.playing, 'Music remains active throughout selection');
  assert(
    audio.uiPlayed > beforeAudio.uiPlayed,
    'A selection schedules interface sound',
  );
  await checkAvailableFocus(page, category);
  report.timelines.push({
    target: category.id,
    rapid,
    elapsedMs: Date.now() - startedAt,
    initialFlag,
    landedFlag,
    timeline,
  });
  if (screenshots) await screenshot(page, 'selection-03-destination-map');
  pass(
    `${category.id}: press, flag landing, departure, one destination, continuous music${rapid ? ', rapid taps ignored' : ''}`,
  );
}

async function exerciseLevelEntryAfterSwitch(page) {
  const before = await completedSnapshot(page);
  const source = await snapshotAudio(page);
  assert.equal(await activeRegion(page), 'nature');
  await page
    .locator('[data-map-node="typhoon-home"][data-status="available"]')
    .click();
  const intro = page.locator(
    '[data-painted-intro][data-level-id="typhoon-home"]',
  );
  await intro.waitFor({ state: 'visible' });
  assert.equal(
    await intro.evaluate((element) => Boolean(element.closest('[inert]'))),
    false,
    'Map introduction must not inherit inert from the preserved map layer',
  );
  const primary = intro.locator('[data-painted-primary]');
  await primary.waitFor({ state: 'visible' });
  await screenshot(page, 'navigation-level-introduction');
  // Standard actionability-checked clicks catch inert ancestors and intercepting
  // shades; no forced or synthetic activation is allowed for this regression.
  await primary.click();
  await intro.waitFor({ state: 'detached' });
  const player = page.locator(
    '.hunt-player[data-ready="true"][data-phase="playing"]',
  );
  await player.waitFor({ state: 'visible' });
  await page.waitForFunction(
    () =>
      document.querySelector('.game-page')?.dataset.journeyMusicPlaying ===
      'false',
  );
  await screenshot(page, 'navigation-level-started');
  await player.getByRole('button', { name: '暂停游戏', exact: true }).click();
  await page.getByRole('dialog', { name: '游戏暂停', exact: true }).waitFor();
  await player.getByRole('button', { name: '返回关卡', exact: true }).click();
  await player.waitFor({ state: 'detached' });
  await frame(page).waitFor({ state: 'visible' });
  await page.waitForFunction(
    () =>
      document.querySelector('.game-page')?.dataset.journeyMusicPlaying ===
      'true',
  );
  assert.equal(await activeRegion(page), 'nature');
  const resumed = await snapshotAudio(page);
  assert.equal(
    resumed.probe.maxActive,
    1,
    'Returning from gameplay does not overlap map music sources',
  );
  assert.equal(
    resumed.probe.starts,
    source.probe.starts + 1,
    'Map music resumes once after leaving gameplay',
  );
  await openArchipelago(page);
  await page.locator('[data-archipelago-back]').click();
  await archipelago(page).waitFor({ state: 'detached' });
  assert.deepEqual(
    await completedSnapshot(page),
    before,
    'Abandoning this navigation smoke test must award no progress',
  );
  pass(
    'After switching: real node click opens usable introduction, starts gameplay, returns through pause navigation, and opens islands again',
  );
}

async function exerciseNormal(page) {
  await openMap(page);
  const baselineProgress = await completedSnapshot(page);
  await page.waitForFunction(
    () =>
      document.querySelector('.game-page')?.dataset.journeyMusicPlaying ===
      'true',
  );
  const music = await snapshotAudio(page);
  assert.equal(music.probe.starts, 1);
  assert.equal(music.probe.active, 1);
  const scrollBeforeWheel = await scrollTop(page);
  const scroller = await page.locator('.garden-scroll').boundingBox();
  await page.mouse.move(
    scroller.x + scroller.width * 0.5,
    scroller.y + scroller.height * 0.5,
  );
  await page.mouse.wheel(0, -230);
  await page.waitForTimeout(250);
  const rememberedScroll = await scrollTop(page);
  assert(
    Math.abs(rememberedScroll - scrollBeforeWheel) > 20,
    'Real pointer scrolling changes the map browsing position',
  );
  const originalRegion = await activeRegion(page);
  await openArchipelago(page);
  await checkLayout(page, 390, 844);
  await checkMotion(page);
  await pointerClick(page, page.locator('[data-archipelago-back]'));
  await archipelago(page).waitFor({ state: 'detached' });
  assert.equal(await activeRegion(page), originalRegion);
  assert(
    Math.abs((await scrollTop(page)) - rememberedScroll) <= 2,
    'Back restores the original map scroll position',
  );
  pass(
    'Corner entry opens the complete selector; back preserves the browsed map and scroll',
  );

  await openArchipelago(page);
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [430, 932],
    [520, 960],
    [1440, 900],
  ])
    await checkLayout(page, width, height);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(180);
  await navigateWithSequence(
    page,
    categories.find((category) => category.id === 'public'),
    { rapid: true, screenshots: true },
  );
  await openArchipelago(page);
  const current = categoryForRegion(await activeRegion(page));
  await pointerClick(page, page.locator(`[data-island="${current.id}"]`));
  await waitMap(page, current);
  pass(
    'Reopened page marks the actual current island; tapping it returns to that map',
  );

  await openArchipelago(page);
  await navigateWithSequence(
    page,
    categories.find((category) => category.id === 'home'),
  );
  await openArchipelago(page);
  await navigateWithSequence(
    page,
    categories.find((category) => category.id === 'nature'),
  );

  for (const duringSelection of [false, true]) {
    const fromRegion = await activeRegion(page),
      beforeScroll = await scrollTop(page);
    await openArchipelago(page);
    if (duringSelection)
      await pointerClick(page, page.locator('[data-island="home"]'));
    await page.keyboard.press('Escape');
    await archipelago(page).waitFor({ state: 'detached' });
    await page.waitForTimeout(1250);
    assert.equal(
      await activeRegion(page),
      fromRegion,
      'Escape must cancel delayed navigation',
    );
    assert(Math.abs((await scrollTop(page)) - beforeScroll) <= 2);
    await openArchipelago(page);
    assert.equal(await archipelago(page).getAttribute('data-phase'), 'idle');
    assert.equal(
      await archipelago(page).getAttribute('data-target-category'),
      '',
    );
    await page.keyboard.press('Escape');
    await archipelago(page).waitFor({ state: 'detached' });
    pass(
      `Escape ${duringSelection ? 'during selection clears timers' : 'from idle returns'} without later route change`,
    );
  }
  const finalAudio = await snapshotAudio(page);
  assert.equal(finalAudio.probe.starts, 1);
  assert.equal(finalAudio.probe.maxActive, 1);
  assert.deepEqual(
    await completedSnapshot(page),
    baselineProgress,
    'Navigation must not alter completion or flower awards',
  );
  pass(
    'All three maps accessible with fresh progress; navigation changes no achievements',
  );
  await exerciseLevelEntryAfterSwitch(page);
}

async function exerciseReducedMuted(page) {
  await openMap(page);
  const before = await completedSnapshot(page);
  await openArchipelago(page);
  const animations = await archipelago(page).evaluate((element) =>
    element
      .getAnimations({ subtree: true })
      .filter(
        (animation) =>
          animation.playState === 'running' &&
          animation.effect.getTiming().iterations === Infinity,
      )
      .map((animation) => animation.animationName || 'unnamed'),
  );
  assert.deepEqual(animations, [], 'Reduced motion disables continuous drift');
  await screenshot(page, 'archipelago-320x568-reduced-muted');
  for (const category of categories.filter(
    (category) => category.id !== 'nature',
  )) {
    await pointerClick(page, page.locator(`[data-island="${category.id}"]`));
    await waitMap(page, category);
    await checkAvailableFocus(page, category);
    await openArchipelago(page);
  }
  await pointerClick(page, page.locator('[data-archipelago-back]'));
  await archipelago(page).waitFor({ state: 'detached' });
  const audio = await snapshotAudio(page);
  assert.equal(audio.muted, true);
  assert.equal(audio.uiMuted, true);
  assert.equal(audio.playing, false);
  assert.equal(audio.probe.starts, 0);
  assert.equal(audio.uiPlayed, 0);
  assert.deepEqual(await completedSnapshot(page), before);
  pass(
    '320px reduced-motion mode navigates with inherited music/SFX mute; no audio source or reward injection',
    { audio },
  );
}

try {
  assert(
    fs.existsSync(html),
    'Final offline HTML is missing; export it before running this script.',
  );
  report.sha256 = createHash('sha256')
    .update(fs.readFileSync(html))
    .digest('hex');
  const playwright = playwrightModule();
  browser = await playwright.chromium.launch({
    headless: true,
    executablePath: browserExecutable(playwright.chromium),
    args: ['--mute-audio'],
  });
  report.browser = browser.version();
  for (const scenario of [
    {
      name: 'normal',
      width: 390,
      height: 844,
      reducedMotion: 'no-preference',
      muted: false,
      exercise: exerciseNormal,
    },
    {
      name: 'reduced-muted',
      width: 320,
      height: 568,
      reducedMotion: 'reduce',
      muted: true,
      exercise: exerciseReducedMuted,
    },
  ]) {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      reducedMotion: scenario.reducedMotion,
      deviceScaleFactor: 1,
    });
    let page;
    try {
      await installProbes(context, scenario.muted);
      page = await context.newPage();
      page.setDefaultTimeout(12000);
      page.on('pageerror', (error) =>
        report.errors.push({ scenario: scenario.name, message: error.message }),
      );
      page.on('console', (message) => {
        if (message.type() === 'error')
          report.consoleErrors.push({
            scenario: scenario.name,
            message: message.text(),
          });
      });
      page.on('request', (request) => {
        if (/^https?:/.test(request.url())) report.network.push(request.url());
      });
      page.on('requestfailed', (request) =>
        report.failedRequests.push({
          url: request.url().slice(0, 160),
          failure: request.failure(),
        }),
      );
      await scenario.exercise(page);
    } catch (error) {
      if (page) {
        await screenshot(page, `failure-${scenario.name}`).catch(() => {});
        fs.writeFileSync(
          path.join(output, `failure-${scenario.name}.txt`),
          await page
            .locator('body')
            .innerText()
            .catch(() => 'unavailable'),
        );
        report.failureTimeline = await page
          .evaluate(() => window.__archipelagoTimeline)
          .catch(() => []);
      }
      throw error;
    } finally {
      await context.close();
      report.contextsClosed.push(scenario.name);
    }
  }
  assert.deepEqual(report.errors, [], 'No runtime errors');
  assert.deepEqual(report.consoleErrors, [], 'No console errors');
  assert.deepEqual(report.network, [], 'Final HTML makes no network requests');
  assert.deepEqual(report.failedRequests, [], 'No missing embedded resources');
  pass(
    'Final offline HTML: zero network requests, failed resources, console errors, or runtime errors',
  );
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  process.exitCode = 1;
  console.error(error);
} finally {
  if (browser) {
    await browser.close();
    report.browserClosed = true;
  }
  fs.writeFileSync(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
}
