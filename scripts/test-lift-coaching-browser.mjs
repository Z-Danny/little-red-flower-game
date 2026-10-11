/** Final-file regression: isolated save, muted Edge, always closed. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH??'playwright');
const file=path.resolve(process.argv[2]??'../交互优化离线版/小红花应急行动.html');
const out=path.resolve(process.argv[3]??'../电梯关改进-2026-09-27');fs.mkdirSync(out,{recursive:true});
const report={file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),checks:[],errors:[],physicalDevice:'not_run',humanListening:'not_run',prerequisite:'clear-corridor only, isolated profile',browserClosed:false};
const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
const check=s=>{report.checks.push(s);console.log('PASS '+s);};
let page;
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{if(!localStorage.getItem('little-red-flower-leaderboard-v1'))localStorage.setItem('little-red-flower-leaderboard-v1',JSON.stringify({version:1,players:[{id:'lift-test',name:'电梯测试',region:'',createdAt:1,completed:{'clear-corridor':3}}],activePlayerId:'lift-test'}));});
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
 const shot=name=>page.screenshot({path:path.join(out,name+'.png')});
 const text=()=>page.locator('body').innerText();
 const settled=()=>page.waitForFunction(()=>{const e=document.querySelector('.configured-player');return e?.dataset.phase!=='ready'&&e?.dataset.action==='';});
 const resolved=goal=>page.waitForFunction(goal=>document.querySelector('.configured-player')?.dataset.resolved.split(',').includes(goal),goal);
 const card=id=>page.locator(`[data-conversation="${id}"]`).waitFor();
 const world=async(x,y)=>page.locator('canvas[data-game-canvas]').evaluate((el,{x,y})=>{const r=el.getBoundingClientRect(),s=Number(el.dataset.cameraScale);return{x:r.x+Number(el.dataset.cameraX)+x*s,y:r.y+Number(el.dataset.cameraY)+y*s}},{x,y});
 const tap=async(x,y)=>{const p=await world(x,y);await page.mouse.click(p.x,p.y);};
 const drag=async(x,y,name)=>{const a=await world(411,765),b=await world(x,y);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:18});if(name)await shot(name);await page.mouse.up();await settled();};
 const choose=async(name)=>{await page.getByRole('button',{name,exact:true}).click();await settled();};
 await page.goto(pathToFileURL(file).href,{waitUntil:'load',timeout:90000});
 const start=await page.getByRole('button',{name:'继续游戏',exact:true}).boundingBox();await page.mouse.click(start.x+start.width/2,start.y+start.height/2);
 await page.getByRole('button',{name:/打开群岛选择/}).click();await page.getByRole('button',{name:'公共安全，点击前往',exact:true}).click();
 await page.locator('[data-map-node="lift-wait"]').click();await page.getByRole('button',{name:'开始故障应对',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.configured-player')?.dataset.ready==='true');await settled();
 assert.match(await text(),/练习用时/);
 assert.equal(await page.locator('.configured-coaching li').count(),3);
 assert.ok(await page.locator('.configured-coaching').evaluate(el=>{const r=el.getBoundingClientRect();return [...el.querySelectorAll('li')].every(li=>li.getBoundingClientRect().right<=r.right+1);}),'task labels must fit inside the toolbar');await shot('01-任务状态');check('persistent tasks and labelled practice time');
 await tap(600,742);await settled();assert.match(await text(),/楼层键没有响应/);check('floor button has contextual feedback');
 await drag(360,500,'02-危险落点预览');assert.match(await text(),/不要尝试从门缝离开/);check('door drop warns and gives no goal');
 await tap(625,622);await card('location');await shot('03-报告位置');
 assert.equal(await page.locator('.configured-player').getAttribute('data-resolved'),'call-started');check('alarm click alone cannot complete contact');
 await choose('看见楼层键“2”，就报告在2楼');assert.match(await text(),/不是当前停靠位置/);await page.waitForTimeout(3000);assert.match(await page.locator('.configured-conversation').innerText(),/不是当前停靠位置/);check('wrong answer explanation remains readable after transient notice expires');
 await page.getByRole('button',{name:'暂停',exact:true}).click();const elapsed=await page.locator('.configured-player').getAttribute('data-elapsed');await page.waitForTimeout(700);assert.equal(await page.locator('.configured-player').getAttribute('data-elapsed'),elapsed);
 await page.getByRole('button',{name:'继续游戏',exact:true}).click();await card('location');check('pause freezes timer and resumes same conversation');
 await choose('阳光小区 · 1栋2号梯');await card('status');await choose('不看现场，先说有人受伤');assert.match(await text(),/如实说明观察到/);await choose('1人被困，目前无人受伤');await resolved('alarm-contacted');
 await drag(166,990,'04-安全等待区预览');await card('waiting');assert.equal(await page.locator('.configured-player').getAttribute('data-phase'),'playing');await shot('05-待援回应');
 await choose('既然已联系，就到门缝旁等着出去');assert.match(await text(),/不代表已经可以离开/);check('contact and placement do not auto-complete; waiting reply is required');
 await choose('我会保持联系，有不适及时报告');await page.getByText('还得是你！',{exact:true}).waitFor();assert.match(await text(),/本关只完成求助/);await shot('06-完成结算');check('normal route with recoverable wrong choices reaches honest waiting settlement');
 await page.getByRole('button',{name:'种下小红花',exact:true}).click();await page.locator('[data-map-node="lift-wait"]').click();await page.getByRole('button',{name:'再玩一次',exact:true}).click();await settled();
 await drag(166,990);await resolved('person-waiting');await tap(625,622);await card('location');
 for(const [width,height] of [[320,568],[844,390],[1280,720]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(250);
  const b=page.getByRole('button',{name:'阳光小区 · 1栋2号梯',exact:true});await b.scrollIntoViewIfNeeded();const box=await b.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height+1);assert.ok(box.height>=44);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);await shot('07-对话适配-'+width+'x'+height);
 }
 check('320x568, landscape and desktop: choices reachable, no horizontal overflow, >=44px targets');
 await page.setViewportSize({width:390,height:844});await choose('阳光小区 · 1栋2号梯');await card('status');
 await page.getByRole('button',{name:'暂停',exact:true}).click();await page.getByRole('button',{name:'重新开始本局游戏',exact:true}).click();await settled();
 assert.equal(await page.locator('.configured-player').getAttribute('data-resolved'),'');assert.equal(await page.locator('[data-conversation]').count(),0);check('restart during report clears conversation and all goals');
 await drag(166,990);await resolved('person-waiting');await tap(625,622);await card('location');await choose('阳光小区 · 1栋2号梯');await card('status');await choose('1人被困，目前无人受伤');await card('waiting');await choose('我会保持联系，有不适及时报告');await page.getByText('还得是你！',{exact:true}).waitFor();assert.match(await text(),/不重复发放/);assert.equal(await page.evaluate(id=>{const saved=JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1'));return saved.players.find(p=>p.id===saved.activePlayerId).completed[id];},'lift-wait'),3);check('waiting-first route works and replay does not duplicate reward');
 assert.deepEqual(report.errors,[]);check('no page errors');
}catch(error){report.failure=String(error.stack??error);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;console.error(error);}
finally{await browser.close();report.browserClosed=true;fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));}
