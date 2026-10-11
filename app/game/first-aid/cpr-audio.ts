import { reduceCpr, type CprEvent, type CprState } from './cpr-model';
import { approvedSoundSamples } from '../audio/result-samples';
import { connectSfxPeakLimit } from '../audio/sfx-levels';
import { practiceSfxSamples, practiceSfxCalibrationGain } from '../runtime/practice-audio';
import { takeLevelAudioContext } from '../level-audio-context';

export type CprCue = 'goal-confirm' | 'wrong-warning' | 'soft-tap' | 'medical-connect' | 'rescue-arrival' | 'victory';
/** Audio observes the existing reducer; it never changes scoring or rhythm timing. */
export function cprInputCue(state: CprState, event: CprEvent): CprCue | null {
  if (event.type === 'tick' || event.type === 'suspend' || event.type === 'finish') return null;
  const next = reduceCpr(state, event);
  if (next === state) return null;
  if ('correct' in event) return event.correct ? 'goal-confirm' : 'wrong-warning';
  if (event.type === 'tap') return next.pulseAt !== state.pulseAt ? 'soft-tap' : null;
  if (event.type === 'call' || event.type === 'aed') return 'medical-connect';
  return 'goal-confirm';
}

/** Shared practice PCM and the exact approved victory sample; no new music or speech. */
export class CprSound {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private limiter: WaveShaperNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buffers = new Map<CprCue, AudioBuffer>();
  private sources = new Map<AudioBufferSourceNode, GainNode>();
  private active = false;
  private muted = false;
  private hidden = false;
  private disposed = false;
  private epoch = 0;
  private pending: Promise<void> | null = null;
  private played = 0;
  private lastCue = '';
  constructor(private readonly makeContext: () => AudioContext = takeLevelAudioContext) {}
  private canPlay() { return !this.disposed && this.active && !this.muted && !this.hidden; }
  setPolicy(active: boolean, muted: boolean, hidden: boolean) {
    this.active = active; this.muted = muted; this.hidden = hidden;
    if (!this.canPlay()) {
      this.epoch++;
      for (const [source, gain] of [...this.sources]) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); gain.disconnect(); }
      this.sources.clear();
      if (this.context?.state === 'running') void this.context.suspend().catch(() => undefined);
    }
  }
  // Only called from a pointer/keyboard gesture. Resuming alone never replays old cues.
  unlock() {
    if (!this.canPlay()) return;
    try {
      if (!this.context) {
        const c = this.context = this.makeContext();
        this.output = c.createGain(); this.output.gain.value = 1;
        this.analyser = c.createAnalyser(); this.analyser.fftSize = 256;
        this.limiter = connectSfxPeakLimit(c, this.output, this.analyser);
        this.analyser.connect(c.destination);
      }
      this.pending = this.context.resume().catch(() => undefined);
    } catch { /* Sound is optional, gameplay remains usable. */ }
  }
  play(cue: CprCue) {
    if (!this.canPlay() || !this.context) return;
    const epoch = this.epoch;
    const start = () => {
      const c = this.context;
      if (!this.canPlay() || this.epoch !== epoch || !c || c.state !== 'running' || !this.output) return;
      let buffer = this.buffers.get(cue);
      if (!buffer) {
        const samples = cue === 'victory' ? approvedSoundSamples('victory') : practiceSfxSamples(cue);
        buffer = c.createBuffer(1, samples.length, cue === 'victory' ? 44100 : 22050);
        buffer.getChannelData(0).set(samples); this.buffers.set(cue, buffer);
      }
      if (this.sources.size >= 5) { const [first, gain] = this.sources.entries().next().value!; first.stop(); first.disconnect(); gain.disconnect(); this.sources.delete(first); }
      const source = c.createBufferSource(), gain = c.createGain();
      source.buffer = buffer; gain.gain.value = cue === 'victory' ? 1 : practiceSfxCalibrationGain;
      source.connect(gain); gain.connect(this.output); this.sources.set(source, gain);
      source.onended = () => { source.disconnect(); gain.disconnect(); this.sources.delete(source); };
      source.start(); this.played++; this.lastCue = cue;
    };
    if (this.context.state === 'running') start(); else void this.pending?.then(start);
  }
  get status() {
    const data = new Float32Array(256);
    if (this.canPlay() && this.context?.state === 'running') this.analyser?.getFloatTimeDomainData(data);
    return { state: this.disposed ? 'closed' : this.context?.state ?? 'locked', played: this.played, lastCue: this.lastCue, voices: this.sources.size, rms: Math.sqrt(data.reduce((sum,n) => sum+n*n,0)/data.length) };
  }
  dispose() {
    this.setPolicy(false, true, true); this.disposed = true;
    this.buffers.clear(); this.output?.disconnect(); this.limiter?.disconnect(); this.analyser?.disconnect();
    if (this.context) void this.context.close().catch(() => undefined); this.context = null;
  }
}
