/** Real offline pointer/touch QA. Fixtures unlock the map only, never gameplay goals. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dependency, root } from './lib/dependencies.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const runtime = path.join(fs.mkdtempSync(path.join(tmpdir(), 'flood-rooftop-browser-')), 'runtime.mjs');
await dependency('esbuild').build({ absWorkingDir: root, stdin: { resolveDir: root, contents: [
  "export * as engine from './app/game/runtime/engine';",
  "export * as scene from './app/game/runtime/scene';",
  "export * as drops from './app/game/runtime/drop-zones';",
  "export {default as rules} from './tests/fixtures/flood-rooftop-v2/level.json';",
  "export {default as skin} from './tests/fixtures/flood-rooftop-v2/skins/paper-gouache.json';",
].join('\n') }, bundle: true, platform: 'node', format: 'esm', outfile: runtime, logLevel: 'silent' });
const rt = await import(pathToFileURL(runtime)), pack = { rules: rt.rules, skin: rt.skin }, id = pack.rules.id;
const html = path.resolve(root, process.argv[2] ?? 'D:/中关村/小红花/test1/outputs/版本存档/洪水围困_屋顶转移版_20260913/小红花应急行动.html');
const out = path.resolve(root, process.argv[3] ?? 'docs/flood-rooftop/verification/browser');
fs.mkdirSync(out, { recursive: true });
const report = { status: 'running', html, sha256: createHash('sha256').update(fs.readFileSync(html)).digest('hex'),
  checks: [], errors: [], network: [], screenshots: [], physicalPhone: 'not_run', humanListening: 'not_run',
  visualReview: 'Screenshots supplied separately; model geometry checks are not a human visual review.', browserClosed: false };
const images = {};
for (const [asset, a] of Object.entries(pack.skin.assets)) images[asset] = await dependency('sharp')(path.join(root, 'public', a.src.slice(1))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const alpha = (asset, p) => { const a = images[asset], x = Math.floor(p.x * a.info.width), y = Math.floor(p.y * a.info.height); return x >= 0 && y >= 0 && x < a.info.width && y < a.info.height && a.data[(y * a.info.width + x) * 4 + 3] > 35; };
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--mute-audio'] });
let page, run, reduced;
const player = () => page.locator('.configured-player'), canvas = () => page.locator('.configured-world canvas');
const tick = ms => page.clock.runFor(ms);
const shot = async name => { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); };
const check = (name, data = {}) => { report.checks.push({ name, ...data }); console.log('PASS ' + name); };
const scores = () => page.evaluate(() => { const a = JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1')); return a.players.find(p => p.id === a.activePlayerId).completed; });
const pose = object => rt.scene.scenePoses(pack, run, reduced).find(p => p.id === object);
const ruleFor = name => { const r = pack.rules.interactions.find(r => r.id === name); assert(r, 'declared interaction ' + name); return r; };

async function syncRun() {
  const state = await player().evaluate(p => ({ resolved: p.dataset.resolved.split(',').filter(Boolean), elapsed: Number(p.dataset.elapsed), phase: p.dataset.phase,
    stages: (p.dataset.stages ?? '').split(',').filter(Boolean), escaped: p.dataset.escaped === 'true' }));
  run.resolvedAt ??= {}; for (const goal of state.resolved) if (!run.resolved.includes(goal)) run.resolvedAt[goal] = state.elapsed;
  Object.assign(run, state, { action: null }); return run;
}
async function openLevel() {
  await page.locator('[data-category="nature"]').click(); await tick(100);
  const node = page.locator(`[data-map-node="${id}"]`); await node.scrollIntoViewIfNeeded();
  assert.notEqual(await node.getAttribute('data-status'), 'locked'); await node.click();
  await page.getByRole('button', { name: /^(进入场景|再守护一次)$/ }).click();
  await page.waitForFunction(() => document.querySelector('.configured-player')?.dataset.ready === 'true');
  await page.locator('.configured-dialog').getByRole('button', { name: '进入场景', exact: true }).click();
  await tick(100); run = rt.engine.createRun(pack); await syncRun();
  assert.equal(await player().getAttribute('data-level'), id);
}
async function retry() {
  const failed = (await player().getAttribute('data-phase')) === 'failed';
  await (failed
    ? page.locator('.painted-failure').getByRole('button', { name: '不服，再来！', exact: true })
    : page.getByRole('button', { name: '重新开始', exact: true })).click(); await tick(failed ? 300 : 100);
  run = rt.engine.createRun(pack); await syncRun();
  assert.equal(run.phase, 'playing'); assert.deepEqual(run.resolved, []);
  assert.equal(await player().getAttribute('data-failure'), null); assert.equal(await player().getAttribute('data-escaped'), 'false');
}
async function coordinates() {
  const b = await canvas().boundingBox(), c = await canvas().evaluate(c => ({ x: Number(c.dataset.cameraX), y: Number(c.dataset.cameraY), scale: Number(c.dataset.cameraScale) }));
  return p => ({ x: b.x + c.x + p.x * c.scale, y: b.y + c.y + p.y * c.scale });
}
async function visiblePoint(points, label) {
  const p = await page.evaluate(ps => { const good = ps.filter(p => document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS'); return good[Math.floor(good.length / 2)]; }, points);
  assert(p, 'visible, alpha-hittable unoccluded point: ' + label); return p;
}
async function sourcePoint(object) {
  const a = pose(object), xy = await coordinates(), points = []; assert(a, 'object has a pose ' + object);
  for (let y = .06; y < .96; y += .022) for (let x = .05; x < .97; x += .022) {
    const p = { x: a.x + x * a.w, y: a.y + y * a.h };
    if (rt.scene.pickObject(pack, run, p, alpha, reduced) === object) points.push(xy(p));
  }
  return visiblePoint(points, object);
}
async function sendInput(name) {
  await syncRun(); const rule = ruleFor(name), from = await sourcePoint(rule.source);
  if (rule.mode === 'tap') await page.touchscreen.tap(from.x, from.y);
  else {
    const z = pack.skin.zones[rule.target], xy = await coordinates(), points = [];
    for (const y of [.5, .25, .75, .1, .9]) for (const x of [.5, .25, .75, .1, .9]) {
      const p = { x: z.x + x * z.w, y: z.y + y * z.h };
      if (rt.drops.pickRelevantZone(pack, run, p, rule.source) === rule.target) points.push(xy(p));
    }
    const to = await visiblePoint(points, rule.target);
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 12 }); await tick(30); await page.mouse.up();
  }
  return { rule, duration: pack.skin.animations[rule.animation].durationMs };
}
async function action(name, captureName) {
  const a = await sendInput(name); assert.equal(await player().getAttribute('data-action'), name, 'real input accepted ' + name);
  if (captureName) { const time = Math.min(800, a.duration - 40); await tick(time); await shot(captureName); await tick(a.duration - time + 80); }
  else await tick(a.duration + 80);
  await syncRun(); for (const goal of a.rule.grants) assert(run.resolved.includes(goal), 'committed ' + goal);
  return a;
}
async function assertViewport(width, height) {
  const b = await player().boundingBox();
  assert(Math.abs(b.y) < 1 && Math.abs(b.height - height) < 1, 'full height');
  if (width < 600) assert(Math.abs(b.width - width) < 1, 'full mobile width'); else assert(b.width <= 540, 'portrait stage on desktop');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1), false, 'no page overflow');
  assert.equal(await canvas().getAttribute('data-critical-clipped'), 'false', 'shared camera does not clip authored critical regions');
  check('full-height shared portrait viewport ' + width, { bounds: b });
}
async function accessibleObjects(label) {
  await syncRun(); const xy = await coordinates(), surface = await player().boundingBox(), checked = [];
  for (const object of pack.rules.objects.filter(o => o.input !== 'none' && rt.engine.enabled(o, run))) {
    const p = pose(object.id); if (!p || (p.opacity ?? 1) <= .05) continue;
    await sourcePoint(object.id);
    const a = xy({ x: p.x, y: p.y }), b = xy({ x: p.x + p.w, y: p.y + p.h });
    // Transparent padding may be cropped. The actual clickable alpha was checked above;
    // this report records declared geometry rather than inventing larger hit areas.
    checked.push({ object: object.id, rect: { left: a.x, top: a.y, right: b.x, bottom: b.y }, withinSurface: a.x >= surface.x - 1 && b.x <= surface.x + surface.width + 1 && a.y >= -1 && b.y <= surface.height + 1 });
  }
  assert(checked.every(o => o.withinSurface), 'interactive sprite rectangles remain in the mobile scene');
  check(label, { objects: checked });
}
async function assertLoops(label) {
  await page.waitForTimeout(160); await tick(420);
  assert.equal(Number(await player().getAttribute('data-audio-loops')), 3);
  const loops = await page.evaluate(() => window.__audioSources.filter(s => s.loop && !s.stopped)); assert.equal(loops.length, 3);
  for (const seconds of [6, 8]) assert(loops.some(s => s.rate === 22050 && Math.abs(s.length / s.rate - seconds) < .001), 'native environmental loop ' + seconds);
  check(label, { loops });
}
async function fatal(name, suffix) {
  await syncRun(); const previousGoals = [...run.resolved], previousScores = await scores(), blockedTap = await sourcePoint('phone');
  const a = await sendInput(name);
  assert.equal(await player().getAttribute('data-phase'), 'failed', 'wrong choice immediately locks gameplay');
  assert.equal(await player().getAttribute('data-failure'), name); assert.equal(await player().getAttribute('data-failure-revealing'), 'true');
  assert.equal(await page.locator('[data-testid="failure-title"]').count(), 0, 'no premature popup');
  const frozenElapsed = await player().getAttribute('data-elapsed');
  await page.touchscreen.tap(blockedTap.x, blockedTap.y); await tick(640);
  assert.equal(await player().getAttribute('data-action'), '', 'no new action while failure is revealing');
  assert.equal(await player().getAttribute('data-elapsed'), frozenElapsed, 'gameplay time frozen during failure');
  assert.equal(await player().getAttribute('data-failure-revealing'), 'true');
  assert(Number(await player().getAttribute('data-failure-age')) >= 600, 'presentation clock advances');
  assert.equal(await page.locator('[data-testid="failure-title"]').count(), 0);
  await shot('failure-mid-' + name + '-' + suffix); await tick(a.duration - 640 + 100);
  await page.locator('[data-testid="failure-title"]').waitFor();
  assert.equal(await page.locator('[data-testid="failure-title"]').innerText(), '怎么回事！');
  await syncRun(); assert.deepEqual(run.resolved, previousGoals); assert.deepEqual(await scores(), previousScores);
  assert.equal(await page.locator('.painted-settlement').count(), 0); assert.equal(await player().getAttribute('data-failure-revealing'), 'false');
  await shot('failure-result-' + name + '-' + suffix);
  check('fatal choice locks input, shows consequence first, then retry popup; no reward: ' + name + ' ' + suffix);
  await retry(); assert.deepEqual(await scores(), previousScores);
}
async function pauseCheck() {
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const elapsed = await player().getAttribute('data-elapsed'), displayedTime = await page.locator('.configured-hud time').innerText();
  await tick(4000); assert.equal(await player().getAttribute('data-elapsed'), elapsed); assert.equal(await page.locator('.configured-hud time').innerText(), displayedTime);
  assert.equal(await player().getAttribute('data-audio-state'), 'suspended');
  await page.getByRole('button', { name: '全部静音', exact: true }).click(); await page.getByRole('button', { name: '继续游戏', exact: true }).click(); await tick(1100);
  assert(Number(await player().getAttribute('data-elapsed')) > Number(elapsed)); assert.equal(Number(await player().getAttribute('data-audio-rms')), 0);
  await page.getByRole('button', { name: '暂停', exact: true }).click(); await page.getByRole('button', { name: '取消静音', exact: true }).click(); await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await assertLoops('resume retains exactly three audio loops'); check('pause freezes elapsed training time and audio; resume continues time, mute persists');
}

try {
  const sizes = process.env.FLOOD_ROOF_QA_QUICK === '1' ? [[390, 844]] : [[320, 568], [375, 667], [390, 844], [430, 932], [1440, 900]];
  for (const [width, height] of sizes) {
    reduced = width !== 390;
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 600, hasTouch: true, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    try {
      page = await context.newPage(); page.setDefaultTimeout(15000);
      await page.addInitScript(() => {
        window.__audioSources = []; const records = new WeakMap(), start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
        AudioBufferSourceNode.prototype.start = function (...args) { const r = { length: this.buffer?.length, rate: this.buffer?.sampleRate, loop: this.loop, stopped: false }; records.set(this, r); window.__audioSources.push(r); return start.apply(this, args); };
        AudioBufferSourceNode.prototype.stop = function (...args) { const r = records.get(this); if (r) r.stopped = true; return stop.apply(this, args); };
      });
      page.on('pageerror', e => report.errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) report.network.push(r.url()); });
      await page.goto(pathToFileURL(html).href); await page.locator('[data-home-start]').click(); await page.locator('.garden-node').first().waitFor();
      await page.evaluate(() => { const key = 'little-red-flower-leaderboard-v1', s = JSON.parse(localStorage.getItem(key)); s.players.find(p => p.id === s.activePlayerId).completed = { 'quake-cover-practice': 3, 'quake-exit-practice': 3 }; localStorage.setItem(key, JSON.stringify(s)); });
      await page.reload(); await page.locator('[data-home-continue]').click(); await page.locator('.garden-node').first().waitFor();
      await page.clock.install({ time: new Date('2026-09-13T03:00:00Z') }); await page.clock.pauseAt(new Date('2026-09-13T03:00:01Z'));
      await openLevel(); await shot('start-' + width); await assertViewport(width, height); await accessibleObjects('visible alpha-hit sources before play ' + width); await assertLoops('music and environmental playback ' + width);
      if (width === 390) {
        await pauseCheck(); for (const failure of ['enter-flood', 'touch-wire', 'stay-in-car']) await fatal(failure, width);
        const previousScores = await scores(); await action('approach-stairs'); await action('early-roof-escape', 'early-roof-transition-' + width);
        assert.equal(await player().getAttribute('data-escaped'), 'true'); await shot('early-roof-arrival-' + width); await tick(6200);
        await page.getByRole('heading', { name: '已先行到达高处', exact: true }).waitFor(); assert.deepEqual(await scores(), previousScores);
        assert.equal(await page.locator('.garden-settlement').count(), 0); check('early roof escape allowed without collecting supplies; no completion reward'); await retry();
      } else await fatal('enter-flood', width);
      await action('approach-stairs', 'approach-stairs-' + width); await shot('at-stairs-' + width); await accessibleObjects('sources remain reachable beside stairs ' + width);
      await action('turn-off-power', 'turning-off-power-' + width); await shot('power-off-' + width);
      const order = width === 390 ? ['pack-light', 'combine-float', 'send-location', 'pack-water'] : ['send-location', 'pack-water', 'pack-light', 'combine-float'];
      for (const name of order) {
        await action(name, name + '-' + width);
        if (name === 'pack-water' || name === 'pack-light') assert((pose(name === 'pack-water' ? 'bottled-water' : 'flashlight').opacity ?? 1) <= .05, 'packed prop no longer remains outside backpack');
      }
      assert.equal(run.resolved.length, 6); await shot('ready-for-roof-' + width);
      await action('evacuate-roof', 'roof-transition-' + width); assert.equal(run.resolved.length, 7); assert.equal(await player().getAttribute('data-escaped'), 'false'); await shot('roof-arrival-' + width);
      await tick(6200); await page.locator('.garden-settlement').waitFor(); assert.equal((await scores())[id], 3); await shot('complete-' + width);
      check('seven real interactions complete and award three flowers ' + width);
      if (width === 390) {
        const saved = await scores(); await page.locator('[data-testid="settlement-primary"]').click(); await tick(3000); await openLevel();
        for (const name of ['approach-stairs', 'turn-off-power', 'send-location', 'pack-water', 'pack-light', 'combine-float', 'evacuate-roof']) await action(name);
        await tick(6200); await page.locator('.garden-settlement').waitFor(); assert.deepEqual(await scores(), saved); assert.equal(await page.locator('[data-testid="settlement-reward"]').innerText(), '小红花已种下 · 本次为巩固练习'); check('replay does not duplicate flowers or mutate prerequisite scores');
      }
    } catch (error) { await shot('FAIL-' + width).catch(() => {}); throw error; }
    finally { await context.close(); }
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.network, []); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; console.error(error); process.exitCode = 1; }
finally { await browser.close(); report.browserClosed = true; fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2)); }
