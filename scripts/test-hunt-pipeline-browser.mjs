/** Actual pointer QA, isolated offline context and muted output; always closes the browser. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { catalog, readPack } from './hunts.mjs';
import { root, dependency } from './lib/dependencies.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ??
    'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);
const html = path.resolve(
  root,
  process.argv[2] ?? 'outputs/本地离线版/小红花应急行动.html',
);
const journeyMap = JSON.parse(
  fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8'),
);
const out = path.resolve(root, process.env.HUNT_REPORT_DIR ?? 'docs/flower-journey/verification/hunt-layout');
fs.mkdirSync(out, { recursive: true });
const report = {
  status: 'running',
  htmlSha256: createHash('sha256').update(fs.readFileSync(html)).digest('hex'),
  checks: [],
  errors: [],
  network: [],
  physicalDevice: 'not_run',
  humanListening: 'not_run',
  browserClosed: false,
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.BROWSER_PATH ??
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--mute-audio'],
});
try {
  for (const e of catalog().filter((e) => e.enabled)) {
    const pack = readPack(e),
      s = pack.skin,
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
      });
    try {
      const page = await context.newPage();
      page.on('pageerror', (err) => report.errors.push(err.message));
      page.on('request', (req) => {
        if (/^https?:/.test(req.url())) report.network.push(req.url());
      });
      // Layout-only fixture: unlock all scenes in an isolated test context.
      // Real progression and claims are tested without injected state by test-journey-browser.mjs.
      await page.addInitScript(
        (ids) =>
          localStorage.setItem(
            'little-red-flower-leaderboard-v1',
            JSON.stringify({
              version: 1,
              activePlayerId: 'layout-fixture',
              players: [
                {
                  id: 'layout-fixture',
                  name: '视口检查',
                  region: '',
                  createdAt: 1,
                  completed: Object.fromEntries(ids.map((id) => [id, 3])),
                },
              ],
            }),
          ),
        journeyMap.regions.flatMap((r) => r.nodes.map((n) => n.id)),
      );
      await page.goto(pathToFileURL(html).href);
      await page.locator('[data-home-start]').click();
      const area = journeyMap.regions.find((r) =>
        r.nodes.some((n) => n.id === e.id),
      );
      await page.locator('[data-map-region="' + area.id + '"]').click();
      await page.locator('[data-map-node="' + e.id + '"]').click();
      await page
        .getByRole('button', { name: '再守护一次', exact: true })
        .click();
      await page.locator('.hunt-entry>button').waitFor();
      for (const [width, height] of [
        [320, 568],
        [375, 667],
        [390, 844],
        [430, 932],
        [540, 960],
        [1440, 900],
        [390, 650],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(() => {
          const r = document
              .querySelector('.hunt-player')
              .getBoundingClientRect(),
            v = visualViewport;
          return (
            Math.abs(r.y - v.offsetTop) < 0.2 &&
            (v.width > 600 ||
              v.height < v.width ||
              (Math.abs(r.width - v.width) < 0.2 &&
                Math.abs(r.height - v.height) < 0.2))
          );
        });
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const bulb = page.getByRole('button', { name: '物件剪影提示', exact: true });
        if (await bulb.count() && !await page.locator('.hunt-targets').isVisible()) await bulb.tap();
        const d = await page.evaluate(() => {
          const el = document.querySelector('.hunt-player'),
            b = el.getBoundingClientRect(),
            c = el.querySelector('canvas'),
            ctx = c.getContext('2d'),
            matrix = ctx.getTransform();
          return {
            rect: b.toJSON(),
            viewport: [visualViewport.width, visualViewport.height],
            direction: getComputedStyle(el.querySelector('.hunt-targets'))
              .flexDirection,
            scale: [
              (matrix.a * b.width) / c.width,
              (matrix.d * b.height) / c.height,
            ],
            corners: [
              [0, 0],
              [c.width - 1, 0],
              [0, c.height - 1],
              [c.width - 1, c.height - 1],
            ].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]),
            boxes: [
              ...el.querySelectorAll(
                '.hunt-hud,.hunt-hud button,.hunt-targets,.hunt-entry,.hunt-entry>button',
              ),
            ].map((x) => x.getBoundingClientRect().toJSON()),
          };
        });
        const b = d.rect;
        assert.equal(d.direction, 'row');
        assert.ok(
          Math.abs(d.scale[0] - d.scale[1]) < 0.001,
          'non-uniform canvas scale',
        );
        assert.equal(Math.round(b.y), 0);
        if (width <= 600) {
          assert.equal(Math.round(b.width), width);
          assert.equal(Math.round(b.height), height);
        } else assert.ok(b.width <= 520 && b.height <= height);
        for (const box of d.boxes)
          assert.ok(
            box.left >= b.left - 1 &&
              box.right <= b.right + 1 &&
              box.top >= b.top - 1 &&
              box.bottom <= b.bottom + 1,
            'HUD or card outside frame',
          );
        for (const pixel of d.corners) {
          assert.equal(pixel[3], 255);
          assert.notDeepEqual(pixel.slice(0, 3), [34, 43, 44]);
        }
        report.checks.push({
          id: e.id,
          viewport: [width, height],
          status: 'passed',
          rect: b,
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.hunt-entry>button').tap();
      await page.clock.install();
      await page.clock.runFor(150);
      await page.screenshot({ path: path.join(out, e.id + '-playing.png') });
      const { data } = await dependency('sharp')(
        path.join(root, 'public', s.mask.slice(1)),
      )
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (const t of pack.rules.targets) {
        const b = await page.locator('.hunt-world canvas').boundingBox(),
          scale = Math.max(b.width / s.width, b.height / s.height),
          dx = (b.width - s.width * scale) / 2,
          dy = (b.height - s.height * scale) / 2;
        const points = [];
        for (let y = 0; y < s.height; y += 3)
          for (let x = 0; x < s.width; x += 3) {
            const i = (y * s.width + x) * 4;
            if (
              data[i + 3] >= 128 &&
              s.targets[t.id].color.every((v, j) => v === data[i + j])
            ) {
              const px = b.x + dx + x * scale,
                py = b.y + dy + y * scale;
              if (
                px > b.x + 8 &&
                px < b.x + b.width - 8 &&
                py > b.y + 8 &&
                py < b.y + b.height - 55
              )
                points.push({ x: px, y: py });
            }
          }
        assert.ok(points.length, 'No visible target ' + t.id);
        const at = await page.evaluate((points) => {
          const blockers = [
            ...document.querySelectorAll(
              '.hunt-targets>span,.hunt-hud button,.hunt-hud h1,.hunt-hud>span',
            ),
          ].map((el) => el.getBoundingClientRect());
          const visible = points.filter(
            (p) =>
              !blockers.some(
                (b) =>
                  p.x >= b.left - 3 &&
                  p.x <= b.right + 3 &&
                  p.y >= b.top - 3 &&
                  p.y <= b.bottom + 3,
              ) && document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS',
          );
          return visible[Math.floor(visible.length / 2)];
        }, points);
        assert.ok(at, 'Target is obscured by UI ' + t.id);
        await page.touchscreen.tap(at.x, at.y);
        await page.clock.runFor(900);
        assert.ok(
          (await page.locator('.hunt-player').getAttribute('data-found'))
            .split(',')
            .includes(t.id),
          'Pointer did not hit ' + t.id,
        );
      }
      await page.clock.runFor(pack.rules.revealMs + 200);
      assert.equal(
        await page.locator('.hunt-player').getAttribute('data-phase'),
        'complete',
      );
      await page.screenshot({ path: path.join(out, e.id + '-complete.png') });
      await page.getByRole('button', { name: /返回地图/ }).click();
      await page.locator('[data-map-node="' + e.id + '"]').click();
      await page
        .getByRole('button', { name: '再守护一次', exact: true })
        .click();
      await page.clock.runFor(100);
      assert.equal(
        await page.locator('.hunt-player').getAttribute('data-found'),
        '',
      );
      report.checks.push({
        id: e.id,
        status: 'passed',
        pointerTargets: pack.rules.targets.length,
        complete: true,
        replay: true,
      });
      console.log(e.id + ' layout + pointer playthrough passed');
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.network, []);
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.error = String(e.stack ?? e);
  process.exitCode = 1;
  console.error(e);
} finally {
  await browser.close();
  report.browserClosed = true;
  fs.writeFileSync(
    path.join(out, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
