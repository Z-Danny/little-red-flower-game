// Final offline artifact QA. Progress below is a visual fixture, never earned gameplay.
// Optional: OFFLINE_FILE, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, MAP_FOG_TEST_OUTPUT.
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
const output = path.resolve(root, process.env.MAP_FOG_TEST_OUTPUT || 'outputs/map-fog-verification');
const map = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8'));
const copy = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-copy.json'), 'utf8'));
const sizes = [[390, 844], [320, 568], [1440, 900]];
const nodes = map.regions.flatMap((region) => region.nodes);
const scenarios = {
  fresh: [],
  'first-completed': map.regions.map((region) => region.nodes[0].id),
  complete: nodes.map((node) => node.id),
};
const report = {
  status: 'running', html, sha256: null, browser: null, checks: [], layouts: [], clicks: [], screenshots: [],
  errors: [], network: [], failedRequests: [], browserClosed: false,
  fixtures: {
    fresh: 'Isolated empty storage; no completed levels.',
    'first-completed': 'The first level in EACH of the three regions is preset complete (three total); the second is available but has never been completed.',
    complete: 'All 24 levels preset complete. Saves are only visual fixtures; no gameplay, reward or end-to-end completion flow is tested.',
  },
  physicalDevice: 'not_run', humanAudio: 'not_run',
};
fs.mkdirSync(output, { recursive: true });
const passed = (name) => { report.checks.push({ name, status: 'passed' }); console.log(`PASS ${name}`); };
const sameIds = (actual, expected, detail) => assert.deepEqual([...actual].sort(), [...expected].sort(), detail);

function playwright() {
  const specified = process.env.PLAYWRIGHT_MODULE;
  const candidates = specified ? [specified.startsWith('file:') ? fileURLToPath(specified) : specified] : [
    'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'), 'playwright-core',
  ];
  for (const candidate of candidates) {
    try { return require(candidate.startsWith('.') ? path.resolve(candidate) : candidate); }
    catch (error) { if (specified) throw error; }
  }
  throw new Error('Playwright not found; set PLAYWRIGHT_MODULE.');
}

function executable(chromium) {
  const candidates = process.env.BROWSER_EXECUTABLE ? [process.env.BROWSER_EXECUTABLE] : [
    chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
      .map((directory) => path.join(directory, 'Google/Chrome/Application/chrome.exe')),
  ];
  const candidate = candidates.find((file) => fs.existsSync(file));
  assert(candidate, 'Chromium not found; set BROWSER_EXECUTABLE.');
  return candidate;
}

function verifySourceAreas(fog) {
  sameIds(Object.keys(fog.regions), map.regions.map((region) => region.id), 'Fog regions must match map regions');
  for (const region of map.regions) {
    const source = fog.regions[region.id];
    assert.equal(source.image, region.image, `${region.id}: source artwork differs`);
    assert.equal(source.width, region.width, `${region.id}: source width differs`);
    assert.equal(source.height, region.height, `${region.id}: source height differs`);
    sameIds(Object.keys(source.areas), region.nodes.map((node) => node.id), `${region.id}: areas must cover every level exactly once`);
    for (const [id, area] of Object.entries(source.areas)) {
      assert([area.x, area.y, area.width, area.height].every(Number.isFinite), `${id}: nonnumeric geometry`);
      assert(area.x >= 0 && area.y >= 0 && area.width > 0 && area.height > 0, `${id}: invalid bounds`);
      assert(area.x + area.width <= region.width && area.y + area.height <= region.height, `${id}: area leaves source image`);
      assert(area.width * area.height < region.width * region.height * 0.15, `${id}: area must be local`);
    }
  }
  assert.equal(nodes.length, 24);
  passed('All 24 local areas match their region artwork, source dimensions, IDs, and image bounds');
}

async function centerNode(page, id) {
  await page.locator(`[data-map-node="${id}"]`).evaluate((node) => {
    const scroller = node.closest('.garden-scroll');
    const target = node.querySelector('.garden-node-bed').getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    scroller.scrollTo({ top: scroller.scrollTop + target.y + target.height / 2 - (view.y + view.height / 2), behavior: 'instant' });
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function measureRegion(page) {
  return page.locator('.garden-world').evaluate((world) => {
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const style = (element) => {
      const css = getComputedStyle(element);
      return { filter: css.filter, backdropFilter: css.backdropFilter, backgroundColor: css.backgroundColor, opacity: css.opacity,
        pointerEvents: css.pointerEvents, maskImage: css.maskImage, transitionDuration: css.transitionDuration };
    };
    const art = world.querySelector('.garden-map-art');
    const region = world.querySelector('.garden-region');
    return {
      world: rect(world), art: rect(art), imageStyle: style(art), worldStyle: style(world), regionStyle: style(region),
      recovery: getComputedStyle(world).getPropertyValue('--recovery').trim(),
      oldGlobalFogCount: document.querySelectorAll('.garden-atmosphere').length,
      oldNodeFogCount: document.querySelectorAll('.garden-node-fog').length,
      nodes: [...world.querySelectorAll('[data-map-node]')].map((node) => ({ id: node.dataset.mapNode, status: node.dataset.status })),
      fog: [...world.querySelectorAll('.garden-location-fog')].map((fog) => ({ id: fog.dataset.fogNode, rect: rect(fog), ...style(fog) })),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      scale: visualViewport?.scale ?? 1,
    };
  });
}

const fogIntensity = new Map();
function verifyRegion(layout, region, scenario, fog) {
  const prefix = `${scenario} ${region.id} ${layout.viewport.width}x${layout.viewport.height}`;
  const completed = new Set(scenarios[scenario]);
  const expectedStatus = (node) => completed.has(node.id) ? 'complete' : node.unlockAfter === null || completed.has(node.unlockAfter) ? 'available' : 'locked';
  const locked = region.nodes.filter((node) => expectedStatus(node) === 'locked').map((node) => node.id);
  sameIds(layout.nodes.map((node) => node.id), region.nodes.map((node) => node.id), `${prefix}: map node mismatch`);
  for (const node of region.nodes) assert.equal(layout.nodes.find((item) => item.id === node.id)?.status, expectedStatus(node), `${prefix}: unexpected fixture status for ${node.id}`);
  sameIds(layout.fog.map((area) => area.id), locked, `${prefix}: fog must exist for locked levels only`);
  assert.equal(layout.oldGlobalFogCount, 0, `${prefix}: old full-map overlay remains`);
  assert.equal(layout.oldNodeFogCount, 0, `${prefix}: old node fog remains`);
  assert.equal(layout.recovery, '', `${prefix}: progress-driven global recovery remains`);
  assert.equal(layout.scale, 1, `${prefix}: browser zoom changed`);
  assert.equal(layout.horizontalOverflow, false, `${prefix}: horizontal overflow`);
  for (const css of [layout.imageStyle, layout.worldStyle, layout.regionStyle]) {
    assert.equal(css.filter, 'none', `${prefix}: global color filter`);
    assert.equal(css.backdropFilter, 'none', `${prefix}: global backdrop filter`);
    assert.equal(css.opacity, '1', `${prefix}: global fade`);
  }
  assert.equal(layout.regionStyle.backgroundColor, 'rgba(0, 0, 0, 0)', `${prefix}: full region is tinted`);
  for (const area of layout.fog) {
    const source = fog.regions[region.id].areas[area.id];
    const actual = area.rect;
    const art = layout.art;
    assert(actual.x >= art.x - 1 && actual.y >= art.y - 1 && actual.right <= art.right + 1 && actual.bottom <= art.bottom + 1, `${prefix}: ${area.id} escapes artwork`);
    assert(actual.width * actual.height < art.width * art.height * 0.15, `${prefix}: ${area.id} is not local`);
    const expected = { x: art.x + source.x / region.width * art.width, y: art.y + source.y / region.height * art.height,
      width: source.width / region.width * art.width, height: source.height / region.height * art.height };
    for (const key of Object.keys(expected)) assert(Math.abs(expected[key] - actual[key]) < 1, `${prefix}: ${area.id} ${key} does not track source geometry`);
    assert.equal(area.pointerEvents, 'none', `${prefix}: fog intercepts clicks`);
    assert.notEqual(area.maskImage, 'none', `${prefix}: fog lacks a soft local edge`);
    const intensity = JSON.stringify({ filter: area.filter, backdropFilter: area.backdropFilter, backgroundColor: area.backgroundColor, opacity: area.opacity, maskImage: area.maskImage });
    if (fogIntensity.has(area.id)) assert.equal(intensity, fogIntensity.get(area.id), `${prefix}: locked fog intensity changes with progress or viewport`);
    else fogIntensity.set(area.id, intensity);
  }
}

async function verifyHitTargets(page, region, scenario, width) {
  for (const node of region.nodes.slice(0, 2)) {
    await centerNode(page, node.id);
    const hits = await page.locator(`[data-map-node="${node.id}"]`).evaluate((element) => ['.garden-node-bed', '.garden-node-label'].map((selector) => {
      const r = element.querySelector(selector).getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { selector, id: hit?.closest('[data-map-node]')?.getAttribute('data-map-node'), fog: !!hit?.closest('.garden-location-fog') };
    }));
    for (const hit of hits) {
      assert.equal(hit.id, node.id, `${scenario} ${width}px ${node.id}: ${hit.selector} is blocked`);
      assert.equal(hit.fog, false, `${node.id}: fog intercepts a click`);
    }
    if (width === 390 && region.nodes.indexOf(node) < 2) {
      await page.locator(`[data-map-node="${node.id}"] .garden-node-bed`).click();
      const dialog = page.locator('.garden-dialog');
      await dialog.waitFor({ state: 'visible' });
      assert.equal((await dialog.locator('h2:not(.garden-sr-only)').innerText()).trim(), copy.levels[node.id].title);
      await dialog.getByRole('button', { name: '关闭', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      report.clicks.push({ scenario, region: region.id, id: node.id });
    }
  }
}

async function screenshot(page, name, fullMap = false) {
  const filename = `${name}.png`;
  if (fullMap) await page.locator('.garden-world').screenshot({ path: path.join(output, filename), timeout: 30_000 });
  else await page.screenshot({ path: path.join(output, filename) });
  report.screenshots.push(filename);
}

let browser;
try {
  const fog = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-fog.json'), 'utf8'));
  verifySourceAreas(fog);
  report.sha256 = createHash('sha256').update(fs.readFileSync(html)).digest('hex');
  const { chromium } = playwright();
  browser = await chromium.launch({ headless: true, executablePath: executable(chromium), args: ['--mute-audio'] });
  report.browser = browser.version();
  for (const [scenario, completed] of Object.entries(scenarios)) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, deviceScaleFactor: 1 });
    try {
      if (completed.length) await context.addInitScript(({ completed, firstId }) => {
        const id = 'map-fog-visual-fixture';
        localStorage.setItem('little-red-flower-leaderboard-v1', JSON.stringify({ version: 1, activePlayerId: id,
          players: [{ id, name: '局部蒙层测试', region: '', createdAt: 1, completed: Object.fromEntries(completed.map((level) => [level, 3])) }] }));
        localStorage.setItem('little-red-flower-journey-location-v1', JSON.stringify({ [id]: { levelId: firstId, visitedAt: 1 } }));
      }, { completed, firstId: nodes[0].id });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      page.on('pageerror', (error) => report.errors.push({ scenario, message: error.message }));
      page.on('request', (request) => { if (/^https?:/.test(request.url())) report.network.push({ scenario, url: request.url() }); });
      page.on('requestfailed', (request) => report.failedRequests.push({ scenario, url: request.url().slice(0, 200), failure: request.failure()?.errorText }));
      await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60_000 });
      await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts.ready);
      await page.locator(completed.length ? '[data-home-continue]' : '[data-home-start]').click();
      await page.locator('.garden-shell').waitFor({ state: 'visible' });
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        for (const region of map.regions) {
          await page.locator(`[data-category="${region.id}"]`).click();
          await page.locator(`.garden-region[data-region="${region.id}"]`).waitFor({ state: 'attached' });
          await page.locator('.garden-map-art').evaluate((element) => element.decode());
          const layout = { scenario, region: region.id, viewport: { width, height }, ...await measureRegion(page) };
          report.layouts.push(layout);
          verifyRegion(layout, region, scenario, fog);
          await verifyHitTargets(page, region, scenario, width);
          if (width === 390) {
            await centerNode(page, region.nodes[1].id);
            await screenshot(page, `${scenario}-${region.id}-second-level-${width}x${height}`);
            await screenshot(page, `${scenario}-${region.id}-whole-map-${width}x${height}`, true);
          }
          passed(`${scenario} ${region.id} ${width}x${height}: exact locked areas, fixed intensity, source-aligned bounds, unblocked targets`);
        }
      }
    } finally { await context.close(); }
  }
  assert.equal(report.errors.length, 0, `Browser errors: ${JSON.stringify(report.errors)}`);
  assert.equal(report.network.length, 0, `Offline HTTP(S) requests: ${JSON.stringify(report.network)}`);
  assert.equal(report.failedRequests.length, 0, `Failed requests: ${JSON.stringify(report.failedRequests)}`);
  passed('Final exported HTML runs without browser errors, network access, or failed requests');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || error.message;
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  if (browser) { await browser.close(); report.browserClosed = true; }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), [
    '# 地图局部蒙层：最终离线 HTML 验证', '',
    `- 结果：${report.status}`, `- HTML：${html}`, `- SHA-256：${report.sha256}`,
    `- 浏览器：${report.browser}；隔离 context、headless、--mute-audio；finally 已关闭：${report.browserClosed}。`,
    `- 视口：${sizes.map((size) => size.join('×')).join('、')}；缩放 100%。`,
    `- 三地图 × 三种进度 × 三视口：${report.layouts.length} 个布局样本；实点关卡入口 ${report.clicks.length} 次。`,
    '- 检查 24 个区域的素材、尺寸、ID、矩形边界；每种状态的蒙层 ID 必须精确等于锁定关卡 ID。',
    '- 已解锁且未完成的第二关必须没有蒙层；剩余锁定关卡的蒙层样式强度不随完成比例改变。',
    '- 检查无全图蒙层、全图滤镜或整体褪色；局部蒙层按原图区域缩放、不出界、不挡点击。',
    '- fresh 使用全新存储；first-completed 预置每张图第一关完成（共 3 关），第二关已解锁但未完成；complete 预置全 24 关完成。',
    '- 以上存档为视觉验收 fixture，不代表真实游玩、奖励发放或端到端通关测试。',
    `- 浏览器错误 ${report.errors.length}；HTTP(S) 请求 ${report.network.length}；失败请求 ${report.failedRequests.length}。`,
    '- physicalDevice: not_run', '- humanAudio: not_run',
    ...(report.failure ? ['', '## 失败', '', '```text', report.failure, '```'] : []),
    '', '## 代表截图', '', ...report.screenshots.map((file) => `- [${file}](${file})`), '',
  ].join('\n'));
}
