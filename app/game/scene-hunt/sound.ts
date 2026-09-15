/** Procedural music/SFX + licensed CC0 nonverbal startles. No TTS or network. */
import { synthesiseHuntFeedback, type HuntFeedback } from './feedback-score';
import { connectSfxPeakLimit } from '../audio/sfx-levels';
import { approvedSoundDuration } from '../audio/result-samples';
import { fearSamples } from './nonverbal';
import { takeLevelAudioContext } from '../level-audio-context';
import {sparkFrame, type ElectricSpark} from './electric';
import { fearMoment, type FearKind } from './tension';
import {
  quietElectric as quiet,
  performanceAudio,
  performanceMix,
} from './audio-profiles';
import {
  performanceStage,
  performanceTier,
  distantThunderAge,
  type HuntPerformance,
} from './performance';
export type SoundCue =
  | 'found'
  | 'wrong'
  | 'thunder'
  | 'resolve'
  | 'success'
  | 'tap';
export class HuntSound {
  constructor(
    private readonly profile: 'storm' | 'quiet_electric' = 'storm',
    private readonly performance?: HuntPerformance,
    private readonly options: { character?: 'none' | 'nonverbal-fear'; seconds?: number; sparks?: ElectricSpark[] } = {},
  ) {}
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bed: GainNode | null = null;
  private fx: GainNode | null = null;
  private feedbackBus: GainNode | null = null;
  private feedbackBuffers = new Map<HuntFeedback, AudioBuffer>();
  private feedbackSources = new Set<AudioBufferSourceNode>();
  private musicBus: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private peakLimit: WaveShaperNode | null = null;
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
  private activeElapsed = 0;
  private performanceBeds: { name: string; gain: GainNode }[] = [];
  private lastStageThunder = -1;
  private fearBus: GainNode | null = null;
  private fearBuffers = new Map<FearKind, AudioBuffer>();
  private fearSources = new Set<AudioBufferSourceNode>();
  private lastFearSlot = -1;
  private duckUntil = 0;
  private characterEnabled = true;
  private terminalUntil = 0;
  lastCharacterCue = '';
  characterCueCount = 0;
  sparkCueCount = 0;
  private sparkSlots: number[] = [];
  private sparksActive = false;
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
        this.ctx = takeLevelAudioContext();
        const c = this.ctx;
        this.master = c.createGain();
        this.master.gain.value = 0;
        const compressor = c.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.25;
        this.analyser = c.createAnalyser();
        this.analyser.fftSize = 256;
        const output = c.createGain();
        this.master.connect(compressor);
        compressor.connect(output);
        this.peakLimit = connectSfxPeakLimit(c, output, this.analyser);
        this.analyser.connect(c.destination);
        this.bed = c.createGain();
        this.fx = c.createGain();
        this.feedbackBus = c.createGain();
        this.feedbackBus.gain.value = 0;
        this.feedbackBus.connect(output);
        this.musicBus = c.createGain();
        this.fearBus = c.createGain();
        this.fearBus.connect(this.master);
        this.bed.connect(this.master);
        this.fx.connect(this.master);
        this.musicBus.connect(this.master);
        if (this.performance) this.makePerformanceEnvironment();
        else if (this.profile === 'storm') this.makeEnvironment();
        this.timer = setInterval(() => this.schedule(), 100);
      }
      await this.ctx.resume();
      this.apply();
    } catch {
      this.lastCue = 'audio-unavailable';
    }
  }
  setScene(
    active: boolean,
    p: number,
    resolved = false,
    activeElapsed?: number,
    sparksActive = !resolved,
  ) {
    this.sceneActive = active;
    if (!active) this.stopFeedback();
    this.sparksActive = sparksActive;
    this.p = Math.max(0, Math.min(1, p));
    this.resolved = resolved;
    this.activeElapsed = activeElapsed ?? Math.max(0, p) * (this.options.seconds ?? 90) * 1000;
    if (!active || resolved) this.stopFear();
    this.apply();
  }
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    if (hidden) { this.stopFear(); this.stopFeedback(); }
    this.apply();
  }
  setMuted(v: boolean) {
    this.muted = v;
    if (v) { this.stopFear(); this.stopFeedback(); }
    this.apply();
  }
  setMusic(v: boolean) {
    this.music = v;
    this.apply();
  }
  setCharacter(v: boolean) {
    this.characterEnabled = v;
    if (!v) this.stopFear();
  }
  reset() {
    this.stopFear();
    this.stopOneShots();
    this.feedbackSources.clear();
    this.terminalUntil = 0;
    this.sceneActive = false;
    this.apply();
    this.tick = 0;
    this.nextBeat = this.ctx?.currentTime ?? 0;
    this.lastThunder = -100;
    this.lastCue = '';
    this.lastStageThunder = -1;
    this.activeElapsed = 0;
    this.lastFearSlot = -1;
    this.lastCharacterCue = '';
    this.characterCueCount = 0;
    this.sparkCueCount = 0;
    this.sparkSlots = [];
  }
  /** One brief terminal cue; then silence, never an endless storm in the failure modal. */
  fail() {
    this.playTerminal('timeout');
  }
  finish() {
    this.playTerminal('success');
  }
  private playTerminal(cue: 'timeout' | 'success') {
    this.stopFear();
    this.stopOneShots();
    this.stopFeedback();
    this.sceneActive = false;
    const c = this.ctx;
    this.lastCue = cue;
    if (!c || c.state !== 'running' || this.muted || this.hidden) { this.apply(); return; }
    this.terminalUntil = c.currentTime + Math.max(1.3, approvedSoundDuration(cue === 'success' ? 'victory' : 'failure') + .1);
    this.apply();
    this.playFeedback(cue);
  }
  private stopFeedback() {
    for (const source of this.feedbackSources) {
      source.onended = null;
      try { source.stop(); } catch {}
      source.disconnect(); this.live.delete(source);
    }
    this.feedbackSources.clear();
  }
  private stopOneShots() {
    for (const node of [...this.live]) {
      if ('loop' in node && node.loop) continue;
      try { node.stop(); } catch {}
    }
  }
  private apply() {
    const c = this.ctx;
    if (!c || !this.master || !this.bed) return;
    const terminalCue = c.currentTime < this.terminalUntil;
    const active = (this.sceneActive || terminalCue) && !this.hidden && !this.muted;
    this.feedbackBus?.gain.setTargetAtTime(active ? 1 : 0, c.currentTime, .008);
    this.bed.gain.setTargetAtTime(this.sceneActive ? 1 : 0, c.currentTime, .025);
    this.master.gain.setTargetAtTime(
      active
        ? this.performance
          ? performanceMix.master
          : this.profile === 'quiet_electric'
            ? quiet.master
            : 0.58
        : 0,
      c.currentTime,
      0.025,
    );
    this.musicBus?.gain.setTargetAtTime(
      this.music && this.sceneActive && !this.resolved ? c.currentTime < this.duckUntil ? .45 : 1 : 0,
      c.currentTime,
      this.performance && this.resolved ? 0.8 : 0.025,
    );
    if (this.performance) {
      const tier = performanceTier(this.activeElapsed, this.performance?.timing === 'quarters' ? this.options.seconds : undefined);
      for (const bed of this.performanceBeds) {
        const mix =
          bed.name === 'room' ? 0.14 : bed.name === 'wind' ? 0.48 : 0.68;
        const gain = this.resolved
          ? bed.name === 'fire'
            ? 0
            : bed.name === 'room'
              ? 0.002
              : 0.006
          : performanceMix.ambience[tier] * mix;
        bed.gain.gain.setTargetAtTime(
          gain,
          c.currentTime,
          this.resolved ? 0.8 : 0.45,
        );
      }
      return;
    }
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
  private makePerformanceEnvironment() {
    const c = this.ctx!,
      profile = performanceAudio[this.performance!.sound],
      ambience = profile.ambience;
    const names =
      ambience === 'none'
        ? []
        : ambience === 'room'
          ? ['room']
          : ambience === 'rain'
            ? ['wind', 'rain']
            : ['wind', 'fire'];
    for (const name of names) {
      const n = this.track(c.createBufferSource()) as AudioBufferSourceNode;
      n.buffer = this.noise(5.37);
      n.loop = true;
      const f = c.createBiquadFilter(),
        g = c.createGain();
      f.type = name === 'rain' ? 'highpass' : 'lowpass';
      f.frequency.value = name === 'rain' ? 2200 : name === 'fire' ? 850 : 320;
      g.gain.value = 0;
      n.connect(f);
      f.connect(g);
      g.connect(this.bed!);
      n.start();
      this.performanceBeds.push({ name, gain: g });
    }
  }
  private tone(
    f: number,
    at: number,
    len: number,
    gain: number,
    type: OscillatorType = 'sine',
    end?: number,
    bus: GainNode | null = this.fx,
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
    g.connect(bus!);
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
    if (cue !== 'thunder') {
      this.playFeedback(cue);
      return;
    }
    if (this.performance) {
      if (this.performance.atmosphere === 'thunder') this.softThunder(t);
    } else if (this.profile === 'storm') {
      this.burst(t, 1.8, .34, 380);
      this.tone(57, t, 1.2, .07, 'sine', 32);
    }
  }
  private playFeedback(cue: HuntFeedback) {
    const c = this.ctx;
    if (!c || !this.feedbackBus) return;
    let buffer = this.feedbackBuffers.get(cue);
    if (!buffer) {
      const sampleRate = cue === 'success' || cue === 'timeout' ? 44100 : 22050;
      const samples = synthesiseHuntFeedback(this.profile, this.performance, cue, sampleRate);
      buffer = c.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);
      this.feedbackBuffers.set(cue, buffer);
    }
    // Bound overlaps during fast taps and terminal transitions.
    while (this.feedbackSources.size >= 3) {
      const oldest = this.feedbackSources.values().next().value!;
      try { oldest.stop(); } catch {}
      oldest.disconnect(); this.feedbackSources.delete(oldest);
    }
    const source = this.track(c.createBufferSource()) as AudioBufferSourceNode;
    this.feedbackSources.add(source);
    source.buffer = buffer; source.connect(this.feedbackBus); source.start();
    source.onended = () => { this.live.delete(source); this.feedbackSources.delete(source); source.disconnect(); };
    this.duckUntil = Math.max(this.duckUntil, c.currentTime + Math.min(.55, buffer.duration));
    this.apply();
  }

  private schedule() {
    const c = this.ctx;
    if (c && this.terminalUntil && c.currentTime >= this.terminalUntil) {
      this.terminalUntil = 0;
      this.apply();
    }
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
    if(this.sparksActive && !this.resolved)for(const [index,source] of (this.options.sparks??[]).entries()){
      const frame=sparkFrame(source,this.activeElapsed);
      if(frame.active && frame.age<180 && this.sparkSlots[index]!==frame.slot){
        this.sparkSlots[index]=frame.slot;this.sparkCueCount++;this.lastCue='electric-spark';
        this.burst(now,.075,.28,3400);this.burst(now+.09,.14,.12,2200);
        this.tone(1100,now,.065,.045,'triangle',340);
      }
    }
    if (this.options.character === 'nonverbal-fear' && this.characterEnabled && !this.resolved) {
      const moment = fearMoment(this.activeElapsed, this.options.seconds ?? 90);
      if (moment && moment.slot !== this.lastFearSlot) {
        this.lastFearSlot = moment.slot;
        // Never replay a backlog after unmuting or coming back from a hidden page.
        if (moment.age < 1500) this.playFear(moment.kind, moment.intensity);
      }
    }
    if (this.performance) {
      const p = this.performance,
        s = performanceStage(p, this.activeElapsed, this.options.seconds),
        tier = performanceTier(this.activeElapsed, this.performance?.timing === 'quarters' ? this.options.seconds : undefined),
        a = performanceAudio[p.sound];
      if (this.music && now >= this.nextBeat) {
        const gain = performanceMix.music[tier],
          beat = 60 / (this.resolved ? 60 : s.bpm);
        if (!this.resolved) {
          if (this.tick % 2 === 0 || tier >= 2)
            this.tone(
              a.notes[this.tick % a.notes.length],
              now,
              0.18,
              gain,
              a.wave,
              undefined,
              this.musicBus,
            );
          if (tier >= 1 && this.tick % 4 === 0)
            this.tone(
              a.notes[0],
              now,
              0.8,
              gain * 0.5,
              'sine',
              undefined,
              this.musicBus,
            );
          if (tier >= 3 && this.tick % 2 === 1)
            this.tone(
              a.notes[2] * 2,
              now + 0.12,
              0.14,
              gain * 0.36,
              'sine',
              undefined,
              this.musicBus,
            );
        }
        this.nextBeat = now + beat;
        this.tick++;
      }
      if (
        !this.resolved &&
        p.atmosphere === 'thunder' &&
        distantThunderAge(p, this.activeElapsed, this.options.seconds) >= 0 &&
        this.lastStageThunder !== tier
      ) {
        this.lastStageThunder = tier;
        this.cue('thunder');
      }
      if (
        !this.resolved &&
        p.atmosphere === 'fire' &&
        now - this.lastThunder > 3.7 - tier * 0.5
      ) {
        this.lastThunder = now;
        this.burst(now, 0.055, 0.012 + tier * 0.003, 1600);
      }
      return;
    }
    if (this.profile === 'quiet_electric') {
      if (this.music && !this.resolved && now >= this.nextBeat) {
        const beat =
          60 / (quiet.bpm[0] + (quiet.bpm[1] - quiet.bpm[0]) * this.p);
        const gain =
          quiet.musicGain[0] +
          (quiet.musicGain[1] - quiet.musicGain[0]) * this.p;
        // A sparse original 8-beat phrase; pressure changes rhythm density, not hazard physics.
        if (this.tick % 2 === 0)
          this.tone(
            quiet.notes[0],
            now,
            0.65,
            gain * 0.65,
            'sine',
            undefined,
            this.musicBus,
          );
        if (this.tick % 4 === 1 || (this.p > 0.6 && this.tick % 4 === 3))
          this.tone(
            quiet.notes[this.tick % 4 === 1 ? 1 : 2],
            now,
            0.22,
            gain,
            'sine',
            undefined,
            this.musicBus,
          );
        this.nextBeat = now + beat;
        this.tick++;
      }
      return;
    }
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
        undefined,
        this.musicBus,
      );
      if (this.tick % 4 === 0) this.tone(n / 2, now, 1.6, (0.03 + this.p * .025) * duck, 'sine', undefined, this.musicBus);
      if (this.p > 0.45 && !this.resolved) {
        this.tone(53, now, 0.14, 0.085 * duck, 'sine', 35, this.musicBus);
        this.tone(48, now + 0.16, 0.11, 0.045 * duck, 'sine', 31, this.musicBus);
      }
      this.nextBeat = now + beat;
      this.tick++;
    }
    if (!this.resolved && this.p > 0.55 && now - this.lastThunder > 18 - this.p * 6) {
      this.lastThunder = now;
      this.cue('thunder');
    }
  }

  private playFear(kind: FearKind, intensity: number) {
    const c = this.ctx!;
    this.stopFear();
    let buffer = this.fearBuffers.get(kind);
    if (!buffer) {
      const samples = fearSamples(kind, c.sampleRate);
      buffer = c.createBuffer(1, samples.length, c.sampleRate);
      buffer.getChannelData(0).set(samples);
      this.fearBuffers.set(kind, buffer);
    }
    const node = this.track(c.createBufferSource()) as AudioBufferSourceNode;
    const gain = c.createGain();
    gain.gain.value = .24 + intensity * .14;
    node.buffer = buffer;
    node.connect(gain);
    gain.connect(this.fearBus!);
    this.fearSources.add(node);
    this.duckUntil = c.currentTime + buffer.duration + .12;
    node.onended = () => {
      this.live.delete(node);
      this.fearSources.delete(node);
      node.disconnect(); gain.disconnect();
    };
    this.lastCharacterCue = kind;
    this.characterCueCount++;
    this.apply();
    // The gust and frightened shoulder reaction share the same timing.
    if (this.profile === 'storm') this.burst(c.currentTime, .65, .05 + intensity * .04, 420);
    node.start();
  }
  private stopFear() {
    for (const node of this.fearSources) { try { node.stop(); } catch {} }
    this.fearSources.clear();
    this.duckUntil = 0;
  }

  private softThunder(at: number) {
    const c = this.ctx!,
      n = this.track(c.createBufferSource()) as AudioBufferSourceNode,
      f = c.createBiquadFilter(),
      g = c.createGain();
    n.buffer = this.noise(1.65);
    f.type = 'lowpass';
    f.frequency.value = 320;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.06, at + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.65);
    n.connect(f);
    f.connect(g);
    g.connect(this.fx!);
    n.start(at);
    n.stop(at + 1.65);
    n.onended = () => {
      this.live.delete(n);
      n.disconnect();
      f.disconnect();
      g.disconnect();
    };
  }

  dispose() {
    this.disposed = true;
    this.feedbackBuffers.clear();
    this.feedbackSources.clear();
    this.feedbackBus?.disconnect();
    this.peakLimit?.disconnect();
    this.stopFear();
    this.fearBuffers.clear();
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
