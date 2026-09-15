import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dependency, root } from './lib/dependencies.mjs';

const output = path.resolve(root, process.env.UI_HUNT_MEASURE_OUTPUT || 'outputs/audio-loudness-work/ui-hunt-measurements');
const baseline = path.resolve(root, process.env.SFX_BASELINE_DIR || 'outputs/audio-loudness-work/before');
fs.mkdirSync(output, { recursive: true });
const files = {
  ui: 'components/game/journey/reward-sound.ts',
  hunt: 'app/game/scene-hunt/sound.ts',
};
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hashes = Object.fromEntries(Object.entries(files).map(([engine, file]) => [engine, {
  before: hash(path.join(baseline, file)), after: hash(path.join(root, file)),
}]));
const require = createRequire(import.meta.url);
let playwright;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'), 'playwright-core'].filter(Boolean)) {
  try { playwright = require(candidate); break; } catch { /* Try the next installed runtime. */ }
}
assert(playwright, 'Playwright is required');
const executablePath = [process.env.BROWSER_EXECUTABLE, playwright.chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(file => file && fs.existsSync(file));
assert(executablePath, 'An isolated Chromium browser is required');
const bundle = path.join(output, 'probe.js');
await dependency('esbuild').build({
  absWorkingDir: root,
  stdin: {
    resolveDir: root,
    contents: `
      import { RewardSound as BeforeUI } from 'baseline-ui';
      import { HuntSound as BeforeHunt } from 'baseline-hunt';
      import { RewardSound as AfterUI } from './components/game/journey/reward-sound';
      import { HuntSound as AfterHunt } from './app/game/scene-hunt/sound';
      import { measureSfx, connectSfxPeakLimit } from './app/game/audio/sfx-levels';
      import { performanceSounds } from './app/game/scene-hunt/performance';
      import { synthesiseHuntFeedback } from './app/game/scene-hunt/feedback-score';
      globalThis.audioMeasure = { BeforeUI, AfterUI, BeforeHunt, AfterHunt, measureSfx, connectSfxPeakLimit, performanceSounds, synthesiseHuntFeedback };
    `,
  },
  plugins: [{
    name: 'baseline-source-current-import-resolution',
    setup(build) {
      build.onResolve({ filter: /^baseline-(ui|hunt)$/ }, args => ({ path: args.path.slice('baseline-'.length), namespace: 'baseline' }));
      build.onLoad({ filter: /.*/, namespace: 'baseline' }, args => ({
        contents: fs.readFileSync(path.join(baseline, files[args.path]), 'utf8'), loader: 'ts',
        resolveDir: path.dirname(path.join(root, files[args.path])),
      }));
    },
  }],
  bundle: true, platform: 'browser', format: 'iife', outfile: bundle, logLevel: 'silent',
});

let browser, context;
const report = {
  measuredAt: new Date().toISOString(), sourceHashes: hashes,
  method: 'Native OfflineAudioContext at 22050 Hz. Both UI versions use their real oscillator scheduling and output bus. Both Hunt versions execute real cue/fail methods. Before: original master .58/.45 through the native -18dB/5:1/4ms/250ms compressor, default knee 30. After: normalised feedback PCM at bus gain 1 joins the compressor output and passes the shared final 0.7 sample peak guard. Music, ambience, character audio and perpetual scheduling are omitted. No approximate oscillator or burst reimplementation.',
  metric: '10ms non-overlapping energy blocks; active blocks gated at -20dB from the highest-energy block. Output sample RMS/peak, not LUFS or sound-pressure level.',
  limitations: ['Single effects measured without background music; perceptual masking is not assessed.', 'Offline graph uses already-running state; user gesture and navigation lifecycle are verified elsewhere.', 'Hunt graph uses settled gains, not a newly opened scene fade.'],
  humanListening: 'not_run', physicalDevice: 'not_run', browserClosed: false,
  checks: [], findings: [], errors: [],
};
try {
  browser = await playwright.chromium.launch({ headless: true, executablePath, args: ['--mute-audio'] });
  context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto('about:blank');
  await page.addScriptTag({ path: bundle });
  const results = await page.evaluate(async () => {
    const p = globalThis.audioMeasure, sampleRate = 22050;
    const uiCues = ['tap', 'open', 'close', 'confirm', 'hint', 'land', 'sprout', 'bloom', 'count', 'unlock'];
    const huntCues = ['tap', 'found', 'wrong', 'resolve', 'success', 'timeout'];
    // The object proxies only lifecycle/state; every audio node and sample is native.
    const asRunning = c => new Proxy(c, {
      get(target, key) {
        if (key === 'state') return 'running';
        if (['resume', 'suspend', 'close'].includes(key)) return () => Promise.resolve();
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const create = () => new OfflineAudioContext(1, sampleRate * 4, sampleRate);
    const triggerUI = (session, cue) => {
      if (['tap', 'open', 'close', 'confirm'].includes(cue)) session.ui(cue);
      else if (cue === 'hint') session.hint();
      else session.plant(cue);
    };
    async function ui(version, cues, options = {}) {
      const c = create(), running = asRunning(c);
      let made = 0;
      const session = new p[version === 'before' ? 'BeforeUI' : 'AfterUI'](() => { made++; return running; }, () => !!options.hidden, () => 0);
      try {
        session.setVolume(options.volume ?? 1);
        session.setMuted(!!options.muted);
        session.unlock();
        for (const cue of cues) triggerUI(session, cue);
        const scheduled = session.status.scheduledCues;
        const result = await c.startRendering();
        return { ...p.measureSfx(result.getChannelData(0), sampleRate), scheduled, contextsCreated: made };
      } finally { session.dispose(); }
    }
    const profiles = [
      { id: 'storm', profile: 'storm', master: .58 },
      { id: 'quiet_electric', profile: 'quiet_electric', master: .45 },
      ...p.performanceSounds.map(sound => ({ id: 'performance:' + sound, profile: 'quiet_electric', master: .45,
        performance: { version: 2, atmosphere: sound === 'thunder_park' ? 'thunder' : 'indoor', sound, retreatDirection: 1, stages: [] },
      })),
    ];
    async function hunt(version, profile, cues, options = {}) {
      const c = create(), running = asRunning(c);
      const session = new p[version === 'before' ? 'BeforeHunt' : 'AfterHunt'](profile.profile, profile.performance, { character: 'none' });
      // TypeScript private fields are intentionally filled by this isolated harness.
      // This bypasses environment construction while retaining the real cue code.
      const master = c.createGain(), fx = c.createGain(), bed = c.createGain(), music = c.createGain(), feedback = c.createGain(), output = c.createGain(), comp = c.createDynamicsCompressor();
      master.gain.value = profile.master; fx.gain.value = 1; feedback.gain.value = 1;
      comp.threshold.value = -18; comp.ratio.value = 5; comp.attack.value = .004; comp.release.value = .25;
      fx.connect(master); bed.connect(master); music.connect(master); master.connect(comp);
      let limiter = null;
      if (version === 'after') { feedback.connect(output); comp.connect(output); limiter = p.connectSfxPeakLimit(c, output, c.destination); }
      else comp.connect(c.destination);
      Object.assign(session, { ctx: running, master, fx, bed, musicBus: music, feedbackBus: feedback, peakLimit: limiter, sceneActive: true });
      try {
        if (options.muted) session.setMuted(true);
        if (options.hidden) session.setHidden(true);
        for (const cue of cues) {
          if (cue === 'timeout') session.fail();
          else if (cue === 'finish-inactive') { session.setScene(false, 0); session.finish(); }
          else session.cue(cue);
        }
        if (options.cancel === 'muted') { session.setMuted(true); session.setMuted(false); }
        if (options.cancel === 'hidden') { session.setHidden(true); session.setHidden(false); }
        if (options.cancel === 'inactive') { session.setScene(false, 0); session.setScene(true, 0); }
        const result = await c.startRendering();
        return p.measureSfx(result.getChannelData(0), sampleRate);
      } finally {
        session.dispose();
        for (const node of [master, fx, bed, music, feedback, output, comp, limiter]) node?.disconnect();
      }
    }
    const change = (before, after) => ({ before, after, changeDb: before.activeRms ? 20 * Math.log10(after.activeRms / before.activeRms) : null });
    const uiRows = [], huntRows = [];
    for (const cue of uiCues) uiRows.push({ cue, ...change(await ui('before', [cue]), await ui('after', [cue])) });
    for (const profile of profiles) for (const cue of huntCues) huntRows.push({ profile: profile.id, cue, sourcePcm: p.measureSfx(p.synthesiseHuntFeedback(profile.profile, profile.performance, cue), sampleRate), ...change(await hunt('before', profile, [cue]), await hunt('after', profile, [cue])) });
    const controls = {
      uiMuted: await ui('after', uiCues, { muted: true }),
      uiZero: await ui('after', uiCues, { volume: 0 }),
      uiHidden: await ui('after', uiCues, { hidden: true }),
      uiHalf: await ui('after', ['hint'], { volume: .5 }),
      huntMuted: await hunt('after', profiles[0], huntCues, { muted: true }),
      huntHidden: await hunt('after', profiles[0], huntCues, { hidden: true }),
      huntMuteClearsSources: await hunt('after', profiles[0], ['success'], { cancel: 'muted' }),
      huntHiddenClearsSources: await hunt('after', profiles[0], ['success'], { cancel: 'hidden' }),
      huntInactiveClearsSources: await hunt('after', profiles[0], ['success'], { cancel: 'inactive' }),
    };
    const overlaps = {
      uiTypical: await ui('after', ['tap', 'hint', 'bloom']),
      uiAllFamilies: await ui('after', uiCues),
      huntThreeSuccess: await hunt('after', profiles[0], ['success', 'success', 'success']),
      huntSixSuccessCapped: await hunt('after', profiles[0], Array(6).fill('success')),
      huntTapFoundSuccess: await hunt('after', profiles[0], ['tap', 'found', 'success']),
    };
    const terminal = await hunt('after', profiles[1], ['finish-inactive']);
    return { sampleRate, ui: uiRows, hunt: huntRows, controls, overlaps, terminal };
  });
  Object.assign(report, results);
  for (const [key, value] of Object.entries(results.controls)) {
    if (key !== 'uiHalf') assert.equal(value.peak, 0, key + ' must be exact silence');
  }
  for (const [key, value] of Object.entries(results.overlaps)) assert(value.peak <= .700001, key + ' exceeds the 0.7 final peak limit');
  assert(results.terminal.activeRms >= .12 && results.terminal.peak <= .700001, 'Explicit finish must remain audible after leaving active play');
  for (const row of [...results.ui, ...results.hunt]) {
    assert(Number.isFinite(row.after.activeRms) && row.after.activeRms > 0, 'Every cue must render finite nonzero PCM');
    assert(row.after.peak <= .700001, 'Single cue peak exceeds limit');
    if (row.after.activeRms < row.before.activeRms) report.findings.push({ type: 'lower-than-before', cue: row.cue, profile: row.profile, changeDb: row.changeDb });
    const target = row.cue === 'success' || row.cue === 'resolve' || row.cue === 'timeout' ? [.12, .14] : row.profile && ['found', 'wrong'].includes(row.cue) ? [.1, .12] : [.08, .1];
    if (row.after.activeRms < target[0] * .98 || row.after.activeRms > target[1] * 1.02) report.findings.push({ type: 'outside-requested-band', cue: row.cue, profile: row.profile, activeRms: row.after.activeRms, target });
  }
  report.checks.push('10 UI and 54 Hunt before/after cue pairs rendered through native audio nodes', 'Muted, volume-zero and hidden probes render exact silence', 'Mute/hidden/inactive clear existing Hunt feedback sources and restoring state does not replay them', 'Explicit finish remains audible while active play is false', 'Typical and stress overlaps remain at or below 0.7 sample peak');
  assert.deepEqual(report.errors, []);
  report.status = report.findings.length ? 'measured-with-findings' : 'passed';
  const compact = row => ({ profile: row.profile, cue: row.cue, before: +row.before.activeRms.toFixed(6), after: +row.after.activeRms.toFixed(6), peak: +row.after.peak.toFixed(6), changeDb: +row.changeDb.toFixed(2) });
  console.log(JSON.stringify({ ui: results.ui.map(compact), hunt: results.hunt.filter(row => ['storm', 'quiet_electric', 'performance:kitchen_check'].includes(row.profile)).map(compact), overlaps: results.overlaps, findings: report.findings }, null, 2));
} catch (error) {
  report.status = 'failed'; report.failure = String(error.stack ?? error); process.exitCode = 1;
  console.error(error);
} finally {
  try { await context?.close(); } finally { await browser?.close(); }
  report.browserClosed = true;
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  if (report.ui && report.hunt) {
    const rows = ['engine,profile,cue,before_active_rms,after_active_rms,before_peak,after_peak,change_db'];
    for (const [engine, values] of [['ui', report.ui], ['hunt', report.hunt]]) for (const row of values) rows.push([engine, row.profile ?? '', row.cue, row.before.activeRms, row.after.activeRms, row.before.peak, row.after.peak, row.changeDb].join(','));
    fs.writeFileSync(path.join(output, 'measurements.csv'), rows.join('\n') + '\n');
  }
}
