import manifest from '@/content/response/audio-manifest.json';
import { kitchenExperience, clamp01 } from './pressure';
import { CueTimeline, type AudioFrame, type CueProfile, type Cue, kitchenCues } from './audio-cues';
export type AudioBus = 'music' | 'ambience' | 'sfx' | 'character';
export type AudioSettings = Record<AudioBus, number> & { muted: boolean };
export const defaultAudioSettings: AudioSettings = { music: .52, ambience: .68, sfx: .8, character: .65, muted: false };
type Asset = { src: string; bus: string; loop?: boolean };
type Playing = { source: AudioBufferSourceNode; gain: GainNode; id: string };
const assets = manifest.assets as Record<string, Asset>;
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
        this.ctx = new AudioContext(); const c = this.ctx;
        this.master = c.createGain(); this.master.gain.value = 0;
        const limiter = c.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.knee.value = 10; limiter.ratio.value = 8; limiter.attack.value = .003; limiter.release.value = .2;
        this.analyser = c.createAnalyser(); this.analyser.fftSize = 256;
        this.master.connect(limiter); limiter.connect(this.analyser); this.analyser.connect(c.destination);
        for (const key of ['music', 'ambience', 'sfx', 'character'] as const) { const g = c.createGain(); g.gain.value = 0; g.connect(this.master); this.buses.set(key, g); }
        this.loading = Promise.all(Object.entries(assets).map(async ([id, a]) => {
          if (!this.allows(a.bus)) return;
          try { const bytes = await audioBytes(a.src); if (!this.disposed) { const buffer = await c.decodeAudioData(bytes); if (!this.disposed) this.buffers.set(id, buffer); } }
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
    const source = c.createBufferSource(), gain = c.createGain(); source.buffer = buffer; source.loop = loop; gain.gain.value = loop ? 0 : 1;
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
  setSettings(settings: AudioSettings) { this.settings = { ...settings }; if (settings.muted) this.stopOneShots(); this.mix(); }
  setHidden(hidden: boolean) { this.hidden = hidden; this.update(this.frame); }
  update(frame: AudioFrame) {
    this.frame = frame;
    const paused = !frame.active || this.hidden;
    if (paused && !this.paused) this.stopOneShots();
    this.paused = paused;
    if (this.ctx && paused && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
    if (this.ctx && !paused && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    if (!paused && this.ctx?.state === 'running') {
      const cues = this.timeline.advance(frame);
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
    this.ramp(this.master.gain, active ? kitchenExperience.audio.master : 0, .045);
    for (const [key, bus] of this.buses) this.ramp(bus.gain, this.allows(key) ? clamp01(this.settings[key]) * (key === 'music' ? duck : 1) : 0);
    const levels: Record<string, number> = {
      'music-bed': f.resolved ? 0 : .48,
      'music-pulse': f.resolved ? 0 : .12 + f.intensity * .65,
      'music-high': f.resolved ? 0 : Math.max(0, f.intensity - .45) * 1.3,
      fire: f.resolved ? 0 : clamp01(f.flame / 2.65) * .85,
      draft: f.resolved ? 0 : .09 + f.smoke * .2,
      breathing: f.resolved ? 0 : Math.max(0, f.intensity - .3) * .5,
    };
    for (const [id, p] of this.loops) this.ramp(p.gain.gain, levels[id] ?? 0, f.resolved ? .35 : .12);
    // One common rate for the three synchronized stems; never stretch Foley.
    const tempo = Math.max(.8, Math.min(1.35, f.tempo ?? 1));
    for (const [id, p] of this.loops) if (assets[id].bus === 'music') this.ramp(p.source.playbackRate, tempo, .3);
    const breath = this.loops.get('breathing'); if (breath) this.ramp(breath.source.playbackRate, .8 + f.intensity * .7, .25);
  }
  play(id: string) {
    if (!this.allows(assets[id]?.bus) || this.paused || this.settings.muted || this.ctx?.state !== 'running') return;
    if (this.sfx.size >= kitchenExperience.audio.maxSfx) this.stop(this.sfx.values().next().value!);
    const p = this.make(id, assets[id]?.bus === 'character' ? 'character' : 'sfx'); if (!p) return;
    this.lastCue = id; this.sfx.add(p); p.source.onended = () => { this.sfx.delete(p); p.source.disconnect(); p.gain.disconnect(); this.mix(); }; p.source.start(); this.mix();
  }
  pickup() { const t = this.ctx?.currentTime ?? 0; if (t - this.lastPickup > .12) { this.lastPickup = t; this.play('pickup'); } }
  private character(id: string) {
    if (!this.allows('character')) return;
    const c=this.ctx; if(!c || c.currentTime-this.lastCharacter<1.2)return;
    if (!this.buffers.has(id) || this.settings.muted || this.paused) return;
    this.lastCharacter=c.currentTime;this.characterCue=id;this.characterPlays++;this.play(id);
  }
  private stop(p: Playing) { try { p.source.stop(); } catch {} p.source.disconnect(); p.gain.disconnect(); this.sfx.delete(p); }
  private stopOneShots() { this.pending = []; for (const p of this.sfx) this.stop(p); }
  reset() { this.stopOneShots(); this.timeline.reset(); this.lastCharacter = -Infinity; this.lastPickup = -Infinity; this.lastCue = ''; this.characterCue = ''; this.characterPlays = 0; }
  status() {
    const data = new Float32Array(256); if (this.analyser && this.ctx?.state === 'running' && !this.settings.muted && !this.paused) this.analyser.getFloatTimeDomainData(data);
    return { state: this.ctx?.state ?? 'locked', loaded: this.buffers.size, missing: [...this.missing], loops: this.loops.size, sfx: this.sfx.size, lastCue: this.lastCue, characterCue: this.characterCue, characterPlays: this.characterPlays, musicRate: this.frame.tempo ?? 1, rms: Math.sqrt(data.reduce((a, b) => a + b * b, 0) / data.length) };
  }
  dispose() {
    this.disposed = true; this.stopOneShots(); for (const p of this.loops.values()) this.stop(p); this.loops.clear(); this.buffers.clear();
    for (const bus of this.buses.values()) bus.disconnect(); this.buses.clear(); this.master?.disconnect(); this.analyser?.disconnect();
    if (this.ctx) void this.ctx.close().catch(() => undefined); this.ctx = null;
  }
}
