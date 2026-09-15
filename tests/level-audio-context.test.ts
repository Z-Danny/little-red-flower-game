import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { primeLevelAudioContext, releaseLevelAudioContext, takeLevelAudioContext } from '../app/game/level-audio-context';
import { selectInterfaceSoundPolicy } from '../components/game/level-interface-sound-context';

test('settlement buttons follow the level mute and SFX volume, then restore map preferences', () => {
  assert.deepEqual(selectInterfaceSoundPolicy(false, { muted: true, volume: 1 }, true), { muted: true, volume: 1 });
  assert.deepEqual(selectInterfaceSoundPolicy(true, { muted: false, volume: .22 }, true), { muted: false, volume: .22 });
  assert.deepEqual(selectInterfaceSoundPolicy(false, { muted: false, volume: 0 }, true), { muted: false, volume: 0 });
  assert.deepEqual(selectInterfaceSoundPolicy(false, { muted: true, volume: 0 }, false), { muted: false, volume: 1 });
  assert.deepEqual(selectInterfaceSoundPolicy(true, { muted: false, volume: 1 }, false), { muted: true, volume: 1 });
});

test('only the player reports policy; result portal capture cannot recursively report or double-play', () => {
  const main = readFileSync('components/game/game-app.tsx', 'utf8');
  const hook = readFileSync('components/game/use-interface-sound.ts', 'utf8');
  assert.match(main, /<LevelInterfaceSoundContext\.Provider value=\{reportLevelInterfacePolicy\}>\s*\{player\}\s*<\/LevelInterfaceSoundContext\.Provider>\s*\{finished &&/);
  assert.match(main, /const reportLevelInterfacePolicy = useCallback\([\s\S]*?current\.muted === policy\.muted && current\.volume === policy\.volume \? current : policy\);\s*\}, \[\]\);/);
  assert.match(main, /selectInterfaceSoundPolicy\(muted, levelInterfacePolicy, !!active && finished\)/);
  assert.match(main, /useInterfaceSound\(interfacePolicy\.muted, interfacePolicy\.volume, setInterfaceSession, !active \|\| finished\)/);
  assert.match(hook, /reportLevelPolicy\?\.\(\{ muted, volume \}\); \}, \[muted, volume, reportLevelPolicy\]/);
});

test('the validated map gesture primes one silent context and transfers disposal ownership once', () => {
  const created: FakeContext[] = [];
  class FakeContext {
    state = 'suspended';
    sampleRate = 44100;
    destination = {};
    resumes = 0;
    sources = 0;
    closes = 0;
    constructor() { created.push(this); }
    createBuffer() { return {}; }
    createBufferSource() { this.sources++; return { buffer: null, connect() {}, disconnect() {}, start() {}, onended: null }; }
    resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
    close() { this.closes++; this.state = 'closed'; return Promise.resolve(); }
  }
  const previousAudio = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const activation = { isActive: true };
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeContext });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userActivation: activation } });
  try {
    primeLevelAudioContext();
    assert.equal(created.length, 1);
    assert.equal(created[0].resumes, 1, 'resume must begin before the gesture callback returns');
    assert.equal(created[0].sources, 1, 'the output route receives only a silent buffer');
    assert.equal(takeLevelAudioContext(), created[0]);
    releaseLevelAudioContext();
    assert.equal(created[0].closes, 0, 'the engine now owns the transferred context');
    assert.notEqual(takeLevelAudioContext(), created[0], 'a second engine cannot claim the first context');

    primeLevelAudioContext();
    const abandoned = created.at(-1)!;
    primeLevelAudioContext();
    assert.equal(abandoned.closes, 1, 'superseded loading sessions release their reservation');
    const cancelled = created.at(-1)!;
    releaseLevelAudioContext();
    releaseLevelAudioContext();
    assert.equal(cancelled.closes, 1, 'leaving a loading scene is safe to repeat');

    activation.isActive = false;
    const before = created.length;
    primeLevelAudioContext();
    assert.equal(created.length, before, 'programmatic starts do not pretend to unlock user audio');
  } finally {
    releaseLevelAudioContext();
    for (const context of created) if (context.state !== 'closed') void context.close();
    if (previousAudio) Object.defineProperty(globalThis, 'AudioContext', previousAudio);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});
