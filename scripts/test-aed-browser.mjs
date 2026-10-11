// Exercise the exported HTML, never a source-only dev route. Isolated, offline, muted, finally closed.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(import.meta.dirname,'..'),html=path.join(root,'outputs/response-preview/first-aid-aed/小红花应急行动.html'),out=path.join(root,'outputs/aed-v2-verification');
const skin=JSON.parse(fs.readFileSync(path.join(root,'content/levels/first-aid-aed/skins/realistic-v2.json'),'utf8'));
const report={html,sha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),status:'running',checks:[],errors:[],network:[],realDevice:'not_run',humanAudio:'not_run',closed:false};
let browser,context;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
 context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',offline:true,hasTouch:true});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url())});
 const surface=page.locator('[data-level="first-aid-aed"]'),canvas=surface.locator('canvas');
 const world=async(x,y)=>canvas.evaluate((el,{x,y})=>{const r=el.getBoundingClientRect();return{x:r.left+Number(el.dataset.cameraX)+x*Number(el.dataset.cameraScale),y:r.top+Number(el.dataset.cameraY)+y*Number(el.dataset.cameraScale)}},{x,y});
 const tap=async(x,y)=>{const p=await world(x,y);await page.touchscreen.tap(p.x,p.y);await page.waitForTimeout(650)};
 const drop=async(x,y,tx,ty)=>{const a=await world(x,y),b=await world(tx,ty);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();await page.waitForTimeout(650)};
 const has=async(id)=>assert((await surface.getAttribute('data-resolved')).split(',').includes(id),`expected ${id}: ${await surface.getAttribute('data-resolved')}`);
 const begin=async(scenario)=>{
  await page.goto('about:blank');
  await page.goto(pathToFileURL(html).href+'#scenario='+scenario,{waitUntil:'load',timeout:120000});
  await page.locator('[data-painted-intro]').waitFor();await page.getByRole('button',{name:'开始协作',exact:true}).waitFor();
  await page.screenshot({path:path.join(out,`intro-${scenario}.png`)});
  assert.equal(await page.locator('.configured-dialog').count(),0,'no custom text-wall entry dialog');
  await page.getByRole('button',{name:'开始协作',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-level="first-aid-aed"]')?.getAttribute('data-entered')==='true');
  assert.equal(await surface.getAttribute('data-scenario'),scenario);await page.waitForTimeout(400);
 };
 await begin('shock-advised');await page.screenshot({path:path.join(out,'opening-390.png')});
 if(process.env.AED_CAPTURE_ONLY){report.status='capture_only'}else{
 for(const scenario of ['shock-advised','no-shock-advised']){
  if(scenario==='no-shock-advised')await begin(scenario);
  await drop(500,858,500,699);await has('placed');await tap(474,745);await has('powered');
  await tap(325,416);await has('exposed');await drop(237,848,350,447);await has('dry');
  const z1=skin.zones['upper-zone'],z2=skin.zones['side-zone'];
  await drop(326,855,z1.x+z1.w/2,z1.y+z1.h/2);await has('pad-upper-on');await drop(400,855,z2.x+z2.w/2,z2.y+z2.h/2);await has('pad-side-on');
  await page.screenshot({path:path.join(out,`${scenario}-pads.png`)});
  await tap(315,932);await has('cleared');await page.screenshot({path:path.join(out,`${scenario}-analysis.png`)});
  await page.getByRole('button',{name:'暂停',exact:true}).click();await page.waitForTimeout(300);const age=await surface.getAttribute('data-elapsed');await page.waitForTimeout(500);assert.equal(await surface.getAttribute('data-elapsed'),age);await page.screenshot({path:path.join(out,'pause-shared.png')});await page.getByRole('button',{name:'继续游戏',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('[data-level="first-aid-aed"]')?.getAttribute('data-stages')?.includes('analyzed'));
  await page.screenshot({path:path.join(out,`${scenario}-decision.png`)});
  if(scenario==='shock-advised'){await tap(315,932);await has('shock-clear');await page.waitForFunction(()=>document.querySelector('[data-level="first-aid-aed"]')?.getAttribute('data-stages')?.includes('shock-ready'));await tap(527,745);await has('branch-ready');}
  else{await tap(527,745);assert(!(await surface.getAttribute('data-resolved')).includes('branch-ready'),'device does not shock in no-shock case');}
  const h=skin.states.find(s=>s.object==='helper'&&s.when.not?.includes('resumed')).pose;
  const pivot=h.pivot,dx=(.55-pivot.x)*h.w,dy=(.46-pivot.y)*h.h;
  await tap(h.x+h.w*pivot.x+Math.cos(h.rotation)*dx-Math.sin(h.rotation)*dy,h.y+h.h*pivot.y+Math.sin(h.rotation)*dx+Math.cos(h.rotation)*dy);await has('resumed');
  await page.screenshot({path:path.join(out,`${scenario}-resumed.png`)});await tap(366,932);await has('handed-over');
  await page.locator('[data-practice="true"].painted-settlement-card').waitFor();
  assert.equal(await page.locator('.configured-dialog').count(),0,'result reuses shared painted settlement, not legacy plain modal');
  assert((await page.getByTestId('settlement-reward').innerText()).includes('不写入正式成绩'));
  const seam=await page.locator('.painted-settlement-body').evaluate(el=>el.nextElementSibling.getBoundingClientRect().top-el.getBoundingClientRect().bottom);assert(Math.abs(seam)<1,'shared card body/footer have no margin-collapse gap');
  await page.screenshot({path:path.join(out,`${scenario}-complete.png`)});
  report.checks.push(`${scenario}: rendered drag/drop, safe device branch, physically separated rescuer, resume, shared intro/pause/result`);
 }
 for(const [width,height] of [[320,740],[390,844],[430,932],[360,900],[1440,1000]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(300);
  const title=await page.getByTestId('settlement-title').boundingBox();assert(title.x>=0&&title.x+title.width<=width,'settlement heading inside viewport');
  const btn=page.getByRole('button',{name:'再练一次',exact:true});await btn.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`result-${width}.png`)});await btn.click();
  await page.locator('[data-painted-intro]').waitFor();await page.screenshot({path:path.join(out,`intro-${width}.png`)});
  await page.getByRole('button',{name:'开始协作',exact:true}).click();await page.waitForTimeout(550);
  assert.equal(await canvas.getAttribute('data-critical-clipped'),'false',`${width}: no critical crop/HUD overlap`);assert.equal(await surface.getAttribute('data-resolved'),'');
  await page.screenshot({path:path.join(out,`viewport-${width}.png`)});report.checks.push(`${width}x${height}: scene/HUD safe, entry/result visible, replay resets`);
  // Solve again with the common keyboard alternative to inspect result at the next size.
  const keyboard=surface.locator('.configured-keyboard');const key=async(name)=>{const b=keyboard.getByRole('button',{name,exact:true});await b.focus();await page.keyboard.press('Enter');await page.waitForTimeout(560)};
  const put=async(a,b)=>{await key(a);await key('放到 '+b)};
  await put('放置 AED','身旁干燥地面');await key('开启 AED');await key('解开上衣，露出胸部');await put('干毛巾擦干贴片区域','擦干贴片区域');await put('电极片 ①','右上胸 ①');await put('电极片 ②','左侧胸 ②');await key('清场：大家离开，不要接触');await page.waitForTimeout(1800);await key('协助者：立即恢复 CPR');await key('接应并告知急救人员');await page.locator('[data-practice="true"]').waitFor();
 }
 assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage).filter(k=>/leaderboard/.test(k))),[],'no real progress write');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';
 }
}catch(error){report.status='failed';report.failure=error.stack;throw error}
finally{await context?.close();await browser?.close();report.closed=true;fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
