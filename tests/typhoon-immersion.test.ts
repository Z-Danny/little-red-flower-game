import './typhoon-deadline.test';
import './challenge-hud.test';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getHunt, huntPacks} from '../app/game/scene-hunt/registry';
import {checkHunt} from '../app/game/scene-hunt/schema';
import {presentationOf} from '../app/game/scene-hunt/presentation';
import {createHunt, reduceHunt, pressure} from '../app/game/scene-hunt/model';
import {countdownState, fearMoment, fearMotion} from '../app/game/scene-hunt/tension';
import {fearSamples} from '../app/game/scene-hunt/nonverbal';
import {HuntSound} from '../app/game/scene-hunt/sound';
const pack = getHunt('typhoon-home')!;
test('all hunts use 50-second bar / disclosure; typhoon character screams stay disabled', () => {
  assert.equal(pack.rules.seconds, 50);
  assert.equal(pack.rules.timeout, 'fail');
  assert.equal(presentationOf(pack).timer, 'pressure-bar');
  assert.equal(presentationOf(pack).clues, 'on-demand');
  assert.equal(presentationOf(pack).characterAudio, 'none');
  for (const other of huntPacks.filter(p => p.rules.id !== pack.rules.id)) {
    assert.equal(presentationOf(other).timer, 'pressure-bar');
    assert.equal(presentationOf(other).clues, 'on-demand');
    assert.equal(other.rules.seconds, 50);
    assert.notEqual(presentationOf(other).characterAudio, 'nonverbal-fear');
    assert.equal(other.rules.timeout, 'fail');
    checkHunt(other);
  }
});
for (const [ms, remain, stage] of [[0,50,'steady'],[24999,26,'steady'],[25000,25,'warning'],[40000,10,'danger'],[49999,1,'danger'],[50000,0,'peak'],[60000,0,'peak']] as const) {
  test(`countdown ${ms} matches the same pressure clock`, () => {
    const state = countdownState(ms, 50);
    assert.equal(state.secondsLeft, remain);
    assert.equal(state.stage, stage);
    assert.equal(pressure(pack.rules, {...createHunt(), elapsed: ms}), state.progress);
    assert.equal(state.remaining, 1 - state.progress);
  });
}
test('50-second timeout blocks late input and permits a fresh reset', () => {
  let r = reduceHunt(pack.rules, createHunt(), {type:'start'});
  for(let i=0;i<500;i++) r=reduceHunt(pack.rules,r,{type:'tick',ms:100});
  assert.equal(r.peak,true); assert.equal(r.phase,'failed');
  for(const target of pack.rules.targets){
    r=reduceHunt(pack.rules,r,{type:'tap',id:target.id,x:1,y:1});
    for(let i=0;i<8;i++)r=reduceHunt(pack.rules,r,{type:'tick',ms:100});
  }
  assert.equal(r.phase,'failed');assert.equal(r.stars,0);assert.equal(r.found.length,0);
  assert.deepEqual(reduceHunt(pack.rules,r,{type:'reset'}),createHunt());
});
test('fear cues and movement share normalized clock without breathing loops or timeout repeats', () => {
  assert.equal(fearMoment(7999,50),null);
  for(const ms of [8000,27000,43000]) {
    const moment=fearMoment(ms,50)!;
    assert.equal(moment.age,0);
    assert.ok(fearMotion(ms+500,50)>0);
    assert.equal(fearMotion(ms+1100,50),0);
  }
  assert.equal(fearMoment(50000,50),null);
  assert.equal(fearMoment(60000,50),null);
  assert.equal(fearMoment(14400,90)?.slot,0);
});
for(const kind of ['startle','fright','alarm'] as const) for(const rate of [8000,22050,48000]) {
  test(`CC0 recorded ${kind} at ${rate}Hz is finite, bounded, faded and reproducible`,()=>{
    const a=fearSamples(kind,rate),b=fearSamples(kind,rate);
    assert.deepEqual(a,b);
    assert.ok(a.length>rate*.4&&a.length<rate*.9);
    assert.equal(Math.abs(a[0]),0);assert.equal(Math.abs(a.at(-1)!),0);
    let energy=0,peak=0;
    for(const v of a){assert.ok(Number.isFinite(v));energy+=v*v;peak=Math.max(peak,Math.abs(v));}
    assert.ok(peak<=.601&&peak>.2);
    assert.ok(Math.sqrt(energy/a.length)>.03);
  });
}
test('invalid opt-in settings fail early',()=>{
  for(const key of ['timer','clues','characterAudio']){
    const bad=structuredClone(pack) as any;bad.presentation[key]='bad';assert.throws(()=>checkHunt(bad));
  }
});
test('character channel respects single cue, pause, reset, mute, background, finish and disposal',async()=>{
  const Original=globalThis.AudioContext;
  class P{value=0;setValueAtTime(v:number){this.value=v;}setTargetAtTime(v:number){this.value=v;}linearRampToValueAtTime(v:number){this.value=v;}exponentialRampToValueAtTime(v:number){this.value=v;}}
  class N{gain=new P();frequency=new P();threshold=new P();ratio=new P();attack=new P();release=new P();onended:(()=>void)|null=null;connect(){}disconnect(){}start(){}stop(){this.onended?.();}}
  class C{state='suspended';currentTime=1;sampleRate=8000;destination={};createGain(){return new N();}createBiquadFilter(){return new N();}createOscillator(){return new N();}createBufferSource(){return new N();}createDynamicsCompressor(){return new N();}createAnalyser(){return Object.assign(new N(),{fftSize:256,getFloatTimeDomainData:(a:Float32Array)=>a.fill(0)});}createBuffer(_:number,n:number,rate:number){const data=new Float32Array(n);return{duration:n/rate,getChannelData:()=>data};}async resume(){this.state='running';}async close(){this.state='closed';}}
  globalThis.AudioContext=C as any;
  const sound=new HuntSound('storm',undefined,{seconds:50,character:'nonverbal-fear'});
  const scheduler=()=> (sound as any).schedule();
  try{
    assert.equal(sound.status,'locked');await sound.unlock();
    sound.setScene(true,.16,false,8000);scheduler();assert.equal(sound.characterCueCount,1);assert.equal(sound.lastCharacterCue,'startle');
    scheduler();assert.equal(sound.characterCueCount,1);
    sound.setScene(false,.16,false,8000);assert.equal((sound as any).fearSources.size,0);scheduler();assert.equal(sound.characterCueCount,1);
    sound.setScene(true,.54,false,27000);sound.setMuted(true);scheduler();assert.equal(sound.characterCueCount,1);
    sound.setMuted(false);sound.setHidden(true);scheduler();assert.equal(sound.characterCueCount,1);
    sound.setHidden(false);scheduler();assert.equal(sound.characterCueCount,2);
    sound.setCharacter(false);assert.equal((sound as any).fearSources.size,0);
    sound.setScene(true,.86,false,43000);scheduler();assert.equal(sound.characterCueCount,2);
    sound.setCharacter(true);scheduler();assert.equal(sound.characterCueCount,3);
    sound.setScene(true,0,true,45000);scheduler();assert.equal(sound.characterCueCount,3);assert.equal((sound as any).fearSources.size,0);
    sound.fail();assert.equal(sound.lastCue,'timeout');assert.equal((sound as any).sceneActive,false);assert.equal((sound as any).fearSources.size,0);
    (sound as any).ctx.currentTime+=2;scheduler();assert.equal((sound as any).master.gain.value,0);
    sound.reset();assert.equal(sound.characterCueCount,0);
    sound.setScene(true,.16,false,8000);scheduler();assert.equal(sound.characterCueCount,1);
    const disabled=new HuntSound('storm',undefined,{seconds:50,character:presentationOf(pack).characterAudio});
    try {
      await disabled.unlock();disabled.setCharacter(true);
      for(const elapsed of [0,8000,27000,43000,49999]){
        disabled.setScene(true,elapsed/50000,false,elapsed);(disabled as any).schedule();
        assert.equal(disabled.characterCueCount,0);assert.equal((disabled as any).fearSources.size,0);
        assert.equal(disabled.music,true);assert.ok((disabled as any).musicBus.gain.value>0);
        assert.ok((disabled as any).rain.gain.value>0);assert.ok((disabled as any).wind.gain.value>0);
      }
      disabled.reset();disabled.setScene(true,.86,false,43000);(disabled as any).schedule();assert.equal(disabled.characterCueCount,0);
    }finally{disabled.dispose();}
  }finally{sound.dispose();globalThis.AudioContext=Original;}
  assert.equal(sound.status,'locked');assert.equal((sound as any).fearSources.size,0);
});
