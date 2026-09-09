// Reproducible authoring recipe, NOT the runtime. Edit deployed JSON for ordinary
// skin/rule changes. Explicit --write needed, and --replace to overwrite a pack.
import fs from 'node:fs';
import path from 'node:path';
import { root } from './lib/dependencies.mjs';
const artDir=path.join(root,'public/levels/transcript-v1');
const asset=(name,alpha=true)=>({src:`/levels/transcript-v1/${name}.${name.endsWith('-room')?'webp':'png'}`,alpha});
const pose=(name,x,y,w,depth=10)=>{const b=fs.readFileSync(path.join(artDir,name+'.png'));return {asset:name,x,y,w,h:w*b.readUInt32BE(20)/b.readUInt32BE(16),depth};};
const rules=(id,title,kind,order,description,safety,briefing)=>({schemaVersion:1,id,title,kind,order,location:kind==='prevention'?'家庭 · 社区':'公共场所',description,safety,briefing,objects:[],goals:[],interactions:[],risk:{mode:'elapsed',seconds:90,initial:0,warningAt:65,peakFeedback:'本关没有灾害倒数，请继续练习。'},completion:{requires:[],settleMs:1800,title:'准备好了',status:'完成',summary:''}});
const skin=room=>({schemaVersion:1,id:'paperbook',world:{width:720,height:1280},assets:{[room]:asset(room,false)},background:room,poses:{},zones:{},states:[],animations:{},effects:[],labels:[],zoneLabels:{}});
const add=(r,s,id,label,p,input='tap',done)=>{r.objects.push({id,label,input,...(done?{disabledWhen:[done]}:{})});s.poses[id]=p; s.assets[p.asset]??=asset(p.asset,!['screen-tile','bell','lift-door'].includes(p.asset)); if(done)r.goals.push({id:done,label,object:id});};
const motion=(s,id,object,keyframes,durationMs=1000,fromDrop=false)=>s.animations[id]={durationMs,tracks:[{object,keyframes,...(fromDrop?{fromDrop}: {})}]};
const grant=(r,id,source,goal,animation=id,target,feedback)=>r.interactions.push({id,source,mode:target?'drop':'tap',...(target?{target}:{}),grants:[goal],outcome:'correct',animation,...(feedback?{feedback}: {})});
const error=(r,id,source,animation,text,target)=>r.interactions.push({id,source,mode:target?'drop':'tap',...(target?{target}:{}),grants:[],outcome:'danger',animation,feedback:text});
const states=(s,id,goal,end)=>s.states.push({object:id,when:{all:[goal]},pose:end});
const label=(s,object,text,y=.5,size=20,when,background)=>s.labels.push({object,text,x:.5,y,size,color:'#25473e',...(when?{when}:{}),...(background?{background}: {})});
const actor=(s,id)=>{for(const e of ['worried','focused','panicked','relieved']){s.assets[`citizen-${e}`]=asset(`citizen-${e}`);s.states.push({object:id,when:{emotion:e},pose:{asset:`citizen-${e}`}});}};
const finish=r=>r.completion.requires=r.goals.map(g=>g.id);
const packs=[];
{
 const r=rules('flood-kit','汛期应急包','prevention',9,'平日备灾，找齐五类物品，把应急包准备好。','这是事前准备。五件物品不是完整储备清单；按家庭需要补足。收到转移通知应及时行动，不因收拾物品拖延。','平日备灾：观察剪影，把五件物品收到应急包里。');
 r.location='家中 · 事前准备'; const s=skin('kit-room');
 s.assets.bag=asset('bag');s.poses.bag=pose('bag',430,772,185,8);
 for(const [id,name,x,y,w,done] of [['water','饮用水',350,335,50,'water-packed'],['food','即食食品',146,785,132,'food-packed'],['torch','手电筒',587,669,106,'torch-packed'],['radio','收音机',280,494,94,'radio-packed'],['whistle','救生哨',328,891,85,'whistle-packed']]){
  const p=pose(id,x,y,w);add(r,s,id,name,p,'tap',done);
  const end={x:494,y:791,w:p.w*.3,h:p.h*.3,opacity:0};
  motion(s,'pack-'+id,id,[{at:.25,y:p.y-38,rotation:-.08},{at:.74,x:475,y:734,w:p.w*.7,h:p.h*.7,rotation:0},{at:1,...end}],1100);
  states(s,id,done,end);grant(r,'pack-'+id,id,done);
 }
 finish(r);r.completion.summary='提前准备饮水、方便食品、照明和联络工具，并按家庭需要补足应急物资。收到转移通知，及时行动，不因收拾物品拖延。';
 s.states.push({object:'bag',when:{all:r.completion.requires},pose:{rotation:-.025}});
 packs.push({rules:r,skin:s});
}
{
 const r=rules('clear-corridor','畅通的生命通道','prevention',10,'平日巡查，把占用楼道的四件物品收进自家储物空间。','日常、无火烟时整理轻便自家物品；火灾时不要因收拾物品耽误撤离。不得占用另一条通道或挪动消防设备。','日常整理：找出挡住通路的物品，收进右侧自家储物间。');
 r.location='楼道 · 日常巡查';const s=skin('corridor-room');
 for(const [id,name,x,y,w,done] of [['box','纸箱',226,654,173,'box-stored'],['chair','折叠椅',387,600,108,'chair-stored'],['case','空行李箱',241,819,105,'case-stored'],['scooter','玩具滑板车',404,836,149,'scooter-stored']]){
  const p=pose(id,x,y,w);add(r,s,id,name,p,'tap',done);
  const end={x:668,y:845,w:p.w*.45,h:p.h*.45,opacity:0};
  motion(s,'store-'+id,id,[{at:.2,y:p.y-18},{at:.65,x:578,y:823-p.h*.4,w:p.w*.8,h:p.h*.8},{at:1,...end}],1200);
  states(s,id,done,end);grant(r,'store-'+id,id,done);
 }
 finish(r);r.completion.title='通道，畅通了';r.completion.summary='楼道和安全出口不能堆放物品。日常及时整理，不把杂物搬到另一条通道；发生火灾时，人员安全优先。';packs.push({rules:r,skin:s});
}
{
 const r=rules('lift-wait','电梯停住了','response',11,'电梯停止运行，门没有打开。用报警通话装置联络，在轿厢内耐心等待。','本关无下坠、无烟火、无人受伤，报警装置有效。若联络无回应，可使用手机等通信设备求助，不扒门、不攀爬。训练计时不是救援到达时间。','电梯停住了，门打不开。报警通话装置仍可使用；请留在轿厢内求助。');
 r.location='轿厢 · 故障停梯';const s=skin('lift-room');
 add(r,s,'door','轿门',{asset:'lift-door',x:163,y:226,w:395,h:653,depth:1});
 s.assets.intercom=asset('intercom');s.poses.panel=pose('intercom',563,329,150,2);
 const panel=s.poses.panel, sx=panel.w/265,sy=panel.h/648;
 add(r,s,'bell','报警通话按钮',{asset:'bell',x:panel.x+41*sx,y:panel.y+444*sy,w:139*sx,h:146*sy,depth:3},'tap','alarm-contacted');
 const b=s.poses.bell;motion(s,'call','bell',[{at:.25,x:b.x+2,y:b.y+2,w:b.w-4,h:b.h-4},{at:1,x:b.x,y:b.y,w:b.w,h:b.h}],1000);
 grant(r,'call','bell','alarm-contacted','call',undefined,'模拟通话：阳光小区1栋2号梯，有1人被困，无人受伤。已联络，请等待专业救援。');
 label(s,'panel','1栋2号梯\n报警通话',.5,18,{not:['alarm-contacted']});label(s,'panel','已联络\n等候救援',.5,18,{all:['alarm-contacted']});
 add(r,s,'person','被困乘客',pose('citizen-worried',327,596,172,6),'drag','person-waiting');actor(s,'person');
 s.zones.wait={x:58,y:786,w:220,h:390};s.zoneLabels.wait='远离门边 · 留在轿厢内';
 s.zones.door={x:163,y:226,w:395,h:530};
 const end=pose('citizen-relieved',81,719,177,6);
 motion(s,'wait','person',[{at:.5,x:203,y:655},{at:1,x:end.x,y:end.y,w:end.w,h:end.h}],1200);
 states(s,'person','person-waiting',{x:end.x,y:end.y,w:end.w,h:end.h});grant(r,'wait','person','person-waiting','wait','wait');
 motion(s,'stay-inside','person',[{at:.3,rotation:-.03},{at:.65,rotation:.03},{at:1,rotation:0}],700);
 error(r,'pry','door','stay-inside','不要扒撬轿门。使用报警装置与外界联络，留在轿厢内等待。');
 error(r,'leave-door','person','stay-inside','不要尝试从门缝离开，可能坠入井道。请留在轿厢内等候专业救援。','door');
 for(let n=1;n<=2;n++){add(r,s,'floor-'+n,`楼层按钮${n}`,{asset:'screen-tile',x:576+(n-1)*61,y:720,w:48,h:44,depth:3});label(s,'floor-'+n,String(n),.5,24);}
 finish(r);r.completion.title='已联络，安心等待';r.completion.status='待援';r.completion.summary='普通故障被困时，用报警装置或手机与外界联络，说明位置。不要扒门、攀爬或跳跃；留在轿厢内等待专业人员救援。';packs.push({rules:r,skin:s});
}
{
 const r=rules('well-call','井口边的求助','response',12,'发现有人在污水井内遇险。留在外围联系专业救援，也提醒旁人别靠近。','你是不具备救援装备和能力的旁观者。保持自身安全，不进入有限空间；及时联系119、120。这里的电话仅为离线演示，不会真实拨出。','污水井内有人遇险。你没有救援装备：留在外围报警，提醒旁人别靠近。');
 r.location='社区 · 污水井外围';const s=skin('well-room');
 add(r,s,'well','危险井口',{asset:'well-opening',x:70,y:518,w:321,h:132,depth:1});
 add(r,s,'person','旁观者',pose('citizen-worried',439,423,148,3),'drag','bystander-back');actor(s,'person');
 s.zones.perimeter={x:418,y:877,w:252,h:349};s.zoneLabels.perimeter='退到更远处 · 劝阻靠近';s.zones.well={x:70,y:518,w:321,h:152};
 const end=pose('citizen-focused',450,761,170,3);
 motion(s,'back','person',[{at:.5,x:444,y:602,w:159,h:415.45},{at:1,x:end.x,y:end.y,w:end.w,h:end.h}],1200);
 states(s,'person','bystander-back',{x:end.x,y:end.y,w:end.w,h:end.h});grant(r,'back','person','bystander-back','back','perimeter');
 motion(s,'no-entry','person',[{at:.3,rotation:-.025},{at:.65,rotation:.025},{at:1,rotation:0}],700);
 error(r,'enter','well','no-entry','井内可能缺氧或存在有毒有害气体。无防护不要下井，及时联系119、120。');
 error(r,'pull-in','person','no-entry','不要进入井内施救。先保证自己安全，由专业人员救援。','well');
 s.assets.phone=asset('phone');s.poses.phone=pose('phone',0,799,369,8);
 // Phone display is part of the scene, not an inventory toolbar; all calls are
 // local state transitions and may be done in either order.
 for(const [id,title,number,y,goal] of [['fire-call','消防救援','119',960,'fire-called'],['medical-call','医疗急救','120',1056,'medical-called']]){
  add(r,s,id,`模拟联系${number}`,{asset:'screen-tile',x:145,y,w:161,h:86,depth:9},'tap',goal);
  label(s,id,`${number}\n${title}`,.5,24,{not:[goal]},'#e8d4a7');label(s,id,`${number}\n已联络`,.5,24,{all:[goal]},'#9ab6a3');
  const p=s.poses[id];motion(s,'dial-'+number,id,[{at:.25,x:p.x+2,y:p.y+2,w:p.w-4,h:p.h-4},{at:1,x:p.x,y:p.y,w:p.w,h:p.h}],1000);
  grant(r,'dial-'+number,id,goal,'dial-'+number,undefined,`模拟${number}通话：阳光小区东侧污水井，有1人井内遇险。已报告地点与险情，留在外围等候。`);
 }
 label(s,'phone','模拟求助',.27,27);label(s,'phone','不会真实拨号',.77,18);
 for(const text of s.labels.filter(text=>text.object==='phone'))text.x=.61;
 finish(r);r.completion.title='求助已发出';r.completion.status='待援';r.completion.summary='不具备安全救援条件时，不要进入污水井等有限空间。联系119、120，说明位置和险情，劝阻旁人靠近，在外围等待专业救援。井口仍然危险。';packs.push({rules:r,skin:s});
}
if(!process.argv.includes('--write')){console.log(packs.map(p=>({id:p.rules.id,goals:p.rules.goals.length})));process.exit(0);}
const catalogPath=path.join(root,'content/catalog.json');const catalog=JSON.parse(fs.readFileSync(catalogPath));
for(const p of packs){const dir=path.join(root,'content/levels',p.rules.id);if(fs.existsSync(dir)&&!process.argv.includes('--replace'))throw Error('Refusing overwrite: '+dir);}
for(const p of packs){const dir=path.join(root,'content/levels',p.rules.id);fs.mkdirSync(path.join(dir,'skins'),{recursive:true});fs.writeFileSync(path.join(dir,'level.json'),JSON.stringify(p.rules,null,2)+'\n');fs.writeFileSync(path.join(dir,'skins/paperbook.json'),JSON.stringify(p.skin,null,2)+'\n');if(!catalog.some(e=>e.id===p.rules.id))catalog.push({id:p.rules.id,skin:'paperbook',enabled:false});}
fs.writeFileSync(catalogPath,JSON.stringify(catalog,null,2)+'\n');console.log('Authored 4 packs. Existing enable flags preserved; new packs default disabled.');
