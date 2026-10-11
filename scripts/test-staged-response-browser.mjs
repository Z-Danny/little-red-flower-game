import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{createRequire}from'node:module';import{pathToFileURL}from'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'outputs/first-aid-comprehensive-preview/verification-v3');fs.mkdirSync(dir,{recursive:true});
const html=path.join(root,'outputs/first-aid-comprehensive-preview/4-9综合急救挑战.html');
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''));const rules=json('content/staged-response/first-aid-comprehensive/rules.json'),skin=json('content/staged-response/first-aid-comprehensive/skin.json');
const report={status:'running',sha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),checks:[],errors:[],network:[],browser:'',closed:false,realDevice:'not_run',humanAudio:'not_run',medicalReview:'not_run',artGeneration:'unavailable-503; existing-Chinese-master-used'};
let browser,context,page;const pass=x=>{report.checks.push(x);console.log('PASS '+x)};
const action=async name=>page.locator(`[data-action="${name}"]`).click();const spot=async name=>page.locator(`[data-hotspot="${name}"]`).click();const screenshot=async name=>page.screenshot({path:path.join(dir,name+'.png')});
async function frame(label){
 await page.waitForTimeout(80);const g=await page.evaluate(()=>{
 const rect=x=>{const r=document.querySelector(x).getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}};
 return{back:rect('.scene-backdrop>img'),surface:rect('.staged-response'),front:rect('.scene-painting'),hud:rect('.scene-actbar'),footer:rect('.scene-footer'),scroll:document.documentElement.scrollWidth>innerWidth,broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length};
 });
 assert.equal(g.scroll,false);assert.equal(g.broken,0);assert.ok(g.back.x<=g.surface.x+.5&&g.back.y<=g.surface.y+.5&&g.back.x+g.back.w>=g.surface.x+g.surface.w-.5&&g.back.y+g.back.h>=g.surface.y+g.surface.h-.5,'image covers all corners');
 const phase=await page.locator('main').getAttribute('data-phase'),step=await page.locator('main').getAttribute('data-step');const k=phase==='complete'||step==='handover'?'complete':phase==='respond'?'respond':phase==='review'?'review':'prepare';
 for(const r of skin.criticalRegions[k]){
  const x=g.front.x+r.x/skin.width*g.front.w,y=g.front.y+r.y/skin.height*g.front.h,right=x+r.w/skin.width*g.front.w,bottom=y+r.h/skin.height*g.front.h;
  assert.ok(x>=g.surface.x-.5&&right<=g.surface.x+g.surface.w+.5,'semantic regions not side-cropped');assert.ok(y>g.hud.y+g.hud.h,'faces/targets below HUD');assert.ok(bottom<g.footer.y,'critical regions above footer');
 }
 pass(label+' full-screen corners / semantic content safe');
}
async function prep(){
 await action('begin');assert.equal(await page.locator('[data-action="finish-prep"]').count(),0);
 for(const id of rules.inventory){await page.locator(`[data-pack="${id}"]`).click();assert.equal(await page.locator(`[data-pack="${id}"]`).count(),0);assert.equal(await page.locator(`[data-inventory="${id}"]`).getAttribute('data-packed'),'true');}
 await spot('cabinet');await spot('route');if(page.viewportSize().width===390)await screenshot('packed-390');await action('finish-prep');await action('open-review');
}
async function review(){for(const id of rules.reviewTargets){await page.locator(`[data-review="${id}"]`).click();await action('acknowledge');}await action('finish-review');await action('start-event');}
async function approach(){await spot('safe');await spot('response');await spot('breathing');await spot('caller');await action('call');await spot('compress');await spot('runner');await action('dispatch');}
async function device(useDrag,useTouch=false){
 await page.locator('[data-aed-ready="true"]').waitFor();await spot('device');await action('power');await action('expose');if(page.viewportSize().width===390)await screenshot('aed-pads-390');
 if(useDrag){
  const a=await page.locator('[data-pad="upper"]').boundingBox(),b=await page.locator('[data-pad-target="side"]').boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10});await page.mouse.up();
  assert.equal(await page.locator('[data-pad-target="side"]').getAttribute('class'),'pad-target side ');
  for(const id of ['upper','side']){const a=await page.locator(`[data-pad="${id}"]`).boundingBox(),b=await page.locator(`[data-pad-target="${id}"]`).boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10});await page.mouse.up();}
 }else if(useTouch){const cdp=await context.newCDPSession(page);try{for(const id of ['upper','side']){const a=await page.locator('[data-pad='+id+']').boundingBox(),b=await page.locator('[data-pad-target='+id+']').boundingBox();const ax=a.x+a.width/2,ay=a.y+a.height/2,bx=b.x+b.width/2,by=b.y+b.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:ax,y:ay}]});for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:ax+(bx-ax)*i/10,y:ay+(by-ay)*i/10}]});}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}}finally{await cdp.detach();}}else for(const id of ['upper','side']){await page.locator(`[data-pad="${id}"]`).focus();await page.keyboard.press('Enter');await page.locator(`[data-pad-target="${id}"]`).focus();await page.keyboard.press('Enter');}
 await page.locator('[data-step="analysis"]').waitFor();for(const id of ['self','caller','runner'])await page.locator(`[data-clear="${id}"]`).click();
}
async function ending(branch){
 if(branch==='shock'){await action('shock');assert.equal(await page.locator('[data-step="decision"]').count(),1);for(const id of ['self','caller','runner'])await page.locator(`[data-clear="${id}"]`).click();await action('shock');await spot('compress');}
 else{await action('shock');assert.equal(await page.locator('[data-step="decision"]').count(),1);await action('resume');}
 if(page.viewportSize().width===390){const a=await page.locator('[data-record]').boundingBox(),b=await page.locator('[data-handover-target]').boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10});await page.mouse.up();}else{await page.locator('[data-record]').focus();await page.keyboard.press('Enter');await spot('handover');}await page.locator('[data-phase="complete"]').waitFor();assert.equal(await page.locator('.scene-results>div').count(),3);
}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--mute-audio']});report.browser=browser.version();
 context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',offline:true,hasTouch:true});page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url())});
 await page.goto(pathToFileURL(html).href,{waitUntil:'load',timeout:120000});await screenshot('opening-390');
 for(const[w,h]of[[390,844],[320,568],[375,667],[430,932],[540,960],[1440,900]]){
  await page.setViewportSize({width:w,height:h});await action('begin');await frame(`${w}x${h} prepare`);await screenshot(`prepare-${w}`);
  await page.getByRole('button',{name:'暂停',exact:true}).click();await action('restart');
  await prep();await frame(`${w}x${h} review`);await screenshot(`review-${w}`);await review();await frame(`${w}x${h} response`);
  await approach();await screenshot(`respond-${w}`);await device(w===390);await screenshot(`device-${w}`);await ending('shock');await screenshot(`complete-${w}`);
  await action('restart');pass(`${w}x${h} full scene-action path / restart`);
 }
 await page.setViewportSize({width:390,height:844});await page.locator('select').selectOption('no-shock');await prep();await review();await approach();
 await page.getByRole('button',{name:'暂停',exact:true}).click();await page.waitForTimeout(2200);assert.equal(await page.locator('main').getAttribute('data-aed-ready'),'false');await action('continue');pass('pause freezes AED travel, not just UI');
 await device(false,true);await ending('no-shock');pass('no-shock recovery / real touch drag events / keyboard alternatives');
 assert.equal(await page.evaluate(()=>localStorage.length),0);assert.equal(report.errors.length,0,report.errors.join('\n'));assert.equal(report.network.length,0);report.status='passed';pass('final offline HTML / no runtime errors or network or save writes');
}catch(e){report.status='failed';report.failure=e.stack;process.exitCode=1;console.error(e);if(page){await screenshot('failure');fs.writeFileSync(path.join(dir,'failure.html'),await page.content());console.log(await page.locator('main').getAttribute('data-step'));console.log(await page.locator('.scene-toast').allTextContents());}}finally{await context?.close();await browser?.close();report.closed=true;fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2))}
