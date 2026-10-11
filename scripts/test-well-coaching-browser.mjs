/** Isolated and muted final-HTML playthrough; never uses the user's save/profile. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'playwright');
const file=path.resolve(process.argv[2]??'../交互优化离线版/小红花应急行动.html'),out=path.resolve(process.argv[3]??'../井口关改进-2026-09-27');fs.mkdirSync(out,{recursive:true});
const report={file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),checks:[],geometry:[],errors:[],physicalDevice:'not_run',humanListening:'not_run',prerequisite:'clear-corridor and lift-wait only; isolated profile',browserClosed:false};
const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
const check=s=>{report.checks.push(s);console.log('PASS '+s);};let page;
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{if(!localStorage.getItem('little-red-flower-leaderboard-v1'))localStorage.setItem('little-red-flower-leaderboard-v1',JSON.stringify({version:1,players:[{id:'well-test',name:'井口测试',region:'',createdAt:1,completed:{'clear-corridor':3,'lift-wait':3}}],activePlayerId:'well-test'}));});
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
 const shot=name=>page.screenshot({path:path.join(out,name+'.png')});const text=()=>page.locator('body').innerText();
 const settled=()=>page.waitForFunction(()=>{const e=document.querySelector('.configured-player');return e?.dataset.phase!=='ready'&&e?.dataset.action==='';});
 const goal=g=>page.waitForFunction(g=>document.querySelector('.configured-player')?.dataset.resolved.split(',').includes(g),g);
 const card=id=>page.locator(`[data-conversation="${id}"]`).waitFor();
 const world=async(x,y)=>page.locator('canvas[data-game-canvas]').evaluate((el,{x,y})=>{const r=el.getBoundingClientRect(),s=Number(el.dataset.cameraScale);return{x:r.x+Number(el.dataset.cameraX)+x*s,y:r.y+Number(el.dataset.cameraY)+y*s}},{x,y});
 const tap=async(x,y)=>{const p=await world(x,y);await page.touchscreen.tap(p.x,p.y);};
 const startDrag=async(x,y)=>{const a=await world(513,585),b=await world(x,y);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:18});};
 const drag=async(x,y)=>{await startDrag(x,y);await page.mouse.up();await settled();};
 const choose=async(name)=>{await page.getByRole('button',{name,exact:true}).click();await settled();};
 const restart=async()=>{await page.getByRole('button',{name:'暂停',exact:true}).click();await page.getByRole('button',{name:'重新开始本局游戏',exact:true}).click();await settled();};
 const noticeClear=async()=>{
  const notice=await page.locator('.configured-notice').boundingBox();assert.ok(notice);
  const canvas=await page.locator('canvas[data-game-canvas]').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,s:+el.dataset.cameraScale,cx:+el.dataset.cameraX,cy:+el.dataset.cameraY};});
  const targets=[['119',145,960,161,86],['120',145,1056,161,86],['perimeter',418,877,252,349]].map(([id,x,y,w,h])=>({id,x:canvas.x+canvas.cx+x*canvas.s,y:canvas.y+canvas.cy+y*canvas.s,w:w*canvas.s,h:h*canvas.s}));
  report.geometry.push({viewport:page.viewportSize(),notice,targets});
  for(const t of targets)assert.ok(!(notice.x<t.x+t.w&&notice.x+notice.width>t.x&&notice.y<t.y+t.h&&notice.y+notice.height>t.y),'notice overlaps '+t.id+' at '+JSON.stringify(page.viewportSize()));
 };
 await page.goto(pathToFileURL(file).href,{waitUntil:'load',timeout:90000});const start=await page.getByRole('button',{name:'继续游戏',exact:true}).boundingBox();await page.mouse.click(start.x+start.width/2,start.y+start.height/2);
 await page.getByRole('button',{name:/打开群岛选择/}).click();await page.getByRole('button',{name:'公共安全，点击前往',exact:true}).click();await page.locator('[data-map-node="well-call"]').click();await page.getByRole('button',{name:'开始井口求助',exact:true}).click();await settled();
 assert.match(await text(),/练习用时/);assert.equal(await page.locator('.configured-coaching li').count(),3);await shot('01-任务与提示');
 await page.locator('.configured-coaching summary').click();assert.match(await text(),/阳光小区东侧/);await shot('02-现场信息');await page.locator('.configured-coaching summary').click();check('visible tasks, practice-time label and readable scene information');
 await tap(230,580);await settled();assert.match(await text(),/正在外围观察/);assert.notEqual(await page.locator('.configured-player').getAttribute('data-emotion'),'panicked');assert.equal(await page.locator('.configured-player').getAttribute('data-resolved'),'');await shot('03-观察不判错');check('well inspection is neutral and awards nothing');
 await startDrag(230,580);assert.match(await text(),/禁止放置/);await shot('04-危险落点');await page.mouse.up();await settled();assert.match(await text(),/不要进入井内施救/);check('deliberate well drop still warns and remains recoverable');
 await drag(630,780);await page.waitForTimeout(600);assert.match(await text(),/旁观者回到原位/);check('missed drop speaks about the bystander, not an item');
 await startDrag(545,1050);await noticeClear();await shot('05-外围标签不遮挡');await page.mouse.up();await settled();await goal('bystander-back');assert.match(await text(),/已提醒.*他回应/);await shot('06-劝退回应');check('bystander retreat has a human response');
 await tap(225,1003);await card('fire-report');assert.equal(await page.locator('.configured-player').getAttribute('data-resolved'),'bystander-back,fire-connected');await shot('07-119问答');
 await choose('只说“有人出事了”，不说明位置');assert.match(await text(),/还缺准确位置/);await page.waitForTimeout(2700);assert.match(await page.locator('.configured-conversation').innerText(),/还缺准确位置/);
 await page.getByRole('button',{name:'暂停',exact:true}).click();const elapsed=await page.locator('.configured-player').getAttribute('data-elapsed');await page.waitForTimeout(650);assert.equal(await page.locator('.configured-player').getAttribute('data-elapsed'),elapsed);await page.getByRole('button',{name:'继续游戏',exact:true}).click();await card('fire-report');check('wrong report is recoverable; pause preserves dialogue and freezes timer');
 await choose('报告：阳光小区东侧污水井，1人井内遇险');await goal('fire-called');await tap(225,1099);await card('medical-report');await shot('08-120不同问答');
 await choose('没有看清，也直接说“他没有受伤”');assert.match(await text(),/不要把不确定/);await choose('阳光小区东侧污水井，1人遇险，伤情暂不清楚');await card('perimeter-check');assert.equal(await page.locator('.configured-player').getAttribute('data-phase'),'playing');await shot('09-外围待援提醒');check('119 and 120 require different reports; three tasks do not auto-complete');
 await choose('已经打过电话，可以走近去看了');assert.match(await text(),/不代表现场已经安全/);await choose('别靠近，我们留在外围等专业人员');await page.getByText('还得是你！',{exact:true}).waitFor();assert.match(await text(),/井口和井内仍然危险/);await shot('10-完整结算');check('final reminder completes training without pretending rescue has arrived');
 await page.getByRole('button',{name:'种下小红花',exact:true}).click();await page.locator('[data-map-node="well-call"]').click();await page.getByRole('button',{name:'再玩一次',exact:true}).click();await settled();
 for(const [width,height] of [[320,568],[844,390],[1280,720]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(200);
  await startDrag(545,1050);await noticeClear();await shot(`11-拖动适配-${width}x${height}`);const blank=await world(630,780);await page.mouse.move(blank.x,blank.y,{steps:6});await page.mouse.up();await page.waitForTimeout(600);await settled();
  await tap(225,1099);await card('medical-report');const button=page.getByRole('button',{name:'阳光小区东侧污水井，1人遇险，伤情暂不清楚',exact:true});await button.scrollIntoViewIfNeeded();const b=await button.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width+1&&b.y>=0&&b.y+b.height<=height+1&&b.height>=44);await shot(`12-通话适配-${width}x${height}`);
  await restart();assert.equal(await page.locator('.configured-player').getAttribute('data-resolved'),'');assert.equal(await page.locator('[data-conversation]').count(),0);
 }
 check('320px, landscape and desktop: notices avoid both phone targets and retreat zone; dialogue choices reachable; restart clears progress');
 await page.setViewportSize({width:320,height:568});await page.waitForTimeout(200);await page.locator('.configured-coaching summary').click();const info=await page.locator('.configured-coaching details>div').boundingBox();assert.ok(info.y+info.height<=568);await shot('13-小屏现场信息');await page.locator('.configured-coaching summary').click();
 await tap(225,1099);await card('medical-report');await choose('阳光小区东侧污水井，1人遇险，伤情暂不清楚');await tap(225,1003);await card('fire-report');await choose('报告：阳光小区东侧污水井，1人井内遇险');await drag(545,1050);await card('perimeter-check');await choose('别靠近，我们留在外围等专业人员');await page.getByText('还得是你！',{exact:true}).waitFor();assert.match(await text(),/不重复发放/);assert.equal(await page.evaluate(id=>{const saved=JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1'));return saved.players.find(p=>p.id===saved.activePlayerId).completed[id];},'well-call'),3);check('120-first, retreat-last route works on narrow screen with no repeat reward');
 assert.deepEqual(report.errors,[]);check('no page errors');
}catch(error){report.failure=String(error.stack??error);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;console.error(error);}
finally{await browser.close();report.browserClosed=true;fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));}
