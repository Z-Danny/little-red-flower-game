import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {dependency,root} from './lib/dependencies.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/LEGION/Documents/Codex/2026-09-19/https-github-com-z-danny-little-3/work/tools/playtest/node_modules/playwright');
const html=path.resolve(process.argv[2]??'outputs/kitchen-peak-offline/小红花应急行动.html');
const out=path.resolve('outputs/kitchen-peak-verification');fs.mkdirSync(out,{recursive:true});
const report={html,sha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),checks:[],errors:[],network:[],physicalDevice:'not_run',humanListening:'not_run',browserClosed:false};
const runtime=path.join(out,'input-runtime.mjs');
await dependency('esbuild').build({absWorkingDir:root,stdin:{resolveDir:root,contents:"export * as config from './app/game/kitchen/config';export * as camera from './app/game/kitchen/camera';export * as input from './app/game/kitchen/interaction';export * as model from './app/game/kitchen/model';"},bundle:true,platform:'node',format:'esm',outfile:runtime,logLevel:'silent'});
const rt=await import(pathToFileURL(runtime));const images={};
for(const [id,src] of Object.entries(rt.config.assets))if(id!=='room')images[id]=await dependency('sharp')(path.join(root,'public',src)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const alpha=(id,b,p)=>{const a=images[id],x=Math.floor((p.x-b.x)/b.w*a.info.width),y=Math.floor((p.y-b.y)/b.h*a.info.height);return x>=0&&y>=0&&x<a.info.width&&y<a.info.height&&a.data[(y*a.info.width+x)*4+3]>35;};
const center=b=>({x:b.x+b.w/2,y:b.y+b.h/2});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'content/response/audio-manifest.json'),'utf8')).assets;
const audioHashes=Object.fromEntries(Object.entries(manifest).map(([id,a])=>[createHash('sha256').update(fs.readFileSync(path.join(root,'public',a.src.slice(1)))).digest('hex'),id]));
let browser, page;
const check=name=>{report.checks.push(name);console.log('PASS '+name);};
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',hasTouch:true,isMobile:true});
 await context.route(/^https?:/,r=>{report.network.push(r.request().url());return r.abort();});
 await context.addInitScript(()=>{localStorage.setItem('red-flower:interface-muted','true');localStorage.setItem('little-red-flower-leaderboard-v1',JSON.stringify({version:1,players:[{id:'peak-test',name:'温度计测试',region:'',createdAt:1,completed:{},allLevelsUnlocked:true}],activePlayerId:'peak-test'}));});
 await context.addInitScript(hashes=>{
   window.__kitchenSounds=[];const ids=new WeakMap(),Original=window.AudioContext;
   window.AudioContext=class extends Original {
     async decodeAudioData(bytes){const copy=bytes.slice(0),buffer=await super.decodeAudioData(bytes);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',copy))).map(n=>n.toString(16).padStart(2,'0')).join('');ids.set(buffer,hashes[hash]);return buffer;}
     createBufferSource(){const source=super.createBufferSource(),start=source.start.bind(source),stop=source.stop.bind(source);let record;
       source.start=(...args)=>{const id=ids.get(source.buffer);if(id){record={id,phase:document.querySelector('.kitchen-player')?.dataset.phase,heat:document.querySelector('[role=meter]')?.dataset.heat,popup:!!document.querySelector('.painted-failure-card'),stopped:false,ended:false};window.__kitchenSounds.push(record);}return start(...args);};
       source.stop=(...args)=>{if(record&&!record.ended)record.stopped=true;return stop(...args);};source.addEventListener('ended',()=>{if(record)record.ended=true;});return source;}
   };
 },audioHashes);
 page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.clock.install();
 await page.goto(pathToFileURL(html).href,{waitUntil:'load',timeout:120000});
 await page.locator('[data-home-start]').click();await page.locator('[data-map-node]').first().waitFor();
 const map=JSON.parse(fs.readFileSync('content/journey-map.json','utf8'));const region=map.regions.find(r=>r.nodes.some(n=>n.id==='oil-fire')).id;
 if(await page.locator('[data-journey-map]').getAttribute('data-region')!==region){await page.locator('[data-map-fan-toggle]').click();await page.locator(`[data-island="${region}"]`).click();}
 await page.locator(`[data-journey-map][data-region="${region}"]`).waitFor();
 await page.locator('[data-map-node="oil-fire"]').click();await page.getByRole('button',{name:/^(开始应对锅火|再玩一次)$/}).click();
 const player=page.locator('.kitchen-player');await page.waitForFunction(()=>document.querySelector('.kitchen-player')?.dataset.phase==='playing');await page.waitForFunction(()=>Number(document.querySelector('.kitchen-player')?.dataset.audioLoaded)>=14);await page.clock.pauseAt(new Date(Date.now()+1000));
 const tick=ms=>page.clock.runFor(ms),phase=()=>player.getAttribute('data-phase'),elapsed=async()=>Number(await player.getAttribute('data-elapsed'));
 const heat=async()=>Number(await page.locator('[role=meter]').getAttribute('data-heat'));
 const board=()=>page.evaluate(()=>localStorage.getItem('little-red-flower-leaderboard-v1'));const original=await board();
 await tick(Math.max(0,48000-await elapsed()));assert.equal(await phase(),'playing');assert((await heat())<1);assert((await elapsed())>47000);check('below the peak remains playable');
 await page.getByRole('button',{name:'场景提示',exact:true}).click();const pausedAt=await elapsed();await tick(7000);assert.equal(await elapsed(),pausedAt);assert.equal(await phase(),'playing');
 await page.getByRole('button',{name:/继续游戏|返回游戏|继续处置/}).click();check('pause freezes temperature and failure clock');
 await tick(2500);assert.equal(await phase(),'failed');assert.equal(await heat(),1);await page.locator('.painted-failure-card').waitFor();assert.match(await page.locator('[data-testid="failure-reason"]').innerText(),/温度计已到顶/);assert.equal(await board(),original);check('full thermometer shows failure and awards no flowers');
 const frozen=await elapsed();await tick(4000);assert.equal(await elapsed(),frozen);assert.equal(await player.getAttribute('data-action'),'');assert.equal(await page.locator('.kitchen-world').getAttribute('inert'),'');check('failure freezes time and scene input');
 for(const [width,height] of [[390,844],[320,568],[1440,900]]){await page.setViewportSize({width,height});await tick(100);const buttons=await page.locator('.painted-failure-actions button').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));assert(buttons.every(b=>b.x>=0&&b.y>=0&&b.right<=width&&b.bottom<=height));await page.screenshot({path:path.join(out,`failure-${width}x${height}.png`)});}check('failure actions fit phone and desktop viewports');
 await page.setViewportSize({width:390,height:844});await page.locator('[data-testid="failure-retry"]').click();await tick(100);assert.equal(await phase(),'playing');assert((await heat())<.24);assert.equal(await page.locator('.painted-failure-card').count(),0);check('retry resets temperature and removes failure');
 // Keyboard-equivalent clicks target the real accessible controls, not injected game state.
 const press=async name=>{await page.getByRole('button',{name,exact:true}).evaluate(n=>n.click());};
 const dragIntoPan=async id=>{
   const bounds=await page.locator('.kitchen-world canvas').boundingBox(),camera=rt.camera.cameraFor(bounds.width,bounds.height);
   const xy=p=>({x:bounds.x+camera.x+p.x*camera.scale,y:bounds.y+camera.y+p.y*camera.scale});
   const state={...rt.model.createRun(),phase:'playing',elapsed:await elapsed()},b=rt.config.layout.props[id],points=[];
   for(let y=.12;y<.9;y+=.065)for(let x=.12;x<.9;x+=.065){const p={x:b.x+b.w*x,y:b.y+b.h*y};if(rt.input.pickSceneItem(p,state,alpha,true)===id)points.push({world:p,screen:xy(p)});}
   const source=await page.evaluate(ps=>{const visible=ps.filter(p=>document.elementFromPoint(p.screen.x,p.screen.y)?.tagName==='CANVAS');return visible[Math.floor(visible.length/2)];},points);
   assert(source,'visible drag source '+id);const home=center(b),dest=center(rt.config.layout.zones.pan),end=xy({x:dest.x+source.world.x-home.x,y:dest.y+source.world.y-home.y});
   await page.mouse.move(source.screen.x,source.screen.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:12});await page.mouse.up();
 };
 for (const [label,reason] of [['水杯', /不能泼水/], ['小湿抹布', /化纤抹布/]]) {
   assert((await heat())<.24);const before=await elapsed();
   await dragIntoPan(label==='水杯'?'water':'cloth');
   assert.equal(await phase(),'failing');assert.equal(await heat(),1);assert.equal(await elapsed(),before);
   assert.equal(await page.locator('.painted-failure-card').count(),0);
   const sound=label==='水杯'?'fx-water':'cloth';
   assert.equal(await page.evaluate(id=>window.__kitchenSounds.filter(e=>e.id===id).length,sound),0);
   if(label==='水杯'){
     await page.getByRole('button',{name:'场景提示',exact:true}).click();const paused=await elapsed();await tick(3000);assert.equal(await elapsed(),paused);assert.equal(await phase(),'failing');
     await page.getByRole('button',{name:'继续游戏',exact:true}).click();check('feedback pause freezes pending failure before its sound cue');
   }
   await tick(250);assert.equal(await phase(),'failing');assert.equal(await page.locator('.painted-failure-card').count(),0);
   const cues=await page.evaluate(id=>window.__kitchenSounds.filter(e=>e.id===id||e.id==='flare'),sound);
   assert(cues.some(e=>e.id===sound&&e.phase==='failing'&&e.heat==='1.0000'&&!e.popup));
   assert(cues.some(e=>e.id==='flare'&&e.phase==='failing'&&!e.popup));
   await page.screenshot({path:path.join(out,sound+'-feedback-before-failure.png')});
   // Browser clock advances gameplay; native WebAudio playback uses real time.
   await new Promise(resolve=>setTimeout(resolve,1750));
   const played=await page.evaluate(id=>window.__kitchenSounds.filter(e=>e.id===id),sound);
   assert.equal(played.length,1);assert(played[0].ended&&!played[0].stopped,'material sound must finish before the failure overlay');
   report.audioEvidence??=[];report.audioEvidence.push(...played);
   assert.equal(await page.locator('.painted-failure-card').count(),0);
   await tick(rt.config.timing.failureFeedback-350);assert.equal(await phase(),'failing');
   await tick(200);assert.equal(await phase(),'failed');assert.equal(await heat(),1);
   assert.match(await page.locator('[data-testid="failure-reason"]').innerText(),reason);assert.equal(await board(),original);
   await page.screenshot({path:path.join(out,label==='水杯'?'water-instant-failure.png':'cloth-instant-failure.png')});
   check(label+' shows full thermometer, plays its complete sound once, then displays failure');
   if(label==='水杯'){await page.locator('[data-testid="failure-retry"]').click();await tick(100);}
 }
 await page.locator('[data-testid="failure-retry"]').click();await tick(100);
 await page.getByRole('button',{name:'场景提示',exact:true}).click();await page.locator('[data-pause-sound]').click();await page.getByRole('button',{name:'继续游戏',exact:true}).click();
 const beforeMute=await page.evaluate(()=>window.__kitchenSounds.filter(e=>e.id==='fx-water').length);
 await dragIntoPan('water');assert.equal(await phase(),'failing');await tick(rt.config.timing.failureFeedback+100);assert.equal(await phase(),'failed');
 assert.equal(await page.evaluate(()=>window.__kitchenSounds.filter(e=>e.id==='fx-water').length),beforeMute);check('muted feedback still reaches failure without waiting forever for an audio callback');
 await page.locator('[data-testid="failure-retry"]').click();await tick(100);
 await page.getByRole('button',{name:'场景提示',exact:true}).click();await page.locator('[data-pause-sound]').click();await page.getByRole('button',{name:'继续游戏',exact:true}).click();
 await press('关闭燃气');await tick(800);await press('锅盖');await press('作用于油锅');await tick(1000);assert.equal(await player.getAttribute('data-fire'),'out');assert.equal(await heat(),0);await tick(60000);assert.equal(await phase(),'playing');check('controlled fire stays safe beyond 50 seconds');
 await press('人物');await press('移动到门外');await tick(3000);await page.locator('.painted-settlement').waitFor();assert.equal(await page.locator('.painted-failure-card').count(),0);check('retry can complete normally and reach success');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';
}catch(e){if(page){report.body=await page.locator('body').innerText().catch(()=> '');await page.screenshot({path:path.join(out,'debug.png')}).catch(()=>{});}report.status='failed';report.failure=String(e.stack??e);throw e;}finally{if(browser){await browser.close();report.browserClosed=true;}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
