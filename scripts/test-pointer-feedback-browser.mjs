/** Isolated, muted pointer regression against the final offline HTML.
 * Prerequisite saves are fixtures only; no user profile or scoring is modified. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { dependency, root } from './lib/dependencies.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const file = path.resolve(
  process.argv[2] ?? 'outputs/本地离线版/小红花应急行动.html',
);
const out = path.resolve(process.argv[3] ?? 'outputs/pointer-feedback-browser');
fs.mkdirSync(out, { recursive: true });
const scratch = path.join(root, 'work/pointer-feedback-browser');
fs.mkdirSync(scratch, { recursive: true });
const runtime = path.join(scratch, 'runtime.mjs');
await dependency('esbuild').build({
  absWorkingDir: root,
  stdin: {
    contents: `export * as levels from './app/game/levels';export * as scene from './app/game/runtime/scene';export * as engine from './app/game/runtime/engine';export * as hunt from './app/game/scene-hunt/registry';export * as mask from './app/game/scene-hunt/schema';export * as pointer from './app/game/display/pointer-hit';export * as journey from './app/game/journey/progress';`,
    resolveDir: root,
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: runtime,
  logLevel: 'silent',
});
const rt = await import(pathToFileURL(runtime));
const report = {
  file,
  sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  checks: [],
  errors: [],
  physicalDevice: 'not_run',
  humanListening: 'not_run',
  prerequisites: 'isolated test fixtures',
  browserClosed: false,
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EDGE_PATH ??
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--mute-audio'],
});
const check = (s) => {
  report.checks.push(s);
  console.log('PASS ' + s);
};
const raster = new Map();
async function load(pack) {
  for (const [id, asset] of Object.entries(pack.skin.assets)) {
    const key = pack.rules.id + ':' + id;
    if (raster.has(key)) continue;
    let img = dependency('sharp')(
      path.join(root, 'public', asset.src.slice(1)),
    );
    if (asset.frame)
      img = img.extract({
        left: asset.frame.x,
        top: asset.frame.y,
        width: asset.frame.w,
        height: asset.frame.h,
      });
    raster.set(
      key,
      await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    );
  }
  return (id, p) => {
    const { data, info } = raster.get(pack.rules.id + ':' + id);
    const x = Math.min(info.width - 1, Math.floor(p.x * info.width)),
      y = Math.min(info.height - 1, Math.floor(p.y * info.height));
    return x >= 0 && y >= 0 && data[(y * info.width + x) * 4 + 3] > 35;
  };
}
async function open(page, id) {
  await page.goto(pathToFileURL(file).href, {
    waitUntil: 'load',
    timeout: 90000,
  });
  await page
    .getByRole('button', { name: /^(开始游戏|继续游戏)$/ })
    .first()
    .click();
  await page.getByRole('button', { name: /打开群岛选择/ }).waitFor();
  const region = rt.journey.regionFor(id);
  await page.getByRole('button', { name: /打开群岛选择/ }).click();
  await page
    .getByRole('button', {
      name: new RegExp('^' + region.name + '，.*点击前往$'),
    })
    .click();
  const node = page.locator(`[data-map-node="${id}"]`);
  await node.scrollIntoViewIfNeeded();
  await node.click();
  await page.locator('[data-painted-primary]').click();
  await page
    .locator(
      '.configured-player[data-ready="true"],.hunt-player[data-ready="true"]',
    )
    .waitFor();
  await page.waitForTimeout(150);
}
async function geom(page, pack) {
  const canvas = page.locator('canvas').first(),
    b = await canvas.boundingBox(),
    d = await canvas.evaluate((c) => ({ ...c.dataset }));
  const camera = d.cameraScale
    ? {
        scale: Number(d.cameraScale),
        x: Number(d.cameraX),
        y: Number(d.cameraY),
      }
    : rt.scene.cameraFor(pack, b.width, b.height);
  return {
    b,
    camera,
    screen: (p) => ({
      x: b.x + camera.x + p.x * camera.scale,
      y: b.y + camera.y + p.y * camera.scale,
    }),
  };
}
async function point(page, pack, source, near = false) {
  const run = rt.engine.createRun(pack),
    alpha = await load(pack),
    g = await geom(page, pack),
    pose = rt.scene.scenePoses(pack, run, true).find((p) => p.id === source);
  let found;
  for (let y = pose.y + 4; y < pose.y + pose.h - 4 && (!near || !found); y += 5)
    for (let x = pose.x + 4; x < pose.x + pose.w - 4; x += 5) {
      const p = { x, y },
        s = g.screen(p);
      if (
        s.y < g.b.y + 150 ||
        s.y > g.b.y + g.b.height - 110 ||
        s.x < g.b.x + 15 ||
        s.x > g.b.x + g.b.width - 15
      )
        continue;
      const exact = rt.scene.pickObject(pack, run, p, alpha, true, true);
      if (
        near
          ? exact === null &&
            rt.scene.pickObjectNear(
              pack,
              run,
              p,
              alpha,
              rt.pointer.pointerRadius('touch', g.camera.scale),
              true,
              true,
              true,
            ) === source
          : exact === source
      ) {
        if (
          !found ||
          Math.hypot(x - pose.x - pose.w / 2, y - pose.y - pose.h / 2) <
            Math.hypot(
              found.world.x - pose.x - pose.w / 2,
              found.world.y - pose.y - pose.h / 2,
            )
        )
          found = { world: p, screen: s };
        if (near) break;
      }
    }
  assert.ok(found, 'visible ' + (near ? 'near-miss ' : '') + source);
  return found.screen;
}
async function dragTo(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.waitForTimeout(80);
}
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    const tag = viewport.width === 390 ? 'phone' : 'desktop';
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      isMobile: tag === 'phone',
      deviceScaleFactor: tag === 'phone' ? 2 : 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => report.errors.push(e.message));
    // Only predecessors of the two response test levels are seeded. Tested nodes remain incomplete.
    await context.addInitScript(
      ({ ids }) => {
        const completed = Object.fromEntries(ids.map((id) => [id, 3]));
        localStorage.setItem(
          'little-red-flower-leaderboard-v1',
          JSON.stringify({
            version: 1,
            players: [
              {
                id: 'pointer-fixture',
                name: '交互回归测试',
                region: '',
                createdAt: Date.now(),
                completed,
              },
            ],
            activePlayerId: 'pointer-fixture',
          }),
        );
      },
      { ids: ['clear-corridor', 'flood-house-response-v1'] },
    );
    await open(page, 'clear-corridor');
    const corridor = rt.levels.getPackage('clear-corridor');
    const near = await point(page, corridor, 'scooter', true);
    await page.touchscreen.tap(near.x, near.y);
    await page.waitForFunction(() => document.querySelector('.configured-player')?.getAttribute('data-selected') === 'scooter');
    assert.match(await page.locator('.configured-collection-feedback').innerText(), /滑板车.*哪里/);
    assert.equal(await page.locator('.configured-player').getAttribute('data-action'), '');
    await page.locator('[data-collection-destination="storage"]').click();
    await page.waitForFunction(() => document.querySelector('.configured-player')?.getAttribute('data-action') === 'store-scooter');
    assert.match(await page.locator('.configured-collection-feedback').innerText(), /已选中玩具滑板车/);
    await page.screenshot({ path: path.join(out, tag + '-pickup.png') });
    await page.waitForFunction(() => document.querySelector('.configured-player')?.getAttribute('data-resolved')?.includes('scooter-stored'));
    assert.match(await page.locator('.configured-collection-feedback').innerText(), /滑板车收好/);
    check(tag + ': scooter transparent-edge touch selects only; explicit storage and committed-success text');
    await open(page, 'typhoon-home');
    const hunt = rt.hunt.getHunt('typhoon-home'),
      skin = hunt.skin;
    const { data } = await dependency('sharp')(
      path.join(root, 'public', skin.mask.slice(1)),
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const hb = await page.locator('.hunt-world canvas').boundingBox(),
      scale = Math.max(hb.width / skin.width, hb.height / skin.height);
    const b = skin.targets.rail.bounds;
    let hp;
    for (let y = b.y; y < b.y + b.h && !hp; y += 3)
      for (let x = b.x; x < b.x + b.w; x += 3) {
        if (rt.mask.hitMask(skin, data, x, y)) continue;
        const id = rt.pointer.nearestPixelHit(
          { x, y },
          rt.pointer.pointerRadius('touch', scale),
          (p) => rt.mask.hitMask(skin, data, p.x, p.y),
        );
        if (id === 'rail') {
          hp = {
            x: hb.x + (hb.width - skin.width * scale) / 2 + x * scale,
            y: hb.y + (hb.height - skin.height * scale) / 2 + y * scale,
          };
          if (hp.y > hb.y + 110) break;
          hp = null;
        }
      }
    assert.ok(hp, 'rail edge fixture');
    await page.touchscreen.tap(hp.x, hp.y);
    await page.waitForFunction(() =>
      document
        .querySelector('.hunt-player')
        ?.getAttribute('data-found')
        ?.includes('rail'),
    );
    check(tag + ': rail mask-edge touch accepted without changing mask');
    await open(page, 'lift-wait');
    const lift = rt.levels.getPackage('lift-wait');
    let person = await point(page, lift, 'person');
    await page.mouse.click(person.x, person.y);
    assert.match(
      await page.locator('.configured-notice').innerText(),
      /已选中被困乘客/,
    );
    const g = await geom(page, lift),
      invalid = g.screen({ x: 650, y: 1100 });
    await dragTo(page, person, invalid);
    assert.equal(
      await page.locator('.configured-notice').getAttribute('data-feedback'),
      'outside',
    );
    await page.mouse.up();
    assert.match(
      await page.locator('.configured-notice').innerText(),
      /未放入可用目标区域/,
    );
    assert.equal(
      await page.locator('.configured-player').getAttribute('data-resolved'),
      '',
    );
    await page.screenshot({ path: path.join(out, tag + '-miss.png') });
    await page.waitForTimeout(500);
    check(tag + ': pickup / outside / rejected-drop feedback; no goal granted');
    // A dangerous authored region must retain its warning, never be auto-corrected to the safe zone.
    const door = lift.skin.zones.door,
      doorPoint = g.screen({ x: door.x + door.w / 2, y: door.y + door.h / 2 });
    await dragTo(page, person, doorPoint);
    assert.equal(
      await page.locator('.configured-notice').getAttribute('data-feedback'),
      'danger',
    );
    assert.match(
      await page.locator('.configured-notice').innerText(),
      /^禁止放置/,
    );
    await page.mouse.up();
    assert.match(
      await page.locator('.configured-notice').innerText(),
      /不要尝试从门缝离开/,
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector('.configured-player')
          ?.getAttribute('data-action') === '',
    );
    check(
      tag +
        ': authored dangerous drop still warns instead of silently snapping elsewhere',
    );
    const wait = lift.skin.zones.wait,
      waitPoint = g.screen({ x: wait.x + wait.w / 2, y: wait.y + wait.h / 2 });
    await dragTo(page, person, waitPoint);
    assert.equal(
      await page.locator('.configured-notice').getAttribute('data-feedback'),
      'target',
    );
    await page.screenshot({ path: path.join(out, tag + '-target.png') });
    await page.mouse.up();
    await page.waitForFunction(() =>
      document
        .querySelector('.configured-player')
        ?.getAttribute('data-resolved')
        ?.includes('person-waiting'),
    );
    check(tag + ': highlighted drop is accepted by the same resolver');
    await open(page, 'quake-cover-practice');
    const quake = rt.levels.getPackage('quake-cover-practice'),
      adult = await point(page, quake, 'adult-moving'),
      qg = await geom(page, quake),
      zone = quake.skin.zones['table-cover'];
    await dragTo(
      page,
      adult,
      qg.screen({ x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 }),
    );
    assert.equal(
      await page.locator('.configured-notice').getAttribute('data-feedback'),
      'target',
    );
    assert.equal(
      await page.locator('canvas').first().getAttribute('data-drop-zone'),
      'table-cover',
    );
    await page.screenshot({
      path: path.join(out, tag + '-practice-target.png'),
    });
    await page.mouse.up();
    await page.waitForFunction(() =>
      document
        .querySelector('.configured-player')
        ?.getAttribute('data-resolved')
        ?.includes('under-cover'),
    );
    check(tag + ': staged practice keeps preview/release aligned');
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      await page
        .screenshot({ path: path.join(out, 'failure.png') })
        .catch(() => {});
      console.log(await page.locator('body').innerText());
    }
  throw error;
} finally {
  await browser.close();
  report.browserClosed = true;
  fs.writeFileSync(
    path.join(out, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
