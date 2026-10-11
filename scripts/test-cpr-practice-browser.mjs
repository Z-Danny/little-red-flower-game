// FINAL exported file, isolated context, muted browser, always closed in finally.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(import.meta.dirname,'..');
const html=path.resolve(root,process.env.OFFLINE_HTML || 'outputs/本地离线版/小红花应急行动.html');
const out=path.join(root,process.env.CPR_REPORT_DIR || 'outputs/cpr-verification');fs.mkdirSync(out,{recursive:true});
const report={html,sha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),checks:[],layouts:[],errors:[],network:[],realDevice:'not_run',humanAudio:'not_run',medicalProfessionalReview:'not_run',closed:false};
let browser,context,page;
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const skin=JSON.parse(fs.readFileSync(path.join(root,'content/first-aid/cpr/skin.json'),'utf8'));
const auditHUD=async()=>{
 const overlaps=await page.evaluate(skin=>{
  const world=document.querySelector('.response-training-world').getBoundingClientRect();
  const scale=world.width/skin.width;
  const boxes=[...document.querySelectorAll('.response-training-header,.response-training-panel,.response-training-hotspot')].map(el=>({name:el.className,...Object.fromEntries(['left','top','right','bottom'].map(k=>[k,el.getBoundingClientRect()[k]]))}));
  return skin.criticalRegions.flatMap((r,i)=>{const a={left:world.left+r.x*scale,top:world.top+r.y*scale,right:world.left+(r.x+r.w)*scale,bottom:world.top+(r.y+r.h)*scale};return boxes.filter(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top).map(b=>({region:i,hud:b.name}));});
 },skin);
 assert.deepEqual(overlaps,[],'HUD must not cover patient, hands or faces');
 const noteErrors=await page.locator('.response-training-note:visible').evaluateAll(notes=>notes.flatMap(note=>{
  const b=note.getBoundingClientRect(),panel=note.closest('.response-training-panel').getBoundingClientRect(),style=getComputedStyle(note);
  return style.backgroundImage==='none'||style.color!=='rgb(40, 70, 52)'||parseFloat(style.paddingTop)<6||parseFloat(style.paddingBottom)<6||parseFloat(style.paddingLeft)<12||parseFloat(style.paddingRight)<12||parseFloat(style.fontSize)<14||parseFloat(style.lineHeight)<20||b.left<panel.left||b.right>panel.right||b.top<panel.top||b.bottom>panel.bottom||note.scrollWidth>note.clientWidth+1||note.scrollHeight>note.clientHeight+1?[note.className]:[];
 }));
 assert.deepEqual(noteErrors,[],'Paper-framed text is legible, fully contained, and never clipped');
 const tightText=await page.locator('.response-training-note:visible').evaluateAll(notes=>notes.flatMap(note=>{
  const box=note.getBoundingClientRect(),walk=document.createTreeWalker(note,NodeFilter.SHOW_TEXT),errors=[];let node;
  while(node=walk.nextNode()){if(!node.textContent.trim()||node.parentElement.closest('.garden-sr-only'))continue;const range=document.createRange();range.selectNodeContents(node);
   for(const r of range.getClientRects())if(r.left-box.left<11.9||box.right-r.right<11.9||r.top-box.top<5.9||box.bottom-r.bottom<5.9)errors.push(node.textContent);
  }return errors;
 }));
 assert.deepEqual(tightText,[],'Rendered text has at least 12px side clearance and 6px vertical clearance');
 const overflowing=await page.locator('[data-cpr-player] img:visible').evaluateAll(imgs=>imgs.filter(img=>{
   if(img.closest('.response-training-world'))return false;
   const b=img.getBoundingClientRect(),p=img.closest('[data-cpr-player]').getBoundingClientRect();
   return b.left<p.left-1||b.right>p.right+1||b.top<p.top-1||b.bottom>p.bottom+1;
 }).map(img=>img.className));
 assert.deepEqual(overflowing,[],'Every UI sprite including rhythm rail remains in the shared viewport');
 const layout=await page.evaluate(skin=>{
  const surface=document.querySelector('[data-cpr-player]'),frame=surface.getBoundingClientRect(),world=document.querySelector('.response-training-world').getBoundingClientRect(),panel=document.querySelector('.response-training-panel').getBoundingClientRect(),marker=document.querySelector('[data-cpr-call]').getBoundingClientRect();
  return {phase:surface.getAttribute('data-phase'),width:innerWidth,height:innerHeight,frameWidth:frame.width,sceneScaleX:world.width/skin.width,sceneScaleY:world.height/skin.height,oldSceneScale:Math.max(frame.width/skin.width,frame.height/skin.height),panelWidth:panel.width,panelHeight:panel.height,markerWidth:marker.width};
 },skin);
 assert(Math.abs(layout.sceneScaleX-layout.sceneScaleY)<.0001,'No stretching of scene, actors or contact point');
 assert(layout.markerWidth>=44&&layout.markerWidth<=56.1,'Task icons scale with game frame, retaining 44px hit targets');
 assert(layout.panelWidth<=400.1&&layout.panelHeight<=160,'Action panel remains compact on phone and desktop');
 report.layouts.push(layout);

};
try {
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined,args:['--mute-audio']});
 context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',offline:true});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url());});
 await page.goto(pathToFileURL(html).href,{waitUntil:'load',timeout:120000});
 await page.locator('[data-home-unlock-all]').click();await page.locator('[data-home-start]').click();
 await page.locator('[data-journey-map]').waitFor();await page.locator('[data-map-fan-toggle]').click();await page.locator('[data-island="first-aid"]').click();
 const node=page.locator('[data-map-node="first-aid-cpr"]');await node.scrollIntoViewIfNeeded();await node.locator('.garden-node-label').click();
 await page.locator('[data-painted-intro]').waitFor();await page.screenshot({path:path.join(out,'entry-390.png')});await page.locator('[data-painted-primary]').click();
 const surface=page.locator('[data-cpr-player]');await surface.waitFor();
 const viewports=[[320,568],[320,740],[360,640],[360,900],[375,667],[390,844],[430,932],[540,960],[1440,1000]];
 const finishReview=async(action,{pause=false,layouts=false}={})=>{
  await page.locator('[data-cpr-review]').waitFor();assert.equal(await surface.getAttribute('data-review'),action);
  assert.equal(await page.locator('[data-cpr-review] > .response-training-note').count(),1);
  const text=await page.locator('[data-cpr-review]').innerText();assert(text.includes('为什么这样做'));assert(text.length>35);assert((await page.locator('.response-training-disclaimer').innerText()).includes('教学停顿'));
  assert.equal(await page.locator('[data-cpr-continue]').isDisabled(),true);
  assert.equal(await page.locator('[data-cpr-tap]').count(),0,'No next action during review');
  await page.keyboard.press('Enter');assert.equal(await surface.getAttribute('data-review'),action);
  if(pause){
   await page.getByRole('button',{name:'暂停',exact:true}).click();const before=await surface.getAttribute('data-review-ms');const arrival=await surface.getAttribute('data-aed-ready');await page.waitForTimeout(3300);
   assert.equal(await surface.getAttribute('data-review-ms'),before);assert.equal(await surface.getAttribute('data-aed-ready'),arrival);
   await page.getByRole('button',{name:'继续练习',exact:true}).click();
   await page.getByRole('button',{name:'帮助',exact:true}).click();const helpBefore=await surface.getAttribute('data-review-ms');await page.waitForTimeout(400);assert.equal(await surface.getAttribute('data-review-ms'),helpBefore);await page.keyboard.press('Escape');
   pass('Pause and help freeze both review countdown and AED clock');
  }
  if(layouts){for(const [width,height] of viewports){await page.setViewportSize({width,height});await page.waitForTimeout(100);await auditHUD();await page.screenshot({path:path.join(out,'review-'+action+'-'+width+'x'+height+'.png')});}await page.setViewportSize({width:390,height:844});}
  await page.waitForFunction(()=>document.querySelector('[data-cpr-player]')?.getAttribute('data-review-ms')==='0',null,{timeout:8000});
  assert.equal(await surface.getAttribute('data-review'),action,'Reading never auto-skips to next action');
  await auditHUD();await page.screenshot({path:path.join(out,'reason-'+action+'.png')});
  await page.locator('[data-cpr-continue]').click();assert.equal(await surface.getAttribute('data-review'),'none');
 };
 assert.equal(await surface.getAttribute('data-ui'),'painted');
 assert.equal(await page.locator('.response-training-header .painted-icon').count(),3);
 assert.equal(await page.locator('.response-training-steps,[aria-label="流程进度"]').count(),0);
 assert.equal(await page.locator('[data-cpr-start]').count(),0);
 assert.equal(await page.locator('[data-cpr-aed]').isDisabled(),true);
 assert.equal(await page.locator('.response-training-gesture > .response-training-note').count(),1);
 await auditHUD();
 await page.screenshot({path:path.join(out,'opening-390.png')});
 await page.getByRole('button',{name:'帮助',exact:true}).click();assert((await page.locator('.response-training-modal-content').innerText()).includes('不测量真实按压深度'));
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'关闭帮助');await page.keyboard.press('Escape');
 await page.locator('[data-cpr-call]').click();await finishReview('call');
 assert.equal(await surface.getAttribute('data-step'),'aed');assert.equal(await page.locator('[data-cpr-call]').isDisabled(),true);
 await page.locator('[data-cpr-aed]').click();await finishReview('aed',{pause:true});
 await page.locator('[data-cpr-start]').click();await finishReview('start');
 assert.equal(await surface.getAttribute('data-step'),'position');
 await page.getByRole('button',{name:'脚边',exact:true}).click();assert.equal(await surface.getAttribute('data-phase'),'position');assert.equal(await surface.getAttribute('data-review'),'none');
 await page.locator('[data-cpr-position]').click();await finishReview('position');
 for(const [width,height] of viewports){await page.setViewportSize({width,height});await page.waitForTimeout(100);await auditHUD();assert.equal(await page.locator('.response-training-picture').count(),2);await page.screenshot({path:path.join(out,'hands-'+width+'x'+height+'.png')});}await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'放在腹部',exact:true}).click();assert.equal(await surface.getAttribute('data-phase'),'hands');assert.equal(await surface.getAttribute('data-review'),'none');
 await page.locator('[data-cpr-hands]').click();await finishReview('hands',{layouts:true});
 await page.getByRole('button',{name:'弯肘 · 斜着用力',exact:true}).click();assert.equal(await surface.getAttribute('data-phase'),'posture');
 await page.locator('[data-cpr-posture]').click();await finishReview('posture',{layouts:true});
 pass('Ordered actions, explicit 3-second reason reviews, wrong-answer recovery and no early inputs');
 for(const [width,height] of viewports){
  await page.setViewportSize({width,height});await page.waitForTimeout(100);assert.equal(await surface.getAttribute('data-clipped'),'false');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const bounds=await surface.boundingBox();if(width<600){assert(Math.abs(bounds.width-width)<2);assert(Math.abs(bounds.height-height)<2);}
  for(const button of await page.locator('[data-cpr-player] button:visible').all()){const b=await button.boundingBox();assert(b.height>=43);assert(b.x>=bounds.x-1&&b.x+b.width<=bounds.x+bounds.width+1);}
  await auditHUD();await page.screenshot({path:path.join(out,'rhythm-'+width+'x'+height+'.png')});
 }
 pass('Nine viewports: full mobile surface, shared camera, readable reasons and no critical-region overlap');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('[data-cpr-handover]').count(),0);
 for(let i=0;i<15&&await page.locator('[data-cpr-tap]').count();i++){await page.locator('[data-cpr-tap]').click();await page.waitForTimeout(i===1?300:550);}
 assert.equal(await surface.getAttribute('data-samples'),'12');await finishReview('rhythm');
 await page.locator('[data-cpr-handover]').click();assert.equal(await surface.getAttribute('data-handover'),'true');assert.equal(await page.locator('[data-cpr-finish]').count(),0);await finishReview('handover');
 pass('Uninterrupted rhythm segment, then explained handover before final completion');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.screenshot({path:path.join(out,'ready-to-finish-390.png')});
 await page.locator('[data-cpr-finish]').click();await page.locator('[data-testid="settlement-title"]').waitFor();
 assert.equal(await page.locator('[data-cpr-player]').getAttribute('data-phase'),'complete');assert.equal(await page.locator('[data-cpr-player]').getAttribute('data-handover'),'true');
 assert((await page.locator('[data-testid="settlement-knowledge"]').innerText()).includes('不能测量深度'));
 const sources=await page.locator('.painted-settlement-sources a').evaluateAll(links=>links.map(a=>({label:a.textContent,href:a.href})));
 assert.deepEqual(sources.map(s=>s.href),["https://wjw.beijing.gov.cn/bmfw_20143/jkzs/jksh/202409/t20240912_3865801.html"]);
 assert(sources.every(s=>s.label.includes('北京市卫健委')));
 pass('Final HTML settlement reference uses the verified Chinese official health source, not US links');
 const beforeMotion=await page.locator('[data-training-actor]').getAttribute('style');await page.waitForTimeout(130);assert.notEqual(await page.locator('[data-training-actor]').getAttribute('style'),beforeMotion,'Helper animation must continue beneath settlement');
 await page.screenshot({path:path.join(out,'settlement-390.png')});pass('Final HTML completes via real pointer inputs and contextual settlement, helper remains present');
 assert.equal(report.errors.length,0,report.errors.join('\n'));assert.equal(report.network.length,0,'Offline HTML must not request the network');
 await page.locator('[data-testid="settlement-primary"]').click();await page.locator('[data-journey-map]').waitFor();pass('Return and planting use existing journey flow');
} catch(error){report.failure=error.stack;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
finally{await context?.close();await browser?.close();report.closed=true;fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));}
