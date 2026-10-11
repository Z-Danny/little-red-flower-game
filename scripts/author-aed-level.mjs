/** Author a new response package, not a hunt reskin. Stable rule IDs do not depend on art. */
import fs from 'node:fs';
const root='content/levels/first-aid-aed';
const required=['placed','powered','exposed','dry','pad-upper-on','pad-side-on','cleared','branch-ready','resumed','handed-over'];
const objects=[
 ['device','放置 AED','drag',[],['placed']],['power','开启 AED','tap',['placed'],['powered']],
 ['shirt','解开上衣，露出胸部','tap',['powered'],['exposed']],['cloth','干毛巾擦干贴片区域','drag',['exposed'],['dry']],
 ['pad-upper','电极片 ①','drag',['dry'],['pad-upper-on']],['pad-side','电极片 ②','drag',['dry'],['pad-side-on']],
 ['clear','清场：大家离开，不要接触','tap',['powered'],['branch-ready']],['shock','电击按钮','tap',['powered'],['branch-ready']],
 ['helper','协助者：立即恢复 CPR','tap',[],['resumed']],['handover','接应并告知急救人员','tap',['resumed'],['handed-over']],
 ['patient','成人训练模型','none'],['guide','设备贴片图示','none'],['screen','设备短提示','none'],['context','题设说明','none'],['cue','协作提示','none'],['water','胸部水迹','none'],['lead-upper','已连接的导线①','none'],['lead-side','已连接的导线②','none']
].map(([id,label,input,requires=[],disabledWhen=[]])=>({id,label,input,requires,disabledWhen}));
const goals=required.map((id,i)=>({id,label:['设备放稳','开机','露出胸部','擦干皮肤','贴片①固定','贴片②固定','分析前清场','遵循分析结果','立即恢复 CPR','继续帮助与交接'][i],object:['device','power','shirt','cloth','pad-upper','pad-side','clear','shock','helper','handover'][i]}));
goals.push({id:'shockable',label:'设备预设：可电击心律',object:'screen',showTarget:false},{id:'shock-clear',label:'电击前再次确认清场',object:'clear',showTarget:false});
const interactions=[];
const action=(id,source,mode,target,requires,grants,feedback,extra={})=>interactions.push({id,source,mode,...(target?{target}:{}),requires,grants,outcome:'correct',animation:id,feedback,...extra});
action('place-device','device','drop','device-zone',[],['placed'],'设备放在身旁干燥、稳固的地面。协助者继续 CPR。');
action('power-on','power','tap',null,['placed'],['powered'],'AED 已开机。按设备图示准备贴片；协助者继续 CPR。');
action('expose-chest','shirt','tap',null,['powered'],['exposed'],'已露出胸部。本题贴片区域有汗水，用干毛巾擦干。');
action('dry-chest','cloth','drop','chest-zone',['exposed'],['dry'],'贴片区域已擦干。按照设备图示贴片，不中断协助者按压。');
action('attach-upper','pad-upper','drop','upper-zone',['dry'],['pad-upper-on'],'① 固定在患者右上胸、锁骨下方（画面左侧）。');
action('attach-side','pad-side','drop','side-zone',['dry'],['pad-side-on'],'② 固定在患者左侧胸、腋下（画面右侧），避开按压位置。');
action('clear-analysis','clear','tap',null,['pad-upper-on','pad-side-on'],['cleared'],'大家离开，不要接触！协助者抬手，AED 开始分析。',{unless:['cleared']});
action('clear-shock','clear','tap',null,['cleared','shockable'],['shock-clear'],'设备建议电击。再次确认无人接触患者，等待设备就绪。',{stages:['analyzed']});
action('deliver-shock','shock','tap',null,['cleared','shockable','shock-clear'],['branch-ready'],'已按设备提示完成电击。立即请协助者恢复 CPR！',{stages:['shock-ready']});
action('resume-after-shock','helper','tap',null,['branch-ready'],['resumed'],'协助者已立即恢复 CPR。贴片保持连接，继续按设备提示。');
action('resume-without-shock','helper','tap',null,['cleared'],['branch-ready','resumed'],'设备不建议电击。没有按电击键，立即恢复 CPR；这不代表已经恢复。',{unless:['shockable'],stages:['analyzed']});
action('handover-help','handover','tap',null,['resumed'],['handed-over'],'已让旁人接应急救人员并说明情况。继续 CPR，AED 保持连接，听从后续提示。');
const wrong=(id,source,mode,target,feedback,extra={})=>interactions.push({id,source,mode,...(target?{target}:{}),grants:[],outcome:'danger',animation:'blocked',feedback,...extra});
wrong('wrong-upper','pad-upper','drop','side-zone','① 不是这里。看设备图示：患者右上胸、锁骨下方。');
wrong('wrong-side','pad-side','drop','upper-zone','② 不是这里。看设备图示：患者左侧胸、腋下。');
wrong('early-clear','clear','tap',null,'设备准备时让协助者继续 CPR。两片贴好、设备提示分析时再清场。',{unless:['cleared']});
wrong('unsafe-shock','shock','tap',null,'不能自行决定电击。仅在 AED 建议电击、无人接触且设备就绪时按键。');
wrong('early-resume','helper','tap',null,'正在分析或等待电击。所有人保持不接触，按设备提示再立即恢复 CPR。',{requires:['cleared']});
interactions.push({id:'keep-compressions',source:'helper',mode:'tap',requires:[],unless:['cleared'],grants:[],outcome:'neutral',animation:'blocked',feedback:'协助者正在 CPR。你负责准备 AED，不要让他停手等待。'});
const rules={schemaVersion:1,id:'first-aid-aed',kind:'response',title:'自动除颤协作',order:408,location:'急救岛 · 社区协作站',description:'4-8｜协助者正在 CPR，你负责刚取来的 AED。依设备提示完成贴片、清场与后续配合。',safety:'教学模拟，不替代正规培训。题设已确认成人无反应、无正常呼吸，已呼叫120并开始CPR。设备为预连接成人贴片的半自动AED；真实操作遵循具体设备和调度员提示。',briefing:'120 已呼叫，协助者正在 CPR。先将 AED 拖到患者身旁，再开机。',scenarios:[{id:'shock-advised',initialGoals:['shockable']},{id:'no-shock-advised',initialGoals:[]}],objects,goals,interactions,stages:[{id:'analyzed',requires:['cleared'],afterMs:1600,feedback:'分析结束：只按 AED 当前提示操作。'},{id:'shock-ready',requires:['shock-clear'],afterMs:900,feedback:'设备就绪：确认无人接触，按电击键。'}],risk:{mode:'elapsed',timeout:'continue',seconds:180,initial:0,warningAt:90,peakFeedback:'从容练习，操作依设备提示；训练用时不是救援时限。'},completion:{requires:required,settleMs:1200,fixedStars:3,title:'协作完成，继续施救',status:'训练流程完成 ≠ 患者已经恢复',summary:'准备时持续 CPR，分析和电击时无人接触；是否电击由 AED 决定。提示后立即恢复 CPR，保持贴片连接，继续配合直到专业人员接手。'}};
const skin={schemaVersion:1,id:'illustrated',world:{width:720,height:1080},assets:{},background:'background',poses:{},zones:{'device-zone':{x:440,y:620,w:133,h:166},'chest-zone':{x:305,y:428,w:115,h:128},'upper-zone':{x:305,y:422,w:65,h:71},'side-zone':{x:376,y:498,w:59,h:73}},zoneLabels:{'device-zone':'身旁干燥地面','chest-zone':'擦干贴片区域','upper-zone':'右上胸 ①','side-zone':'左侧胸 ②'},zoneConditions:{'device-zone':{not:['placed']},'chest-zone':{all:['exposed'],not:['dry']},'upper-zone':{all:['dry']},'side-zone':{all:['dry']}},states:[],animations:{blocked:{durationMs:240,tracks:[]}},effects:[],labels:[],presentation:{durationMs:180000,effects:[],actors:[{object:'helper',amplitude:0,performance:{lean:0,periodMs:545,cycle:{frames:['helper-press-a','helper-press-b'],periodMs:545}}}],audio:{theme:'medical',cues:{pickup:'soft-tap',bounce:'warning',danger:'warning',goal:'soft-tap',complete:'success','power-on':'switch','clear-analysis':'button-tap','analyzed':'button-tap','clear-shock':'button-tap','shock-ready':'button-tap','deliver-shock':'switch','attach-upper':'fabric','attach-side':'fabric','dry-chest':'fabric'},calmWhen:['resumed']}},framing:{sceneBounds:{x:0,y:0,w:720,h:1080},criticalRegions:[{x:168,y:195,w:398,h:116},{x:165,y:345,w:400,h:445},{x:192,y:802,w:373,h:141}]}};
for(const f of fs.readdirSync('public/levels/aed-cooperation')){const id=f.replace(/\.(png|webp)$/,'');skin.assets[id]={src:`/levels/aed-cooperation/${f}`,alpha:id!=='background'};}
const pose=(id,asset,x,y,w,h,depth=5,opacity=1)=>skin.poses[id]={asset,x,y,w,h,depth,opacity,blockInput:false};
pose('patient','patient',265,345,192,416,3);pose('shirt','shirt',265,345,192,416,5);pose('water','moisture',265,345,192,416,4);
pose('helper','helper-press-a',165,380,195,225,12);
pose('device','device-off',441,803,128,156,6);pose('power','button-power',456,727,36,36,9,0);pose('shock','button-shock',508,726,38,38,10,0);
pose('cloth','cloth',198,814,80,68,9);pose('pad-upper','pad-upper',292,807,69,84,9);pose('pad-side','pad-side',364,807,69,84,9);
pose('guide','diagram',453,367,112,160,5);pose('screen','card',450,648,114,65,11,0);
pose('context','card',168,195,398,116,10);pose('cue','card',177,310,380,52,11);
pose('clear','card',198,900,233,64,9,0);pose('handover','card',198,900,350,64,10,0);
pose('lead-upper','cable-upper',0,0,720,1080,6,0);pose('lead-side','cable-side',0,0,720,1080,6,0);
const state=(object,when,patch)=>skin.states.push({object,when,pose:patch});
state('device',{all:['placed']},{x:441,y:620});state('device',{all:['powered']},{asset:'device-on'});
state('power',{all:['placed'],not:['powered']},{opacity:1});state('shock',{all:['powered']},{opacity:.45});state('shock',{all:['shock-clear'],stages:['shock-ready'],not:['branch-ready']},{opacity:1});
state('screen',{all:['placed']},{opacity:1});state('shirt',{all:['exposed']},{opacity:0});state('water',{all:['dry']},{opacity:0});state('cloth',{all:['dry']},{opacity:.4});
state('pad-upper',{all:['pad-upper-on']},{x:314,y:428,w:40,h:64});state('pad-side',{all:['pad-side-on']},{x:392,y:497,w:36,h:64});
state('lead-upper',{all:['pad-upper-on']},{opacity:1});state('lead-side',{all:['pad-side-on']},{opacity:1});
state('helper',{all:['cleared'],not:['resumed']},{asset:'helper-clear'});state('helper',{all:['resumed']},{asset:'helper-press-a'});
state('clear',{all:['powered'],not:['branch-ready']},{opacity:1});state('clear',{all:['cleared'],not:['shockable']},{opacity:0});state('clear',{all:['shock-clear']},{opacity:.5});state('clear',{all:['branch-ready']},{opacity:0});state('handover',{all:['resumed']},{opacity:1});
const label=(object,text,when,size=20,color='#4c5947',y=.5)=>skin.labels.push({object,text,x:.5,y,size,color,...(when?{when}:{})});
label('context','4-8  自动除颤协作\n模拟患者仰卧 · 120 已呼叫\n本题：胸部有汗水，贴片已预连接',null,21);
label('cue','你操作设备 · 协助者持续 CPR',{not:['cleared']},19);
label('cue','所有人离开 · 正在分析',{all:['cleared'],notStages:['analyzed']},20);
label('cue','建议电击 · 再确认无人接触',{all:['cleared','shockable'],stages:['analyzed'],not:['branch-ready']},20,'#975c2d');
label('cue','不建议电击 · 立即点击协助者恢复 CPR',{all:['cleared'],stages:['analyzed'],not:['shockable','resumed']},19);
label('cue','立即点击协助者 · 恢复 CPR',{all:['branch-ready'],not:['resumed']},20);
label('cue','CPR 已恢复 · 保持贴片连接',{all:['resumed']},20);
label('screen','请开机',{not:['powered']},18);
label('screen','露出胸部',{all:['powered'],not:['exposed']},18);
label('screen','擦干皮肤',{all:['exposed'],not:['dry']},18);
label('screen','按图贴片',{all:['dry'],not:['pad-upper-on']},18);
label('screen','按图贴片',{all:['dry','pad-upper-on'],not:['pad-side-on']},18);
label('screen','准备分析\n请清场',{all:['pad-upper-on','pad-side-on'],not:['cleared']},18);
label('screen','分析中\n勿接触',{all:['cleared'],notStages:['analyzed']},18);
label('screen','建议电击',{all:['cleared','shockable'],stages:['analyzed'],not:['shock-clear','branch-ready']},18,'#9c5828');
label('screen','正在准备',{all:['shock-clear'],notStages:['shock-ready']},18);
label('screen','按电击键',{all:['shock-clear'],stages:['shock-ready'],not:['branch-ready']},18,'#9c5828');
label('screen','不建议电击\n立即 CPR',{all:['cleared'],stages:['analyzed'],not:['shockable','resumed']},17);
label('screen','恢复 CPR',{all:['branch-ready'],not:['resumed']},18);
label('screen','继续 CPR',{all:['resumed']},18);
label('clear','清场：大家离开！',{not:['cleared']},22);label('clear','电击前再次清场',{all:['cleared']},22);
label('handover','让旁人接应 · 告知急救人员',null,22);
const track=(object,keyframes)=>({object,keyframes});
for(const r of interactions.filter(r=>r.outcome==='correct'))skin.animations[r.animation]={durationMs:180,tracks:[]};
skin.animations['place-device']={durationMs:350,tracks:[track('device',[{at:1,x:441,y:620}])]};
skin.animations['expose-chest']={durationMs:300,tracks:[track('shirt',[{at:1,opacity:0}])]};
skin.animations['dry-chest']={durationMs:500,tracks:[track('cloth',[{at:.25,x:305,y:420},{at:.75,x:360,y:505},{at:1,x:198,y:814}]),track('water',[{at:1,opacity:0}])]};
skin.animations['attach-upper']={durationMs:260,tracks:[track('pad-upper',[{at:1,x:314,y:428,w:40,h:64}])]};
skin.animations['attach-side']={durationMs:260,tracks:[track('pad-side',[{at:1,x:392,y:497,w:36,h:64}])]};
skin.animations['clear-analysis']={durationMs:240,tracks:[track('helper',[{at:.00001,asset:'helper-clear'},{at:1,asset:'helper-clear'}])]};
for(const name of ['resume-after-shock','resume-without-shock'])skin.animations[name]={durationMs:100,tracks:[track('helper',[{at:.00001,asset:'helper-press-a'},{at:1,asset:'helper-press-a'}])]};
for(const animation of Object.values(skin.animations)) { animation.durationMs=Math.max(500,animation.durationMs); if(!animation.tracks.length) animation.tracks=[{object:"cue",keyframes:[{at:.00001,opacity:1},{at:1,opacity:1}]}]; }
fs.writeFileSync(`${root}/level.json`,JSON.stringify(rules,null,2)+'\n');fs.writeFileSync(`${root}/skins/illustrated.json`,JSON.stringify(skin,null,2)+'\n');
console.log('Authored AED rules and independent skin');
