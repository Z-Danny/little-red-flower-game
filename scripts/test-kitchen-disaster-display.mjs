/** Actual GameApp acceptance. Real pointers only; isolated profile, muted speakers, no app-state injection.
 * --url http://127.0.0.1:3022/ OR --html outputs/...html ; --level kitchen,flood ; --size 360x900
 * The oracle imports the same pure camera and alpha picker as production. It never writes browser game state.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, dependency } from './lib/dependencies.mjs';
const args = process.argv.slice(2), arg = (k,d) => args.includes(k) ? args[args.indexOf(k)+1] : d;
const json = p => JSON.parse(readFileSync(join(root,p),'utf8'));
const require = createRequire(import.meta.url), { chromium } = require(arg('--playwright','C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const output = resolve(root,arg('--output','outputs/display-adaptation/kitchen-disaster-http')); mkdirSync(output,{recursive:true});
const runtime = join(mkdtempSync(join(tmpdir(),'flower-legacy-display-')),'runtime.mjs');
await dependency('esbuild').build({absWorkingDir:root,stdin:{contents:[
  "export * as kitchenConfig from './app/game/kitchen/config';",
  "export * as kitchenModel from './app/game/kitchen/model';",
  "export * as kitchenScene from './app/game/kitchen/animation';",
  "export * as kitchenInput from './app/game/kitchen/interaction';",
  "export * as kitchenCamera from './app/game/kitchen/camera';",
  "export * as disasterScene from './app/game/disaster/scene';",
].join('\n'),resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:runtime,logLevel:'silent'});
const rt = await import(pathToFileURL(runtime));
const file = arg('--html',null), url = file ? pathToFileURL(resolve(root,file)).href : arg('--url','http://127.0.0.1:3022/');
const cases = [
  {id:'kitchen',title:'厨房着火了',selector:'.kitchen-player',skin:json('content/presets/kitchen/skin.json')},
  ...['street','flood'].map(id=>{const level=id==='street'?'rain-street-preparation-v1':'flood-house-response-v1';return {id,level,selector:'.disaster-player',skin:json(`content/disaster/${level}/skin.json`),rules:json(`content/disaster/${level}/rules.json`),samples:json(`public/levels/rain-flood-v1/${id}/hit-samples.json`)};})
].filter(c=>!arg('--level',null)||arg('--level',null).split(',').includes(c.id));
for(const c of cases)if(!c.title)c.title=c.rules.title;
assert(cases.length,'No matching --level');
const size = arg('--size',null), sizes = size ? [size.split('x').map(Number)] : [[320,568],[375,667],[390,844],[430,932],[1366,900]];
assert(sizes.every(s=>s.length===2&&s.every(n=>Number.isFinite(n)&&n>0)),'Invalid --size');
const report={at:new Date().toISOString(),url,htmlSha256:file?createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex'):null,realDeviceTested:false,audio:'muted speakers; no auditory review',contentContract:'Whole sprite alpha>35, every target zone even without framing, reviewed flood face ROI, actual HUD overlap and final CSS camera. Stable post-action states; not a continuous-animation proof.',status:'running',browserClosed:false,cases:[]};
const persist=()=>writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));
const browser=await chromium.launch({headless:true,executablePath:arg('--browser','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),args:['--mute-audio']});
const middle=b=>({x:b.x+b.w/2,y:b.y+b.h/2});
const supports=new Map();
async function alphaSupport(src){if(supports.has(src))return supports.get(src);const {data,info}=await dependency('sharp')(join(root,'public',src.slice(1))).ensureAlpha().raw().toBuffer({resolveWithObject:true});let x=info.width,y=info.height,right=0,bottom=0;for(let iy=0;iy<info.height;iy++)for(let ix=0;ix<info.width;ix++)if(data[(iy*info.width+ix)*4+3]>35){x=Math.min(x,ix);y=Math.min(y,iy);right=Math.max(right,ix+1);bottom=Math.max(bottom,iy+1);}const support={x:x/info.width,y:y/info.height,w:(right-x)/info.width,h:(bottom-y)/info.height};assert(support.w>0&&support.h>0,'empty sprite '+src);supports.set(src,support);return support;}
const mapBox=(box,n)=>({x:box.x+n.x*box.w,y:box.y+n.y*box.h,w:n.w*box.w,h:n.h*box.h});
try { for(const card of cases) for(const [width,height] of sizes) {
  const name=`${card.id}-${width}x${height}`, r={name,passed:false,geometry:[],actions:[],errors:[]};report.cases.push(r);
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<600,isMobile:width<600,deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',e=>r.errors.push(e.message));const external=[];r.externalRequests=external;
  page.on('request',req=>{if(/^https?:/.test(req.url())&&!req.url().startsWith(new URL(url).origin))external.push(req.url());});
  const host=page.locator(card.selector),canvas=page.locator('[data-game-canvas]');
  const state=()=>host.evaluate(el=>({...el.dataset}));
  const snap=suffix=>page.screenshot({path:join(output,`${name}-${suffix}.png`)});
  const camera=(b,obstacles=[])=>card.id==='kitchen'?rt.kitchenCamera.cameraFor(b.width,b.height):rt.disasterScene.disasterCamera(b.width,b.height,card.skin.width,card.skin.height,card.skin.framing,obstacles);
  const obstacles=()=>card.id==='kitchen'?[]:host.evaluate(el=>{const b=el.getBoundingClientRect();return [...el.querySelectorAll('.disaster-hud > button, .disaster-hud > h1, .disaster-hud > time, .disaster-clues > span')].map(n=>n.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0).map(r=>({x:r.x-b.x,y:r.y-b.y,w:r.width,h:r.height}));});
  async function xy(p){const b=await canvas.boundingBox(),c=camera(b,await obstacles());return {x:b.x+c.x+p.x*c.scale,y:b.y+c.y+p.y*c.scale};}
  async function exposed(p,label){const q=await xy(p);assert.equal(await page.evaluate(q=>document.elementFromPoint(q.x,q.y)?.tagName,q),'CANVAS',label+' must be visible and not covered by HUD');return q;}
  async function tap(p,label){const q=await exposed(p,label);await page.mouse.click(q.x,q.y);r.actions.push({tap:label,screen:q});}
  async function drag(from,to,label,offset={x:0,y:0}){const a=await exposed(from,label+' source'),b=await exposed({x:to.x+offset.x,y:to.y+offset.y},label+' destination');await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();r.actions.push({drag:label,from:a,to:b});}
  async function geometry(phase){
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const b=await host.boundingBox(),c=await canvas.boundingBox(),v=page.viewportSize();assert(b&&c);assert(Math.abs(b.y)<1,'top aligned');
    if(v.width<=600&&v.height>=v.width){assert(Math.abs(b.width-v.width)<1);assert(Math.abs(b.height-v.height)<1);assert(Math.abs(b.x)<1);}
    else{assert(b.width<=520.1);assert(b.height<=v.height+.1);assert(Math.abs(b.x+b.width/2-v.width/2)<1);}
    for(const k of ['x','y','width','height'])assert(Math.abs(b[k]-c[k])<1,'Canvas fills viewport '+k);
    const overflow=await page.evaluate(()=>({x:document.documentElement.scrollWidth>innerWidth+1,y:document.documentElement.scrollHeight>innerHeight+1}));assert.deepEqual(overflow,{x:false,y:false},'no body overflow');
    for(const button of await host.locator('header button').all()){const q=await button.boundingBox();assert(q.width>=44&&q.height>=44,'44 CSS px HUD button');assert(q.x>=b.x-.1&&q.y>=b.y-.1&&q.x+q.width<=b.x+b.width+.1&&q.y+q.height<=b.y+b.height+.1,'HUD inside surface');}
    const cam=camera(c,await obstacles()),bounds=card.skin.framing?.sceneBounds??{x:0,y:0,w:card.skin.WORLD?.width??card.skin.width,h:card.skin.WORLD?.height??card.skin.height};
    assert(Math.abs(cam.scale-Math.max(c.width/bounds.w,c.height/bounds.h))<1e-8,'MAX cover scale without safe zoom-out');
    assert(cam.x+bounds.x*cam.scale<=.1&&cam.y+bounds.y*cam.scale<=.1&&cam.x+(bounds.x+bounds.w)*cam.scale>=c.width-.1&&cam.y+(bounds.y+bounds.h)*cam.scale>=c.height-.1,'scene covers every edge');
    if(card.skin.framing?.critical)assert.equal(cam.clippedCritical,false,'critical composition fits');
    const cssTransform=await canvas.evaluate(c=>{const b=c.getBoundingClientRect(),m=c.getContext('2d').getTransform(),x=c.width/b.width,y=c.height/b.height;return {xScale:m.a/x,yScale:m.d/y,x:m.e/x,y:m.f/y};});
    // Canvas implementations may expose float32 transform precision (e.g. .6 -> .6000000238).
    // This tolerance is far below the 0.0003 scale error caused by uncompensated bitmap rounding.
    assert(Math.abs(cssTransform.xScale-cssTransform.yScale)<1e-6,'final CSS space must be uniformly scaled after backing rounding '+JSON.stringify(cssTransform));
    assert(Math.abs(cssTransform.xScale-cam.scale)<1e-6&&Math.abs(cssTransform.x-cam.x)<1e-4&&Math.abs(cssTransform.y-cam.y)<1e-4,'render and input share final CSS-space camera '+JSON.stringify({cssTransform,cam}));
    const content=[],failures=[];
    if(card.id!=='kitchen'){
      const obstaclesNow=await obstacles(),snapshot=await state(),run={goals:(snapshot.goals??'').split(',').filter(Boolean),phase:snapshot.phase,pending:null};
      const check=(id,kind,world)=>{const screen={x:cam.x+world.x*cam.scale,y:cam.y+world.y*cam.scale,w:world.w*cam.scale,h:world.h*cam.scale},crop={left:Math.max(0,-screen.x),top:Math.max(0,-screen.y),right:Math.max(0,screen.x+screen.w-c.width),bottom:Math.max(0,screen.y+screen.h-c.height)},hud=obstaclesNow.some(o=>Math.min(screen.x+screen.w,o.x+o.w)-Math.max(screen.x,o.x)>.5&&Math.min(screen.y+screen.h,o.y+o.h)-Math.max(screen.y,o.y)>.5),entry={id,kind,world,screen,crop,hud,passed:!hud&&Object.values(crop).every(n=>n<=.5)};content.push(entry);if(!entry.passed)failures.push(entry);};
      for(const [id,a] of Object.entries(card.skin.sprites)){const pose=rt.disasterScene.objectPose({rules:card.rules,skin:card.skin},run,id);if(pose.alpha>.05){check(id,'whole-sprite-alpha',mapBox(pose.box,await alphaSupport(a.src)));if(id==='person'&&card.id==='flood')check('person:face','reviewed-face-roi',mapBox(pose.box,{x:20/160,y:0,w:115/160,h:116/555}));}}
      // Unconditional even when a skin lacks framing; absence of metadata must never skip content acceptance.
      for(const [id,zone] of Object.entries(card.skin.zones))check(id,'whole-target-zone',zone.box);
    }
    r.geometry.push({phase,surface:b,canvas:c,viewport:v,camera:cam,cssTransform,content,contentFailures:failures});
    assert.equal(failures.length,0,'Complete content gate failed '+JSON.stringify(failures));
  }
  async function pause(){await page.getByRole('button',{name:'暂停游戏',exact:true}).click();await page.waitForTimeout(120);const before=card.id==='kitchen'?await host.locator('.kitchen-clock').textContent():(await state()).elapsed;await geometry('paused');await snap('pause');await page.waitForTimeout(1100);assert.equal(card.id==='kitchen'?await host.locator('.kitchen-clock').textContent():(await state()).elapsed,before,'paused clock frozen');await page.getByRole('button',{name:'继续游戏',exact:true}).click();}
  async function resizeCancel(from){
    const a=await exposed(from,'resize source'),before=await state();await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+12,a.y+9,{steps:3});
    await page.setViewportSize({width,height:height-64});await page.waitForTimeout(160);assert.equal(await canvas.evaluate(c=>c.hasPointerCapture(1)),false,'resize releases pointer capture');await page.mouse.up();
    const after=await state();assert.equal(after.action??after.pending,'','resize does not commit action');assert.equal(after.goals,before.goals);await geometry('addressbar-expanded');await snap('addressbar-expanded');
    await page.setViewportSize({width,height});await page.waitForTimeout(160);await geometry('addressbar-collapsed');
  }
  async function goal(id){await page.waitForFunction(({selector,id})=>document.querySelector(selector)?.getAttribute('data-goals')?.split(',').includes(id),{selector:card.selector,id},{timeout:8000});}
  try {
    await page.goto(url,{waitUntil:'load',timeout:90000});await page.locator('.game-hub').waitFor();
    const exact=new RegExp('^'+card.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');
    await page.locator('button.map-level').filter({has:page.locator('.map-copy>strong').filter({hasText:exact})}).click();await host.waitFor();
    if(card.id==='kitchen')await page.waitForFunction(()=>document.querySelector('.kitchen-player')?.getAttribute('data-phase')==='playing');
    else{await page.locator('.disaster-entry button').waitFor();await geometry('ready');const before=(await state()).elapsed;await page.waitForTimeout(150);assert.equal((await state()).elapsed,before,'ready clock frozen');await page.locator('.disaster-entry button').click();}
    // React can expose ready before its first post-resize paint. Require actual scene pixels,
    // not merely a playing dataset, before taking the visual-acceptance screenshot.
    await page.waitForFunction(()=>{const c=document.querySelector('[data-game-canvas]'),ctx=c?.getContext('2d');if(!ctx||!c.width||!c.height)return false;const samples=[];for(let y=2;y<8;y++)for(let x=1;x<9;x++){const p=ctx.getImageData(Math.floor(c.width*x/10),Math.floor(c.height*y/10),1,1).data;samples.push(p[0]+p[1]+p[2]);}return Math.max(...samples)-Math.min(...samples)>90;});
    await page.waitForTimeout(80);await geometry('playing');await snap('initial');await pause();
    if(card.id==='kitchen'){
      const conf=rt.kitchenConfig, model=rt.kitchenModel, local=model.createRun();local.phase='playing';const rasters={};
      for(const [id,src] of Object.entries(conf.assets))rasters[id]=await dependency('sharp')(join(root,'public',src.slice(1))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const alpha=(id,b,p)=>{const {data,info}=rasters[id],x=Math.min(info.width-1,Math.floor((p.x-b.x)/b.w*info.width)),y=Math.min(info.height-1,Math.floor((p.y-b.y)/b.h*info.height));return x>=0&&y>=0&&data[(y*info.width+x)*4+3]>35;};
      async function source(id,edge=false){local.reaction=(await state()).emotion;const b=id==='person'?rt.kitchenScene.personPose(local,true).box:id==='gas'?conf.layout.gas:conf.layout.props[id],cs=await canvas.boundingBox(),cam=camera(cs),points=[];
        for(let y=.04;y<.98;y+=.06)for(let x=.04;x<.98;x+=.06){const p={x:b.x+b.w*x,y:b.y+b.h*y};if(rt.kitchenInput.pickSceneItem(p,local,alpha,true)!==id)continue;const q={x:cs.x+cam.x+p.x*cam.scale,y:cs.y+cam.y+p.y*cam.scale};if(q.x<cs.x+2||q.x>cs.x+cs.width-2||q.y<cs.y+78||q.y>cs.y+cs.height-2)continue;points.push({p,score:edge?Math.min(q.x-cs.x,cs.x+cs.width-q.x):Math.hypot(x-.5,y-.5)});}
        assert(points.length,'visible alpha source '+id);return points.sort((a,b)=>a.score-b.score)[0].p;
      }
      if(width<600)await resizeCancel(await source('lid'));
      // Near-edge dispenser remains pickable; cancelling selection does not discharge it.
      await tap(await source('extinguisher',true),'extinguisher edge');await page.getByRole('button',{name:'取消选择',exact:true}).click();
      await tap(await source('gas'),'gas');await page.waitForFunction(()=>document.querySelector('.kitchen-player')?.getAttribute('data-action')==='shutoff');await page.waitForTimeout(conf.timing.gas+170);local.gasOff=true;assert.equal((await state()).action,'');
      for(const [id,target,kind,flag] of [['lid','pan','cover','covered'],['person','exit','evacuate','evacuated']]){
        const from=await source(id,id==='lid'),b=id==='person'?rt.kitchenScene.personPose(local,true).box:conf.layout.props[id],center=middle(b);
        await drag(from,middle(conf.layout.zones[target]),id,{x:from.x-center.x,y:from.y-center.y});await page.waitForFunction(kind=>document.querySelector('.kitchen-player')?.getAttribute('data-action')===kind,kind);await page.waitForTimeout(conf.timing[id]+190);local[flag]=true;
      }
    }else if(card.id==='street'){
      for(const [id,p] of Object.entries(card.samples)){await tap(p,id);await goal(id);await geometry('after-'+id);}
    }else{
      const s=card.skin,f=card.samples;if(width<600)await resizeCancel(f.chair);
      for(const [from,to,id,input] of [[f.person,{x:591,y:510},'stairs','drop'],[f.breaker,f.breaker,'power','tap'],[f.phone,middle(s.poses.personStairs),'rescue','drop'],[f.water,middle(s.sprites.bag.box),'drinking','drop'],[f.flashlight,middle(s.sprites.bag.box),'lighting','drop'],[f.foam,middle(s.sprites.panel.box),'aid','drop'],[middle(s.poses.personStairs),middle(s.zones.roof.box),'roof','drop']]){if(input==='tap')await tap(from,id);else await drag(from,to,id);await goal(id);await geometry('after-'+id);}
    }
    await page.waitForFunction(selector=>document.querySelector(selector)?.getAttribute('data-phase')==='complete',card.selector,{timeout:12000});await geometry('complete');await snap('complete');assert.deepEqual(r.errors,[]);assert.deepEqual(external,[]);
    // Replay is a genuine UI reset, not a synthetic model reset.
    await page.getByRole('button',{name:card.id==='kitchen'?'再玩一次':'重新开始',exact:true}).click();await page.waitForTimeout(150);assert.equal((await state()).goals??'','');await geometry('replay');r.passed=true;console.log('PASS '+name);
  }catch(e){r.failure=e.stack;process.exitCode=1;await snap('FAIL').catch(()=>{});console.error('FAIL '+name+' '+e.message);}
  finally{await context.close();persist();}
} }finally{await browser.close();report.browserClosed=true;report.finishedAt=new Date().toISOString();report.total=report.cases.length;report.passed=report.cases.filter(c=>c.passed).length;report.htmlSha256AfterTests=file?createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex'):null;report.status=report.passed===report.total?'passed':'failed';if(file&&report.htmlSha256AfterTests!==report.htmlSha256){report.status='failed';report.fileChangedDuringTests=true;process.exitCode=1;}persist();}
