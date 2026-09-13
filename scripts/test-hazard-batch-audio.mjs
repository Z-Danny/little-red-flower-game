/** Real AudioContext lifecycle checks. Hardware output muted; no subjective listening claim. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=path.join(root,'outputs/本地离线版/小红花应急行动.html');
const plan=JSON.parse(fs.readFileSync(path.join(root,'docs/hazard-batch-v2/production-plan.json')));
const report={at:new Date().toISOString(),htmlSha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),hardwareMuted:true,humanListening:false,status:'running',cases:[],closed:false};
const out=path.join(root,'docs/hazard-batch-v2/verification/audio-browser.json');
const persist=()=>fs.writeFileSync(out,JSON.stringify(report,null,2));
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
 for(const card of plan.levels.filter(c=>!process.env.HAZARD_LEVEL||c.authorId===process.env.HAZARD_LEVEL)){
  const result={id:card.id,status:'running',checks:[]};report.cases.push(result);
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  let page;
  try{
   await ctx.addInitScript(()=>{
    window.__qaAudio=[];window.__qaAnalyser=[];
    const Original=window.AudioContext;
    window.AudioContext=class extends Original{constructor(...args){super(...args);window.__qaAudio.push(this);}createAnalyser(){const node=super.createAnalyser();window.__qaAnalyser.push(node);return node;}};
    window.__qaRms=()=>Math.max(0,...window.__qaAnalyser.map(n=>{const a=new Float32Array(n.fftSize);n.getFloatTimeDomainData(a);return Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);}));
   });
   page=await ctx.newPage();result.pageErrors=[];page.on('pageerror',e=>result.pageErrors.push(e.message));await page.goto(pathToFileURL(html).href,{waitUntil:'load'});
   await page.locator('button.map-level').filter({hasText:card.title}).click();
   await page.locator('.hunt-entry > button').waitFor({timeout:30000});
   assert.equal(await page.evaluate(()=>window.__qaAudio.length),0);result.checks.push('No AudioContext before gesture');
   await page.locator('.hunt-entry > button').click();
   const audible=()=>page.waitForFunction(()=>window.__qaRms()>0.0001,{},{timeout:12000,polling:20});
   const silent=async()=>{await page.waitForTimeout(650);await page.waitForFunction(()=>window.__qaRms()<=0.0001,{},{timeout:6000,polling:20});};
   const pause=()=>page.getByRole('button',{name:'暂停游戏',exact:true}).click();
   const resume=()=>page.getByRole('button',{name:'继续游戏',exact:true}).click();
   await audible();result.checks.push('Real analyser reports nonzero generated music/ambience');
   const samples=JSON.parse(fs.readFileSync(path.join(root,'art-source/hazard-batch-v2',card.authorId,'hit-samples.json')));
   const clickWorld=async point=>{const b=await page.locator('.hunt-world canvas').boundingBox(),s=Math.min(b.width/720,b.height/1280);await page.mouse.click(b.x+(b.width-720*s)/2+point[0]*s,b.y+(b.height-1280*s)/2+point[1]*s);};
   await clickWorld(samples.background);
   await page.waitForFunction(()=>document.querySelector('.hunt-world canvas')?.dataset.audioCue==='wrong');result.checks.push('Misclick dispatches wrong sound');
   // Choose the last target (all seven place it below the top HUD).
   await clickWorld(samples.targets[card.targets.at(-1).id]);
   await page.waitForFunction(()=>document.querySelector('.hunt-world canvas')?.dataset.audioCue==='found');result.checks.push('Completed recognition dispatches found sound');
   await pause();await silent();result.checks.push('Pause fades native analyser to zero');
   await page.getByRole('button',{name:'关闭声音',exact:true}).click();await resume();await page.waitForTimeout(850);await silent();result.checks.push('Mute persists on resume');
   await pause();await page.getByRole('button',{name:'打开声音',exact:true}).click();await resume();await audible();
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
   await silent();result.checks.push('Synthetic background lifecycle fades actual signal to zero');
   await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await audible();result.checks.push('Foreground/unmute restores actual signal');
   await pause();await page.locator('.hunt-dialog').getByRole('button',{name:'结束本次观察',exact:true}).click();
   await page.locator('.hunt-dialog').getByRole('button',{name:'返回关卡',exact:true}).click();
   await page.waitForFunction(()=>window.__qaAudio.length>0&&window.__qaAudio.every(c=>c.state==='closed'));result.checks.push('Every native AudioContext closed after leaving level');
   result.status='passed';
  }catch(e){result.status='failed';result.error=String(e.stack??e);if(page)result.diagnostic=await page.evaluate(()=>({contexts:window.__qaAudio?.map(c=>({state:c.state,time:c.currentTime})),player:{...document.querySelector('.hunt-player')?.dataset},canvas:{...document.querySelector('.hunt-world canvas')?.dataset}})).catch(()=>null);throw e;}
  finally{await ctx.close();result.contextClosed=true;persist();}
  console.log(card.authorId+' audio lifecycle PASS');
 }
 report.status='passed';
}catch(e){report.status='failed';report.error=String(e.stack??e);process.exitCode=1;console.error(e);}
finally{if(browser)await browser.close();report.closed=true;persist();}
