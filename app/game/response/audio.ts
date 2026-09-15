import manifest from '@/content/response/audio-manifest.json';
import { takeLevelAudioContext } from '../level-audio-context';
import { kitchenExperience, clamp01 } from './pressure';
import { CueTimeline, type AudioFrame, type CueProfile, type Cue, kitchenCues } from './audio-cues';
import { connectSfxPeakLimit, normaliseSfx } from '../audio/sfx-levels';
import { approvedSoundSamples, type ApprovedSound } from '../audio/result-samples';
export type AudioBus = 'music' | 'ambience' | 'sfx' | 'character';
export type AudioSettings = Record<AudioBus, number> & { muted: boolean };
export const defaultAudioSettings: AudioSettings = { music: .52, ambience: .68, sfx: .8, character: .65, muted: false };
type Asset = { src: string; bus: string; loop?: boolean };
type Playing = { source: AudioBufferSourceNode; gain: GainNode; id: string };
const assets = manifest.assets as Record<string, Asset>;
const sfxTargets: Record<string, number> = { pickup: .08, 'fx-lid': .085, 'fx-gas': .075, 'fx-water': .08, cloth: .087, flare: .092, spray: .075, bounce: .105, success: .093 };
export function responseSfxSamples(id: string, samples: Float32Array, sampleRate = 22050): Float32Array {
  return assets[id]?.bus === 'sfx' ? normaliseSfx(samples, { targetRms: sfxTargets[id] ?? .08, sampleRate }) : samples;
}
const empty: AudioFrame = { elapsed: 0, active: false, intensity: 0, flame: 0, smoke: 0, resolved: false, tier: 0, milestones: [] };
/** Offline exports forbid fetch. Decode their embedded data URLs locally. */
export async function audioBytes(src: string): Promise<ArrayBuffer> {
  if (src.startsWith('data:')) {
    const raw = atob(src.slice(src.indexOf(',') + 1)), bytes = Uint8Array.from(raw, c => c.charCodeAt(0)); return bytes.buffer;
  }
  const response = await fetch(src); if (!response.ok) throw new Error(`Audio ${response.status}: ${src}`); return response.arrayBuffer();
}
export class ResponseAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private peakLimit: WaveShaperNode | null = null;
  private resultGain: GainNode | null = null;
  private resultBuffers = new Map<string, AudioBuffer>();
  private resultSeen = false;
  private resultPlaying = false;
  private resultTimer: ReturnType<typeof setTimeout> | null = null;
  private awaitingReplayFrame = false;
  private buses = new Map<AudioBus, GainNode>();
  private buffers = new Map<string, AudioBuffer>();
  private loops = new Map<string, Playing>();
  private sfx = new Set<Playing>();
  private lastCharacter = -Infinity;
  private characterCue = '';
  private characterPlays = 0;
  private timeline: CueTimeline;
  private frame = empty;
  private settings = { ...defaultAudioSettings };
  private loading: Promise<void> | null = null;
  private ready = false;
  private pending: { cue: Cue; at: number }[] = [];
  private disposed = false;
  private hidden = false;
  private paused = true;
  private missing = new Set<string>();
  private lastCue = '';
  private lastPickup = -Infinity;
  constructor(private readonly profile: CueProfile = kitchenCues) { this.timeline = new CueTimeline(profile); }
  private allows(bus: string) { return bus !== 'character' || this.profile.characterEnabled !== false; }
  async unlock() {
    if (this.disposed) return;
    try {
      if (!this.ctx) {
        this.ctx = takeLevelAudioContext(); const c = this.ctx;
        this.master = c.createGain(); this.master.gain.value = 0;
        const limiter = c.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.knee.value = 10; limiter.ratio.value = 8; limiter.attack.value = .003; limiter.release.value = .2;
        this.analyser = c.createAnalyser(); this.analyser.fftSize = 256;
        this.master.connect(limiter); this.peakLimit = connectSfxPeakLimit(c, limiter, this.analyser); this.analyser.connect(c.destination);
        this.resultGain = c.createGain(); this.resultGain.gain.value = 0;
        this.resultGain.connect(this.peakLimit ?? this.analyser);
        for (const key of ['music', 'ambience', 'sfx', 'character'] as const) { const g = c.createGain(); g.gain.value = 0; g.connect(this.master); this.buses.set(key, g); }
        this.loading = Promise.all(Object.entries(assets).map(async ([id, a]) => {
          if (!this.allows(a.bus)) return;
          try { const bytes = await audioBytes(a.src); if (!this.disposed) { const buffer = await c.decodeAudioData(bytes); if (!this.disposed) {
            if (a.bus === 'sfx') for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
              const samples = buffer.getChannelData(channel); samples.set(responseSfxSamples(id, samples, buffer.sampleRate));
            }
            this.buffers.set(id, buffer);
          } } }
          catch { if (!this.disposed) this.missing.add(id); }
        })).then(() => { if (!this.disposed) { this.ready = true; this.startLoops(); } });
      }
      // Called synchronously from a gesture before the first await.
      await this.ctx.resume(); await this.loading;
      if (!this.disposed) this.update(this.frame);
    } catch { /* Gameplay still works on devices with no audio device. */ }
  }
  private make(id: string, bus: AudioBus, loop = false): Playing | null {
    const c = this.ctx, buffer = this.buffers.get(id); if (!c || !buffer || this.disposed || !this.allows(bus) || !this.allows(assets[id]?.bus)) return null;
    const source = c.createBufferSource(), gain = c.createGain(); source.buffer = buffer; source.loop = loop;
    gain.gain.value = loop ? 0 : bus === 'sfx' ? 1 / (kitchenExperience.audio.master * defaultAudioSettings.sfx) : 1;
    source.connect(gain); gain.connect(this.buses.get(bus)!); return { source, gain, id };
  }
  private startLoops() {
    if (!this.ctx || this.loops.size) return;
    const when = this.ctx.currentTime + .035;
    for (const [id, a] of Object.entries(assets)) if (a.loop) { const p = this.make(id, a.bus as AudioBus, true); if (p) { this.loops.set(id, p); p.source.start(when); } }
  }
  private ramp(param: AudioParam, value: number, seconds = .15) {
    if (!this.ctx) return; const t = this.ctx.currentTime; param.cancelScheduledValues(t); param.setTargetAtTime(value, t, seconds);
  }
  setSettings(settings: AudioSettings) {
    this.settings = { ...settings };
    if (settings.muted) this.stopOneShots();
    if (settings.muted || settings.sfx <= 0) this.cancelResult();
    if (this.resultSeen) this.update(this.frame); else this.mix();
  }
  setHidden(hidden: boolean) { this.hidden = hidden; this.update(this.frame); }
  update(frame: AudioFrame) {
    if (this.disposed) return;
    this.frame = frame;
    if (!frame.result) this.awaitingReplayFrame = false;
    if (frame.result && !this.resultSeen && !this.awaitingReplayFrame) {
      this.resultSeen = true; this.stopOneShots();
      // Complete kitchen frames are inactive. Only the explicit pause flag,
      // hidden state and user audio settings can suppress this short tail.
      if (!frame.paused && !this.hidden && !this.settings.muted && this.settings.sfx > 0 && this.ctx?.state === 'running') {
        this.resultPlaying = true; this.playResult(frame.result);
        this.resultTimer = setTimeout(() => { this.cancelResult(); this.update(this.frame); }, 1400);
      }
    }
    if (frame.paused || this.hidden || this.settings.muted || this.settings.sfx <= 0) this.cancelResult();
    const paused = !!frame.paused || this.hidden || (frame.result ? !this.resultPlaying : !frame.active);
    if (paused && !this.paused) this.stopOneShots();
    this.paused = paused;
    if (this.ctx && paused && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
    if (this.ctx && !paused && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    if (!paused && !frame.result && this.ctx?.state === 'running') {
      // In managed games "evacuated" precedes the actual complete phase.
      // Consume that milestone, but reserve the result jingle for complete.
      const cues = this.timeline.advance(frame).filter(cue => frame.result === undefined || cue.sound !== 'success');
      this.pending.push(...cues.map(cue => ({ cue, at: frame.elapsed }))); this.pending = this.pending.slice(-12);
      if (this.ready) {
        const pending = this.pending; this.pending = [];
        if (!this.settings.muted) for (const { cue, at } of pending) if (frame.elapsed - at < 1800) { if (cue.sound) this.play(cue.sound); if (cue.character) this.character(cue.character); }
      }
    }
    this.mix();
  }
  private mix() {
    if (!this.master) return;
    const active = !this.paused && !this.settings.muted, f = this.frame, duck = this.sfx.size ? kitchenExperience.audio.duck : 1;
    this.ramp(this.master.gain, active && !f.result ? kitchenExperience.audio.master : 0, .045);
    if (this.resultGain) this.ramp(this.resultGain.gain, active && this.resultPlaying ? clamp01(this.settings.sfx) / defaultAudioSettings.sfx : 0, .008);
    for (const [key, bus] of this.buses) this.ramp(bus.gain, this.allows(key) && !f.result ? clamp01(this.settings[key]) * (key === 'music' ? duck : 1) : 0, key === 'sfx' ? .008 : .15);
    const levels: Record<string, number> = {
      'music-bed': f.resolved ? 0 : .48,
      'music-pulse': f.resolved ? 0 : .12 + f.intensity * .65,
      'music-high': f.resolved ? 0 : Math.max(0, f.intensity - .45) * 1.3,
      fire: f.resolved ? 0 : clamp01(f.flame / 2.65) * .85,
      draft: f.resolved ? 0 : .09 + f.smoke * .2,
      breathing: f.resolved ? 0 : Math.max(0, f.intensity - .3) * .5,
    };
    for (const [id, p] of this.loops) this.ramp(p.gain.gain, f.result ? 0 : levels[id] ?? 0, f.resolved ? .35 : .12);
    // One common rate for the three synchronized stems; never stretch Foley.
    const tempo = Math.max(.8, Math.min(1.35, f.tempo ?? 1));
    for (const [id, p] of this.loops) if (assets[id].bus === 'music') this.ramp(p.source.playbackRate, tempo, .3);
    const breath = this.loops.get('breathing'); if (breath) this.ramp(breath.source.playbackRate, .8 + f.intensity * .7, .25);
  }
  play(id: string) {
    if (!this.allows(assets[id]?.bus) || this.frame.result || this.paused || this.settings.muted || this.ctx?.state !== 'running') return;
    if (this.sfx.size >= kitchenExperience.audio.maxSfx) this.stop(this.sfx.values().next().value!);
    const p = this.make(id, assets[id]?.bus === 'character' ? 'character' : 'sfx'); if (!p) return;
    this.lastCue = id; this.sfx.add(p); p.source.onended = () => { this.sfx.delete(p); p.source.disconnect(); p.gain.disconnect(); this.mix(); }; p.source.start(); this.mix();
  }
  private playResult(kind: Exclude<ApprovedSound, 'button'>) {
    const c = this.ctx; if (!c || !this.resultGain) return;
    let buffer = this.resultBuffers.get(kind);
    if (!buffer) {
      const samples = approvedSoundSamples(kind);
      buffer = c.createBuffer(1, samples.length, 44100); buffer.getChannelData(0).set(samples);
      this.resultBuffers.set(kind, buffer);
    }
    const source = c.createBufferSource(), gain = c.createGain();
    source.buffer = buffer; gain.gain.value = 1; source.connect(gain); gain.connect(this.resultGain);
    const p = { source, gain, id: kind }; this.sfx.add(p); this.lastCue = kind;
    source.onended = () => { this.sfx.delete(p); source.disconnect(); gain.disconnect(); this.mix(); };
    // The dedicated bus preserves the approved PCM level, without Foley makeup.
    this.paused = false; this.mix(); source.start();
  }
  private cancelResult() {
    if (this.resultTimer) clearTimeout(this.resultTimer); this.resultTimer = null;
    if (!this.resultPlaying) return;
    this.resultPlaying = false; this.stopOneShots();
  }
  pickup() { const t = this.ctx?.currentTime ?? 0; if (t - this.lastPickup > .12) { this.lastPickup = t; this.play('pickup'); } }
  private character(id: string) {
    if (!this.allows('character')) return;
    const c=this.ctx; if(!c || c.currentTime-this.lastCharacter<1.2)return;
    if (!this.buffers.has(id) || this.settings.muted || this.paused) return;
    this.lastCharacter=c.currentTime;this.characterCue=id;this.characterPlays++;this.play(id);
  }
  private stop(p: Playing) { p.source.onended = null; try { p.source.stop(); } catch {} p.source.disconnect(); p.gain.disconnect(); this.sfx.delete(p); }
  private stopOneShots() { this.pending = []; for (const p of this.sfx) this.stop(p); }
  reset() { this.cancelResult(); this.resultSeen = false; this.awaitingReplayFrame = true; this.stopOneShots(); this.timeline.reset(); this.lastCharacter = -Infinity; this.lastPickup = -Infinity; this.lastCue = ''; this.characterCue = ''; this.characterPlays = 0; }
  status() {
    const data = new Float32Array(256); if (this.analyser && this.ctx?.state === 'running' && !this.settings.muted && !this.paused) this.analyser.getFloatTimeDomainData(data);
    return { state: this.ctx?.state ?? 'locked', loaded: this.buffers.size, missing: [...this.missing], loops: this.loops.size, sfx: this.sfx.size, lastCue: this.lastCue, characterCue: this.characterCue, characterPlays: this.characterPlays, musicRate: this.frame.tempo ?? 1, rms: Math.sqrt(data.reduce((a, b) => a + b * b, 0) / data.length) };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.cancelResult(); this.stopOneShots(); for (const p of this.loops.values()) this.stop(p); this.loops.clear(); this.buffers.clear(); this.resultBuffers.clear();
    for (const bus of this.buses.values()) bus.disconnect(); this.buses.clear(); this.master?.disconnect(); this.analyser?.disconnect(); this.resultGain?.disconnect(); this.resultGain = null; this.peakLimit?.disconnect(); this.peakLimit = null;
    if (this.ctx) void this.ctx.close().catch(() => undefined); this.ctx = null;
  }
}
