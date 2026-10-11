import test from 'node:test';
import assert from 'node:assert/strict';
import { CprSound, cprInputCue } from '../app/game/first-aid/cpr-audio';
import { createCpr, reduceCpr } from '../app/game/first-aid/cpr-model';
import { approvedSoundSamples } from '../app/game/audio/result-samples';
import { practiceSfxSamples } from '../app/game/runtime/practice-audio';
class Param { value = 0; cancelScheduledValues() {} setTargetAtTime(v: number) { this.value = v; } }
class Node {
  output: Node | null = null; disconnected = false;
  connect(target: Node) { this.output = target; return target; }
  disconnect() { this.disconnected = true; this.output = null; }
}
class Gain extends Node { gain = new Param(); }
class Buffer {
  numberOfChannels = 1; data: Float32Array;
  constructor(readonly length: number, readonly sampleRate: number) { this.data = new Float32Array(length); }
  getChannelData() { return this.data; }
}
class Source extends Node {
  buffer: Buffer | null = null; loop = false; starts = 0; stops = 0; playbackRate = new Param(); frequency = new Param(); type = '';
  onended: (() => void) | null = null;
  start() { this.starts++; } stop() { this.stops++; this.onended?.(); }
}
class Context {
  currentTime = 10; state = 'suspended'; destination = new Node(); sources: Source[] = []; gains: Gain[] = []; closes = 0;
  createGain() { const g = new Gain(); this.gains.push(g); return g; }
  createBufferSource() { const s = new Source(); this.sources.push(s); return s; }
  createOscillator() { return this.createBufferSource(); }
  createBuffer(_channels: number, length: number, sr: number) { return new Buffer(length, sr); }
  createBiquadFilter() { return Object.assign(new Node(), { frequency: new Param(), Q: new Param(), type: '' }); }
  createDynamicsCompressor() { return Object.assign(new Node(), { threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }); }
  createWaveShaper() { return Object.assign(new Node(), { curve: null, oversample: '' }); }
  createAnalyser() { return Object.assign(new Node(), { fftSize: 0, getFloatTimeDomainData: (data: Float32Array) => data.fill(.01) }); }
  async decodeAudioData() { return new Buffer(64, 22050); }
  async resume() { this.state = 'running'; } async suspend() { this.state = 'suspended'; } async close() { this.state = 'closed'; this.closes++; }
}

test('audio maps accepted inputs without changing CPR rules or generating rejected beat cues', () => {
 let s=createCpr();assert.equal(cprInputCue(s,{type:'start'}),null);
 assert.equal(cprInputCue(s,{type:'call'}),'medical-connect');
 s=reduceCpr(s,{type:'call'});assert.equal(cprInputCue(s,{type:'call'}),null);assert.equal(cprInputCue(s,{type:'continue'}),null);
 s={...s,phase:'position',requestedAt:0,review:null};
 assert.equal(cprInputCue(s,{type:'position',correct:false}),'wrong-warning');
 assert.equal(cprInputCue(s,{type:'position',correct:true}),'goal-confirm');
 s={...s,phase:'rhythm',elapsed:500,lastTap:490,pulseAt:490};
 assert.equal(cprInputCue(s,{type:'tap'}),null);
 s={...s,elapsed:1000};assert.equal(cprInputCue(s,{type:'tap'}),'soft-tap');
 assert.equal(cprInputCue(s,{type:'tick',dt:30}),null);
});
test('uses exact previous-level samples; pause, mute, hidden and dispose cancel and never replay', async () => {
 const context=new Context();let created=0;const sound=new CprSound(()=>{created++;return context as unknown as AudioContext;});
 sound.setPolicy(true,false,false);sound.play('goal-confirm');assert.equal(created,0);
 sound.unlock();await Promise.resolve();sound.play('goal-confirm');
 assert.deepEqual(context.sources[0].buffer!.data,practiceSfxSamples('goal-confirm'));
 sound.play('victory');assert.deepEqual(context.sources[1].buffer!.data,approvedSoundSamples('victory'));
 assert.equal(context.sources[1].buffer!.sampleRate,44100);
 for(const [active,muted,hidden] of [[false,false,false],[true,true,false],[true,false,true]]) {
   sound.setPolicy(active,muted,hidden);const before=sound.status.played;
   sound.play('soft-tap');sound.unlock();assert.equal(sound.status.played,before);assert.equal(sound.status.voices,0);
   assert.equal(context.state,'suspended');
   sound.setPolicy(true,false,false);sound.unlock();await Promise.resolve();
   assert.equal(sound.status.played,before);sound.play('soft-tap');assert.equal(sound.status.played,before+1);
 }
 sound.dispose();assert.equal(context.closes,1);assert.equal(sound.status.voices,0);assert(context.sources.every(s=>s.stops>0));
 sound.unlock();sound.play('victory');assert.equal(created,1);
});
test('pending resume cannot play a stale input after pause or mute', async () => {
 const context=new Context();let resolve!:()=>void;
 context.resume=()=>new Promise<void>(done=>{resolve=()=>{context.state='running';done();};});
 const sound=new CprSound(()=>context as unknown as AudioContext);
 sound.setPolicy(true,false,false);sound.unlock();sound.play('soft-tap');sound.setPolicy(false,false,false);
 resolve();await Promise.resolve();await Promise.resolve();assert.equal(sound.status.played,0);sound.dispose();
});
