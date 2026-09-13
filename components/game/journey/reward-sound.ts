import { journeyTiming } from '@/app/game/journey/presentation';
/** Gesture-unlocked, short and quiet reward notes. No speech or perpetual loops. */
export class RewardSound {
  private context: AudioContext | null = null;
  private muted = false;
  setMuted(value: boolean) {
    this.muted = value;
    if (value) void this.context?.suspend();
  }
  unlock() {
    if (this.muted) return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => undefined);
    } catch {
      /* audio is optional */
    }
  }
  bloom() {
    if (this.muted || document.hidden || this.context?.state !== 'running')
      return;
    const c = this.context;
    [523.25, 659.25, 783.99].forEach((frequency, i) => {
      const oscillator = c.createOscillator(),
        gain = c.createGain(),
        at = c.currentTime + (i * journeyTiming.rewardStep) / 1000;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.035, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.24);
      oscillator.connect(gain);
      gain.connect(c.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.25);
    });
  }
  pause() {
    void this.context?.suspend();
  }
  dispose() {
    void this.context?.close();
    this.context = null;
  }
}
