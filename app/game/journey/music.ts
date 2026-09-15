export type JourneyMusicConfig = {
  src: string;
  gain: number;
  fadeSeconds: number;
  loopStart?: number;
  loopEnd?: number;
};

export type JourneyMusicStatus = Readonly<{
  phase: 'locked' | 'loading' | 'playing' | 'fading' | 'muted' | 'hidden' | 'inactive' | 'paused' | 'error' | 'disposed';
  active: boolean;
  muted: boolean;
  hidden: boolean;
  unlocked: boolean;
  decoded: boolean;
  playing: boolean;
  position: number;
  loopDuration: number;
  contextState: AudioContextState | 'locked';
  sources: number;
  error: string | null;
}>;

type Fade = { from: number; to: number; at: number; seconds: number };

/** Embedded offline audio must not use fetch: the exported page has connect-src 'none'. */
async function musicBytes(src: string): Promise<ArrayBuffer> {
  if (!src.startsWith('data:')) {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`Journey music HTTP ${response.status}`);
    return response.arrayBuffer();
  }
  const comma = src.indexOf(',');
  if (comma < 0) throw new Error('Invalid journey music data URL');
  const payload = src.slice(comma + 1);
  const binary = /;base64$/i.test(src.slice(0, comma)) ? atob(payload) : decodeURIComponent(payload);
  return Uint8Array.from(binary, character => character.charCodeAt(0)).buffer;
}

/** One shared, gesture-unlocked loop for the home screen and journey maps. */
export class JourneyMusic {
  private readonly config: JourneyMusicConfig;
  private readonly makeContext: () => AudioContext;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private loading: Promise<void> | null = null;
  private resuming: Promise<void> | null = null;
  private suspending: Promise<void> | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private envelope: Fade = { from: 0, to: 0, at: 0, seconds: 0 };
  private active = false;
  private muted = false;
  private hidden = false;
  private unlocked = false;
  private disposed = false;
  private failure: string | null = null;
  private resumeFailure: string | null = null;
  private loopStart = 0;
  private loopDuration = 0;
  private savedPosition = 0;
  private startedAt = 0;

  constructor(config: JourneyMusicConfig, makeContext: () => AudioContext = () => new AudioContext()) {
    this.config = {
      ...config,
      gain: Number.isFinite(config.gain) ? Math.max(0, Math.min(1, config.gain)) : 0,
      fadeSeconds: Number.isFinite(config.fadeSeconds) ? Math.max(0, Math.min(2, config.fadeSeconds)) : 0,
    };
    this.makeContext = makeContext;
  }

  /** Call directly inside pointer/key handlers, before awaiting anything. */
  async unlock(): Promise<void> {
    if (this.disposed || !this.active || this.muted || this.hidden) return;
    try {
      if (!this.context) {
        const context = this.makeContext();
        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = 0;
        this.master.connect(context.destination);
      }
      // Start resume synchronously while the browser still has user activation.
      const resumed = this.resume();
      if (!this.buffer && !this.loading) this.loading = this.load(this.context);
      await Promise.all([resumed, this.loading]);
      this.reconcile();
    } catch (error) {
      if (!this.disposed) this.failure = error instanceof Error ? error.message : 'Journey music unavailable';
    }
  }

  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (active) this.resumeFailure = null;
    this.reconcile();
  }

  setMuted(muted: boolean): void {
    if (this.disposed || this.muted === muted) return;
    this.muted = muted;
    if (!muted) this.resumeFailure = null;
    this.reconcile();
  }

  setHidden(hidden: boolean): void {
    if (this.disposed || this.hidden === hidden) return;
    this.hidden = hidden;
    if (!hidden) this.resumeFailure = null;
    this.reconcile();
  }

  private async load(context: AudioContext): Promise<void> {
    this.failure = null;
    try {
      const bytes = await musicBytes(this.config.src);
      if (this.disposed) return;
      const buffer = await context.decodeAudioData(bytes);
      if (this.disposed) return;
      if (!(buffer.duration > 0)) throw new Error('Empty journey music');
      const start = this.config.loopStart ?? 0;
      const end = this.config.loopEnd ?? buffer.duration;
      this.loopStart = Number.isFinite(start) && start >= 0 && start < buffer.duration ? start : 0;
      const loopEnd = Number.isFinite(end) && end > this.loopStart ? Math.min(end, buffer.duration) : buffer.duration;
      this.loopDuration = loopEnd - this.loopStart;
      this.buffer = buffer;
    } catch (error) {
      if (!this.disposed) this.failure = error instanceof Error ? error.message : 'Journey music could not be decoded';
    } finally {
      this.loading = null;
      this.reconcile();
    }
  }

  private resume(): Promise<void> {
    const context = this.context;
    if (!context || this.disposed || context.state === 'closed') return Promise.resolve();
    if (this.resuming) return this.resuming;
    this.resumeFailure = null;
    // Do not move this call into a .then(): unlock's first resume needs a gesture.
    this.resuming = context.resume().then(() => {
      this.resuming = null;
      if (this.disposed) return;
      this.unlocked = true;
      this.reconcile();
    }).catch(error => {
      this.resuming = null;
      if (!this.disposed) this.resumeFailure = error instanceof Error ? error.message : 'Journey music is paused';
      // A rejected resume must await another gesture/state change, not retry forever.
    });
    return this.resuming;
  }

  private suspend(): void {
    const context = this.context;
    if (!context || this.disposed || context.state === 'closed' || this.suspending) return;
    if (context.state === 'suspended' && !this.resuming) return;
    this.suspending = context.suspend().then(() => {
      this.suspending = null;
      this.reconcile();
    }).catch(() => { this.suspending = null; });
  }

  private reconcile(): void {
    const context = this.context;
    if (this.disposed || !context) return;
    if (!this.active || this.muted || this.hidden) {
      if (!this.active && !this.muted && !this.hidden && this.source && context.state === 'running' && this.config.fadeSeconds > 0) {
        if (this.fadeTimer === null) {
          this.ramp(0, this.config.fadeSeconds);
          this.fadeTimer = setTimeout(() => {
            this.fadeTimer = null;
            this.stopSource();
            this.suspend();
          }, this.config.fadeSeconds * 1000);
        }
      } else {
        this.cancelFade();
        this.stopSource();
        this.suspend();
      }
      return;
    }
    this.cancelFade();
    if (!this.unlocked || !this.buffer || this.suspending) return;
    if (context.state === 'running') {
      if (!this.source) {
        const source = context.createBufferSource();
        source.buffer = this.buffer;
        source.loop = true;
        source.loopStart = this.loopStart;
        source.loopEnd = this.loopStart + this.loopDuration;
        source.connect(this.master!);
        this.source = source;
        this.startedAt = context.currentTime;
        source.start(0, this.loopStart + this.savedPosition);
      }
      this.ramp(this.config.gain, this.config.fadeSeconds);
    } else if (context.state === 'suspended' && !this.resuming && !this.resumeFailure) {
      void this.resume();
    }
  }

  private volume(): number {
    const { from, to, at, seconds } = this.envelope;
    const elapsed = (this.context?.currentTime ?? at) - at;
    return seconds <= 0 ? to : from + (to - from) * Math.max(0, Math.min(1, elapsed / seconds));
  }

  private ramp(to: number, seconds: number): void {
    const context = this.context, master = this.master;
    if (!context || !master || this.envelope.to === to) return;
    const from = this.volume(), at = context.currentTime;
    master.gain.cancelScheduledValues(at);
    master.gain.setValueAtTime(from, at);
    if (seconds > 0) master.gain.linearRampToValueAtTime(to, at + seconds);
    else master.gain.setValueAtTime(to, at);
    this.envelope = { from, to, at, seconds };
  }

  private position(): number {
    const elapsed = this.source && this.context ? Math.max(0, this.context.currentTime - this.startedAt) : 0;
    return this.loopDuration > 0 ? (this.savedPosition + elapsed) % this.loopDuration : 0;
  }

  private cancelFade(): void {
    if (this.fadeTimer !== null) clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
  }

  private stopSource(): void {
    const source = this.source;
    this.savedPosition = this.position();
    this.source = null;
    if (source) {
      try { source.stop(); } catch { /* Already stopped by the audio device. */ }
      source.disconnect();
    }
    // Stop immediately for mute/background, including any interrupted fade.
    if (this.context && this.master) {
      const at = this.context.currentTime;
      this.master.gain.cancelScheduledValues(at);
      this.master.gain.setValueAtTime(0, at);
      this.envelope = { from: 0, to: 0, at, seconds: 0 };
    }
  }

  get status(): JourneyMusicStatus {
    const playing = !!this.source && this.context?.state === 'running';
    const phase: JourneyMusicStatus['phase'] = this.disposed ? 'disposed'
      : this.failure ? 'error'
      : this.hidden ? 'hidden'
      : this.muted ? 'muted'
      : this.fadeTimer !== null ? 'fading'
      : !this.active ? 'inactive'
      : !this.unlocked ? 'locked'
      : !this.buffer ? 'loading'
      : playing ? 'playing' : 'paused';
    return {
      phase, active: this.active, muted: this.muted, hidden: this.hidden,
      unlocked: this.unlocked, decoded: !!this.buffer, playing,
      position: this.position(), loopDuration: this.loopDuration,
      contextState: this.context?.state ?? 'locked', sources: this.source ? 1 : 0,
      error: this.failure ?? this.resumeFailure,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelFade();
    this.stopSource();
    this.buffer = null;
    this.master?.disconnect();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined);
  }
}
