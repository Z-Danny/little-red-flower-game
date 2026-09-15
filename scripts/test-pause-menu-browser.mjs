// Final offline artifact only. Disposable profile, muted headless browser, no game-state injection.
// Optional: OFFLINE_FILE, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, PAUSE_MENU_TEST_OUTPUT.
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
const output = path.resolve(root, process.env.PAUSE_MENU_TEST_OUTPUT || 'outputs/pause-menu-verification');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const nodes = read('content/journey-map.json').regions.flatMap(region => region.nodes.map(node => ({ ...node, region: region.id })));
const surfaceSelector = '.hunt-player,.disaster-player,.configured-player,.kitchen-player';
const menuSelector = '[data-pause-menu]';
const boardKey = 'little-red-flower-leaderboard-v1';
const locationKey = 'little-red-flower-journey-location-v1';
const sizes = [[320, 568], [390, 844], [430, 932], [1440, 900]];
const representativeIds = new Set(['typhoon-home', 'flood-kit', 'rain-street-preparation-v1', 'flood-house-response-v1', 'lift-wait', 'fire-shelter-practice', 'oil-fire']);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = {
  status: 'running', startedAt: new Date().toISOString(), html, htmlSha256: null, finalHtmlSha256: null,
  browser: null, checks: [], menus: [], layouts: [], dynamicHints: [], screenshots: [], errors: [], network: [], failedRequests: [],
  fixture: 'One private profile presets 24 completed levels solely to unlock menu access. Progress is not earned gameplay. All gameplay actions, pause, sound, restart and map navigation use native pointer/keyboard input. Audio observation wraps AudioContext.createAnalyser to retain existing production analysers without changing signals, settings or audio graph.',
  physicalDevice: 'not_run', humanAudio: 'not_run', contextClosed: false, browserClosed: false,
};
fs.mkdirSync(output, { recursive: true });
const pass = (name, detail = {}) => { report.checks.push({ name, status: 'passed', ...detail }); console.log(`PASS ${name}`); };
function findPlaywright() {
  const specified = process.env.PLAYWRIGHT_MODULE;
  for (const candidate of specified ? [specified.startsWith('file:') ? fileURLToPath(specified) : specified] : ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'), 'playwright-core']) {
    try { return require(candidate); } catch (error) { if (specified) throw error; }
  }
  throw new Error('Playwright unavailable; set PLAYWRIGHT_MODULE.');
}
function findBrowser(chromium) {
  const candidates = [process.env.BROWSER_EXECUTABLE, chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'];
  const executable = candidates.find(candidate => candidate && fs.existsSync(candidate));
  assert(executable, 'Chromium unavailable; set BROWSER_EXECUTABLE.');
  return executable;
}
let browser, context, page;
const surface = () => page.locator(surfaceSelector);
const hud = () => surface().locator('header.painted-game-hud');
const menu = () => page.locator(menuSelector);
const board = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), boardKey);
const state = () => surface().evaluate(element => {
  const keys = ['level', 'elapsed', 'phase', 'found', 'resolved', 'goals', 'action', 'pending', 'stages', 'pressure', 'smokeLoad', 'fire', 'penalty'];
  return Object.fromEntries(keys.map(key => [key, element.dataset[key] ?? null]));
});
const elapsed = async () => Number(await surface().getAttribute('data-elapsed'));
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function screenshot(name) {
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(output, filename) });
  report.screenshots.push(filename);
}
async function openLevel(node) {
  await page.locator('[data-map-fan-toggle]').waitFor({ state: 'visible' });
  if (await page.locator('.garden-shell').getAttribute('data-region') !== node.region) {
    const toggle = page.locator('[data-map-fan-toggle]');
    if (await toggle.getAttribute('aria-haspopup') === 'dialog') {
      await toggle.click();
      await page.locator('[data-archipelago][data-phase="idle"]').waitFor({ state: 'visible' });
      await page.locator(`[data-island="${node.region}"][aria-disabled="false"]`).click();
      await page.locator('[data-archipelago]').waitFor({ state: 'detached' });
    } else {
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
      await page.locator(`[data-fan-category="${node.region}"]`).click();
    }
    await page.waitForFunction(region => document.querySelector('.garden-shell')?.getAttribute('data-region') === region, node.region);
  }
  const entry = page.locator(`[data-map-node="${node.id}"]`);
  await entry.evaluate(element => {
    const scroller = element.closest('.garden-scroll'), box = element.getBoundingClientRect(), view = scroller.getBoundingClientRect();
    scroller.scrollTo({ top: scroller.scrollTop + box.y + box.height / 2 - view.y - view.height / 2, behavior: 'instant' });
  });
  await settle();
  await entry.locator('.garden-node-label').click();
  await page.locator(`[data-painted-intro][data-level-id="${node.id}"]`).waitFor({ state: 'visible' });
  await page.locator('[data-painted-primary]:not(:disabled)').click();
  await page.waitForFunction(({ selector, id }) => {
    const element = document.querySelector(selector);
    return element?.dataset.level === id && element.dataset.phase === 'playing' && Number(element.dataset.elapsed) > 500;
  }, { selector: surfaceSelector, id: node.id });
}
async function pause() {
  await hud().getByRole('button', { name: /^暂停(?:游戏)?$/ }).click();
  await menu().waitFor({ state: 'visible' });
  assert.equal(await surface().getAttribute('data-paused'), 'true');
  await settle();
}
async function resume(method = 'escape') {
  const previous = await elapsed();
  if (method === 'hud') await hud().getByRole('button', { name: '继续游戏', exact: true }).click();
  else if (method === 'escape') await page.keyboard.press('Escape');
  else {
    const point = await page.locator('.pause-menu-shade').evaluate(shade => {
      const panel = shade.querySelector('[data-pause-menu]').getBoundingClientRect(), surface = shade.closest('[data-level]').getBoundingClientRect();
      return [[surface.x + 8, surface.y + surface.height / 2], [surface.right - 8, surface.y + surface.height / 2], [surface.x + surface.width / 2, surface.bottom - 8]].find(([x, y]) => !(x >= panel.left && x <= panel.right && y >= panel.top && y <= panel.bottom) && document.elementFromPoint(x, y) === shade);
    });
    assert(point, 'No unobstructed pause backdrop area');
    await page.mouse.click(...point);
  }
  await menu().waitFor({ state: 'detached' });
  await page.waitForFunction(({ selector, previous }) => Number(document.querySelector(selector)?.dataset.elapsed) > previous + 200, { selector: surfaceSelector, previous });
}
async function audioSnapshot() {
  return page.evaluate(() => window.__pauseQaAnalysers.map(({ context, analyser }) => {
    if (context.state !== 'running') return { state: context.state, rms: 0 };
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    return { state: context.state, rms: Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length) };
  }));
}
async function silent(id, reason) {
  await page.waitForTimeout(450);
  const samples = await audioSnapshot();
  assert(samples.every(sample => sample.rms < 0.0002), `${id}: audible samples during ${reason}: ${JSON.stringify(samples)}`);
  return samples;
}
async function geometry(id, width, height, capture = false) {
  await page.setViewportSize({ width, height });
  await settle();
  const layout = await menu().evaluate(panel => {
    const rect = node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
    const elements = [...panel.querySelectorAll('button,[data-pause-hint]')];
    const controls = [...panel.querySelectorAll('button')].map(button => ({ ...rect(button), label: button.getAttribute('aria-label') || button.textContent.trim(), centerHits: document.elementFromPoint(...(() => { const b = button.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })())?.closest('button') === button }));
    return { panel: rect(panel), surface: rect(panel.closest('[data-level]')), controls, textFits: elements.every(node => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1), pageOverflow: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1, scale: visualViewport?.scale ?? 1 };
  });
  report.layouts.push({ id, width, height, ...layout });
  const label = `${id} ${width}x${height}`;
  assert.equal(layout.scale, 1, `${label}: unexpected zoom`);
  assert(!layout.pageOverflow && layout.textFits, `${label}: overflowing page or clipped text`);
  assert(layout.panel.width <= 420 && layout.panel.height <= Math.min(470, height * .7), `${label}: pause panel is too large: ${JSON.stringify(layout.panel)}`);
  for (const box of [layout.panel, ...layout.controls]) assert(box.width > 0 && box.height > 0 && box.x >= -1 && box.y >= -1 && box.right <= width + 1 && box.bottom <= height + 1, `${label}: element outside viewport`);
  assert(Math.abs(layout.panel.x + layout.panel.width / 2 - layout.surface.x - layout.surface.width / 2) < 2, `${label}: not horizontally centered`);
  assert(Math.abs(layout.panel.y + layout.panel.height / 2 - layout.surface.y - layout.surface.height / 2) <= height * .12, `${label}: not vertically centered`);
  assert(layout.controls.every(control => control.width >= 44 && control.height >= 44 && control.centerHits), `${label}: button too small or occluded`);
  for (let i = 0; i < layout.controls.length; i++) for (const other of layout.controls.slice(i + 1)) {
    const a = layout.controls[i];
    assert(Math.min(a.right, other.right) - Math.max(a.x, other.x) <= 1 || Math.min(a.bottom, other.bottom) - Math.max(a.y, other.y) <= 1, `${label}: controls overlap`);
  }
  const nav = await hud().locator('button.pause-menu-navigation').evaluateAll(buttons => buttons.map(button => {
    const box = button.getBoundingClientRect();
    return { label: button.getAttribute('aria-label'), enabled: !button.disabled && !button.closest('[inert]'), hits: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === button };
  }));
  assert.equal(nav.length, 2, `${label}: expected back and pause HUD navigation`);
  assert(nav.every(button => button.enabled && button.hits), `${label}: HUD navigation unavailable while paused: ${JSON.stringify(nav)}`);
  if (capture) await screenshot(`${id}-pause-${width}x${height}`);
}
async function verifyMenu(node) {
  const panel = menu(), isCircle = await surface().evaluate(element => element.classList.contains('hunt-player') || element.dataset.challenge === '50s');
  assert.equal(await panel.count(), 1, `${node.id}: expected one common pause menu`);
  assert.equal(await panel.getAttribute('role'), 'dialog');
  assert.equal((await panel.locator('[data-pause-restart]').innerText()).trim(), '重新开始');
  assert.equal(await panel.locator('[data-pause-sound][role="switch"]').count(), 1);
  assert.equal(await panel.locator('button').count(), 2, `${node.id}: redundant menu action`);
  assert.equal(await panel.locator('input,details,summary,h1,h3').count(), 0, `${node.id}: removed settings/title remain`);
  assert((await panel.locator('h2').allTextContents()).every(text => text.trim() === '提示'), `${node.id}: redundant heading`);
  const text = (await panel.locator('.pause-menu-paper').innerText()) + (await panel.locator('[data-pause-restart]').innerText());
  assert(!/继续游戏|已暂停|暂停训练|休息一下|返回地图|返回关卡|全屏|操作帮助|键盘模式|小红花|训练暂停/.test(text), `${node.id}: redundant text remains: ${text}`);
  const hints = panel.locator('[data-pause-hint]');
  assert.equal(await hints.count(), isCircle ? 0 : 1, `${node.id}: wrong hint presence`);
  const hint = isCircle ? null : (await hints.innerText()).trim();
  if (hint !== null) {
    assert(hint.length >= 6 && hint.length <= 160, `${node.id}: invalid or overlong hint`);
    assert.equal(await hints.locator('img,svg,canvas,button').count(), 0, `${node.id}: hint must be text only`);
    if (node.id === 'oil-fire') assert.match(hint, /燃气|旋钮/);
    else if (node.id === 'flood-house-response-v1') assert.match(hint, /楼梯|向上|人物|高处/);
    else {
      const rules = read(`content/levels/${node.id}/level.json`);
      assert(rules.objects.some(object => hint.includes(object.label)), `${node.id}: hint does not refer to a current level object`);
    }
  }
  const frozen = await state();
  const world = surface().locator('.hunt-world,.configured-world,.kitchen-world,.disaster-world');
  assert.equal(await world.getAttribute('inert'), '', `${node.id}: world is not inert`);
  // Native keyboard activation cannot focus an inert gameplay control.
  const gameplay = surface().locator('.hunt-keyboard button,.configured-keyboard button').first();
  if (await gameplay.count()) {
    await gameplay.focus();
    assert(await gameplay.evaluate(element => document.activeElement !== element), `${node.id}: paused gameplay can be focused`);
  }
  // Click a paper area (outside its actions) and use ordinary arrow input.
  // The state must remain paused, with no canvas action or missed-click penalty.
  const point = await panel.evaluate(element => { const b = element.getBoundingClientRect(); return [b.x + b.width / 2, b.y + 18]; });
  await page.mouse.click(...point);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  assert.deepEqual(await state(), frozen, `${node.id}: game changed during pause`);
  assert.equal(await surface().getAttribute('data-paused'), 'true');
  const audio = await silent(node.id, 'pause');
  assert.deepEqual(await state(), frozen, `${node.id}: clock/state changed during paused audio observation`);
  const sound = panel.locator('[data-pause-sound]'), original = await sound.getAttribute('aria-checked');
  assert(['true', 'false'].includes(original), `${node.id}: invalid sound state`);
  await sound.click();
  assert.equal(await sound.getAttribute('aria-checked'), String(original !== 'true'), `${node.id}: sound switch did not toggle`);
  await sound.click();
  assert.equal(await sound.getAttribute('aria-checked'), original, `${node.id}: sound switch did not restore`);
  assert.deepEqual(await state(), frozen, `${node.id}: sound setting changed gameplay`);
  report.menus.push({ id: node.id, circle: isCircle, hint, frozenAt: frozen.elapsed, audio, soundSwitch: true });
  await geometry(node.id, 390, 844, !representativeIds.has(node.id));
  if (representativeIds.has(node.id)) for (const [width, height] of sizes) await geometry(node.id, width, height, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  pass(`${node.id}: compact shared pause, correct hint type, frozen world, silent audio and one sound switch`);
}
async function restartAndReturn(node, originalBoard) {
  if (await surface().getAttribute('data-paused') !== 'true') await pause();
  await menu().locator('[data-pause-restart]').click();
  await menu().waitFor({ state: 'detached' });
  await page.waitForFunction(({ selector, id }) => {
    const e = document.querySelector(selector);
    return e?.dataset.level === id && e.dataset.phase === 'playing' && Number(e.dataset.elapsed) < 800;
  }, { selector: surfaceSelector, id: node.id });
  const reset = await state();
  for (const key of ['found', 'resolved', 'goals', 'action', 'pending', 'stages']) assert(!reset[key], `${node.id}: restart retained ${key}`);
  assert.equal(await surface().getAttribute('data-paused'), 'false');
  assert.deepEqual(await board(), originalBoard, `${node.id}: restart modified saved progress`);
  await pause();
  await hud().getByRole('button', { name: /^返回关卡(?:地图)?$/ }).click();
  await page.locator('[data-map-fan-toggle]').waitFor({ state: 'visible' });
  assert.equal(await menu().count(), 0);
  assert.deepEqual(await board(), originalBoard, `${node.id}: paused map return changed saved progress`);
  pass(`${node.id}: restart resets this run and paused HUD returns directly to map without changing saved progress`);
}
async function configuredAction(id, ruleId) {
  const skinFile = `content/levels/${id}/skins/${id.endsWith('-practice') ? 'paper-gouache' : 'paperbook'}.json`;
  const rules = read(`content/levels/${id}/level.json`), skin = read(skinFile), rule = rules.interactions.find(rule => rule.id === ruleId);
  assert(rule, `Missing native action fixture ${ruleId}`);
  const source = page.locator('.configured-keyboard').getByRole('button', { name: rules.objects.find(object => object.id === rule.source).label, exact: true });
  await source.focus(); await source.press('Enter');
  if (rule.mode === 'drop') {
    const target = page.locator('.configured-keyboard').getByRole('button', { name: `放到 ${skin.zoneLabels?.[rule.target] ?? rule.target}`, exact: true });
    await target.focus(); await target.press('Enter');
  }
  await page.waitForFunction(goals => goals.every(goal => document.querySelector('.configured-player')?.dataset.resolved.split(',').includes(goal)), rule.grants);
}
async function nativeWorldPoint(point) {
  return surface().locator('canvas').evaluate((canvas, point) => {
    const b = canvas.getBoundingClientRect(), matrix = canvas.getContext('2d').getTransform();
    const transformed = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    const x = b.x + transformed.x * b.width / canvas.width, y = b.y + transformed.y * b.height / canvas.height;
    return { x, y, hit: document.elementFromPoint(x, y) === canvas };
  }, point);
}
async function changingHints(node) {
  const before = await menu().locator('[data-pause-hint]').innerText();
  await resume('escape');
  if (node.id === 'oil-fire') {
    const box = read('content/presets/kitchen/skin.json').layout.gas, point = await nativeWorldPoint({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
    assert(point.hit, 'Kitchen gas is covered by UI');
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => document.querySelector('.kitchen-player')?.dataset.action === 'shutoff');
    // Pause an action in flight, then confirm it finishes only after resume.
    await pause();
    const during = await state(); await page.waitForTimeout(800);
    assert.deepEqual(await state(), during, 'Kitchen action advanced during pause');
    await resume('escape');
    await page.waitForFunction(() => document.querySelector('.kitchen-player')?.dataset.action === '');
  } else await configuredAction(node.id, node.id === 'lift-wait' ? 'call' : 'close-room-door');
  await pause();
  const after = await menu().locator('[data-pause-hint]').innerText();
  assert.notEqual(after, before, `${node.id}: hint did not advance after the action`);
  assert.match(after, node.id === 'oil-fire' ? /锅盖|锅口/ : node.id === 'lift-wait' ? /乘客/ : /毛巾/);
  report.dynamicHints.push({ id: node.id, before, after });
  await screenshot(`${node.id}-next-action-hint`);
  pass(`${node.id}: native action advances the pause hint to current gameplay`);
}
async function quakeStage(node) {
  await resume('escape');
  await configuredAction(node.id, 'combined-cover');
  await configuredAction(node.id, 'grip-cover');
  await pause();
  const waiting = await menu().locator('[data-pause-hint]').innerText();
  assert(!/观察电池收音机/.test(waiting), 'Quake hint offers radio before the after-quake stage');
  const before = await state(); await page.waitForTimeout(1100);
  assert.deepEqual(await state(), before, 'Quake stage clock advanced while paused');
  await resume('escape');
  await page.waitForFunction(() => document.querySelector('.configured-player')?.dataset.stages?.includes('after-quake'));
  await pause();
  const after = await menu().locator('[data-pause-hint]').innerText();
  assert.match(after, /收音机/);
  assert.notEqual(after, waiting);
  report.dynamicHints.push({ id: node.id, waiting, after, stageClockFrozen: true });
  pass('quake-cover-practice: pause freezes stage clock and hint advances only after the quake stage');
}
try {
  assert.equal(nodes.length, 24);
  const htmlBytes = fs.readFileSync(html);
  report.htmlSha256 = hash(htmlBytes);
  report.assets = ['paper', 'bookmark'].map(name => {
    const file = `public/ui/pause-v1/${name}.webp`, bytes = fs.readFileSync(path.join(root, file));
    assert(htmlBytes.includes(Buffer.from(bytes.toString('base64'))), `${name}: current artwork is absent from final HTML`);
    return { file, sha256: hash(bytes), embedded: true };
  });
  const { chromium } = findPlaywright();
  browser = await chromium.launch({ headless: true, executablePath: findBrowser(chromium), args: ['--mute-audio'] });
  report.browser = browser.version();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce', offline: true });
  await context.addInitScript(({ ids, boardKey, locationKey }) => {
    if (!localStorage.getItem(boardKey)) {
      const id = 'pause-menu-private-qa';
      localStorage.setItem(boardKey, JSON.stringify({ version: 1, activePlayerId: id, players: [{ id, name: '暂停弹窗验收样本', region: '', createdAt: 1, completed: Object.fromEntries(ids.map(id => [id, 3])) }] }));
      localStorage.setItem(locationKey, JSON.stringify({ [id]: { levelId: 'typhoon-home', visitedAt: 1 } }));
    }
    window.__pauseQaAnalysers = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createAnalyser() { const analyser = super.createAnalyser(); window.__pauseQaAnalysers.push({ context: this, analyser }); return analyser; }
    };
  }, { ids: nodes.map(node => node.id), boardKey, locationKey });
  page = await context.newPage(); page.setDefaultTimeout(20_000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) report.network.push(request.url()); });
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url().slice(0, 150), failure: request.failure()?.errorText }));
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 90_000 });
  await page.locator('[data-home-continue]').waitFor({ state: 'visible' });
  const cover = await page.locator('[data-home-continue]').evaluate(button => { const b = button.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  await page.mouse.click(...cover);
  await page.locator('[data-map-fan-toggle]').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  const originalBoard = await board();
  for (const [index, node] of nodes.entries()) {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLevel(node);
    const circle = await surface().evaluate(element => element.classList.contains('hunt-player') || element.dataset.challenge === '50s');
    if (circle) {
      const bulb = hud().getByRole('button', { name: '物件剪影提示', exact: true });
      await bulb.click(); assert.equal(await bulb.getAttribute('aria-expanded'), 'true', `${node.id}: bulb did not open graphical clues`);
    }
    await pause();
    await verifyMenu(node);
    if (['oil-fire', 'lift-wait', 'fire-shelter-practice'].includes(node.id)) await changingHints(node);
    if (node.id === 'quake-cover-practice') await quakeStage(node);
    if (representativeIds.has(node.id)) {
      const sound = menu().locator('[data-pause-sound]');
      if (await sound.getAttribute('aria-checked') !== 'false') await sound.click();
      await resume(['escape', 'hud', 'backdrop'][index % 3]);
      await silent(node.id, 'resumed with sound off');
      await pause();
      assert.equal(await menu().locator('[data-pause-sound]').getAttribute('aria-checked'), 'false', `${node.id}: mute did not persist when reopening`);
      await menu().locator('[data-pause-sound]').click();
    } else {
      await resume(['escape', 'hud', 'backdrop'][index % 3]);
      await pause();
    }
    await restartAndReturn(node, originalBoard);
  }
  assert.equal(report.menus.length, 24);
  assert.equal(report.dynamicHints.length, 4);
  assert.equal(report.errors.length, 0, `Runtime errors: ${JSON.stringify(report.errors)}`);
  assert.equal(report.network.length, 0, `Offline HTML attempted HTTP(S): ${JSON.stringify(report.network)}`);
  assert.equal(report.failedRequests.length, 0, `Failed requests: ${JSON.stringify(report.failedRequests)}`);
  report.finalHtmlSha256 = hash(fs.readFileSync(html));
  assert.equal(report.finalHtmlSha256, report.htmlSha256, 'Final HTML changed during browser QA');
  report.status = 'passed';
  pass('24 final-HTML pause menus verified, four real gameplay hint transitions, restart/progress isolation and no network/runtime errors');
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || error.message; process.exitCode = 1;
  console.error(report.failure);
  if (page && !page.isClosed()) {
    report.failureUi = await page.evaluate(() => {
      const button = document.querySelector('[data-painted-primary],[data-pause-restart]');
      if (!button) return null;
      const b = button.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
      const ancestors = [];
      for (let node = button; node; node = node.parentElement) ancestors.push({ tag: node.tagName, class: node.className, inert: node.inert });
      const hit = document.elementFromPoint(x, y);
      return { point: { x, y }, hit: hit ? { tag: hit.tagName, class: hit.className } : null, ancestors };
    }).catch(() => null);
    await screenshot('failure').catch(() => {});
  }
} finally {
  if (context) { await context.close(); report.contextClosed = true; }
  if (browser) { await browser.close(); report.browserClosed = true; }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(output, 'README.md'), [
    '# 暂停弹窗：最终离线 HTML 验证', '', `- 结果：${report.status}`, `- HTML：${html}`, `- SHA-256：${report.htmlSha256}`, `- 结束 SHA-256：${report.finalHtmlSha256}`,
    `- 浏览器：${report.browser}；headless、隔离存储、offline、--mute-audio。`, `- finally 关闭 context：${report.contextClosed}；关闭 browser：${report.browserClosed}。`,
    `- 正式关卡暂停：${report.menus.length} / 24；布局样本：${report.layouts.length}；实际操作提示变化：${report.dynamicHints.length} / 4。`,
    `- 视口：${sizes.map(size => size.join('×')).join('、')}。`, '- 检查精简内容、按钮可点、44px触控区域、页面无溢出、暂停面板紧凑；外部HUD返回及暂停按钮可用。',
    '- 暂停冻结计时、进度和场景动作，世界与键盘操作不可访问；观察生产音频分析器确认静音。Escape、HUD暂停按钮和空白遮罩均可恢复。',
    '- 重开当前关卡清空本局状态，暂停时返回地图可直接退出；用户预设完成记录不变。', '- 文字提示按当前关卡和操作进度变化；圈选和收集关只使用HUD灯泡。',
    `- 样本：${report.fixture}`, `- 运行时错误 ${report.errors.length}；HTTP(S)请求 ${report.network.length}；失败请求 ${report.failedRequests.length}。`,
    '- physicalDevice: not_run', '- humanAudio: not_run', ...(report.failure ? ['', '## 失败', '', '```text', report.failure, '```'] : []), '', '## 截图', '', ...report.screenshots.map(file => `- [${file}](${file})`), '',
  ].join('\n'));
}
