import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..'),
  require = createRequire(import.meta.url),
  { chromium } = require(
    process.env.PLAYWRIGHT_PATH ??
      'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
  );
const file = path.join(root, 'outputs/本地离线版/小红花应急行动.html'),
  out = path.join(root, 'docs/flower-journey/signal-verification');
fs.mkdirSync(out, { recursive: true });
const map = JSON.parse(
    fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8'),
  ),
  config = JSON.parse(
    fs.readFileSync(path.join(root, 'content/journey-signals.json'), 'utf8'),
  );
const report = {
  status: 'running',
  sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  checks: [],
  errors: [],
  network: [],
  browserClosed: false,
  physicalDevice: 'not_run',
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EDGE_PATH ??
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--mute-audio'],
});
const watch = (p) => {
  p.on('pageerror', (e) => report.errors.push(e.message));
  p.on('request', (r) => {
    if (/^https?:/.test(r.url())) report.network.push(r.url());
  });
};
const check = (name) => {
  report.checks.push({ name, status: 'passed' });
  console.log('PASS ' + name);
};
const saved = (p) =>
  p.evaluate(() => localStorage.getItem('little-red-flower-leaderboard-v1'));
const load = async (p) => {
  await p.goto(pathToFileURL(file).href);
  await p.locator('[data-home-start]').click();
  await p.locator('.map-signal').first().waitFor();
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(200);
};
try {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  watch(p);
  await load(p);
  const before = await saved(p);
  assert.equal(map.regions.length, 3);
  assert.equal(map.regions.flatMap((r) => r.nodes).length, 24);
  assert.equal(
    await p
      .locator(
        '.garden-chapters, .garden-locate, [data-map-chapter], .garden-tab-caption small',
      )
      .count(),
    0,
  );
  assert(
    !/守护行动|处置练习/.test(await p.locator('.garden-header').innerText()),
  );
  check('three integrated maps; chapter chrome, counts and compass removed');
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [1440, 900],
  ]) {
    await p.setViewportSize({ width, height });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      'horizontal page overflow',
    );
    for (const region of map.regions) {
      await p.locator(`[data-category="${region.id}"]`).click();
      await p.waitForTimeout(180);
      assert.equal(
        await p.locator('.map-signal-tile').count(),
        0,
        'old icon badges must be gone',
      );
      for (const n of region.nodes) {
        const node = p.locator(`[data-map-node="${n.id}"]`);
        await node.scrollIntoViewIfNeeded();
        await node.hover();
        await p.waitForTimeout(380);
        const geom = await node.evaluate((n) => {
          const fx = n.querySelector('.map-signal'),
            world = document.querySelector('.garden-world');
          return {
            fx: fx.getBoundingClientRect().toJSON(),
            world: world.getBoundingClientRect().toJSON(),
            opacity: getComputedStyle(fx.querySelector('.fx-scene')).opacity,
            motion: fx.getAttribute('data-motion'),
            animated: fx
              .getAnimations({ subtree: true })
              .filter((a) => a.playState === 'running').length,
          };
        });
        assert.equal(geom.opacity, '1');
        assert.equal(geom.motion, 'on');
        assert(geom.animated >= 2, n.id);
        if (n.id !== 'oil-fire' && n.id !== 'forest-fire-sources-v2') {
          const tracks = node.locator('.fx-track');
          assert((await tracks.count()) >= 2, 'painted tracks missing ' + n.id);
          assert(
            (
              await node
                .locator('.fx-paint')
                .evaluateAll((ns) => ns.map((n) => n.getAttribute('href')))
            ).every((src) => src?.startsWith('data:image/')),
            'art not embedded ' + n.id,
          );
          const t = await tracks
            .first()
            .evaluate((n) => getComputedStyle(n).transform);
          await p.waitForTimeout(170);
          assert.notEqual(
            await tracks.first().evaluate((n) => getComputedStyle(n).transform),
            t,
            'path not moving ' + n.id,
          );
          assert.equal(
            await node
              .locator(
                '.fx-current, .fx-wind-ring, .fx-wave, .fx-steam, .fx-route',
              )
              .count(),
            0,
            'old vector effect still visible ' + n.id,
          );
        }
        const anchor = config.nodes[n.id].anchor,
          scale = geom.world.width / region.width;
        assert(
          Math.abs(
            geom.fx.x + geom.fx.width / 2 - (geom.world.x + anchor.x * scale),
          ) < 2,
          'scene x drift ' + n.id,
        );
        assert(
          Math.abs(
            geom.fx.bottom -
              (geom.world.y + (anchor.y * geom.world.height) / region.height),
          ) < 2,
          'scene y drift ' + n.id,
        );
        assert(
          geom.fx.left >= geom.world.left - 1 &&
            geom.fx.right <= geom.world.right + 1,
          'effect spills from map ' + n.id,
        );
        if (width === 390 || n.id === 'oil-fire')
          await p.screenshot({ path: path.join(out, `${n.id}-${width}.png`) });
        if (n.id === 'oil-fire' && width === 390) {
          const flame = node.locator('.fx-fire-sprite').first();
          const t = await flame.evaluate((n) => getComputedStyle(n).transform);
          await p.waitForTimeout(210);
          assert.notEqual(
            await flame.evaluate((n) => getComputedStyle(n).transform),
            t,
          );
          check('visible flame geometry changes over time');
        }
        // Real scene positions must work without hovering the flower button.
        const area = config.nodes[n.id].hitArea;
        const hitX = geom.world.x + (area.x + area.width / 2) * scale;
        const hitY =
          geom.world.y +
          ((area.y + area.height / 2) * geom.world.height) / region.height;
        if (hitY < 75 || hitY > height - 115) {
          await p.locator('.garden-scroll').evaluate(
            (el, delta) => {
              el.scrollTop += delta;
            },
            hitY - height / 2,
          );
        }
        const world = await p.locator('.garden-world').boundingBox();
        await p.mouse.move(
          hitX,
          world.y + ((area.y + area.height / 2) * world.height) / region.height,
        );
        await p.waitForTimeout(380);
        assert.equal(
          await node.getAttribute('data-scene-active'),
          'true',
          'building hover ' + n.id,
        );
        assert.equal(
          await node
            .locator('.fx-scene')
            .evaluate((n) => getComputedStyle(n).opacity),
          '1',
        );
        if (width === 390)
          await p.screenshot({ path: path.join(out, `${n.id}-building.png`) });
      }
      check(`scene anchored hover effects ${region.id} ${width}`);
    }
  }
  await p.setViewportSize({ width:390, height:844 });
  for(const [category,id] of [['nature','typhoon-home'],['home','charging-bedroom'],['public','lift-contact-practice']]){
    await p.locator(`[data-category="${category}"]`).click();
    const node=p.locator(`[data-map-node="${id}"]`);
    await node.scrollIntoViewIfNeeded();await node.hover();await p.waitForTimeout(380);
    const samples=[];
    for(let i=0;i<8;i++){
      samples.push(await node.locator('.fx-track').evaluateAll(ns=>ns.map(n=>({transform:getComputedStyle(n).transform,opacity:Number(getComputedStyle(n).opacity)}))));
      if(i<4) await p.screenshot({path:path.join(out,`${id}-motion-${i}.png`)});
      await p.waitForTimeout(120);
    }
    if(id==='charging-bedroom'){
      const values=samples.map(s=>s[0].opacity);
      assert(Math.max(...values)-Math.min(...values)>.5,'electric arc must have a clear burst envelope');
    }
    if(id==='typhoon-home'){
      assert(new Set(samples.map(s=>s[3].transform)).size>=6,'windborne leaves must continually traverse scene');
    }
    check(`visible motion sampled over time ${id}`);
  }
  assert.equal(await saved(p), before);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.locator('[data-category="home"]').click();
  const oil = p.locator('[data-map-node="oil-fire"]');
  await oil.hover();
  await p.waitForTimeout(380);
  await p.mouse.move(1, 1);
  await p.waitForTimeout(380);
  assert.equal(
    await oil.locator('.fx-scene').evaluate((n) => getComputedStyle(n).opacity),
    '0.16',
  );
  await oil.click();
  await p.locator('.garden-dialog').waitFor();
  await p.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(await saved(p), before);
  await p.keyboard.press('Tab');
  for (
    let i = 0;
    i < 24 &&
    !(await p.evaluate(() => document.activeElement?.matches('.garden-node')));
    i++
  )
    await p.keyboard.press('Tab');
  assert(
    await p.evaluate(() =>
      document.activeElement?.matches('.garden-node:focus-visible'),
    ),
  );
  await p.waitForTimeout(380);
  assert.equal(
    await p.evaluate(
      () =>
        getComputedStyle(document.activeElement.querySelector('.fx-scene'))
          .opacity,
    ),
    '1',
  );
  check('keyboard and ordinary entry preserve progress');
  await p.emulateMedia({ reducedMotion: 'reduce' });
  assert(
    (
      await p
        .locator('.map-signal')
        .evaluateAll((ns) =>
          ns.flatMap((n) => n.getAnimations({ subtree: true })),
        )
    ).length === 0,
  );
  check('reduced motion disables particle animation');
  // Presentation-only completed fixture, never used as award evidence.
  await p.evaluate(
    (scores) => {
      const k = 'little-red-flower-leaderboard-v1',
        s = JSON.parse(localStorage.getItem(k));
      s.players.find((p) => p.id === s.activePlayerId).completed = scores;
      localStorage.setItem(k, JSON.stringify(s));
    },
    Object.fromEntries(
      map.regions.flatMap((r) => r.nodes.map((n) => [n.id, 3])),
    ),
  );
  await p.reload();
  await p.locator('[data-home-continue]').click();
  await p.locator('.map-signal').first().waitFor();
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  const completedSave = await saved(p);
  for (const region of map.regions) {
    await p.locator(`[data-category="${region.id}"]`).click();
    await p.mouse.move(1, 1);
    await p.waitForTimeout(380);
    assert(
      (
        await p
          .locator('.fx-scene')
          .evaluateAll((ns) => ns.map((n) => getComputedStyle(n).visibility))
      ).every((v) => v === 'hidden'),
    );
    assert.equal(await p.locator('.fx-safety .fx-particle').count(), 0);
    for (const n of region.nodes) {
      const node = p.locator(`[data-map-node="${n.id}"]`);
      await node.scrollIntoViewIfNeeded();
      const area = config.nodes[n.id].hitArea;
      let w = await p.locator('.garden-world').boundingBox();
      const cy = w.y + ((area.y + area.height / 2) * w.height) / region.height;
      if (cy < 75 || cy > 729)
        await p.locator('.garden-scroll').evaluate((el, delta) => {
          el.scrollTop += delta;
        }, cy - 422);
      w = await p.locator('.garden-world').boundingBox();
      await p.mouse.move(
        w.x + ((area.x + area.width / 2) * w.width) / region.width,
        w.y + ((area.y + area.height / 2) * w.height) / region.height,
      );
      await p.waitForTimeout(380);
      assert.equal(await node.getAttribute('data-status'), 'complete');
      assert.equal(
        await node.getAttribute('data-scene-active'),
        'true',
        'completed building ' + n.id,
      );
      assert.equal(
        await node
          .locator('.fx-scene')
          .evaluate((n) => getComputedStyle(n).visibility),
        'visible',
      );
      assert.equal(
        await node
          .locator('.fx-scene')
          .evaluate((n) => getComputedStyle(n).opacity),
        '1',
      );
      await node.locator('.garden-scene-replay').waitFor({ state: 'visible' });
      await p.screenshot({
        path: path.join(out, `${n.id}-completed-preview.png`),
      });
      await p.mouse.move(1, 1);
      await p.waitForTimeout(380);
      assert.equal(
        await node
          .locator('.fx-scene')
          .evaluate((n) => getComputedStyle(n).visibility),
        'hidden',
      );
      assert.equal(await saved(p), completedSave);
    }
  }
  check(
    'all 24 completed scenes preview on building hover, restore safety on leave and preserve save',
  );
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    }),
    touch = await context.newPage();
  watch(touch);
  await load(touch);
  await touch.locator('[data-category="home"]').tap();
  await touch.waitForTimeout(220);
  const tb = await saved(touch),
    tn = touch.locator('[data-map-node="oil-fire"]'),
    b = await tn.boundingBox(),
    pt = { x: b.x + b.width / 2, y: b.y + b.height / 2 },
    cdp = await context.newCDPSession(touch);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [pt],
  });
  await touch.waitForTimeout(400);
  assert.equal(
    await tn.locator('.fx-scene').evaluate((n) => getComputedStyle(n).opacity),
    '1',
  );
  await touch.screenshot({ path: path.join(out, 'touch-fire.png') });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await touch.locator('.garden-dialog').waitFor();
  assert.equal(await saved(touch), tb);
  check('touch press shows fire; release opens real level intro');
  await context.close();
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.network, []);
  report.status = 'passed';
} catch (e) {
  report.failure = String(e.stack ?? e);
  report.status = 'failed';
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  report.browserClosed = true;
  fs.writeFileSync(
    path.join(out, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
