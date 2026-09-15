import { approvedSoundSamples } from '@/app/game/audio/result-samples';
import type { PlantingCue } from '@/app/game/journey/planting-audio';
import { renderScore } from '@/app/game/audio/note-score';
import { connectSfxPeakLimit, sfxGain } from '@/app/game/audio/sfx-levels';

export type PlantingSoundStage = PlantingCue;
export type InterfaceCue = 'tap' | 'open' | 'close' | 'confirm';
type ScoredCue = InterfaceCue | 'hint' | PlantingCue;
type Cue = ScoredCue | 'button';
type Note = {
  frequency: number;
  end?: number;
  delay?: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
};
type Voice = { source: AudioScheduledSourceNode; gain: GainNode };

const notes: Record<ScoredCue, readonly Note[]> = {
  tap: [
    {
      frequency: 460,
      end: 340,
      duration: 0.09,
      gain: 0.024,
      type: 'triangle',
    },
  ],
  open: [
    {
      frequency: 392,
      end: 659,
      duration: 0.075,
      gain: 0.026,
      type: 'triangle',
    },
  ],
  close: [
    {
      frequency: 523,
      end: 330,
      duration: 0.068,
      gain: 0.022,
      type: 'triangle',
    },
  ],
  confirm: [
    { frequency: 523, duration: 0.075, gain: 0.025, type: 'triangle' },
    { frequency: 784, delay: 0.045, duration: 0.09, gain: 0.021 },
  ],
  hint: [
    { frequency: 659, end: 784, duration: 0.09, gain: 0.026 },
    { frequency: 988, delay: 0.09, duration: 0.11, gain: 0.025 },
  ],
  land: [
    { frequency: 180, end: 88, duration: 0.085, gain: 0.042, type: 'triangle' },
    { frequency: 340, end: 170, duration: 0.055, gain: 0.015 },
  ],
  sprout: [
    { frequency: 370, end: 740, duration: 0.12, gain: 0.038 },
    {
      frequency: 554,
      end: 830,
      delay: 0.065,
      duration: 0.085,
      gain: 0.018,
      type: 'triangle',
    },
  ],
  bloom: [
    { frequency: 523.25, duration: 0.17, gain: 0.026 },
    { frequency: 659.25, delay: 0.055, duration: 0.17, gain: 0.026 },
    { frequency: 783.99, delay: 0.11, duration: 0.17, gain: 0.026 },
    { frequency: 261.63, duration: 0.11, gain: 0.01, type: 'triangle' },
  ],
  count: [{ frequency: 1046.5, end: 1318.5, duration: 0.07, gain: 0.021 }],
  unlock: [
    { frequency: 392, end: 523, duration: 0.1, gain: 0.024, type: 'triangle' },
    {
      frequency: 523,
      end: 784,
      delay: 0.075,
      duration: 0.13,
      gain: 0.023,
      type: 'triangle',
    },
    { frequency: 1046.5, delay: 0.135, duration: 0.16, gain: 0.02 },
  ],
};

// Calibrate the complete phrase, including its envelope and overlapping notes.
const cueGain = Object.fromEntries(
  Object.entries(notes).map(([cue, score]) => [cue, sfxGain(renderScore(score), {
    targetRms: ['tap', 'open', 'close'].includes(cue) ? 0.08 : 0.095,
    peakLimit: 0.55,
  })]),
) as Record<ScoredCue, number>;

/** Short gesture-unlocked feedback. Every voice is owned and cancellable. */
export class RewardSound {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private buttonBuffer: AudioBuffer | null = null;
  private peakLimit: WaveShaperNode | null = null;
  private muted = false;
  private hidden = false;
  private paused = false;
  private disposed = false;
  private retiring = false;
  private retirementTimer: ReturnType<typeof setTimeout> | null = null;
  private retirementVisibility: (() => void) | null = null;
  private volume = 1;
  private epoch = 0;
  private policyVersion = 0;
  private settling: Promise<void> | null = null;
  private readonly voices = new Set<Voice>();
  private readonly lastRequested = new Map<string, number>();
  private scheduledCues = 0;
  private scheduledVoices = 0;
  private lastCue: Cue | null = null;
  private readonly cueCounts: Partial<Record<Cue, number>> = {};

  constructor(
    private readonly makeContext: () => AudioContext = () => new AudioContext(),
    private readonly isPageHidden: () => boolean = () =>
      typeof document !== 'undefined' && document.hidden,
    private readonly now: () => number = () => performance.now(),
  ) {}

  get status() {
    return {
      state: this.disposed
        ? 'disposed'
        : this.hidden || this.isPageHidden()
          ? 'hidden'
          : this.muted || this.volume === 0
            ? 'muted'
            : !this.context
              ? 'locked'
              : this.paused
                ? 'paused'
                : this.context.state === 'running'
                  ? 'ready'
                  : 'paused',
      muted: this.muted,
      volume: this.volume,
      scheduledCues: this.scheduledCues,
      scheduledVoices: this.scheduledVoices,
      activeVoices: this.voices.size,
      lastCue: this.lastCue,
      cueCounts: { ...this.cueCounts },
    };
  }

  setMuted(value: boolean) {
    if (this.disposed || value === this.muted) return;
    this.muted = value;
    this.policyVersion++;
    if (value) this.cancel();
    void this.syncContext();
  }

  setVolume(value: number) {
    if (this.disposed || !Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(1, value));
    this.policyVersion++;
    this.output?.gain.setValueAtTime(this.volume, this.context!.currentTime);
    if (this.volume === 0) this.cancel();
    void this.syncContext();
  }

  setHidden(value: boolean) {
    if (this.disposed || value === this.hidden) return;
    this.hidden = value;
    this.policyVersion++;
    if (value) this.cancel();
    void this.syncContext();
  }

  /** Call within the original pointer or keyboard event. Setters never create audio. */
  unlock() {
    if (
      this.disposed ||
      this.retiring ||
      this.muted ||
      this.volume === 0 ||
      this.hidden ||
      this.isPageHidden()
    )
      return;
    this.paused = false;
    this.policyVersion++;
    try {
      if (!this.context) {
        this.context = this.makeContext();
        this.output = this.context.createGain();
        this.output.gain.value = this.volume;
        this.peakLimit = connectSfxPeakLimit(this.context, this.output, this.context.destination);
      }
      void this.syncContext();
    } catch {
      // Audio is optional when the browser or device cannot provide a context.
    }
  }

  ui(kind: InterfaceCue = 'tap') {
    this.request(kind, 'ui', 90);
  }
  button() {
    this.request('button', 'ui', 90);
  }
  hint() {
    this.request('hint', 'hint', 250);
  }
  plant(stage: PlantingCue) {
    this.request(stage, stage, 80);
  }
  bloom() {
    this.plant('bloom');
  }

  pause() {
    if (this.disposed) return;
    this.paused = true;
    this.policyVersion++;
    this.cancel();
    void this.syncContext();
  }

  /** Let the navigation click finish after its page unmounts, then close promptly. */
  retire() {
    if (this.disposed || this.retiring) return;
    this.retiring = true;
    if (!this.canPlay() || (!this.voices.size && !this.settling)) {
      this.dispose();
      return;
    }
    this.retirementTimer = setTimeout(() => this.dispose(), 450);
    if (typeof document !== 'undefined') {
      this.retirementVisibility = () => {
        if (document.hidden) this.dispose();
      };
      document.addEventListener('visibilitychange', this.retirementVisibility);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.retirementTimer) clearTimeout(this.retirementTimer);
    this.retirementTimer = null;
    if (this.retirementVisibility && typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.retirementVisibility);
    this.retirementVisibility = null;
    this.cancel();
    this.output?.disconnect();
    this.peakLimit?.disconnect();
    this.peakLimit = null;
    this.output = null;
    this.buttonBuffer = null;
    const context = this.context;
    this.context = null;
    if (context) void context.close().catch(() => undefined);
  }

  private canPlay() {
    return (
      !this.disposed &&
      !this.muted &&
      this.volume > 0 &&
      !this.hidden &&
      !this.isPageHidden() &&
      !this.paused &&
      this.context !== null
    );
  }

  /** Serialize resume/suspend so a late resume cannot undo a newer mute or pause. */
  private syncContext(): Promise<void> {
    if (this.settling) return this.settling;
    const context = this.context;
    if (!context || this.disposed) return Promise.resolve();
    if (context.state === (this.canPlay() ? 'running' : 'suspended'))
      return Promise.resolve();
    const version = this.policyVersion;
    const settle = async () => {
      while (this.context === context && context.state !== 'closed') {
        const target = this.canPlay() ? 'running' : 'suspended';
        if (context.state === target) return;
        try {
          if (target === 'running') await context.resume();
          else await context.suspend();
        } catch {
          return;
        }
        // Some embedded browsers refuse to transition without rejecting.
        if (context.state !== target) return;
      }
    };
    const pending = settle();
    this.settling = pending;
    void pending.then(() => {
      if (this.settling === pending) this.settling = null;
      if (
        this.context === context &&
        version !== this.policyVersion &&
        context.state !== (this.canPlay() ? 'running' : 'suspended')
      )
        void this.syncContext();
    });
    return pending;
  }

  private request(cue: Cue, family: string, cooldown: number) {
    if (this.retiring || !this.canPlay()) return;
    const requestedAt = this.now();
    if (requestedAt - (this.lastRequested.get(family) ?? -Infinity) < cooldown)
      return;
    this.lastRequested.set(family, requestedAt);
    const epoch = this.epoch;
    const play = () => {
      // A stalled resume should never replay an old button click much later.
      if (
        epoch !== this.epoch ||
        this.now() - requestedAt > 350 ||
        !this.canPlay() ||
        this.context?.state !== 'running'
      )
        return;
      this.play(cue);
    };
    if (this.context?.state === 'running') play();
    else if (this.settling) {
      const waitForResume = async () => {
        let waiting = this.settling;
        while (waiting) {
          await waiting;
          if (epoch !== this.epoch) return;
          waiting = this.settling === waiting ? null : this.settling;
        }
        play();
      };
      void waitForResume();
    }
  }

  private play(cue: Cue) {
    const context = this.context;
    if (!context || !this.output) return;
    if (cue === 'button') {
      this.playButton(context);
      return;
    }
    let started = 0;
    for (const note of notes[cue]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const voice: Voice = { source: oscillator, gain };
      this.voices.add(voice);
      try {
        const at = context.currentTime + (note.delay ?? 0);
        oscillator.type = note.type ?? 'sine';
        oscillator.frequency.setValueAtTime(note.frequency, at);
        if (note.end)
          oscillator.frequency.exponentialRampToValueAtTime(
            note.end,
            at + note.duration,
          );
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(note.gain * cueGain[cue], at + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001 * cueGain[cue], at + note.duration);
        oscillator.connect(gain);
        gain.connect(this.output);
        oscillator.onended = () => this.release(voice);
        oscillator.start(at);
        oscillator.stop(at + note.duration + 0.005);
        this.scheduledVoices++;
        started++;
      } catch {
        this.release(voice, true);
      }
    }
    if (started > 0) {
      this.scheduledCues++;
      this.lastCue = cue;
      this.cueCounts[cue] = (this.cueCounts[cue] ?? 0) + 1;
    }
  }

  private playButton(context: AudioContext) {
    if (!this.output) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const voice: Voice = { source, gain };
    this.voices.add(voice);
    try {
      if (!this.buttonBuffer) {
        const samples = approvedSoundSamples('button');
        this.buttonBuffer = context.createBuffer(1, samples.length, 44100);
        this.buttonBuffer.getChannelData(0).set(samples);
      }
      source.buffer = this.buttonBuffer;
      gain.gain.value = 1;
      source.connect(gain);
      gain.connect(this.output);
      source.onended = () => this.release(voice);
      source.start(context.currentTime);
      this.scheduledVoices++;
      this.scheduledCues++;
      this.lastCue = 'button';
      this.cueCounts.button = (this.cueCounts.button ?? 0) + 1;
    } catch {
      this.release(voice, true);
    }
  }

  private release(voice: Voice, stop = false) {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    if (stop) {
      try {
        voice.source.stop(this.context?.currentTime ?? 0);
      } catch {
        /* Already ended. */
      }
    }
    voice.source.disconnect();
    voice.gain.disconnect();
    if (this.retiring && !this.voices.size) this.dispose();
  }

  private cancel() {
    this.epoch++;
    for (const voice of this.voices) this.release(voice, true);
  }
}
