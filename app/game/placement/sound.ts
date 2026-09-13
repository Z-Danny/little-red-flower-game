import type { Input, LevelPackage, Run } from '../runtime/schema';
import { findRule } from '../runtime/engine';

export const materials = [
  'metal',
  'ceramic',
  'plastic',
  'paper',
  'cloth',
  'wood',
  'liquid',
  'switch',
  'steps',
  'rumble',
] as const;
export const gestures = [
  'lift',
  'place',
  'turn',
  'reject',
  'return',
  'pour',
  'walk',
] as const;
export type Sound = {
  material: (typeof materials)[number];
  gesture: (typeof gestures)[number];
  description: string;
  gain: number;
  src?: string;
};
export type ObjectSounds = Record<
  'pickup' | 'miss' | 'blocked' | 'return',
  Sound
>;
export type ActionSound = { at: number; sound: Sound };
export type PlacementSounds = {
  objects: Record<string, ObjectSounds>;
  actions: Record<string, ActionSound[]>;
  stages?: Record<string, Sound>;
};
export type SoundEvent = {
  object: string;
  event: string;
  sound: Sound;
  time: number;
};
const keys = (value: unknown, allowed: string[], path: string) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !allowed.includes(k))
  )
    throw new Error(`${path}: 字段错误`);
};
export function validateSounds(pack: LevelPackage, audio: PlacementSounds) {
  keys(audio, ['objects', 'actions', 'stages'], 'audio');
  const check = (sound: Sound, path: string) => {
    keys(sound, ['material', 'gesture', 'description', 'gain', 'src'], path);
    if (
      !materials.includes(sound.material) ||
      !gestures.includes(sound.gesture) ||
      typeof sound.description !== 'string' ||
      !sound.description.trim() ||
      !Number.isFinite(sound.gain) ||
      sound.gain <= 0 ||
      sound.gain > 1
    )
      throw new Error(
        `${path}: 需填写材质、动作、具体声音描述和 0～1 音量（不能为 0）`,
      );
    if (
      sound.src !== undefined &&
      (!/^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/.test(sound.src) ||
        sound.src.length > 4_000_000)
    )
      throw new Error(`${path}: 自定义音效须为 3 MB 以内内嵌 WAV`);
    if (sound.src) validateWave(sound.src);
  };
  const objects = pack.rules.objects.filter((o) => o.input !== 'none');
  if (audio.stages)
    for (const [id, cue] of Object.entries(audio.stages)) {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(id))
        throw new Error('阶段音效 ID 格式错误');
      check(cue, `audio.stages.${id}`);
    }
  keys(
    audio.objects,
    objects.map((o) => o.id),
    'audio.objects',
  );
  keys(
    audio.actions,
    pack.rules.interactions.map((r) => r.id),
    'audio.actions',
  );
  for (const o of objects) {
    const sounds = audio.objects[o.id];
    keys(
      sounds,
      ['pickup', 'miss', 'blocked', 'return'],
      `audio.objects.${o.id}`,
    );
    for (const event of ['pickup', 'miss', 'blocked', 'return'] as const)
      check(sounds[event], `audio.objects.${o.id}.${event}`);
  }
  for (const r of pack.rules.interactions) {
    const cues = audio.actions[r.id];
    if (!Array.isArray(cues) || !cues.length || cues.length > 6)
      throw new Error(`audio.actions.${r.id}: 每个动作必须有 1～6 个对应音效`);
    let previous = -1;
    for (const cue of cues) {
      keys(cue, ['at', 'sound'], `audio.actions.${r.id}`);
      if (
        !Number.isFinite(cue.at) ||
        cue.at < 0 ||
        cue.at > 1 ||
        cue.at <= previous
      )
        throw new Error(`audio.actions.${r.id}: 触发比例须从 0 到 1 严格递增`);
      previous = cue.at;
      check(cue.sound, `audio.actions.${r.id}`);
    }
  }
}
export function validateWave(src: string) {
  const bytes = Uint8Array.from(atob(src.split(',')[1]), (c) =>
      c.charCodeAt(0),
    ),
    view = new DataView(bytes.buffer);
  const tag = (i: number, n: number) =>
    String.fromCharCode(...bytes.slice(i, i + n));
  if (bytes.length < 44 || tag(0, 4) !== 'RIFF' || tag(8, 4) !== 'WAVE')
    throw new Error('自定义音效不是有效 WAV');
  let rate = 0,
    channels = 0,
    size = 0,
    peak = 0;
  for (let i = 12; i + 8 <= bytes.length;) {
    const length = view.getUint32(i + 4, true),
      offset = i + 8;
    if (offset + length > bytes.length) throw new Error('WAV 数据不完整');
    if (tag(i, 4) === 'fmt ') {
      if (
        length < 16 ||
        view.getUint16(offset, true) !== 1 ||
        view.getUint16(offset + 14, true) !== 16
      )
        throw new Error('自定义 WAV 请使用 16 位 PCM');
      channels = view.getUint16(offset + 2, true);
      rate = view.getUint32(offset + 4, true);
    }
    if (tag(i, 4) === 'data') {
      size += length;
      for (let n = offset; n + 1 < offset + length; n += 2)
        peak = Math.max(peak, Math.abs(view.getInt16(n, true)));
    }
    i = offset + length + (length % 2);
  }
  if (
    ![1, 2].includes(channels) ||
    rate < 8000 ||
    rate > 96000 ||
    size / (channels * rate * 2) < 0.02 ||
    size / (channels * rate * 2) > 5 ||
    peak < 33
  )
    throw new Error('WAV 需为 0.02～5 秒非空白的单/双声道 16 位 PCM');
}

/** Original deterministic Foley sketches. They are replaceable with recorded WAVs. */
export function synthesize(sound: Sound, rate = 22050) {
  const duration =
    sound.material === 'rumble'
      ? 0.85
      : sound.gesture === 'walk'
        ? 0.65
        : sound.gesture === 'pour'
          ? 0.55
          : sound.material === 'cloth' || sound.material === 'paper'
            ? 0.28
            : 0.22;
  const buffer = new Float32Array(Math.ceil(duration * rate));
  const freq = {
    metal: 680,
    ceramic: 1140,
    plastic: 330,
    paper: 2100,
    cloth: 900,
    wood: 170,
    liquid: 480,
    switch: 1450,
    steps: 115,
    rumble: 53,
  }[sound.material];
  const pitch =
    sound.gesture === 'lift'
      ? 1.15
      : sound.gesture === 'return'
        ? 0.8
        : sound.gesture === 'reject'
          ? 0.65
          : 1;
  let seed = freq * 7919 + gestures.indexOf(sound.gesture) * 131,
    smooth = 0;
  for (let i = 0; i < buffer.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = (seed >>> 0) / 2147483648 - 1;
    smooth = 0.86 * smooth + 0.14 * noise;
    const phase = sound.gesture === 'walk' ? t % 0.22 : t;
    const decay = Math.exp(
      -phase *
        (sound.material === 'metal' || sound.material === 'ceramic' ? 19 : 35),
    );
    const tone =
      Math.sin(2 * Math.PI * freq * pitch * phase) * 0.55 +
      Math.sin(2 * Math.PI * freq * 2.17 * pitch * phase) * 0.18;
    let value = (tone + noise * 0.2) * decay;
    if (sound.material === 'cloth' || sound.material === 'paper')
      value =
        (sound.material === 'cloth' ? smooth * 2 : noise * 0.42) *
        Math.sin((Math.PI * t) / duration);
    if (sound.material === 'liquid')
      value =
        (smooth * 2 + Math.sin(2 * Math.PI * (freq * t + 160 * t * t)) * 0.25) *
        Math.sin((Math.PI * t) / duration);
    if (sound.material === 'rumble')
      value =
        (smooth * 2 +
          Math.sin(2 * Math.PI * 53 * t) * 0.2 +
          Math.sin(2 * Math.PI * 83 * t) * 0.13) *
        Math.sin((Math.PI * t) / duration);
    const fade = Math.min(1, i / 60, (buffer.length - i - 1) / 160);
    buffer[i] = Math.max(-0.8, Math.min(0.8, value * fade * 0.7));
  }
  return buffer;
}
export function soundWav(sound: Sound): Uint8Array {
  const samples = synthesize(sound),
    bytes = new Uint8Array(44 + samples.length * 2),
    view = new DataView(bytes.buffer);
  const tag = (at: number, text: string) =>
    [...text].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  tag(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 22050, true);
  view.setUint32(28, 44100, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) =>
    view.setInt16(44 + i * 2, Math.round(v * 32767), true),
  );
  return bytes;
}

/** Uses simulation time, including the final tick which clears run.action. */
export class PlacementSoundTimeline {
  private pending: SoundEvent[] = [];
  constructor(
    private pack: LevelPackage,
    private audio: PlacementSounds,
  ) {}
  object(id: string, event: keyof ObjectSounds, time: number): SoundEvent {
    return { object: id, event, time, sound: this.audio.objects[id][event] };
  }
  begin(run: Run, input: Input, pack = this.pack) {
    const rule = findRule(pack, run, input),
      time = run.elapsed;
    if (rule) {
      const duration = this.pack.skin.animations[rule.animation].durationMs;
      this.pending = this.audio.actions[rule.id].map((c) => ({
        object: input.source,
        event: rule.id,
        sound: c.sound,
        time: time + duration * c.at,
      }));
      if (rule.outcome !== 'correct')
        this.pending.push(this.object(input.source, 'return', time + duration));
    } else {
      const blocked = this.pack.rules.interactions.some(
        (r) =>
          r.source === input.source &&
          r.target === input.target &&
          (!pack.rules.interactions.some((x) => x.id === r.id) ||
            r.requires?.some((g) => !run.resolved.includes(g))),
      );
      this.pending = [
        this.object(input.source, blocked ? 'blocked' : 'miss', time),
        this.object(input.source, 'return', time + 450),
      ];
    }
    return this.advance(time);
  }
  advance(time: number) {
    const due = this.pending.filter((e) => e.time <= time);
    this.pending = this.pending.filter((e) => e.time > time);
    return due;
  }
  reset() {
    this.pending = [];
  }
}
