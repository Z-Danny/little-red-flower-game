/** Focused v2 motion QA against an already-exported offline HTML.
 * Disposable offline muted browser; all contexts/browser close in finally.
 * No production debug entry, build, export, real saves, or reward injection.
 * Optional OFFLINE_FILE, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE,
 * PAINTED_FAILURE_MOTION_OUTPUT.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dependency, root } from './lib/dependencies.mjs';
const require = createRequire(import.meta.url);
const html = path.resolve(root, process.env.OFFLINE_FILE || 'outputs/本地离线版/小红花应急行动.html');
const output = path.resolve(root, process.env.PAINTED_FAILURE_MOTION_OUTPUT || 'docs/painted-failure/v2-verification');
const videoOnly = process.env.PAINTED_FAILURE_MOTION_VIDEO_ONLY === '1';
const nodes = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8')).regions.flatMap(region => region.nodes);
const boardKey = 'little-red-flower-leaderboard-v1';
const host = '.hunt-player,.disaster-player,.configured-player,.kitchen-player';
const popup = '.painted-failure';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const report = {
  status: 'running', startedAt: new Date().toISOString(), html, htmlSha256: null,
  cases: [], layouts: [], exits: [], checks: [], screenshots: [], videos: [], errors: [], network: [], failedRequests: [],
  contextsCreated: 0, contextsClosed: 0, browserClosed: false,
  physicalDevice: 'not_run', humanAudio: 'not_run',
  fixture: 'Each private test profile presets the other 23 levels complete only for access. The existing modelContext start callback opens a real autoStart player. First normal-motion hunt failure uses real target input and Playwright RAF timeout; collection and repeat timeouts use documented mounted-engine clock boundaries. Flood/shelter mistakes use real canvas input. No completion/reward callback is injected.',
  motionInstrumentation: 'Native setTimeout/clearTimeout are wrapped transparently after Playwright clock installation. Actual animation events and DOM phase changes are recorded with document.timeline.currentTime. First actions use real click/keyboard; captured existing React button handlers are then repeated to challenge the synchronous lock without altering callbacks or React state. One optional interrupted-animation check cancels only the current CSS exit animation to exercise the existing fallback.',
};
fs.mkdirSync(output, { recursive: true });
const passed = (name, detail = {}) => { report.checks.push({ name, status: 'passed', ...detail }); console.log(`PASS ${name}`); };
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
const settle = page => page.clock.runFor(40);
async function shot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(output, file) });
  report.screenshots.push(file);
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

async function withPage(spec, motion, task) {
  const record = spec.id === 'quake-bedroom-v2' && motion === 'no-preference' && report.videos.length === 0;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: motion, hasTouch: true, deviceScaleFactor: 1, offline: true, ...(record ? { recordVideo: { dir: path.join(temp, 'video'), size: { width: 390, height: 844 } } } : {}) });
  report.contextsCreated++;
  let page;
  try {
    await context.addInitScript(({ ids, id, boardKey }) => {
      const player = `failure-motion-QA-${id}`;
      localStorage.setItem(boardKey, JSON.stringify({ version: 1, activePlayerId: player, players: [{ id: player, name: '失败动效验收', region: '', createdAt: 1, completed: Object.fromEntries(ids.filter(item => item !== id).map(item => [item, 3])) }] }));
      const registry = new Map();
      Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool(tool, options) {
        registry.set(tool.name, tool);
        options?.signal?.addEventListener('abort', () => { if (registry.get(tool.name) === tool) registry.delete(tool.name); });
      } } });
      window.__failureQaTools = registry;
    }, { ids: nodes.map(node => node.id), id: spec.id, boardKey });
    const videoStart = performance.now();
    page = await context.newPage();
    if (record) page.__motionVideo = { started: videoStart, marks: {} };
    page.setDefaultTimeout(20_000);
    page.on('pageerror', error => report.errors.push({ id: spec.id, motion, message: error.message }));
    page.on('request', request => { if (/^https?:/.test(request.url())) report.network.push(request.url()); });
    page.on('requestfailed', request => report.failedRequests.push({ url: request.url().slice(0, 160), error: request.failure()?.errorText }));
    await page.clock.install();
    await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => window.__failureQaTools?.has('start_emergency_level'));
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      const schedule = window.setTimeout, cancel = window.clearTimeout;
      window.__failureMotion = { armed: false, timers: [], events: [], staleHandlers: [] };
      window.setTimeout = function (callback, delay, ...args) {
        const qa = window.__failureMotion;
        const record = qa.armed && delay === 240 ? { delay, scheduledAt: document.timeline.currentTime, fired: 0, cancelled: 0 } : null;
        const id = schedule.call(window, function (...values) {
          if (record) { record.fired++; record.firedAt = document.timeline.currentTime; }
          return typeof callback === 'function' ? callback(...values) : window.eval(callback);
        }, delay, ...args);
        if (record) { record.id = id; qa.timers.push(record); }
        return id;
      };
      window.clearTimeout = function (id) {
        const record = window.__failureMotion.timers.find(record => record.id === id);
        if (record) record.cancelled++;
        return cancel.call(window, id);
      };
      for (const name of ['animationstart', 'animationend', 'animationcancel']) document.addEventListener(name, event => {
        if (event.target.closest?.('.painted-failure')) window.__failureMotion.events.push({ type: name, name: event.animationName, time: document.timeline.currentTime });
      }, true);
    });
    await task(page);
  } catch (error) {
    if (page && !page.isClosed()) await shot(page, `${spec.id}-${motion}-failure`).catch(() => {});
    throw error;
  } finally {
    await context.close(); report.contextsClosed++;
    if (record && page?.video()) {
      const video = await page.video().path(), marks = page.__motionVideo?.marks;
      if (videoOnly) {
        const file = 'quake-normal-motion-390x844.webm';
        fs.copyFileSync(video, path.join(output, file));
        report.videos.push({ file, note: 'Continuous actual browser video at 390×844, from isolated page load through a controlled real-engine timeout, authored failure motion, and a real retry click. No viewport changes, artificial animation, or time splices.' });
        fs.writeFileSync(path.join(output, 'motion-preview.html'), `<!doctype html><meta charset="utf-8"><title>失败弹窗真实浏览器录屏</title><style>body{margin:0;background:#173e34;color:#fff4d5;font:16px system-ui;text-align:center}video{display:block;max-width:100%;max-height:88vh;margin:16px auto}p{margin:12px}</style><video controls autoplay muted loop playsinline src="${file}"></video><p>390 × 844 真实浏览器连续录屏：进入关卡、失败入场、重试退出。</p>`);
      } else if (marks?.entryStart !== undefined && marks.entryEnd !== undefined && marks.retryStart !== undefined && marks.retryEnd !== undefined) {
        const file = 'quake-normal-motion-390x844.webm';
        const segments = [[marks.entryStart, marks.entryEnd], [marks.retryStart, marks.retryEnd]];
        const filter = segments.map(([start, end], index) => `[0:v]trim=start=${Math.max(0, start - .15).toFixed(3)}:end=${(end + .15).toFixed(3)},setpts=PTS-STARTPTS[v${index}]`).join(';') + ';[v0][v1]concat=n=2:v=1:a=0[out]';
        const result = spawnSync(process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-filter_complex', filter, '-map', '[out]', '-an', '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', path.join(output, file)], { encoding: 'utf8' });
        assert.equal(result.status, 0, `Video trim failed: ${result.stderr}`);
        report.videos.push({ file, segments, note: 'Two clips from the same actual browser run: normal 390px failure entry/hold, then retry exit. Only intervening responsive QA steps were cut; no fabricated animation.' });
        fs.writeFileSync(path.join(output, 'motion-preview.html'), `<!doctype html><meta charset="utf-8"><title>失败弹窗真实浏览器录屏</title><style>body{margin:0;background:#173e34;color:#fff4d5;font:16px system-ui;text-align:center}video{display:block;max-width:100%;max-height:88vh;margin:16px auto}p{margin:12px}</style><video controls autoplay muted loop playsinline src="${file}"></video><p>真实浏览器录屏：入场与重试退出。已剪去中间的尺寸和键盘验收步骤。</p>`);
      }
    }
  }
}

function videoMark(page, name) {
  if (page.__motionVideo) page.__motionVideo.marks[name] = (performance.now() - page.__motionVideo.started) / 1000;
}

async function open(page, spec) {
  await page.evaluate(id => window.__failureQaTools.get('start_emergency_level').execute({ levelId: id }), spec.id);
  await page.locator(`${host.split(',').map(s => `${s}[data-level="${spec.id}"][data-phase="playing"]`).join(',')}`).waitFor({ state: 'visible' });
  assert.equal(await scene(page).getAttribute('data-auto-start'), 'true', 'Expected current autoStart player');
  assert.equal(await page.locator('[data-painted-intro]').count(), 0, 'Unexpected duplicate scene introduction');
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
}

async function trigger(page, spec, genuineTimeout = false) {
  if (spec.family === 'practice') {
    const rule = await unsafeShelter(page, spec.pack);
    return { kind: 'unsafe-action', reason: rule.feedback, boundary: 'actual canvas taps: close room door, then reopen' };
  }
  if (spec.family === 'disaster') {
    await floodDrop(page, spec.pack, 'outside');
    return { kind: 'unsafe-action', reason: spec.pack.rules.actions.find(action => action.id === 'danger-outside').feedback, boundary: 'actual canvas drag: person into outside floodwater' };
  }
  if (spec.family === 'hunt') await huntTarget(page, spec.pack, spec.pack.rules.targets[0]);
  else {
    const rule = spec.pack.rules.interactions.find(rule => rule.outcome === 'correct' && rule.mode === 'tap');
    assert(rule, 'Collection representative needs a real tap target');
    await configuredTap(page, spec.pack, rule.id);
    await page.clock.runFor(spec.pack.skin.animations[rule.animation].durationMs + 120);
    assert.equal((await progress(page, spec)).length, 1, 'Actual collection target did not commit');
  }
  if (genuineTimeout) {
    const elapsed = Number(await scene(page).getAttribute('data-elapsed'));
    await page.clock.runFor(Math.max(0, spec.seconds * 1000 - elapsed - 500));
    videoMark(page, 'entryStart');
    await page.clock.runFor(800);
    return { kind: 'timeout', boundary: 'real first target input, actual RAF/timer advancement through full timeout' };
  }
  return { kind: 'timeout', boundary: `real first target input; ${await controlledTimeout(page, spec)}` };
}

async function panelChecks(page, spec, motion, triggerResult) {
  const panel = page.locator(popup);
  await panel.waitFor({ state: 'visible' });
  assert.equal(await scene(page).getAttribute('data-phase'), 'failed');
  assert.equal((await panel.locator('[data-testid="failure-title"]').innerText()).trim(), '怎么回事！');
  assert.equal((await panel.locator('[data-testid="failure-retry"]').innerText()).trim(), '不服，再来！');
  assert.equal((await panel.locator('[data-testid="failure-back"]').innerText()).trim(), '返回地图');
  assert.equal((await panel.locator('[data-testid="failure-no-reward"]').innerText()).replace(/\s/g, ''), '本局小红花：0朵');
  assert.equal((await panel.locator('[data-testid="failure-level"]').innerText()).trim(), runtime.catalog.getLevel(spec.id).title);
  assert.equal(await panel.locator('[data-failure-kind]').getAttribute('data-failure-kind'), triggerResult.kind);
  const completed = (await progress(page, spec)).length;
  const reason = await panel.locator('[data-testid="failure-reason"]').innerText();
  const roast = await panel.locator('[data-testid="failure-roast"]').innerText();
  assert((await panel.locator('[data-testid="failure-progress"]').innerText()).replace(/\s/g, '').includes(`${completed}/${spec.total}`));
  if (triggerResult.reason) assert(reason.includes(triggerResult.reason));
  else { assert(reason.includes(String(spec.total - completed))); assert(roast.includes(String(spec.total - completed))); }
  assert.equal(await page.locator('.painted-settlement').count(), 0);
  const images = await panel.locator('img').evaluateAll(async images => Promise.all(images.map(async image => {
    await image.decode();
    return { embedded: /^(data:|blob:)/.test(image.currentSrc || image.src), width: image.naturalWidth, height: image.naturalHeight };
  })));
  assert(images.length >= 3 && images.every(image => image.embedded && image.width > 0 && image.height > 0), 'V2 artwork missing from rendered offline panel');
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
    for (const asset of report.sourceArtwork) assert(rendered.includes(asset.sha256), `${asset.name}: current v2 artwork was embedded but not rendered`);
    report.renderedArtwork = report.sourceArtwork.map(asset => ({ ...asset, embeddedAndRenderedMatch: true }));
  }
  const styles = await panel.evaluate(element => [...element.querySelectorAll('*')].map(node => ({ name: getComputedStyle(node).animationName, duration: getComputedStyle(node).animationDuration })).filter(item => item.name !== 'none'));
  if (motion === 'reduce') assert.equal(styles.length, 0, 'Reduced-motion retained CSS animations');
  else assert(styles.some(style => /failure/.test(style.name)), 'Normal mode has no authored motion');
  await page.waitForTimeout(motion === 'reduce' ? 30 : 800); // Native CSS timeline, distinct from mocked engine clock.
  const focused = await panel.evaluate(element => ({ inside: element.contains(document.activeElement), testid: document.activeElement?.getAttribute('data-testid') }));
  assert(focused.inside, 'Initial focus escaped modal');
  for (const [width, height] of [[390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height }); await settle(page);
    await panel.evaluate(element => { element.scrollTop = 0; });
    const geometry = await panel.evaluate(element => {
      const rect = node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
      const retry = element.querySelector('[data-testid="failure-retry"]'), back = element.querySelector('[data-testid="failure-back"]');
      return { panel: rect(element), retry: rect(retry), back: rect(back), overflow: document.documentElement.scrollWidth > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1, clipped: [...element.querySelectorAll('[data-testid]')].filter(node => {
        // The moving highlight pseudo-element can enlarge scrollWidth even
        // though its overflow is deliberately hidden. Test actual button text.
        if (node.tagName === 'BUTTON') {
          const text = node.querySelector('span').getBoundingClientRect(), button = node.getBoundingClientRect();
          return text.left < button.left || text.right > button.right || text.top < button.top || text.bottom > button.bottom;
        }
        return node.scrollWidth > node.clientWidth + 1;
      }).map(node => node.getAttribute('data-testid')) };
    });
    assert(!geometry.overflow && geometry.clipped.length === 0, `${spec.id}: overflow ${JSON.stringify(geometry)}`);
    assert(geometry.retry.bottom <= geometry.back.y + 1 && Math.abs(geometry.retry.x - geometry.back.x) < 2 && Math.abs(geometry.retry.width - geometry.back.width) < 2, 'Buttons are not stacked full-width');
    assert(geometry.panel.x >= -1 && geometry.panel.right <= width + 1 && geometry.panel.y >= -1 && geometry.panel.bottom <= height + 1, 'Panel leaves viewport');
    await shot(page, `${spec.id}-${motion}-${width}x${height}`);
    for (const testid of ['failure-retry', 'failure-back']) {
      const button = panel.locator(`[data-testid="${testid}"]`);
      await button.scrollIntoViewIfNeeded(); await settle(page);
      assert(await button.evaluate(button => { const b = button.getBoundingClientRect(); return b.width >= 44 && b.height >= 44 && b.y >= -1 && b.bottom <= innerHeight + 1 && document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('button') === button; }), 'Button cannot be reached or is occluded');
    }
    await panel.locator('[data-testid="failure-retry"]').focus();
    for (const key of ['Tab', 'Shift+Tab']) for (let index = 0; index < 3; index++) {
      await page.keyboard.press(key); await settle(page);
      assert(await panel.evaluate(element => element.contains(document.activeElement)), `Focus escaped on ${key}`);
    }
    report.layouts.push({ id: spec.id, motion, width, height, ...geometry });
    if (width === 390) videoMark(page, 'entryEnd');
  }
  await page.setViewportSize({ width: 390, height: 844 }); await settle(page);
  return { completed, reason, roast, styles, initialFocus: focused };
}

async function exit(page, spec, motion, action, { keyboard = false, interruptAnimation = false } = {}) {
  const panel = page.locator(popup), button = panel.locator(`[data-testid="failure-${action}"]`);
  await button.scrollIntoViewIfNeeded(); await settle(page);
  if (keyboard) await button.focus();
  if (action === 'retry' && !interruptAnimation) videoMark(page, 'retryStart');
  const before = Number(await scene(page).getAttribute('data-elapsed'));
  await button.evaluate((button, host) => {
    const qa = window.__failureMotion;
    qa.armed = true; qa.timers = []; qa.events = []; qa.phaseChanges = []; qa.click = null;
    const player = document.querySelector(host);
    const readState = () => player.isConnected ? `${player.dataset.phase}:${player.dataset.elapsed}` : 'detached';
    let previousPhase = player.dataset.phase;
    const observer = new MutationObserver(() => {
      const phase = player.isConnected ? player.dataset.phase : 'detached';
      if (phase !== previousPhase) { qa.phaseChanges.push({ phase, state: readState(), time: document.timeline.currentTime }); previousPhase = phase; }
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-phase', 'data-elapsed'], childList: true });
    qa.observer = observer;
    qa.staleHandlers = [...button.closest('.painted-failure').querySelectorAll('button')].map(node => node[Object.keys(node).find(key => key.startsWith('__reactProps$'))]?.onClick).filter(Boolean);
    button.addEventListener('click', () => {
      qa.click = { time: document.timeline.currentTime, state: readState() };
    }, { once: true });
    // Wait until React's delegated bubble handler has consumed the genuine
    // action. A button-local microtask can run before that delegation and would
    // accidentally make the test's synthetic retry become the first action.
    document.addEventListener('click', () => {
      queueMicrotask(() => { for (let index = 0; index < 4; index++) for (const handler of qa.staleHandlers) handler(); });
    }, { once: true });
  }, host);
  if (keyboard) await page.keyboard.press('Enter'); else await button.click();
  if (motion !== 'reduce') {
    assert.equal(await panel.locator('[data-motion]').getAttribute('data-motion'), 'leaving');
    assert.equal(await panel.locator('[data-motion]').getAttribute('data-exit-action'), action);
    assert.equal(await panel.locator('button:not(:disabled)').count(), 0, 'Exit buttons were not disabled immediately');
    assert.equal(await scene(page).getAttribute('data-phase'), 'failed');
    assert.equal(Number(await scene(page).getAttribute('data-elapsed')), before, 'Countdown started before exit completed');
    if (interruptAnimation) {
      await panel.locator('[data-motion]').evaluate(element => element.getAnimations().forEach(animation => animation.cancel()));
      await page.clock.runFor(239);
      assert.equal(await scene(page).getAttribute('data-phase'), 'failed', 'Fallback ran before 240ms');
      await page.clock.runFor(1);
    } else {
      await page.waitForTimeout(65);
      assert.equal(await scene(page).getAttribute('data-phase'), 'failed', 'Engine restarted before visible exit completed');
      assert.equal(await panel.count(), 1, 'Failure card disappeared before exit');
    }
  }
  await panel.waitFor({ state: 'detached' });
  if (action === 'retry') {
    assert.equal(await scene(page).getAttribute('data-phase'), 'playing', 'Retry did not start existing autoStart engine');
    assert.deepEqual(await progress(page, spec), [], 'Retry retained targets');
    assert(Number(await scene(page).getAttribute('data-elapsed')) < 100, 'Retry clock did not reset');
    await page.clock.runFor(200);
    const advanced = Number(await scene(page).getAttribute('data-elapsed'));
    assert(advanced > 30, 'Fresh retry timer is not ticking');
    await page.evaluate(() => window.__failureMotion.staleHandlers.forEach(handler => handler()));
    await page.clock.runFor(400);
    assert(Number(await scene(page).getAttribute('data-elapsed')) >= advanced + 200, 'Repeated stale handler or delayed fallback reset the live run twice');
  } else {
    await page.locator('[data-map-node]').first().waitFor({ state: 'attached' });
    assert.equal(await scene(page).count(), 0);
    await page.evaluate(() => window.__failureMotion.staleHandlers.forEach(handler => handler()));
    await page.clock.runFor(400);
  }
  const observed = await page.evaluate(() => {
    const qa = window.__failureMotion; qa.armed = false; qa.observer.disconnect();
    return { click: qa.click, timers: qa.timers, events: qa.events, phaseChanges: qa.phaseChanges };
  });
  if (motion === 'reduce') {
    assert.equal(observed.timers.length, 0, 'Reduced motion scheduled an unnecessary exit delay');
    assert.equal(observed.events.filter(event => event.name === 'failure-card-out').length, 0, 'Reduced motion animated exit');
  } else {
    assert.equal(observed.timers.length, 1, 'Repeated taps scheduled multiple exit callbacks');
    assert.equal(observed.timers[0].fired, interruptAnimation ? 1 : 0, 'Normal animation should cancel fallback; interrupted animation should use it once');
    if (!interruptAnimation) {
      const start = observed.events.find(event => event.type === 'animationstart' && event.name === 'failure-card-out');
      const end = observed.events.find(event => event.type === 'animationend' && event.name === 'failure-card-out');
      assert(start && end, 'Missing real CSS exit animation events');
      assert(end.time - start.time >= 150 && end.time - start.time <= 230, `Wrong exit duration: ${end.time - start.time}`);
    }
  }
  assert.equal(observed.phaseChanges.filter(change => change.phase === (action === 'retry' ? 'playing' : 'detached')).length, 1, 'Action did not commit once');
  report.exits.push({ id: spec.id, motion, action, keyboard, interruptAnimation, ...observed });
  if (action === 'retry' && !interruptAnimation) videoMark(page, 'retryEnd');
}

async function runCase(page, spec, motion) {
  const original = await board(page);
  await open(page, spec);
  const result = await trigger(page, spec, spec.family === 'hunt' && motion === 'no-preference');
  const inspected = await panelChecks(page, spec, motion, result);
  assert.equal(await board(page), original, 'Failure changed stored flowers');
  await exit(page, spec, motion, 'retry', { keyboard: true });
  await trigger(page, spec);
  await page.locator(popup).waitFor({ state: 'visible' });
  await page.waitForTimeout(motion === 'reduce' ? 20 : 800);
  await exit(page, spec, motion, 'back');
  assert.equal(await board(page), original, 'Retry/back changed persistent rewards');
  assert.equal(await page.locator('.garden-shell').getAttribute('data-planting'), '', 'Failure map return planted a flower');
  report.cases.push({ id: spec.id, family: spec.family, motion, ...result, ...inspected, originalSavePreserved: true });
  passed(`${spec.id} ${motion}: two layouts, genuine failure boundary, exit/retry/back, no duplicated callbacks or rewards`);
}

try {
  const bytes = fs.readFileSync(html); report.htmlSha256 = hash(bytes);
  assert(bytes.includes(Buffer.from('failure-card-out')) && bytes.includes(Buffer.from('failure-roast')), 'Wait for the v2 final export before running this script');
  report.sourceArtwork = ['header', 'body', 'footer', 'button', 'secondary-button', 'mascot'].map(name => {
    const file = path.join(root, 'public/ui/painted-failure-v2', `${name}.webp`), image = fs.readFileSync(file);
    assert(bytes.includes(Buffer.from(image.toString('base64'))), `${name}: current v2 asset absent from export`);
    return { name, file, sha256: hash(image) };
  });
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'failure-motion-qa-'));
  const moduleFile = path.join(temp, 'runtime.mjs');
  await dependency('esbuild').build({ absWorkingDir: root, stdin: { contents: [
    "export * as catalog from './app/game/levels';", "export * as hunts from './app/game/scene-hunt/registry';",
    "export * as huntViewport from './app/game/scene-hunt/viewport';", "export * as engine from './app/game/runtime/engine';",
    "export * as configuredScene from './app/game/runtime/scene';", "export * as disasters from './app/game/disaster/registry';",
    "export * as disasterScene from './app/game/disaster/scene';",
  ].join('\n'), resolveDir: root }, bundle: true, platform: 'node', format: 'esm', outfile: moduleFile, logLevel: 'silent' });
  runtime = await import(pathToFileURL(moduleFile));
  const specs = [
    { id: 'quake-bedroom-v2', family: 'hunt' }, { id: 'flood-house-response-v1', family: 'disaster' },
    { id: 'flood-kit', family: 'collection' }, { id: 'fire-shelter-practice', family: 'practice' },
  ].map(spec => {
    const pack = spec.family === 'hunt' ? runtime.hunts.getHunt(spec.id) : spec.family === 'disaster' ? runtime.disasters.getDisaster(spec.id) : runtime.catalog.getPackage(spec.id);
    return { ...spec, pack, seconds: pack.rules.seconds || pack.rules.risk.seconds, total: pack.rules.targets?.length || pack.rules.goals.length };
  });
  const { chromium } = findPlaywright();
  browser = await chromium.launch({ headless: true, executablePath: findBrowser(chromium), args: ['--mute-audio'] }); report.browser = browser.version();
  if (videoOnly) {
    await withPage(specs[0], 'no-preference', async page => {
      const original = await board(page);
      await open(page, specs[0]); await trigger(page, specs[0]);
      await page.locator(popup).waitFor({ state: 'visible' });
      await page.waitForTimeout(2600);
      const button = page.locator('[data-testid="failure-retry"]');
      await button.click(); await page.locator(popup).waitFor({ state: 'detached' });
      await page.clock.runFor(500); await page.waitForTimeout(700);
      assert.equal(await scene(page).getAttribute('data-phase'), 'playing');
      assert.deepEqual(await progress(page, specs[0]), []);
      assert.equal(await board(page), original);
      passed('Continuous 390px browser recording: existing engine timeout, actual failure motion and real retry click');
    });
  } else {
    for (const spec of specs) for (const motion of ['no-preference', 'reduce']) await withPage(spec, motion, page => runCase(page, spec, motion));
    await withPage(specs[0], 'no-preference', async page => {
    const original = await board(page); await open(page, specs[0]); await trigger(page, specs[0]);
    await page.waitForTimeout(800);
    await exit(page, specs[0], 'no-preference', 'retry', { interruptAnimation: true });
    assert.equal(await board(page), original);
    passed('Controlled interruption of only CSS exit animation: 240ms fallback restarts once, no reward');
    });
    assert.equal(report.cases.length, 8); assert.equal(report.layouts.length, 16); assert.equal(report.exits.length, 17);
  }
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.network.length, 0, JSON.stringify(report.network));
  assert.equal(report.failedRequests.length, 0, JSON.stringify(report.failedRequests));
  report.finalHtmlSha256 = hash(fs.readFileSync(html)); assert.equal(report.finalHtmlSha256, report.htmlSha256, 'Final HTML changed during this QA run');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || error.message; console.error(report.failure); process.exitCode = 1;
} finally {
  if (browser) { await browser.close(); report.browserClosed = true; }
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, videoOnly ? 'motion-recording-report.json' : 'report.json'), JSON.stringify(report, null, 2) + '\n');
  if (!videoOnly) fs.writeFileSync(path.join(output, 'README.md'), [
    '# 第二版失败弹窗：最终 HTML 动效验收', '', `- 结果：${report.status}`, `- HTML：${html}`,
    `- 初始 SHA-256：${report.htmlSha256}`, `- 结束 SHA-256：${report.finalHtmlSha256 || 'not_recorded'}`,
    `- 浏览器：${report.browser || 'not_started'}；隔离、离线、headless、--mute-audio。`,
    `- 样本：${report.cases.length}/8；布局：${report.layouts.length}/16；退出路径：${report.exits.length}/17。`,
    `- 已关闭 context：${report.contextsClosed}/${report.contextsCreated}；browser：${report.browserClosed}。`,
    `- 脚本错误：${report.errors.length}；HTTP 请求：${report.network.length}；失败请求：${report.failedRequests.length}。`,
    '- 真机：not_run；人耳音频：not_run。', '', '## 证据边界', '', report.fixture, '', report.motionInstrumentation,
    '', '## 验收内容', '', '- 正确场景名、实际原因与缺失数，0 朵奖励，存档字节不变。',
    '- 390×844、320×568 按钮纵排、滚动可达、Tab/Shift+Tab 焦点约束。',
    '- 普通模式真实 animationend 后启动；退出中失败状态和计时保持、按钮同时禁用；连续旧事件处理器不重复安排/执行退出。',
    '- 减少动态效果立即退出且无动画/240ms 延迟；重试清空目标、恢复计时，返回地图不种花。',
    '- 单独的人为取消 CSS 动画样本验证 240ms 兜底；此项不代表正常用户操作。',
    '', '## 实际动态录屏', '', ...report.videos.map(video => `- [播放录屏](motion-preview.html) · [${video.file}](${video.file})：同一真实浏览器运行的入场与重试片段，中间尺寸/键盘测试步骤已剪去。`),
    '', '## 截图', '', ...report.screenshots.map(file => `- [${file}](${file})`),
    ...(report.failure ? ['', '## 原始失败记录', '', '```', report.failure, '```'] : []), '',
  ].join('\n'));
}
