// Build-time only. Bake authored deterministic DSP to Godot PCM; no browser runtime or speech.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { dependency } from '../../scripts/lib/dependencies.mjs';

export function configuredAudioBuilder(root, emit) {
  const ts = dependency('typescript');
  const cache = new Map(), emitted = new Set();
  // Only repository-local source and JSON are evaluated. Type-only imports are stripped.
  function load(file) {
    const absolute = path.resolve(root, file);
    if (!absolute.startsWith(root + path.sep)) throw Error(`Outside repository: ${file}`);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const source = readFileSync(absolute, 'utf8');
    if (absolute.endsWith('.json')) return JSON.parse(source);
    const mod = { exports: {} };
    cache.set(absolute, mod);
    // The authored theme table is private to the web mixer; this export exists only while baking.
    const addition = file.endsWith('practice-audio.ts') ? '\nexport { themes, hash, noise };' : '';
    const compiled = ts.transpileModule(source + addition, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
    } }).outputText;
    const resolve = spec => {
      if (!spec.startsWith('.') && !spec.startsWith('@/')) throw Error(`Unexpected audio dependency ${spec}`);
      const base = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(absolute), spec);
      const target = [base, base + '.ts', base + '.json'].find(f => existsSync(f) && /\.(ts|json)$/.test(f));
      if (!target) throw Error(`Missing audio dependency ${spec} (from ${file})`);
      return load(path.relative(root, target));
    };
    new Function('module', 'exports', 'require', compiled)(mod, mod.exports, resolve);
    return mod.exports;
  }

  const sr = 22050, tau = Math.PI * 2;
  const practice = load('app/game/runtime/practice-audio.ts');
  const { synthesiseLegacyMusic } = load('app/game/runtime/legacy-response-audio.ts');
  const { synthesiseFloodLoop } = load('app/game/runtime/flood-sound.ts');
  const { approvedSoundSamples } = load('app/game/audio/result-samples.ts');
  const { synthesiseHuntFeedback } = load('app/game/scene-hunt/feedback-score.ts');
  const { quietElectric } = load('app/game/scene-hunt/audio-profiles.ts');
  const { renderScore } = load('app/game/audio/note-score.ts');
  const legacy = load('content/legacy-response-audio.json');
  const nativeRoot = 'res://assets/configured_runner/';
  function wav(name, getter, sampleRate = sr) {
    if (!/^[a-z0-9-]+$/.test(name) || /(?:voice|speech|tts|narrat)/i.test(name)) throw Error(`Non-safe audio ID: ${name}`);
    const file = `audio/${name}.wav`;
    if (!emitted.has(file)) {
      const samples = getter();
      const output = Buffer.alloc(44 + samples.length * 2);
      output.write('RIFF', 0); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ', 8);
      output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22);
      output.writeUInt32LE(sampleRate, 24); output.writeUInt32LE(sampleRate * 2, 28);
      output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34);
      output.write('data', 36); output.writeUInt32LE(samples.length * 2, 40);
      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        if (!Number.isFinite(samples[i])) throw Error(`Non-finite sample: ${name}`);
        peak = Math.max(peak, Math.abs(samples[i]));
        output.writeInt16LE(Math.min(32767, Math.max(-32768, Math.round(samples[i] * 32768))), 44 + i * 2);
      }
      if (!samples.length || peak > .99) throw Error(`Invalid level ${peak}: ${name}`);
      emit(file, output);
      emitted.add(file);
    }
    return nativeRoot + file;
  }
  const result = Object.fromEntries(['victory', 'failure', 'button'].map(id => [id, wav(`approved-${id}`, () => approvedSoundSamples(id), 44100)]));

  function themeMusic(theme) {
    const profile = practice.themes[theme];
    const data = new Float32Array(Math.ceil(8 * 60 / profile.bpm * sr));
    for (let beat = 0; beat < 8; beat++) {
      const start = Math.floor(beat * 60 / profile.bpm * sr), f = profile.notes[beat % profile.notes.length];
      for (let i = 0; i < Math.min(sr, data.length - start); i++) {
        const t = i / sr;
        data[start + i] += (Math.sin(t * f * tau) + .2 * Math.sin(t * f * tau * 2)) * Math.min(1, t / .015) * Math.exp(-t * 6) * .22;
      }
    }
    for (let i = 0; i < Math.min(440, data.length); i++) data[data.length - 1 - i] *= i / 440;
    return data;
  }
  function themeAmbient(theme) {
    const { cutoff, hum } = practice.themes[theme], random = practice.noise(practice.hash(theme));
    const data = new Float32Array(sr * 2);
    for (let i = 0; i < data.length; i++) data[i] = random() * (theme === 'medical' ? .06 : .45);
    for (let i = 0; i < 440; i++) data[data.length - 440 + i] = data[data.length - 440 + i] * (1 - i / 440) + data[i] * i / 440;
    // Same authored cutoff and Q, rendered to PCM instead of a Web Audio node.
    const cosine = Math.cos(tau * cutoff / sr), alpha = Math.sin(tau * cutoff / sr) / (2 * .5), a = 1 + alpha;
    const b0 = (1 - cosine) / (2 * a), b1 = (1 - cosine) / a, a1 = -2 * cosine / a, a2 = (1 - alpha) / a;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    // Warm the filter through one cycle before retaining its periodic output.
    for (let i = 0; i < data.length * 2; i++) {
      const j = i % data.length, x = data[j], y = b0 * (x + x2) + b1 * x1 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      if (i >= data.length) data[j] = y + (hum ? Math.sin(tau * hum * j / sr) * .024 : 0);
    }
    return data;
  }

  return function profile(rules, skin) {
    if (!skin.presentation && rules.kind === 'prevention' && rules.risk.timeout === 'fail') {
      const cues = Object.fromEntries(['tap', 'found', 'wrong', 'resolve'].map(id => [id, wav(`collection-${id}`, () => synthesiseHuntFeedback('quiet_electric', undefined, id))]));
      const notes = quietElectric.notes.map((frequency, i) => wav(`collection-note-${i}`, () => renderScore([{ frequency, duration: i === 0 ? .65 : .22, gain: .16, attack: .015, exponentialAttack: true }])));
      return { mode: 'collection', cues, notes, bpm: quietElectric.bpm, musicGain: quietElectric.musicGain, result };
    }
    const isLegacy = !skin.presentation && !skin.response && Object.hasOwn(legacy, rules.id);
    const audio = isLegacy ? legacy[rules.id] : skin.presentation?.audio;
    if (!audio) return { mode: 'none', result };
    const cue = id => wav(`cue-${id}`, () => practice.practiceSfxSamples(id));
    const events = { opening: 'scene-ready', pickup: 'object-pickup', danger: 'danger-demonstration', bounce: 'invalid-return', goal: 'goal-confirm', waiting: 'waiting-established', failure: 'smoke-warning' };
    for (const rule of rules.interactions) events[rule.id] = rule.failure ? audio.cues.failure ?? events.failure : `${rule.id}-${{correct:'contact',danger:'error',neutral:'return'}[rule.outcome]}`;
    for (const stage of rules.stages ?? []) events[stage.id] = 'scene-transition';
    for (const [event, id] of Object.entries(audio.cues)) if (event !== 'complete') events[event] = id;
    const cues = Object.fromEntries(Object.entries(events).map(([event,id]) => [event, cue(id)]));
    const emergency = { ...audio.emergency };
    for (const key of ['alarm','heartbeat','cough','rescue']) if (emergency[key]) emergency[key] = cue(emergency[key]);
    const music = isLegacy ? wav('legacy-action-music', () => synthesiseLegacyMusic()) : wav(`music-${audio.theme}`, () => themeMusic(audio.theme));
    const ambient = audio.ambientProfile === 'flood-window'
      ? ['flood-roar', 'rain-window'].map(id => wav(`loop-${id}`, () => synthesiseFloodLoop(id)))
      : [wav(`ambient-${audio.theme}`, () => themeAmbient(audio.theme))];
    return { mode: isLegacy ? 'legacy-response' : 'presentation', theme: audio.theme, music, ambient, floodWindow: ambient.length === 2, cues, emergency, calmWhen: audio.calmWhen ?? [], result };
  };
}
