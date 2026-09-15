// Capture actual exported gameplay with fresh storage; no mocked scores or UI.
// Optional: OFFLINE_FILE, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const html = path.resolve(root, process.env.OFFLINE_FILE || 'outputs/本地离线版/小红花应急行动.html');
const output = path.join(root, 'docs/screenshots');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {
  status: 'running', capturedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  html: path.relative(root, html), htmlSha256: hash(fs.readFileSync(html)),
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  storage: 'Fresh disposable context. Native navigation only; no progress or scores injected.',
  screenshots: [], errors: [], externalRequests: [], failedRequests: [],
  contextClosed: false, browserClosed: false,
  physicalDevice: 'not_run', humanAudio: 'not_run',
};
fs.mkdirSync(output, { recursive: true });

function playwright() {
  for (const module of [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'), 'playwright-core'].filter(Boolean)) {
    try { return require(module); } catch (error) { if (module === process.env.PLAYWRIGHT_MODULE) throw error; }
  }
  throw new Error('Playwright unavailable; set PLAYWRIGHT_MODULE.');
}
let browser, context, page;
async function click(selector) {
  const target = page.locator(selector);
  await target.waitFor({ state: 'visible' });
  const point = await target.evaluate(element => {
    const box = element.getBoundingClientRect();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    return { x, y, hit: element.contains(document.elementFromPoint(x, y)) };
  });
  assert(point.hit, `Target occluded: ${selector}`);
  await page.mouse.click(point.x, point.y);
}
async function capture(name, label) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter(img => img.getClientRects().length).map(img => img.decode()));
  });
  await page.waitForTimeout(450);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`);
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(output, file), animations: 'disabled' });
  report.screenshots.push({ file, label, sha256: hash(fs.readFileSync(path.join(output, file))) });
  console.log(`Captured ${file}: ${label}`);
}
try {
  const { chromium } = playwright();
  const executablePath = [process.env.BROWSER_EXECUTABLE, chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(file => file && fs.existsSync(file));
  assert(executablePath, 'Chromium unavailable; set BROWSER_EXECUTABLE.');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--mute-audio'] });
  report.browser = browser.version();
  context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: report.deviceScaleFactor, reducedMotion: 'reduce', offline: true, hasTouch: true });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) report.externalRequests.push(request.url()); });
  page.on('requestfailed', request => report.failedRequests.push(request.failure()?.errorText));
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60000 });
  await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor();
  report.pageTitle = await page.title();
  await capture('home', '绘本首页');
  await click('[data-home-start]');
  await page.locator('[data-journey-map]').waitFor();
  await capture('map', '自然灾害关卡地图');
  await click('[data-map-fan-toggle]');
  await page.locator('[data-archipelago][data-phase="idle"]').waitFor();
  await capture('archipelago', '天空群岛：三个主题区域');
  await click('[data-archipelago-back]');
  await page.locator('[data-archipelago]').waitFor({ state: 'detached' });
  await click('[data-journal-open]');
  await page.getByTestId('journal-card').waitFor();
  assert.equal(await page.getByTestId('journal-completed').getAttribute('data-value'), '0');
  await capture('journal', '我的进度：新玩家的三岛记录');
  await page.keyboard.press('Escape');
  await page.getByTestId('journal-card').waitFor({ state: 'detached' });
  const node = page.locator('[data-map-node="typhoon-home"]');
  await node.evaluate(element => {
    const scroll = element.closest('.garden-scroll'), box = element.getBoundingClientRect(), view = scroll.getBoundingClientRect();
    scroll.scrollTo({ top: scroll.scrollTop + box.y + box.height / 2 - view.y - view.height / 2, behavior: 'instant' });
  });
  await page.waitForTimeout(250);
  await click('[data-map-node="typhoon-home"] .garden-node-label');
  await page.locator('[data-painted-intro]').waitFor();
  await capture('level-entry', '台风居家准备：关卡介绍');
  await click('[data-painted-primary]');
  await page.locator('.hunt-player[data-phase="playing"]').waitFor();
  await page.waitForFunction(() => Number(document.querySelector('.hunt-player')?.dataset.elapsed) > 500);
  await page.locator('.hunt-world canvas').waitFor({ state: 'visible' });
  await capture('gameplay', '台风居家准备：寻找真实隐患');
  assert.equal(report.htmlSha256, hash(fs.readFileSync(html)), 'Export changed during capture');
  assert.equal(report.errors.length, 0, 'Runtime errors');
  assert.equal(report.externalRequests.length, 0, 'Unexpected external requests');
  assert.equal(report.failedRequests.length, 0, 'Failed asset requests');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  throw error;
} finally {
  try { if (context) { await context.close(); report.contextClosed = true; } }
  finally {
    try { if (browser) { await browser.close(); report.browserClosed = true; } }
    finally { fs.writeFileSync(path.join(output, 'capture.json'), JSON.stringify(report, null, 2) + '\n'); }
  }
}
