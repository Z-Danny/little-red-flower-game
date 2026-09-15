import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { dependency, root } from './lib/dependencies.mjs';
const output = path.join(root, 'outputs/audio-loudness-work'); fs.mkdirSync(output, { recursive: true });
const require = createRequire(import.meta.url);
const playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browserPath = [playwright.chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(fs.existsSync);
const bundle = path.join(output, 'sfx-probe.js');
await dependency('esbuild').build({ absWorkingDir: root, stdin: { resolveDir: root, contents: `import {measureSfx,connectSfxPeakLimit} from './app/game/audio/sfx-levels'; import {synthesiseCue,practiceSfxSamples,practiceSfxCalibrationGain} from './app/game/runtime/practice-audio'; import {responseSfxSamples} from './app/game/response/audio'; globalThis.sfxProbe={measureSfx,connectSfxPeakLimit,synthesiseCue,practiceSfxSamples,practiceSfxCalibrationGain,responseSfxSamples};` }, bundle: true, platform: 'browser', format: 'iife', outfile: bundle, logLevel: 'silent' });
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'content/response/audio-manifest.json')));
const waves = Object.entries(manifest.assets).filter(([,asset]) => asset.bus === 'sfx').map(([id, asset]) => ({ id, base64: fs.readFileSync(path.join(root, 'public' + asset.src)).toString('base64') }));
const ids = new Set(['pickup', 'object-pickup', 'soft-tap', 'wood-tap', 'cloth-move', 'warning', 'danger-demonstration', 'goal-confirm', 'invalid-return', 'success', 'training-complete', 'telephone-connect', 'fire-alarm', 'flood-surge']);
for (const dir of fs.readdirSync(path.join(root, 'content/levels'))) {
  const folder = path.join(root, 'content/levels', dir, 'skins'); if (!fs.existsSync(folder)) continue;
  for (const file of fs.readdirSync(folder).filter(file => file.endsWith('.json'))) {
    const cues = JSON.parse(fs.readFileSync(path.join(folder, file))).presentation?.audio?.cues;
    for (const id of Object.values(cues ?? {})) ids.add(id);
  }
}
for (const profile of Object.values(JSON.parse(fs.readFileSync(path.join(root, 'content/legacy-response-audio.json'))))) {
  for (const id of Object.values(profile.cues)) ids.add(id);
}
let browser, context;
const report = { method: 'Native OfflineAudioContext; 10 ms blocks gated at -20 dB from peak block; full compressor and final sample peak guard; music/environment excluded for repeatability. Sample RMS, not LUFS or listening approval.', checks: [], practice: [], response: [], humanListening: 'not_run', physicalDevice: 'not_run', browserClosed: false };
try {
  browser = await playwright.chromium.launch({ executablePath: browserPath, headless: true, args: ['--mute-audio'] });
  context = await browser.newContext(); const page = await context.newPage(); await page.goto('about:blank'); await page.addScriptTag({ path: bundle });
  const results = await page.evaluate(async ({ ids, waves }) => {
    const probe = globalThis.sfxProbe, sr = 22050;
    async function render(samples, gain, engine, limited, copies = 1) {
      const c = new OfflineAudioContext(1, Math.ceil(samples.length + sr * .4), sr), g = c.createGain(), comp = c.createDynamicsCompressor();
      g.gain.value = gain; comp.threshold.value = engine === 'practice' ? -15 : -12; comp.knee.value = engine === 'practice' ? 8 : 10;
      comp.ratio.value = 8; comp.attack.value = engine === 'practice' ? .004 : .003; comp.release.value = engine === 'practice' ? .16 : .2;
      g.connect(comp); if (limited) probe.connectSfxPeakLimit(c, comp, c.destination); else comp.connect(c.destination);
      for (let n = 0; n < copies; n++) { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, samples.length, sr); s.buffer.getChannelData(0).set(samples); s.connect(g); s.start(.1); }
      const buffer = await c.startRendering(); return probe.measureSfx(buffer.getChannelData(0), sr);
    }
    const practice = [], response = [];
    for (const id of ids) {
      const raw = probe.synthesiseCue(id, sr), normalised = probe.practiceSfxSamples(id, sr);
      const before = await render(raw, .35 * .22, 'practice', false), after = await render(normalised, probe.practiceSfxCalibrationGain, 'practice', true);
      practice.push({ id, before, after, changeDb: 20 * Math.log10(after.activeRms / before.activeRms) });
    }
    const decode = new OfflineAudioContext(1, sr, sr);
    for (const { id, base64 } of waves) {
      const buffer = await decode.decodeAudioData(Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer), raw = buffer.getChannelData(0);
      const afterPcm = probe.responseSfxSamples(id, raw, sr), before = await render(raw, .7 * .8, 'response', false), after = await render(afterPcm, 1, 'response', true);
      response.push({ id, before, after, changeDb: 20 * Math.log10(after.activeRms / before.activeRms) });
    }
    const normal = probe.practiceSfxSamples('training-complete', sr), half = await render(normal, probe.practiceSfxCalibrationGain * .5, 'practice', true), zero = await render(normal, 0, 'practice', true);
    const overlap = await render(normal, probe.practiceSfxCalibrationGain / .22, 'practice', true, 5);
    return { practice, response, half, zero, overlap };
  }, { ids: [...ids], waves });
  Object.assign(report, results);
  if (results.zero.peak !== 0 || results.overlap.peak > .700001) throw new Error('Mute or final peak guard failed');
  if (results.practice.some(row => row.after.activeRms < .08 || row.after.activeRms > .14 || row.after.peak > .700001)) throw new Error('Practice SFX calibration is outside the measured output band');
  if (results.response.some(row => row.after.activeRms < .10 || row.after.activeRms > .16 || row.after.peak > .700001)) throw new Error('Kitchen SFX calibration is outside the measured output band');
  report.checks.push('SFX=0 renders exact silence', 'five overlapping voices at maximum slider stay <=0.7 sample peak');
  report.checks.push('all practice and legacy cues render within 0.08–0.14 active RMS', 'kitchen SFX render within 0.10–0.16 active RMS');
  console.log(JSON.stringify({ practice: results.practice.filter(row => ['pickup','soft-tap','cloth-move','warning','success','telephone-connect'].includes(row.id)).map(row => ({id:row.id,before:row.before.activeRms,after:row.after.activeRms,peak:row.after.peak,changeDb:row.changeDb})), response: results.response.map(row => ({id:row.id,before:row.before.activeRms,after:row.after.activeRms,peak:row.after.peak,changeDb:row.changeDb})), overlap: results.overlap }, null, 2));
} finally {
  await context?.close(); await browser?.close(); report.browserClosed = true;
  fs.writeFileSync(path.join(output, 'sfx-levels.json'), JSON.stringify(report, null, 2));
}
