import test from 'node:test';
import assert from 'node:assert/strict';
import { JourneyMusic } from '../app/game/journey/music';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

class FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  started = false;
  stopped = false;
  offset = 0;
  connect() {}
  disconnect() {}
  start(_when: number, offset: number) { this.started = true; this.offset = offset; }
  stop() { this.stopped = true; }
}

class FakeContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = {} as AudioDestinationNode;
  sources: FakeSource[] = [];
  decodeCalls = 0;
  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;
  bytes: number[] = [];
  decodeGate = deferred<AudioBuffer>();
  resumeGate: ReturnType<typeof deferred<void>> | null = null;
  suspendGate: ReturnType<typeof deferred<void>> | null = null;
  createGain() {
    return { connect() {}, disconnect() {}, gain: {
      value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {},
    } } as unknown as GainNode;
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
  decodeAudioData(bytes: ArrayBuffer) {
    this.decodeCalls++;
    this.bytes = [...new Uint8Array(bytes)];
    return this.decodeGate.promise;
  }
  resume() {
    this.resumeCalls++;
    const pending = this.resumeGate?.promise ?? Promise.resolve();
    return pending.then(() => { if (this.state !== 'closed') this.state = 'running'; });
  }
  suspend() {
    this.suspendCalls++;
    const pending = this.suspendGate?.promise ?? Promise.resolve();
    return pending.then(() => { if (this.state !== 'closed') this.state = 'suspended'; });
  }
  close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); }
  decoded() { this.decodeGate.resolve({ duration: 60 } as AudioBuffer); }
}

function fixture(fadeSeconds = 0) {
  const context = new FakeContext();
  let created = 0;
  const music = new JourneyMusic({ src: 'data:audio/mpeg;base64,AQID', gain: .45, fadeSeconds, loopStart: 2, loopEnd: 52 }, () => {
    created++;
    return context as unknown as AudioContext;
  });
  return { music, context, created: () => created };
}

void test('setters never create or unlock audio before a user gesture; data URL decode needs no fetch', async t => {
  const { music, context, created } = fixture();
  t.after(() => music.dispose());
  music.setActive(true);
  music.setHidden(true);
  music.setHidden(false);
  music.setMuted(true);
  music.setMuted(false);
  await flush();
  assert.equal(created(), 0);
  assert.equal(music.status.phase, 'locked');
  const unlocking = music.unlock();
  assert.equal(created(), 1);
  assert.equal(context.resumeCalls, 1, 'resume must start synchronously inside unlock');
  assert.equal(context.decodeCalls, 0, 'resume begins before asynchronous decode');
  context.decoded();
  await unlocking;
  assert.deepEqual(context.bytes, [1, 2, 3]);
  assert.equal(music.status.playing, true);
  assert.equal(music.status.loopDuration, 50);
  assert.equal(context.sources[0].offset, 2);
});

void test('gesture events on muted, hidden, or gameplay screens do not create or decode music', async t => {
  const { music, context, created } = fixture();
  t.after(() => music.dispose());
  await music.unlock();
  music.setActive(true);
  music.setMuted(true);
  await music.unlock();
  music.setMuted(false);
  music.setHidden(true);
  await music.unlock();
  assert.equal(created(), 0);
  assert.equal(context.decodeCalls, 0);
  assert.equal(context.resumeCalls, 0);
});

for (const action of ['inactive', 'hidden', 'muted', 'dispose'] as const) {
  void test(`late decode cannot start playback after ${action}`, async t => {
    const { music, context } = fixture();
    t.after(() => music.dispose());
    music.setActive(true);
    const unlocking = music.unlock();
    await flush();
    if (action === 'inactive') music.setActive(false);
    if (action === 'hidden') music.setHidden(true);
    if (action === 'muted') music.setMuted(true);
    if (action === 'dispose') music.dispose();
    context.decoded();
    await unlocking;
    await flush();
    assert.equal(context.sources.length, 0);
    assert.equal(music.status.playing, false);
    assert.notEqual(context.state, 'running');
    if (action === 'dispose') assert.equal(music.status.decoded, false);
  });
}

void test('rapid unlock calls share one context, decode and source', async t => {
  const { music, context, created } = fixture();
  t.after(() => music.dispose());
  music.setActive(true);
  const first = music.unlock(), second = music.unlock(), third = music.unlock();
  await flush();
  assert.equal(context.decodeCalls, 1);
  assert.equal(context.resumeCalls, 1);
  context.decoded();
  await Promise.all([first, second, third]);
  await music.unlock();
  assert.equal(created(), 1);
  assert.equal(context.decodeCalls, 1);
  assert.equal(context.sources.length, 1);
  assert.equal(music.status.sources, 1);
});

void test('mute and hidden stop immediately, freeze position, and resume without overlapping sources', async t => {
  const { music, context } = fixture();
  t.after(() => music.dispose());
  music.setActive(true);
  context.decoded();
  await music.unlock();
  context.currentTime = 13;
  music.setMuted(true);
  assert.equal(music.status.playing, false);
  assert.equal(context.sources[0].stopped, true);
  await flush();
  assert.equal(context.state, 'suspended');
  assert.equal(music.status.position, 13);
  music.setMuted(false);
  await flush();
  assert.equal(music.status.playing, true);
  assert.equal(context.sources[1].offset, 15);
  context.currentTime = 19;
  music.setHidden(true);
  assert.equal(music.status.position, 19);
  await flush();
  assert.equal(context.state, 'suspended');
  music.setHidden(false);
  await flush();
  assert.equal(context.sources[2].offset, 21);
  assert.equal(context.sources.filter(source => source.started && !source.stopped).length, 1);
  music.setHidden(true);
  music.setActive(false);
  music.setHidden(false);
  await flush();
  assert.equal(music.status.playing, false, 'returning foreground inside a level stays silent');
});

void test('rapid return during a page fade reuses the source; a completed fade preserves position', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { music, context } = fixture(.2);
  t.after(() => music.dispose());
  music.setActive(true);
  context.decoded();
  await music.unlock();
  context.currentTime = 4;
  music.setActive(false);
  assert.equal(music.status.phase, 'fading');
  t.mock.timers.tick(100);
  context.currentTime = 4.1;
  music.setActive(true);
  t.mock.timers.tick(200);
  assert.equal(context.sources.length, 1);
  assert.equal(music.status.playing, true);
  music.setActive(false);
  context.currentTime = 4.3;
  t.mock.timers.tick(200);
  await flush();
  assert.equal(music.status.playing, false);
  assert.equal(music.status.position, 4.3);
  music.setActive(true);
  await flush();
  assert.equal(context.sources[1].offset, 6.3);
  assert.equal(context.sources.filter(source => source.started && !source.stopped).length, 1);
});

void test('reactivating while suspend is pending waits for suspension then restores one source', async t => {
  const { music, context } = fixture();
  t.after(() => music.dispose());
  music.setActive(true);
  context.decoded();
  await music.unlock();
  context.currentTime = 11;
  context.suspendGate = deferred<void>();
  music.setHidden(true);
  music.setHidden(false);
  assert.equal(music.status.playing, false);
  assert.equal(context.sources.length, 1);
  context.suspendGate.resolve();
  await flush();
  assert.equal(music.status.playing, true);
  assert.equal(context.sources.length, 2);
  assert.equal(context.sources[1].offset, 13);
});

void test('a late resume after entering a level never starts a source or leaves context running', async t => {
  const { music, context } = fixture();
  t.after(() => music.dispose());
  context.resumeGate = deferred<void>();
  music.setActive(true);
  context.decoded();
  const unlocking = music.unlock();
  await flush();
  music.setActive(false);
  await flush();
  context.resumeGate.resolve();
  await unlocking;
  await flush();
  assert.equal(context.sources.length, 0);
  assert.equal(context.state, 'suspended');
});

void test('resume denial stays silent without a retry loop and can recover on a later gesture', async t => {
  const { music, context } = fixture();
  t.after(() => music.dispose());
  context.resumeGate = deferred<void>();
  music.setActive(true);
  context.decoded();
  const unlocking = music.unlock();
  context.resumeGate.reject(new Error('Gesture required'));
  await unlocking;
  await flush();
  assert.equal(context.resumeCalls, 1);
  assert.equal(context.sources.length, 0);
  assert.equal(music.status.playing, false);
  context.resumeGate = null;
  await music.unlock();
  assert.equal(music.status.playing, true);
});
