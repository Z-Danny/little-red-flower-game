/** Real pointer / touch input in an isolated muted browser. Fixtures unlock map only. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import {dependency,root} from './lib/dependencies.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const runtime=path.join(fs.mkdtempSync(path.join(tmpdir(),'stairs-browser-')),'runtime.mjs');
await dependency('esbuild').build({absWorkingDir:root,stdin:{resolveDir:root,contents:[
 "export * as engine from './app/game/runtime/engine';","export * as scene from './app/game/runtime/scene';",
 "export * as drops from './app/game/runtime/drop-zones';","export * as journey from './app/game/journey/progress';",
 "export {default as rules} from './content/levels/fire-stairs-practice/level.json';","export {default as skin} from './content/levels/fire-stairs-practice/skins/paper-gouache.json';"
].join('\n')},bundle:true,platform:'node',format:'esm',outfile:runtime,logLevel:'silent'});
const rt=await import(pathToFileURL(runtime)),pack={rules:rt.rules,skin:rt.skin},id=pack.rules.id;
const html=path.resolve(root,process.argv[2]??'outputs/本地离线版/小红花应急行动.html'),out=path.resolve(root,process.argv[3]??'docs/fire-stairs-refinement/verification/browser');fs.mkdirSync(out,{recursive:true});
const report={status:'running',html,sha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),checks:[],errors:[],network:[],physicalPhone:'not_run',humanListening:'not_run',browserClosed:false};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
const images={};for(const [id,a] of Object.entries(pack.skin.assets))images[id]=await dependency('sharp')(path.join(root,'public',a.src.slice(1))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const alpha=(id,p)=>{const a=images[id],x=Math.floor(p.x*a.info.width),y=Math.floor(p.y*a.info.height);return x>=0&&y>=0&&x<a.info.width&&y<a.info.height&&a.data[(y*a.info.width+x)*4+3]>35;};
let page,run;const player=()=>page.locator('.configured-player'),canvas=()=>page.locator('.configured-world canvas');
const tick=ms=>page.clock.runFor(ms),shot=n=>page.screenshot({path:path.join(out,n+'.png')});
const check=(name,data={})=>{report.checks.push({name,...data});console.log('PASS '+name);};
const scores=()=>page.evaluate(()=>{const a=JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1'));return a.players.find(p=>p.id===a.activePlayerId).completed;});
async function open(){
 await page.locator('[data-category="home"]').click();await tick(100);
 await page.locator('[data-map-node="'+id+'"]').scrollIntoViewIfNeeded();await page.locator('[data-map-node="'+id+'"]').click();
 await page.getByRole('button',{name:/^(进入场景|再守护一次)$/}).click();
 await page.waitForFunction(()=>document.querySelector('.configured-player')?.dataset.ready==='true');
 await page.locator('.configured-dialog').getByRole('button',{name:'进入场景',exact:true}).click();await tick(100);
 run=rt.engine.createRun(pack);
}
async function coords(){
 const b=await canvas().boundingBox(),c=await canvas().evaluate(c=>({x:Number(c.dataset.cameraX),y:Number(c.dataset.cameraY),scale:Number(c.dataset.cameraScale)}));
 return p=>({x:b.x+c.x+p.x*c.scale,y:b.y+c.y+p.y*c.scale});
}
async function pick(points){const p=await page.evaluate(ps=>{const a=ps.filter(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS');return a[Math.floor(a.length/2)];},points);assert(p,'visible unoccluded point');return p;}
async function action(ruleId,stopAt=0){
 run.resolved=(await player().getAttribute('data-resolved')).split(',').filter(Boolean);
 const rule=pack.rules.interactions.find(r=>r.id===ruleId),xy=await coords(),pose=rt.scene.scenePoses(pack,run,true).find(p=>p.id===rule.source),points=[];
 for(let y=.16;y<.90;y+=.035)for(let x=.12;x<.85;x+=.035){const p={x:pose.x+x*pose.w,y:pose.y+y*pose.h};if(rt.scene.pickObject(pack,run,p,alpha,true)===rule.source)points.push(xy(p));}
 const at=await pick(points);
 if(rule.mode==='tap')await page.touchscreen.tap(at.x,at.y);
 else{
  const z=pack.skin.zones[rule.target],dest=await pick([[.5,.5],[.25,.5],[.75,.5]].map(([x,y])=>({x:z.x+x*z.w,y:z.y+y*z.h})).filter(p=>rt.drops.pickRelevantZone(pack,run,p,rule.source)===rule.target).map(xy));
  await page.mouse.move(at.x,at.y);await page.mouse.down();await page.mouse.move(dest.x,dest.y,{steps:12});await tick(30);await page.mouse.up();
 }
 assert.equal(await player().getAttribute('data-action'),ruleId,'actual '+ruleId);
 await tick(stopAt||pack.skin.animations[rule.animation].durationMs+50);
 if(!stopAt){run.resolved=(await player().getAttribute('data-resolved')).split(',');assert(rule.grants.every(g=>run.resolved.includes(g)));}
}
try{
 for(const [width,height]of (process.env.STAIRS_QA_QUICK==='1'?[[390,844]]:[[320,568],[375,667],[390,844],[430,932],[1440,900]])){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:true,deviceScaleFactor:1,reducedMotion:width===390?'no-preference':'reduce'});
  page=await context.newPage();page.setDefaultTimeout(15000);
  await page.addInitScript(()=>{window.__starts=[];const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){window.__starts.push({length:this.buffer?.length,loop:this.loop,rate:this.buffer?.sampleRate});return start.apply(this,args);};});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url());});
  await page.goto(pathToFileURL(html).href);await page.locator('[data-home-start]').click();await page.locator('.garden-node').first().waitFor();
  await page.evaluate(ids=>{const key='little-red-flower-leaderboard-v1',s=JSON.parse(localStorage.getItem(key)),p=s.players.find(p=>p.id===s.activePlayerId);p.completed=Object.fromEntries(ids.map(id=>[id,3]));localStorage.setItem(key,JSON.stringify(s));},rt.journey.journeyMap.regions.flatMap(r=>r.nodes.map(n=>n.id)).filter(n=>n!==id));
  await page.reload();await page.locator('[data-home-continue]').click();await page.locator('.garden-node').first().waitFor();
  await page.clock.install({time:new Date('2026-09-13T03:00:00Z')});await page.clock.pauseAt(new Date('2026-09-13T03:00:01Z'));
  await open();await shot('start-'+width);
  const bounds=await player().boundingBox();assert(Math.abs(bounds.y)<1);assert(Math.abs(bounds.height-height)<1);
  if(width<600)assert(Math.abs(bounds.width-width)<1);else assert(bounds.width<=540);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1),false);
  assert(!(await page.locator('body').innerText()).includes('一起走'));check('fullscreen unchanged '+width,{bounds});
  await tick(6700);await page.waitForTimeout(200);
  let sounds=await page.evaluate(()=>window.__starts);for(const n of [41895,30870])assert(sounds.some(s=>s.length===n&&!s.loop),'alarm/cough PCM started '+n);
  check('native alarm and cough playback '+width);
  if(width===390){
   await page.getByRole('button',{name:'暂停',exact:true}).click();const elapsed=await player().getAttribute('data-elapsed');await tick(4000);
   assert.equal(await player().getAttribute('data-elapsed'),elapsed);assert.equal(await player().getAttribute('data-audio-state'),'suspended');
   await page.getByRole('button',{name:'全部静音',exact:true}).click();await page.getByRole('button',{name:'继续游戏',exact:true}).click();await tick(100);
   assert.equal(Number(await player().getAttribute('data-audio-rms')),0);
   await page.getByRole('button',{name:'暂停',exact:true}).click();await page.getByRole('button',{name:'取消静音',exact:true}).click();await page.getByRole('button',{name:'继续游戏',exact:true}).click();check('pause freezes time/audio; mute retained');
  }
  await action('exit-flat',780);await shot('automatic-close-'+width);await tick(500);
  assert.equal(await player().getAttribute('data-resolved'),'flat-exited');check('exit and automatic close '+width);
  if(width===390){await action('ordinary-lift-error');assert.equal(await player().getAttribute('data-resolved'),'flat-exited');check('ordinary elevator rejected without progress');}
  await action('use-stairs');await shot('outside-'+width);
  const begin=(await page.evaluate(()=>window.__starts)).length;await tick(8000);
  sounds=(await page.evaluate(()=>window.__starts)).slice(begin);assert(!sounds.some(s=>[41895,30870].includes(s.length)));
  check('outside stops alarm/cough '+width);
  await action('reach-outside-assembly');await shot('before-phone-'+width);
  await action('report-fire',400);await shot('taking-phone-'+width);await tick(720);await shot('calling-'+width);
  await tick(6000);await page.locator('.garden-settlement').waitFor();assert.equal((await scores())[id],3);await shot('complete-'+width);
  sounds=await page.evaluate(()=>window.__starts);assert(sounds.some(s=>s.length===31973),'telephone PCM');assert(sounds.some(s=>s.length===17199),'latch PCM');
  check('four pointer actions and reward '+width,{sounds});
  if(width===390){
   const saved=await scores();await page.getByRole('button',{name:/返回地图/}).click();await tick(3000);await open();
   for(const step of ['exit-flat','use-stairs','reach-outside-assembly','report-fire'])await action(step);
   await tick(6000);assert.deepEqual(await scores(),saved);assert.equal(await page.locator('.garden-reward-label').innerText(),'本关花朵已种下');check('replay does not duplicate reward');
  }
  await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;await shot('FAIL').catch(()=>{});console.error(e);process.exitCode=1;}
finally{await browser.close();report.browserClosed=true;fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));}
