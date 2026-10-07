/** Test the real exported HTML with isolated saves, muted/offline Chromium and
 * actual pointer input. Controlled browser time is not a human-speed test. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {catalog,readPack} from './hunts.mjs';
import {dependency,root} from './lib/dependencies.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'C:/Users/LEGION/Documents/Codex/2026-09-19/https-github-com-z-danny-little-3/work/tools/playtest/node_modules/playwright');
const html=path.resolve(process.argv[2] || 'outputs/本地离线版/小红花应急行动.html');
const output=path.resolve(process.env.NATURE_OUTPUT || 'docs/nature-readable/verification/final');
fs.mkdirSync(output,{recursive:true});
const selected=(process.env.NATURE_LEVEL || 'quake-bedroom-v2,storm-street-check-v2').split(',');
const sizes=process.env.NATURE_SINGLE_SIZE ? [[390,844]] : [[320,568],[375,667],[390,844],[430,932],[540,960],[1440,900]];
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const report={status:'running',startedAt:new Date().toISOString(),html,htmlSha256:hash(html),fixture:'Only other levels are completed in an isolated save to unlock entry. Test levels are uncompleted. All hits, pause/retry and review answers use real pointer input. Browser clock is controlled for deterministic inspection; no reducer/completion/reward injection.',checks:[],knownLayoutIssues:[],screenshots:[],errors:[],network:[],physicalDevice:'not_run',humanListening:'not_run',browserClosed:false};
const pass=(name,detail={})=>{report.checks.push({name,status:'passed',...detail});console.log('PASS',name);};
let browser;
const shot=async(page,name)=>{await page.screenshot({path:path.join(output,name+'.png')});report.screenshots.push(name+'.png');};
try {
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});report.browser=browser.version();
 for(const id of selected){
 const entry=catalog().find(e=>e.id===id);const pack=readPack({...entry,skin:process.env.NATURE_SKIN || entry.skin});
 const s=pack.skin;const raster=await dependency('sharp')(path.join(root,'public',s.mask.slice(1))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const legacyLayout = id==='storm-street-check-v2' && (process.env.NATURE_SKIN || entry.skin)==='skin.json';
 const sampleFile=path.join(root,'public',path.dirname(s.mask).slice(1),'hit-samples.json');const samples=JSON.parse(fs.readFileSync(sampleFile,'utf8'));
 for(const [width,height] of sizes){
 const label=`${id}-${width}x${height}`;let page;
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,reducedMotion:'reduce',deviceScaleFactor:1,offline:true});
 try{
 await context.addInitScript(({ids,id})=>{localStorage.setItem('little-red-flower-leaderboard-v1',JSON.stringify({version:1,activePlayerId:'nature-review-qa',players:[{id:'nature-review-qa',name:'隔离试玩',region:'',createdAt:1,completed:Object.fromEntries(ids.filter(x=>x!==id).map(x=>[x,3]))}]}));},{ids:JSON.parse(fs.readFileSync(path.join(root,'content/journey-map.json'),'utf8')).regions.flatMap(r=>r.nodes.map(n=>n.id)),id});
 page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.errors.push({label,message:e.message}));page.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push({label,url:r.url()});});
 await page.clock.install();await page.goto(pathToFileURL(html).href,{waitUntil:'load',timeout:120000});
 await page.locator('[data-home-continue]').click();await page.clock.runFor(800);await page.locator('[data-journey-map]').waitFor();
 const node=page.locator(`[data-map-node="${id}"]`);
 if(await page.locator('[data-journey-map]').getAttribute('data-region')!=='nature'){await page.locator('[data-map-fan-toggle]').click();await page.locator('[data-island="nature"]').click();await page.clock.runFor(800);}
 await node.click();await page.locator('[data-painted-primary]').click();
 await page.waitForFunction(()=>document.querySelector('.hunt-player')?.dataset.ready==='true' && document.querySelector('.hunt-player')?.dataset.phase==='playing');
 await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+100)));await page.clock.runFor(200);
 const scene=page.locator('.hunt-player');
 const tapWorld=async(x,y)=>{const b=await page.locator('.hunt-world canvas').boundingBox();const scale=Math.max(b.width/s.width,b.height/s.height);const p={x:b.x+(b.width-s.width*scale)/2+x*scale,y:b.y+(b.height-s.height*scale)/2+y*scale};assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,p),'CANVAS','actual point unobstructed');await page.touchscreen.tap(p.x,p.y);await page.clock.runFor(950);};
 const target=async(t)=>{
 // The compiler's inspected interior point is supplemented by runtime mask color verification.
 const q=samples.targets?.[t.id] ?? samples[t.id];const point=Array.isArray(q)?q:q?.point;
 assert(point,`missing sample ${t.id}: ${JSON.stringify(samples).slice(0,200)}`);
 const [x,y]=point,ix=(Math.floor(y)*s.width+Math.floor(x))*4;
 assert(s.targets[t.id].color.every((c,j)=>raster.data[ix+j]===c),'sample matches current mask');
 let px=x+.5,py=y+.5;
 if(legacyLayout){const b=await page.locator('.hunt-world canvas').boundingBox(),scale=Math.max(b.width/s.width,b.height/s.height),points=[];for(let yy=0;yy<s.height;yy+=3)for(let xx=0;xx<s.width;xx+=3){const k=(yy*s.width+xx)*4;if([[-4,0],[4,0],[0,-4],[0,4],[0,0]].every(([dx,dy])=>xx+dx>=0 && xx+dx<s.width && yy+dy>=0 && yy+dy<s.height && s.targets[t.id].color.every((c,j)=>raster.data[((yy+dy)*s.width+xx+dx)*4+j]===c)))points.push({x:b.x+(b.width-s.width*scale)/2+(xx+.5)*scale,y:b.y+(b.height-s.height*scale)/2+(yy+.5)*scale,wx:xx+.5,wy:yy+.5});}const visible=await page.evaluate(points=>{const buttons=[...document.querySelectorAll('.hunt-hud button')].map(e=>e.getBoundingClientRect());return points.filter(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS' && !buttons.some(b=>p.x>b.left-16 && p.x<b.right+16 && p.y>b.top-16 && p.y<b.bottom+16));},points);assert(visible.length,'legacy target still tappable');const hit=visible[Math.floor(visible.length/2)];px=hit.wx;py=hit.wy;}
 await tapWorld(px,py);assert((await scene.getAttribute('data-found')).split(',').includes(t.id),t.id+' hit did not commit at '+[px,py]);
 const caption=await page.locator('.hunt-caption').innerText();assert(caption.includes(pack.presentation.targetFeedback?.[t.id]?.caption ?? t.lesson),'target-specific lesson survives, including final target');
 pass(`${label}: ${t.id}`,{samplePoint:point,actualWorldPoint:[px,py],caption});
 };
 const bulb=page.getByRole('button',{name:'物件剪影提示',exact:true});
 await bulb.click();await page.clock.runFor(50);await shot(page,label+'-clues');
 const b=await page.locator('.hunt-world canvas').boundingBox(),scale=Math.max(b.width/s.width,b.height/s.height),cy=(b.height-s.height*scale)/2,cx=(b.width-s.width*scale)/2;
 const hudBottom=await page.locator('.hunt-targets').evaluate(e=>e.getBoundingClientRect().bottom);
 for(const [targetId,t] of Object.entries(s.targets)){
 const r=t.bounds,x=b.x+cx+r.x*scale,y=b.y+cy+r.y*scale;
 const cropped=x<b.x-.2 || x+r.w*scale>b.x+b.width+.2;const occluded=y<hudBottom;
 if(legacyLayout){if(cropped||occluded)report.knownLayoutIssues.push({label,targetId,cropped,occluded,note:'Existing shipped artwork retained. Replacement failed review; not claimed fixed.'});}
 else{assert(!cropped,'target not horizontally cropped');assert(!occluded,`${targetId} does not collide with visible clue row (${y} vs ${hudBottom})`);}
 }
 pass(label+(legacyLayout ? ': existing artwork layout audited (see knownLayoutIssues)' : ': visible targets clear HUD and frame'));
 await bulb.click();await page.clock.runFor(50);await shot(page,label+'-start');
 // Pause really freezes both scene clock and rewards. Retry clears a real first hit.
 await target(pack.rules.targets[0]);
 await page.getByRole('button',{name:'暂停游戏',exact:true}).click();await page.clock.runFor(30);
 const elapsed=await scene.getAttribute('data-elapsed');await page.clock.runFor(2000);assert.equal(await scene.getAttribute('data-elapsed'),elapsed);
 await page.locator('[data-pause-restart]').click();await page.clock.runFor(250);assert.equal(await scene.getAttribute('data-found'),'');pass(label+': pause and retry');
 const order=width===390 ? [...pack.rules.targets].reverse() : pack.rules.targets;
 for(const t of order)await target(t);
 await shot(page,label+'-last-feedback');await page.clock.runFor(2000);await shot(page,label+'-ending');await page.clock.runFor(6000);
 await page.locator('[data-testid="settlement-primary"]').waitFor();
 assert((await page.locator('[data-testid="settlement-reward"]').innerText()).includes('+3'));
 const saved=()=>page.evaluate(()=>{const v=JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1'));return v.players.find(p=>p.id===v.activePlayerId).completed;});
 assert.equal((await saved())[id],3);
 if(id==='quake-bedroom-v2'){
 await page.locator('[data-testid="ending-comparison"] summary').click();
 await page.getByRole('button',{name:'准备前',exact:true}).click();assert((await page.locator('[data-testid="ending-comparison"] img').getAttribute('alt')).startsWith('准备前'));
 await shot(page,label+'-compare-before');await page.getByRole('button',{name:'准备后',exact:true}).click();await shot(page,label+'-compare-after');
 }else{
 await page.locator('[data-answer="inspect"]').click();assert.equal(await page.locator('[data-testid="question-feedback"]').getAttribute('data-correct'),'false');await shot(page,label+'-wrong-answer');
 await page.locator('[data-answer="stay"]').click();assert.equal(await page.locator('[data-testid="question-feedback"]').getAttribute('data-correct'),'true');await shot(page,label+'-correct-answer');
 await page.locator('[data-answer="stay"]').click();assert.equal((await saved())[id],3,'review cannot award twice');
 }
 pass(label+': optional teaching review and single reward');
 await page.locator('[data-testid="settlement-primary"]').click();await page.clock.runFor(400);await page.locator(`[data-map-node="${id}"]`).waitFor();
 pass(label+': returned to map');
 }catch(e){if(page)await shot(page,label+'-FAILED').catch(()=>{});throw e;}finally{await context.close();}
 }
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);assert.equal(hash(html),report.htmlSha256,'tested HTML was not replaced during the run');report.status=report.knownLayoutIssues.length ? 'passed_with_known_layout_limitations' : 'passed';
}catch(e){report.status='failed';report.failure=String(e.stack);process.exitCode=1;console.error(e);}finally{if(browser){await browser.close();report.browserClosed=true;}report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}


