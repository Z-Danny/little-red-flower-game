/** Reskin compiler: same rules, new source-derived anatomical geometry. */
import fs from 'node:fs';import {createHash} from 'node:crypto';import {dependency} from './lib/dependencies.mjs';
const sharp=dependency('sharp'),out='public/levels/aed-realistic-v2',src='art-source/aed-realistic-v2';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rulePath='content/levels/first-aid-aed/level.json',before=hash(rulePath);
await sharp(`${src}/patient-source.png`).resize({width:640}).extend({top:2,bottom:2,left:2,right:2,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:94,alphaQuality:100}).toFile(`${out}/patient.webp`);
await sharp(`${src}/rescuer-source.png`).resize({width:600}).extend({top:2,bottom:2,left:2,right:2,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:94,alphaQuality:100}).toFile(`${out}/rescuer.webp`);
// Original vector garment and equipment connection layers; no raster repainting.
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1080" viewBox="0 0 720 1080">${body}</svg>`;
async function vector(id,body){const s=svg(body);fs.writeFileSync(`${src}/${id}.svg`,s);await sharp(Buffer.from(s)).png().toFile(`${out}/${id}.png`)}
await vector('shirt',`<defs><linearGradient id="fabric" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#809b8c"/><stop offset=".48" stop-color="#b0c0a8"/><stop offset="1" stop-color="#547767"/></linearGradient></defs><g stroke="#4d6759" stroke-linejoin="round"><path d="M307 397 Q322 390 337 390 L355 407 L370 390 Q393 390 407 401 L425 432 L403 443 L396 430 L398 507 Q355 519 311 507 L311 430 L297 443 L278 431Z" fill="url(#fabric)" stroke-width="1.6"/><path d="M336 391 L343 418 L355 408 L366 418 L373 391 M355 411 L355 511" fill="none" stroke-width="2"/><path d="M315 409 L312 432 M390 410 L397 437 M321 454 Q330 463 344 465 M394 478 L369 491 M316 499 Q330 493 341 497" fill="none" opacity=".35" stroke-width="3"/><path d="M317 424 L340 424 L339 442 L328 447 L317 443Z" fill="#8fa690" stroke-width="1"/><g fill="#e2dbbd" stroke-width=".5"><circle cx="357" cy="431" r="2"/><circle cx="357" cy="451" r="2"/><circle cx="357" cy="471" r="2"/><circle cx="357" cy="491" r="2"/></g></g>`);
await vector('moisture',`<g fill="#cae6e4" stroke="#5e9eaa" stroke-width="1" opacity=".75"><path d="M324 419 Q316 430 324 431 Q333 430 324 419Z"/><path d="M390 463 Q383 476 391 476 Q398 475 390 463Z"/></g>`);
await vector('cable-upper',`<path d="M327 419 C290 503 444 534 476 657" fill="none" stroke="#567671" stroke-width="3"/>`);
await vector('cable-side',`<path d="M393 451 C445 518 434 586 477 660" fill="none" stroke="#b29255" stroke-width="3"/>`);
const skin=read('content/levels/first-aid-aed/skins/illustrated.json');skin.id='realistic-v2';skin.presentation.noticeAppearance='scene';
const asset=(id,file)=>skin.assets[id]={src:`/levels/aed-realistic-v2/${file}`,alpha:true};
asset('patient','patient.webp');for(const id of ['helper-press-a','helper-press-b','helper-clear'])asset(id,'rescuer.webp');
for(const id of ['shirt','moisture','cable-upper','cable-side'])asset(id,`${id}.png`);
// Copy approved button artwork rather than synthesizing a level-specific button style.
await sharp('public/ui/painted-v1/modal-button-v2.webp').resize({width:512}).extend({top:2,bottom:2,left:2,right:2,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:94,alphaQuality:100}).toFile(`${out}/painted-button.webp`);asset('painted-button','painted-button.webp');
Object.assign(skin.poses.patient,{x:195,y:320,w:320,h:480});
const contact={x:355-230*(410/1230),y:456-239.2*(1135/1278),w:230,h:239.2,rotation:.5,pivot:{x:410/1230,y:1135/1278}};
const withdrawn={...contact,x:contact.x+45,y:contact.y-95};
Object.assign(skin.poses.helper,{...contact,asset:'helper-press-a'});
for(const id of ['shirt','water'])Object.assign(skin.poses[id],{x:0,y:0,w:720,h:1080});
Object.assign(skin.poses.guide,{x:175,y:620,w:100,h:143});
Object.assign(skin.poses.context,{opacity:0});Object.assign(skin.poses.cue,{opacity:0});
Object.assign(skin.poses.clear,{asset:'painted-button',x:198,y:903,w:244,h:65});
Object.assign(skin.poses.handover,{asset:'painted-button',x:192,y:903,w:363,h:65});
Object.assign(skin.zones['chest-zone'],{x:302,y:389,w:108,h:124});
Object.assign(skin.zones['upper-zone'],{x:294,y:398,w:65,h:70});Object.assign(skin.zones['side-zone'],{x:365,y:433,w:62,h:68});
const upper={x:304,y:405,w:42,h:58},side={x:373,y:438,w:38,h:59};
for(const state of skin.states){
 if(state.object==='pad-upper'&&state.when.all?.includes('pad-upper-on'))Object.assign(state.pose,upper);
 if(state.object==='pad-side'&&state.when.all?.includes('pad-side-on'))Object.assign(state.pose,side);
 if(state.object==='helper'&&state.when.not?.includes('resumed'))Object.assign(state.pose,{...withdrawn,asset:'helper-clear'});
 if(state.object==='helper'&&state.when.all?.includes('resumed'))Object.assign(state.pose,{...contact,asset:'helper-press-a'});
}
skin.labels=skin.labels.filter(l=>!['context','cue'].includes(l.object));
for(const motion of Object.values(skin.animations))for(const track of motion.tracks)if(track.object==='cue')for(const key of track.keyframes)key.opacity=0;
for(const label of skin.labels){if(label.object==='clear'||label.object==='handover')label.color='#365338';if(label.object==='cue')label.size=18;}
skin.animations['attach-upper'].tracks[0].keyframes=[{at:1,...upper}];skin.animations['attach-side'].tracks[0].keyframes=[{at:1,...side}];
skin.animations['dry-chest'].tracks[0].keyframes=[{at:.25,x:305,y:391},{at:.75,x:358,y:452},{at:1,x:198,y:814}];
skin.animations['clear-analysis'].tracks=[{object:'helper',keyframes:[{at:1,asset:'helper-clear',x:withdrawn.x,y:withdrawn.y}]}];
for(const id of ['resume-after-shock','resume-without-shock'])skin.animations[id].tracks=[{object:'helper',keyframes:[{at:1,asset:'helper-press-a',x:contact.x,y:contact.y}]}];
skin.presentation.actors=[{object:'helper',amplitude:0,performance:{lean:.009,periodMs:545,activeAssets:['helper-press-a','helper-press-b']}}];
// Source-measured face, torso, hands and feet, transformed by the SAME authored pivot.
const actorRegions=[{x:40,y:12,w:55,h:68},{x:48,y:62,w:110,h:68},{x:74,y:133,w:121,h:70},{x:50,y:100,w:75,h:92}].map(b=>({x:b.x*1.15,y:b.y*1.15,w:b.w*1.15,h:b.h*1.15}));
const transformed=(pose,b)=>{const px=pose.pivot.x*pose.w,py=pose.pivot.y*pose.h,c=Math.cos(pose.rotation),s=Math.sin(pose.rotation);const points=[[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]].map(([x,y])=>({x:pose.x+px+c*(x-px)-s*(y-py),y:pose.y+py+s*(x-px)+c*(y-py)}));const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return {x,y,w:Math.max(...points.map(p=>p.x))-x,h:Math.max(...points.map(p=>p.y))-y};};
skin.framing.criticalRegions=[{x:226,y:322,w:264,h:467},{x:441,y:620,w:128,h:166},{x:175,y:620,w:100,h:143},{x:192,y:803,w:377,h:165},...[contact,withdrawn].flatMap(p=>actorRegions.map(r=>transformed(p,r)))];
// Anatomical control points are measured from THIS patient and rescuer source.
const anatomy={patient:{pose:skin.poses.patient,sternum:{x:355,y:456},upperPad:upper,sidePad:side},helper:{contactPose:contact,clearPose:withdrawn,handsLocal:{x:410/1230,y:1135/1278}},zones:skin.zones};
fs.writeFileSync(`${src}/anatomy.json`,JSON.stringify(anatomy,null,2)+'\n');
fs.writeFileSync('content/levels/first-aid-aed/skins/realistic-v2.json',JSON.stringify(skin,null,2)+'\n');
if(hash(rulePath)!==before)throw Error('Reskin modified rules');
fs.writeFileSync(`${src}/manifest.json`,JSON.stringify({date:'2026-10-07',rulesSha256:before,generationAttempt:{tool:'image_gen.imagegen',result:'503 model_not_found; no new image generated'},sources:[{file:'patient-source.png',origin:'Previous-turn original generated realistic patient',sha256:hash(`${src}/patient-source.png`)},{file:'rescuer-source.png',origin:'Existing project public/levels/first-aid-cpr/helper.png, reused licensed project actor, not a copied level template',sha256:hash(`${src}/rescuer-source.png`)}],processing:'Proportional runtime encoding and transparent padding only; no repainting of raster anatomy. New native vector garment and cables.',motion:'Existing realistic rescuer cutout: subtle posture motion during CPR; body visibly retreats to remove contact for analysis/shock. Not a new raised-hand photograph.',outputs:fs.readdirSync(out).map(file=>({file,sha256:hash(`${out}/${file}`)}))},null,2)+'\n');
console.log('Compiled realistic-v2; rules unchanged:',before);
