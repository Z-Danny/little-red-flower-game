/** Final offline HTML regression: hide home progress without changing saved progress. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/LEGION/Documents/Codex/2026-09-19/https-github-com-z-danny-little-3/work/tools/playtest/node_modules/playwright');
const html=path.resolve(process.argv[2]??'outputs/首页精简版/小红花应急行动.html');
const out=path.resolve('outputs/home-no-progress-verification');fs.mkdirSync(out,{recursive:true});
const hash=()=>createHash('sha256').update(fs.readFileSync(html)).digest('hex');
const report={html,sha256:hash(),checks:[],errors:[],browserClosed:false,physicalDevice:'not_run',humanListening:'not_run'};
const fixture={version:1,players:[{id:'home-test',name:'首页测试',region:'',createdAt:1,completed:{'charging-bedroom':3,'oil-fire':2},allLevelsUnlocked:true}],activePlayerId:'home-test'};
const pass=text=>{report.checks.push(text);console.log('PASS '+text);};
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
 for(const saved of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  try{
   await context.route(/^https?:/,r=>r.abort());
   if(saved)await context.addInitScript(f=>{
    if(!localStorage.getItem('little-red-flower-leaderboard-v1')){
     localStorage.setItem('little-red-flower-leaderboard-v1',JSON.stringify(f));
     localStorage.setItem('little-red-flower-journey-location-v1',JSON.stringify({'home-test':{levelId:'oil-fire',visitedAt:1}}));
    }
   },fixture);
   const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
   await page.goto(pathToFileURL(html).href,{waitUntil:'load',timeout:120000});
   await page.locator('[data-title-screen][data-cover-ready="true"]').waitFor();
   const noSummary=async()=>{
    assert.equal(await page.locator('[data-home-save-summary],.title-save-summary').count(),0);
    assert.doesNotMatch(await page.locator('[data-title-screen]').innerText(),/本机存档.*关|上次游玩|不会清空进度/);
   };
   for(const [width,height]of [[390,844],[320,568],[1280,900]]){
    await page.setViewportSize({width,height});await noSummary();
    const start=page.locator(saved?'[data-home-continue]':'[data-home-start]');assert(await start.isEnabled());
    const b=await start.boundingBox();assert(b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1);
    await page.screenshot({path:path.join(out,`${saved?'saved':'fresh'}-${width}x${height}.png`)});
   }
   pass(`${saved?'existing save':'fresh player'}: no home progress at mobile/narrow/desktop sizes; primary button visible`);
   if(saved){
    const storage=()=>page.evaluate(()=>localStorage.getItem('little-red-flower-leaderboard-v1'));
    const before=await storage();assert.deepEqual(JSON.parse(before).players[0].completed,fixture.players[0].completed);
    assert(await page.locator('[data-home-save]').isVisible());
    await page.locator('[data-home-continue]').click();await page.locator('[data-journey-map]').waitFor();
    assert.equal(await storage(),before);pass('continue enters map and preserves saved progress exactly');
    await page.reload({waitUntil:'load',timeout:120000});await page.locator('[data-title-screen]').waitFor();await noSummary();
    assert(await page.locator('[data-home-continue]').isEnabled());assert.equal(await storage(),before);
    pass('reload retains save and continue button without restoring home progress summary');
   }
  }finally{await context.close();}
 }
 assert.deepEqual(report.errors,[]);assert.equal(hash(),report.sha256);
}catch(e){report.failure=String(e.stack??e);console.error(e);process.exitCode=1;}
finally{if(browser){await browser.close();report.browserClosed=true;}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}