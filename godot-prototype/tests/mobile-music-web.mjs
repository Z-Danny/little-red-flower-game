/** Validate actual decoding and play/pause in the exported iPhone browser path. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';

const [input, engine = 'webkit', checkEffects] = process.argv.slice(2);
assert(input && ['webkit', 'chromium'].includes(engine), 'Pass a flat Web export or HTTPS preview URL and a browser engine');
const { webkit, chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.png': 'image/png' };
const external = input.startsWith('https://') || input.startsWith('http://127.0.0.1:');
const server = external ? null : createServer((request, response) => {
  const file = request.url === '/' ? 'index.html' : request.url.slice(1);
  if (!/^index(\.[a-z]+)+$/.test(file)) { response.writeHead(404).end(); return; }
  const path = join(resolve(input), file);
  try {
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Content-Length': statSync(path).size });
    createReadStream(path).on('error', error => response.destroy(error)).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});

let browser;
try {
  if (server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); }
  const url = server ? 'http://127.0.0.1:' + server.address().port : new URL(input).origin;
  browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--mute-audio', '--no-proxy-server', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  });
  await context.route('**/*', route => {
    const target = new URL(route.request().url());
    return target.origin === url || ['data:', 'blob:'].includes(target.protocol) ? route.continue() : route.abort();
  });
  await context.addInitScript(({checkEffects, engine}) => {
    window.playedJourneyEffects = [];
    window.journeyEffectErrors = [];
    window.finishedJourneyEffects = {};
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (engine === 'webkit') this.muted = true;
      const started = play.apply(this, args);
      if (!checkEffects || !this.dataset.journeyCue) return started;
      let logged = false;
      const cue = this.dataset.journeyCue;
      const record = () => {
        if (!logged) window.playedJourneyEffects.push(cue);
        logged = true;
      };
      this.addEventListener('ended', () => {
        window.finishedJourneyEffects[cue] = {time: this.currentTime, duration: this.duration};
        if (this.currentTime > 0 && this.currentTime >= this.duration) record();
      }, {once: true});
      return started.then(record).catch(error => {
        window.journeyEffectErrors.push([cue, error.name, error.message]);
        throw error;
      });
    };
  }, {checkEffects: Boolean(checkEffects), engine});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    const text = message.text();
    if (!text.startsWith('WebGL:') && (message.type() === 'error' || /SCRIPT ERROR|^ERROR:/.test(text))) errors.push(text);
  });
  const response = await page.goto(url + '/', {waitUntil: 'domcontentloaded'});
  assert.equal(response.status(), 200);
  await page.locator('#status').waitFor({state:'detached', timeout: 45000});
  const media = page.locator('audio[data-journey-music]');
  assert.equal(await media.count(), 1);
  assert(await media.evaluate(audio => audio.paused && audio.currentTime === 0), 'No autoplay before a player gesture');

  async function tap(x, y) {
    const box = await page.locator('#canvas').boundingBox();
    const scale = Math.min(box.width / 576, box.height / 1024);
    await page.touchscreen.tap(box.x + (box.width - 576 * scale) / 2 + x * scale, box.y + (box.height - 1024 * scale) / 2 + y * scale);
    await page.waitForTimeout(280);
  }
  const advancedPast = async seconds => {
    try {
      await page.waitForFunction(time => {
        const audio = document.querySelector('audio[data-journey-music]');
        return audio && !audio.paused && audio.currentTime > time;
      }, seconds, {timeout: 8000});
    } catch (error) {
      const state = await media.evaluate(audio => ({
        ready: audio.readyState, network: audio.networkState, sourceBytes: audio.src.length,
        time: audio.currentTime, paused: audio.paused, error: audio.error?.message,
      }));
      throw new Error(JSON.stringify({state, errors}), {cause: error});
    }
  };

  await tap(475, 879);
  await advancedPast(0.35);
  if (checkEffects) {
    try {
      await page.waitForFunction(() => window.playedJourneyEffects.includes('button') || window.journeyEffectErrors.length > 0, null, {timeout: 4000});
    } catch (error) {
      const state = await page.evaluate(() => [...document.querySelectorAll('audio')].map(audio => ({
        cue: audio.dataset.journeyCue, duration: audio.duration, time: audio.currentTime, ready: audio.readyState,
        network: audio.networkState, paused: audio.paused, wav: audio.canPlayType('audio/wav'), error: audio.error?.code,
      })));
      const finished = await page.evaluate(() => window.finishedJourneyEffects);
      throw new Error(JSON.stringify({state, finished, errors}), {cause: error});
    }
    const first = await page.evaluate(() => ({played: window.playedJourneyEffects, errors: window.journeyEffectErrors}));
    assert.deepEqual(first, {played: ['button'], errors: []});
  }
  const decoded = await media.evaluate(async audio => {
    const result = {duration: audio.duration, peak: null, looping: audio.loop, session: navigator.audioSession?.type || null};
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return result;
    const context = new Context();
    try {
      const data = await (await fetch(audio.src)).arrayBuffer();
      const buffer = await context.decodeAudioData(data);
      let peak = 0;
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i += 31) peak = Math.max(peak, Math.abs(samples[i]));
      return {...result, duration: buffer.duration, peak};
    } finally { await context.close(); }
  });
  assert(decoded.duration > 15 && (decoded.peak === null || decoded.peak > 0.05) && decoded.looping);
  if (decoded.session !== null) assert.equal(decoded.session, 'playback');

  await tap(520, 71);
  await tap(60, 54);
  await tap(397, 467);
  assert(await media.evaluate(audio => audio.paused), 'The home settings silence music');
  const pausedAt = await media.evaluate(audio => audio.currentTime);
  await tap(397, 467);
  await advancedPast(pausedAt + 0.35);
  await tap(288, 124);
  if (input.startsWith('https://') || checkEffects === 'full') {
    await tap(475, 879);
    const island = input.startsWith('https://') ? page.waitForResponse(r => r.ok() && r.url().includes('/packs/map-campus-')) : null;
    await tap(348, 530);
    if (island) await (await island).finished();
    await page.waitForTimeout(550);
    await tap(450, 971);
    const level = input.startsWith('https://') ? page.waitForResponse(r => r.ok() && r.url().includes('/packs/campus-canteen-check-v1-')) : null;
    await tap(370, 650);
    if (level) await (await level).finished();
    // Download completion precedes pack validation, mounting and scene entry.
    await page.waitForFunction(() => document.querySelector('audio[data-journey-music]')?.paused,
      null, {timeout: 8000});
    const levelMusicTime = await media.evaluate(audio => audio.currentTime);
    if (checkEffects) {
      const start = await page.evaluate(() => window.playedJourneyEffects.length);
      for (const [x, y] of [[289, 688], [76, 570], [496, 358], [288, 636], [288, 432], [288, 534], [288, 606.5]]) {
        await tap(x, y);
      }
      await page.waitForFunction(() => window.playedJourneyEffects.includes('victory'));
      assert(await media.evaluate(audio => audio.paused), 'Navigation music stays paused on settlement');
      assert(Math.abs(await media.evaluate(audio => audio.currentTime) - levelMusicTime) < 0.05,
        'Gameplay touches do not resume the navigation track');
      await tap(275, 920);
      await advancedPast(levelMusicTime + 0.35);
      await page.waitForFunction(() => window.finishedJourneyEffects['plant-unlock']?.time > 1.21);
      const cues = await page.evaluate(from => window.playedJourneyEffects.slice(from), start);
      assert.deepEqual(cues.slice(0, 6), ['pickup', 'pickup', 'confirm', 'correct', 'correct', 'correct']);
      assert.deepEqual(cues.slice(6).sort(), ['button', 'button', 'plant-unlock', 'victory']);
      console.log(JSON.stringify({cues, plantingPlayedThroughUnlock: true}));
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({status:'passed', engine, url, decoded, pauseAndResume:true, realDevice:'not_run'}));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); }
  finally { if (server) await new Promise(resolve => server.close(resolve)); }
}
