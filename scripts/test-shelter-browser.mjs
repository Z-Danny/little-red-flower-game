import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {dependency,root} from './lib/dependencies.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const main=process.argv.includes('--main');
const out=path.join(root,main?'outputs/shelter-verification-main':'outputs/shelter-verification');fs.mkdirSync(out,{recursive:true});
await dependency('esbuild').build({absWorkingDir:root,stdin:{contents:"export * as engine from './app/game/runtime/engine';export * as scene from './app/game/runtime/scene';export * as audio from './app/game/runtime/practice-audio';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:path.join(out,'runtime.mjs'),logLevel:'silent'});
const rt=await import(pathToFileURL(path.join(out,'runtime.mjs'))),pack={rules:JSON.parse(fs.readFileSync(path.join(root,'content/levels/fire-shelter-practice/level.json'))),skin:JSON.parse(fs.readFileSync(path.join(root,'content/levels/fire-shelter-practice/skins/paper-gouache.json')))};
const file=path.resolve(root,process.argv[2]??'outputs/高楼火灾审阅/小红花处置关_本地审阅.html');
const report={file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),checks:[],errors:[],network:[],physicalDevice:'not_run',humanListening:'not_run',status:'running',browserClosed:false};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});const page=await context.newPage();page.setDefaultTimeout(15000);
page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url());});
const raster={};for(const [id,a]of Object.entries(pack.skin.assets))raster[id]=await dependency('sharp')(path.join(root,'public',a.src.slice(1))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const alpha=(id,p)=>{const {data,info}=raster[id],x=Math.floor(p.x*info.width),y=Math.floor(p.y*info.height);return x>=0&&y>=0&&x<info.width&&y<info.height&&data[(y*info.width+x)*4+3]>180;};
const surface=page.locator('.configured-player'),canvas=page.locator('.configured-world canvas');
const tick=ms=>page.clock.runFor(ms);
const shot=name=>page.screenshot({path:path.join(out,name+'.png')});
const check=name=>{report.checks.push(name);console.log('PASS',name);};
async function state(){return {...rt.engine.createRun(pack),resolved:(await surface.getAttribute('data-resolved')).split(',').filter(Boolean),elapsed:Number(await surface.getAttribute('data-elapsed')),phase:await surface.getAttribute('data-phase')};}
async function xy(p){const b=await canvas.boundingBox(),c=await canvas.evaluate(n=>({x:+n.dataset.cameraX,y:+n.dataset.cameraY,scale:+n.dataset.cameraScale}));return{x:b.x+c.x+p.x*c.scale,y:b.y+c.y+p.y*c.scale};}
async function source(id){const run=await state(),pose=rt.scene.scenePoses(pack,run).find(p=>p.id===id),points=[];for(let y=.15;y<.9;y+=.08)for(let x=.15;x<.9;x+=.08){const p={x:pose.x+pose.w*x,y:pose.y+pose.h*y};if(rt.scene.pickObject(pack,run,p,alpha)===id)points.push(await xy(p));}
return page.evaluate(ps=>ps.find(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS'),points).then(p=>{assert(p,'visible hit '+id);return p;});}
async function tap(id){const p=await source(id);await page.touchscreen.tap(p.x,p.y);}
async function drop(id,zone,edge=false){const a=await source(id),z=pack.skin.zones[zone],b=await xy({x:z.x+z.w*(edge?.92:.5),y:z.y+z.h*.5});await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();}
async function restart(){const failed=(await surface.getAttribute('data-phase'))==='failed';await (failed?page.locator('.painted-failure').getByRole('button',{name:'不服，再来！',exact:true}):page.getByRole('button',{name:'重新开始',exact:true})).click();await tick(failed?300:100);assert.equal(await surface.getAttribute('data-phase'),'playing');}
const order=['close-room-door','block-door-gaps','reinforce-seal','contact-fire-service','shelter-family','signal-rescue'];
async function correct(id){const r=pack.rules.interactions.find(r=>r.id===id);if(r.mode==='tap')await tap(r.source);else await drop(r.source,r.target,true);assert.equal(await surface.getAttribute('data-action'),id);await tick(pack.skin.animations[id].durationMs+150);assert((await state()).resolved.includes(r.grants[0]),id+' committed');}
try{
 if(main){
   const saved=()=>page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1'));return s.players.find(p=>p.id===s.activePlayerId).completed;});
   await page.goto(pathToFileURL(file).href);await page.locator('[data-home-start]').click();await page.locator('[data-category="home"]').click();await page.clock.install();await tick(200);
   const enterMain=async()=>{const node=page.locator('[data-map-node="fire-shelter-practice"]');await node.scrollIntoViewIfNeeded();await node.click();await page.getByRole('button',{name:/^(进入场景|再守护一次)$/}).click();await page.waitForFunction(()=>document.querySelector('.configured-player')?.dataset.ready==='true');await page.locator('.configured-dialog').getByRole('button',{name:'进入场景',exact:true}).click();await tick(100);};
   await enterMain();await shot('main-opening');await drop('family','corridor-zone');assert.equal(await surface.getAttribute('data-phase'),'failed');assert.deepEqual(await saved(),{});check('main map fatal input earns nothing');await restart();
   for(const id of order)await correct(id);await tick(7500);await page.locator('.garden-settlement').waitFor();await shot('main-complete');assert.equal((await saved())['fire-shelter-practice'],3);check('actual main map six-step completion awards three');
   await page.locator('[data-testid="settlement-primary"]').click();await tick(3400);assert.equal(await page.locator('[data-map-node="fire-shelter-practice"]').getAttribute('data-status'),'complete');await enterMain();
   for(const id of order)await correct(id);await tick(7500);await page.locator('.garden-settlement').waitFor();assert.equal((await saved())['fire-shelter-practice'],3);check('main replay does not duplicate reward');
 }else{
 await page.goto(pathToFileURL(file).href+'#level=fire-shelter-practice&skin=paper-gouache');await page.getByRole('button',{name:'进入场景',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.configured-player')?.dataset.ready==='true');await page.clock.install();await page.getByRole('button',{name:'进入场景',exact:true}).click();await tick(150);await shot('opening');
 await tick(13200);await shot('cough-and-smoke');assert.equal(await surface.getAttribute('data-audio-state'),'running');
 const audioSamples=[];for(let i=0;i<12;i++){await page.waitForTimeout(60);await tick(80);audioSamples.push(Number(await surface.getAttribute('data-audio-rms')));}
 assert(audioSamples.some(n=>n>0.0001),'audio graph produces real nonzero samples');report.audioSamples=audioSamples;check('user gesture unlocks offline audio with measured output');
 await page.getByRole('button',{name:'暂停',exact:true}).click();const before=await state();await tick(2000);assert.equal((await state()).elapsed,before.elapsed);await shot('pause');await restart();
 assert.equal(await surface.getAttribute('data-remaining'),'50');
 await tick(30000);await shot('smoke-30s-open');const openLoad=Number(await surface.getAttribute('data-smoke-load'));
 await correct('close-room-door');assert.equal(await surface.getAttribute('data-smoke-door'),'0');assert(Number(await surface.getAttribute('data-smoke-load'))>=openLoad);await shot('smoke-close-immediate');
 await tick(5500);await shot('smoke-closed-tail');const closedLoad=Number(await surface.getAttribute('data-smoke-load'));
 await correct('block-door-gaps');assert.equal(await surface.getAttribute('data-smoke-gap'),'0.055');assert(Number(await surface.getAttribute('data-smoke-load'))>=closedLoad);await tick(4200);await shot('smoke-sealed');
 await tick(14000);assert.equal(await surface.getAttribute('data-remaining'),'0');assert.equal(await surface.getAttribute('data-phase'),'playing');await shot('countdown-zero');check('50s zero continues and smoke reservoir persists after mitigation');await page.getByRole('button',{name:'暂停',exact:true}).click();await restart();
 await drop('sealing-tape','door-gaps');await tick(800);assert.equal((await state()).resolved.length,0);check('reinforcement cannot replace first seal');
 await drop('side-table','door-gaps');await tick(800);assert.equal((await state()).resolved.length,0);assert.equal(await surface.getAttribute('data-phase'),'playing');check('ordinary furniture bounces without failure');
 for(const id of order){if(id==='signal-rescue'){await tap('family');await tick(100);assert(!(await state()).resolved.includes('rescue-signalled'));check('tapping family cannot use flashlight');}await correct(id);await shot(id);}
 for(let i=0;i<18&&Math.sin((await state()).elapsed/1000*2.4)<.8;i++)await tick(100);
 await shot('flashlight-straight-beam');
 assert.equal(await surface.getAttribute('data-phase'),'settling');await tick(3250);await shot('waiting-rescue');await tick(5000);assert.equal(await surface.getAttribute('data-phase'),'complete');check('six actions + simulated rescue wait complete');await shot('complete');
 for(const [id,zone]of [['family','door-handle'],['family','corridor-zone'],['family','outside-window']]){await restart();await drop(id,zone);assert.equal(await surface.getAttribute('data-phase'),'failed');assert.equal(await page.locator('.configured-flowers').count(),0);await shot('failure-'+zone);check('immediate failure '+zone);}
 await restart();await correct('close-room-door');await tap('room-door');assert.equal(await surface.getAttribute('data-phase'),'failed');check('closed door cannot be reopened safely');
 for(const [w,h]of [[320,568],[375,667],[390,844],[430,932],[1440,900]]){
  await restart();await page.setViewportSize({width:w,height:h});await tick(250);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1||document.documentElement.scrollWidth>innerWidth+1),false);
  assert.equal(await canvas.getAttribute('data-critical-clipped'),'false');
  for(const id of order)await correct(id);await tick(7400);assert.equal(await surface.getAttribute('data-phase'),'complete');await shot('complete-'+w+'x'+h);check('real edge drops and complete '+w+'x'+h);
 }
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;process.exitCode=1;console.error(e);await shot('FAIL').catch(()=>{});}finally{await browser.close();report.browserClosed=true;fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));}
