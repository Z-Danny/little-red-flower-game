import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedSoundSamples, approvedSoundDuration } from '../app/game/audio/result-samples';
import { RewardSound } from '../components/game/journey/reward-sound';
import {
  PlantingAudioTracker,
  plantingUnlocks,
} from '../app/game/journey/planting-audio';
import {
  journeyMap,
  journeyTiming,
  type Planting,
} from '../app/game/journey/progress';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
const parameter = () => ({
  value: 0,
  setValueAtTime(value: number) {
    this.value = value;
  },
  linearRampToValueAtTime(value: number) {
    this.value = value;
  },
  exponentialRampToValueAtTime(value: number) {
    this.value = value;
  },
});
class FakeGain {
  gain = parameter();
  disconnected = false;
  connect() {}
  disconnect() {
    this.disconnected = true;
  }
}
class FakeOscillator {
  frequency = parameter();
  type: OscillatorType = 'sine';
  onended: (() => void) | null = null;
  startedAt = -1;
  stops: number[] = [];
  disconnected = false;
  connect() {}
  disconnect() {
    this.disconnected = true;
  }
  start(at: number) {
    this.startedAt = at;
  }
  stop(at: number) {
    this.stops.push(at);
  }
  end() {
    this.onended?.();
  }
}
class FakeBufferSource extends FakeOscillator {
  buffer: AudioBuffer | null = null;
}
class FakeContext {
  state: AudioContextState = 'suspended';
  currentTime = 3;
  destination = {} as AudioDestinationNode;
  sources: FakeOscillator[] = [];
  buffers: FakeBufferSource[] = [];
  createBuffer(_channels: number, length: number, rate: number) {
    const data = new Float32Array(length);
    return { duration: length / rate, length, sampleRate: rate, getChannelData: () => data } as unknown as AudioBuffer;
  }
  createBufferSource() {
    const source = new FakeBufferSource();
    this.buffers.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
  gains: FakeGain[] = [];
  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;
  resumeGate: ReturnType<typeof deferred> | null = null;
  suspendGate: ReturnType<typeof deferred> | null = null;
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }
  createOscillator() {
    const source = new FakeOscillator();
    this.sources.push(source);
    return source as unknown as OscillatorNode;
  }
  async resume() {
    this.resumeCalls++;
    if (this.resumeGate) await this.resumeGate.promise;
    if (this.state !== 'closed') this.state = 'running';
  }
  async suspend() {
    this.suspendCalls++;
    if (this.suspendGate) await this.suspendGate.promise;
    if (this.state !== 'closed') this.state = 'suspended';
  }
  close() {
    this.closeCalls++;
    this.state = 'closed';
    return Promise.resolve();
  }
}
function fixture() {
  const context = new FakeContext();
  let created = 0;
  let hidden = false;
  let now = 0;
  const sound = new RewardSound(
    () => {
      created++;
      return context as unknown as AudioContext;
    },
    () => hidden,
    () => now,
  );
  return {
    sound,
    context,
    created: () => created,
    hide: (value: boolean) => {
      hidden = value;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

void test('setters and feedback cannot create audio before a gesture, including mute and zero volume', async (t) => {
  const { sound, created } = fixture();
  t.after(() => sound.dispose());
  sound.ui();
  sound.hint();
  sound.bloom();
  sound.setHidden(true);
  sound.setHidden(false);
  sound.setMuted(true);
  sound.unlock();
  sound.setMuted(false);
  sound.setVolume(0);
  sound.unlock();
  sound.setVolume(0.6);
  await flush();
  assert.equal(created(), 0);
  assert.equal(sound.status.scheduledCues, 0);
  sound.unlock();
  sound.ui();
  await flush();
  assert.equal(created(), 1);
  assert.equal(
    sound.status.scheduledCues,
    1,
    'the original gesture can play its first click',
  );
});

void test('repeat clicks share one unlock and are throttled across UI kinds', async (t) => {
  const { sound, context, advance } = fixture();
  t.after(() => sound.dispose());
  context.resumeGate = deferred();
  sound.unlock();
  sound.ui('open');
  sound.unlock();
  sound.ui('close');
  advance(30);
  sound.ui('confirm');
  context.resumeGate.resolve();
  await flush();
  assert.equal(context.resumeCalls, 1);
  assert.equal(sound.status.scheduledCues, 1);
  assert.equal(sound.status.lastCue, 'open');
  advance(60);
  sound.ui('confirm');
  assert.equal(sound.status.scheduledCues, 2);
  assert.equal(sound.status.lastCue, 'confirm');
});

for (const cancellation of [
  'mute',
  'hidden',
  'pause',
  'zero',
  'dispose',
] as const) {
  void test(`a pending resume cannot play a stale click after ${cancellation}`, async (t) => {
    const { sound, context } = fixture();
    t.after(() => sound.dispose());
    context.resumeGate = deferred();
    sound.unlock();
    sound.ui();
    if (cancellation === 'mute') sound.setMuted(true);
    if (cancellation === 'hidden') sound.setHidden(true);
    if (cancellation === 'pause') sound.pause();
    if (cancellation === 'zero') sound.setVolume(0);
    if (cancellation === 'dispose') sound.dispose();
    context.resumeGate.resolve();
    await flush();
    assert.equal(sound.status.scheduledCues, 0);
    assert.equal(sound.status.activeVoices, 0);
    assert.notEqual(context.state, 'running');
  });
}

void test('stalled audio drops clicks older than 350ms', async (t) => {
  const { sound, context, advance } = fixture();
  t.after(() => sound.dispose());
  context.resumeGate = deferred();
  sound.unlock();
  sound.hint();
  advance(351);
  context.resumeGate.resolve();
  await flush();
  assert.equal(sound.status.scheduledCues, 0);
});

void test('mute cancels all current and future notes and unmute never replays them', async (t) => {
  const { sound, context } = fixture();
  t.after(() => sound.dispose());
  sound.unlock();
  await flush();
  sound.bloom();
  assert.equal(sound.status.activeVoices, 4);
  assert.ok(
    context.sources.some((source) => source.startedAt > context.currentTime),
  );
  sound.setMuted(true);
  assert.equal(sound.status.activeVoices, 0);
  assert.ok(
    context.sources.every(
      (source) =>
        source.disconnected && source.stops.at(-1) === context.currentTime,
    ),
  );
  assert.ok(context.gains.slice(1).every((gain) => gain.disconnected));
  sound.setMuted(false);
  await flush();
  assert.equal(sound.status.scheduledCues, 1);
  assert.equal(sound.status.activeVoices, 0);
  sound.hint();
  assert.equal(sound.status.scheduledCues, 2);
});

void test('page hidden blocks feedback before visibility handler and stops pending notes on notification', async (t) => {
  const { sound, context, hide } = fixture();
  t.after(() => sound.dispose());
  sound.unlock();
  await flush();
  sound.plant('unlock');
  hide(true);
  sound.hint();
  assert.equal(sound.status.scheduledCues, 1);
  sound.setHidden(true);
  await flush();
  assert.equal(sound.status.activeVoices, 0);
  assert.equal(context.state, 'suspended');
  hide(false);
  sound.setHidden(false);
  await flush();
  assert.equal(context.state, 'running');
  assert.equal(sound.status.scheduledCues, 1);
});

void test('volume clamps, affects the output bus, and zero cancels voices immediately', async (t) => {
  const { sound, context } = fixture();
  t.after(() => sound.dispose());
  sound.setVolume(0.4);
  sound.unlock();
  await flush();
  assert.equal(context.gains[0].gain.value, 0.4);
  sound.ui();
  sound.setVolume(-0.1);
  assert.equal(sound.status.volume, 0);
  assert.equal(sound.status.activeVoices, 0);
  sound.setVolume(Number.NaN);
  assert.equal(sound.status.volume, 0);
  sound.setVolume(1.2);
  await flush();
  assert.equal(context.gains[0].gain.value, 1);
  sound.hint();
  assert.equal(sound.status.scheduledCues, 2);
});

void test('rapid restore while suspend is pending resumes once without leaking old voices', async (t) => {
  const { sound, context } = fixture();
  t.after(() => sound.dispose());
  sound.unlock();
  await flush();
  sound.plant('sprout');
  context.suspendGate = deferred();
  sound.pause();
  sound.unlock();
  sound.hint();
  context.suspendGate.resolve();
  await flush();
  assert.equal(context.state, 'running');
  assert.equal(sound.status.cueCounts.sprout, 1);
  assert.equal(sound.status.cueCounts.hint, 1);
  assert.equal(sound.status.activeVoices, 2);
});

void test('ended voices disconnect; dispose closes once and blocks future creation', async () => {
  const { sound, context, created } = fixture();
  sound.unlock();
  await flush();
  sound.hint();
  context.sources.forEach((source) => source.end());
  assert.equal(sound.status.activeVoices, 0);
  assert.ok(context.sources.every((source) => source.disconnected));
  sound.plant('unlock');
  sound.dispose();
  sound.dispose();
  sound.unlock();
  sound.ui();
  assert.equal(sound.status.activeVoices, 0);
  assert.equal(context.closeCalls, 1);
  assert.ok(context.gains.every((gain) => gain.disconnected));
  assert.equal(created(), 1);
  assert.equal(sound.status.state, 'disposed');
});

const first = journeyMap.regions[0].nodes[0];

void test('navigation keeps its final click alive, rejects new cues and closes on its last ended voice', async () => {
  const { sound, context } = fixture();
  sound.unlock();
  await flush();
  sound.ui();
  const stops = [...context.sources[0].stops];
  sound.retire();
  sound.unlock();
  sound.hint();
  assert.equal(sound.status.scheduledCues, 1);
  assert.equal(context.closeCalls, 0);
  assert.deepEqual(context.sources[0].stops, stops, 'navigation must not stop the click early');
  context.sources[0].end();
  assert.equal(context.closeCalls, 1);
  assert.equal(sound.status.activeVoices, 0);
});

void test('a navigation click waiting for resume can finish, while mute cancels a retired tail', async () => {
  const { sound, context } = fixture();
  context.resumeGate = deferred();
  sound.unlock();
  sound.ui();
  sound.retire();
  assert.equal(context.closeCalls, 0);
  context.resumeGate.resolve();
  await flush();
  assert.equal(sound.status.scheduledCues, 1);
  sound.setMuted(true);
  assert.equal(sound.status.activeVoices, 0);
  assert.equal(context.closeCalls, 1);
});

void test('retirement closes even if a browser never delivers ended or resume', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { sound, context } = fixture();
  context.resumeGate = deferred();
  sound.unlock();
  sound.ui();
  sound.retire();
  t.mock.timers.tick(450);
  assert.equal(context.closeCalls, 1);
  context.resumeGate.resolve();
  await flush();
  assert.equal(sound.status.scheduledCues, 0);
});

void test('hidden navigation tail stops immediately and cannot be revived', async () => {
  const { sound, context } = fixture();
  sound.unlock();
  await flush();
  sound.hint();
  sound.retire();
  sound.setHidden(true);
  sound.setHidden(false);
  sound.unlock();
  assert.equal(sound.status.state, 'disposed');
  assert.equal(sound.status.activeVoices, 0);
  assert.equal(context.closeCalls, 1);
});
const planting: Planting = {
  levelId: first.id,
  before: {},
  reward: 3,
  nonce: 1,
};
const completed = { [first.id]: 3 };

void test('planting cues use the actual animation thresholds and only fire once per nonce', () => {
  const tracker = new PlantingAudioTracker();
  const stages = ['land', 'sprout', 'bloom', 'count', 'unlock'] as const;
  for (const stage of stages) {
    assert.deepEqual(
      tracker.take(planting, completed, journeyTiming[stage] - 1),
      [],
    );
    assert.deepEqual(tracker.take(planting, completed, journeyTiming[stage]), [
      stage,
    ]);
    assert.deepEqual(
      tracker.take({ ...planting }, completed, journeyTiming[stage]),
      [],
    );
  }
  assert.deepEqual(tracker.take(null, completed, 0), []);
  assert.deepEqual(
    tracker.take(planting, completed, journeyTiming.end),
    [],
    'rerender or pause never replays stages',
  );
  assert.deepEqual(
    tracker.take({ ...planting, nonce: 2 }, completed, journeyTiming.land),
    ['land'],
  );
});

void test('planting frame jumps preserve order; already consumed muted stages cannot catch up later', () => {
  const tracker = new PlantingAudioTracker();
  assert.deepEqual(tracker.take(planting, completed, journeyTiming.bloom), [
    'land',
    'sprout',
    'bloom',
  ]);
  assert.deepEqual(tracker.take(planting, completed, journeyTiming.bloom), []);
  assert.deepEqual(tracker.take(planting, completed, journeyTiming.end), [
    'count',
    'unlock',
  ]);
});

void test('an end-of-region clear does not announce a nonexistent unlock', () => {
  const final = journeyMap.regions[0].nodes.at(-1)!;
  const event: Planting = {
    levelId: final.id,
    before: {},
    reward: 2,
    nonce: 3,
  };
  const after = { [final.id]: 2 };
  assert.deepEqual(plantingUnlocks(event, after), []);
  assert.deepEqual(
    new PlantingAudioTracker().take(event, after, journeyTiming.end),
    ['land', 'sprout', 'bloom', 'count'],
  );
});

void test('replays, missing saves, invalid ages and unrelated progress do not produce false rewards or unlocks', () => {
  const tracker = new PlantingAudioTracker();
  assert.deepEqual(
    tracker.take(
      { ...planting, before: completed },
      completed,
      journeyTiming.end,
    ),
    [],
  );
  assert.deepEqual(
    tracker.take({ ...planting, reward: 0 }, completed, journeyTiming.end),
    [],
  );
  assert.deepEqual(tracker.take(planting, {}, journeyTiming.end), []);
  assert.deepEqual(tracker.take(planting, completed, Number.NaN), []);
  assert.deepEqual(tracker.take(planting, completed, -1), []);
  const next = journeyMap.regions[0].nodes[1];
  assert.deepEqual(
    plantingUnlocks(planting, { ...completed, [next.id]: 3 }),
    [],
    'an already completed successor is not newly available',
  );
});

void test('approved result button plays one exact short sample, survives navigation, then releases', async () => {
  const { sound, context } = fixture();
  sound.unlock();
  sound.button();
  await flush();
  assert.equal(sound.status.lastCue, 'button');
  assert.equal(sound.status.scheduledCues, 1);
  assert.equal(context.sources.length, 0, 'no bright oscillator click is layered over the sample');
  assert.equal(context.buffers.length, 1);
  const source = context.buffers[0];
  assert.equal(source.buffer!.duration, approvedSoundDuration('button'));
  assert.deepEqual(source.buffer!.getChannelData(0), approvedSoundSamples('button'));
  sound.retire();
  assert.equal(context.closeCalls, 0);
  assert.equal(source.stops.length, 0, 'return/retry keeps the 35ms click intact');
  source.end();
  assert.equal(context.closeCalls, 1);
  assert.equal(sound.status.activeVoices, 0);
});

void test('approved button shares UI cooldown and is canceled by mute without replay', async (t) => {
  const { sound, context, advance } = fixture();
  t.after(() => sound.dispose());
  sound.unlock(); await flush();
  sound.button(); sound.ui();
  assert.equal(sound.status.scheduledCues, 1);
  sound.setMuted(true);
  assert.equal(context.buffers[0].stops.at(-1), context.currentTime);
  assert.equal(context.buffers[0].disconnected, true);
  sound.setMuted(false); await flush();
  assert.equal(sound.status.activeVoices, 0);
  assert.equal(sound.status.scheduledCues, 1);
  advance(100); sound.button();
  assert.equal(sound.status.scheduledCues, 2);
});
