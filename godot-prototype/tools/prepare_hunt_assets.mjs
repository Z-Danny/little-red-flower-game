// Node >=22.13. Only the original enabled getHunt packs are inputs; no drafts.
// Rebuild: node godot-prototype/tools/prepare_hunt_assets.mjs
// Verify (does not write): add --check.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { basename, dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEST = resolve(ROOT, 'godot-prototype/assets/hunt_runner');
const RES = 'res://assets/hunt_runner/';
const ORIGINAL_IDS = [
  'typhoon-home', 'charging-bedroom', 'bedroom-night-check-v2',
  'kitchen-before-cooking-v2', 'clear-corridor-check-v2', 'quake-bedroom-v2',
  'storm-street-check-v2', 'thunder-park-v2', 'forest-fire-sources-v2',
];
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== '--check')) throw Error('Usage: prepare_hunt_assets.mjs [--check]');
const check = args[0] === '--check';
const outputs = new Map();
const read = path => readFileSync(resolve(ROOT, path));
const text = path => read(path).toString('utf8');
const json = path => JSON.parse(text(path));
const sha = data => createHash('sha256').update(data).digest('hex');
function output(path, data) {
  if (!/^[a-z0-9_./-]+$/i.test(path) || path.split('/').includes('..')) throw Error(`Unsafe output: ${path}`);
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  if (outputs.has(path) && !outputs.get(path).equals(bytes)) throw Error(`Output collision: ${path}`);
  outputs.set(path, bytes);
}
function resource(path, fields, refs = {}) {
  const rows = Object.entries(refs);
  const out = [`[gd_resource type="Resource" load_steps=${rows.length + 1} format=3]`, ''];
  for (const [i, [, file]] of rows.entries()) {
    out.push(`[ext_resource type="${file.endsWith('.wav') ? 'AudioStream' : 'Texture2D'}" path="${RES}${file}" id="${i + 1}"]`);
  }
  out.push('', '[resource]');
  for (const [key, value] of Object.entries(fields)) out.push(`metadata/${key} = ${JSON.stringify(value, null, 2)}`);
  if (rows.length) {
    out.push('metadata/resources = {');
    out.push(rows.map(([key], i) => `${JSON.stringify(key)}: ExtResource("${i + 1}")`).join(',\n'));
    out.push('}');
  }
  output(path, `${out.join('\n')}\n`);
}

// Read the actual generated array and its JSON imports instead of selecting from a directory.
const registry = text('app/game/scene-hunt/generated.ts');
const imports = Object.fromEntries([...registry.matchAll(/import (\w+) from '@\/(content\/scenes\/[^']+\.json)';/g)].map(([, name, path]) => [name, path]));
const registryArray = registry.match(/export const generatedHuntPacks = \[([\s\S]*?)\];/);
if (!registryArray) throw Error('Missing generatedHuntPacks array');
const groups = [...registryArray[1].matchAll(/\{([^{}]+)\}/g)].map(([, group]) => {
  const parts = group.split(',').map(part => part.trim());
  const entries = parts.map(part => part.match(/^(rules|skin|presentation|performance)\s*:\s*(\w+)$/));
  if (entries.some(entry => !entry || !imports[entry[2]])) throw Error(`Registry binding not understood: ${group}`);
  const chosen = Object.fromEntries(entries.map(([, key, name]) => [key, imports[name]]));
  if (Object.keys(chosen).length !== entries.length || !chosen.rules || !chosen.skin || !chosen.presentation) throw Error(`Incomplete registry pack: ${group}`);
  return chosen;
});
const enabled = json('content/scenes/catalog.json').filter(entry => entry.enabled);
const chosenIds = groups.map(group => json(group.rules).id);
const sorted = ids => [...ids].sort().join(',');
if (sorted(chosenIds) !== sorted(ORIGINAL_IDS) || sorted(enabled.map(entry => entry.id)) !== sorted(ORIGINAL_IDS)) {
  throw Error('Enabled getHunt selections drifted. Review scope before generating Godot assets.');
}

const allowedProfiles = new Set();
for (const paths of groups) {
  const values = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, json(path)]));
  const { rules, skin, presentation, performance } = values;
  const base = `content/scenes/${rules.id}/`;
  if (Object.values(paths).some(path => !path.startsWith(base)) || paths.skin !== base + enabled.find(entry => entry.id === rules.id).skin) {
    throw Error(`Generated skin/section selection differs from the enabled catalog: ${rules.id}`);
  }
  if (rules.timeout !== 'fail' || rules.seconds !== 50 || rules.markMs !== 800 || presentation.clues !== 'on-demand' || presentation.timer !== 'pressure-bar') {
    throw Error(`Unexpected runtime policy: ${rules.id}`);
  }
  if (presentation.characterAudio && presentation.characterAudio !== 'none') throw Error(`Unmigrated character audio configuration: ${rules.id}`);
  allowedProfiles.add(performance ? `perf/${performance.sound}` : `legacy/${presentation.audio}`);
  const refs = {};
  const source = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, { path, sha256: sha(read(path)) }]));
  function image(key, path) {
    if (!/^\/levels\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(png|webp)$/i.test(path)) throw Error(`Unsupported registered image: ${path}`);
    const bytes = read(`public${path}`);
    const target = `${rules.id}/${basename(path)}`;
    output(target, bytes);
    refs[key] = target;
    source[key] = { path: `public${path}`, sha256: sha(bytes) };
  }
  for (const key of ['scene', 'clean', 'safe', 'family', 'mask']) image(key, skin[key]);
  for (const { id } of rules.targets) image(`icon:${id}`, skin.targets[id].icon);
  for (const [key, path] of Object.entries(skin.effects ?? {})) if (key.endsWith('Mask')) image(key, path);
  resource(`${rules.id}/pack.tres`, { ...values, source }, refs);
}

for (const name of ['back', 'hint', 'pause', 'timer-empty', 'timer-full', 'petal', 'modal-panel-v2', 'modal-button-v2']) {
  output(`shared/ui/${name}.webp`, read(`public/ui/painted-v1/${name}.webp`));
}
for (const name of ['mascot']) {
  output(`shared/ui/failure-${name}.webp`, read(`public/ui/painted-failure-v2/${name}.webp`));
}

// Import the real pure TS score, normalisation and note profiles (no npm build or npm install).
// Only these known, side-effect-free source files can enter the data URL module graph.
const pureModules = new Set([
  'app/game/scene-hunt/feedback-score.ts', 'app/game/scene-hunt/audio-profiles.ts',
  'app/game/audio/note-score.ts', 'app/game/audio/sfx-levels.ts',
  'app/game/audio/result-samples.ts', 'app/game/challenge/rules.ts', 'content/audio/approved-results.json',
]);
const moduleUrls = new Map();
function pureModule(path) {
  if (!pureModules.has(path)) throw Error(`Unexpected module in score imports: ${path}`);
  if (moduleUrls.has(path)) return moduleUrls.get(path);
  const code = path.endsWith('.json') ? `export default ${JSON.stringify(json(path))};` : stripTypeScriptTypes(text(path)).replace(/\bfrom\s+(['"])([^'"]+)\1/g, (_match, _quote, specifier) => {
    if (!specifier.startsWith('.')) throw Error(`Nonlocal score dependency: ${specifier}`);
    const relative = posix.join(posix.dirname(path), specifier);
    return `from ${JSON.stringify(pureModule(relative.endsWith('.json') ? relative : `${relative}.ts`))}`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  moduleUrls.set(path, url);
  return url;
}
const challenge = await import(pureModule('app/game/challenge/rules.ts'));
const b = await import(pureModule('app/game/scene-hunt/audio-profiles.ts'));
const { renderScore } = await import(pureModule('app/game/audio/note-score.ts'));
const { synthesiseHuntFeedback } = await import(pureModule('app/game/scene-hunt/feedback-score.ts'));
resource('shared/contract.tres', {
  ids: chosenIds,
  miss_penalty_ms: challenge.HUNT_MISS_PENALTY_SECONDS * 1000,
  miss_caption: challenge.huntMissCaption(),
  safe_hold_ms: json('content/journey-timing.json').safeHold,
  view_policy: json('content/hunt-viewport.json'),
});

const PCM_RATE = 22050;
const audio = {};
function audioPcm(key, pcm, rate) {
  if (pcm.length % 2 || !pcm.length || audio[key]) throw Error(`Invalid or duplicate PCM data: ${key}`);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(pcm.length + 36, 4);
  header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); // mono PCM
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  const path = `shared/audio/${key.replaceAll('/', '-')}.wav`;
  output(path, Buffer.concat([header, pcm]));
  audio[key] = path;
}
function wav(key, samples) {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) throw Error(`Non-finite sample in ${key}`);
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(32767 / 32768, samples[i])) * 32768), i * 2);
  }
  audioPcm(key, pcm, PCM_RATE);
}
const approved = json('content/audio/approved-results.json').sounds;
const approvedPcmSha = {};
for (const key of ['victory', 'failure']) {
  const clip = approved[key];
  const pcm = Buffer.from(clip.pcmBase64, 'base64');
  if (pcm.length !== clip.frames * 2) throw Error(`Invalid approved clip: ${key}`);
  approvedPcmSha[key] = sha(pcm);
  audioPcm(key, pcm, clip.sampleRate);
}
wav('tap', synthesiseHuntFeedback('storm', undefined, 'tap', PCM_RATE));
for (const route of allowedProfiles) {
  const [type, profile] = route.split('/');
  const performance = type === 'perf' ? { sound: profile } : undefined;
  for (const cue of ['found', 'wrong', 'resolve']) {
    const key = type === 'perf' && cue !== 'resolve' ? `perf/${cue}` : `${route}/${cue}`;
    if (!audio[key]) wav(key, synthesiseHuntFeedback(profile, performance, cue, PCM_RATE));
  }
}

// Notes are pre-rendered; Godot schedules the authored voices against the active clock.
function tone(key, frequency, duration, type = 'sine', end) {
  wav(key, renderScore([{ frequency, end, duration, gain: .5, type, attack: .015, exponentialAttack: true }], PCM_RATE));
}
for (const [profile, config] of Object.entries(b.performanceAudio)) {
  if (!allowedProfiles.has(`perf/${profile}`)) continue;
  config.notes.forEach((hz, i) => tone(`perf/${profile}/note${i}`, hz, .18, config.wave));
  tone(`perf/${profile}/hold`, config.notes[0], .8);
  tone(`perf/${profile}/urgent`, config.notes[2] * 2, .14);
}
b.quietElectric.notes.forEach((hz, i) => tone(`legacy/quiet_electric/note${i}`, hz, i === 0 ? .65 : .22));
const stormNotes = [146.83, 220, 174.61, 220, 130.81, 196, 164.81, 196];
stormNotes.forEach((hz, i) => tone(`legacy/storm/note${i}`, hz, .47, 'triangle'));
for (const i of [0, 4]) tone(`legacy/storm/hold${i}`, stormNotes[i] / 2, 1.6);
tone('legacy/storm/heartbeat', 53, .14, 'sine', 35);
tone('legacy/storm/heartbeat-echo', 48, .11, 'sine', 31);
tone('legacy/storm/thunder-tone', 57, 1.2, 'sine', 32);
tone('electric-tone', 1100, .065, 'triangle', 340);

// Port the original seeded noise channel. Native filtering/overlap differs from WebAudio.
function noise(key, seconds, hz, { high = false, attack = 0, loop = false } = {}) {
  const samples = new Float32Array(Math.ceil(PCM_RATE * seconds));
  let seed = 1234567, low = 0, filtered = 0;
  const a = 1 - Math.exp(-Math.PI * 2 * hz / PCM_RATE);
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1;
    low = .985 * low + .015 * white;
    const raw = white * .25 + low * 3;
    filtered += a * (raw - filtered);
    const time = i / PCM_RATE;
    const envelope = loop ? Math.min(1, time / .018, (seconds - time) / .018) : time < attack ? time / attack : Math.max(0, 1 - (time - attack) / (seconds - attack)) ** 2;
    samples[i] = (high ? raw - filtered : filtered) * envelope;
  }
  wav(key, samples);
}
noise('ambience/room', 5.37, 320, { loop: true });
noise('ambience/wind', 5.37, 320, { loop: true });
noise('ambience/rain', 5.37, 2200, { high: true, loop: true });
noise('ambience/fire', 5.37, 850, { loop: true });
noise('ambience/storm-wind', 4.73, 380, { loop: true });
noise('ambience/storm-rain', 4.73, 2600, { high: true, loop: true });
noise('thunder', 1.65, 320, { attack: .4 });
noise('legacy/storm/thunder', 1.8, 380, { attack: .03 });
noise('fire-crackle', .055, 1600, { attack: .015 });
noise('electric-noise', .075, 3400, { attack: .03 });
noise('electric-echo', .14, 2200, { attack: .03 });
resource('shared/audio/bank.tres', { quiet: b.quietElectric, profiles: b.performanceAudio, mix: b.performanceMix, approved_pcm_sha256: approvedPcmSha }, audio);

const stale = [];
function audit(dir = '') {
  let entries;
  try { entries = readdirSync(resolve(DEST, dir), { withFileTypes: true }); }
  catch (err) { if (!dir && err.code === 'ENOENT') return; throw err; }
  for (const entry of entries) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) audit(path);
    else if (!outputs.has(path) && !path.endsWith('.import') && path !== 'verified.json' && path !== 'README.md') stale.push(path);
  }
}
audit();
if (stale.length) throw Error(`Unexpected native hunt assets (inspect before removal): ${stale.join(', ')}`);
const issues = [];
for (const [path, bytes] of outputs) {
  const file = resolve(DEST, path);
  let data;
  try { data = readFileSync(file); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  if (data?.equals(bytes)) continue;
  if (check) { issues.push(path); continue; }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}
if (issues.length) throw Error(`Missing or stale native hunt resources: ${issues.join(', ')}`);
const size = [...outputs.values()].reduce((bytes, outputBytes) => bytes + outputBytes.length, 0);
console.log(`Native hunt assets: ${chosenIds.length} original packs, ${outputs.size} files, ${size} bytes (${check ? 'verified' : 'prepared'}).`);
