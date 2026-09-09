/** Original procedural music, ambience and SFX. No speech, samples or network. */
export type SoundCue =
  | 'found'
  | 'wrong'
  | 'thunder'
  | 'resolve'
  | 'success'
  | 'tap';
export class HuntSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bed: GainNode | null = null;
  private fx: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private wind: GainNode | null = null;
  private rain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private live = new Set<AudioScheduledSourceNode>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private nextBeat = 0;
  private lastThunder = -100;
  private sceneActive = false;
  private hidden = false;
  private disposed = false;
  private p = 0;
  muted = false;
  music = true;
  lastCue = '';
  private resolved = false;
  get status() {
    return this.ctx?.state ?? 'locked';
  }
  get level() {
    if (!this.analyser) return 0;
    const a = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(a);
    return Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  }
  async unlock() {
    if (this.disposed) return;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        const c = this.ctx;
        this.master = c.createGain();
        this.master.gain.value = 0.58;
        const compressor = c.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.25;
        this.analyser = c.createAnalyser();
        this.analyser.fftSize = 256;
        this.master.connect(compressor);
        compressor.connect(this.analyser);
        this.analyser.connect(c.destination);
        this.bed = c.createGain();
        this.fx = c.createGain();
        this.bed.connect(this.master);
        this.fx.connect(this.master);
        this.makeEnvironment();
        this.timer = setInterval(() => this.schedule(), 100);
      }
      await this.ctx.resume();
      this.apply();
    } catch {
      this.lastCue = 'audio-unavailable';
    }
  }
  setScene(active: boolean, p: number, resolved = false) {
    this.sceneActive = active;
    this.p = Math.max(0, Math.min(1, p));
    this.resolved = resolved;
    this.apply();
  }
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.apply();
  }
  setMuted(v: boolean) {
    this.muted = v;
    this.apply();
  }
  setMusic(v: boolean) {
    this.music = v;
    this.apply();
  }
  reset() {
    this.tick = 0;
    this.nextBeat = this.ctx?.currentTime ?? 0;
    this.lastThunder = -100;
    this.lastCue = '';
  }
  private apply() {
    const c = this.ctx;
    if (!c || !this.master || !this.bed) return;
    const active = this.sceneActive && !this.hidden && !this.muted;
    this.master.gain.setTargetAtTime(active ? 0.58 : 0, c.currentTime, 0.06);
    this.wind?.gain.setTargetAtTime(
      this.resolved ? 0.012 : 0.1 + this.p * 0.28,
      c.currentTime,
      0.6,
    );
    this.rain?.gain.setTargetAtTime(
      this.resolved ? 0.003 : 0.025 + this.p * 0.09,
      c.currentTime,
      0.6,
    );
    this.windFilter?.frequency.setTargetAtTime(
      210 + this.p * 700,
      c.currentTime,
      0.5,
    );
  }
  private noise(seconds: number) {
    const c = this.ctx!,
      b = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate),
      d = b.getChannelData(0);
    let seed = 1234567,
      low = 0;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const white = seed / 2147483648 - 1;
      low = 0.985 * low + 0.015 * white;
      d[i] = white * 0.25 + low * 3;
    }
    return b;
  }
  private track(node: AudioScheduledSourceNode) {
    this.live.add(node);
    node.onended = () => {
      this.live.delete(node);
      node.disconnect();
    };
    return node;
  }
  private makeEnvironment() {
    const c = this.ctx!;
    for (const name of ['wind', 'rain'] as const) {
      const source = this.track(
        c.createBufferSource(),
      ) as AudioBufferSourceNode;
      source.buffer = this.noise(4.73);
      source.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = name === 'wind' ? 'lowpass' : 'highpass';
      filter.frequency.value = name === 'wind' ? 260 : 2600;
      const g = c.createGain();
      g.gain.value = 0;
      source.connect(filter);
      filter.connect(g);
      g.connect(this.bed!);
      this[name] = g;
      if (name === 'wind') this.windFilter = filter;
      source.start();
    }
  }
  private tone(
    f: number,
    at: number,
    len: number,
    gain: number,
    type: OscillatorType = 'sine',
    end?: number,
  ) {
    const c = this.ctx!;
    const o = this.track(c.createOscillator()) as OscillatorNode,
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (end) o.frequency.exponentialRampToValueAtTime(end, at + len);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g);
    g.connect(this.fx!);
    o.start(at);
    o.stop(at + len + 0.03);
    o.onended = () => {
      this.live.delete(o);
      o.disconnect();
      g.disconnect();
    };
  }
  private burst(at: number, len: number, gain: number, frequency: number) {
    const c = this.ctx!,
      n = this.track(c.createBufferSource()) as AudioBufferSourceNode,
      f = c.createBiquadFilter(),
      g = c.createGain();
    n.buffer = this.noise(len);
    f.type = 'lowpass';
    f.frequency.value = frequency;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    n.connect(f);
    f.connect(g);
    g.connect(this.fx!);
    n.start(at);
    n.stop(at + len);
    n.onended = () => {
      this.live.delete(n);
      n.disconnect();
      f.disconnect();
      g.disconnect();
    };
  }
  cue(cue: SoundCue) {
    const c = this.ctx;
    if (
      !c ||
      c.state !== 'running' ||
      this.muted ||
      this.hidden ||
      !this.sceneActive
    )
      return;
    this.lastCue = cue;
    const t = c.currentTime;
    if (cue === 'found') {
      [659.25, 880, 1318.5].forEach((f, i) =>
        this.tone(f, t + i * 0.075, 0.2, 0.11),
      );
      this.burst(t, 0.1, 0.035, 3500);
    }
    if (cue === 'wrong') {
      this.tone(210, t, 0.16, 0.055, 'triangle', 145);
    }
    if (cue === 'tap') this.burst(t, 0.045, 0.04, 2000);
    if (cue === 'thunder') {
      this.burst(t, 1.8, 0.34, 380);
      this.tone(57, t, 1.2, 0.07, 'sine', 32);
    }
    if (cue === 'resolve') {
      this.burst(t, 1.25, 0.1, 1200);
      [392, 523.25, 659.25].forEach((f, i) =>
        this.tone(f, t + i * 0.15, 0.6, 0.075),
      );
    }
    if (cue === 'success')
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        this.tone(f, t + i * 0.16, 0.65, 0.09),
      );
  }
  private schedule() {
    const c = this.ctx;
    if (
      !c ||
      c.state !== 'running' ||
      !this.sceneActive ||
      this.hidden ||
      this.muted
    ) {
      if (c) this.nextBeat = c.currentTime;
      return;
    }
    const now = c.currentTime;
    if (this.music && now >= this.nextBeat) {
      const beat = this.resolved ? 1.1 : 0.72 - this.p * 0.25,
        notes = this.resolved
          ? [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 392]
          : [146.83, 220, 174.61, 220, 130.81, 196, 164.81, 196],
        n = notes[this.tick % 8];
      const duck = 1;
      this.tone(
        n,
        now,
        0.47,
        0.035 * duck,
        this.resolved ? 'sine' : 'triangle',
      );
      if (this.tick % 4 === 0) this.tone(n / 2, now, 1.6, 0.042 * duck);
      if (this.p > 0.45 && !this.resolved) {
        this.tone(53, now, 0.14, 0.085 * duck, 'sine', 35);
        this.tone(48, now + 0.16, 0.11, 0.045 * duck, 'sine', 31);
      }
      this.nextBeat = now + beat;
      this.tick++;
    }
    if (this.p > 0.55 && now - this.lastThunder > 18 - this.p * 6) {
      this.lastThunder = now;
      this.cue('thunder');
    }
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    for (const n of this.live) {
      try {
        n.stop();
        n.disconnect();
      } catch {}
    }
    this.live.clear();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
