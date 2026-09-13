/** Formal four configured levels; actual canvas pointer input, no app-state injection. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,dependency} from './lib/dependencies.mjs';
import {assertGameGeometry,canvasReceivesPoints} from './lib/game-viewport-assertions.mjs';
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const json=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const packs=['flood-kit','clear-corridor','lift-wait','well-call'].filter(id=>!arg('--level',null)||arg('--level',null).split(',').includes(id)).map(id=>({rules:json(`content/levels/${id}/level.json`),skin:json(`content/levels/${id}/skins/paperbook.json`)}));
const output=resolve(root,arg('--output','outputs/display-adaptation/configured-http'));mkdirSync(output,{recursive:true});
const runtime=join(mkdtempSync(join(tmpdir(),'flower-display-')),'runtime.mjs');
await dependency('esbuild').build({absWorkingDir:root,stdin:{contents:"export * from './app/game/runtime/engine';export * from './app/game/runtime/scene';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:runtime,logLevel:'silent'});
const rt=await import(pathToFileURL(runtime));
const file=arg('--html',null),url=file?pathToFileURL(resolve(root,file)).href:arg('--url','http://127.0.0.1:3012/');
const fileHash=()=>file?createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex'):null;
const report={at:new Date().toISOString(),url,htmlSha256:fileHash(),realDeviceTested:false,audio:'muted; no listening claim',method:'Actual browser CSS transform, backing-store compensation, camera datasets; alpha>35 complete required props; every condition-visible zone; manually reviewed face ROIs with foreground-alpha/HUD occlusion probes. Stable states after each committed action, not a continuous-animation proof.',faceRoiSource:'Viewed all four original public/levels/transcript-v1/citizen-*.png (248x648); conservative head/face rectangle x78..194,y10..148.',cases:[]};
// QA-only annotation, not runtime content logic. Unknown citizen variants must not silently skip faces.
const faceRois=Object.fromEntries(['worried','focused','panicked','relieved'].map(m=>[`citizen-${m}`,{x:78/248,y:10/648,w:116/248,h:138/648}]));
const imageCache=new Map();
async function asset(src){if(imageCache.has(src))return imageCache.get(src);const {data,info}=await dependency('sharp')(join(root,'public',src.slice(1))).ensureAlpha().raw().toBuffer({resolveWithObject:true});let x=info.width,y=info.height,right=0,bottom=0,count=0;for(let iy=0;iy<info.height;iy++)for(let ix=0;ix<info.width;ix++)if(data[(iy*info.width+ix)*4+3]>35){x=Math.min(x,ix);y=Math.min(y,iy);right=Math.max(right,ix+1);bottom=Math.max(bottom,iy+1);count++;}assert(count,'Empty required image '+src);const value={data,info,support:{x:x/info.width,y:y/info.height,w:(right-x)/info.width,h:(bottom-y)/info.height}};imageCache.set(src,value);return value;}
function project(pose,p){const pivot=pose.pivot??{x:.5,y:.5},angle=pose.rotation??0,c=Math.cos(angle),s=Math.sin(angle),dx=(p.x-pivot.x)*pose.w,dy=(p.y-pivot.y)*pose.h;return{x:pose.x+pose.w*pivot.x+c*dx-s*dy,y:pose.y+pose.h*pivot.y+s*dx+c*dy};}
function transformed(pose,b){const points=[[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]].map(([x,y])=>project(pose,{x,y})),x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return{x,y,w:Math.max(...points.map(p=>p.x))-x,h:Math.max(...points.map(p=>p.y))-y};}
const overlaps=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.5;
const persist=()=>writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
const sizes=arg('--size',null)?[arg('--size',null).split('x').map(Number)]:args.includes('--single')?[[390,844]]:[[320,568],[375,667],[390,844],[430,932],[1366,900]];
try{for(const pack of packs)for(const [width,height] of sizes){
 const name=`${pack.rules.id}-${width}x${height}`,r={name,passed:false,actions:[],geometry:[],errors:[],externalRequests:[]};report.cases.push(r);
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<600,isMobile:width<600,deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();
 page.on('pageerror',e=>r.errors.push(e.message));const requests=r.externalRequests;page.on('request',req=>{if(/^https?:/.test(req.url())&&!req.url().startsWith(new URL(url).origin))requests.push(req.url());});
 try{
  await page.goto(url);await page.locator('button.map-level').filter({hasText:pack.rules.title}).click();
  const host=page.locator('.configured-player'),canvas=page.locator('[data-game-canvas]');await host.waitFor();await page.waitForFunction(()=>document.querySelector('.configured-player')?.getAttribute('data-ready')==='true');
  const state=()=>host.evaluate(el=>({...el.dataset}));
  const localObstacles=()=>host.evaluate(el=>{const b=el.getBoundingClientRect();return [...el.querySelectorAll('.configured-hud > *')].map(n=>n.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0).map(r=>({x:r.left-b.left,y:r.top-b.top,w:r.width,h:r.height}));});
  const currentCamera=async rect=>rt.cameraFor(pack,rect.width,rect.height,await localObstacles());
  const snap=async suffix=>page.screenshot({path:join(output,`${name}-${suffix}.png`)});
  const images={};for(const [key,a] of Object.entries(pack.skin.assets))images[key]=await asset(a.src);
  const alpha=(key,p)=>{if(p.x<0||p.y<0||p.x>1||p.y>1)return false;const {data,info}=images[key];return data[(Math.min(info.height-1,Math.floor(p.y*info.height))*info.width+Math.min(info.width-1,Math.floor(p.x*info.width)))*4+3]>35;};
  const run=async()=>{const s=await state();return {...rt.createRun(pack),resolved:s.resolved?s.resolved.split(','):[],stages:s.stages?s.stages.split('|'):[],phase:s.phase,reaction:s.emotion??null,reactionMs:1};};
  async function geometry(phase){
   await page.waitForFunction(()=>!!document.querySelector('[data-game-canvas]')?.dataset.cameraScale);
   const shared=await assertGameGeometry(page,{design:pack.skin.world,label:name+' '+phase});
   const b=await host.boundingBox(),c=await canvas.boundingBox(),v=page.viewportSize();
   assert(b&&c);assert(Math.abs(b.y)<1);assert(b.height<=v.height+1);assert(b.width<=520.1);
   if(v.width<=600&&v.height>=v.width){assert(Math.abs(b.width-v.width)<1);assert(Math.abs(b.height-v.height)<1);assert(Math.abs(b.x)<1);}
   else assert(Math.abs(b.x+b.width/2-v.width/2)<1);
   for(const key of ['x','y','width','height'])assert(Math.abs(b[key]-c[key])<1,'canvas fills game surface');
   const overflow=await page.evaluate(()=>({x:document.documentElement.scrollWidth>innerWidth+1,y:document.documentElement.scrollHeight>innerHeight+1}));assert.deepEqual(overflow,{x:false,y:false});
   for(const button of await page.locator('.configured-hud button').all()){const q=await button.boundingBox();assert(q.width>=44&&q.height>=44);assert(q.x>=b.x&&q.x+q.width<=b.x+b.width+.1);}
   const timer=await page.locator('.configured-hud time').boundingBox();assert(timer.x+timer.width<=b.x+b.width);
   const expected=await currentCamera(c),actual=await canvas.evaluate(c=>{const b=c.getBoundingClientRect(),m=c.getContext('2d').getTransform(),x=c.width/b.width,y=c.height/b.height;return {css:{scaleX:m.a/x,scaleY:m.d/y,x:m.e/x,y:m.f/y},dataset:{x:Number(c.dataset.cameraX),y:Number(c.dataset.cameraY),scale:Number(c.dataset.cameraScale),criticalClipped:c.dataset.criticalClipped}};});
   // Canvas matrices expose float32 precision in Edge; 1e-6 still detects the former 0.0003 desktop stretch.
   assert(Math.abs(actual.css.scaleX-actual.css.scaleY)<1e-6,'final CSS isotropy '+JSON.stringify(actual));
   assert(Math.abs(actual.css.scaleX-expected.scale)<1e-6&&Math.abs(actual.css.x-expected.x)<1e-4&&Math.abs(actual.css.y-expected.y)<1e-4,'render/input camera mismatch '+JSON.stringify({actual,expected}));
   for(const k of ['x','y','scale'])assert(Math.abs(actual.dataset[k]-expected[k])<1e-8,'data-camera '+k+' mismatch');
   assert.equal(actual.dataset.criticalClipped,'false','runtime declares clipped critical composition');
   const s=await run(),poses=rt.scenePoses(pack,s,true).filter(p=>(p.opacity??1)>.05),required=new Set([...pack.rules.goals.map(g=>g.object),...pack.rules.interactions.filter(i=>i.outcome==='correct').map(i=>i.source)]),regions=[],warnings=[],failures=[];
   const obstacles=await host.locator('.configured-hud > *').evaluateAll(ns=>ns.map(n=>{const b=n.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height};}).filter(b=>b.w&&b.h));
   // A legitimate pause/result dialog may appear during the final action sample.
   const sceneAcceptsInput=!(await host.locator('[role="dialog"]').count());
   const toScreen=p=>({x:c.x+expected.x+p.x*expected.scale,y:c.y+expected.y+p.y*expected.scale});
   function region(id,kind,world,hard=true){const origin=toScreen(world),screen={...origin,w:world.w*expected.scale,h:world.h*expected.scale},crop={left:Math.max(0,c.x-screen.x),top:Math.max(0,c.y-screen.y),right:Math.max(0,screen.x+screen.w-c.x-c.width),bottom:Math.max(0,screen.y+screen.h-c.y-c.height)},hudOverlap=obstacles.some(o=>overlaps(screen,o)),clipped=Object.values(crop).some(n=>n>.5),entry={id,kind,world,screen,croppedCss:crop,hudOverlap,passed:!clipped&&!hudOverlap};regions.push(entry);if(!entry.passed)(hard?failures:warnings).push(entry);return entry;}
   for(const pose of poses){const obj=pack.rules.objects.find(o=>o.id===pose.id),needed=required.has(pose.id)&&(obj?rt.enabled(obj,s):true),bounds=transformed(pose,images[pose.asset].support);if(needed)region(pose.id,'required-object-alpha',bounds);else if(pose.asset!==pack.skin.background&&!pack.skin.assets[pose.asset].sceneBounds)region(pose.id,'support-object-alpha',bounds,false);
    if(pose.asset.startsWith('citizen-')){const face=faceRois[pose.asset];assert(face,'Missing reviewed face ROI '+pose.asset);const check=region(pose.id+':face','face',transformed(pose,face));const samples=[];for(let y=0;y<=1;y+=.125)for(let x=0;x<=1;x+=.125){const local={x:face.x+face.w*x,y:face.y+face.h*y};if(alpha(pose.asset,local))samples.push(project(pose,local));}assert(samples.length,'Empty face samples');let hidden=0;for(const point of samples)if(poses.some(other=>other.depth>pose.depth&&(other.opacity??1)>.5&&alpha(other.asset,rt.localPoint(other,point))))hidden++;check.foregroundOccludedSamples=hidden;check.faceSamples=samples.length;if(hidden){check.passed=false;failures.push(check);}if(sceneAcceptsInput){const clear=await canvasReceivesPoints(page,samples.map(toScreen));check.canvasReceivedSamples=clear.filter(Boolean).length;if(clear.some(v=>!v)){check.passed=false;failures.push(check);}}
    }
   }
   // Both correct and incorrect drop areas are part of the game; checking a center alone is insufficient.
   for(const [id,zone] of Object.entries(pack.skin.zones))if(!pack.skin.zoneConditions?.[id]||rt.matches(pack,s,pack.skin.zoneConditions[id]))region(id,'whole-target-zone',zone);
   r.geometry.push({phase,surface:b,canvas:c,viewport:v,camera:expected,actualCamera:actual,sharedContract:shared.contract,regions,warnings,failures});
   assert.equal(failures.length,0,'Complete composition gate failed '+JSON.stringify(failures));
  }
  await geometry('playing');await snap('initial');
  async function xy(p){const b=await canvas.boundingBox(),c=await currentCamera(b);return {x:b.x+c.x+p.x*c.scale,y:b.y+c.y+p.y*c.scale};}
  async function sourcePoint(source,edge=false){const s=await run(),pose=rt.scenePoses(pack,s,true).find(p=>p.id===source),candidates=[],b=await canvas.boundingBox(),c=await currentCamera(b),v=page.viewportSize();
   for(let y=.06;y<.98;y+=.075)for(let x=.04;x<.98;x+=.075){const p={x:pose.x+x*pose.w,y:pose.y+y*pose.h};if(rt.pickObject(pack,s,p,alpha,true)!==source)continue;const q={x:b.x+c.x+p.x*c.scale,y:b.y+c.y+p.y*c.scale};if(q.y<72||q.y>v.height-8||q.x<2||q.x>v.width-2)continue;candidates.push({p,score:edge?Math.min(q.x-b.x,b.x+b.width-q.x):Math.hypot(x-.5,y-.5)});}
   assert(candidates.length,'visible source '+source);return candidates.sort((a,b)=>a.score-b.score)[0].p;
  }
  // Resize while dragging then release: must not commit an action under the new camera.
  const draggable=pack.rules.objects.find(o=>o.input==='drag');
  if(draggable&&width<600){const p=await sourcePoint(draggable.id),q=await xy(p),before=(await state()).resolved;await page.mouse.move(q.x,q.y);await page.mouse.down();await page.mouse.move(q.x+14,q.y+9);await page.setViewportSize({width,height:height-64});await page.waitForTimeout(150);await page.mouse.up();assert.equal((await state()).resolved,before);assert.equal((await state()).action,'');await geometry('addressbar-expanded');await snap('addressbar-expanded');await page.setViewportSize({width,height});await page.waitForTimeout(150);await geometry('addressbar-collapsed');}
  for(let index=0;index<12;index++){
   const s=await run();if(s.phase!=='playing')break;
   const rule=pack.rules.interactions.find(i=>i.outcome==='correct'&&rt.findRule(pack,s,{source:i.source,mode:i.mode,target:i.target})?.id===i.id);assert(rule,'correct continuation');
   const p=await sourcePoint(rule.source,index===0),from=await xy(p);
   const actual=await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,from);assert.equal(actual,'CANVAS','source not obscured');
   if(rule.mode==='tap')await page.mouse.click(from.x,from.y);else{const z=pack.skin.zones[rule.target],to=await xy({x:z.x+z.w*.5,y:z.y+z.h*.5});assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,to),'CANVAS','drop not obscured');await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();}
   await page.waitForTimeout(40);assert.equal((await state()).action,rule.id);await page.waitForTimeout(pack.skin.animations[rule.animation].durationMs+180);const after=(await state()).resolved.split(',');assert(rule.grants.every(g=>after.includes(g)));r.actions.push({rule:rule.id,from});await geometry('after-'+rule.id);
  }
  await page.waitForFunction(()=>document.querySelector('.configured-player')?.getAttribute('data-phase')==='complete');await geometry('complete');await snap('complete');
  await page.getByRole('button',{name:'重新开始',exact:true}).click();assert.equal((await state()).resolved,'');await page.getByRole('button',{name:'暂停',exact:true}).click();await geometry('paused');await snap('pause');const time=await page.locator('time').textContent();await page.waitForTimeout(1100);assert.equal(await page.locator('time').textContent(),time);await page.getByRole('button',{name:'继续游戏',exact:true}).click();assert.deepEqual(r.errors,[]);assert.deepEqual(requests,[]);r.passed=true;console.log('PASS '+name);
 }catch(e){r.failure=e.stack;process.exitCode=1;await page.screenshot({path:join(output,`${name}-FAIL.png`)}).catch(()=>{});console.error('FAIL '+name+' '+e.message);}
 finally{await context.close();persist();}
}}finally{await browser.close();report.browserClosed=true;report.htmlSha256AfterTests=fileHash();report.total=report.cases.length;report.passed=report.cases.filter(c=>c.passed).length;report.status=report.passed===report.total&&report.htmlSha256AfterTests===report.htmlSha256?'passed':'failed';report.finishedAt=new Date().toISOString();persist();assert.equal(report.htmlSha256AfterTests,report.htmlSha256,'HTML changed during file acceptance');}
