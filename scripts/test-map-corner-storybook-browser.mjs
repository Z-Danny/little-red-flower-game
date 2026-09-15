// Focused final-artifact QA for the three transparent garden corner buttons.
// Optional: OFFLINE_FILE, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, MAP_CORNER_GARDEN_TEST_OUTPUT.
// 0 / 9 / 63 flower counts use explicit isolated display fixtures, not earned gameplay.
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
const output = path.resolve(root, process.env.MAP_CORNER_GARDEN_TEST_OUTPUT || process.env.MAP_CORNER_STORYBOOK_TEST_OUTPUT || 'outputs/map-corner-garden-verification');
const map = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8'));
const copy = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-copy.json'), 'utf8'));
const nodes = map.regions.flatMap((region) => region.nodes);
const sizes = [[320, 568], [390, 844], [430, 932], [520, 960], [1440, 900]];
const boardKey = 'little-red-flower-leaderboard-v1';
const locationKey = 'little-red-flower-journey-location-v1';
const selectors = { tools: '[data-map-corner-tools]', home: '[data-map-home]', wallet: '.garden-wallet', settings: '[data-map-settings]', count: '[data-wallet]', fan: '[data-map-fan-toggle]' };
const preferences = [
  { name: /^(打开|关闭)按钮和奖励音效$/, key: 'red-flower:interface-muted' },
  { name: /^(打开|关闭)首页和地图音乐$/, key: 'red-flower:journey-music-muted' },
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = {
  status: 'running', html, sha256: null, browser: null, checks: [], assets: [], layouts: [], pinnedScroll: [], mapTopSamples: [], screenshots: [], errors: [], network: [], failedRequests: [],
  fixtures: 'Three independent contexts preset the first 0 / 3 / 21 levels to 3 flowers each (totals 0 / 9 / 63). Display/navigation fixtures only; no gameplay completion or rewards earned.',
  physicalDevice: 'not_run', humanAudio: 'not_run', nonzeroSafeArea: 'not_run', contextClosed: [], browserClosed: false,
};
fs.mkdirSync(output, { recursive: true });
const check = (name) => { report.checks.push({ name, status: 'passed' }); console.log(`PASS ${name}`); };

function findPlaywright() {
  const specified = process.env.PLAYWRIGHT_MODULE;
  for (const candidate of specified ? [specified.startsWith('file:') ? fileURLToPath(specified) : specified] : ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'), 'playwright-core']) {
    try { return require(candidate.startsWith('.') ? path.resolve(candidate) : candidate); }
    catch (error) { if (specified) throw error; }
  }
  throw new Error('Playwright was not found. Set PLAYWRIGHT_MODULE.');
}

function findBrowser(chromium) {
  const executable = (process.env.BROWSER_EXECUTABLE ? [process.env.BROWSER_EXECUTABLE] : [chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']).find((candidate) => fs.existsSync(candidate));
  assert(executable, 'Chromium/Chrome was not found. Set BROWSER_EXECUTABLE.');
  return executable;
}

async function settle(page) {
  // Collision avoidance commits side changes before measuring a vertical offset.
  // Wait for three unchanged animation frames, rather than observing its midpoint.
  const stable = await page.evaluate(async () => {
    let previous = '';
    let unchanged = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const signature = JSON.stringify([...document.querySelectorAll('.garden-node-label')].map((element) => {
        const r = element.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map((value) => Math.round(value * 100) / 100);
      }));
      unchanged = signature === previous ? unchanged + 1 : 0;
      if (unchanged >= 3) return true;
      previous = signature;
    }
    return false;
  });
  assert(stable, 'Map label layout did not stabilize within60 animation frames');
}

async function storage(page) {
  return page.evaluate(({ boardKey, locationKey }) => ({ board: JSON.parse(localStorage.getItem(boardKey)), location: JSON.parse(localStorage.getItem(locationKey)) }), { boardKey, locationKey });
}

async function screenshot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(output, file) });
  report.screenshots.push(file);
}

async function validateAssets(page, sourceAssets) {
  const assets = await page.locator(`${selectors.tools} img`).evaluateAll(async (images) => {
    await Promise.all(images.map((image) => image.decode()));
    return images.map((image) => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const alphaAt = (x, y) => pixels[(y * canvas.width + x) * 4 + 3];
      let transparentPixels = 0;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] === 0) transparentPixels += 1;
      return { src: image.src, width: image.naturalWidth, height: image.naturalHeight,
        cornerAlpha: [alphaAt(0, 0), alphaAt(canvas.width - 1, 0), alphaAt(0, canvas.height - 1), alphaAt(canvas.width - 1, canvas.height - 1)],
        transparentFraction: transparentPixels / (canvas.width * canvas.height) };
    });
  });
  assert.equal(assets.length, 3, 'Each corner button must use one PNG');
  for (const [index, asset] of assets.entries()) {
    assert(asset.src.startsWith('data:image/png;base64,'), 'Corner artwork is not an embedded PNG');
    const sha256 = hash(Buffer.from(asset.src.slice(asset.src.indexOf(',') + 1), 'base64'));
    const source = sourceAssets.find((item) => item.sha256 === sha256);
    assert(source, 'Corner PNG does not match the current source artwork');
    assert.equal(sha256, sourceAssets[index].sha256, 'Corner button uses the wrong PNG for its position');
    assert(asset.width > 0 && asset.height > 0);
    // Approved originals contain a 1/255 alpha pixel at the bottom-left corner.
    // Allow that invisible rounding residue while requiring real zero-alpha area.
    assert(asset.cornerAlpha.every((alpha) => alpha <= 1) && asset.transparentFraction > 0.1, 'Approved PNG must retain actual transparent pixels around its artwork');
    if (!report.assets.some((item) => item.sha256 === sha256)) report.assets.push({ ...source, width: asset.width, height: asset.height, cornerAlpha: asset.cornerAlpha, transparentFraction: asset.transparentFraction, embeddedMatchesSource: true });
  }
}

async function geometry(page, total, width, height) {
  const layout = await page.evaluate((selectors) => {
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const tools = document.querySelector(selectors.tools);
    const buttons = [...tools.querySelectorAll('button')];
    const count = document.querySelector(selectors.count);
    const countStyle = getComputedStyle(count);
    const range = document.createRange();
    range.selectNodeContents(count);
    const countRect = rect(count);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `${countStyle.fontWeight} ${countStyle.fontSize} ${countStyle.fontFamily}`;
    context.letterSpacing = countStyle.letterSpacing;
    const metrics = context.measureText(count.textContent.trim());
    const baseline = countRect.y + (countRect.height - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 + metrics.fontBoundingBoxAscent;
    const ink = { x: countRect.x - metrics.actualBoundingBoxLeft, right: countRect.x + metrics.actualBoundingBoxRight, y: baseline - metrics.actualBoundingBoxAscent, bottom: baseline + metrics.actualBoundingBoxDescent };
    const flower = count.closest('button').querySelector('img');
    return {
      shell: rect(tools.closest('.garden-shell')), tools: rect(tools), flower: rect(flower), count: countRect, glyphs: rect(range), ink,
      font: { size: Number.parseFloat(countStyle.fontSize), family: countStyle.fontFamily, weight: countStyle.fontWeight, color: countStyle.color, textOverflow: countStyle.textOverflow },
      countText: count.textContent.trim(), countFits: count.scrollWidth <= count.clientWidth + 1 && (countStyle.overflowY === 'visible' || count.scrollHeight <= count.clientHeight + 1),
      controls: buttons.map((button) => {
        const r = rect(button);
        const style = getComputedStyle(button);
        return { kind: button.matches(selectors.home) ? 'home' : button.matches(selectors.wallet) ? 'wallet' : button.matches(selectors.settings) ? 'settings' : 'unknown', text: button.innerText.trim(), label: button.getAttribute('aria-label'), ...r, image: rect(button.querySelector('img')), centerHits: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === button,
          background: style.backgroundColor, backgroundImage: style.backgroundImage, boxShadow: style.boxShadow,
          borderWidths: ['Top', 'Right', 'Bottom', 'Left'].map((side) => Number.parseFloat(style[`border${side}Width`])) };
      }),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      viewportScale: window.visualViewport?.scale ?? 1,
    };
  }, selectors);
  report.layouts.push({ total, viewport: { width, height }, ...layout });
  const label = `${total} flowers ${width}x${height}`;
  assert.deepEqual(layout.controls.map((control) => control.kind), ['home', 'wallet', 'settings'], `${label}: wrong corner order`);
  assert.equal(await page.locator('[data-wheel-achievements]').count(), 0, `${label}: obsolete achievement button remains`);
  assert.deepEqual(layout.controls.map((control) => control.text), ['', String(total), ''], `${label}: unexpected visible labels or baked count`);
  assert.equal(layout.countText, String(total));
  assert.equal(layout.viewportScale, 1);
  assert(!layout.horizontalOverflow, `${label}: page overflows horizontally`);
  assert(layout.tools.y >= layout.shell.y - 0.5 && layout.tools.y - layout.shell.y <= 24, `${label}: controls not near top-right`);
  assert(layout.shell.right - layout.tools.right >= -0.5 && layout.shell.right - layout.tools.right <= 24, `${label}: controls not near right edge`);
  for (const [index, control] of layout.controls.entries()) {
    assert(control.label && control.centerHits, `${label}: missing accessible label or obstructed control`);
    assert(control.width >= 44 && control.height >= 44, `${label}: control below 44px`);
    assert(Math.abs(control.width - 50) <= 0.5 && Math.abs(control.height - 50) <= 0.5, `${label}: corner control should be reduced from 56px to 50px`);
    assert(control.background === 'rgba(0, 0, 0, 0)' && control.backgroundImage === 'none' && control.boxShadow === 'none' && control.borderWidths.every((value) => value === 0), `${label}: corner button still paints a background or frame`);
    assert(Math.abs(control.width - layout.controls[0].width) <= 0.5 && Math.abs(control.height - layout.controls[0].height) <= 0.5, `${label}: controls have different sizes`);
    assert(Math.abs(control.x - layout.controls[0].x) <= 0.5, `${label}: controls not vertically aligned`);
    if (index > 0) assert(control.y >= layout.controls[index - 1].bottom, `${label}: controls overlap`);
    for (const box of [control, control.image]) assert(box.x >= -0.5 && box.y >= -0.5 && box.right <= width + 0.5 && box.bottom <= height + 0.5, `${label}: artwork/control leaves viewport`);
  }
  assert(layout.countFits && layout.font.textOverflow !== 'ellipsis' && layout.font.size >= 12, `${label}: wallet count is clipped or too small`);
  // The approved transparent PNG's cream core is centered at49.2%/50%,
  // with about35% usable diameter inside its painted golden rim.
  // CJK font line boxes overhang the actual numeral; use measured ink bounds and
  // screenshot review instead of treating the Range metric box as painted pixels.
  const core = { x: layout.flower.x + layout.flower.width * 0.317, right: layout.flower.x + layout.flower.width * 0.667, y: layout.flower.y + layout.flower.height * 0.325, bottom: layout.flower.y + layout.flower.height * 0.675 };
  assert(Math.abs(layout.count.x + layout.count.width / 2 - layout.flower.x - layout.flower.width * 0.492) <= 0.5 && Math.abs(layout.count.y + layout.count.height / 2 - layout.flower.y - layout.flower.height * 0.5) <= 0.5, `${label}: count is not centered on the flower`);
  assert(layout.ink.x >= core.x - 0.5 && layout.ink.right <= core.right + 0.5 && layout.ink.y >= core.y - 0.5 && layout.ink.bottom <= core.bottom + 0.5, `${label}: wallet ink leaves the cream core: ${JSON.stringify({ ink: layout.ink, core })}`);
  await pinnedScroll(page, total, width, height);
  check(`${label}: order, equal size, image-only buttons and centered live count fit`);
}

async function pinnedScroll(page, total, width, height) {
  const original = await page.locator('.garden-scroll').evaluate((element) => element.scrollTop);
  let baseline;
  for (const position of ['top', 'middle', 'bottom']) {
    await page.locator('.garden-scroll').evaluate((element, position) => {
      const max = element.scrollHeight - element.clientHeight;
      element.scrollTo({ top: position === 'top' ? 0 : position === 'middle' ? max / 2 : max, behavior: 'instant' });
    }, position);
    await settle(page);
    const controls = await page.locator(`${selectors.tools} button`).evaluateAll((buttons) => buttons.map((button) => { const r = button.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
    report.pinnedScroll.push({ total, viewport: { width, height }, position, controls });
    if (baseline) assert.deepEqual(controls, baseline, 'Corner buttons moved while map scrolled');
    else baseline = controls;
  }
  await page.locator('.garden-scroll').evaluate((element, top) => element.scrollTo({ top, behavior: 'instant' }), original);
  await settle(page);
}

async function functionality(page, total) {
  const before = await storage(page);
  for (const category of ['public', 'home', 'nature']) {
    await page.locator(selectors.fan).tap();
    await page.locator('[data-archipelago]').waitFor({ state: 'visible' });
    await page.locator(`[data-island="${category}"]`).tap();
    await page.locator('[data-archipelago]').waitFor({ state: 'hidden' });
    await page.locator(`.garden-region[data-region="${category}"]`).waitFor({ state: 'attached' });
    assert.equal(await page.locator('[data-archipelago]').count(), 0);
    assert.equal(await page.locator(selectors.count).innerText(), String(total));
    if (total === 63) {
      await settle(page);
      await screenshot(page, `garden-${total}-${category}-390x844`);
      if (category === 'public') {
        const scroller = page.locator('.garden-scroll');
        const original = await scroller.evaluate((element) => element.scrollTop);
        await scroller.evaluate((element) => element.scrollTo({ top: 0, behavior: 'instant' }));
        await settle(page);
        await screenshot(page, `garden-${total}-public-top-390x844`);
        await scroller.evaluate((element, top) => element.scrollTo({ top, behavior: 'instant' }), original);
        await settle(page);
      }
    }
  }
  await page.locator(selectors.wallet).click();
  const archive = page.getByRole('dialog', { name: '我的守护档案', exact: true });
  await archive.waitFor({ state: 'visible' });
  assert.equal(await archive.locator('.garden-archive-count strong').innerText(), String(total));
  assert.equal(await archive.locator('.garden-medals > div').count(), 3);
  assert.equal(await archive.getByRole('button', { name: '打开排行榜', exact: true }).count(), 1);
  assert.equal(await archive.getByRole('button', { name: '返回游戏首页', exact: true }).count(), 0);
  assert.equal(await archive.getByRole('button', { name: '重置当前玩家记录', exact: true }).count(), 0);
  for (const preference of preferences) assert.equal(await archive.getByRole('button', { name: preference.name }).count(), 0);
  await screenshot(page, `garden-${total}-archive-390x844`);
  await archive.getByRole('button', { name: '关闭', exact: true }).click();
  await archive.waitFor({ state: 'hidden' });
  await page.locator(selectors.tools).waitFor({ state: 'visible' });

  await page.locator(selectors.settings).click();
  const settings = page.getByRole('dialog', { name: '游戏设置', exact: true });
  await settings.waitFor({ state: 'visible' });
  assert.equal(await settings.locator('.garden-archive-count,.garden-medals').count(), 0);
  assert.equal(await settings.getByRole('button', { name: '打开排行榜', exact: true }).count(), 0);
  assert.equal(await settings.getByRole('button', { name: '返回游戏首页', exact: true }).count(), 0);
  const initialPreferences = [];
  for (const preference of preferences) {
    const control = settings.getByRole('button', { name: preference.name });
    assert.equal(await control.count(), 1);
    const initiallyOn = (await control.getAttribute('aria-pressed')) === 'true';
    initialPreferences.push(initiallyOn);
    await control.click();
    assert.equal(await control.getAttribute('aria-pressed'), String(!initiallyOn));
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), preference.key), String(initiallyOn), 'Settings must persist the actual mute preference');
  }
  await screenshot(page, `garden-${total}-settings-390x844`);
  const confirmation = page.waitForEvent('dialog').then(async (dialog) => {
    const result = { type: dialog.type(), message: dialog.message() };
    await dialog.dismiss();
    return result;
  });
  await settings.getByRole('button', { name: '重置当前玩家记录', exact: true }).click();
  const resetPrompt = await confirmation;
  assert.equal(resetPrompt.type, 'confirm');
  assert(resetPrompt.message.includes('清空') && resetPrompt.message.includes('小红花和关卡记录'), 'Reset must request confirmation before changing progress');
  assert.deepEqual((await storage(page)).board, before.board, 'Cancelling reset changed player progress');
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await settings.waitFor({ state: 'hidden' });
  await page.locator(selectors.tools).waitFor({ state: 'visible' });
  await page.locator(selectors.settings).click();
  await settings.waitFor({ state: 'visible' });
  for (const [index, preference] of preferences.entries()) assert.equal(await settings.getByRole('button', { name: preference.name }).getAttribute('aria-pressed'), String(!initialPreferences[index]), 'Reopening settings lost the selected preference');
  await page.keyboard.press('Escape');
  await settings.waitFor({ state: 'hidden' });

  await page.reload({ waitUntil: 'load' });
  await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor({ state: 'visible' });
  await page.locator('[data-home-continue]').click();
  await page.locator(selectors.settings).click();
  await settings.waitFor({ state: 'visible' });
  for (const [index, preference] of preferences.entries()) {
    const control = settings.getByRole('button', { name: preference.name });
    assert.equal(await control.getAttribute('aria-pressed'), String(!initialPreferences[index]), 'Reload lost the saved setting');
    await control.click();
    assert.equal(await control.getAttribute('aria-pressed'), String(initialPreferences[index]));
  }
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await settings.waitFor({ state: 'hidden' });

  await page.locator(selectors.wallet).click();
  await archive.getByRole('button', { name: '打开排行榜', exact: true }).click();
  await page.getByRole('button', { name: '返回关卡首页', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '返回关卡首页', exact: true }).click();
  await page.locator(selectors.tools).waitFor({ state: 'visible' });
  const beforeHome = await storage(page);
  await page.locator(selectors.home).click();
  await page.locator('[data-home-continue]').waitFor({ state: 'visible' });
  await page.locator('[data-home-continue]').click();
  await page.locator(selectors.tools).waitFor({ state: 'visible' });
  assert.equal(await page.locator(selectors.count).innerText(), String(total));
  const after = await storage(page);
  assert.deepEqual(after.board, before.board, 'Navigation changed player progress');
  assert.equal(after.location[after.board.activePlayerId].levelId, beforeHome.location[beforeHome.board.activePlayerId].levelId, 'Home/continue changed latest selected resume location');
  check(`${total} flowers: archive/settings are separate, mute choices survive reload, cancelled reset and all navigation preserve progress`);
}

async function inspectMapTop(page, total, width, height) {
  const original = await page.locator('.garden-scroll').evaluate((element) => element.scrollTop);
  await page.locator('.garden-scroll').evaluate((element) => element.scrollTo({ top: 0, behavior: 'instant' }));
  await settle(page);
  const topNode = [...map.regions[0].nodes].sort((a, b) => a.y - b.y)[0];
  const targets = [...new Set([topNode.id, 'quake-exit-practice'])];
  await screenshot(page, `garden-${total}-nature-top-${width}x${height}`);
  for (const id of targets) {
    const surfaces = await page.locator(`[data-map-node="${id}"]`).evaluate((node) => ['.garden-node-label', '.garden-node-bed'].map((selector) => {
      const element = node.querySelector(selector);
      const r = element.getBoundingClientRect();
      const title = selector === '.garden-node-label' ? element.querySelector('.garden-node-title') : null;
      return { selector, x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom,
        title: title?.textContent.trim() ?? null,
        titleFits: !title || (title.scrollWidth <= title.clientWidth + 1 && (getComputedStyle(title).overflowY === 'visible' || title.scrollHeight <= title.clientHeight + 1)),
        hits: [0.2, 0.5, 0.8].flatMap((x) => [0.2, 0.5, 0.8].map((y) => document.elementFromPoint(r.x + r.width * x, r.y + r.height * y)?.closest('[data-map-node]') === node)) };
    }));
    const sample = { total, viewport: { width, height }, node: id, surfaces, clickedSurfaces: [] };
    report.mapTopSamples.push(sample);
    for (const surface of surfaces) {
      assert(surface.x >= -0.5 && surface.y >= -0.5 && surface.right <= width + 0.5 && surface.bottom <= height + 0.5, `${id} ${width}x${height}: level entry leaves viewport: ${JSON.stringify(surface)}`);
      assert(surface.titleFits, `${id} ${width}x${height}: title is clipped`);
      if (surface.title) assert.equal(surface.title, copy.levels[id].title);
      assert(surface.hits.every(Boolean), `${id} ${width}x${height}: level entry is intercepted by corner controls or another label: ${JSON.stringify(surface)}`);
      await page.mouse.click(surface.x + surface.width / 2, surface.y + surface.height / 2);
      await page.waitForFunction(() => document.querySelector('.painted-map-entry, .garden-dialog'));
      const entry = page.locator('.painted-map-entry');
      assert.equal(await entry.count(), 1, `${id} ${width}x${height}: level click opened an archive instead of the level introduction`);
      await entry.waitFor({ state: 'visible' });
      assert.equal(await entry.getAttribute('data-level-id'), id, `${id}: wrong actual level ID in introduction`);
      assert.equal(await entry.locator('dialog[open]').count(), 1);
      const title = (await entry.locator('.painted-intro-title').innerText()).trim();
      assert.equal(title, copy.levels[id].title, `${id} ${width}x${height}: clicking ${surface.selector} opened the wrong dialog`);
      assert.equal(await page.locator('.garden-dialog .garden-archive-count').count(), 0, `${id}: clicking a level entry opened the archive`);
      sample.clickedSurfaces.push({ selector: surface.selector, title, actualLevelId: await entry.getAttribute('data-level-id'), dialog: 'painted-map-entry' });
      await page.keyboard.press('Escape');
      await entry.waitFor({ state: 'hidden' });
      await settle(page);
    }
  }
  check(`${width}x${height}: both top level labels and flowers open their own level, without corner or neighboring-label interception`);
  await page.locator('.garden-scroll').evaluate((element, top) => element.scrollTo({ top, behavior: 'instant' }), original);
  await settle(page);
}

let browser;
try {
  report.sha256 = hash(fs.readFileSync(html));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'art-source/map-corner-garden-v2/manifest.json'), 'utf8'));
  assert.equal(manifest.assets.length, 3, 'Expected three approved transparent garden PNGs');
  assert.deepEqual(manifest.assets.map((asset) => path.basename(asset.path)), ['home.png', 'flower-counter.png', 'settings-blue.png']);
  const sourceAssets = manifest.assets.map((asset) => {
    const sha256 = hash(fs.readFileSync(path.join(root, 'public', asset.path)));
    assert.equal(sha256, asset.sha256, `${asset.path}: source does not match approved manifest`);
    return { file: asset.path, role: asset.role, sha256 };
  });
  const { chromium } = findPlaywright();
  browser = await chromium.launch({ headless: true, executablePath: findBrowser(chromium), args: ['--mute-audio'] });
  report.browser = browser.version();
  for (const total of [0, 9, 63]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce', deviceScaleFactor: 1 });
    let page;
    try {
      await context.addInitScript(({ ids, total, boardKey, locationKey }) => {
        if (localStorage.getItem(boardKey)) return;
        const id = `garden-${total}-display-fixture`;
        localStorage.setItem(boardKey, JSON.stringify({ version: 1, activePlayerId: id, players: [{ id, name: `透明图标${total}花测试`, region: '', createdAt: 1, completed: Object.fromEntries(ids.slice(0, total / 3).map((level) => [level, 3])) }] }));
        localStorage.setItem(locationKey, JSON.stringify({ [id]: { levelId: ids[0], visitedAt: 1 } }));
      }, { ids: nodes.map((node) => node.id), total, boardKey, locationKey });
      page = await context.newPage();
      page.setDefaultTimeout(15_000);
      page.on('pageerror', (error) => report.errors.push({ total, message: error.message }));
      page.on('request', (request) => { if (/^https?:/.test(request.url())) report.network.push({ total, url: request.url() }); });
      page.on('requestfailed', (request) => report.failedRequests.push({ total, url: request.url().slice(0, 200), failure: request.failure()?.errorText }));
      await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60_000 });
      await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor({ state: 'visible' });
      await page.locator('[data-home-continue]').click();
      await page.locator(selectors.tools).waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts.ready);
      const initialBoard = (await storage(page)).board;
      await validateAssets(page, sourceAssets);
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await settle(page);
        await geometry(page, total, width, height);
        if (width === 320 || width === 390 || (total === 63 && width === 1440)) await screenshot(page, `garden-${total}-nature-${width}x${height}`);
        if (total === 63 && (width === 320 || width === 390)) await inspectMapTop(page, total, width, height);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await functionality(page, total);
      assert.deepEqual((await storage(page)).board, initialBoard, `${total}: layout/top-entry/navigation checks changed original player progress`);
    } catch (error) {
      if (page && !page.isClosed()) await screenshot(page, `failure-${total}`).catch(() => {});
      throw error;
    } finally { await context.close(); report.contextClosed.push(total); }
  }
  assert.equal(report.assets.length, 3);
  assert.equal(report.errors.length, 0);
  assert.equal(report.network.length, 0);
  assert.equal(report.failedRequests.length, 0);
  report.finalTestedSha256 = hash(fs.readFileSync(html));
  report.initialAndFinalSha256Match = report.sha256 === report.finalTestedSha256;
  assert(report.initialAndFinalSha256Match, 'HTML changed during QA');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || error.message;
  console.error(report.failure); process.exitCode = 1;
} finally {
  if (browser) { await browser.close(); report.browserClosed = true; }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), [
    '# 透明绘本右上角按钮：最终 HTML 验证', '',
    `- 结果：${report.status}`, `- HTML：${html}`, `- SHA-256：${report.sha256}`,
    '- 展示存档：0 / 9 / 63 花；隔离浏览器环境，不代表实际通关。',
    `- 视口：${sizes.map((size) => size.join('×')).join('、')}；布局 ${report.layouts.length} 组；滚动固定性 ${report.pinnedScroll.length} 组；PNG内嵌源图哈希 ${report.assets.length}/3。`,
    `- 320/390顶端标题回归样本：${report.mapTopSamples.length}；同时检查洪水高处待援/震后楼梯撤离的标签、花朵各9点命中和实际中心点击。`,
    '- 验证：首页→花数→设置顺序、三个 50px 按钮透明无框且右上固定、PNG 真实透明通道与内嵌源图一致、花芯实时数字完整、档案/设置分离、声音偏好关闭重开与刷新持久化、重置确认取消、排行榜/首页/继续/扇形切换和存档保持；截图另行检查渐变减淡、米色轮廓与蓝色设置图标。',
    `- 浏览器错误 ${report.errors.length}；HTTP(S)请求 ${report.network.length}；失败请求 ${report.failedRequests.length}。`,
    `- headless、--mute-audio、隔离上下文；finally已关闭浏览器：${report.browserClosed}。`,
    '- physicalDevice: not_run', '- humanAudio: not_run', '- nonzeroSafeArea: not_run',
    ...(report.failure ? ['', '## 失败', '', '```text', report.failure, '```'] : []),
    '', '## 截图', '', ...report.screenshots.map((file) => `- [${file}](${file})`), '',
  ].join('\n'));
}
