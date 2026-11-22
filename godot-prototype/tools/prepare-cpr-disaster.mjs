/** Copy existing CPR/disaster art and serialize original cues. No new level content. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { dependency, root } from '../../scripts/lib/dependencies.mjs';
const source=path.join(root,'public');
const assets=path.join(root,'godot-prototype/assets');
const load=file=>JSON.parse(fs.readFileSync(path.join(root,'content',file),'utf8'));
const ensure=dir=>fs.mkdirSync(dir,{recursive:true});
const write=(dir,name,data)=>{ensure(dir);fs.writeFileSync(path.join(dir,name),JSON.stringify(data,null,2)+'\n');};
function localize(value, dir, group) {
  if (typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')) {
    const local=path.basename(value);
    const file=path.join(source,value.slice(1));
    assert(fs.existsSync(file),value);
    ensure(dir);
    fs.copyFileSync(file,path.join(dir,local));
    return `res://assets/${group}/${local}`;
  }
  if(Array.isArray(value))return value.map(item=>localize(item,dir,group));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,localize(v,dir,group)]));
  return value;
}
const cpr=path.join(assets,'cpr_runner');
const authored=load('first-aid/cpr/skin.json');
const icons={};
for(const name of ['phone','aed','hands','kneel','rhythm','relay','check','hands-chest','hands-abdomen','posture-straight','posture-bent']) {
  icons[name]=`/ui/response-training-v1/${name}.svg`;
}
write(cpr,'pack.json',{
  rules:load('first-aid/cpr/rules.json'),
  presentation:load('first-aid/cpr/presentation.json'),
  skin:localize({...authored,helper:'/levels/first-aid-cpr/helper.png',icons},cpr,'cpr_runner'),
});
for(const id of ['rain-street-preparation-v1','flood-house-response-v1']){
  const group=`disaster_runner/${id}`;
  const dir=path.join(assets,group);
  write(dir,'pack.json',{
    rules:load(`disaster/${id}/rules.json`),
    skin:localize(load(`disaster/${id}/skin.json`),dir,group),
    safe_hold_ms:load('journey-timing.json').safeHold,
  });
}
const compiled=await dependency('esbuild').build({absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',stdin:{resolveDir:root,contents:`export {practiceSfxSamples, practiceSfxCalibrationGain} from './app/game/runtime/practice-audio';`}});
const {practiceSfxSamples,practiceSfxCalibrationGain}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const cueDir=path.join(assets,'shared_cues');ensure(cueDir);
for(const id of ['goal-confirm','wrong-warning','soft-tap','medical-connect','rescue-arrival']){
  const samples=practiceSfxSamples(id),sampleRate=22050;
  const bytes=Buffer.alloc(44+2*samples.length);
  bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(sampleRate,24);
  bytes.writeUInt32LE(sampleRate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples.length*2,40);
  samples.forEach((sample,i)=>bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample*practiceSfxCalibrationGain))*32767),44+2*i));
  fs.writeFileSync(path.join(cueDir,`${id}.wav`),bytes);
}
for(const [name,source] of [['victory','art-source/settlement-audio-v1/approved/01-victory-short.wav'],['failure','art-source/settlement-audio-v1/approved/02-failure-short.wav']]) {
  const file=path.join(root,source);
  if(fs.existsSync(file))fs.copyFileSync(file,path.join(cueDir,`${name}.wav`));
}
console.log('Prepared original CPR/disaster rules and interface assets');
