/** Final exported HTML QA for the illustrated progress / leaderboard journal.
 * All records belong to disposable contexts. No user profile or game completion
 * callback is touched. The test never builds or exports the application.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const html = path.resolve(root, process.env.OFFLINE_FILE || 'outputs/本地离线版/小红花应急行动.html');
const motionOnly = process.env.PAINTED_JOURNAL_MOTION_ONLY === '1';
const output = path.resolve(root, process.env.PAINTED_JOURNAL_TEST_OUTPUT || 'docs/painted-journal/v1-verification');
const map = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8'));
const categories = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-categories.json'), 'utf8')).categories;
const nodes = map.regions.flatMap(region => region.nodes);
const ids = nodes.map(node => node.id);
const boardKey = 'little-red-flower-leaderboard-v1';
const locationKey = 'little-red-flower-journey-location-v1';
const activeId = 'journal-qa-active';
const otherId = 'journal-qa-other';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {
  mode: motionOnly ? 'normal-motion-only' : 'full',
  status: 'running', startedAt: new Date().toISOString(), html, htmlSha256: null,
  checks: [], layouts: [], audio: [], assets: [], screenshots: [], errors: [], network: [], failedRequests: [],
  contextsCreated: 0, contextsClosed: 0, browserClosed: false,
  physicalDevice: 'not_run', humanAudio: 'not_run',
  fixture: 'Independent offline browser contexts preset zero, mixed legacy 1/2/3-flower, and all-complete records for UI assertions. These are explicit synthetic fixtures, not earned gameplay results. Demo players remain read-only and must never be persisted. Tests use only native UI input except temporary, transparent AudioContext instrumentation and animation observations. One actual level launch follows journal dismissal; no completion callback or reward is injected.',
};
fs.mkdirSync(output, { recursive: true });
const pass = (name, detail = {}) => { report.checks.push({ name, status: 'passed', ...detail }); console.log(`PASS ${name}`); };
let browser, lastPage;
const contexts = new Set();
function playwright() {
  for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'), 'playwright-core'].filter(Boolean)) {
    try { return require(candidate); } catch (error) { if (candidate === process.env.PLAYWRIGHT_MODULE) throw error; }
  }
  throw new Error('Playwright unavailable. Set PLAYWRIGHT_MODULE.');
}
function executable(chromium) {
  const result = [process.env.BROWSER_EXECUTABLE, chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/usr/bin/chromium'].find(file => file && fs.existsSync(file));
  assert(result, 'Chromium unavailable. Set BROWSER_EXECUTABLE.');
  return result;
}
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const card = page => page.getByTestId('journal-card');
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), boardKey);
const sound = page => page.locator('.game-page').evaluate(element => ({ played: Number(element.dataset.uiAudioPlayed || 0), cue: element.dataset.uiAudioCue || '', voices: Number(element.dataset.uiAudioVoices || 0) }));
const scoresFor = kind => kind === 'complete' ? Object.fromEntries(ids.map(id => [id, 3])) : kind === 'zero' ? {} : Object.fromEntries(map.regions.flatMap((region, i) => region.nodes.slice(0, [2, 1, 2][i]).map((node, j) => [node.id, i === 0 && j === 0 ? 1 : i === 1 ? 2 : 3])));
const othersScores = Object.fromEntries(map.regions.flatMap((region, i) => region.nodes.slice(0, [5, 3, 4][i]).map(node => [node.id, 3])));
async function fixture(kind, reducedMotion = 'reduce', viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, reducedMotion, hasTouch: true, deviceScaleFactor: 1, offline: true });
  contexts.add(context); report.contextsCreated++;
  const completed = scoresFor(kind);
  await context.addInitScript(({ boardKey, locationKey, activeId, otherId, completed, otherCompleted }) => {
    if (!localStorage.getItem(boardKey)) {
      localStorage.setItem(boardKey, JSON.stringify({ version: 1, activePlayerId: activeId, players: [
        { id: activeId, name: '阿花', region: '', createdAt: 1, completed },
        { id: otherId, name: '隔壁大聪明', region: '验收用虚构地区', createdAt: 2, completed: otherCompleted },
        { id: 'journal-qa-zero', name: '还没开张', region: '', createdAt: 3, completed: {} },
      ] }));
      localStorage.setItem(locationKey, JSON.stringify({ [activeId]: { levelId: 'typhoon-home', visitedAt: 1 } }));
    }
    window.__journalWrites = [];
    const nativeSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (this === localStorage && key === boardKey) window.__journalWrites.push({ key, value }); return nativeSet.call(this, key, value); };
    window.__journalAudio = [];
    const NativeContext = window.AudioContext;
    if (NativeContext) window.AudioContext = class extends NativeContext {
      constructor(...args) { super(...args); this.__qaSources = []; window.__journalAudio.push(this); }
      createOscillator() {
        const source = super.createOscillator(), entry = { started: null, stops: [] };
        const start = source.start.bind(source), stop = source.stop.bind(source);
        source.start = (at = this.currentTime) => { entry.started = at; this.__qaSources.push(entry); return start(at); };
        source.stop = (at = this.currentTime) => { entry.stops.push(at); return stop(at); };
        return source;
      }
    };
    window.__journalAnimations = [];
    document.addEventListener('animationstart', event => { if (event.target.closest?.('[data-testid="journal-card"]')) window.__journalAnimations.push({ type: 'start', name: event.animationName }); }, true);
    document.addEventListener('animationend', event => { if (event.target.closest?.('[data-testid="journal-card"]')) window.__journalAnimations.push({ type: 'end', name: event.animationName }); }, true);
  }, { boardKey, locationKey, activeId, otherId, completed, otherCompleted: othersScores });
  const page = await context.newPage(); lastPage = page; page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) report.network.push(request.url()); });
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url().slice(0, 160), error: request.failure()?.errorText }));
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60000 });
  const continueButton = page.locator('[data-home-continue]');
  await continueButton.waitFor();
  const point = await continueButton.evaluate(button => { const box = button.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2; return { x, y, hit: document.elementFromPoint(x, y)?.closest('button') === button }; });
  assert(point.hit, 'Cover continue button occluded');
  await page.mouse.click(point.x, point.y);
  await page.locator('[data-map-fan-toggle]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  return { page, context, completed };
}
async function closeContext(context) { await context.close(); contexts.delete(context); report.contextsClosed++; }
async function shot(page, name) { const file = `${name}.png`; await page.screenshot({ path: path.join(output, file) }); report.screenshots.push(file); }
async function open(page) {
  await page.locator('[data-journal-open]').click();
  await card(page).waitFor();
  await page.waitForTimeout(450);
  assert.equal(await card(page).getAttribute('data-view'), 'mine', 'Journal must default to my progress');
  assert.equal(await page.getByTestId('journal-tab-mine').getAttribute('aria-selected'), 'true');
  return card(page);
}
async function stats(page, completed, viewedId = activeId) {
  assert.equal(await card(page).getAttribute('data-viewed-player-id'), viewedId);
  assert.equal(await card(page).getAttribute('data-active-player-id'), (await saved(page)).activePlayerId);
  const total = ids.reduce((n, id) => n + (completed[id] || 0), 0), count = ids.filter(id => (completed[id] || 0) > 0).length;
  assert.equal(Number(await page.getByTestId('journal-flowers').getAttribute('data-value')), total);
  assert.equal(Number(await page.getByTestId('journal-completed').getAttribute('data-value')), count);
  assert.equal(Number(await page.getByTestId('journal-completed').getAttribute('data-total')), nodes.length);
  for (const category of categories) {
    const relevant = map.regions.filter(region => category.regionIds.includes(region.id)).flatMap(region => region.nodes);
    const complete = relevant.filter(node => (completed[node.id] || 0) > 0).length;
    const island = page.getByTestId(`journal-island-${category.id}`);
    assert.equal(Number(await island.getAttribute('data-completed')), complete);
    assert.equal(Number(await island.getAttribute('data-total')), relevant.length);
    assert(Math.abs(Number(await island.getAttribute('data-progress')) - complete / relevant.length) < .001);
    const paint = await page.getByTestId(`journal-island-color-${category.id}`).evaluate(element => ({ opacity: Number(getComputedStyle(element).opacity), mask: getComputedStyle(element).maskImage }));
    if (complete === 0) assert.equal(paint.opacity, 0, 'Zero island must remain uncolored');
    else if (complete === relevant.length) assert.equal(paint.mask, 'none', 'Completed island must be fully colored');
    else assert(paint.opacity > 0 && paint.mask.includes('linear-gradient'), 'Partial island must visibly show proportional progress');
  }
  pass(`Exact scores and three island totals for ${viewedId}`, { flowers: total, completed: count });
}
async function board(page, keyboard = false) {
  const tab = page.getByTestId('journal-tab-board');
  if (keyboard) { await tab.focus(); await tab.press('Enter'); } else await tab.click();
  await page.waitForTimeout(300);
  assert.equal(await card(page).getAttribute('data-view'), 'board');
  assert.equal(await tab.getAttribute('aria-selected'), 'true');
}
async function outside(page, touch = false) {
  const rect = await card(page).boundingBox();
  const vp = page.viewportSize();
  const possibilities = [{ x: 2, y: 2 }, { x: vp.width / 2, y: 2 }, { x: 2, y: vp.height / 2 }, { x: vp.width - 2, y: vp.height - 2 }];
  const point = possibilities.find(p => p.x < rect.x || p.x > rect.x + rect.width || p.y < rect.y || p.y > rect.y + rect.height);
  assert(point, 'Journal leaves no outside dismissal target');
  if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await card(page).waitFor({ state: 'detached' });
  await settle(page);
}
async function oneCue(page, label, action, expectedCue) {
  await page.waitForTimeout(120);
  const before = await sound(page);
  await action();
  await page.waitForTimeout(320);
  const after = await sound(page);
  assert.equal(after.played - before.played, 1, `${label}: expected exactly one UI cue`);
  if (expectedCue) assert.equal(after.cue, expectedCue, `${label}: cue routing`);
  assert.equal(after.voices, 0, `${label}: cue voices must be released`);
  report.audio.push({ label, before: before.played, after: after.played, cue: after.cue });
  pass(`${label}: one cue, released voices`);
}
async function geometry(page, view, width, height, capture = true) {
  await page.setViewportSize({ width, height }); await page.waitForTimeout(400);
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="journal-card"] img')].every(img => img.complete && img.naturalWidth > 0));
  const inspected = await card(page).evaluate(element => {
    const rect = node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom }; };
    const controls = [...element.querySelectorAll('button,[role="tab"]')].filter(n => n.offsetWidth > 0).map(n => ({ testid: n.dataset.testid, label: n.getAttribute('aria-label') || n.textContent.trim(), ...rect(n) }));
    const figures = [...element.querySelectorAll('[data-testid="journal-flowers"],[data-testid="journal-completed"],[data-testid^="journal-island-"]')].filter(n => n.offsetWidth > 0 && !n.dataset.testid.includes('-color-')).map(n => ({ id: n.dataset.testid, ...rect(n), textFits: n.dataset.testid.startsWith('journal-island-') || n.clientWidth === 0 || n.scrollWidth <= n.clientWidth + 1 }));
    const labels = [...element.querySelectorAll('.journal-island-sign')].map(node => { const range = document.createRange(); range.selectNodeContents(node); const text = range.getBoundingClientRect(); return { label: node.textContent.trim(), plaque: rect(node), text: { x: text.x, right: text.right, width: text.width } }; });
    return { card: rect(element), controls, figures, labels, docOverflow: document.documentElement.scrollWidth > innerWidth + 1, ownOverflow: element.scrollWidth > element.clientWidth + 1 };
  });
  assert(!inspected.docOverflow && !inspected.ownOverflow, `${view} ${width}: horizontal overflow`);
  assert(inspected.card.x >= -1 && inspected.card.right <= width + 1, `${view} ${width}: card offscreen horizontally`);
  assert(inspected.card.y >= 12 && inspected.card.bottom <= height - 12, `${view} ${width}: fixed frame clipped vertically`);
  for (const figure of inspected.figures) assert(figure.textFits && figure.x >= inspected.card.x - 1 && figure.right <= inspected.card.right + 1, `${view}: ${figure.id} clipped`);
  for (const label of inspected.labels) assert(label.text.x >= label.plaque.x + 3 && label.text.right <= label.plaque.right - 3, `${view} ${width}: ${label.label} spills off its sign`);
  for (const control of inspected.controls) assert(control.width >= 32 && control.height >= 32, `${view}: too-small target ${control.label}`);
  assert.equal(await card(page).getByRole('button', { name: /^(关闭|返回|返回地图|返回关卡|返回红人榜)$/ }).count(), 0, 'Removed dismissal buttons must stay absent');
  const text = await card(page).innerText();
  assert(!text.includes('本机榜') && !text.includes('本机排行榜') && !text.includes('最近拿下'), 'Removed copy reappeared');
  report.layouts.push({ view, width, height, ...inspected });
  if (capture) await shot(page, `${view}-${width}x${height}`);
  const tabBox = await page.getByTestId('journal-tab-mine').boundingBox();
  const endpoint = view === 'board' ? page.getByTestId('journal-create') : page.getByTestId('journal-island-home').locator('.journal-island-count');
  await endpoint.scrollIntoViewIfNeeded(); await settle(page);
  const nextTabBox = await page.getByTestId('journal-tab-mine').boundingBox();
  assert(Math.abs(tabBox.y - nextTabBox.y) < 1, 'Tabs moved when scrolling journal content');
  const endpointBox = await endpoint.boundingBox(), scrollBox = await page.getByTestId('journal-scroll').boundingBox();
  assert(endpointBox.y >= scrollBox.y - 1 && endpointBox.y + endpointBox.height <= scrollBox.y + scrollBox.height + 1, 'Last progress label/action cannot be brought fully into view');
  if (capture && width === 320) await shot(page, `${view}-${width}x${height}-scrolled`);
  await page.getByTestId('journal-scroll').evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' })); await settle(page);
  pass(`${view}: ${width}×${height} layout, fixed frame/tabs and reachable last content`);
}

async function storageUnchanged(page, before, label) {
  assert.deepEqual(await saved(page), before, `${label}: browsing modified saved player/reward data`);
  assert((await saved(page)).players.every(player => !player.id.startsWith('demo')), `${label}: demo leaked into storage`);
}
async function inspectAssets() {
  const folder = path.join(root, 'public/ui/painted-journal-v1');
  const final = fs.readFileSync(html, 'utf8');
  const files = fs.readdirSync(folder).filter(name => name.endsWith('.webp') && name !== 'frame.webp');
  assert(files.length > 0, 'Journal artwork missing');
  for (const name of files) {
    const bytes = fs.readFileSync(path.join(folder, name));
    assert(final.includes(bytes.toString('base64')), `Final HTML does not embed ${name}`);
    report.assets.push({ file: `/ui/painted-journal-v1/${name}`, bytes: bytes.length, sha256: hash(bytes), embedded: true });
  }
  pass('Final HTML embeds journal artwork byte-for-byte', { assets: files.length });
}
async function verifyReadonly(page, before) {
  await oneCue(page, 'Pointer leaderboard tab', () => board(page));
  const ranked = await card(page).locator('[data-testid^="journal-player-"][data-rank]').evaluateAll(rows => rows.map(row => ({ rank: row.dataset.rank, flowers: Number(row.querySelector('.journal-row-score b')?.textContent) })));
  let previous = -1, rank = 0;
  ranked.forEach((row, index) => {
    if (row.flowers !== previous) rank = index + 1;
    if (index) assert(row.flowers <= ranked[index - 1].flowers, 'Rows must descend by flower count');
    assert.equal(row.rank, row.flowers > 0 ? String(rank) : 'none', 'Displayed tied/zero rank mismatch'); previous = row.flowers;
  });
  const row = page.getByTestId(`journal-player-${otherId}`);
  assert.equal(await row.getAttribute('data-source'), 'saved');
  await oneCue(page, 'Inspect saved player', () => row.click());
  assert.equal(await card(page).getAttribute('data-view'), 'player');
  await stats(page, othersScores, otherId);
  await storageUnchanged(page, before, 'Viewing other saved player');
  assert.equal(await page.getByTestId('journal-use-player').count(), 1, 'Saved player should have an explicit use-player action');
  await shot(page, 'other-player-390x844');
  await board(page, true);
  const demo = card(page).locator('[data-source="demo"][data-testid^="journal-player-"]').first();
  assert(await demo.count(), 'Expected clearly marked read-only demo rows');
  const demoId = (await demo.getAttribute('data-testid')).slice('journal-player-'.length);
  await demo.click(); await page.waitForTimeout(250);
  assert.equal(await card(page).getAttribute('data-viewed-player-id'), demoId);
  assert.equal(await page.getByTestId('journal-use-player').count(), 0, 'Demo cannot be selected as the active player');
  assert.equal(await page.getByTestId('journal-edit').count(), 0, 'Demo cannot be edited');
  assert((await card(page).innerText()).includes('示例'), 'Demo detail must identify its sample data');
  await storageUnchanged(page, before, 'Viewing demo player');
  await shot(page, 'demo-player-390x844');
  await page.getByTestId('journal-tab-mine').click(); await page.waitForTimeout(250);
  await stats(page, before.players[0].completed);
  pass('Saved and demo detail are read-only; returning to mine restores actual data');
}
async function verifyDismissal(page, before) {
  const title = card(page).locator('h2,h3').first();
  await title.click(); await settle(page);
  assert(await card(page).isVisible(), 'Inside content click dismissed the journal');
  const scroll = await card(page).evaluate(element => {
    const choices = [element, ...element.querySelectorAll('*')].filter(node => node.scrollHeight > node.clientHeight + 3 && /auto|scroll/.test(getComputedStyle(node).overflowY));
    if (!choices.length) return null;
    const node = choices[0], box = node.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, before: node.scrollTop };
  });
  if (scroll) { await page.mouse.move(scroll.x, scroll.y); await page.mouse.wheel(0, 260); await page.waitForTimeout(200); assert(await card(page).isVisible(), 'Inside scrolling dismissed the journal'); }
  if (scroll) { await page.mouse.wheel(0, -1000); await page.waitForTimeout(250); }
  const tabPoint = await page.getByTestId('journal-tab-board').boundingBox();
  await page.touchscreen.tap(tabPoint.x + tabPoint.width / 2, tabPoint.y + tabPoint.height / 2);
  await page.waitForTimeout(200);
  assert.equal(await card(page).getAttribute('data-view'), 'board', 'Touch tab did not activate');
  await outside(page, true);
  await storageUnchanged(page, before, 'Outside dismissal');
  await open(page);
  await page.keyboard.press('Escape'); await card(page).waitFor({ state: 'detached' });
  await open(page);
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab'); await settle(page);
    assert(await card(page).evaluate(element => element.contains(document.activeElement)), 'Keyboard focus escaped the modal');
  }
  await storageUnchanged(page, before, 'Keyboard focus and reopening');
  pass('Inside click/scroll remain open; outside/Escape dismiss; reopening defaults mine; focus stays in journal', { internalScrollExercised: Boolean(scroll) });
}
async function verifyEditorAndSwitch(page) {
  await page.getByTestId('journal-tab-mine').click(); await page.waitForTimeout(200);
  const before = await saved(page);
  await page.getByTestId('journal-edit').click();
  const input = page.getByTestId('journal-name');
  await input.fill('阿花有点东西');
  await page.getByTestId('journal-save').click();
  await page.getByTestId('journal-editor').waitFor({ state: 'detached' });
  let current = await saved(page);
  assert.equal(current.activePlayerId, activeId);
  assert.equal(current.players.find(p => p.id === activeId).name, '阿花有点东西');
  assert.deepEqual(current.players.find(p => p.id === activeId).completed, before.players.find(p => p.id === activeId).completed);
  await page.getByTestId('journal-edit').click(); await input.fill('不会保存'); await page.getByTestId('journal-cancel').click();
  assert.equal((await saved(page)).players.find(p => p.id === activeId).name, '阿花有点东西');
  await board(page);
  await page.getByTestId(`journal-player-${otherId}`).click();
  await page.getByTestId('journal-use-player').click();
  await page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).activePlayerId === id, { key: boardKey, id: otherId });
  await page.getByTestId('journal-tab-mine').click(); await page.waitForTimeout(300);
  await stats(page, othersScores, otherId);
  await board(page);
  await page.getByTestId('journal-create').click(); await input.fill('新来的显眼包');
  await page.getByTestId('journal-save').click(); await page.getByTestId('journal-editor').waitFor({ state: 'detached' });
  current = await saved(page);
  const added = current.players.find(p => p.id === current.activePlayerId);
  assert.equal(current.players.length, before.players.length + 1);
  assert.equal(added.name, '新来的显眼包'); assert.deepEqual(added.completed, {});
  for (const previous of before.players) assert.deepEqual(current.players.find(p => p.id === previous.id).completed, previous.completed, 'Editing/adding/switching must preserve old scores');
  await page.getByTestId('journal-tab-mine').click(); await page.waitForTimeout(200);
  await stats(page, {}, added.id);
  pass('Explicit edit, cancel, saved-player switch, and add-player preserve per-player progress');
}
async function verifyMuted(page) {
  await outside(page);
  await page.getByRole('button', { name: '打开游戏设置', exact: true }).click();
  await page.getByRole('button', { name: '关闭按钮和奖励音效', exact: true }).click();
  await page.waitForTimeout(200);
  const muted = await sound(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await open(page); await board(page); await page.getByTestId('journal-player-' + otherId).click(); await page.waitForTimeout(250);
  assert.equal((await sound(page)).played, muted.played, 'Muted journal emitted interface sounds');
  await outside(page);
  assert.equal((await sound(page)).played, muted.played, 'Muted outside dismissal emitted sound');
  pass('Button/reward mute suppresses journal open, tab, player inspection and dismissal');
}
async function launchAfterDismissal(page) {
  const entry = page.locator('[data-map-node="typhoon-home"]');
  await entry.evaluate(element => { const scroll = element.closest('.garden-scroll'), b = element.getBoundingClientRect(), s = scroll.getBoundingClientRect(); scroll.scrollTo({ top: scroll.scrollTop + b.y + b.height / 2 - s.y - s.height / 2, behavior: 'instant' }); });
  await entry.locator('.garden-node-label').click();
  try { await page.locator('[data-painted-primary]').click(); } catch (error) {
    report.launchDiagnostics = await page.locator('[data-painted-primary]').evaluate(button => {
      const b = button.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
      const node = el => ({ tag: el.tagName, cls: el.className, inert: el.inert, ariaHidden: el.getAttribute('aria-hidden'), pointer: getComputedStyle(el).pointerEvents, zIndex: getComputedStyle(el).zIndex });
      const ancestors = []; let el = button; while (el) { ancestors.push(node(el)); el = el.parentElement; }
      return { ancestors, atCenter: document.elementsFromPoint(x, y).map(node), bodyStyle: document.body.getAttribute('style') };
    });
    throw error;
  }
  await page.locator('.hunt-player[data-phase="playing"]').waitFor();
  await page.waitForTimeout(250);
  assert.equal(await card(page).count(), 0);
  const canvas = page.locator('.hunt-world canvas');
  assert(await canvas.isVisible());
  pass('Dismissed journal leaves map input usable; real typhoon level starts');
}
try {
  assert.equal(nodes.length, 24, 'Expected 24 formal levels');
  report.htmlSha256 = hash(fs.readFileSync(html));
  report.scriptSha256 = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
  await inspectAssets();
  const { chromium } = playwright();
  browser = await chromium.launch({ headless: true, executablePath: executable(chromium), args: ['--mute-audio'] });
  report.browser = browser.version();
  for (const kind of motionOnly ? [] : ['zero', 'partial', 'complete']) {
    const run = await fixture(kind), { page, completed } = run;
    const before = await saved(page);
    await open(page); await stats(page, completed);
    assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
    const motion = await card(page).evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running' && Number(animation.effect?.getTiming().duration) > 1).map(animation => animation.animationName));
    assert.equal(motion.length, 0, 'Reduced-motion journal has a running decorative animation');
    if (kind === 'partial') {
      for (const [width, height] of [[390, 844], [320, 568], [1440, 900]]) await geometry(page, 'mine', width, height);
      await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
      await verifyReadonly(page, before);
      await board(page);
      for (const [width, height] of [[390, 844], [320, 568], [1440, 900]]) await geometry(page, 'board', width, height);
      await page.setViewportSize({ width: 320, height: 568 }); await page.waitForTimeout(200);
      await page.getByTestId('journal-tab-mine').click();
      await verifyDismissal(page, before);
      await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
      await verifyEditorAndSwitch(page);
      await verifyMuted(page);
      await launchAfterDismissal(page);
    } else { await geometry(page, kind, 390, 844); await outside(page); await storageUnchanged(page, before, `${kind} visit`); }
    await closeContext(run.context);
  }
  {
    const run = await fixture('partial', 'no-preference'), { page } = run;
    await open(page);
    const animations = await page.evaluate(() => window.__journalAnimations);
    assert(animations.some(event => event.type === 'start'), 'Normal motion entry did not animate');
    await oneCue(page, 'Keyboard leaderboard tab', async () => { await page.getByTestId('journal-tab-board').focus(); await page.keyboard.press('Enter'); });
    await oneCue(page, 'Keyboard my-progress tab', async () => { await page.getByTestId('journal-tab-mine').focus(); await page.keyboard.press('Enter'); });
    await oneCue(page, 'Arrow-key leaderboard tab', async () => { await page.getByTestId('journal-tab-mine').focus(); await page.keyboard.press('ArrowLeft'); });
    assert.equal(await card(page).getAttribute('data-view'), 'board');
    await oneCue(page, 'End-key my-progress tab', async () => { await page.keyboard.press('End'); });
    assert.equal(await card(page).getAttribute('data-view'), 'mine');
    await oneCue(page, 'Avatar interaction', () => page.getByTestId('journal-avatar').click());
    assert(await card(page).getByText('我先得意一下。', { exact: true }).isVisible());
    await oneCue(page, 'Island detail interaction', () => page.getByTestId('journal-island-nature').click());
    assert((await page.getByTestId('journal-island-insight').innerText()).includes('还差 9 关'));
    await oneCue(page, 'Outside journal close', () => outside(page));
    pass(motionOnly ? 'Normal motion entry and native interaction animations present' : 'Normal motion entry is present and reduced-motion fixture suppresses it', { animations });
    await closeContext(run.context);
  }
  assert.equal(report.errors.length, 0, `Runtime errors: ${JSON.stringify(report.errors)}`);
  assert.equal(report.network.length, 0, `HTTP(S) requests: ${JSON.stringify(report.network)}`);
  assert.equal(report.failedRequests.length, 0, `Failed requests: ${JSON.stringify(report.failedRequests)}`);
  report.finalHtmlSha256 = hash(fs.readFileSync(html));
  assert.equal(report.finalHtmlSha256, report.htmlSha256, 'HTML changed during QA');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || error.message; console.error(report.failure); process.exitCode = 1;
  if (lastPage && !lastPage.isClosed()) await shot(lastPage, 'failure').catch(() => {});
} finally {
  for (const context of [...contexts]) { try { await closeContext(context); } catch (error) { report.errors.push(`Close context: ${error.message}`); } }
  if (browser) { try { await browser.close(); report.browserClosed = true; } catch (error) { report.errors.push(`Close browser: ${error.message}`); } }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), [
    '# 手绘红人榜与我的进度：最终离线 HTML 验收', '',
    `- 结果：${report.status}；范围：${report.mode}`, `- HTML：${html}`, `- SHA-256：${report.htmlSha256}`,
    `- 浏览器：${report.browser}；独立 headless、offline、--mute-audio。`,
    `- finally 关闭 contexts：${report.contextsClosed}/${report.contextsCreated}；browser：${report.browserClosed}。`,
    '- 默认我的进度；真实当前进度、其他玩家只读查看、示例不写存档；明确切换才改变当前玩家。',
    '- 0、混合旧版花数、24关全完成；自然灾害/公共安全/居家校园办公三岛数据与存档逐项比对。',
    '- 320×568、390×844、1440×900布局；页签、内外点击、Escape、焦点、再打开与实际关卡入口。',
    '- 动效、减少动态效果与点击音效计数均在浏览器实测；音频全程静音，无人耳试听结论。',
    `- 样本：${report.fixture}`, `- 错误 ${report.errors.length}；HTTP(S)请求 ${report.network.length}；失败请求 ${report.failedRequests.length}。`,
    '- physicalDevice: not_run', '- humanAudio: not_run',
    ...(report.failure ? ['', '## 失败', '', '```text', report.failure, '```'] : []),
    '', '## 截图', '', ...report.screenshots.map(file => `- [${file}](${file})`), '',
  ].join('\n'));
}
