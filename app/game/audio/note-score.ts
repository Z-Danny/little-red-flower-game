/** Small deterministic scores used for calibration and offline feedback playback. */
export type SoundNote = {
  frequency: number; end?: number; delay?: number; duration: number; gain: number;
  type?: OscillatorType | 'noise'; attack?: number; exponentialAttack?: boolean;
};
export function renderScore(notes: readonly SoundNote[], sampleRate = 22050): Float32Array {
  const duration = Math.max(0, ...notes.map(n => (n.delay ?? 0) + n.duration + .005));
  const data = new Float32Array(Math.ceil(duration * sampleRate));
  let seed = 764291;
  for (const note of notes) {
    const offset = Math.round((note.delay ?? 0) * sampleRate), attack = note.attack ?? .006;
    let phase = 0, low = 0;
    for (let i = 0; i < Math.ceil((note.duration + .005) * sampleRate); i++) {
      const t = i / sampleRate;
      const frequency = note.frequency * ((note.end ?? note.frequency) / note.frequency) ** Math.min(1, t / note.duration);
      phase += frequency / sampleRate;
      let wave = Math.sin(phase * Math.PI * 2);
      if (note.type === 'triangle') wave = 2 / Math.PI * Math.asin(wave);
      else if (note.type === 'square') wave = wave < 0 ? -1 : 1;
      else if (note.type === 'sawtooth') wave = (phase % 1) * 2 - 1;
      else if (note.type === 'noise') {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const alpha = 1 - Math.exp(-2 * Math.PI * frequency / sampleRate);
        low += alpha * (seed / 2147483648 - 1 - low); wave = low;
      }
      const floor = .0001;
      const envelope = t < attack
        ? note.exponentialAttack ? floor * (note.gain / floor) ** (t / attack) : note.gain * t / attack
        : t <= note.duration ? note.gain * (floor / note.gain) ** ((t - attack) / (note.duration - attack))
        : floor * Math.max(0, 1 - (t - note.duration) / .005);
      if (offset + i < data.length) data[offset + i] += wave * envelope;
    }
  }
  return data;
}
