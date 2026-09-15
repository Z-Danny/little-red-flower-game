/** Focused QA of the exported HTML; no build/export and no real user storage.
 * Uses real AudioContext time (no virtual clock) for playback/tail assertions.
 * Extra family timeout cases use an explicitly recorded mounted-state fixture.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const html = path.resolve(root, process.env.OFFLINE_FILE || 'outputs/本地离线版/小红花应急行动.html');
const output = path.resolve(root, process.env.APPROVED_RESULTS_OUTPUT || 'outputs/approved-results-verification');
const approved = JSON.parse(fs.readFileSync(path.join(root, 'content/audio/approved-results.json'), 'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(root, 'content/journey-map.json'), 'utf8'));
const ids = map.regions.flatMap(region => region.nodes.map(node => node.id));
const host = '.hunt-player,.disaster-player,.configured-player,.kitchen-player';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {
  status: 'running', startedAt: new Date().toISOString(), html, htmlSha256: hash(fs.readFileSync(html)),
  checks: [], cases: [], errors: [], network: [], failedRequests: [],
  contextsCreated: 0, contextsClosed: 0, browserClosed: false,
  humanListening: 'not_run', physicalDevice: 'not_run',
  fixture: 'Disposable profile unlocks other levels. Kitchen victory and fire-shelter unsafe failure use real keyboard Enter actions. Hunt, collection, and rain timeout cases dispatch controlled mounted reducer tick events or set the mounted elapsed boundary; no reward/success callback is injected. Audio time always remains real.',
  scope: 'Approved AudioBuffer PCM identity, single starts, natural tails, three settlement buttons, and absence of the replaced triangle click; this is not a human mix or loudspeaker test.',
};
fs.mkdirSync(output, { recursive: true });
const pass = (name, detail = {}) => { report.checks.push({ name, ...detail }); console.log('PASS', name); };
let playwright;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { playwright = require(candidate); break; } catch { /* next installed runtime */ }
}
assert(playwright, 'Playwright required');
const executablePath = [process.env.BROWSER_EXECUTABLE, playwright.chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(file => file && fs.existsSync(file));
assert(executablePath, 'Chromium required');
let browser;

async function withPage(id, task) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', offline: true });
  report.contextsCreated++;
  let page;
  try {
    await context.addInitScript(({ id, ids, approved }) => {
      const player = `approved-audio-qa-${id}`;
      localStorage.setItem('little-red-flower-leaderboard-v1', JSON.stringify({ version: 1, activePlayerId: player, players: [{ id: player, name: '批准音效验收', region: '', createdAt: 1, completed: Object.fromEntries(ids.filter(other => other !== id).map(other => [other, 3])) }] }));
      localStorage.setItem('red-flower:interface-muted', 'false');
      localStorage.setItem('red-flower:journey-music-muted', 'false');
      const registry = new Map();
      Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool(tool, options) {
        registry.set(tool.name, tool);
        options?.signal?.addEventListener('abort', () => { if (registry.get(tool.name) === tool) registry.delete(tool.name); });
      } } });
      window.__approvedQaTools = registry;
      window.__approvedQa = { contexts: [], sources: [], oscillators: [] };
      const qa = window.__approvedQa;
      const expected = new Map(), buffers = new WeakMap();
      function fingerprint(samples) {
        const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
        let fnv = 2166136261, sum = 0, energy = 0, peak = 0;
        for (let i = 0; i < bytes.length; i++) fnv = Math.imul(fnv ^ bytes[i], 16777619) >>> 0;
        for (const value of samples) { sum += value; energy += value * value; peak = Math.max(peak, Math.abs(value)); }
        return { fnv, frames: samples.length, sum, energy, peak };
      }
      function expectedAt(kind, rate) {
        const key = `${kind}:${rate}`;
        if (expected.has(key)) return expected.get(key);
        const meta = approved.sounds[kind], binary = atob(meta.pcmBase64);
        const native = new Float32Array(meta.frames);
        for (let i = 0; i < native.length; i++) {
          const unsigned = binary.charCodeAt(i * 2) | binary.charCodeAt(i * 2 + 1) << 8;
          native[i] = (unsigned >= 32768 ? unsigned - 65536 : unsigned) / 32768;
        }
        let samples = native;
        if (rate !== meta.sampleRate) {
          samples = new Float32Array(Math.round(native.length * rate / meta.sampleRate));
          for (let i = 0; i < samples.length; i++) {
            const position = i * meta.sampleRate / rate, left = Math.min(Math.floor(position), native.length - 1), right = Math.min(left + 1, native.length - 1);
            samples[i] = native[left] + (native[right] - native[left]) * (position - left);
          }
        }
        const result = fingerprint(samples); expected.set(key, result); return result;
      }
      function identify(buffer) {
        if (!buffer) return { kind: null };
        if (buffers.has(buffer)) return buffers.get(buffer);
        const candidates = Object.keys(approved.sounds).filter(kind => Math.abs(buffer.duration - approved.sounds[kind].durationSeconds) <= 2 / buffer.sampleRate);
        let result = { kind: null, candidates, duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels };
        if (candidates.length && buffer.numberOfChannels === 1) {
          const actual = fingerprint(buffer.getChannelData(0));
          result = { ...result, ...actual, kind: candidates.find(kind => {
            const target = expectedAt(kind, buffer.sampleRate);
            return actual.frames === target.frames && actual.fnv === target.fnv && Math.abs(actual.sum - target.sum) < 1e-9 && Math.abs(actual.energy - target.energy) < 1e-9;
          }) || null };
        }
        buffers.set(buffer, result); return result;
      }
      const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        constructor(...args) {
          super(...args);
          this.__qaIndex = qa.contexts.length;
          qa.contexts.push({ index: this.__qaIndex, sampleRate: this.sampleRate, closedAt: null });
        }
        createBufferSource() {
          const source = super.createBufferSource(), start = source.start.bind(source), stop = source.stop.bind(source);
          let record;
          source.start = (...args) => {
            const when = Math.max(this.currentTime, args[0] || 0), offset = args[1] || 0;
            record = { index: qa.sources.length, context: this.__qaIndex, ...identify(source.buffer), startAudioTime: when, loop: source.loop, playbackRate: source.playbackRate.value, offset, explicitDuration: args[2] ?? null, stops: [], endedAudioTime: null };
            qa.sources.push(record); return start(...args);
          };
          source.stop = (...args) => { record?.stops.push({ calledAt: this.currentTime, at: Math.max(this.currentTime, args[0] || 0) }); return stop(...args); };
          source.addEventListener('ended', () => { if (record) record.endedAudioTime = this.currentTime; });
          return source;
        }
        createOscillator() {
          const oscillator = super.createOscillator(), start = oscillator.start.bind(oscillator), frequencies = [];
          for (const name of ['setValueAtTime', 'exponentialRampToValueAtTime', 'linearRampToValueAtTime']) {
            const original = oscillator.frequency[name].bind(oscillator.frequency);
            oscillator.frequency[name] = (...args) => { frequencies.push({ name, value: args[0], time: args[1] }); return original(...args); };
          }
          oscillator.start = (...args) => { qa.oscillators.push({ context: this.__qaIndex, startAudioTime: Math.max(this.currentTime, args[0] || 0), type: oscillator.type, frequencies }); return start(...args); };
          return oscillator;
        }
        close() { qa.contexts[this.__qaIndex].closedAt = this.currentTime; return super.close(); }
      };
    }, { id, ids, approved });
    page = await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.errors.push({ id, message: error.message }));
    page.on('request', request => { if (/^https?:/.test(request.url())) report.network.push({ id, url: request.url() }); });
    page.on('requestfailed', request => report.failedRequests.push({ id, url: request.url().slice(0, 160), error: request.failure()?.errorText }));
    await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.__approvedQaTools?.has('start_emergency_level'));
    await task(page);
    report.cases.push({ id, audio: await page.evaluate(() => ({ contexts: window.__approvedQa.contexts, approvedStarts: window.__approvedQa.sources.filter(source => source.kind), unmatchedCandidateStarts: window.__approvedQa.sources.filter(source => !source.kind && source.candidates?.length) })) });
  } catch (error) {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(output, `${id}-failure.png`) }).catch(() => {});
      fs.writeFileSync(path.join(output, `${id}-failure.json`), JSON.stringify(await page.evaluate(() => ({ audio: window.__approvedQa, text: document.body.innerText })).catch(() => ({})), null, 2));
    }
    throw error;
  } finally { await context.close(); report.contextsClosed++; }
}

async function open(page, id) {
  await page.evaluate(id => window.__approvedQaTools.get('start_emergency_level').execute({ levelId: id }), id);
  const intro = page.locator(`[data-painted-intro][data-level-id="${id}"]`);
  await page.waitForFunction(({ id, host }) => document.querySelector(`[data-painted-intro][data-level-id="${id}"]`) || document.querySelector(host)?.dataset.ready === 'true', { id, host });
  if (await intro.count()) {
    await intro.locator('.painted-intro-start:not(:disabled)').click();
    await intro.waitFor({ state: 'detached' });
  }
  await page.waitForFunction(({ id, host }) => { const node = document.querySelector(host); return node?.dataset.level === id && node.dataset.ready === 'true' && node.dataset.phase === 'playing'; }, { id, host });
  await page.waitForTimeout(300);
}
const mark = page => page.evaluate(() => ({ sources: window.__approvedQa.sources.length, oscillators: window.__approvedQa.oscillators.length }));
async function approvedOnce(page, kind, before, label) {
  await page.waitForFunction(({ kind, before }) => window.__approvedQa.sources.slice(before.sources).some(source => source.kind === kind && source.endedAudioTime !== null), { kind, before });
  await page.waitForTimeout(100);
  const evidence = await page.evaluate(({ before, kind }) => ({
    sources: window.__approvedQa.sources.slice(before.sources).filter(source => source.kind === kind),
    contexts: window.__approvedQa.contexts,
    oscillators: window.__approvedQa.oscillators.slice(before.oscillators),
  }), { before, kind });
  assert.equal(evidence.sources.length, 1, `${label}: exact approved ${kind} sample must start once`);
  const source = evidence.sources[0], end = source.startAudioTime + source.duration;
  assert.equal(source.loop, false, label); assert.equal(source.playbackRate, 1, label); assert.equal(source.offset, 0, label);
  assert(source.explicitDuration === null || source.explicitDuration >= source.duration, label);
  assert(source.endedAudioTime >= end - .008, `${label}: natural tail truncated`);
  assert(source.stops.every(stop => stop.at >= end - .008), `${label}: explicitly stopped before sample ends`);
  const closedAt = evidence.contexts[source.context].closedAt;
  assert(closedAt === null || closedAt >= end - .008, `${label}: context closed before tail`);
  if (kind === 'button') {
    const replaced = evidence.oscillators.filter(oscillator => oscillator.context === source.context && oscillator.type === 'triangle' && oscillator.frequencies.some(event => event.value === 460) && oscillator.frequencies.some(event => event.value === 340));
    assert.equal(replaced.length, 0, `${label}: replaced triangle button sound also played`);
  }
  pass(label, { kind, duration: source.duration, fingerprint: source.fnv, sampleRate: source.sampleRate, startAudioTime: source.startAudioTime, endedAudioTime: source.endedAudioTime, closedAt });
}
async function press(page, scope, name) {
  const button = page.locator(scope).getByRole('button', { name, exact: true });
  await button.waitFor({ state: 'attached' });
  await page.waitForFunction(element => !element.disabled && !element.closest('[inert]'), await button.elementHandle());
  await button.focus(); await button.press('Enter');
}
async function shelterFailure(page) {
  await press(page, '.configured-keyboard', '通向浓烟的房门');
  await page.waitForFunction(() => { const node = document.querySelector('.configured-player'); return node?.dataset.resolved.split(',').includes('door-closed') && !node.dataset.action; });
  await press(page, '.configured-keyboard', '通向浓烟的房门');
  await page.locator('.painted-failure').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.configured-player').getAttribute('data-failure'), 'reopen-door-error');
}
async function controlledTimeout(page) {
  const seconds = Number(await page.getByRole('progressbar').getAttribute('aria-valuemax'));
  assert(seconds > 0 && seconds < 300);
  const fixture = await page.locator(host).evaluate((element, seconds) => {
    const key = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
    for (let fiber = element[key]; fiber; fiber = fiber.return) for (let hook = fiber.memoizedState; hook; hook = hook.next) {
      const run = hook.memoizedState;
      if (!hook.queue?.dispatch || !run || typeof run !== 'object' || run.phase !== 'playing') continue;
      if (Array.isArray(run.found) || Array.isArray(run.goals)) {
        for (let i = 0; i < seconds * 10 + 2; i++) hook.queue.dispatch({ type: 'tick', ms: 100 });
        return 'controlled mounted reducer tick fixture';
      }
      if (Array.isArray(run.resolved)) {
        hook.queue.dispatch(previous => ({ ...previous, elapsed: seconds * 1000 }));
        return 'controlled elapsed-boundary fixture; real next RAF evaluates failure';
      }
    }
    throw new Error('Active engine clock hook not found');
  }, seconds);
  await page.locator('.painted-failure').waitFor({ state: 'visible' });
  return fixture;
}

try {
  browser = await playwright.chromium.launch({ headless: true, executablePath, args: ['--mute-audio'] });
  report.browser = browser.version();
  await withPage('oil-fire', async page => {
    await open(page, 'oil-fire');
    const before = await mark(page);
    await press(page, '.kitchen-keyboard-targets', '关闭燃气');
    await page.waitForFunction(() => !document.querySelector('.kitchen-player')?.dataset.action);
    await press(page, '.kitchen-keyboard-targets', '锅盖');
    await press(page, '.kitchen-keyboard-targets', '作用于油锅');
    await page.waitForFunction(() => !document.querySelector('.kitchen-player')?.dataset.action);
    await press(page, '.kitchen-keyboard-targets', '人物');
    await press(page, '.kitchen-keyboard-targets', '移动到门外');
    await page.locator('.painted-settlement').waitFor({ state: 'visible' });
    await approvedOnce(page, 'victory', before, 'kitchen real safe sequence: approved victory once, full tail');
    const button = await mark(page);
    await page.getByRole('button', { name: '种下小红花', exact: true }).click();
    await page.locator('.garden-shell').waitFor({ state: 'visible' });
    await approvedOnce(page, 'button', button, 'victory plant button: approved low click once, survives navigation');
  });
  await withPage('fire-shelter-practice', async page => {
    await open(page, 'fire-shelter-practice');
    let before = await mark(page); await shelterFailure(page);
    await approvedOnce(page, 'failure', before, 'practice real unsafe reopening: approved failure once, full tail');
    before = await mark(page);
    await page.locator('[data-testid="failure-retry"]').click();
    await page.waitForFunction(() => document.querySelector('.configured-player')?.dataset.phase === 'playing');
    await approvedOnce(page, 'button', before, 'failure retry button: approved low click once');
    before = await mark(page); await shelterFailure(page);
    await approvedOnce(page, 'failure', before, 'practice replay can play a fresh failure exactly once');
    before = await mark(page);
    await page.locator('[data-testid="failure-back"]').click();
    await page.locator('.garden-shell').waitFor({ state: 'visible' });
    await approvedOnce(page, 'button', before, 'failure back button: approved low click once, survives page teardown');
  });
  for (const id of ['quake-bedroom-v2', 'flood-kit', 'rain-street-preparation-v1']) await withPage(id, async page => {
    await open(page, id);
    let before = await mark(page);
    const fixture = await controlledTimeout(page);
    await approvedOnce(page, 'failure', before, `${id}: controlled timeout plays approved failure once, full tail`);
    pass(`${id}: explicit timeout fixture`, { fixture });
    before = await mark(page);
    await page.locator('[data-testid="failure-back"]').click();
    await page.locator('.garden-shell').waitFor({ state: 'visible' });
    await approvedOnce(page, 'button', before, `${id}: failure back uses approved click once with full tail`);
  });
  assert.equal(report.errors.length, 0); assert.equal(report.network.length, 0); assert.equal(report.failedRequests.length, 0);
  assert.equal(hash(fs.readFileSync(html)), report.htmlSha256, 'Export must remain unchanged during verification');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || String(error); console.error(report.failure); process.exitCode = 1;
} finally {
  if (browser) { await browser.close(); report.browserClosed = true; }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
