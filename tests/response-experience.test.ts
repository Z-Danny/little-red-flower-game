import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { responsePressure, actorMotion, inverseActorPoint } from '../app/game/response/pressure';
import { CueTimeline, kitchen50sCues, kitchenCues, type AudioFrame } from '../app/game/response/audio-cues';
import { ResponseAudio, defaultAudioSettings, audioBytes } from '../app/game/response/audio';
import manifest from '../content/response/audio-manifest.json';
import rules from '../content/templates/response/level.json';
import skin from '../content/templates/response/skins/illustrated.json';
import { validatePackage } from '../app/game/runtime/validate';
import { kitchenPressure, kitchenTempo } from '../app/game/kitchen/experience';
import { createRun, reduceRun } from '../app/game/kitchen/model';
const frame: AudioFrame = { elapsed: 1000, active: true, intensity: .3, flame: 1, smoke: .5, resolved: false, tier: 0, milestones: [] };
test('waiting increases flame, soot, heat and fear monotonically',()=>{
 const samples=[.22,.5,.8,1].map(risk=>responsePressure({risk}));
 for(let i=1;i<samples.length;i++)for(const key of ['intensity','flame','smoke','heat','fear'] as const)assert.ok(samples[i][key]>samples[i-1][key],key);
});
test('wrong impulse simultaneously raises visual and audio pressure; bounded at maximum',()=>{
 const a=responsePressure({risk:.3}),b=responsePressure({risk:.3,impulse:.8});
 for(const k of ['intensity','flame','smoke','heat','fear'] as const)assert.ok(b[k]>a[k]);
 const max=responsePressure({risk:100,impulse:100});assert.ok(max.flame<=2.65);assert.equal(max.tier,2);
});
test('sealing never paints top flames; removing heat alone is not a win',()=>{
 assert.equal(responsePressure({risk:1,sealed:true}).flame,0);
 const partial=responsePressure({risk:1,sourceOff:true});assert.ok(partial.flame>0);assert.equal(partial.resolved,false);
 const safe=responsePressure({risk:1,impulse:1,resolved:true,settleMs:1700});assert.deepEqual([safe.flame,safe.smoke,safe.heat,safe.fear],[0,0,0,0]);
});
test('presentation never mutates kitchen flags or risk',()=>{const r=reduceRun(createRun(),{type:'start'}),before=structuredClone(r);kitchenPressure(r);assert.deepEqual(r,before);});
test('actor breathing has planted feet; reduced motion remains still',()=>{
 const box={x:100,y:200,w:200,h:500};const a=actorMotion(box,250,.9),b=actorMotion(box,870,.9);assert.notDeepEqual(a,b);
 assert.ok(Math.abs(a.box.y+a.box.h-700)<1e-8);assert.deepEqual(actorMotion(box,870,.9,true),{box,angle:0});
});
test('actor inverse picking follows the rotated physical sprite',()=>{
 const pose=actorMotion({x:100,y:200,w:200,h:500},750,.9),p={x:pose.box.x+23,y:pose.box.y+32},cx=pose.box.x+pose.box.w/2,cy=pose.box.y+pose.box.h;
 const dx=p.x-cx,dy=p.y-cy,c=Math.cos(pose.angle),s=Math.sin(pose.angle),screen={x:cx+c*dx-s*dy,y:cy+s*dx+c*dy};
 const restored=inverseActorPoint(pose,screen);assert.ok(Math.hypot(restored.x-p.x,restored.y-p.y)<1e-8);
});
test('lid contact sound fires once at 60%, not on selecting or every tick',()=>{
 const t=new CueTimeline();t.advance(frame);const f={...frame,action:{id:'a',kind:'cover',age:590,duration:1000}};
 assert.deepEqual(t.advance(f),[]);assert.equal(t.advance({...f,action:{...f.action,age:600}})[0].sound,'fx-lid');assert.deepEqual(t.advance({...f,action:{...f.action,age:800}}),[]);
});
test('both wrong actions provide distinct material sound, flare and nonverbal reaction',()=>{
 for(const kind of ['water','cloth']){const t=new CueTimeline(kitchen50sCues);t.advance(frame);const cues=t.advance({...frame,action:{id:kind,kind,age:180,duration:1050}});assert.ok(cues.some(c=>c.sound===(kind==='water'?'fx-water':'cloth')));assert.ok(cues.some(c=>c.sound==='flare'));assert.ok(cues.some(c=>c.character==='fear-startle'));}
});
test('pause emits no cues, reset allows replay, completion uses a nonverbal exhale',()=>{
 const t=new CueTimeline();assert.deepEqual(t.advance({...frame,active:false}),[]);assert.ok(t.advance(frame).length);assert.deepEqual(t.advance(frame),[]);t.reset();assert.ok(t.advance(frame).length);
 const c=t.advance({...frame,resolved:true,milestones:['gasOff','covered','controlled']});assert.deepEqual(c.filter(c=>c.character).map(c=>c.character),['relief']);
});
test('audio manifest contains real bounded PCM files, including all required nonverbal/error sounds',()=>{
 for(const [id,a] of Object.entries(manifest.assets)){
  const path=resolve(process.cwd(),'public'+a.src);assert.ok(existsSync(path),id);const b=readFileSync(path);assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.readUInt32LE(24),22050);assert.equal(b.readUInt16LE(34),16);
  let energy=0,peak=0;for(let i=44;i<b.length;i+=2){const v=b.readInt16LE(i)/32768;energy+=v*v;peak=Math.max(peak,Math.abs(v));}
  assert.ok(energy>.01,id);assert.ok(peak<=.79,id);assert.ok(b.length<500000,id);
 }
});
test('narration is absent from assets, cue schema and the audio implementation',()=>{
 assert.equal(Object.keys(manifest.assets).length,21);
 assert.ok(Object.values(manifest.assets).every(a=>!a.src.includes('voice-')));
 assert.ok(!readdirSync(resolve(process.cwd(),'public/audio/response-v1')).some(n=>n.startsWith('voice-')));
 const implementation=readFileSync(resolve(process.cwd(),'app/game/response/audio.ts'),'utf8');assert.ok(!/speechSynthesis|SpeechSynthesisUtterance|bus: 'voice'/.test(implementation));
 const s=structuredClone(skin) as any;s.response.cues.actions.cover.voice='gasp';assert.throws(()=>validatePackage(rules,s),/未知字段/);
});
test('embedded offline audio decoding does not call fetch',async()=>{
 const before=globalThis.fetch;globalThis.fetch=()=>{throw Error('Network forbidden');};try{assert.deepEqual([...new Uint8Array(await audioBytes('data:audio/wav;base64,AQID'))],[1,2,3]);}finally{globalThis.fetch=before;}
});
test('new response templates opt into common motion/effects/cues and validate stop conditions',()=>{
 assert.ok(validatePackage(rules,skin).skin.response);for(const mutate of [(s:any)=>s.response.controlledBy=[],(s:any)=>s.response.actor='ghost',(s:any)=>s.response.cues.actions.cover.at=2,(s:any)=>s.response.cues.actions.cover.sound='missing']){const s=structuredClone(skin);mutate(s);assert.throws(()=>validatePackage(rules,s));}
});
class Param{value=0;cancelScheduledValues(){}setTargetAtTime(v:number){this.value=v;}}
class Node{gain=new Param();connect(){}disconnect(){}}
class Source extends Node{buffer:any;loop=false;playbackRate=new Param();onended:(()=>void)|null=null;started=false;stopped=false;start(){this.started=true;}stop(){this.stopped=true;this.onended?.();}}
class FakeContext{
 state='suspended';currentTime=10;sources:Source[]=[];
 destination=new Node();async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}
 createGain(){return new Node();}createDynamicsCompressor(){return Object.assign(new Node(),{threshold:new Param(),knee:new Param(),ratio:new Param(),attack:new Param(),release:new Param()});}
 createAnalyser(){return Object.assign(new Node(),{fftSize:256,getFloatTimeDomainData:(d:Float32Array)=>d.fill(.02)});}
 createBufferSource(){const s=new Source();this.sources.push(s);return s;}async decodeAudioData(){return {};}
}
test('audio lifecycle: unlock twice = six beds, max six Foley, pause/hidden/mute/restart and dispose clean up',async()=>{
 const originalCtx=globalThis.AudioContext,originalFetch=globalThis.fetch;let c:FakeContext;
 globalThis.AudioContext=class extends FakeContext{constructor(){super();c=this;}} as any;globalThis.fetch=(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})) as any;
 try{
  const a=new ResponseAudio();a.update({...frame,tempo:1.2});await a.unlock();await a.unlock();assert.equal(a.status().loops,6);assert.equal(a.status().loaded,Object.keys(manifest.assets).length);
  assert.equal(a.status().musicRate,1.2);
  for(let i=0;i<20;i++)a.play('pickup');assert.ok(a.status().sfx<=6);
  a.update({...frame,active:false});assert.equal(a.status().state,'suspended');assert.equal(a.status().rms,0);assert.equal(a.status().sfx,0);
  a.update(frame);a.setHidden(true);assert.equal(a.status().state,'suspended');a.setHidden(false);assert.equal(a.status().state,'running');
  a.setSettings({...defaultAudioSettings,muted:true});assert.equal(a.status().rms,0);a.reset();assert.equal(a.status().loops,6);
  a.dispose();assert.equal(c!.state,'closed');assert.ok(c!.sources.every(s=>s.stopped));assert.equal(a.status().loops,0);
 }finally{globalThis.AudioContext=originalCtx;globalThis.fetch=originalFetch;}
});

test('nonverbal fear cadence accelerates, never overlaps actions or continues when controlled',()=>{
 const t=new CueTimeline(kitchen50sCues),f={...frame,intensity:.5,tier:1};
 assert.deepEqual(t.advance(f).filter(c=>c.character).map(c=>c.character),['fear-inhale']);
 assert.deepEqual(t.advance({...f,elapsed:10499}),[]);
 assert.equal(t.advance({...f,elapsed:10500})[0].character,'fear-tremble');
 const urgent={...f,intensity:.9,tier:2,elapsed:18000};
 assert.equal(t.advance(urgent)[0].character,'fear-startle');
 assert.deepEqual(t.advance({...urgent,elapsed:23499}),[]);
 assert.equal(t.advance({...urgent,elapsed:23500})[0].character,'fear-inhale');
 assert.deepEqual(t.advance({...urgent,elapsed:23501}),[]);
 assert.deepEqual(t.advance({...urgent,elapsed:30000,action:{id:'quiet',kind:'unknown',duration:1000,age:0}}),[]);
 assert.deepEqual(t.advance({...urgent,elapsed:30000,resolved:true}),[]);
 assert.deepEqual(t.advance({...urgent,elapsed:30000,active:false}),[]);
 t.reset();assert.equal(t.advance(f)[0].character,'fear-inhale');
});
test('music acceleration is kitchen-specific, bounded and pressure-dependent',()=>{
 assert.equal(kitchenTempo(0),1.08);assert.equal(kitchenTempo(1),1.24);
 assert.equal(kitchenTempo(-10),1.08);assert.equal(kitchenTempo(10),1.24);
 assert.ok(kitchenTempo(.8)>kitchenTempo(.3));
});
test('legacy template audio stays independent of the kitchen 50-second profile',()=>{
 assert.equal(kitchenCues.opening,'gasp');assert.equal(kitchenCues.reactions,undefined);
 assert.equal(kitchenCues.actions.water.character,'gasp');assert.ok(kitchenCues.actions.spray);
 assert.equal(kitchen50sCues.opening,'fear-inhale');assert.ok(kitchen50sCues.reactions);
 assert.equal(kitchen50sCues.characterEnabled,false);assert.equal(kitchenCues.characterEnabled,undefined);
});

test('kitchen character policy rejects voice loading/playback while preserving music, fire and material effects',async()=>{
 const originalCtx=globalThis.AudioContext,originalFetch=globalThis.fetch;let c:FakeContext;
 const requests:string[]=[];
 globalThis.AudioContext=class extends FakeContext{constructor(){super();c=this;}} as any;
 globalThis.fetch=(async(src:string)=>{requests.push(src);return{ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};}) as any;
 const a=new ResponseAudio(kitchen50sCues);
 try{
  a.update(frame);await a.unlock();await a.unlock();
  assert.equal(a.status().loaded,14);assert.equal(a.status().loops,5);assert.equal(a.status().characterPlays,0);
  const characterAssets=Object.entries(manifest.assets).filter(([,v])=>v.bus==='character');
  for(const [,v]of characterAssets)assert.ok(!requests.includes(v.src));
  const buffers=(a as any).buffers,loops=(a as any).loops;
  for(const id of ['music-bed','music-pulse','music-high','fire','draft'])assert.ok(loops.has(id));
  for(const [id]of characterAssets)assert.ok(!buffers.has(id));
  a.setSettings({...defaultAudioSettings,character:1});
  for(const [i,elapsed]of [1000,10500,18000,23500,43000,50000].entries()){
   c!.currentTime+=3;a.update({...frame,elapsed,intensity:.95,tier:2});
   a.update({...frame,elapsed:elapsed+200,intensity:.95,tier:2,action:{id:'wrong-'+i,kind:i%2?'cloth':'water',age:200,duration:900}});
   assert.equal(a.status().characterPlays,0);assert.equal(a.status().characterCue,'');
   assert.equal((a as any).buses.get('character').gain.value,0);
   for(const key of ['music','ambience','sfx'])assert.ok((a as any).buses.get(key).gain.value>0);
  }
  const n=c!.sources.length;
  for(const [id]of characterAssets)a.play(id);
  assert.equal(c!.sources.length,n,'direct play cannot bypass disabled character channel');
  for(const id of ['pickup','fx-water','cloth','flare','fx-lid','fx-gas','success']){a.play(id);assert.equal(a.status().lastCue,id);}
  a.update({...frame,resolved:true,milestones:['controlled','evacuated']});assert.equal(a.status().characterPlays,0);
  a.setHidden(true);assert.equal(a.status().rms,0);a.setHidden(false);
  a.setSettings({...defaultAudioSettings,muted:true});assert.equal(a.status().rms,0);
  a.setSettings({...defaultAudioSettings,character:1});a.reset();a.update(frame);
  assert.equal(a.status().characterPlays,0);assert.equal(a.status().loops,5);
 }finally{a.dispose();globalThis.AudioContext=originalCtx;globalThis.fetch=originalFetch;}
 assert.equal(c!.state,'closed');assert.ok(c!.sources.every(s=>s.stopped));
});

test('optional per-scene character policy is validated without changing old templates',()=>{
 const s=structuredClone(skin) as any;s.response.cues.characterEnabled=false;assert.ok(validatePackage(rules,s));
 for(const value of ['false',0,null]){s.response.cues.characterEnabled=value;assert.throws(()=>validatePackage(rules,s),/characterEnabled/);}
});
