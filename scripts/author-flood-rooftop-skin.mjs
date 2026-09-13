/** Reproducible scene authoring. Rules, artwork and viewport stay independent. */
import fs from 'node:fs';
import path from 'node:path';
import { root, dependency } from './lib/dependencies.mjs';
const out=path.join(root,'content/levels/flood-highground-practice/skins');
const rules=JSON.parse(fs.readFileSync(path.join(root,'content/levels/flood-highground-practice/level.json'),'utf8'));
if(!rules.goals.some(goal=>(typeof goal==='string'?goal:goal.id)==='at-rooftop'))throw new Error('当前正式关卡不是屋顶版。请先在独立副本显式恢复屋顶规则，禁止覆盖室内待援版皮肤。');
const base='/levels/flood-rooftop-v2/';
const old='/levels/reference-storybook-v2/flood-highground-practice/';
const assets={};
const asset=(id,src,alpha=true,frame)=>assets[id]={src,alpha,...(frame?{frame}:{})};
for(const id of ['family-message','family-prepared','family-roof','wood-panel','foam','float-aid','breaker','breaker-off'])asset(id,base+id+'.webp');
for(const id of ['roof-background','flood-failure','electric-failure'])asset(id,base+id+'.webp',false);
asset('room',old+'upstairs-background.webp',false);
asset('car-failure','/levels/reference-storybook-v2/car-window-practice/background.webp',false);
asset('family-initial','/levels/character-continuity-v3/flood-highground-practice/family-initial.webp');
asset('family-calm','/levels/character-continuity-v3/flood-highground-practice/family-calm.webp');
asset('phone',old+'phone-initial.webp');asset('water',old+'bottled-water-initial.webp');
asset('flashlight','/levels/reference-storybook-v2/quake-exit-practice/flashlight-initial.webp');
asset('bag','/levels/transcript-v1/bag.png');asset('chair','/levels/transcript-v1/chair.png');
asset('car',old+'upstairs-background.webp',false,{x:231,y:580,w:78,h:40});
await dependency('sharp')(path.join(root,'public',base,'wire.svg')).webp({lossless:true}).toFile(path.join(root,'public',base,'wire.webp'));
asset('wire',base+'wire.webp');
const p=(a,x,y,w,h,d,extra={})=>({asset:a,x,y,w,h,depth:d,...extra});
const calm={asset:'family-calm',x:270,y:400,w:214,h:514,opacity:1,rotation:0};
const ready={asset:'family-prepared',x:222,y:410,w:350,h:525,opacity:1,rotation:0};
const roofFamily={...ready,asset:'family-roof',x:217,y:495,w:380,h:570};
const roofAid={x:150,y:956,w:58,h:121.3,opacity:1,rotation:.035};
const poses={
 'world-scene':p('room',0,0,720,1280,0,{blockInput:false}),
 'family':p('family-initial',220,468,335,459.4,40),
 'breaker':p('breaker',363,132,50,84.8465,25),
 'phone':p('phone',502,590,80,42.74,32),
 'bottled-water':p('water',592,517,52,82.07,31),
 'flashlight':p('flashlight',646,596,62,26.13,33),
 'backpack':p('bag',465,945,112,123.8,35),
 'panel':p('wood-panel',135,722,75,180.12,25,{rotation:-.035,blockInput:false}),
 'foam':p('foam',229,763,67,133.345,27,{rotation:.025}),
 'float-aid':p('float-aid',135,722,82,172,28,{opacity:0,blockInput:false}),
 'stool':p('chair',179,969,88,160.7,28),
 'car':p('car',231/941*720,580/1672*1280,78/941*720,40/1672*1280,4),
 'broken-wire':p('wire',154,326,105,96,5,{blockInput:false}),
 'aftermath':p('flood-failure',0,0,720,1280,80,{opacity:0,blockInput:false}),
};
const prep=['at-stairs','power-off','rescue-contacted','water-packed','light-packed','float-ready'];
const states=[{object:'family',when:{all:['at-stairs']},pose:calm},
 {object:'breaker',when:{all:['power-off']},pose:{asset:'breaker-off'}},
 ...[['phone','rescue-contacted'],['bottled-water','water-packed'],['flashlight','light-packed'],['panel','float-ready'],['foam','float-ready']].map(([object,goal])=>({object,when:{all:[goal]},pose:{opacity:0,blockInput:false}})),
 {object:'float-aid',when:{all:['float-ready']},pose:{opacity:1}},
 {object:'family',when:{all:prep},pose:ready},
 ...['backpack','float-aid'].map(object=>({object,when:{all:prep},pose:{opacity:0,blockInput:false}})),
 {object:'world-scene',when:{all:['at-rooftop']},pose:{asset:'roof-background'}},
 {object:'family',when:{all:['at-rooftop']},pose:roofFamily},
 ...Object.keys(poses).filter(x=>!['world-scene','family','aftermath'].includes(x)).map(object=>({object,when:{all:['at-rooftop']},pose:{opacity:0,blockInput:false}})),
 {object:'float-aid',when:{all:['at-rooftop']},pose:roofAid}];
const tr=(object,keyframes,fromDrop=false)=>({object,...(fromDrop?{fromDrop:true}:{}),keyframes});
const anim=(durationMs,...tracks)=>({durationMs,tracks});
const home=[{at:.25,rotation:-.026},{at:.6,rotation:.022},{at:1,restoreHome:true}];
const animations={
 'approach-stairs':anim(1500,tr('family',[{at:.2,x:325,y:449,w:270,h:370},{at:.34,x:340,y:421,rotation:-.025},{at:.48,x:345,y:430,rotation:.02},{at:.58,opacity:0},{at:.6,...calm,opacity:0},{at:1,...calm}])),
 'turn-off-power':anim(900,tr('breaker',[{at:.35,asset:'breaker'},{at:.55,asset:'breaker-off'},{at:1,asset:'breaker-off'}]),tr('family',home)),
 'send-location':anim(1500,tr('phone',[{at:.12,opacity:0},{at:1,opacity:0}]),tr('family',[{at:.12,opacity:0},{at:.15,asset:'family-message',x:211,y:390,w:356,h:534,opacity:0},{at:.28,opacity:1},{at:.75,rotation:.014},{at:.84,opacity:0},{at:.87,restoreHome:true,opacity:0},{at:1,restoreHome:true,opacity:1}])),
 'pack-water':anim(1100,tr('bottled-water',[{at:.4,x:487,y:947,w:37,h:58.4,rotation:0},{at:.68,x:494,y:966,w:28,h:44.2,opacity:.7},{at:1,opacity:0}],true),tr('backpack',[{at:.55,rotation:.025},{at:1,restoreHome:true}]),tr('family',home)),
 'pack-light':anim(1000,tr('flashlight',[{at:.4,x:480,y:950,w:49,h:20.65,rotation:.5},{at:.72,x:490,y:970,w:35,h:14.75,opacity:.7},{at:1,opacity:0}],true),tr('backpack',[{at:.55,rotation:.025},{at:1,restoreHome:true}]),tr('family',home)),
 'combine-float':anim(1400,tr('foam',[{at:.45,x:142,y:746,rotation:0},{at:.64,opacity:0},{at:1,opacity:0}],true),tr('panel',[{at:.64,opacity:0},{at:1,opacity:0}]),tr('float-aid',[{at:.63,opacity:0},{at:.78,opacity:1},{at:1,opacity:1}]),tr('family',home)),
};
const disappear=(ids)=>ids.map(id=>tr(id,[{at:.44,opacity:1},{at:.52,opacity:0},{at:1,opacity:0}]));
// End the first shot at the stairs, then reveal a physically separate sheltered roof.
const roofMotion=(early)=>anim(1500,
 tr('family',[{at:.25,x:414,y:328,w:early?145:218,h:early?348:327,rotation:-.022},{at:.42,x:450,y:272,w:early?120:182,h:early?288:273,rotation:.012,opacity:.8},{at:.52,opacity:0},{at:.58,...(early?{...calm,x:267,y:495,w:235,h:564}:roofFamily),opacity:0},{at:1,...(early?{...calm,x:267,y:495,w:235,h:564}:roofFamily)}]),
 tr('world-scene',[{at:.54,asset:'room'},{at:.56,asset:'roof-background'},{at:1,asset:'roof-background'}]),
 ...Object.keys(poses).filter(id=>!['world-scene','family','aftermath'].includes(id)).map(id=>tr(id,id==='float-aid'&&!early?[{at:.5,restoreHome:true},{at:.55,opacity:0},{at:.58,...roofAid,opacity:0},{at:1,...roofAid}]:[{at:.5,restoreHome:true},{at:.55,opacity:0},{at:1,opacity:0}])));
animations['evacuate-roof']=roofMotion(false);animations['early-roof-escape']=roofMotion(true);
for(const [id,a] of [['enter-flood','flood-failure'],['touch-wire','electric-failure'],['stay-in-car','car-failure']]){
 animations[id]=anim(1500,tr('aftermath',[{at:.01,asset:a,opacity:0},{at:.18,asset:a,opacity:1},{at:.5,x:-7,y:-10,w:734,h:1305},{at:.7,x:2,y:-2,w:724,h:1287},{at:1,x:0,y:0,w:720,h:1280,opacity:1}]),tr('world-scene',[{at:.18,opacity:0},{at:1,opacity:0}]),...Object.keys(poses).filter(id=>!['world-scene','aftermath'].includes(id)).map(id=>tr(id,[{at:.18,opacity:0},{at:1,opacity:0}])));
}
for(const [id,obj]of [['blocked-breaker','breaker'],['blocked-phone','phone'],['blocked-water','bottled-water'],['blocked-light','flashlight'],['blocked-foam','foam'],['blocked-roof','family']])animations[id]=anim(650,tr(obj,[{at:.3,rotation:-.05},{at:.6,rotation:.04},{at:1,restoreHome:true}],true));
const windows=[[[25.2,45.2],[109.4,80.4],[109.4,193.7],[25.2,171.5]],[[141.6,94.2],[268.6,150],[268.6,244.2],[141.6,203.6]],[[26,207.5],[108.7,230.4],[108.7,486.9],[58.2,486.9],[58.2,349.1],[26,349.1]],[[143.1,240.4],[268.6,268.7],[267.8,522.1],[143.1,543.5]]].map(poly=>poly.map(([x,y])=>({x,y})));
const sceneRoom={object:'world-scene',asset:'room'};
const skin={schemaVersion:1,id:'paper-gouache',world:{width:720,height:1280},assets,background:'room',poses,
 zones:{'stairs-approach':{x:445,y:370,w:175,h:209},'roof-exit':{x:445,y:230,w:175,h:145},'bag-zone':{x:455,y:929,w:138,h:154},'panel-zone':{x:126,y:710,w:91,h:207},'wire-zone':{x:150,y:323,w:112,h:107},'flood-zone':{x:143,y:444,w:125,h:92}},
 states,animations,effects:[],labels:[],
 zoneLabels:{'stairs-approach':'干燥楼梯旁','roof-exit':'沿楼梯到屋顶高处','bag-zone':'放入背包','panel-zone':'与轻质板材组合','wire-zone':'靠近断线（危险）','flood-zone':'下水（危险）'},
 zoneConditions:{'stairs-approach':{not:['at-stairs']},'roof-exit':{all:['at-stairs']}},
 presentation:{durationMs:90000,failureReveal:true,effects:[
 {kind:'rain',box:{x:20,y:35,w:260,h:585},depth:3,color:'#c9e0ee',strength:1.5,whenScene:sceneRoom,clipPolygons:windows},
 {kind:'water',box:{x:20,y:365,w:260,h:240},depth:2,color:'#568ca1',strength:1.4,whenScene:sceneRoom,clipPolygons:windows},
 {kind:'alarm',box:{x:178,y:370,w:28,h:29},depth:6,color:'#ffe7a1',strength:.7,whenScene:sceneRoom,clipPolygons:windows},
 {kind:'rain',box:{x:20,y:90,w:480,h:400},depth:3,color:'#c9e0ee',strength:.7,whenScene:{object:'world-scene',asset:'roof-background'},clipPolygons:[[{x:25,y:102},{x:493,y:190},{x:493,y:475},{x:25,y:490}]]}
 ],actors:[{object:'family',amplitude:.7,performance:{lean:.02,periodMs:1250}}],
 audio:{theme:'flood',ambientProfile:'flood-window',calmWhen:['at-rooftop'],emergency:{alarm:'flood-alert',alarmUntil:['at-rooftop']},cues:{opening:'flood-surge',pickup:'pickup',bounce:'bounce',goal:'soft-tap',complete:'success',danger:'warning','approach-stairs':'flood-high-step','turn-off-power':'flood-power-off','send-location':'flood-message-sent','pack-water':'flood-pack-zip','pack-light':'flood-pack-zip','combine-float':'fabric','evacuate-roof':'flood-high-step','early-roof-escape':'flood-high-step','enter-flood':'flood-water-impact','touch-wire':'electric-warning','stay-in-car':'flood-water-impact'}}},
 framing:{sceneBounds:{x:0,y:0,w:720,h:1280},criticalRegions:[{x:126,y:132,w:582,h:951}]}
};
for(const file of ['paper-gouache.json','illustrated.json'])fs.writeFileSync(path.join(out,file),JSON.stringify({...skin,id:file.replace('.json','')},null,2)+'\n');
console.log('Authored seven-step rooftop skins; no viewport or rules changed.');
