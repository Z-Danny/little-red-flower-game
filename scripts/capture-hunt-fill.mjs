/** Original output from the local game, not an edited mockup. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html = root + '/outputs/本地离线版/小红花应急行动.html';
const output = root + '/docs/hazard-batch-v2/verification/edge-fit-20260910';
fs.mkdirSync(output, { recursive: true });
const cards = JSON.parse(fs.readFileSync(root + '/docs/hazard-batch-v2/production-plan.json', 'utf8')).levels;
const report = { htmlSha256: createHash('sha256').update(fs.readFileSync(html)).digest('hex'), screenshots: [], browserClosed: false };
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--mute-audio'] });
try {
  for (const card of cards) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage();
      await page.goto(pathToFileURL(html).href);
      await page.locator('button.map-level').filter({ has: page.locator('.map-copy > strong').getByText(card.title, { exact: true }) }).tap();
      await page.locator('.hunt-entry > button').tap();
      for (const [width, height] of [[390, 844], [1280, 900]]) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(() => { const r = document.querySelector('.hunt-player').getBoundingClientRect(), v=visualViewport, mobile=v.width<=600&&v.height>=v.width, w = Math.min(520, v.width, mobile?v.width:v.height*720/1280), h=mobile?v.height:w*1280/720; return Math.abs(r.width - w) < .1 && Math.abs(r.height - h) < .1 && Math.abs(r.top-v.offsetTop)<.1; });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const name = `${card.authorId}-${width}x${height}-playing.png`;
        await page.screenshot({ path: output + '/' + name });
        report.screenshots.push(name);
      }
    } finally { await context.close(); }
  }
} finally {
  await browser.close(); report.browserClosed = true;
  fs.writeFileSync(output + '/captures.json', JSON.stringify(report, null, 2));
}
