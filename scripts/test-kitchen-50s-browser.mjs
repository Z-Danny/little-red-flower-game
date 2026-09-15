/** Isolated, muted offline browser. Actual canvas input; no injected game/save state. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {dependency,root} from './lib/dependencies.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const runtime=path.join(fs.mkdtempSync(path.join(tmpdir(),'kitchen-50s-')),'runtime.mjs');
await dependency('esbuild').build({absWorkingDir:root,stdin:{resolveDir:root,contents:[
 "export * as config from './app/game/kitchen/config';","export * as model from './app/game/kitchen/model';",
 "export * as scene from './app/game/kitchen/animation';","export * as input from './app/game/kitchen/interaction';",
 "export * as camera from './app/game/kitchen/camera';","export * as journey from './app/game/journey/progress';"
].join('\n')},bundle:true,platform:'node',format:'esm',outfile:runtime,logLevel:'silent'});
const rt=await import(pathToFileURL(runtime));
const html=path.resolve(root,process.argv[2]??'outputs/本地离线版/小红花应急行动.html');
const out=path.resolve(root,process.argv[3]??'outputs/kitchen-50s-verification/browser');fs.mkdirSync(out,{recursive:true});
const quick=process.env.KITCHEN_QA_QUICK==='1';
const audioManifest=JSON.parse(fs.readFileSync(path.join(root,'content/response/audio-manifest.json'))).assets;
const audioHashes=Object.fromEntries(Object.entries(audioManifest).map(([id,a])=>[createHash('sha256').update(fs.readFileSync(path.join(root,'public',a.src.slice(1)))).digest('hex'),id]));
const characterIds=Object.entries(audioManifest).filter(([,a])=>a.bus==='character').map(([id])=>id);
const report={status:'running',mode:quick?'final-integration-smoke':'full-kitchen-regression',html,sha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),checks:[],errors:[],network:[],physicalDevice:'not_run',humanListening:'not_run',browserClosed:false};
const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
const images={};for(const [id,src] of Object.entries(rt.config.assets))if(id!=='room')images[id]=await dependency('sharp')(path.join(root,'public',src)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const alpha=(id,b,p)=>{const a=images[id],x=Math.floor((p.x-b.x)/b.w*a.info.width),y=Math.floor((p.y-b.y)/b.h*a.info.height);return x>=0&&y>=0&&x<a.info.width&&y<a.info.height&&a.data[(y*a.info.width+x)*4+3]>35;};
const center=b=>({x:b.x+b.w/2,y:b.y+b.h/2});
const check=(name,data={})=>{report.checks.push({name,...data});console.log('PASS '+name);};
let page,local;
const player=()=>page.locator('.kitchen-player');
const tick=ms=>page.clock.runFor(ms);
const shot=name=>page.screenshot({path:path.join(out,name+'.png')});
const timer=async()=>Number(await player().getAttribute('data-remaining'));
const heat=async()=>Number(await page.getByRole('meter').getAttribute('data-heat'));
const saved=()=>page.evaluate(()=>localStorage.getItem('little-red-flower-leaderboard-v1'));
const soundStatus=()=>player().evaluate(el=>({state:el.dataset.audioState,loaded:Number(el.dataset.audioLoaded),missing:el.dataset.audioMissing,loops:Number(el.dataset.audioLoops),plays:Number(el.dataset.characterPlays),cue:el.dataset.characterCue,rms:Number(el.dataset.audioRms),rate:Number(el.dataset.musicRate)}));
async function open(){
 await page.locator(`[data-category="${rt.journey.regionFor('oil-fire').id}"]`).click();await tick(100);
 await page.locator('[data-map-node="oil-fire"]').click();
 await page.getByRole('button',{name:/^(进入场景|再守护一次)$/}).click();
 await player().waitFor();await page.waitForFunction(()=>document.querySelector('.kitchen-player')?.dataset.phase==='playing');
 await tick(33);local=rt.model.reduceRun(rt.model.createRun(),{type:'start'});
}
async function transform(){const b=await page.locator('.kitchen-world canvas').boundingBox(),c=rt.camera.cameraFor(b.width,b.height);return p=>({x:b.x+c.x+p.x*c.scale,y:b.y+c.y+p.y*c.scale});}
async function source(id){
 local.reaction=await player().getAttribute('data-emotion');local.elapsed=Number(await player().getAttribute('data-elapsed'));
 const b=id==='person'?rt.scene.personPose(local,true).box:id==='gas'?rt.config.layout.gas:rt.config.layout.props[id],xy=await transform(),points=[];
 for(let y=.12;y<.9;y+=.065)for(let x=.12;x<.9;x+=.065){const p={x:b.x+b.w*x,y:b.y+b.h*y};if(rt.input.pickSceneItem(p,local,alpha,true)===id)points.push({world:p,screen:xy(p)});}
 const p=await page.evaluate(ps=>{const v=ps.filter(p=>document.elementFromPoint(p.screen.x,p.screen.y)?.tagName==='CANVAS');return v[Math.floor(v.length/2)];},points);
 assert(p,'visible alpha target '+id);return p;
}
async function action(id,target,{stopAt=0}={}){
 const p=await source(id),xy=await transform();
 if(id==='gas')await page.touchscreen.tap(p.screen.x,p.screen.y);
 else{const home=center(rt.scene.itemBox(id,local)),dest=center(rt.config.layout.zones[target]);
   const end=xy({x:dest.x+p.world.x-home.x,y:dest.y+p.world.y-home.y});
   await page.mouse.move(p.screen.x,p.screen.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:12});await page.mouse.up();
 }
 const kinds={gas:'shutoff',lid:'cover',person:'evacuate',water:'water',cloth:'cloth',plate:'bounce',knife:'bounce'};
 assert.equal(await player().getAttribute('data-action'),kinds[id],`real input ${id}`);
 const duration=rt.config.timing[id==='gas'?'gas':id==='person'?'person':['water','cloth'].includes(id)?'wrong':['plate','knife'].includes(id)?'bounce':'lid'];
 if(stopAt){await tick(stopAt);return duration-stopAt;}
 await tick(duration+70);
 if(id==='gas')local.gasOff=true;if(id==='lid')local.covered=true;if(id==='person')local.evacuated=true;
}
async function geometry(width,height){
 assert.equal(await page.getByRole('meter').evaluate(el=>getComputedStyle(el).getPropertyValue('--meter-color').trim()),'#ce493d');
 const data=await page.evaluate(()=>{
  const root=document.querySelector('.kitchen-player'),rect=root.getBoundingClientRect(),meter=root.querySelector('[role=meter]').getBoundingClientRect();
  return{root:rect.toJSON(),meter:meter.toJSON(),buttons:[...root.querySelectorAll('.kitchen-hud>button')].map(n=>n.getBoundingClientRect().toJSON()),overflow:document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1,fill:root.querySelector('.kitchen-thermometer-liquid').getAttribute('y'),noBanner:!root.querySelector('.kitchen-countdown')&&!root.querySelector('[role=progressbar]')};
 });
 assert(!data.overflow);assert.equal(data.root.y,0);assert.equal(data.root.height,height);assert(data.root.width<=520);
 if(width<=430)assert.equal(data.root.width,width);else assert(Math.abs(data.root.x-(width-data.root.width)/2)<1);
 assert(data.noBanner);assert(data.meter.width===48);assert(data.meter.height>150&&data.meter.height<190);assert(data.meter.x>=data.root.x&&data.meter.x<=data.root.x+12);
 for(const b of data.buttons){assert(b.width>=44&&b.height>=44);assert(b.x>=data.root.x&&b.right<=data.root.right+.2);assert(b.bottom<=data.meter.top);}
 check(`full-screen floating HUD ${width}x${height}`,data);
}
async function assertEmptyThermometer(){
 const liquid=page.locator('.kitchen-thermometer-liquid'),highlight=page.locator('.kitchen-thermometer-highlight');
 assert.equal(Number(await liquid.getAttribute('height')),0,'no residual red in bulb');
 assert.equal(Number(await highlight.getAttribute('height')),0,'no floating liquid highlight');
 assert.equal(await liquid.evaluate(el=>parseFloat(getComputedStyle(el).height)),0,'actual rendered liquid is empty');
}
async function complete(order){for(const id of order){const before=await heat();await action(id,id==='gas'?'off':'pan');assert((await heat())<before,'thermometer falls after '+id);}assert.equal(await player().getAttribute('data-fire'),'out');assert.equal(await page.getByRole('meter').getAttribute('data-tone'),'safe');assert.equal(await heat(),0);await assertEmptyThermometer();await shot('controlled-before-exit');await action('person','exit');await tick(1800);await page.locator('.garden-settlement').waitFor();await tick(550);await assertEmptyThermometer();}
try{
 for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[1440,900]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:width<600,reducedMotion:'reduce'});
  page=await context.newPage();page.setDefaultTimeout(15000);
  await page.addInitScript(hashes=>{
   window.__kitchenStarts=[];const ids=new WeakMap(),Original=window.AudioContext;
   window.AudioContext=class extends Original{
    async decodeAudioData(bytes){const copy=bytes.slice(0),buffer=await super.decodeAudioData(bytes);const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',copy))).map(v=>v.toString(16).padStart(2,'0')).join('');ids.set(buffer,hashes[digest]);return buffer;}
    createBufferSource(){const source=super.createBufferSource(),start=source.start.bind(source);source.start=(...args)=>{const id=ids.get(source.buffer);if(id)window.__kitchenStarts.push({id,loop:source.loop});return start(...args);};return source;}
   };
  },audioHashes);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url());});
  await page.goto(pathToFileURL(html).href);await page.locator('[data-home-start]').click();await page.locator('.garden-node').first().waitFor();
  await page.clock.install({time:new Date('2026-09-13T01:00:00Z')});await page.clock.pauseAt(new Date('2026-09-13T01:00:01Z'));
  await open();assert.equal(await timer(),50);await geometry(width,height);await shot(`start-${width}x${height}`);
  const empty=await transform(),p=empty(center(rt.config.layout.props.extinguisher));
  await page.touchscreen.tap(p.x,p.y);await tick(350);assert.equal(await player().getAttribute('data-action'),'');assert.equal(await page.getByRole('button',{name:'取消选择'}).count(),0);
  await page.waitForTimeout(250);await tick(650);await page.waitForFunction(()=>Number(document.querySelector('.kitchen-player')?.dataset.audioLoaded)===14);
  let audio=await soundStatus();assert.equal(audio.missing,'');assert.equal(audio.loops,5);assert.equal(audio.plays,0);assert.equal(audio.cue,'');
  assert.equal(await page.getByRole('slider',{name:'人物语气与动作音量'}).count(),0);
  check(`no character sources; music/fire beds retained ${width}`,audio);
  if(width===390&&!quick){
   const before=await timer(),elapsed=await player().getAttribute('data-elapsed');
   await page.getByRole('button',{name:'暂停游戏',exact:true}).click();await tick(7000);
   assert.equal(await timer(),before);assert.equal(await player().getAttribute('data-elapsed'),elapsed);assert.equal((await soundStatus()).state,'suspended');
   await shot('paused-390x844');await page.getByRole('button',{name:'继续游戏',exact:true}).click();await tick(1000);assert((await timer())<before);
   await page.setViewportSize({width:390,height:724});await tick(100);await geometry(390,724);await page.setViewportSize({width:390,height:844});await tick(100);await geometry(390,844);
   check('pause freezes timer/audio; address-bar-sized resize preserves viewport and time');
   await page.getByRole('button',{name:'关闭声音',exact:true}).click();await tick(600);assert.equal((await soundStatus()).rms,0);
   await page.getByRole('button',{name:'打开声音',exact:true}).click();await page.waitForTimeout(1400);await tick(600);
   audio=await soundStatus();assert(audio.rms>0);check('unmute restores audible signal, not duplicate loops',audio);
   for(const id of ['water','cloth']){
    await page.waitForTimeout(1400);const before=await heat(),remain=await action(id,'pan',{stopAt:300});await page.waitForTimeout(100);await tick(500);
    assert((await heat())>=before,'wrong action raises urgency');
    assert.equal(await player().getAttribute('data-emotion'),'panicked');assert.equal((await soundStatus()).cue,'');assert.equal((await soundStatus()).plays,0);await shot(`wrong-${id}-390x844`);await tick(remain+80);
    const started=await page.evaluate(()=>window.__kitchenStarts.map(s=>s.id));assert(started.includes(id==='water'?'fx-water':'cloth'));assert(started.includes('flare'));assert(!started.some(id=>characterIds.includes(id)));
    check(id+' retains visible panic and material/flare audio without character cries',await soundStatus());
   }
   const e=Number(await player().getAttribute('data-elapsed'));await tick(Math.max(0,22500-e));await shot('thermometer-mid-danger');
   const n=(await soundStatus()).plays;await page.waitForTimeout(1400);await tick(16000);
   assert.equal(await page.getByRole('meter').getAttribute('data-tone'),'critical');assert.equal((await soundStatus()).plays,n);assert.equal(n,0);await shot('thermometer-critical');
   await tick(12500);assert.equal(await timer(),0);assert.equal(await player().getAttribute('data-phase'),'playing');assert((await heat())>.9);await shot('peak-can-continue');
   check('thermometer rises to critical; 50-second internal pressure peak never locks play',await soundStatus());
  }
  if(width===320&&!quick){const initial=await heat();await tick(15000);assert((await heat())>initial);await shot('thermometer-rising-320x568');check('waiting visibly raises thermometer liquid', {initial,after:await heat()});}
  await complete(width===375||width===430?['lid','gas']:['gas','lid']);await shot(`complete-${width}x${height}`);
  assert.equal(await page.locator('.painted-settlement-reward > .garden-flower').count(),3);
  const scores=await saved();await page.locator('[data-testid="settlement-primary"]').click();await tick(3000);
  assert.equal(await page.locator('[data-map-node="oil-fire"]').getAttribute('data-status'),'complete');
  check(`real tap gas + drag lid/person completion ${width}x${height}`);
  if(width===390){
   await open();assert.equal(await timer(),50);await complete(['lid','gas']);assert.equal(await page.locator('[data-testid="settlement-reward"]').innerText(),'小红花已种下 · 本次为巩固练习');
   // Save timestamps may legitimately change; completed flower records may not.
   const completed=s=>{const a=JSON.parse(s);return a.players.find(p=>p.id===a.activePlayerId).completed;};
   assert.deepEqual(completed(await saved()),completed(scores));check('replay resets full 50 seconds; no duplicate flower reward');
  }
  const starts=await page.evaluate(()=>window.__kitchenStarts),ids=starts.map(s=>s.id);
  assert(!ids.some(id=>characterIds.includes(id)));for(const id of ['music-bed','music-pulse','music-high','fire','draft','pickup','fx-gas','fx-lid','success'])assert(ids.includes(id),'kept audio source '+id);
  check(`native source audit ${width}: music/environment/interactions retained; zero character sources`,{starts});
  await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';
}catch(e){report.failure=e.stack;throw e;}
finally{await browser.close();report.browserClosed=true;fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));}
