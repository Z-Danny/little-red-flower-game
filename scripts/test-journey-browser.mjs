/** End-to-end: isolated offline browser, real pointer inputs, no injected scores or completion state. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dependency, root } from './lib/dependencies.mjs';
const require = createRequire(import.meta.url),
  { chromium } = require(
    process.env.PLAYWRIGHT_PATH ??
      'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
  );
const outfile = path.join(
  fs.mkdtempSync(path.join(tmpdir(), 'journey-browser-')),
  'runtime.mjs',
);
await dependency('esbuild').build({
  absWorkingDir: root,
  stdin: {
    contents: [
      "export * as catalog from './app/game/levels';",
      "export * as journey from './app/game/journey/progress';",
      "export * as hunts from './app/game/scene-hunt/registry';",
      "export * as disasterScene from './app/game/disaster/scene';",
      "export * as disasters from './app/game/disaster/registry';",
      "export * as config from './app/game/kitchen/config';",
      "export * as kitchenModel from './app/game/kitchen/model';",
      "export * as kitchenScene from './app/game/kitchen/animation';",
      "export * as kitchenInput from './app/game/kitchen/interaction';",
      "export * as kitchenCamera from './app/game/kitchen/camera';",
      "export * as engine from './app/game/runtime/engine';",
      "export * as scene from './app/game/runtime/scene';",
      "export * as drops from './app/game/runtime/drop-zones';",
    ].join('\n'),
    resolveDir: root,
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'silent',
});
const rt = await import(pathToFileURL(outfile));
const out = path.join(root, 'outputs/response-map-verification/browser');
fs.mkdirSync(out, { recursive: true });
const html = path.resolve(
  root,
  process.argv[2] ?? 'outputs/本地离线版/小红花应急行动.html',
);
const report = {
  html,
  sha256: createHash('sha256').update(fs.readFileSync(html)).digest('hex'),
  browser: '',
  checks: [],
  errors: [],
  network: [],
  status: 'running',
  physicalDevice: 'not_run',
  humanListening: 'not_run',
  browserClosed: false,
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EDGE_PATH ??
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--mute-audio'],
});
report.browser = browser.version();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on('pageerror', (e) => report.errors.push(e.message));
page.on('request', (r) => {
  if (/^https?:/.test(r.url())) report.network.push(r.url());
});
const check = (name, data = {}) => {
  report.checks.push({ name, status: 'passed', ...data });
  console.log('PASS ' + name);
};
const shot = (name) => page.screenshot({ path: path.join(out, name + '.png') });
const tick = (ms) => page.clock.runFor(ms);
const saved = () =>
  page.evaluate(() => {
    const s = JSON.parse(
      localStorage.getItem('little-red-flower-leaderboard-v1'),
    );
    return s.players.find((p) => p.id === s.activePlayerId).completed;
  });
async function selectRegion(region) {
  await page.locator(`[data-category="${region.id}"]`).click();
}
async function open(id) {
  await selectRegion(rt.journey.regionFor(id));
  await tick(100);
  await page.locator(`[data-map-node="${id}"]`).scrollIntoViewIfNeeded();
  await page.locator(`[data-map-node="${id}"]`).click();
  await page.getByRole('button', { name: /^(进入场景|再守护一次)$/ }).click();
  await tick(200);
  const entry = page.locator('.hunt-entry>button,.disaster-entry>button');
  if (await entry.count()) {
    await entry.waitFor();
    await entry.click();
  }
  const practiceEntry=page.locator('.configured-dialog').getByRole('button',{name:'进入场景',exact:true});
  if(await practiceEntry.count()) await practiceEntry.click();
  await tick(200);
}
async function pick(points) {
  const p = await page.evaluate(
    (points) =>
      (() => {
        const visible = points.filter(
          (p) => document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS',
        );
        return visible[Math.floor(visible.length / 2)];
      })(),
    points,
  );
  assert(p, 'visible pointer target');
  return p;
}
async function tap(p) {
  await page.touchscreen.tap(p.x, p.y);
}
async function drag(a, b) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}
const middle = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
async function hunt(id) {
  const pack = rt.hunts.getHunt(id),
    s = pack.skin,
    { data } = await dependency('sharp')(
      path.join(root, 'public', s.mask.slice(1)),
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  for (const t of pack.rules.targets) {
    const b = await page.locator('.hunt-world canvas').boundingBox(),
      scale = Math.max(b.width / s.width, b.height / s.height),
      dx = (b.width - s.width * scale) / 2,
      dy = (b.height - s.height * scale) / 2,
      points = [];
    for (let y = 0; y < s.height; y += 4)
      for (let x = 0; x < s.width; x += 4) {
        const i = (y * s.width + x) * 4;
        if (
          data[i + 3] > 128 &&
          s.targets[t.id].color.every((v, j) => v === data[i + j])
        ) {
          const px = b.x + dx + (x + 0.5) * scale,
            py = b.y + dy + (y + 0.5) * scale;
          if (
            px > b.x + 5 &&
            px < b.x + b.width - 5 &&
            py > b.y + 50 &&
            py < b.y + b.height - 40
          )
            points.push({ x: px, y: py });
        }
      }
    await tap(await pick(points));
    await tick(850);
    assert(
      (await page.locator('.hunt-player').getAttribute('data-found'))
        .split(',')
        .includes(t.id),
      'hunt actual hit ' + t.id,
    );
  }
}
const rasterCache = new Map();
async function rasters(assets) {
  const result = {};
  for (const [id, asset] of Object.entries(assets)) {
    const src = typeof asset === 'string' ? asset : asset.src;
    if (!rasterCache.has(src))
      rasterCache.set(
        src,
        await dependency('sharp')(path.join(root, 'public', src.slice(1)))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true }),
      );
    result[id] = rasterCache.get(src);
  }
  return result;
}
async function configured(id) {
  const pack = rt.catalog.getPackage(id),
    images = await rasters(pack.skin.assets),
    run = rt.engine.createRun(pack),
    canvas = page.locator('.configured-world canvas');
  const alpha = (id, p) => {
    const { data, info } = images[id];
    const x = Math.min(info.width - 1, Math.floor(p.x * info.width)),
      y = Math.min(info.height - 1, Math.floor(p.y * info.height));
    return x >= 0 && y >= 0 && data[(y * info.width + x) * 4 + 3] > 35;
  };
  for (let guard = 0; guard < 40 && !rt.engine.finished(pack, run); guard++) {
    run.resolved = (
      await page.locator('.configured-player').getAttribute('data-resolved')
    )
      .split(',')
      .filter(Boolean);
    run.stages=(await page.locator('.configured-player').getAttribute('data-stages')??'').split('|').filter(Boolean);
    if (rt.engine.finished(pack, run)) break;
    const rule = pack.rules.interactions.find(
      (r) =>
        r.outcome === 'correct' &&
        r.grants.some((g) => !run.resolved.includes(g)) &&
        rt.engine.findRule(pack, run, {
          source: r.source,
          mode: r.mode,
          target: r.target,
        })?.id === r.id,
    );
    if(!rule) {const waiting=(pack.rules.stages??[]).filter(s=>s.requires.every(g=>run.resolved.includes(g))&&!run.stages.includes(s.id));assert(waiting.length,'next configured goal '+id);await tick(Math.max(...waiting.map(s=>s.afterMs))+150);continue;}
    const pose = rt.scene
        .scenePoses(pack, run, true)
        .find((p) => p.id === rule.source),
      b = await canvas.boundingBox();
    const cam = await canvas.evaluate((c) => ({
      x: Number(c.dataset.cameraX),
      y: Number(c.dataset.cameraY),
      scale: Number(c.dataset.cameraScale),
    }));
    const c = cam.scale ? cam : rt.scene.cameraFor(pack, b.width, b.height),
      toScreen = (p) => ({
        x: b.x + c.x + p.x * c.scale,
        y: b.y + c.y + p.y * c.scale,
      }),
      points = [];
    for (let y = 0.08; y < 0.93; y += 0.035)
      for (let x = 0.08; x < 0.93; x += 0.035) {
        const p = { x: pose.x + x * pose.w, y: pose.y + y * pose.h };
        if (rt.scene.pickObject(pack, run, p, alpha, true) === rule.source)
          points.push(toScreen(p));
      }
    const at = await pick(points);
    if (rule.mode === 'tap') await tap(at);
    else if(pack.skin.presentation) {
      const z=pack.skin.zones[rule.target], points=[[.5,.5],[.25,.5],[.75,.5],[.5,.25],[.5,.75]].map(([x,y])=>({x:z.x+z.w*x,y:z.y+z.h*y})).filter(p=>rt.drops.pickRelevantZone(pack,run,p,rule.source)===rule.target).map(toScreen);
      const dest=await pick(points);
      await page.mouse.move(at.x,at.y);await page.mouse.down();
      await page.mouse.move(dest.x,dest.y,{steps:10});await tick(40);
      assert.equal(await canvas.getAttribute('data-drop-zone'),rule.target,'drawn and effective drop '+rule.id);
      await page.mouse.up();
    } else {
      await tap(at);
      await tap(await pick([toScreen(middle(pack.skin.zones[rule.target]))]));
    }
    await tick(1800);
    const actual = (
      await page.locator('.configured-player').getAttribute('data-resolved')
    ).split(',');
    assert(
      rule.grants.every((g) => actual.includes(g)),
      'configured actual goal ' + rule.id,
    );
    run.resolved = actual;
  }
}
async function kitchen() {
  const conf = rt.config,
    local = rt.kitchenModel.createRun();
  local.phase = 'playing';
  const images = await rasters(conf.assets),
    canvas = page.locator('.kitchen-world canvas');
  const alpha = (id, b, p) => {
    const { data, info } = images[id],
      x = Math.min(
        info.width - 1,
        Math.floor(((p.x - b.x) / b.w) * info.width),
      ),
      y = Math.min(
        info.height - 1,
        Math.floor(((p.y - b.y) / b.h) * info.height),
      );
    return x >= 0 && y >= 0 && data[(y * info.width + x) * 4 + 3] > 35;
  };
  const xy = async (p) => {
    const b = await canvas.boundingBox(),
      c = rt.kitchenCamera.cameraFor(b.width, b.height);
    return { x: b.x + c.x + p.x * c.scale, y: b.y + c.y + p.y * c.scale };
  };
  async function source(id) {
    local.reaction = await page
      .locator('.kitchen-player')
      .getAttribute('data-emotion');
    const b =
        id === 'person'
          ? rt.kitchenScene.personPose(local, true).box
          : id === 'gas'
            ? conf.layout.gas
            : conf.layout.props[id],
      points = [];
    for (let y = 0.1; y < 0.94; y += 0.07)
      for (let x = 0.1; x < 0.94; x += 0.07) {
        const p = { x: b.x + x * b.w, y: b.y + y * b.h };
        if (rt.kitchenInput.pickSceneItem(p, local, alpha, true) === id)
          points.push(await xy(p));
      }
    return pick(points);
  }
  await tap(await source('gas'));
  await tick(1000);
  local.gasOff = true;
  for (const [id, target, flag] of [
    ['lid', 'pan', 'covered'],
    ['person', 'exit', 'evacuated'],
  ]) {
    await tap(await source(id));
    await tap(await xy(middle(conf.layout.zones[target])));
    await tick(conf.timing[id] + 200);
    local[flag] = true;
  }
  assert.equal(
    await page.locator('.kitchen-player').getAttribute('data-fire'),
    'out',
  );
}
async function disaster(id) {
  const pack = rt.disasters.getDisaster(id),
    street = pack.rules.kind === 'prevention',
    folder = street ? 'street' : 'flood',
    sample = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          `public/levels/rain-flood-v1/${folder}/hit-samples.json`,
        ),
        'utf8',
      ),
    ),
    s = pack.skin;
  const xy = async (p) => {
    const b = await page.locator('.disaster-world canvas').boundingBox(),
      obstacles = await page.locator('.disaster-player').evaluate((el) => {
        const b = el.getBoundingClientRect();
        return [
          ...el.querySelectorAll(
            '.disaster-hud > button, .disaster-hud > h1, .disaster-hud > time, .disaster-clues > span',
          ),
        ]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width && r.height)
          .map((r) => ({
            x: r.left - b.left,
            y: r.top - b.top,
            w: r.width,
            h: r.height,
          }));
      }),
      cam = rt.disasterScene.disasterCamera(
        b.width,
        b.height,
        s.width,
        s.height,
        s.framing,
        obstacles,
      );
    return {
      x: b.x + cam.x + p.x * cam.scale,
      y: b.y + cam.y + p.y * cam.scale,
    };
  };
  if (street)
    for (const [id, p] of Object.entries(sample)) {
      await tap(await xy(p));
      await tick(1000);
      assert(
        (await page.locator('.disaster-player').getAttribute('data-goals'))
          .split(',')
          .includes(id),
      );
    }
  else
    for (const [from, to, id, input] of [
      [sample.person, { x: 591, y: 510 }, 'stairs', 'drop'],
      [sample.breaker, sample.breaker, 'power', 'tap'],
      [sample.phone, middle(s.poses.personStairs), 'rescue', 'drop'],
      [sample.water, middle(s.sprites.bag.box), 'drinking', 'drop'],
      [sample.flashlight, middle(s.sprites.bag.box), 'lighting', 'drop'],
      [sample.foam, middle(s.sprites.panel.box), 'aid', 'drop'],
      [middle(s.poses.personStairs), middle(s.zones.roof.box), 'roof', 'drop'],
    ]) {
      if (input === 'tap') await tap(await xy(from));
      else await drag(await xy(from), await xy(to));
      await tick(1400);
      assert(
        (await page.locator('.disaster-player').getAttribute('data-goals'))
          .split(',')
          .includes(id),
        'disaster actual goal ' + id,
      );
    }
}
async function complete(id) {
  if (rt.hunts.getHunt(id)) await hunt(id);
  else if (rt.disasters.getDisaster(id)) await disaster(id);
  else if (rt.catalog.getPackage(id)) await configured(id);
  else await kitchen();
  const pack=rt.catalog.getPackage(id);
  await tick(pack?.skin.presentation ? pack.rules.completion.settleMs+(pack.rules.completion.observeMs??0)+500 : 1000);
  await page.locator('.garden-settlement').waitFor();
  await tick(650);
  assert.equal(await page.locator('.garden-reward>.garden-flower').count(), 3);
}
async function returnAndPlant(id, replay = false) {
  await page.getByRole('button', { name: /返回地图/ }).click();
  if (!replay) {
    await tick(700);
    assert.equal(
      await page.locator('.garden-shell').getAttribute('data-planting'),
      id,
    );
    await shot(id + '-planting');
    await tick(2200);
  } else
    assert.equal(
      await page.locator('.garden-shell').getAttribute('data-planting'),
      '',
    );
  assert.equal(
    await page.locator(`[data-map-node="${id}"]`).getAttribute('data-status'),
    'complete',
  );
}
async function mapGeometry(width, height) {
  await page.setViewportSize({ width, height });
  // Test actual resize delivery before installing the gameplay animation clock.
  await page.waitForFunction(() => {
    const node = document
      .querySelector('[data-status="available"]')
      ?.getBoundingClientRect();
    const footer = document
      .querySelector('.garden-footer')
      ?.getBoundingClientRect();
    return node && footer && node.top >= 65 && node.bottom + 20 <= footer.top;
  });
  assert.deepEqual(
    await page.evaluate(() => ({
      x: document.documentElement.scrollWidth > innerWidth + 1,
      y: document.documentElement.scrollHeight > innerHeight + 1,
    })),
    { x: false, y: false },
  );
  const boxes = await page
    .locator(
      '.garden-header button,.garden-tabs button,.garden-guide button,.garden-footer button',
    )
    .evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().toJSON()));
  const title = await page.locator('.garden-title-group').boundingBox(),
    actions = await page.locator('.garden-top-actions').boundingBox();
  assert(
    title.x + title.width <= actions.x + 1,
    'single-row heading must not overlap actions',
  );
  const first = await page
      .locator('[data-status="available"]')
      .first()
      .boundingBox(),
    footer = await page.locator('.garden-footer').boundingBox();
  assert(
    first.y >= 65 && first.y + first.height <= footer.y,
    'bottom entry must be visible above navigation: ' +
      JSON.stringify({ width, height, first, footer }),
  );
  for (const b of boxes) {
    assert(
      b.width >= 44 && b.height >= 44,
      '44px control ' + JSON.stringify(b),
    );
    assert(
      b.x >= 0 &&
        b.y >= 0 &&
        b.x + b.width <= width + 0.2 &&
        b.y + b.height <= height + 0.2,
    );
  }
  await shot(`map-${width}x${height}`);
  check(`map geometry ${width}x${height}`);
}
try {
  await page.goto(pathToFileURL(html).href);
  await page.locator('[data-home-start]').click();
  await page.locator('.garden-node').first().waitFor();
  for (const size of [
    [320, 568],
    [375, 667],
    [390, 844],
    [430, 932],
    [540, 960],
    [1440, 900],
  ])
    await mapGeometry(...size);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await page.clock.install();
  await tick(150);
  assert.equal(await page.locator('[data-category]').count(), 3);
  assert.deepEqual(
    await page
      .locator('.garden-tab-caption')
      .evaluateAll((ns) => ns.map((n) => n.firstChild.textContent)),
    ['自然灾害', '公共安全', '居家校园办公'],
  );
  check('three topic categories preserve progress');
  assert.equal(await page.locator('[data-status="available"]').count(), 2);
  assert.equal(await page.locator('[data-status="locked"]').count(), 9);
  {
    const b = await page.locator('[data-map-node="flood-kit"]').boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  }
  assert.equal(
    await page.getByRole('button', { name: '进入场景', exact: true }).count(),
    0,
  );
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  assert.deepEqual(await saved(), {});
  check('locked node cannot enter or award');
  const remaining = rt.journey.journeyMap.regions.flatMap(r=>r.nodes);
  while (remaining.length) {
      const before = await saved();
      const index = remaining.findIndex(n=>rt.journey.canEnter(n.id,before));
      assert(index>=0,'all remaining levels must have a reachable prerequisite');
      const [node] = remaining.splice(index,1);
      await open(node.id);
      if (node.id === 'typhoon-home') {
        await page.locator('.hunt-hud>button').first().click();
        assert.deepEqual(await saved(), before);
        assert.equal(
          await page
            .locator(`[data-map-node="${node.id==='typhoon-home'?'flood-kit':'quake-exit-practice'}"]`)
            .getAttribute('data-status'),
          'locked',
        );
        check('leaving unfinished scene does not award or unlock');
        await open(node.id);
      }
      if (node.id === 'rain-street-preparation-v1') {
        await tick(93000);
        await page.locator('.disaster-dialog').waitFor();
        assert.equal(await page.locator('.garden-settlement').count(), 0);
        assert.deepEqual(await saved(), before);
        await page
          .locator('.disaster-footer button')
          .filter({ hasText: '返回关卡' })
          .click();
        assert.equal(
          await page
            .locator('[data-map-node="flood-house-response-v1"]')
            .getAttribute('data-status'),
          'locked',
        );
        check('timed failure does not reward or unlock next node');
        await open(node.id);
      }
      await complete(node.id);
      const scores = await saved();
      assert.equal(scores[node.id], 3);
      assert.equal(Object.keys(scores).length, Object.keys(before).length + 1);
      await page.waitForTimeout(900);
      await shot(node.id + '-settlement');
      if (node.id === 'typhoon-home') {
        for (const size of [
          [320, 568],
          [375, 667],
          [390, 844],
          [430, 932],
          [540, 960],
        ]) {
          await page.setViewportSize({ width: size[0], height: size[1] });
          await tick(60);
          const b = await page.locator('.garden-settlement').boundingBox();
          assert(b.y >= 0 && b.x >= 0 && b.y + b.height <= size[1]);
          await shot('settlement-' + size.join('x'));
        }
        await page.setViewportSize({ width: 390, height: 844 });
      }
      await returnAndPlant(node.id);
      check('real pointer completion +3 and planting ' + node.id);
      if (node.id === 'typhoon-home' || node.id === 'quake-cover-practice') {
        await page.reload();
  await page.locator('[data-home-continue]').click();
        await page.locator('.garden-node').first().waitFor();
        await tick(100);
        assert.equal(await page.locator('[data-wallet]').innerText(), String(Object.values(scores).reduce((a,b)=>a+b,0)));
        await selectRegion(rt.journey.regionFor(node.id));
        assert.equal(
          await page
            .locator(`[data-map-node="${node.id === 'typhoon-home' ? 'flood-kit' : 'quake-exit-practice'}"]`)
            .getAttribute('data-status'),
          'available',
        );
        await open(node.id);
        await complete(node.id);
        assert.equal(
          await page.locator('.garden-reward-label').innerText(),
          '本关花朵已种下',
        );
        await returnAndPlant(node.id, true);
        assert.deepEqual(await saved(), scores);
        check('reload and replay preserve progress without duplicate reward');
      }
    }
  assert.equal(await page.locator('[data-wallet]').innerText(), '72');
  for (const region of rt.journey.journeyMap.regions) {
    await selectRegion(region);
    await tick(100);
    assert.equal(
      await page.locator('[data-status="complete"]').count(),
      region.nodes.length,
    );
    assert.equal(
      await page
        .locator(`[data-category="${region.id.replace('-response','')}"]`)
        .getAttribute('data-region-complete'),
      'true',
    );
    await page.waitForTimeout(1000);
    await shot(region.id + '-restored');
  }
  await page.locator('.garden-wallet').click();
  await shot('archive-all-regions');
  assert.equal(await page.locator('.garden-medals .earned').count(), 3);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  check('all regions restored and archive medals persist');
  await page.reload();
  await page.locator('[data-home-continue]').click();
  await page.locator('.garden-node').first().waitFor();
  assert.equal(await page.locator('[data-wallet]').innerText(), '72');
  check('final refresh retains 72 flowers and 24 planted nodes');
  const originalPlayer = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1'))
        .players[0].name,
  );
  await page.getByRole('button', { name: '打开排行榜', exact: true }).click();
  await page.getByRole('button', { name: '添加玩家', exact: true }).click();
  await page.locator('#lb-name').fill('测试第二位');
  await page
    .getByRole('button', { name: '添加并切换玩家', exact: true })
    .click();
  await page.getByRole('button', { name: '返回关卡首页', exact: true }).click();
  assert.equal(await page.locator('[data-wallet]').innerText(), '0');
  assert.deepEqual(await saved(), {});
  check('new local player has independent flowers and locks');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open('oil-fire');
  await complete('oil-fire');
  await page.getByRole('button', { name: /返回地图/ }).click();
  await tick(400);
  await page.reload();
  await page.locator('[data-home-continue]').click();
  await page.locator('.garden-node').first().waitFor();
  assert.equal(await page.locator('[data-wallet]').innerText(), '3');
  assert.equal((await saved())['oil-fire'], 3);
  check('refresh during reduced-motion planting keeps committed reward');
  await page.getByRole('button', { name: '打开排行榜', exact: true }).click();
  await page
    .getByRole('button', { name: '切换为 ' + originalPlayer, exact: true })
    .click();
  await page.getByRole('button', { name: '返回关卡首页', exact: true }).click();
  assert.equal(await page.locator('[data-wallet]').innerText(), '72');
  check('switching back restores original 72 flowers');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.network, []);
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.failure = e.stack;
  process.exitCode = 1;
  console.error(e);
  await shot('FAIL').catch(() => {});
} finally {
  await browser.close();
  report.browserClosed = true;
  fs.writeFileSync(
    path.join(out, 'browser-report.json'),
    JSON.stringify(report, null, 2),
  );
}
