/** Process-restart persistence using an isolated on-disk profile, never the user's browser. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire}from 'node:module';import{pathToFileURL}from 'node:url';import{root}from './lib/dependencies.mjs';import{createHash}from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'playwright');
const html=path.join(root,'outputs/本地离线版/小红花应急行动.html'),out=path.join(root,'outputs/save-backup-verification');fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'flower-save-reopen-'));
const report={html,sha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),profile,checks:[],network:[],errors:[],status:'running',physicalDevice:'not_run',humanListening:'not_run',contextsClosed:0};
const fixture=JSON.stringify({format:'little-red-flower-progress',version:1,exportedAt:Date.now(),player:{name:'重启验证',region:'测试',completed:{'typhoon-home':2},allLevelsUnlocked:false}});
let context;
try {
 for(const stage of ['import','reopen']) {
  context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio'],viewport:{width:390,height:844},reducedMotion:'reduce'});
  try {
   await context.route(/^https?:/,route=>{report.network.push(route.request().url());return route.abort();});
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(pathToFileURL(html).href,{waitUntil:'load',timeout:120000});
   if(stage==='import') {
    await page.locator('[data-home-save]').click();const m=page.locator('.save-manager');await m.getByLabel('选择小红花存档文件').setInputFiles({name:'restart.json',mimeType:'application/json',buffer:Buffer.from(fixture)});
    await m.locator('[data-save-confirm]').click();await m.locator('[data-save-message]').filter({hasText:'已导入'}).waitFor();assert.equal(await m.locator('[data-persistence]').getAttribute('data-persistence'),'saved');
    report.checks.push('Imported test fixture through the actual UI and saved to isolated profile');
   }else {
    await page.locator('[data-home-continue]').waitFor();assert.equal(await page.locator('[data-home-continue]').getAttribute('class'),'title-primary');
    const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1')));assert.equal(state.players.find(p=>p.id===state.activePlayerId).name,'重启验证');
    await page.locator('[data-home-continue]').click();await page.locator('[data-journey-map]').waitFor();assert.equal(await page.locator('[data-wallet]').innerText(),'2');
    await page.screenshot({path:path.join(out,'browser-process-reopened.png')});report.checks.push('Closed entire browser, reopened same isolated profile, active player and 2 flowers survive; Continue opens map');
   }
  }finally{await context.close();report.contextsClosed++;context=null;}
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';console.log(report.checks.join('\n'));
}catch(error){report.status='failed';report.failure=error.stack;throw error;}
finally{if(context)await context.close();fs.writeFileSync(path.join(out,'process-reopen-report.json'),JSON.stringify(report,null,2));}
