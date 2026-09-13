/** Isolated headless Edge/Chromium acceptance: never touches the user's browser/storage.
 * Args: [playwright module path] [browser executable]. No installations or system volume changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const {chromium}=require(process.argv[2]||'playwright');
const html=path.join(root,'outputs/本地离线版/小红花应急行动.html');
const output=path.join(root,'docs/charging-bedroom/verification');fs.mkdirSync(output,{recursive:true});
const hitSamples=JSON.parse(fs.readFileSync(path.join(root,'art-source/charging-bedroom-v1/hit-samples.json')));
const htmlBytes=fs.readFileSync(html);
const server=createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(htmlBytes);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const http=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({headless:true,executablePath:process.argv[3]||undefined,args:['--mute-audio']});
const reports=[];
const desktopOnly=process.argv.includes('--desktop-only');
async function state(page){return page.locator('.hunt-player').evaluate(el=>({...el.dataset}));}
async function point(page,world){const b=await page.locator('.hunt-world canvas').boundingBox(),scale=Math.min(b.width/720,b.height/1280);return {x:b.x+(b.width-720*scale)/2+world[0]*scale,y:b.y+(b.height-1280*scale)/2+world[1]*scale};}
async function hit(page,id){const p=await point(page,hitSamples.targets[id]);await page.mouse.click(p.x,p.y);}
try {
  for(const protocol of desktopOnly?['file']:['http','file'])for(const [width,height] of desktopOnly?[[1440,900]]:[[390,844],[320,740],[1440,900]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
    const page=await context.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',req=>{if(/^https?:/.test(req.url())&&!req.url().startsWith(http))external.push(req.url());});
    const report={protocol,width,height,errors,external,checks:[]};reports.push(report);
    await page.goto(protocol==='file'?pathToFileURL(html).href:http,{waitUntil:'load'});
    await page.locator('.map-level').filter({hasText:'充电中的卧室'}).click();
    await page.getByRole('button',{name:/进入场景/}).waitFor();
    assert.equal((await state(page)).level,'charging-bedroom');
    assert.equal(await page.locator('.hunt-targets > span').count(),3);
    await page.getByRole('button',{name:/进入场景/}).click();
    await page.getByRole('button',{name:'暂停游戏'}).click();
    await page.getByRole('button',{name:'关闭声音',exact:true}).click();
    const startTime=new Date();await page.clock.install({time:startTime});await page.clock.pauseAt(startTime);
    await page.getByRole('button',{name:'继续游戏'}).click();await page.clock.runFor(32);
    await page.screenshot({path:path.join(output,`${protocol}-${width}-initial.png`)});
    assert.equal((await state(page)).environment,'none');report.checks.push('3 targets / full portrait contain / quiet environment');
    const beforeMiss=await state(page);const miss=await point(page,hitSamples.background);await page.mouse.click(miss.x,miss.y);await page.clock.runFor(450);
    assert.equal((await state(page)).found,beforeMiss.found);report.checks.push('blank miss no score');
    const c=await page.locator('.hunt-world canvas').boundingBox();
    if(width>700){await page.mouse.click(c.x+4,c.y+height/2);assert.equal((await state(page)).found,'');report.checks.push('letterbox excluded');}
    await hit(page,'covered_phone');await hit(page,'swollen_bank');await page.clock.runFor(700);assert.equal((await state(page)).found,'');
    await page.clock.runFor(160);assert.equal((await state(page)).found,'covered_phone');await hit(page,'covered_phone');report.checks.push('800ms mark / busy and repeated taps');
    await page.getByRole('button',{name:'暂停游戏'}).click();const paused=await state(page);await page.clock.runFor(5000);
    assert.equal((await state(page)).elapsed,paused.elapsed);await page.getByRole('button',{name:'继续游戏'}).click();report.checks.push('pause clock frozen');
    // Simulated lifecycle event, recorded separately from actual OS tab switching.
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    const hidden=await state(page);await page.clock.runFor(3000);assert.equal((await state(page)).elapsed,hidden.elapsed);
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});report.checks.push('simulated hidden lifecycle freezes time');
    if(protocol==='http'&&width===390){await page.clock.runFor(91000);assert.equal((await state(page)).pressure,'1.000');assert.equal((await state(page)).phase,'playing');await page.screenshot({path:path.join(output,'http-390-peak.png')});report.checks.push('90s peak recoverable (controlled browser clock)');}
    await hit(page,'damaged_lead');await page.clock.runFor(900);await hit(page,'swollen_bank');await page.clock.runFor(850);
    assert.equal((await state(page)).phase,'reveal');await page.clock.runFor(2750);
    assert.equal((await state(page)).phase,'reveal');await page.screenshot({path:path.join(output,`${protocol}-${width}-ending.png`)});
    await page.clock.runFor(3000);assert.equal((await state(page)).phase,'complete');assert.equal(await page.locator('.hunt-targets .found').count(),3);
    const completed=await page.evaluate(()=>JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1')));
    assert.equal(completed.players.find(p=>p.id===completed.activePlayerId).completed['charging-bedroom'],3);report.checks.push('ending retained / 3 flowers persisted');
    await page.getByRole('button',{name:'重新开始',exact:true}).click();assert.equal((await state(page)).found,'');assert.equal((await state(page)).phase,'ready');
    await page.getByRole('button',{name:/进入场景/}).click();
    for(const id of ['swollen_bank','damaged_lead','covered_phone']){await hit(page,id);await page.clock.runFor(900);}
    await page.clock.runFor(5700);assert.equal((await state(page)).phase,'complete');
    const again=await page.evaluate(()=>JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1')));assert.deepEqual(again,completed);report.checks.push('replay clears marks / repeated reward idempotent');
    await page.getByRole('dialog').getByRole('button',{name:'返回关卡',exact:true}).click();await page.clock.runFor(100);
    for(const name of ['台风前的家','厨房着火了','充电中的卧室'])assert.equal(await page.locator('.map-level').filter({hasText:name}).count(),1);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);report.checks.push('previous levels retained / no page errors / no external requests');
    await context.close();report.closed=true;console.log(JSON.stringify({protocol,width,checks:report.checks.length}));
  }
} finally {
  await browser.close();await new Promise(r=>server.close(r));
  fs.writeFileSync(path.join(output,desktopOnly?'browser-desktop-final.json':'browser-report.json'),JSON.stringify({at:new Date().toISOString(),browser:'headless Chromium/Edge',sound:'speaker output muted; not a human listening test',physicalPhone:'not tested',reports,closed:true},null,2));
}
