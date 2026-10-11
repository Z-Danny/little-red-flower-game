// Isolated muted acceptance against the final HTML (default) or GAME_URL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    path.join(path.dirname(process.execPath), 'node_modules/playwright'),
);
const html = path.join(root, 'outputs/本地离线版/小红花应急行动.html');
const url = process.env.GAME_URL || pathToFileURL(html).href;
const output = path.join(
  root,
  'outputs/cover-delight-verification',
  process.env.GAME_URL ? 'web' : 'offline',
);
fs.mkdirSync(output, { recursive: true });
const report = {
  status: 'running',
  url,
  errors: [],
  externalRequests: [],
  checks: [],
  physicalDevice: 'not_run',
  humanAudio: 'not_run',
  browserClosed: false,
  contextsClosed: false,
};
if (!process.env.GAME_URL)
  report.htmlSha256 = createHash('sha256')
    .update(fs.readFileSync(html))
    .digest('hex');
let browser;
const contexts = [];
async function fresh(reducedMotion = 'no-preference') {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion,
    offline: !process.env.GAME_URL,
  });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('request', (request) => {
    if (!process.env.GAME_URL && /^https?:/.test(request.url()))
      report.externalRequests.push(request.url());
  });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.locator('[data-cover-ready="true"]').waitFor();
  return page;
}
async function start(page) {
  await page.locator('[data-home-start]').evaluate((button) => {
    button.click();
    button.click();
    button.click();
  });
  await page.locator('[data-cover-departing="true"]').waitFor();
}
try {
  browser = await chromium.launch({
    executablePath:
      process.env.BROWSER_EXECUTABLE ||
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--mute-audio'],
  });
  report.browser = browser.version();
  const page = await fresh();
  assert.equal(await page.locator('.title-leaf-flight').count(), 4);
  assert.equal(await page.locator('[data-cover-gust]').count(), 0);
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const touch = await page
      .locator('[data-cover-flower-touch]')
      .evaluate((button) => {
        const b = button.getBoundingClientRect();
        return {
          width: b.width,
          height: b.height,
          hit: button.contains(
            document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
          ),
        };
      });
    assert(
      touch.width >= 44 && touch.height >= 44 && touch.hit,
      JSON.stringify({ viewport, touch }),
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // No scores/bookmarks may be written by a decorative flower tap.
  const before = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  await page.locator('[data-cover-flower-touch]').click();
  assert.equal(
    await page
      .locator('[data-cover-flower]')
      .getAttribute('data-flower-reacting'),
    'true',
  );
  assert.equal(await page.locator('.title-touch-pollen i').count(), 3);
  await page.screenshot({ path: path.join(output, 'flower-touch.png') });
  await page.waitForTimeout(1100);
  assert.equal(
    await page
      .locator('[data-cover-flower]')
      .getAttribute('data-flower-reacting'),
    'false',
  );
  assert.equal(
    await page.evaluate(() => JSON.stringify({ ...localStorage })),
    before,
  );
  await page.locator('[data-cover-flower-touch]').focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await page
      .locator('[data-cover-flower]')
      .getAttribute('data-flower-reacting'),
    'true',
  );
  await page.waitForTimeout(1100);
  report.checks.push(
    'Flower is reachable at four viewport sizes, responds to pointer/keyboard, expires, and never edits saves.',
  );
  await start(page);
  assert.equal(await page.locator('.title-gust-flight').count(), 48);
  const dissolve = await page.locator('[data-title-screen]').evaluate((cover) => {
    const map = document.querySelector('[data-journey-map]');
    window.__entryMap = map;
    const scroller = map.querySelector('.garden-scroll');
    window.__entryScrollTop = scroller?.scrollTop;
    const motion = cover.getAnimations({subtree:true});
    const camera = motion.find(animation => animation.animationName === 'title-enter-town');
    const blend = motion.find(animation => animation.animationName === 'title-map-dissolve');
    const original = [camera.currentTime, blend.currentTime];
    const values = [];
    for (const time of [0, 900, 1400, 1800]) {
      camera.pause(); blend.pause(); camera.currentTime=time; blend.currentTime=time;
      values.push({time, scale:new DOMMatrix(getComputedStyle(cover.querySelector('.title-landscape')).transform).a, opacity:Number(getComputedStyle(cover).opacity)});
    }
    camera.currentTime=original[0]; blend.currentTime=original[1]; camera.play(); blend.play();
    const rect=cover.getBoundingClientRect(), dest=map.getBoundingClientRect();
    return {values, inert:map.inert, aligned:Math.abs(rect.x-dest.x)<1 && Math.abs(rect.y-dest.y)<1 && Math.abs(rect.width-dest.width)<1 && Math.abs(rect.height-dest.height)<1};
  });
  assert(dissolve.inert && dissolve.aligned, JSON.stringify(dissolve));
  assert(Math.abs(dissolve.values[3].scale-1.48)<.01);
  assert(dissolve.values[2].opacity>0 && dissolve.values[2].opacity<1);
  assert.equal(dissolve.values[3].opacity,0);
  assert(dissolve.values.every((sample,index,all)=>!index || sample.scale>=all[index-1].scale));
  report.transition=dissolve;

  assert(
    await page
      .locator('[data-title-screen]')
      .evaluate((root) =>
        [...root.querySelectorAll('button')].every((button) => button.disabled),
      ),
  );
  const state = await page.locator('[data-cover-gust]').evaluate((root) => {
    const flights = [...root.querySelectorAll('.title-gust-flight')];
    const all = root.getAnimations({ subtree: true });
    // Seek the authored CSS at two moments, without inventing a replacement motion.
    const geometry = (ms) => {
      for (const a of all) {
        a.pause();
        a.currentTime = ms;
      }
      return flights.map((leaf) => ({
        x: leaf.getBoundingClientRect().x,
        y: leaf.getBoundingClientRect().y,
      }));
    };
    const first = geometry(450),
      second = geometry(1000);
    const values = {
      first,
      second,
      ignoresPointer: [root, ...root.querySelectorAll('*')].every(
        (node) => getComputedStyle(node).pointerEvents === 'none',
      ),
      sizes: flights.map((node) => getComputedStyle(node).width),
      delays: flights.map((node) => getComputedStyle(node).animationDelay),
    };
    for (const a of all) {
      a.currentTime = 750;
      a.play();
    }
    return values;
  });
  assert(state.ignoresPointer);
  assert(new Set(state.sizes).size > 10 && new Set(state.delays).size > 10);
  assert(
    state.second.every((point, index) => point.y > state.first[index].y + 20),
  );
  await page.screenshot({ path: path.join(output, 'start-leaf-gust.png') });
  await page.locator('[data-journey-map]:not([inert])').waitFor();
  assert.equal(await page.locator('[data-cover-gust]').count(), 0);
  assert(await page.evaluate(() => document.querySelector('[data-journey-map]') === window.__entryMap), 'Map must not remount at the end of the crossfade');
  assert(await page.evaluate(() => Math.abs(document.querySelector('.garden-scroll').scrollTop-window.__entryScrollTop)<1), 'Map scroll position must not jump at handoff');
  report.checks.push('Camera reaches 1.48x; map and cover share the frame, map remains inert during the crossfade and retains its DOM and scroll position afterwards.');
  report.checks.push(
    'Start releases exactly 48 staggered leaves, moves them downward with depth variation, locks repeat input and removes all effects on map entry.',
  );
  await page.context().close();

  const hidden = await fresh();
  await start(hidden);
  await hidden.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await hidden.waitForTimeout(2100);
  assert.equal(
    await hidden.locator('[data-cover-departing="true"]').count(),
    1,
  );
  const paused = await hidden
    .locator('[data-cover-gust]')
    .evaluate((root) =>
      root
        .getAnimations({ subtree: true })
        .every((animation) => animation.playState === 'paused'),
    );
  assert(paused);
  await hidden.evaluate(async () => {
    await document.querySelector('.garden-map-art').decode();
    window.__blendAnimationSamples = document.querySelector('[data-title-screen]').getAnimations({subtree:true}).map(animation => ({animation,time:animation.currentTime}));
    for (const {animation} of window.__blendAnimationSamples) animation.currentTime=1400;
  });
  await hidden.screenshot({path:path.join(output,'transition-blend.png')});
  await hidden.evaluate(() => {
    for (const {animation,time} of window.__blendAnimationSamples) animation.currentTime=time;
    delete window.__blendAnimationSamples;
  });
  await hidden.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await hidden.locator('[data-journey-map]:not([inert])').waitFor();
  report.checks.push(
    'Simulated hidden-page visibility pauses both the leaf animations and navigation clock; resuming completes once.',
  );
  await hidden.context().close();

  const reduced = await fresh('reduce');
  await reduced.locator('[data-cover-flower-touch]').click();
  assert.equal(
    await reduced
      .locator('.title-touch-pollen')
      .evaluate((node) => getComputedStyle(node).display),
    'none',
  );
  const startTime = Date.now();
  await reduced.locator('[data-home-start]').click();
  await reduced.locator('[data-journey-map]:not([inert])').waitFor();
  assert(
    Date.now() - startTime < 1500,
    'Reduced motion must skip the 1800ms gust',
  );
  assert.equal(await reduced.locator('[data-cover-gust]').count(), 0);
  report.checks.push(
    'Reduced motion has no leaf burst, no pollen motion, and enters the map directly.',
  );
  await reduced.context().close();
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.externalRequests.length, 0);
  if (!process.env.GAME_URL)
    assert.equal(
      report.htmlSha256,
      createHash('sha256').update(fs.readFileSync(html)).digest('hex'),
      'HTML changed during verification',
    );
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  try {
    for (const context of contexts) await context.close();
    report.contextsClosed = true;
  } finally {
    try {
      if (browser) {
        await browser.close();
        report.browserClosed = true;
      }
    } finally {
      fs.writeFileSync(
        path.join(output, 'report.json'),
        JSON.stringify(report, null, 2),
      );
    }
  }
}
console.log(
  JSON.stringify({
    status: report.status,
    checks: report.checks,
    failure: report.failure,
    output,
  }),
);
