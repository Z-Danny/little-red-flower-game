/** Archived indoor edition only. Disposable browser fixtures unlock only the map; all six goals use real pointer/touch input. */
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
const runtime = path.join(fs.mkdtempSync(path.join(tmpdir(), 'flood-refinement-browser-')), 'runtime.mjs');
await dependency('esbuild').build({
  absWorkingDir: root, stdin: { resolveDir: root, contents: [
    "export * as engine from './app/game/runtime/engine';",
    "export * as scene from './app/game/runtime/scene';",
    "export * as drops from './app/game/runtime/drop-zones';",
    "export * as journey from './app/game/journey/progress';",
    "export {default as rules} from './tests/fixtures/flood-indoor-v1/level.json';",
    "export {default as skin} from './tests/fixtures/flood-indoor-v1/skins/paper-gouache.json';",
  ].join('\n') }, bundle: true, platform: 'node', format: 'esm', outfile: runtime, logLevel: 'silent',
});
const rt = await import(pathToFileURL(runtime));
const pack = { rules: rt.rules, skin: rt.skin }, id = pack.rules.id;
const html = path.resolve(root, process.argv[2] ?? 'D:/中关村/小红花/test1/outputs/版本存档/洪水围困_室内待援版_20260913/小红花应急行动.html');
const out = path.resolve(root, process.argv[3] ?? 'docs/flood-rooftop/verification/archive-browser');
fs.mkdirSync(out, { recursive: true });
const report = {
  status: 'running', html, sha256: createHash('sha256').update(fs.readFileSync(html)).digest('hex'),
  checks: [], errors: [], network: [], physicalPhone: 'not_run', humanListening: 'not_run',
  visualReview: 'screenshots supplied; automated pose checks are not a human visual review', browserClosed: false,
};
const images = {};
for (const [asset, a] of Object.entries(pack.skin.assets)) {
  images[asset] = await dependency('sharp')(path.join(root, 'public', a.src.slice(1))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
const alpha = (asset, point) => {
  const a = images[asset], x = Math.floor(point.x * a.info.width), y = Math.floor(point.y * a.info.height);
  return x >= 0 && y >= 0 && x < a.info.width && y < a.info.height && a.data[(y * a.info.width + x) * 4 + 3] > 35;
};
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--mute-audio'] });
let page, run, reduced;
const player = () => page.locator('.configured-player');
const canvas = () => page.locator('.configured-world canvas');
const tick = ms => page.clock.runFor(ms);
const shot = name => page.screenshot({ path: path.join(out, name + '.png') });
const check = (name, data = {}) => { report.checks.push({ name, ...data }); console.log('PASS ' + name); };
const scores = () => page.evaluate(() => {
  const a = JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1'));
  return a.players.find(p => p.id === a.activePlayerId).completed;
});

async function syncRun() {
  const state = await player().evaluate(p => ({ resolved: p.dataset.resolved.split(',').filter(Boolean), elapsed: Number(p.dataset.elapsed), phase: p.dataset.phase, stages: (p.dataset.stages ?? '').split(',').filter(Boolean) }));
  run.resolvedAt ??= {};
  for (const goal of state.resolved) if (!run.resolved.includes(goal)) run.resolvedAt[goal] = state.elapsed;
  Object.assign(run, state, { action: null });
  return run;
}
const authoredPose = object => rt.scene.scenePoses(pack, run, reduced).find(p => p.id === object);
async function openLevel() {
  await page.locator('[data-category="nature"]').click(); await tick(100);
  const node = page.locator(`[data-map-node="${id}"]`);
  await node.scrollIntoViewIfNeeded();
  assert.notEqual(await node.getAttribute('data-status'), 'locked', 'the flood node stays unlocked');
  await node.click();
  await page.getByRole('button', { name: /^(进入场景|再守护一次)$/ }).click();
  await page.waitForFunction(() => document.querySelector('.configured-player')?.dataset.ready === 'true');
  await page.locator('.configured-dialog').getByRole('button', { name: '进入场景', exact: true }).click();
  await tick(100); run = rt.engine.createRun(pack); await syncRun();
  assert.equal(await player().getAttribute('data-level'), id);
}
async function toScreen() {
  const b = await canvas().boundingBox();
  const camera = await canvas().evaluate(c => ({ x: Number(c.dataset.cameraX), y: Number(c.dataset.cameraY), scale: Number(c.dataset.cameraScale) }));
  return point => ({ x: b.x + camera.x + point.x * camera.scale, y: b.y + camera.y + point.y * camera.scale });
}
async function visiblePoint(points, label) {
  const result = await page.evaluate(ps => {
    const usable = ps.filter(p => document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS');
    return usable[Math.floor(usable.length / 2)];
  }, points);
  assert(result, 'a visible unobstructed input point for ' + label);
  return result;
}
async function beginAction(ruleId) {
  await syncRun();
  const rule = pack.rules.interactions.find(r => r.id === ruleId), xy = await toScreen();
  assert(rule, 'declared rule ' + ruleId);
  const pose = authoredPose(rule.source), points = [];
  for (let y = .08; y < .94; y += .027) for (let x = .07; x < .95; x += .027) {
    const p = { x: pose.x + x * pose.w, y: pose.y + y * pose.h };
    if (rt.scene.pickObject(pack, run, p, alpha, reduced) === rule.source) points.push(xy(p));
  }
  const from = await visiblePoint(points, rule.source);
  if (rule.mode === 'tap') await page.touchscreen.tap(from.x, from.y);
  else {
    const z = pack.skin.zones[rule.target], destinations = [];
    for (const y of [.5, .25, .75, .1, .9]) for (const x of [.5, .25, .75, .1, .9]) {
      const p = { x: z.x + x * z.w, y: z.y + y * z.h };
      if (rt.drops.pickRelevantZone(pack, run, p, rule.source) === rule.target) destinations.push(xy(p));
    }
    const to = await visiblePoint(destinations, rule.target);
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 }); await tick(30); await page.mouse.up();
  }
  assert.equal(await player().getAttribute('data-action'), ruleId, 'the browser accepted real input: ' + ruleId);
  return { rule, duration: pack.skin.animations[rule.animation].durationMs };
}
async function finishAction(action, elapsed = 0) {
  await tick(action.duration - elapsed + 80); await syncRun();
  for (const goal of action.rule.grants) assert(run.resolved.includes(goal), 'goal committed ' + goal);
}
async function action(ruleId) { const a = await beginAction(ruleId); await finishAction(a); }
async function capturedAction(ruleId, time, name) {
  const a = await beginAction(ruleId), t = Math.min(time, a.duration - 50);
  await tick(t); await shot(name); await finishAction(a, t);
}
async function assertLoops(label) {
  // Production diagnostics refresh every 350 ms; let that real UI timer run.
  await page.waitForTimeout(160); await tick(420);
  assert.equal(Number(await player().getAttribute('data-audio-loops')), 3);
  const active = await page.evaluate(() => window.__audioSources.filter(a => a.loop && !a.stopped));
  assert.equal(active.length, 3, 'three native loop sources, not duplicated');
  for (const duration of [6, 8]) assert(active.some(a => a.rate === 22050 && Math.abs(a.length / a.rate - duration) < .001), `${duration}s water/rain buffer started`);
  check(label, { nativeLoops: active });
}
function assertUsedClothHidden() {
  assert((authoredPose('bright-cloth').opacity ?? 1) <= .05, 'used standalone folded cloth is hidden');
}

try {
  const sizes = process.env.FLOOD_QA_QUICK === '1' ? [[390, 844]] : [[320, 568], [375, 667], [390, 844], [430, 932], [1440, 900]];
  for (const [width, height] of sizes) {
    reduced = width !== 390;
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 600, hasTouch: true, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    try {
      page = await context.newPage(); page.setDefaultTimeout(15000);
      await page.addInitScript(() => {
        window.__audioSources = [];
        const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
        const records = new WeakMap();
        AudioBufferSourceNode.prototype.start = function (...args) {
          const record = { length: this.buffer?.length, rate: this.buffer?.sampleRate, loop: this.loop, stopped: false };
          records.set(this, record); window.__audioSources.push(record); return start.apply(this, args);
        };
        AudioBufferSourceNode.prototype.stop = function (...args) { const record = records.get(this); if (record) record.stopped = true; return stop.apply(this, args); };
      });
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('request', r => { if (/^https?:/.test(r.url())) report.network.push(r.url()); });
      await page.goto(pathToFileURL(html).href);
      await page.locator('[data-home-start]').click(); await page.locator('.garden-node').first().waitFor();
      // Fixtures in this disposable browser only. No gameplay goals are injected.
      await page.evaluate(() => {
        const key = 'little-red-flower-leaderboard-v1', s = JSON.parse(localStorage.getItem(key));
        s.players.find(p => p.id === s.activePlayerId).completed = { 'quake-cover-practice': 3, 'quake-exit-practice': 3 };
        localStorage.setItem(key, JSON.stringify(s));
      });
      await page.reload(); await page.locator('[data-home-continue]').click(); await page.locator('.garden-node').first().waitFor();
      await page.clock.install({ time: new Date('2026-09-13T03:00:00Z') });
      await page.clock.pauseAt(new Date('2026-09-13T03:00:01Z'));
      await openLevel(); await shot('start-' + width);
      const bounds = await player().boundingBox();
      assert(Math.abs(bounds.y) < 1 && Math.abs(bounds.height - height) < 1, 'full-height player');
      if (width < 600) assert(Math.abs(bounds.width - width) < 1, 'mobile width preserved');
      else assert(bounds.width <= 540, 'desktop retains portrait stage');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1), false);
      check('shared viewport remains full height with no document scroll ' + width, { bounds });
      await assertLoops('actual flood and rain buffers plus music ' + width);
      const initialActor = authoredPose('family').asset;
      if (width === 390) {
        const before = [...run.resolved]; await action('enter-flood-error'); assert.deepEqual(run.resolved, before);
        const sounds = await page.evaluate(() => window.__audioSources);
        assert(sounds.some(s => !s.loop && s.length === Math.ceil(1.05 * 22050)), 'wrong-water impact PCM is actually started');
        await shot('wrong-water-390'); check('entering flood is rejected and produces native impact audio');
        await page.getByRole('button', { name: '暂停', exact: true }).click();
        const elapsed = await player().getAttribute('data-elapsed'); await tick(4000);
        assert.equal(await player().getAttribute('data-elapsed'), elapsed);
        assert.equal(await player().getAttribute('data-audio-state'), 'suspended');
        await page.getByRole('button', { name: '全部静音', exact: true }).click();
        await page.getByRole('button', { name: '继续游戏', exact: true }).click(); await tick(100);
        assert.equal(Number(await player().getAttribute('data-audio-rms')), 0);
        await page.getByRole('button', { name: '暂停', exact: true }).click();
        await page.getByRole('button', { name: '取消静音', exact: true }).click();
        await page.getByRole('button', { name: '继续游戏', exact: true }).click();
        await assertLoops('pause/mute/resume retains one group of three loops');
        check('pause freezes elapsed time and audio, mute survives resume');
      }
      await capturedAction('reach-higher-level', 900, 'upstairs-transition-' + width);
      await shot('upstairs-' + width);
      assert.notEqual(authoredPose('family').asset, initialActor, 'upstairs is not the running pose');
      const phone = authoredPose('phone'), water = authoredPose('bottled-water');
      assert(phone.x + phone.w <= water.x || water.x + water.w <= phone.x || phone.y + phone.h <= water.y || water.y + water.h <= phone.y, 'phone and water pose rectangles do not intersect');
      check('upstairs has a distinct actor pose and separate phone/water bounds ' + width, { phone, water });
      if (width === 390) {
        await capturedAction('signal-from-inside', 700, 'signaling-action-' + width); assertUsedClothHidden();
        await shot('signaling-idle-a-' + width); const first = authoredPose('family');
        await tick(460); await syncRun(); const second = authoredPose('family'); await shot('signaling-idle-b-' + width);
        assert.notDeepEqual(first, second, 'the authored actor changes with the real game clock');
        check('signaling has clock-driven actor performance; consumed standalone cloth stays hidden', { first, second });
        await capturedAction('contact-rescue', 900, 'calling-after-signal-' + width);
        assertUsedClothHidden(); await shot('after-call-restored-signal-' + width);
        await action('place-water'); assertUsedClothHidden();
        await action('monitor-updates'); assertUsedClothHidden();
        check('reordered phone/water/radio actions do not resurrect the consumed cloth');
      } else {
        await capturedAction('contact-rescue', 900, 'calling-' + width);
        await action('place-water'); await action('monitor-updates');
        await capturedAction('signal-from-inside', 700, 'signaling-action-' + width);
        assertUsedClothHidden(); await shot('signaling-idle-' + width);
      }
      await capturedAction('wait-at-height', 700, 'waiting-action-' + width);
      assertUsedClothHidden(); await shot('waiting-' + width);
      assert.notEqual(authoredPose('family').asset, initialActor, 'waiting differs from the running actor');
      assert.equal(run.resolved.length, 6); await tick(6200);
      await page.locator('.garden-settlement').waitFor();
      assert.equal((await scores())[id], 3); await shot('complete-' + width);
      check('all six real actions complete with three flowers ' + width);
      if (width === 390) {
        const saved = await scores();
        await page.getByRole('button', { name: /返回地图/ }).click(); await tick(3000); await openLevel();
        for (const step of ['reach-higher-level', 'contact-rescue', 'place-water', 'monitor-updates', 'signal-from-inside', 'wait-at-height']) await action(step);
        await tick(6200); await page.locator('.garden-settlement').waitFor();
        assert.deepEqual(await scores(), saved);
        assert.equal(await page.locator('.garden-reward-label').innerText(), '本关花朵已种下');
        check('real replay preserves prerequisite scores and does not duplicate flowers');
      }
    } finally { await context.close(); }
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.network, []); report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack; await shot('FAIL').catch(() => {}); console.error(error); process.exitCode = 1;
} finally {
  await browser.close(); report.browserClosed = true;
  fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2));
}
