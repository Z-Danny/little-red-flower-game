import { hasAll } from './engine';
import { takeLevelAudioContext } from '../level-audio-context';
import { presentationFrame, presentationPressure, unit } from './presentation';
import type { LevelPackage, Run } from './schema';
import { emergencySound } from './emergency-sound';
import { floodAmbientMix, floodSound, synthesiseFloodLoop, usesFloodWindowProfile } from './flood-sound';
import { connectSfxPeakLimit, normaliseSfx } from '../audio/sfx-levels';
import { approvedSoundSamples, type ApprovedSound } from '../audio/result-samples';

export type PracticeAudioSettings = { music: number; ambient: number; sfx: number; muted: boolean };
export const defaultPracticeAudioSettings: PracticeAudioSettings = { music: .12, ambient: .18, sfx: .22, muted: false };
export type PracticeAudioStatus = { state: string; loops: number; sfx: number; played: number; lastCue: string; rms: number };
/** Audio-only adaptation; existing practice themes keep their original score. */
export type PracticeAudioOptions = { music?: (sampleRate: number) => Float32Array; suspendWhenMuted?: boolean; referenceSfx?: number };
type Theme = NonNullable<NonNullable<LevelPackage['skin']['presentation']>['audio']>['theme'];
type Cue = { id: string; event: string };
const themes: Record<Theme, { bpm: number; notes: number[]; cutoff: number; hum: number }> = {
  quake: { bpm: 80, notes: [110, 130.81, 146.83, 130.81], cutoff: 150, hum: 43 },
  outdoor: { bpm: 74, notes: [130.81, 164.81, 146.83, 196], cutoff: 550, hum: 0 },
  collapse: { bpm: 60, notes: [98, 116.54, 130.81, 98], cutoff: 180, hum: 37 },
  medical: { bpm: 72, notes: [130.81, 155.56, 174.61, 155.56], cutoff: 300, hum: 0 },
  water: { bpm: 88, notes: [110, 146.83, 130.81, 164.81], cutoff: 420, hum: 0 },
  flood: { bpm: 76, notes: [98, 130.81, 146.83, 130.81], cutoff: 300, hum: 0 },
  lift: { bpm: 60, notes: [146.83, 164.81, 196, 164.81], cutoff: 480, hum: 50 },
  electric: { bpm: 76, notes: [110, 123.47, 146.83, 123.47], cutoff: 160, hum: 60 },
  fire: { bpm: 86, notes: [98, 116.54, 146.83, 116.54], cutoff: 850, hum: 39 },
};
const hash = (s: string) => { let n = 2166136261; for (const ch of s) { n ^= ch.charCodeAt(0); n = Math.imul(n, 16777619); } return n >>> 0; };
const noise = (seed: number) => { let state = seed || 1; return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2147483648 - 1; }; };
export function cueRecipe(id: string) {
  const category = /water|splash|buoy|rain/.test(id) ? 'water' : /cloth|gauze|glove|shoe|rustle|seal/.test(id) ? 'cloth'
    : /step|walk|position/.test(id) ? 'step' : /door|grip|tap|breaker|click|motor|press/.test(id) ? 'mechanical'
      : /danger|error|inrush|wrong|reject/.test(id) ? 'warning' : /complete|success|finish/.test(id) ? 'complete'
        : /call|connect|report|message|radio|signal/.test(id) ? 'signal' : /wait|care|calm/.test(id) ? 'waiting'
          : /pickup/.test(id) ? 'pickup' : /bounce|return/.test(id) ? 'bounce' : 'tone';
  return { category, seed: hash(id), duration: category === 'complete' ? .75 : category === 'step' ? .5 : category === 'warning' ? .65 : category === 'cloth' || category === 'water' ? .48 : .3,
    frequency: 240 + hash(id) % 360 };
}
/** Deterministic, original non-speech PCM; arbitrary stable cue IDs never go missing. */
export function synthesiseCue(id: string, sampleRate = 22050): Float32Array {
  const flood = floodSound(id, sampleRate); if (flood) return flood;
  const emergency=emergencySound(id,sampleRate);if(emergency)return emergency;
  const recipe = cueRecipe(id), frames = Math.ceil(recipe.duration * sampleRate), data = new Float32Array(frames), random = noise(recipe.seed);
  let filtered = 0, mean = 0;
  for (let i = 0; i < frames; i++) {
    const time = i / sampleRate, p = i / frames, attack = Math.min(1, time / .02), release = Math.min(1, (recipe.duration - time) / .045);
    filtered = filtered * .72 + random() * .28;
    const pulse = recipe.category === 'step' ? Math.exp(-((time % .18) * 30)) : 1;
    const sequence = recipe.category === 'complete' ? Math.floor(p * 4) : recipe.category === 'signal' ? Math.floor(p * 2) : 0;
    const f = recipe.category === 'warning' ? 170 + Math.sin(time * 18) * 22 : recipe.frequency * [1, 1.25, 1.5, 2][sequence % 4];
    const tone = Math.sin(Math.PI * 2 * f * time) * Math.exp(-p * 3.5);
    let value = recipe.category === 'cloth' ? filtered * .5 : recipe.category === 'water' ? filtered * .5 + Math.sin(time * 90) * .08
      : recipe.category === 'mechanical' ? filtered * .3 * Math.exp(-p * 9) + tone * .18
        : recipe.category === 'step' ? filtered * .4 * pulse : recipe.category === 'warning' ? tone * .28 + filtered * .06 : tone * .32;
    value *= attack * release; data[i] = value; mean += value;
  }
  mean /= frames;
  for (let i = 0; i < frames; i++) data[i] = Math.max(-.7, Math.min(.7, data[i] - mean));
  return data;
}
const characterCue = (id: string) => /nonverbal|heartbeat|breath|gasp|fear-|relief/.test(id);
// Native compressor makeup gain is measured in scripts/measure-sfx-levels.mjs.
export const practiceSfxCalibrationGain = .7;
export function practiceSfxTarget(id: string): number {
  if (/complete|success|finish|rescue-arrival/.test(id)) return .09;
  if (/danger|warning|error|wrong|impact|alarm/.test(id)) return .085;
  if (/pickup|bounce|return|goal|soft-tap|waiting|settle|scene-ready/.test(id)) return .065;
  return .08;
}
/** Character recipes and all continuous beds retain their authored gains. */
export function practiceSfxSamples(id: string, sampleRate = 22050): Float32Array {
  const samples = synthesiseCue(id, sampleRate);
  return characterCue(id) ? samples : normaliseSfx(samples, { targetRms: practiceSfxTarget(id), sampleRate });
}
export class PracticeCueTimeline {
  private started = false;
  private seenActions = new Set<string>();
  private goals = new Set<string>();
  private stages = new Set<string>();
  private waiting = false;
  private completed = false;
  private failed=false;
  private emergencyTicks=new Map<string,number>();
  private rescuePlayed=false;
  constructor(private readonly pack: LevelPackage) {}
  reset() { this.started = false; this.seenActions.clear(); this.goals.clear(); this.stages.clear(); this.waiting = false; this.completed = false; this.failed=false;this.emergencyTicks.clear();this.rescuePlayed=false; }
  advance(run: Run): Cue[] {
    const result: Cue[] = [], cues = this.pack.skin.presentation?.audio?.cues ?? {};
    const emit = (event: string, fallback: string) => result.push({ event, id: cues[event] ?? fallback });
    if(run.phase==='failed'){
      if(!this.failed){this.failed=true;emit(run.failure?.rule ?? 'failure',cues.failure ?? 'smoke-warning');}
      return result;
    }
    if (!this.started) { this.started = true; emit('opening', 'scene-ready'); }
    const emergency=this.pack.skin.presentation?.audio?.emergency;
    if(emergency){
      const periodic=(key:string,id:string,period:number)=>{const beat=Math.floor(run.elapsed/period);if(beat>0&&this.emergencyTicks.get(key)!==beat){this.emergencyTicks.set(key,beat);result.push({event:key,id});}};
      if(run.phase==='playing'){
        if(emergency.alarm && !(emergency.alarmUntil?.length && hasAll(run.resolved,emergency.alarmUntil)))periodic('alarm',emergency.alarm,4500);
        const calm=hasAll(run.resolved,this.pack.skin.presentation!.audio!.calmWhen??[]);
        if(emergency.heartbeat)periodic('heartbeat',emergency.heartbeat,calm?1700:900);
        if(emergency.cough && !(emergency.coughUntil?.length && hasAll(run.resolved,emergency.coughUntil)))periodic('cough',emergency.cough,6500);
      }
      if(emergency.rescue && run.phase==='settling'&&run.settleAge>=(emergency.rescueAfterMs??500)&&!this.rescuePlayed){this.rescuePlayed=true;result.push({event:'rescue',id:emergency.rescue});}
    }
    if (run.action) {
      const action = run.action, key = `${action.rule ?? 'bounce'}:${action.source}:${Math.round(run.elapsed - action.age)}`;
      const rule = this.pack.rules.interactions.find(rule => rule.id === action.rule);
      const threshold = rule?.outcome === 'danger' ? 0 : .3;
      if (action.age / action.duration >= threshold && !this.seenActions.has(key)) {
        this.seenActions.add(key); if (this.seenActions.size > 128) this.seenActions.delete(this.seenActions.values().next().value!);
        if (rule?.outcome === 'danger') emit('danger', 'danger-demonstration');
        emit(rule?.id ?? 'bounce', rule ? `${rule.id}-${rule.outcome === 'correct' ? 'contact' : rule.outcome === 'danger' ? 'error' : 'return'}` : 'invalid-return');
      }
    }
    const newGoals = run.resolved.filter(goal => !this.goals.has(goal));
    for (const goal of newGoals) this.goals.add(goal);
    if (newGoals.length) emit('goal', 'goal-confirm');
    for (const stage of run.stages ?? []) if (!this.stages.has(stage)) { this.stages.add(stage); emit(stage, 'scene-transition'); }
    const calmWhen = this.pack.skin.presentation?.audio?.calmWhen;
    if (!this.waiting && (run.phase === 'settling' || (!!calmWhen?.length && hasAll(run.resolved, calmWhen)))) {
      this.waiting = true; emit('waiting', 'waiting-established');
    }
    if (!this.completed && run.phase === 'complete') { this.completed = true; if(!run.escaped)emit('complete', 'training-complete'); }
    return result;
  }
}

type Playing = { source: AudioScheduledSourceNode; gain: GainNode };
export class PracticeAudioSession {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private peakLimit: WaveShaperNode | null = null;
  private resultGain: GainNode | null = null;
  private resultSeen = false;
  private resultPlaying = false;
  private resultTimer: ReturnType<typeof setTimeout> | null = null;
  private awaitingReplayFrame = false;
  private buses = new Map<'music' | 'ambient' | 'sfx', GainNode>();
  private loops: Playing[] = [];
  private oneShots = new Set<Playing>();
  private cueBuffers = new Map<string, AudioBuffer>();
  private settings = { ...defaultPracticeAudioSettings };
  private run: Run | null = null;
  private active = false;
  private hidden = false;
  private disposed = false;
  private timeline: PracticeCueTimeline;
  private ambientLevel: GainNode | null = null;
  private floodLevels: { flood: GainNode; rain: GainNode } | null = null;
  private lastPickup = -Infinity;
  private played = 0;
  private lastCue = '';
  private resuming: Promise<void> | null = null;
  constructor(private readonly pack: LevelPackage, private readonly makeContext: () => AudioContext = takeLevelAudioContext, private readonly options: PracticeAudioOptions = {}) { this.timeline = new PracticeCueTimeline(pack); }
  private ramp(param: AudioParam, value: number, seconds = .08) {
    const t = this.context?.currentTime ?? 0; param.cancelScheduledValues(t); param.setTargetAtTime(value, t, seconds);
  }
  private buffer(data: Float32Array, sampleRate = 22050) {
    const buffer = this.context!.createBuffer(1, data.length, sampleRate); buffer.getChannelData(0).set(data); return buffer;
  }
  private start(source: AudioScheduledSourceNode, bus: AudioNode, gainValue: number, loop: boolean): Playing {
    const gain = this.context!.createGain(); gain.gain.value = gainValue; source.connect(gain); gain.connect(bus);
    const sound = { source, gain };
    if (loop) this.loops.push(sound);
    else { this.oneShots.add(sound); source.onended = () => { this.oneShots.delete(sound); source.disconnect(); gain.disconnect(); this.mix(); }; }
    source.start(); return sound;
  }
  private buildLoops(theme: Theme) {
    const c = this.context!, profile = themes[theme], sr = 22050, duration = 8 * 60 / profile.bpm, music = this.options.music?.(sr) ?? new Float32Array(Math.ceil(duration * sr));
    for (let beat = 0; !this.options.music && beat < 8; beat++) {
      const start = Math.floor(beat * 60 / profile.bpm * sr), f = profile.notes[beat % profile.notes.length];
      for (let i = 0; i < Math.min(sr, music.length - start); i++) {
        const t = i / sr, env = Math.min(1, t / .015) * Math.exp(-t * 6);
        music[start + i] += (Math.sin(t * f * Math.PI * 2) + Math.sin(t * f * Math.PI * 4) * .2) * env * .22;
      }
    }
    if (!this.options.music) for (let i = 0; i < Math.min(440, music.length); i++) music[music.length - 1 - i] *= i / 440;
    const musicSource = c.createBufferSource(); musicSource.buffer = this.buffer(music); musicSource.loop = true; this.start(musicSource, this.buses.get('music')!, 1, true);
    if (usesFloodWindowProfile(this.pack.skin.presentation?.audio?.ambientProfile)) {
      const flood = c.createGain(), rain = c.createGain();
      flood.gain.value = 0; rain.gain.value = 0;
      flood.connect(this.buses.get('ambient')!); rain.connect(this.buses.get('ambient')!);
      this.floodLevels = { flood, rain };
      for (const [kind, level] of [['flood-roar', flood], ['rain-window', rain]] as const) {
        const source = c.createBufferSource(); source.buffer = this.buffer(synthesiseFloodLoop(kind, sr)); source.loop = true;
        this.start(source, level, 1, true);
      }
      return;
    }
    const random = noise(hash(theme)), noiseData = new Float32Array(sr * 2);
    for (let i = 0; i < noiseData.length; i++) noiseData[i] = random() * (theme === 'medical' ? .06 : .45);
    // Crossfade the loop boundary to avoid a periodic click.
    const blend = 440; for (let i = 0; i < blend; i++) noiseData[noiseData.length - blend + i] = noiseData[noiseData.length - blend + i] * (1 - i / blend) + noiseData[i] * i / blend;
    const ambientSource = c.createBufferSource(); ambientSource.buffer = this.buffer(noiseData); ambientSource.loop = true;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = profile.cutoff; filter.Q.value = .5;
    this.ambientLevel = c.createGain(); this.ambientLevel.gain.value = .3; this.ambientLevel.connect(this.buses.get('ambient')!); filter.connect(this.ambientLevel);
    this.start(ambientSource, filter, 1, true);
    if (profile.hum) { const hum = c.createOscillator(); hum.type = 'sine'; hum.frequency.value = profile.hum; this.start(hum, this.ambientLevel, .024, true); }
  }
  async unlock() {
    if (this.disposed || !this.pack.skin.presentation?.audio || this.options.suspendWhenMuted && this.settings.muted) return;
    try {
      if (!this.context) {
        this.context = this.makeContext(); const c = this.context;
        this.master = c.createGain(); this.master.gain.value = 0;
        const limiter = c.createDynamicsCompressor(); limiter.threshold.value = -15; limiter.knee.value = 8; limiter.ratio.value = 8; limiter.attack.value = .004; limiter.release.value = .16;
        this.analyser = c.createAnalyser(); this.analyser.fftSize = 256;
        this.master.connect(limiter); this.peakLimit = connectSfxPeakLimit(c, limiter, this.analyser); this.analyser.connect(c.destination);
        this.resultGain = c.createGain(); this.resultGain.gain.value = 0;
        this.resultGain.connect(this.peakLimit ?? this.analyser);
        for (const key of ['music','ambient','sfx'] as const) { const bus = c.createGain(); bus.gain.value = 0; bus.connect(this.master); this.buses.set(key, bus); }
        this.buildLoops(this.pack.skin.presentation.audio.theme);
      }
      // Creation/resume is synchronously initiated only by the user gesture API.
      await this.context.resume(); if (!this.disposed && this.run) this.update(this.run, this.active);
    } catch { /* Audio unavailable is not a gameplay failure. */ }
  }
  update(run: Run, active: boolean) {
    if (this.disposed) return;
    this.run = run; this.active = active;
    const terminal = run.phase === 'complete' || run.phase === 'failed';
    if (!terminal) this.awaitingReplayFrame = false;
    if (terminal && !this.resultSeen && !this.awaitingReplayFrame) {
      this.resultSeen = true; this.timeline.advance(run); this.stopOneShots();
      if (!run.escaped && active && !this.hidden && !this.settings.muted && this.settings.sfx > 0 && this.context?.state === 'running') {
        this.resultPlaying = true;
        this.playResult(run.phase === 'failed' ? 'failure' : 'victory');
        this.resultTimer = setTimeout(() => { this.cancelResult(); if (this.run) this.update(this.run, this.active); }, 1400);
      }
    }
    if (!active || this.hidden || this.settings.muted || this.settings.sfx <= 0) this.cancelResult();
    const canPlay = active && !this.hidden && !(this.options.suspendWhenMuted && this.settings.muted) && (!terminal || this.resultPlaying);
    // Consume muted events so unmuting never replays old interactions in a burst.
    if (!terminal && active && !this.hidden && this.options.suspendWhenMuted && this.settings.muted) this.timeline.advance(run);
    if (this.context) {
      if (!canPlay) { this.stopOneShots(); if (this.context.state === 'running') void this.context.suspend().catch(() => undefined); }
      else if (this.context.state === 'suspended' && !this.resuming) {
        this.resuming = this.context.resume().then(() => {
          this.resuming = null; if (!this.disposed && this.run) this.update(this.run, this.active);
        }).catch(() => { this.resuming = null; });
      }
      if (canPlay && !terminal && this.context.state === 'running') for (const cue of this.timeline.advance(run)) this.play(cue.id);
    }
    this.mix();
  }
  setSettings(settings: PracticeAudioSettings) {
    this.settings = { music: unit(settings.music), ambient: unit(settings.ambient), sfx: unit(settings.sfx), muted: !!settings.muted };
    if (this.settings.muted) this.stopOneShots();
    if (this.resultPlaying && (this.settings.muted || this.settings.sfx <= 0)) this.cancelResult();
    if ((this.options.suspendWhenMuted || this.resultSeen) && this.run) this.update(this.run, this.active); else this.mix();
  }
  setHidden(hidden: boolean) { this.hidden = hidden; if (this.run) this.update(this.run, this.active); }
  private mix() {
    if (!this.context || !this.master) return;
    const terminal = this.run?.phase === 'complete' || this.run?.phase === 'failed';
    const audible = this.active && !this.hidden && !this.settings.muted;
    this.ramp(this.master.gain, audible && !terminal ? (this.pack.skin.presentation?.audio?.emergency?.alarm ? .65 : .35) : 0, .025);
    if (this.resultGain) this.ramp(this.resultGain.gain, audible && this.resultPlaying ? this.settings.sfx / Math.max(.01, this.options.referenceSfx ?? defaultPracticeAudioSettings.sfx) : 0, .008);
    const calm = !!this.run && (!!this.pack.skin.presentation?.audio?.calmWhen?.length && hasAll(this.run.resolved, this.pack.skin.presentation.audio.calmWhen) || this.run.phase !== 'playing');
    const pressure = this.run ? presentationPressure(this.pack, this.run) : 0;
    if (this.floodLevels) {
      const levels = floodAmbientMix(pressure, calm);
      this.ramp(this.floodLevels.flood.gain, levels.flood, .3);
      this.ramp(this.floodLevels.rain.gain, levels.rain, .22);
    }
    for (const [key, bus] of this.buses) this.ramp(bus.gain, (terminal ? 0 : this.settings[key]) * (key === 'music' ? (this.oneShots.size ? .45 : 1) * (calm ? .5 : .7 + pressure * .3) : 1), key === 'sfx' ? .008 : .08);
    const theme = this.pack.skin.presentation?.audio?.theme;
    const frames = this.run ? presentationFrame(this.pack, this.run) : [];
    const relevant = (frame: { kind: string }) => theme === 'electric' ? frame.kind === 'machine' : theme === 'water' || theme === 'flood' ? frame.kind === 'water' || frame.kind === 'rain' : theme === 'quake' || theme === 'collapse' ? frame.kind === 'dust' : theme === 'fire' ? frame.kind === 'smoke' || frame.kind === 'glow' : false;
    const matching = frames.filter(relevant), configured = this.pack.skin.presentation?.effects.some(relevant);
    const level = configured ? matching.reduce((max, effect) => Math.max(max, effect.intensity), 0) : theme === 'electric' ? 0 : theme === 'lift' ? .2 : .2 + pressure * .2;
    if (this.ambientLevel) this.ramp(this.ambientLevel.gain, Math.min(1, level), .18);
  }
  play(id: string) {
    const c = this.context;
    if (!c || c.state !== 'running' || this.disposed || !this.active || this.hidden || this.settings.muted || this.run?.phase === 'complete' || this.run?.phase === 'failed') return;
    if (/(?:voice|speech|tts|narrat)/i.test(id)) return;
    while (this.oneShots.size >= 5) this.stop(this.oneShots.values().next().value!);
    let buffer = this.cueBuffers.get(id);
    if (!buffer) { buffer = this.buffer(practiceSfxSamples(id)); if (this.cueBuffers.size >= 96) this.cueBuffers.delete(this.cueBuffers.keys().next().value!); this.cueBuffers.set(id, buffer); }
    const masterLevel = this.pack.skin.presentation?.audio?.emergency?.alarm ? .65 : .35;
    const reference = this.options.referenceSfx ?? defaultPracticeAudioSettings.sfx;
    const calibratedGain = characterCue(id) ? 1 : practiceSfxCalibrationGain / (masterLevel * Math.max(.01, reference));
    const source = c.createBufferSource(); source.buffer = buffer; this.start(source, this.buses.get('sfx')!, calibratedGain, false);
    this.lastCue = id; this.played++; this.mix();
  }
  private playResult(kind: Exclude<ApprovedSound, 'button'>) {
    const c = this.context; if (!c || !this.resultGain) return;
    const key = `approved:${kind}`;
    let buffer = this.cueBuffers.get(key);
    if (!buffer) { buffer = this.buffer(approvedSoundSamples(kind), 44100); this.cueBuffers.set(key, buffer); }
    const source = c.createBufferSource(); source.buffer = buffer;
    this.mix(); this.start(source, this.resultGain, 1, false);
    this.lastCue = kind; this.played++;
  }
  private cancelResult() {
    if (this.resultTimer) clearTimeout(this.resultTimer); this.resultTimer = null;
    if (!this.resultPlaying) return;
    this.resultPlaying = false; this.stopOneShots();
  }
  pickup() { const t = this.context?.currentTime ?? 0; if (t - this.lastPickup >= .12) { this.lastPickup = t; this.play(this.pack.skin.presentation?.audio?.cues.pickup ?? 'object-pickup'); } }
  private stop(sound: Playing) { sound.source.onended = null; try { sound.source.stop(); } catch {} sound.source.disconnect(); sound.gain.disconnect(); this.oneShots.delete(sound); }
  private stopOneShots() { for (const sound of [...this.oneShots]) this.stop(sound); }
  reset() { this.cancelResult(); this.resultSeen = false; this.awaitingReplayFrame = true; this.stopOneShots(); this.timeline.reset(); this.lastPickup = -Infinity; this.lastCue = ''; this.played = 0; }
  status(): PracticeAudioStatus {
    const data = new Float32Array(256);
    if (this.analyser && this.context?.state === 'running' && this.active && !this.hidden && !this.settings.muted) this.analyser.getFloatTimeDomainData(data);
    return { state: this.disposed ? 'closed' : this.context?.state ?? 'locked', loops: this.loops.length, sfx: this.oneShots.size, played: this.played, lastCue: this.lastCue,
      rms: Math.sqrt(data.reduce((sum, n) => sum + n * n, 0) / data.length) };
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.cancelResult(); this.stopOneShots();
    for (const loop of this.loops) this.stop(loop); this.loops = [];
    this.cueBuffers.clear(); this.ambientLevel?.disconnect();
    this.floodLevels?.flood.disconnect(); this.floodLevels?.rain.disconnect(); this.floodLevels = null;
    for (const bus of this.buses.values()) bus.disconnect(); this.buses.clear(); this.master?.disconnect(); this.analyser?.disconnect(); this.resultGain?.disconnect(); this.resultGain = null; this.peakLimit?.disconnect(); this.peakLimit = null;
    if (this.context) void this.context.close().catch(() => undefined); this.context = null;
  }
}
