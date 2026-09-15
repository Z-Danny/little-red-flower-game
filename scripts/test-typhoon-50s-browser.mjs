/** Isolated real browser/input/audio checks. Hardware output stays muted. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {root,dependency} from './lib/dependencies.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve(root,process.env.TYPHOON_REPORT_DIR??'docs/typhoon-deadline/verification');fs.mkdirSync(out,{recursive:true});
const html=path.resolve(root,process.env.TYPHOON_HTML??'outputs/本地离线版/小红花应急行动.html');
const map=JSON.parse(fs.readFileSync(path.join(root,'content/journey-map.json')));
const skin=JSON.parse(fs.readFileSync(path.join(root,'content/scenes/typhoon-home/skin.json')));
const report={at:new Date().toISOString(),mode:process.argv.includes('--quick')?'input-only':'full-realtime',htmlSha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),status:'running',checks:[],errors:[],network:[],humanListening:'not_run',physicalPhone:'not_run',closed:false};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
async function context(mobile){
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1});
 await ctx.addInitScript(ids=>{
  localStorage.setItem('little-red-flower-leaderboard-v1',JSON.stringify({version:1,activePlayerId:'qa',players:[{id:'qa',name:'测试',region:'',createdAt:1,completed:Object.fromEntries(ids.map(id=>[id,3]))}]}));
  window.__audio=[];window.__analysers=[];window.__buffers=[];
  const Original=window.AudioContext;
  window.AudioContext=class extends Original{
   constructor(...args){super(...args);window.__audio.push(this);}
   createAnalyser(){const n=super.createAnalyser();window.__analysers.push(n);return n;}
   createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n);n.start=(...args)=>{window.__buffers.push({duration:n.buffer?.duration,loop:n.loop,elapsed:document.querySelector('.hunt-player')?.dataset.elapsed});return start(...args);};return n;}
  };
  window.__rms=()=>Math.max(0,...window.__analysers.map(n=>{const a=new Float32Array(n.fftSize);n.getFloatTimeDomainData(a);return Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);}));
 },map.regions.flatMap(r=>r.nodes.map(n=>n.id)));
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url());});
 await page.goto(pathToFileURL(html).href);
      await page.locator('[data-home-start]').click();
 return {ctx,page};
}
async function openLevel(page,id){
 const region=map.regions.find(r=>r.nodes.some(n=>n.id===id));
 await page.locator(`[data-map-region="${region.id}"]`).click();await page.locator(`[data-map-node="${id}"]`).click();
 await page.getByRole('button',{name:'再守护一次',exact:true}).click();await page.locator('.hunt-entry>button').waitFor();
}
const check=(name,details={})=>{report.checks.push({name,status:'passed',...details});console.log(name);};
try{
 const {ctx,page}=await context(true);
 try{
  await openLevel(page,'typhoon-home');
  const bulb=page.getByRole('button',{name:'物件剪影提示',exact:true}),tray=page.locator('.hunt-targets'),bar=page.getByRole('progressbar');
  // The map has its own click sounds. No new level context before the entry gesture.
  const mapContexts=await page.evaluate(()=>window.__audio.length);
  await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.__audio.length),mapContexts);
  assert.equal(await bar.getAttribute('aria-valuenow'),'50');assert.equal(await tray.isVisible(),false);
  for(const [w,h]of[[320,568],[375,667],[390,844],[430,932],[540,960],[390,650],[1440,900]]){
   await page.setViewportSize({width:w,height:h});await page.waitForTimeout(200);
   await bulb.tap();assert.equal(await tray.isVisible(),true);
   const b=await page.locator('.hunt-player').boundingBox(),hint=await bulb.boundingBox(),pause=await page.getByRole('button',{name:'暂停游戏',exact:true}).boundingBox();
   assert.ok(hint.x+hint.width<=pause.x+1);assert.ok(hint.width>=44&&hint.height>=44);
   const boxes=await page.locator('.hunt-hud button,.hunt-targets,.hunt-countdown,.hunt-entry').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().toJSON()));
   for(const r of boxes)assert.ok(r.left>=b.x-1&&r.right<=b.x+b.width+1&&r.top>=b.y-1&&r.bottom<=b.y+b.height+1,'UI outside frame '+w+'x'+h);
   assert.equal(Math.round(b.y),0);if(w<=600){assert.equal(Math.round(b.width),w);assert.equal(Math.round(b.height),h);}else assert.ok(b.width<=520);
   const scales=await page.locator('canvas').evaluate(c=>{const m=c.getContext('2d').getTransform();return[m.a,m.d];});assert.ok(Math.abs(scales[0]-scales[1])<.001);
   await bulb.tap();assert.equal(await tray.isVisible(),false);
   check('Mobile/full-frame disclosure '+w+'x'+h);
  }
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
  await page.screenshot({path:path.join(out,'mobile-ready.png')});
  await page.locator('.hunt-entry>button').tap();
  await page.waitForFunction(()=>document.querySelector('.hunt-player').dataset.phase==='playing');
  await bulb.tap();await page.screenshot({path:path.join(out,'mobile-clues.png')});
  // Touch outside closes the tray and remains a real scene interaction (no proxy state edits).
  await page.touchscreen.tap(210,790);assert.equal(await tray.isVisible(),false);
  if(!process.argv.includes('--quick')) {
  const elapsed=async()=>Number(await page.locator('.hunt-player').getAttribute('data-elapsed'));
  const waitElapsed=ms=>page.waitForFunction(ms=>Number(document.querySelector('.hunt-player').dataset.elapsed)>=ms,ms,{timeout:65000});
  await waitElapsed(8700);
  assert.equal(await page.locator('canvas').getAttribute('data-character-count'),'0');
  assert.equal(await page.locator('canvas').getAttribute('data-character-cue'),'');
  assert.ok(await page.evaluate(()=>window.__rms()>0));check('Storm/music output remains audible with no character startle', {elapsed:await elapsed()});
  const pause=()=>page.getByRole('button',{name:'暂停游戏',exact:true}).tap();
  const resume=()=>page.getByRole('button',{name:'继续游戏',exact:true}).tap();
  await pause();const held=await elapsed();await page.waitForTimeout(900);
  assert.equal(await elapsed(),held);assert.ok(await page.evaluate(()=>window.__rms()<.0001));check('Pause freezes countdown and silences output');
  assert.equal(await page.getByRole('button',{name:/人物反应/}).count(),0);
  assert.equal(await page.getByRole('button',{name:'背景音乐：开',exact:true}).count(),1);
  await resume();
  await waitElapsed(26000);assert.equal(await page.locator('canvas').getAttribute('data-character-count'),'0');
  assert.equal(await page.locator('.hunt-countdown').getAttribute('data-stage'),'warning');
  assert.ok(Number(await bar.getAttribute('aria-valuenow'))<=25);check('25-second amber phase; music enabled, disabled character control hidden');
  await page.screenshot({path:path.join(out,'mobile-25s.png')});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(100);const hiddenAt=await elapsed();await page.waitForTimeout(850);
  assert.equal(await elapsed(),hiddenAt);assert.ok(await page.evaluate(()=>window.__rms()<.0001));
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});check('Background freezes clock and audio');
  await waitElapsed(29000);assert.equal(await page.locator('canvas').getAttribute('data-character-count'),'0');
  await waitElapsed(41000);assert.equal(await page.locator('.hunt-countdown').getAttribute('data-stage'),'danger');
  check('40-second red phase without character screams');await page.screenshot({path:path.join(out,'mobile-40s.png')});
  const savedBefore=await page.evaluate(()=>localStorage.getItem('little-red-flower-leaderboard-v1'));
  await page.waitForFunction(()=>document.querySelector('.hunt-player').dataset.phase==='failed',null,{timeout:16000});
  assert.equal(await bar.getAttribute('aria-valuenow'),'0');
  assert.equal(await elapsed(),50000);
  await page.locator('[data-testid="failure-title"]').waitFor();
  assert.equal(await page.locator('[data-testid="failure-title"]').innerText(),'怎么回事！');
  assert.match(await page.locator('[data-testid="failure-reason"]').innerText(),/还有 5 处隐患未找到/);
  const box=await page.locator('.painted-failure').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=390&&box.y+box.height<=844);
  assert.equal(await page.evaluate(()=>localStorage.getItem('little-red-flower-leaderboard-v1')),savedBefore);
  await page.waitForTimeout(1400);assert.ok(await page.evaluate(()=>window.__rms()<.0001));
  assert.equal(await page.locator('canvas').getAttribute('data-audio-cue'),'timeout');
  assert.equal(await elapsed(),50000);
  await page.screenshot({path:path.join(out,'mobile-failed.png')});
  check('50s terminal failure, no reward, bounded dialog and silence after terminal cue');
  const scale=await page.locator('.hunt-countdown-track>span').evaluate(e=>getComputedStyle(e).transform);assert.ok(scale.startsWith('matrix(0,'));
  const cueCount=Number(await page.locator('canvas').getAttribute('data-character-count'));assert.equal(cueCount,0);
  const shortSamples=await page.evaluate(()=>window.__buffers.filter(b=>!b.loop&&b.duration>=.45&&b.duration<=.85));
  assert.deepEqual(shortSamples,[]);
  check('Full 50 seconds: zero character cues and no scream sample sources started',{cueCount,shortSamples});
  await page.locator('.painted-failure').getByRole('button',{name:'不服，再来！',exact:true}).tap();
  await page.waitForFunction(()=>document.querySelector('.hunt-player').dataset.phase==='playing'&&Number(document.querySelector('.hunt-player').dataset.elapsed)<2000);
  assert.equal(await page.locator('.hunt-player').getAttribute('data-found'),'');
  assert.equal(await tray.isVisible(),false);
  check('One-tap retry resets round, red circles, hidden clues and full timer');
  await pause();await page.getByRole('button',{name:'关闭声音',exact:true}).tap();await resume();await page.waitForTimeout(700);assert.ok(await page.evaluate(()=>window.__rms()<.0001));check('Master mute stops all channels');
  await pause();await page.getByRole('button',{name:'打开声音',exact:true}).tap();await resume();
  }
  const {data}=await dependency('sharp')(path.join(root,'public',skin.mask.slice(1))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(const [id,target]of Object.entries(skin.targets)){
   const b=await page.locator('.hunt-world canvas').boundingBox(),s=Math.max(b.width/skin.width,b.height/skin.height),dx=(b.width-skin.width*s)/2,dy=(b.height-skin.height*s)/2,points=[];
   for(let y=0;y<skin.height;y+=3)for(let x=0;x<skin.width;x+=3){const k=(y*skin.width+x)*4;if(target.color.every((v,i)=>data[k+i]===v)&&data[k+3]>128){const p={x:b.x+dx+x*s,y:b.y+dy+y*s};if(p.x>b.x+8&&p.x<b.x+b.width-8&&p.y>b.y+100&&p.y<b.y+b.height-45)points.push(p);}}
   const hit=await page.evaluate(points=>{const available=points.filter(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS');return available[Math.floor(available.length/2)];},points);assert.ok(hit,id+' visible');
   await page.touchscreen.tap(hit.x,hit.y);
   try{await page.waitForFunction(id=>document.querySelector('.hunt-player').dataset.found.split(',').includes(id),id,{timeout:5000});}
   catch(e){await page.screenshot({path:path.join(out,'failed-hit-'+id+'.png')});report.hitFailure={id,hit,state:await page.locator('.hunt-player').evaluate(e=>({...e.dataset}))};throw e;}
  }
  await page.waitForFunction(()=>document.querySelector('.hunt-player')?.dataset.phase==='complete');
  const completeCount=await page.locator('canvas').getAttribute('data-character-count');await page.waitForTimeout(1400);assert.equal(await page.locator('canvas').getAttribute('data-character-count'),completeCount);
  await page.screenshot({path:path.join(out,'mobile-complete.png')});check('Five timely real pointer hits after retry; reward and no frightened sound on completion');
  await page.locator('[data-testid="settlement-primary"]').click();await page.waitForFunction(n=>window.__audio.slice(n).every(c=>c.state==='closed'),mapContexts);check('Exit disposes native level AudioContext (map channel remains separate)');
  await page.locator('[data-map-node="typhoon-home"]').click();await page.getByRole('button',{name:'再守护一次',exact:true}).click();await page.locator('.hunt-entry>button').waitFor();
  assert.equal(await page.locator('.hunt-player').getAttribute('data-found'),'');assert.equal(await bar.getAttribute('aria-valuenow'),'50');assert.equal(await tray.isVisible(),false);check('Replay resets 50s and hidden clues');
 } finally{await ctx.close();}
 const desktop=await context(false);
 try{
  await openLevel(desktop.page,'typhoon-home');const p=desktop.page,bulb=p.getByRole('button',{name:'物件剪影提示',exact:true}),tray=p.locator('.hunt-targets');
  await bulb.hover();assert.equal(await tray.isVisible(),true);await p.mouse.move(10,400);await p.waitForTimeout(350);assert.equal(await tray.isVisible(),false);
  await bulb.click();await p.mouse.move(10,400);await p.waitForTimeout(350);assert.equal(await tray.isVisible(),true);await bulb.click();assert.equal(await tray.isVisible(),false);
  await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');assert.equal(await tray.isVisible(),true);await p.keyboard.press('Escape');assert.equal(await tray.isVisible(),false);
  check('Mouse hover/leave, click pin/toggle, keyboard focus/Escape');await p.screenshot({path:path.join(out,'desktop-hidden.png')});
 }finally{await desktop.ctx.close();}
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';
}catch(e){report.status='failed';report.error=String(e.stack??e);process.exitCode=1;console.error(e);}
finally{await browser.close();report.closed=true;fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2));}
