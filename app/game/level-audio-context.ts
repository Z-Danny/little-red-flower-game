/** Carry the map's start gesture across asynchronous scene loading. */
let pending: AudioContext | null = null;

export function releaseLevelAudioContext() {
  const context = pending;
  pending = null;
  if (context && context.state !== 'closed') void context.close().catch(() => undefined);
}

/** Call synchronously from the validated map start action, before loading assets. */
export function primeLevelAudioContext() {
  releaseLevelAudioContext();
  if (typeof AudioContext === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.userActivation?.isActive === false) return;
  try {
    const context = new AudioContext();
    pending = context;
    // A silent source also unlocks the output route on mobile WebKit.
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, context.sampleRate);
    source.connect(context.destination);
    source.onended = () => source.disconnect();
    source.start();
    void context.resume().catch(() => undefined);
  } catch {
    releaseLevelAudioContext();
  }
}

/** The receiving engine owns and disposes the context after this handoff. */
export function takeLevelAudioContext(): AudioContext {
  const context = pending;
  pending = null;
  return context && context.state !== 'closed' ? context : new AudioContext();
}
