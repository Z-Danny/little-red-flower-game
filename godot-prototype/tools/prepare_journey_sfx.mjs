/** Render Godot's shared cues from the approved Web audio and original note scores. */
import fs from 'node:fs';
import path from 'node:path';
import { dependency, root } from '../../scripts/lib/dependencies.mjs';

const source = path.join(root, 'components/game/journey/reward-sound.ts');
const dest = path.join(root, 'godot-prototype/assets/journey_sfx');
fs.mkdirSync(dest, {recursive: true});
const build = await dependency('esbuild').build({
  absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm',
  stdin: {resolveDir: root, contents: `
    export {notes, cueGain} from './components/game/journey/reward-sound';
    export {renderScore} from './app/game/audio/note-score';
    export {floodSound} from './app/game/runtime/flood-sound';
    export {default as timeline} from './content/journey-timing.json';
  `},
  plugins: [{
    name: 'journey-original-score',
    setup(builder) {
      builder.onLoad({filter: /reward-sound\.ts$/}, args => args.path === source ? {
        contents: fs.readFileSync(source, 'utf8') + '\nexport {notes, cueGain};',
        loader: 'ts', resolveDir: path.dirname(source),
      } : undefined);
    },
  }],
});
const {notes, cueGain, renderScore, floodSound, timeline} = await import('data:text/javascript;base64,' + Buffer.from(build.outputFiles[0].text).toString('base64'));
const rate = 22050;
function pcm(frames, hz) {
  // Keep the attack and amplitude intact. WebKit can finish a very short
  // stream before it reports that playback has started.
  frames = Math.max(frames, Math.ceil(hz * 0.14));
  const data = Buffer.alloc(44 + frames * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(hz, 24); data.writeUInt32LE(hz * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
  return data;
}
function wav(name, samples) {
  const data = pcm(samples.length, rate);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(path.join(dest, name + '.wav'), data);
}
const scores = {};
for (const [name, score] of Object.entries(notes)) {
  scores[name] = renderScore(score.map(note => ({...note, exponentialAttack: true})), rate).map(sample => sample * cueGain[name]);
  if (['tap', 'open', 'close', 'confirm', 'hint', 'count'].includes(name)) wav(name, scores[name]);
}
for (const unlock of [false, true]) {
  const cues = ['land', 'sprout', 'bloom', 'count', ...(unlock ? ['unlock'] : [])];
  const offsets = cues.map(name => Math.round((timeline[name] - timeline.land) * rate / 1000));
  const mix = new Float32Array(Math.max(...cues.map((name, i) => offsets[i] + scores[name].length)));
  cues.forEach((name, i) => scores[name].forEach((sample, j) => { mix[offsets[i] + j] += sample; }));
  wav(unlock ? 'plant-unlock' : 'plant', mix);
}
const sourceAssets = {
  button: 'art-source/settlement-audio-v1/approved/03-button-a-warm.wav',
  victory: 'art-source/settlement-audio-v1/approved/01-victory-short.wav',
  failure: 'art-source/settlement-audio-v1/approved/02-failure-short.wav',
  pickup: 'godot-prototype/assets/configured_runner/audio/collection-tap.wav',
  putback: 'godot-prototype/assets/configured_runner/audio/collection-wrong.wav',
  correct: 'godot-prototype/assets/shared_cues/goal-confirm.wav',
  wrong: 'godot-prototype/assets/shared_cues/wrong-warning.wav',
  mark: 'godot-prototype/assets/hunt_runner/shared/audio/tap.wav',
  'put-together': 'godot-prototype/assets/configured_runner/audio/cue-wood-tap.wav',
};
for (const [name, file] of Object.entries(sourceAssets)) {
  const original = fs.readFileSync(path.join(root, file));
  let audio = original;
  if (name === 'button' || name === 'putback') {
    let chunk = 36;
    while (chunk + 8 <= original.length && original.toString('ascii', chunk, chunk + 4) !== 'data') {
      const bytes = original.readUInt32LE(chunk + 4);
      chunk += 8 + bytes + bytes % 2;
    }
    if (chunk + 8 > original.length || original.readUInt16LE(20) !== 1 || original.readUInt16LE(22) !== 1 || original.readUInt16LE(34) !== 16) {
      throw new Error('Expected mono 16-bit PCM for ' + name);
    }
    const bytes = original.readUInt32LE(chunk + 4);
    audio = pcm(bytes / 2, original.readUInt32LE(24));
    original.copy(audio, 44, chunk + 8, chunk + 8 + bytes);
  }
  fs.writeFileSync(path.join(dest, name + '.wav'), audio);
}
for (const name of ['flood-power-off', 'flood-message-sent', 'flood-pack-zip', 'flood-high-step']) {
  wav(name, floodSound(name, rate));
}

function islandSwitch() {
  const samples = new Float32Array(Math.round(rate * 0.28));
  let noiseSeed = 87193053;
  let air = 0;
  let rumble = 0;
  let phase = 0;
  for (let index = 0; index < samples.length; index++) {
    const progress = index / (samples.length - 1);
    noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
    const noise = noiseSeed / 2147483648 - 1;
    const brightness = Math.sin(Math.PI * progress) ** 0.8;
    air += (noise - air) * (0.23 + 0.30 * brightness);
    rumble += (noise - rumble) * (0.035 + 0.08 * brightness);
    const pitch = 360 + 650 * Math.sin(Math.PI * progress * 0.82) ** 2;
    phase += 2 * Math.PI * pitch / rate;
    const envelope = Math.sin(Math.PI * progress) ** 1.65;
    samples[index] = envelope * (0.42 * (air - rumble) + 0.04 * Math.sin(phase));
  }
  return samples;
}

wav('island-switch', islandSwitch());
