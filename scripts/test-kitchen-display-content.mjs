/** Kitchen-only visual geometry + real-pointer acceptance. No application-state injection.
 * --html path --output directory [--expected-html-sha256 hash] [--revision candidate|final]
 * Optional --url is for development. Uses a fresh, headless, speaker-muted browser.
 * drawImage is observed without changing arguments/results: measurements include the real
 * ordinary-motion transform, backing-store rounding, recoil and animated item placement.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,dependency} from './lib/dependencies.mjs';
import {assertGameGeometry} from './lib/game-viewport-assertions.mjs';

const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const file=arg('--html',null),url=file?pathToFileURL(resolve(root,file)).href:arg('--url','http://127.0.0.1:3022/');
const output=resolve(root,arg('--output','outputs/display-adaptation/kitchen-content-candidate'));mkdirSync(output,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const conf=JSON.parse(readFileSync(join(root,'content/presets/kitchen/skin.json'),'utf8'));
const htmlSha=file?sha(readFileSync(resolve(root,file))):null;
if(arg('--expected-html-sha256',null))assert.equal(htmlSha,arg('--expected-html-sha256',null),'Expected frozen HTML');
const fnv=value=>{let n=2166136261;for(let i=0;i<value.length;i++)n=Math.imul(n^value.charCodeAt(i),16777619);return value.length+':'+(n>>>0);};
const rasters={},identity={},assetHashes={};
for(const [id,src] of Object.entries(conf.assets)){
 const bytes=readFileSync(join(root,'public',src.slice(1))),ext=src.split('.').at(-1),dataUri=`data:image/${ext==='jpg'?'jpeg':ext};base64,${bytes.toString('base64')}`;
 const {data,info}=await dependency('sharp')(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=info.width,top=info.height,right=0,bottom=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>35){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
 assert(right>left&&bottom>top,'Nonempty original alpha '+id);
 rasters[id]={data,info,support:{x:left/info.width,y:top/info.height,w:(right-left)/info.width,h:(bottom-top)/info.height}};
 identity[src]=id;identity[fnv(dataUri)]=id;assetHashes[id]={src,sha256:sha(bytes),dimensions:[info.width,info.height]};
}
// Conservative whole-head ROIs reviewed from the four ORIGINAL transparent PNGs.
// These intentionally include hair/neck margin, not only the eyes or face center.
const faceROI={worried:{x:.36,y:.025,w:.34,h:.25},panicked:{x:.39,y:.02,w:.37,h:.26},focused:{x:.39,y:0,w:.33,h:.25},relieved:{x:.35,y:.005,w:.32,h:.24}};
const report={at:new Date().toISOString(),revision:arg('--revision','candidate'),url,htmlSha256:htmlSha,viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'no-preference',realDeviceTested:false,audio:'headless --mute-audio; no auditory judgement',
 contract:'Independent original alpha >35 and conservative reviewed head ROI, mapped through observed drawImage matrices. All original props, pan and gas must be present exactly once. HUD/short caption coverage is checked. Decorative fire/smoke can occlude scene by design; their entire alpha is not a target-visibility gate. Sampled natural animation frames are checked, not every rendered frame.',
 observation:'Canvas methods only forward original calls and retain read-only draw geometry. No React state/model/clock injection, no CSS hiding, no reduced motion.',assetHashes,faceROI,status:'running',runs:[],errors:[],externalRequests:[]};
const persist=()=>writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));
const require=createRequire(import.meta.url),{chromium}=require(arg('--playwright','C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({headless:true,executablePath:arg('--browser','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),args:['--mute-audio']});
const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'no-preference'});
await context.addInitScript(({identity})=>{
 const originalDraw=CanvasRenderingContext2D.prototype.drawImage,originalClear=CanvasRenderingContext2D.prototype.clearRect;
 const names=new WeakMap(),snapshots=new WeakMap();
 const signature=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return s.length+':'+(n>>>0);};
 const isScene=c=>c.matches?.('.kitchen-player [data-game-canvas]');
 const matrix=(ctx)=>{const m=ctx.getTransform(),c=ctx.canvas,b=c.getBoundingClientRect(),sx=b.width/c.width,sy=b.height/c.height;return {a:m.a*sx,b:m.b*sy,c:m.c*sx,d:m.d*sy,e:b.x+m.e*sx,f:b.y+m.f*sy};};
 CanvasRenderingContext2D.prototype.clearRect=function(...args){
  if(isScene(this.canvas))snapshots.set(this.canvas,{at:performance.now(),state:{...this.canvas.closest('.kitchen-player').dataset},camera:matrix(this),draws:[]});
  return originalClear.apply(this,args);
 };
 CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
  const result=originalDraw.call(this,image,...args);
  if(isScene(this.canvas)){
   let id=names.get(image);if(id===undefined){const src=image.currentSrc||image.src||'';id=identity[src]||identity[signature(src)]||Object.entries(identity).find(([key])=>key.startsWith('/')&&src.endsWith(key))?.[1]||null;names.set(image,id);}
   if(id){const record=snapshots.get(this.canvas);if(record){const box=args.length===4?{x:args[0],y:args[1],w:args[2],h:args[3]}:null;record.draws.push({id,box,transform:matrix(this),opacity:this.globalAlpha});}}
  }
  return result;
 };
 // This namespace is test-owned telemetry, never an application state reference.
 Object.defineProperty(window,'__kitchenDrawObservation',{value:()=>{const canvas=document.querySelector('.kitchen-player [data-game-canvas]'),record=snapshots.get(canvas);if(!record)return null;const rect=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};};return {...record,canvas:rect(canvas),stateNow:{...canvas.closest('.kitchen-player').dataset},occluders:[...document.querySelectorAll('.kitchen-hud > *, .kitchen-toast')].map(n=>({name:n.className||n.tagName,text:n.textContent,...rect(n)})).filter(n=>n.w>0&&n.h>0)};}});
},{identity});
const page=await context.newPage(),host=page.locator('.kitchen-player'),canvas=page.locator('.kitchen-player [data-game-canvas]');
page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&(file||new URL(r.url()).origin!==new URL(url).origin))report.externalRequests.push(r.url());});
const state=()=>host.evaluate(e=>({...e.dataset}));
const observe=()=>page.evaluate(()=>window.__kitchenDrawObservation());
const center=b=>({x:b.x+b.w/2,y:b.y+b.h/2});
const project=(m,p)=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f});
const mapPoint=(draw,p)=>project(draw.transform,{x:draw.box.x+draw.box.w*p.x,y:draw.box.y+draw.box.h*p.y});
const mapRect=(draw,r)=>{const points=[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}].map(p=>mapPoint(draw,p)),xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys),points};};
const overlap=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.5;
let run;
async function capture(label,{screenshot=false,geometry=false}={}){
 const o=await observe();assert(o?.draws.length,'Actual completed Kitchen paint required');
 const entries=[],failures=[];
 const scale=Math.max(o.canvas.w/conf.framing.sceneBounds.w,o.canvas.h/conf.framing.sceneBounds.h),m=o.camera,bounds=conf.framing.sceneBounds;
 assert(Math.abs(m.a-scale)<1e-6&&Math.abs(m.d-scale)<1e-6&&Math.abs(m.b)<1e-6&&Math.abs(m.c)<1e-6,label+' observed CSS camera is uniform MAX cover');
 assert(m.e+bounds.x*scale<=o.canvas.x+.5&&m.f+bounds.y*scale<=o.canvas.y+.5&&m.e+(bounds.x+bounds.w)*scale>=o.canvas.x+o.canvas.w-.5&&m.f+(bounds.y+bounds.h)*scale>=o.canvas.y+o.canvas.h-.5,label+' painted scene fills every edge');
 for(const draw of o.draws){
  if(!draw.box||draw.id==='room'||draw.id==='flame'||draw.opacity<.05)continue;
  for(const [kind,roi] of [['whole-alpha',rasters[draw.id].support],...(faceROI[draw.id]?[['reviewed-whole-head-roi',faceROI[draw.id]]]:[])]){
   const b=mapRect(draw,roi),c=o.canvas,crop={left:Math.max(0,c.x-b.x),top:Math.max(0,c.y-b.y),right:Math.max(0,b.x+b.w-c.x-c.w),bottom:Math.max(0,b.y+b.h-c.y-c.h)},occluders=o.occluders.filter(x=>overlap(x,b));
   const entry={id:draw.id,kind,screen:b,crop,occluders,passed:Object.values(crop).every(x=>x<=.6)&&!occluders.length};entries.push(entry);if(!entry.passed)failures.push(entry);
  }
 }
 // Full target regions, not just sampled target centers, must remain visible too.
 for(const [id,zone] of Object.entries(conf.layout.zones)){
  const p=project(o.camera,zone),b={x:p.x,y:p.y,w:zone.w*o.camera.a,h:zone.h*o.camera.d},c=o.canvas;
  const crop={left:Math.max(0,c.x-b.x),top:Math.max(0,c.y-b.y),right:Math.max(0,b.x+b.w-c.x-c.w),bottom:Math.max(0,b.y+b.h-c.y-c.h)},occluders=o.occluders.filter(x=>overlap(x,b));
  const entry={id,kind:'whole-target-zone',screen:b,crop,occluders,passed:Object.values(crop).every(x=>x<=.6)&&!occluders.length};entries.push(entry);if(!entry.passed)failures.push(entry);
 }
 const counts=Object.fromEntries(Object.keys(conf.assets).map(id=>[id,o.draws.filter(d=>d.id===id).length]));
 for(const id of ['pan','gas','lid','water','cloth','extinguisher','plate','knife'])assert.equal(counts[id],1,label+' exactly one visible '+id);
 assert.equal(Object.keys(faceROI).reduce((n,k)=>n+counts[k],0),1,label+' exactly one independent character');
 const actualCharacter=o.draws.find(d=>faceROI[d.id]);assert.equal(actualCharacter.id,o.state.emotion,label+' actual art follows observed emotion');
 const entry={label,observed:o,content:entries,contentFailures:failures};run.frames.push(entry);
 if(geometry)entry.geometry=await assertGameGeometry(page,{design:conf.WORLD,label});
 if(screenshot){entry.screenshot=run.id+'-'+label+'.png';await page.screenshot({path:join(output,entry.screenshot)});}
 assert.equal(failures.length,0,label+' content clipping or HUD coverage: '+JSON.stringify(failures));
 return entry;
}
function hasAlpha(id,p){const {data,info}=rasters[id],x=Math.floor(p.x*info.width),y=Math.floor(p.y*info.height);return x>=0&&y>=0&&x<info.width&&y<info.height&&data[(y*info.width+x)*4+3]>35;}
function inverse(draw,p){const m=draw.transform,det=m.a*m.d-m.b*m.c,x=p.x-m.e,y=p.y-m.f;return {x:((m.d*x-m.c*y)/det-draw.box.x)/draw.box.w,y:((-m.b*x+m.a*y)/det-draw.box.y)/draw.box.h};}
async function source(id){
 const o=await observe(),draw=o.draws.find(d=>id==='person'?faceROI[d.id]:d.id===id);assert(draw,'Rendered source '+id);
 const candidates=[];for(let y=.08;y<.97;y+=.045)for(let x=.08;x<.97;x+=.045){const p={x,y};if(!hasAlpha(draw.id,p))continue;const screen=mapPoint(draw,p);if(o.occluders.some(b=>screen.x>=b.x&&screen.y>=b.y&&screen.x<=b.x+b.w&&screen.y<=b.y+b.h))continue;
  const above=o.draws.slice(o.draws.indexOf(draw)+1).filter(d=>d.box&&d.id!=='flame'&&d.id!=='room');if(above.some(d=>hasAlpha(d.id,inverse(d,screen))))continue;
  candidates.push({screen,score:Math.hypot(x-.5,y-.45)});
 }
 assert(candidates.length,'Unoccluded alpha pickup '+id);const point=candidates.sort((a,b)=>a.score-b.score)[0].screen;
 assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,point),'CANVAS','Actual DOM pickup '+id);
 return {point,draw,observation:o};
}
async function drag(id,target,kind){
 const {point,draw,observation}=await source(id),home=id==='person'?conf.layout.person:conf.layout.props[id],worldCenter=center(home),actualCenter=mapPoint(draw,{x:.5,y:.5}),zone=center(conf.layout.zones[target]),destination=project(observation.camera,zone);
 // The production drag offset uses the current unrotated home center, not the clicked alpha.
 // Static props are exact. A person's safe/relieved pose only has tiny natural breathing;
 // choose an interior target with ample tolerance, then verify the real accepted action.
 const homeScreen=project(observation.camera,worldCenter),offset={x:point.x-homeScreen.x,y:point.y-homeScreen.y};
 const to={x:destination.x+offset.x,y:destination.y+offset.y};
 assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,to),'CANVAS','Actual DOM drop '+id);
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:10});await page.mouse.up();
 await page.waitForFunction(k=>document.querySelector('.kitchen-player')?.dataset.action===k,kind,{timeout:1500});
 run.actions.push({item:id,target,kind,pickup:point,drop:to,actualCenter});
 return sampleAction(kind);
}
async function gas(){const {point}=await source('gas');await page.mouse.click(point.x,point.y);await page.waitForFunction(()=>document.querySelector('.kitchen-player')?.dataset.action==='shutoff',{},{timeout:1500});run.actions.push({item:'gas',kind:'shutoff',input:'click',point});return sampleAction('shutoff');}
async function sampleAction(kind){
 const start=Date.now(),entries=[];let middleSaved=false;
 while((await state()).action===kind){const elapsed=Date.now()-start;entries.push(await capture(kind+'-'+String(elapsed).padStart(4,'0'),{screenshot:!middleSaved&&elapsed>=240}));if(elapsed>=240)middleSaved=true;await page.waitForTimeout(75);assert(Date.now()-start<5000,'Natural action completes '+kind);}
 assert(entries.length>=2,'At least two normal-motion observations '+kind);
 const spriteId=kind==='cover'?'lid':kind==='shutoff'?'gas':kind==='evacuate'?'relieved':kind;
 const poses=entries.map(e=>e.observed.draws.find(d=>d.id===spriteId)).filter(Boolean).map(d=>({box:d.box,transform:d.transform}));
 assert(new Set(poses.map(p=>JSON.stringify(p))).size>=2,'Actual sprite geometry must animate '+kind);
 run.animationSamples.push({kind,count:entries.length,observedDurationMs:Date.now()-start,actualGeometryChanged:true,completeFrameCoverage:false});
 await capture('after-'+kind,{screenshot:true});return entries;
}
try{
 await page.goto(url,{waitUntil:'load',timeout:90000});await page.locator('.game-hub').waitFor();
 await page.locator('button.map-level').filter({has:page.locator('.map-copy>strong').filter({hasText:/^厨房着火了$/})}).click();
 await page.waitForFunction(()=>document.querySelector('.kitchen-player')?.dataset.phase==='playing');
 await page.waitForFunction(()=>window.__kitchenDrawObservation()?.draws.some(d=>d.id==='worried'));
 for(const [index,order] of [['mistakes-lid-first',['lid','gas']],['clean-gas-first',['gas','lid']]]){
  run={id:index,frames:[],actions:[],animationSamples:[],passed:false};report.runs.push(run);
  await capture('initial',{screenshot:true,geometry:true});
  const baseline=await observe(),baselineFlame=baseline.draws.find(d=>d.id==='flame');assert(baselineFlame,'Initial actual flame');
  if(index==='mistakes-lid-first')for(const item of ['water','cloth']){
   const frames=await drag(item,'pan',item);assert(frames.some(e=>e.observed.state.emotion==='panicked'),'Wrong action actually changes character to panicked');
   const largest=Math.max(...frames.flatMap(e=>e.observed.draws.filter(d=>d.id==='flame').map(d=>Math.abs(d.box.h*d.transform.d))));
   const original=Math.abs(baselineFlame.box.h*baselineFlame.transform.d);assert(largest>original*1.1,'Wrong action flame visibly larger than baseline');
   const notice=frames.flatMap(e=>e.observed.occluders.filter(d=>d.name==='kitchen-toast').map(d=>d.text));assert(notice.some(t=>item==='water'?t.includes('不能泼水'):t.includes('抹布不能盖严锅口')),'Actual concise wrong explanation shown');
   run.actions.at(-1).fireGrowth={baselineHeight:original,largestHeight:largest,ratio:largest/original};
  }
  for(const id of order){if(id==='gas')await gas();else await drag('lid','pan','cover');}
  assert.equal((await state()).fire,'out','Both actions control fire');
  const safe=await capture('safe-before-evacuation',{screenshot:true,geometry:true});assert.equal(safe.observed.draws.filter(d=>d.id==='flame').length,0,'No actual flame sprite after control');
  await drag('person','exit','evacuate');
  await capture('safe-doorway',{screenshot:true,geometry:true});
  await page.waitForFunction(()=>document.querySelector('.kitchen-player')?.dataset.phase==='complete',{},{timeout:7000});
  await capture('settlement',{screenshot:true,geometry:true});
  assert.equal(await host.locator('.kitchen-result h2').textContent(),'厨房安全了');
  assert.equal(await host.locator('.kitchen-earned').getAttribute('aria-label'),index==='mistakes-lid-first'?'获得 2 朵小红花':'获得 3 朵小红花');
  run.passed=true;persist();
  if(index==='mistakes-lid-first'){await page.getByRole('button',{name:'再玩一次',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.kitchen-player')?.dataset.phase==='playing'&&document.querySelector('.kitchen-player')?.dataset.fire==='burning');await page.waitForTimeout(100);}
 }
 assert.deepEqual(report.errors,[],'No page errors');assert.deepEqual(report.externalRequests,[],'No external requests');report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;process.exitCode=1;await page.screenshot({path:join(output,'FAIL.png')}).catch(()=>{});console.error(error.stack);}
finally{await context.close();await browser.close();report.browserClosed=true;report.finishedAt=new Date().toISOString();report.htmlSha256AfterTests=file?sha(readFileSync(resolve(root,file))):null;if(file&&report.htmlSha256AfterTests!==htmlSha){report.status='failed';report.fileChangedDuringTests=true;process.exitCode=1;}persist();console.log(JSON.stringify({status:report.status,revision:report.revision,htmlSha256:htmlSha,runs:report.runs.map(r=>({id:r.id,passed:r.passed,frames:r.frames.length,actions:r.actions.length})),report:join(output,'report.json')}));}
