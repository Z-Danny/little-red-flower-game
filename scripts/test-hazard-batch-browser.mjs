/**
 * Isolated offline acceptance for the seven new v2 hunt packs.
 * Default: 7 levels x file/HTTP x 320/390/desktop = 42 cases.
 * node scripts/test-hazard-batch-browser.mjs [--preflight] [--level H02|actual-id] [--html path]
 * No user's browser profile, no user storage, no actual speaker playback.
 * --mute-audio is mandatory. Audio analysis is not human listening.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const args=process.argv.slice(2),option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const defaultModule='C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const defaultExe='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const modulePath=option('--playwright',defaultModule),executablePath=option('--browser',defaultExe);
const html=path.resolve(root,option('--html','outputs/本地离线版/小红花应急行动.html'));
const plan=JSON.parse(fs.readFileSync(path.join(root,'docs/hazard-batch-v2/production-plan.json'),'utf8'));
const chosen=option('--level',null),cards=chosen?plan.levels.filter(c=>c.id===chosen||c.authorId===chosen):plan.levels;
assert.ok(cards.length, 'No matching level; use author ID or production-plan actual ID.');
const output=path.resolve(root,option('--output','docs/hazard-batch-v2/verification'));
fs.mkdirSync(output,{recursive:true});
const report={at:new Date().toISOString(),scope:chosen??'all-seven',expectedCases:cards.length*6,status:'preflight',browser:'isolated headless Edge',audio:'--mute-audio; no actual speaker playback or subjective listening',physicalDevices:'not tested',visibility:'synthetic document.hidden lifecycle, not OS tab switching',cases:[],cleanup:{browserClosed:false,serverClosed:false,contextsClosed:0}};
const reportPath=path.join(output,'hazard-browser-report.json');
function persist(){fs.writeFileSync(reportPath,JSON.stringify(report,null,2));}
const samples=new Map(),skins=new Map(),missing=[];
for(const card of cards){
  for(const name of ['rules','skin','presentation','performance'])if(!fs.existsSync(path.join(root,'content/scenes',card.id,name+'.json')))missing.push('content/scenes/'+card.id+'/'+name+'.json');
  const sampleFile=path.join(root,'art-source/hazard-batch-v2',card.authorId,'hit-samples.json');
  if(!fs.existsSync(sampleFile)){missing.push(sampleFile);continue;}
  const sample=JSON.parse(fs.readFileSync(sampleFile,'utf8'));
  for(const [key,p] of [...card.targets.map(t=>[t.id,sample.targets?.[t.id]]),['background',sample.background]]){
    assert.ok(Array.isArray(p)&&p.length===2&&p.every(Number.isFinite),card.id+' invalid actual-mask sample '+key);
    assert.ok(p[0]>=0&&p[0]<720&&p[1]>=0&&p[1]<1280,card.id+' out-of-world sample '+key);
  }
  samples.set(card.id,sample);
}
if(!fs.existsSync(html))missing.push(html);
if(!fs.existsSync(executablePath))missing.push(executablePath);
if(missing.length){
  report.status='not_run_missing_inputs';report.missing=missing;persist();
  console.error('Browser tests NOT run. Missing production inputs:\n'+missing.join('\n'));process.exitCode=2;
}else if(args.includes('--preflight')){
  report.status='preflight_passed_browser_not_run';persist();console.log('Preflight passed; browser NOT run.');
}else{
  const htmlBytes=fs.readFileSync(html);report.html={path:html,sha256:createHash('sha256').update(htmlBytes).digest('hex'),bytes:htmlBytes.length};
  for(const card of cards)skins.set(card.id,JSON.parse(fs.readFileSync(path.join(root,'content/scenes',card.id,'skin.json'),'utf8')));
  const {chromium}=require(modulePath);
  const runDir=path.join(output,'browser-'+new Date().toISOString().replaceAll(':','-').replaceAll('.','-'));
  fs.mkdirSync(runDir,{recursive:true});report.artifacts=path.relative(root,runDir).replaceAll('\\','/');
  let server=null,browser=null,http='',activeContext=null;
  const state=page=>page.locator('section.hunt-player').evaluate(el=>({...el.dataset}));
  const dialog=page=>page.locator('.hunt-dialog[role="dialog"]');
  const rx=s=>new RegExp('^'+s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');
  const cardButton=(page,title)=>page.locator('button.map-level').filter({has:page.locator('.map-copy > strong').filter({hasText:rx(title)})});
  async function press(page,locator){
    assert.equal(await locator.count(),1,'Button selector must be unique');
    await locator.waitFor({state:'visible',timeout:20000});
    assert.equal(await locator.isEnabled(),true);
    // Use real pointer input without Playwright's two-rAF stability wait while the test clock is paused.
    await locator.evaluate(el=>el.scrollIntoView({block:'center',inline:'center',behavior:'instant'}));
    const b=await locator.boundingBox();assert.ok(b&&b.width>0&&b.height>0);
    if(page.viewportSize().width<600)await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);
    else await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
  }
  async function step(page,ms){if(ms>0)await page.clock.runFor(ms);await page.evaluate(()=>new Promise(resolve=>queueMicrotask(resolve)));}
  async function toElapsed(page,at){
    let loops=0;for(;;){const s=await state(page),left=at-Number(s.elapsed);if(left<=0)return s;
      assert.equal(s.phase,'playing');assert.ok(loops++<1000,'Clock failed to advance');await step(page,Math.min(1000,Math.max(18,left)));
    }
  }
  async function toRevealAge(page,at){
    let loops=0;for(;;){const s=await state(page),left=at-Number(s.revealAge);if(left<=0)return s;
      assert.equal(s.phase,'reveal');assert.ok(loops++<100,'Reveal clock failed to advance');await step(page,Math.min(400,Math.max(18,left)));
    }
  }
  async function samplePoint(page,card,world){
    const b=await page.locator('.hunt-world > canvas').boundingBox(),skin=skins.get(card.id);
    assert.ok(b&&b.width>0&&b.height>0);
    const scale=Math.max(b.width/skin.width,b.height/skin.height);
    return {x:b.x+(b.width-skin.width*scale)/2+world[0]*scale,y:b.y+(b.height-skin.height*scale)/2+world[1]*scale};
  }
  async function clickWorld(page,card,world){
    const p=await samplePoint(page,card,world);
    const top=await page.evaluate(({x,y})=>{const el=document.elementFromPoint(x,y);return {canvas:el?.tagName==='CANVAS',tag:el?.tagName,className:el?.className};},p);
    assert.equal(top.canvas,true,card.id+' target sample is obscured by UI or outside canvas: '+JSON.stringify(top));
    if(page.viewportSize().width<600)await page.touchscreen.tap(p.x,p.y);
    else await page.mouse.click(p.x,p.y);
  }
  const hit=(page,card,id)=>clickWorld(page,card,samples.get(card.id).targets[id]);
  const board=page=>page.evaluate(()=>{const raw=localStorage.getItem('little-red-flower-leaderboard-v1');return raw?JSON.parse(raw):null;});
  const score=(b,id)=>b?.players.find(p=>p.id===b.activePlayerId)?.completed?.[id]??0;
  async function screenshot(page,name){await page.screenshot({path:path.join(runDir,name+'.png')});}
  async function enter(page,card){
    await press(page,cardButton(page,card.title));
    await page.locator('section.hunt-player').waitFor({state:'visible',timeout:20000});
    await page.locator('.hunt-entry > button').waitFor({state:'visible',timeout:30000});
    assert.equal((await state(page)).level,card.id);
    assert.equal(await page.locator('.hunt-targets > span').count(),5);
    assert.equal(await page.locator('.hunt-loading').count(),0);
    await press(page,page.locator('.hunt-entry > button'));
  }
  async function pause(page){await press(page,page.locator('.hunt-hud > button[aria-label="暂停游戏"]'));assert.equal((await state(page)).paused,'true');}
  async function resume(page){await press(page,dialog(page).getByRole('button',{name:'继续游戏',exact:true}));}
  async function retry(page){await press(page,dialog(page).getByRole('button',{name:'重新开始',exact:true}));assert.equal((await state(page)).phase,'ready');await press(page,page.locator('.hunt-entry > button'));await step(page,32);}
  try{
    server=createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(htmlBytes);});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});http='http://127.0.0.1:'+server.address().port+'/';
    browser=await chromium.launch({headless:true,executablePath,args:['--mute-audio']});
    report.status='running';persist();
    const jobs=cards.flatMap(card=>['http','file'].flatMap(protocol=>[[390,844],[320,740],[1440,900]].map(([width,height])=>({card,protocol,width,height}))));
    async function runCase({card,protocol,width,height}){
      const result={id:card.id,authorId:card.authorId,protocol,width,height,status:'running',checks:[],pageErrors:[],externalRequests:[],screenshots:[]};
      report.cases.push(result);const prefix=card.authorId+'-'+protocol+'-'+width,detailed=protocol==='http'&&width===390;
      const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:width<600,isMobile:width<600});activeContext=context;
      try{
        const page=await context.newPage();
        page.on('pageerror',e=>result.pageErrors.push(e.message));
        await context.route('**/*',route=>{const url=route.request().url();
          if(/^https?:/i.test(url)&&!url.startsWith(http)){result.externalRequests.push(url);return route.abort();}
          return route.continue();
        });
        await page.goto(protocol==='file'?pathToFileURL(html).href:http,{waitUntil:'load',timeout:60000});
        await enter(page,card);await pause(page);
        await press(page,dialog(page).getByRole('button',{name:'关闭声音',exact:true}));
        const time=new Date();await page.clock.install({time});await page.clock.pauseAt(time);
        await resume(page);await step(page,32);
        let s=await state(page);assert.equal(s.performance,'v2');assert.equal(s.stage,'0');assert.equal(s.phase,'playing');
        const [clues,canvasBox,titleBox]=await Promise.all([page.locator('.hunt-targets').boundingBox(),page.locator('.hunt-world canvas').boundingBox(),page.locator('.hunt-hud h1').boundingBox()]);
        assert.ok(canvasBox.x>=0&&canvasBox.y>=0&&canvasBox.x+canvasBox.width<=width+1&&canvasBox.y+canvasBox.height<=height+1,'Portrait game stays inside viewport');
        assert.ok(canvasBox.width<=520.1&&canvasBox.y===0,'Phone-width, top-aligned frame');
        assert.ok(titleBox.y>=0,'Title must remain inside viewport');
        assert.ok(clues.x>=0&&clues.y>=0&&clues.x+clues.width<=width&&clues.y+clues.height<=height,'Floating clues remain visible');
        assert.equal(await page.locator('.hunt-backdrop').count(),0,'No blurred filler');
        assert.equal(await page.locator('.hunt-targets').evaluate(el=>getComputedStyle(el).flexDirection),'row');
        assert.ok(Math.abs(clues.x+clues.width/2-width/2)<1,'Fixed centered clue row');
        const initialBoard=await board(page);assert.equal(score(initialBoard,card.id),0);
        await screenshot(page,prefix+'-initial');result.screenshots.push(prefix+'-initial.png');
        result.checks.push('Proportional portrait painting, top horizontal five silhouettes, no filler; actual pixel samples; speaker muted');

        // Wrong action leaves elapsed/pressure/score unchanged at the input instant.
        const beforeMiss=await state(page);await clickWorld(page,card,samples.get(card.id).background);s=await state(page);
        assert.equal(s.found,beforeMiss.found);assert.equal(s.elapsed,beforeMiss.elapsed);assert.equal(s.pressure,beforeMiss.pressure);
        await step(page,110);if(detailed){await screenshot(page,prefix+'-miss');result.screenshots.push(prefix+'-miss.png');}
        await step(page,390);assert.equal((await state(page)).found,'');
        result.checks.push('Misclick neutral; 450ms feedback window exercised (exact boundary in unit tests)');

        // Partial run, busy taps, pause in marking, unfinished no-award flow.
        const ids=card.targets.map(t=>t.id);
        await hit(page,card,ids[0]);await hit(page,card,ids[1]);await step(page,350);assert.equal((await state(page)).found,'');
        await pause(page);const paused=await state(page);await step(page,5000);
        const afterPause=await state(page);assert.equal(afterPause.elapsed,paused.elapsed);assert.equal(afterPause.found,paused.found);assert.equal(afterPause.stage,paused.stage);assert.equal(afterPause.animationPaused,'true');
        await resume(page);await step(page,300);assert.equal((await state(page)).found,'');
        if(detailed){await screenshot(page,prefix+'-mark');result.screenshots.push(prefix+'-mark.png');}
        await step(page,220);assert.equal((await state(page)).found,ids[0]);await hit(page,card,ids[0]);assert.equal((await state(page)).found,ids[0]);
        await pause(page);await press(page,dialog(page).getByRole('button',{name:'结束本次观察',exact:true}));
        s=await state(page);assert.equal(s.phase,'unfinished');assert.equal(s.found,ids[0]);
        assert.equal(await dialog(page).locator('h2').innerText(),'本次观察未完成 1/5');
        await step(page,6000);assert.equal((await state(page)).elapsed,s.elapsed);assert.deepEqual(await board(page),initialBoard);
        assert.equal(await page.locator('.hunt-flowers').count(),0);
        if(detailed){await screenshot(page,prefix+'-unfinished');result.screenshots.push(prefix+'-unfinished.png');}
        result.checks.push('800ms mark not immediate; busy/repeated taps ignored; pause freezes mark and tier; unfinished freezes and awards nothing');
        await retry(page);

        // Exercise hidden lifecycle in the isolated page; do not claim physical tab-switch testing.
        await hit(page,card,ids[0]);await step(page,200);
        await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
        const hidden=await state(page);await step(page,3000);assert.equal((await state(page)).elapsed,hidden.elapsed);assert.equal((await state(page)).found,hidden.found);
        await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
        await step(page,450);assert.equal((await state(page)).found,'');await step(page,230);assert.equal((await state(page)).found,ids[0]);
        result.checks.push('Synthetic hidden lifecycle freezes and resumes marking; no forced unfinished result');

        if(detailed){
          for(const [at,tier] of [[30020,'1'],[60020,'2'],[90020,'3']]){
            s=await toElapsed(page,at);assert.equal(s.stage,tier);assert.equal(s.phase,'playing');
            await screenshot(page,prefix+'-stage-'+tier);result.screenshots.push(prefix+'-stage-'+tier+'.png');
          }
          assert.equal((await state(page)).pressure,'1.000');
          await step(page,1200);assert.equal((await state(page)).phase,'playing');
          result.checks.push('0/30/60/90-second browser frames; peak remains playable with speaker muted');
        }
        for(const id of ids.slice(1)){await hit(page,card,id);await step(page,850);}
        s=await state(page);assert.equal(s.phase,'reveal');assert.equal(s.found.split(',').length,5);
        assert.equal(score(await board(page),card.id),0,'No award before ending completes');
        await toRevealAge(page,600);assert.equal((await state(page)).phase,'reveal');
        await pause(page);const pausedReveal=await state(page);await step(page,2000);
        assert.equal((await state(page)).revealAge,pausedReveal.revealAge);await resume(page);
        await toRevealAge(page,2650);assert.equal((await state(page)).phase,'reveal');
        await screenshot(page,prefix+'-ending');result.screenshots.push(prefix+'-ending.png');
        await toRevealAge(page,5390);assert.equal((await state(page)).phase,'reveal');assert.equal(score(await board(page),card.id),0);
        await step(page,160);assert.equal((await state(page)).phase,'complete');await step(page,32);
        const completeBoard=await board(page);assert.equal(score(completeBoard,card.id),3);
        assert.equal(await page.locator('.hunt-targets > .found').count(),5);
        assert.equal(await dialog(page).locator('.hunt-flowers > span').count(),3);
        await screenshot(page,prefix+'-complete');result.screenshots.push(prefix+'-complete.png');
        result.checks.push('Ending pause freezes; full-image reveal holds until settlement; exactly 3 flowers persisted');

        await retry(page);
        for(const id of [...ids].reverse()){await hit(page,card,id);await step(page,850);}
        await step(page,5600);assert.equal((await state(page)).phase,'complete');await step(page,32);
        assert.deepEqual(await board(page),completeBoard);
        await press(page,dialog(page).getByRole('button',{name:'返回关卡',exact:true}));await step(page,32);
        assert.equal(await page.locator('section.hunt-player').count(),0);
        for(const title of ['台风前的家','厨房着火了','充电中的卧室'])assert.equal(await cardButton(page,title).count(),1,title);
        result.checks.push('Reverse-order replay clears run; repeated reward idempotent; old playable maps preserved; player unmounted');
        assert.deepEqual(result.pageErrors,[]);assert.deepEqual(result.externalRequests,[]);
        result.checks.push('No page errors or external network requests');result.status='passed';
      }catch(error){result.status='failed';result.error=String(error?.stack??error);throw error;}
      finally{await context.close();activeContext=null;report.cleanup.contextsClosed++;result.contextClosed=true;persist();}
      console.log(JSON.stringify({id:card.id,protocol,width,status:result.status,checks:result.checks.length}));
    }
    let cursor=0,failed=false;
    const workers=await Promise.allSettled(Array.from({length:2},async()=>{
      while(cursor<jobs.length&&!failed){const job=jobs[cursor++];try{await runCase(job);}catch(error){failed=true;throw error;}}
    }));
    const rejected=workers.find(w=>w.status==='rejected');if(rejected)throw rejected.reason;
    report.status='passed';
  }catch(error){report.status='failed';report.error=String(error?.stack??error);process.exitCode=1;console.error(error);}
  finally{
    if(activeContext){try{await activeContext.close();report.cleanup.contextsClosed++;}catch(error){report.cleanup.contextError=String(error);}}
    if(browser){try{await browser.close();report.cleanup.browserClosed=true;}catch(error){report.cleanup.browserError=String(error);}}
    if(server){try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));report.cleanup.serverClosed=true;}catch(error){report.cleanup.serverError=String(error);}}
    report.finishedAt=new Date().toISOString();report.passedCases=report.cases.filter(c=>c.status==='passed').length;persist();
    console.log('Acceptance report: '+reportPath);
  }
}
