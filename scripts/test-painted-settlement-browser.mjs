/**
 * QA against the FINAL exported offline HTML, never against a separate UI clone.
 * Coverage matrix: 24 controlled player.onFinish boundary fixtures + genuine
 * typhoon-home pointer gameplay. Fixtures are explicitly NOT earned gameplay.
 * Every browser/context is isolated, muted and closed in finally blocks.
 * Optional: OFFLINE_FILE, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE,
 * PAINTED_SETTLEMENT_TEST_OUTPUT. This script does not build/export the game.
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
const output = path.resolve(root, process.env.PAINTED_SETTLEMENT_TEST_OUTPUT || 'docs/painted-settlement/verification');
const map = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8'));
const nodes = map.regions.flatMap(region => region.nodes.map(node => ({ ...node, regionId: region.id })));
const sizes = [[390, 844], [320, 568], [430, 932], [1440, 900]];
const boardKey = 'little-red-flower-leaderboard-v1';
const surface = '.hunt-player,.disaster-player,.configured-player,.kitchen-player';
const dialog = '.garden-settlement.painted-settlement';
const cta = '[data-testid="settlement-primary"]';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {
  status: 'running', startedAt: new Date().toISOString(), html, htmlSha256: null,
  browser: null, controlledCompletions: [], genuineGameplay: [], layouts: [], checks: [],
  screenshots: [], errors: [], network: [], failedRequests: [], contextsCreated: 0, contextsClosed: 0,
  browserClosed: false, physicalDevice: 'not_run', humanAudio: 'not_run',
  fixture: '24 isolated synthetic entry fixtures: each tested level uncompleted, the other 23 preset complete solely to unlock entry. The existing start_emergency_level tool opens MainGameApp. The current mounted player onFinish(levelId,3) callback is invoked through React fiber for rendering/completion-boundary QA. These 24 are NOT pointer gameplay or earned progress. Separate clean-profile typhoon-home tests use actual canvas pointer input and real completion.',
};
fs.mkdirSync(output, { recursive: true });
const passed = (name, detail = {}) => {
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
  throw new Error('Playwright unavailable; set PLAYWRIGHT_MODULE.');
}
function findBrowser(chromium) {
  const choices = process.env.BROWSER_EXECUTABLE ? [process.env.BROWSER_EXECUTABLE] : [
    chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/chromium', '/usr/bin/google-chrome',
  ];
  const file = choices.find(candidate => fs.existsSync(candidate));
  assert(file, 'Chromium unavailable; set BROWSER_EXECUTABLE.');
  return file;
}
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function screenshot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(output, file) });
  report.screenshots.push(file);
}
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), boardKey);
const scores = state => state.players.find(player => player.id === state.activePlayerId).completed;
const total = state => Object.values(scores(state)).reduce((sum, score) => sum + score, 0);
let browser;
let runtime;
let temp;

async function withPage(id, clean, task) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true,
    deviceScaleFactor: 1, offline: true,
  });
  report.contextsCreated++;
  let page;
  try {
    await context.addInitScript(({ ids, levelId, clean, boardKey }) => {
      const playerId = `settlement-QA-${levelId}`;
      const completed = clean ? {} : Object.fromEntries(ids.filter(id => id !== levelId).map(id => [id, 3]));
      localStorage.setItem(boardKey, JSON.stringify({ version: 1, activePlayerId: playerId, players: [{
        id: playerId, name: '弹窗隔离验收', region: '', createdAt: 1, completed,
      }] }));
      const registry = new Map();
      Object.defineProperty(document, 'modelContext', { configurable: true, value: {
        registerTool(tool, options) {
          registry.set(tool.name, tool);
          options?.signal?.addEventListener('abort', () => {
            if (registry.get(tool.name) === tool) registry.delete(tool.name);
          });
        },
      } });
      window.__settlementQaTools = registry;
    }, { ids: nodes.map(node => node.id), levelId: id, clean, boardKey });
    page = await context.newPage();
    page.setDefaultTimeout(20_000);
    page.on('pageerror', error => report.errors.push({ id, message: error.message }));
    page.on('request', request => { if (/^https?:/.test(request.url())) report.network.push({ id, url: request.url() }); });
    page.on('requestfailed', request => report.failedRequests.push({ id, url: request.url().slice(0, 160), failure: request.failure()?.errorText }));
    await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => window.__settlementQaTools?.has('start_emergency_level'));
    await page.locator('[data-home-start]').waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    await task(page);
  } catch (error) {
    if (page && !page.isClosed()) await screenshot(page, `${id}-failure`).catch(() => {});
    throw error;
  } finally {
    await context.close();
    report.contextsClosed++;
  }
}

async function openLevel(page, id, start = true) {
  await page.evaluate(id => window.__settlementQaTools.get('start_emergency_level').execute({ levelId: id }), id);
  await page.locator(`[data-painted-intro][data-level-id="${id}"]`).waitFor({ state: 'visible' });
  if (start) {
    await page.locator('.painted-intro-start:not(:disabled)').waitFor({ state: 'visible' });
    await page.locator('.painted-intro-start').click();
    await page.locator('[data-painted-intro]').waitFor({ state: 'detached' });
  }
}

/** Controlled completion boundary only; does not change engine internals or claim genuine play. */
async function finishBoundary(page, id, twice = false) {
  const owner = await page.locator(surface).evaluate((element, { id, twice }) => {
    const key = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
    if (!key) throw new Error('React fiber unavailable; controlled completion cannot run.');
    for (let fiber = element[key]; fiber; fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (typeof props?.onFinish === 'function' && props.journey === true) {
        props.onFinish(id, 3);
        if (twice) props.onFinish(id, 3);
        return { owner: fiber.type?.name || 'minified-player', levelId: id, repeatedBoundary: twice };
      }
    }
    throw new Error('Mounted journey player onFinish callback unavailable.');
  }, { id, twice });
  await page.locator(dialog).waitFor({ state: 'visible' });
  return owner;
}

async function verifyContent(page, id, replay = false) {
  const panel = page.locator(dialog);
  const lesson = runtime.knowledge.lessonFor(id);
  const expectedTitle = runtime.catalog.getLevel(id).title;
  const primary = panel.locator(cta);
  await primary.waitFor({ state: 'visible' });
  await page.waitForFunction(({ dialog, cta }) => {
    const button = document.querySelector(dialog)?.querySelector(cta);
    return !!button && !button.disabled && /^(种下小红花|回到地图)$/.test(button.textContent.trim());
  }, { dialog, cta });
  const text = (await panel.innerText()).replace(/\s+/g, ' ').trim();
  assert.equal((await panel.locator('[data-testid="settlement-title"]').innerText()).trim(), '还得是你！', `${id}: missing approved title`);
  assert.equal((await panel.locator('[data-testid="settlement-level"]').innerText()).trim(), expectedTitle, `${id}: incorrect scenario title ${expectedTitle}`);
  assert(!text.includes('· 已完成'), `${id}: obsolete completed suffix`);
  assert.equal(await panel.locator('[data-testid="settlement-point"]').count(), 3, `${id}: needs three concise knowledge points`);
  const renderedPoints = await panel.locator('[data-testid="settlement-point"]').allTextContents();
  assert.equal(lesson.points.length, 3, `${id}: knowledge schema must contain three points`);
  for (let i = 0; i < 3; i++) {
    const point = lesson.points[i];
    for (const copy of typeof point === 'string' ? [point] : Object.values(point).filter(value => typeof value === 'string')) {
      assert(renderedPoints[i].includes(copy), `${id}: knowledge point ${i + 1} does not match reviewed source data`);
    }
  }
  assert.equal((await primary.innerText()).trim(), replay ? '回到地图' : '种下小红花', `${id}: incorrect primary action`);
  assert.equal(await panel.locator('.painted-settlement-reward > .garden-flower').count(), 3, `${id}: wrong reward flower count`);
  assert.equal(await panel.locator('.garden-footnote').count(), 0, `${id}: button footnote should be removed`);
  if (replay) {
    assert(!text.includes('+3'), `${id}: replay implies duplicate award`);
    assert(text.includes('已种下'), `${id}: replay has no planted state`);
  } else assert(text.includes('+3'), `${id}: first award missing`);
  const links = await panel.locator('[data-testid="settlement-knowledge"] a').evaluateAll(links => links.map(link => ({
    href: link.getAttribute('href'), target: link.target, rel: link.rel, label: link.textContent.trim(),
  })));
  assert(links.length > 0, `${id}: missing knowledge references`);
  for (const link of links) {
    assert.equal(new URL(link.href).protocol, 'https:', `${id}: unsafe source protocol`);
    assert.equal(link.target, '_blank');
    assert(/\b(noreferrer|noopener)\b/.test(link.rel), `${id}: source can access opener`);
    assert(link.label.length > 0, `${id}: empty reference label`);
  }
  const sources = lesson.sources || [{ url: lesson.url }];
  assert.deepEqual(links.map(link => link.href).sort(), [...new Set(sources.map(source => source.url))].sort(), `${id}: sources mismatch`);
  const images = await panel.locator('img').evaluateAll(async images => Promise.all(images.map(async image => {
    try { await image.decode(); } catch { /* dimensions below report failure */ }
    return { width: image.naturalWidth, height: image.naturalHeight, embedded: /^(data:|blob:)/.test(image.currentSrc || image.src) };
  })));
  assert(images.length > 0 && images.every(image => image.width && image.height && image.embedded), `${id}: missing or nonembedded artwork`);
  if (!report.renderedArtwork) {
    const backgrounds = await panel.evaluate(element => {
      const urls = [];
      for (const node of [element, ...element.querySelectorAll('*')]) {
        if (node.tagName === 'IMG') urls.push(node.currentSrc || node.src);
        for (const pseudo of [null, '::before', '::after']) {
          for (const match of getComputedStyle(node, pseudo).backgroundImage.matchAll(/url\(["']?(data:image\/[^"')]+)["']?\)/g)) urls.push(match[1]);
        }
      }
      return [...new Set(urls)].filter(url => url.startsWith('data:image/'));
    });
    const renderedHashes = backgrounds.map(url => hash(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')));
    for (const asset of report.sourceArtwork) assert(renderedHashes.includes(asset.sha256), `${id}: selected ${asset.name} artwork is not actually rendered`);
    report.renderedArtwork = report.sourceArtwork.map(asset => ({ ...asset, embeddedAndRenderedMatch: true }));
  }
  return { id, scenarioTitle: expectedTitle, points: renderedPoints, sources: links, replay, imageCount: images.length };
}

async function verifyLayout(page, id, width, height) {
  await page.setViewportSize({ width, height });
  await settle(page);
  const panel = page.locator(dialog);
  await panel.evaluate(element => { element.scrollTop = 0; });
  const initial = await panel.evaluate(element => {
    const bounds = node => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const points = [...element.querySelectorAll('[data-testid="settlement-point"]')];
    return {
      card: bounds(element), scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1,
      points: points.map(point => ({ ...bounds(point), clippedHorizontally: point.scrollWidth > point.clientWidth + 1 })),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      activeAnimations: element.getAnimations({ subtree: true }).map(animation => ({
        duration: animation.effect?.getComputedTiming().duration, name: animation.animationName || '',
      })),
    };
  });
  const label = `${id} ${width}x${height}`;
  assert(!initial.horizontalOverflow, `${label}: horizontal overflow`);
  assert(initial.card.x >= -1 && initial.card.right <= width + 1 && initial.card.y >= -1 && initial.card.bottom <= height + 1, `${label}: popup outside viewport`);
  assert(initial.points.every(point => point.width > 0 && point.height > 0 && !point.clippedHorizontally), `${label}: clipped knowledge text`);
  if (initial.scrollHeight > initial.clientHeight + 1) assert(/auto|scroll/.test(initial.overflowY), `${label}: tall popup cannot scroll`);
  assert(initial.reducedMotion, `${label}: reduced-motion preference unavailable`);
  assert(initial.activeAnimations.every(animation => typeof animation.duration === 'number' && animation.duration <= 100), `${label}: large animation still runs with reduced-motion`);
  if (['oil-fire', 'fire-shelter-practice', 'typhoon-home'].includes(id)) await screenshot(page, `${id}-${width}x${height}`);
  const primary = panel.locator(cta);
  await primary.scrollIntoViewIfNeeded();
  await settle(page);
  const button = await primary.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height,
      hits: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === element };
  });
  assert(button.width >= 44 && button.height >= 44 && button.x >= -1 && button.right <= width + 1 && button.y >= -1 && button.bottom <= height + 1 && button.hits, `${label}: CTA not reachable: ${JSON.stringify(button)}`);
  await primary.focus();
  const focusSteps = (await panel.locator('a[href],button:not(:disabled),[tabindex="0"]').count()) + 2;
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < focusSteps; i++) {
      await page.keyboard.press(key);
      // Base UI briefly focuses its boundary sentinel, then redirects within the
      // same rendering turn. Check the settled user-visible focus destination.
      await settle(page);
      const focus = await panel.evaluate(element => ({ inside: element.contains(document.activeElement), active: document.activeElement?.outerHTML.slice(0, 300) }));
      assert(focus.inside, `${label}: ${key} escaped modal: ${focus.active}`);
    }
  }
  report.layouts.push({ id, width, height, ...initial, button, focusChecks: focusSteps * 2 });
  if (['oil-fire', 'fire-shelter-practice', 'typhoon-home'].includes(id)) {
    if (initial.scrollHeight > initial.clientHeight + 1) {
      await primary.scrollIntoViewIfNeeded();
      await screenshot(page, `${id}-${width}x${height}-scrolled`);
    }
  }
}

async function verifyReturned(page, id, replay = false) {
  await page.locator(`${dialog} ${cta}`).click();
  await page.locator('[data-map-node]').first().waitFor({ state: 'attached' });
  await page.locator(`[data-map-node="${id}"][data-status="complete"]`).waitFor({ state: 'attached' });
  if (replay) assert.equal(await page.locator('.garden-shell').getAttribute('data-planting'), '', `${id}: replay should not plant again`);
}

async function actualTyphoon(page) {
  const id = 'typhoon-home';
  const pack = runtime.hunts.getHunt(id);
  const { data } = await dependency('sharp')(path.join(root, 'public', pack.skin.mask.slice(1))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  await openLevel(page, id, true);
  for (const target of pack.rules.targets) {
    const b = await page.locator('.hunt-world canvas').boundingBox();
    const cam = runtime.huntViewport.sceneCamera(pack.skin, b.width, b.height);
    const color = pack.skin.targets[target.id].color;
    const points = [];
    for (let y = 0; y < pack.skin.height; y += 3) {
      for (let x = 0; x < pack.skin.width; x += 3) {
        const at = (y * pack.skin.width + x) * 4;
        if (data[at + 3] > 128 && color.every((value, index) => data[at + index] === value)) {
          const px = b.x + cam.x + (x + .5) * cam.scaleX;
          const py = b.y + cam.y + (y + .5) * cam.scaleY;
          if (px > b.x + 5 && px < b.x + b.width - 5 && py > b.y + 70 && py < b.y + b.height - 25) points.push({ x: px, y: py });
        }
      }
    }
    const point = await page.evaluate(points => {
      const visible = points.filter(point => document.elementFromPoint(point.x, point.y)?.tagName === 'CANVAS');
      return visible[Math.floor(visible.length / 2)];
    }, points);
    assert(point, `${target.id}: no visible canvas hit target`);
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForFunction(id => document.querySelector('.hunt-player')?.getAttribute('data-found')?.split(',').includes(id), target.id);
  }
  await page.locator(dialog).waitFor({ state: 'visible' });
  await verifyContent(page, id);
  assert.equal(total(await saved(page)), 3, 'Genuine clean-profile completion should award exactly three flowers');
  await screenshot(page, 'genuine-typhoon-completion');
  report.genuineGameplay.push({ id, targetCount: pack.rules.targets.length, input: 'real canvas touchscreen taps selected from authored mask; no injected completion', reward: 3 });
  await verifyReturned(page, id);
  const beforeReplay = await saved(page);
  await openLevel(page, id);
  await finishBoundary(page, id, true);
  await verifyContent(page, id, true);
  assert.deepEqual(await saved(page), beforeReplay, 'Controlled replay completion changed existing reward');
  await verifyReturned(page, id, true);
  passed('Genuine typhoon-home gameplay awards three; controlled replay awards zero and does not plant again');
}

async function saveFailures(page) {
  const id = 'oil-fire';
  await openLevel(page, id);
  const original = await saved(page);
  await page.evaluate(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 1, activePlayerId: 'other-QA-player', players: [{
    id: 'other-QA-player', name: '另一个验收玩家', region: '', createdAt: 2, completed: {},
  }] })), { key: boardKey });
  await finishBoundary(page, id);
  await page.waitForFunction(({ dialog, cta }) => document.querySelector(dialog)?.querySelector(cta)?.textContent.trim() === '重试保存', { dialog, cta });
  assert(!((await page.locator(dialog).innerText()).includes('+3')), 'Failed receipt must not claim flowers');
  assert.equal(total(await saved(page)), 0, 'Failed receipt wrote a reward into the wrong player');
  await screenshot(page, 'save-failure-retry');
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: boardKey, state: original });
  await page.locator(`${dialog} ${cta}`).click();
  await verifyContent(page, id);
  assert.equal(total(await saved(page)), 72, 'Retry should add precisely three after restoring the fixture player');
  await screenshot(page, 'save-retry-success');
  passed('Missing current session player fails real claim; restored fixture retries successfully without awarding wrong player');
}

async function quotaFallback(page) {
  const id = 'oil-fire';
  await openLevel(page, id);
  const before = await saved(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (entry, value) {
      if (entry === key) throw new DOMException('QA simulated quota failure', 'QuotaExceededError');
      return original.call(this, entry, value);
    };
  }, boardKey);
  await finishBoundary(page, id);
  await verifyContent(page, id);
  assert.deepEqual(await saved(page), before, 'Quota fallback unexpectedly changed persistent bytes');
  assert.match(await page.locator('.game-save-notice').innerText(), /暂存|当前页面|未能保存/, 'No visible session-only persistence notice');
  await page.locator(`${dialog} ${cta}`).scrollIntoViewIfNeeded();
  await screenshot(page, 'quota-session-fallback');
  await verifyReturned(page, id);
  passed('Quota failure preserves existing save, displays session-only notice and permits map return');
}

try {
  assert.equal(nodes.length, 24, 'Expected 24 formal map levels');
  const bytes = fs.readFileSync(html);
  report.htmlSha256 = hash(bytes);
  assert(bytes.includes(Buffer.from('painted-settlement')), 'Export final HTML first; painted settlement absent');
  report.sourceArtwork = ['header', 'body', 'footer', 'button'].map(name => {
    const file = path.join(root, 'public/ui/painted-settlement-v1', `${name}.webp`);
    const image = fs.readFileSync(file);
    assert(bytes.includes(Buffer.from(image.toString('base64'))), `${name} artwork is missing from final HTML`);
    return { name, file, sha256: hash(image) };
  });
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'painted-settlement-qa-'));
  const runtimeFile = path.join(temp, 'runtime.mjs');
  await dependency('esbuild').build({
    absWorkingDir: root,
    stdin: { contents: [
      "export * as knowledge from './app/game/journey/knowledge';",
      "export * as catalog from './app/game/levels';",
      "export * as hunts from './app/game/scene-hunt/registry';",
      "export * as huntViewport from './app/game/scene-hunt/viewport';",
    ].join('\n'), resolveDir: root },
    bundle: true, platform: 'node', format: 'esm', outfile: runtimeFile, logLevel: 'silent',
  });
  runtime = await import(pathToFileURL(runtimeFile));
  const { chromium } = findPlaywright();
  browser = await chromium.launch({ headless: true, executablePath: findBrowser(chromium), args: ['--mute-audio'] });
  report.browser = browser.version();
  // Prioritize the user's reviewed reference for early visual QA.
  const verificationOrder = [...nodes].sort((a, b) => Number(b.id === 'oil-fire') - Number(a.id === 'oil-fire'));
  for (const node of verificationOrder) {
    await withPage(node.id, false, async page => {
      const before = total(await saved(page));
      assert.equal(before, 69);
      await openLevel(page, node.id);
      const boundary = await finishBoundary(page, node.id, true);
      await page.waitForFunction(() => document.activeElement?.matches('[data-testid="settlement-title"]'));
      assert(await page.locator('[data-testid="settlement-title"]').evaluate(element => document.activeElement === element), `${node.id}: popup should focus its heading rather than scroll down to the action`);
      const observed = await verifyContent(page, node.id);
      assert.equal(total(await saved(page)), 72, `${node.id}: duplicate finish emitted duplicate reward`);
      for (const [width, height] of sizes) await verifyLayout(page, node.id, width, height);
      report.controlledCompletions.push({ ...observed, boundary, award: 3, coverage: 'controlled completion boundary; not genuine gameplay' });
      await verifyReturned(page, node.id);
      passed(`${node.id}: correct title/three knowledge points/references/three flowers, four layouts, focus trap and CTA`);
    });
  }
  await withPage('typhoon-home', true, actualTyphoon);
  await withPage('oil-fire', false, saveFailures);
  await withPage('oil-fire', false, quotaFallback);
  assert.equal(report.controlledCompletions.length, 24);
  assert.equal(report.layouts.length, 96);
  assert.equal(report.errors.length, 0, `Runtime errors: ${JSON.stringify(report.errors)}`);
  assert.equal(report.network.length, 0, `HTTP(S) requests while offline: ${JSON.stringify(report.network)}`);
  assert.equal(report.failedRequests.length, 0, `Failed requests: ${JSON.stringify(report.failedRequests)}`);
  report.finalHtmlSha256 = hash(fs.readFileSync(html));
  assert.equal(report.finalHtmlSha256, report.htmlSha256, 'Final artifact changed during QA');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || error.message;
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  if (browser) { await browser.close(); report.browserClosed = true; }
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), [
    '# 完成弹窗：最终离线 HTML 验证', '',
    `- 结果：${report.status}`, `- HTML：${html}`, `- SHA-256：${report.htmlSha256}`,
    `- 浏览器：${report.browser}；headless、独立存储、offline、--mute-audio。`,
    `- finally 清理：${report.contextsClosed}/${report.contextsCreated} contexts；browserClosed=${report.browserClosed}。`,
    `- 受控完成边界：${report.controlledCompletions.length}/24；视口样本：${report.layouts.length}/96。`,
    `- 视口：${sizes.map(size => size.join('×')).join('、')}；检查滚动、无横向溢出、CTA可见可点、键盘焦点限制与 reduced-motion。`,
    '- 24关受控样本通过现有 MainGameApp/player.onFinish → 真正共用 Settlement；预设23关解锁夹具。**不是24关实际通关测试。**',
    `- 真实指针通关：${report.genuineGameplay.map(item => item.id).join('、') || 'not_run'}；随后受控重玩检查0奖励与不重复种花。`,
    '- 真实claim失败/恢复重试：用另一份有效测试存档临时移除session玩家，再恢复；不修改真实用户数据。',
    '- localStorage配额失败：验证既有session降级提示、旧持久存档不变且可继续。',
    '- 科普来源仅核对页面显示与已审阅数据一致、HTTPS及新窗口隔离；脚本不会访问链接。',
    `- 运行时错误 ${report.errors.length}；HTTP(S)请求 ${report.network.length}；失败请求 ${report.failedRequests.length}。`,
    '- physicalDevice: not_run', '- humanAudio: not_run',
    ...(report.failure ? ['', '## 失败', '', '```text', report.failure, '```'] : []),
    '', '## 截图', '', ...report.screenshots.map(file => `- [${file}](${file})`), '',
  ].join('\n'));
}
