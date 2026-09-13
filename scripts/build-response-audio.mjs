import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fearFoley, fearDurations } from './lib/fear-foley.mjs';
const root = resolve(import.meta.dirname, '..'), rate = 22050;
const manifest = JSON.parse(readFileSync(resolve(root, 'content/response/audio-manifest.json'), 'utf8'));
const report = [];
// These are authored synth recipes, not downloaded recordings or generated speech.
function noise(seed) { let x = seed; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 2147483648 - 1; }; }
const sin = (hz,t) => Math.sin(2*Math.PI*hz*t);
function synth(id, seconds) {
 id=id.replace(/^fx-/, '');
 const n = noise([...id].reduce((n,c)=>n*31+c.charCodeAt(0),17)), samples = new Float32Array(Math.round(rate*seconds));
 let low=0, smooth=0;
 for (let i=0;i<samples.length;i++) {
  const t=i/rate, white=n(); low=low*.982+white*.018; smooth=smooth*.72+white*.28;
  let v=0;
  if(id==='music-bed') { const swell=.7+.3*Math.sin(t*Math.PI/4); v=(sin(73.416,t)*.16+sin(110,t)*.07+sin(146.832,t)*.035)*swell; }
  if(id==='music-pulse'||id==='music-high') {
   const beat=id==='music-high'?1/3:2/3, phase=t%beat, step=Math.floor(t/beat), hz=[146.832,174.614,220,164.814][Math.floor(step/3)%4];
   const env=(1-Math.exp(-phase*100))*Math.exp(-phase*(id==='music-high'?19:11));
   v=id==='music-high'?(sin(hz*2,t)+.16*sin(hz*4.006,t))*env*.16 : (sin(hz/2,t)+.3*sin(hz,t))*env*.19;
  }
  if(id==='fire') v=low*1.8+smooth*.28+white*.4*Math.pow(Math.max(0,sin(27.375,t)*sin(41.75,t)),12);
  if(id==='draft') v=low*1.1*(.6+.4*sin(.375,t))+smooth*.035;
  if(id==='breathing') {const phase=t%2, env=Math.pow(Math.max(0,sin(.5,phase)),2);v=(smooth*.1+low*.35)*env;}
  if(id==='gasp') v=(smooth*.24+low*.25)*Math.sin(Math.PI*Math.min(1,t/.45))**2*Math.exp(-t*2);
  if(id==='relief') v=(smooth*.1+low*.35)*(1-Math.exp(-t*18))*Math.exp(-t*3);
  if(id==='pickup') v=(smooth*.17+sin(240,t)*.1)*Math.exp(-t*22);
  if(id==='gas') v=(white*.25+sin(610,t)*.2)*Math.exp(-t*52)+(t>.15?(white*.12+sin(350,t)*.13)*Math.exp(-(t-.15)*70):0);
  if(id==='lid') v=(sin(380,t)+.4*sin(771,t)+.2*sin(1450,t))*.16*Math.exp(-t*9)+white*.1*Math.exp(-t*70);
  if(id==='water') v=(smooth*.53+low*1.2)*(1-Math.exp(-t*100))*Math.exp(-t*1.9)+white*.13*Math.exp(-t*16);
  if(id==='cloth') v=smooth*.23*(1-Math.exp(-t*65))*Math.exp(-t*3)+white*.2*Math.pow(Math.max(0,sin(35,t)),14)*Math.exp(-t*2);
  if(id==='flare') v=(low*2.3+smooth*.18)*(1-Math.exp(-t*55))*Math.exp(-t*2.5);
  if(id==='spray') v=(white-smooth)*.2*Math.min(1,t*35)*Math.min(1,(seconds-t)*10);
  if(id==='bounce') v=sin(160,t)*.12*Math.exp(-t*17)+smooth*.1*Math.exp(-t*15);
  if(id==='steps') {const p=t%.32;v=(low+smooth*.23)*Math.exp(-p*30);}
  if(id==='success') {for (const [j,hz] of [293.665,369.994,440,587.33].entries()) { const p=t-j*.16;if(p>=0)v+=sin(hz,t)*.12*Math.exp(-p*3.8)*(1-Math.exp(-p*70));}}
  samples[i]=v;
 }
 return samples;
}
export function encodeWave(samples) {
 const bytes=Buffer.alloc(44+samples.length*2);bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples.length*2,40);
 samples.forEach((v,i)=>bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));return bytes;
}
for(const [id,asset] of Object.entries(manifest.assets)) {
 const seconds=asset.loop?8:(fearDurations[id]??{'fx-water':1.5,cloth:1.2,flare:1.35,spray:1,steps:1.25,success:1.8,relief:1.1}[id]??.65);
 let samples=id in fearDurations?fearFoley(id,rate):synth(id,seconds);
 const dc=samples.reduce((a,b)=>a+b,0)/samples.length;samples=samples.map(v=>v-dc);
 const peak=samples.reduce((a,b)=>Math.max(a,Math.abs(b)),0);if(peak<.001)throw new Error('Silent '+id);
 const rms=Math.sqrt(samples.reduce((a,b)=>a+b*b,0)/samples.length), target=id in fearDurations?.18:asset.loop?.105:.13;
 const gain=Math.min(.78/peak,target/rms);
 const fade=Math.round(rate*.012);
 samples=samples.map((v,i)=>v*gain*Math.min(1,i/fade,(samples.length-1-i)/fade));
 const out=resolve(root,'public'+asset.src);mkdirSync(dirname(out),{recursive:true});const bytes=encodeWave(samples);writeFileSync(out,bytes);
 const finalPeak=samples.reduce((a,b)=>Math.max(a,Math.abs(b)),0),finalRms=Math.sqrt(samples.reduce((a,b)=>a+b*b,0)/samples.length);
 report.push({id,src:asset.src,origin:'Original deterministic DSP, no spoken words',seconds:samples.length/rate,peakDb:20*Math.log10(finalPeak),rmsDb:20*Math.log10(finalRms),sha256:createHash('sha256').update(bytes).digest('hex')});
}
mkdirSync(resolve(root,'docs/response-workflow/verification'),{recursive:true});writeFileSync(resolve(root,'docs/response-workflow/verification/audio-assets.json'),JSON.stringify({sampleRate:rate,format:'PCM16 mono',measurement:'sample peak/RMS, not LUFS or listening approval',assets:report},null,2));console.log(`Built ${report.length} offline audio assets`);
