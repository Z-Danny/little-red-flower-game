import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire}from'node:module';import{pathToFileURL}from'node:url';import{createHash}from'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),html=process.argv[2]??path.join(root,'outputs/本地离线版/小红花应急行动.html');
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report={status:'running',sha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),errors:[],browserClosed:false};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(pathToFileURL(html).href);await page.locator('[data-home-start]').click();await page.locator('.garden-node').first().waitFor();
 await page.evaluate(()=>{const key='little-red-flower-leaderboard-v1',s=JSON.parse(localStorage.getItem(key));s.players.find(p=>p.id===s.activePlayerId).completed={'quake-cover-practice':3,'quake-exit-practice':3};localStorage.setItem(key,JSON.stringify(s));});
 await page.reload();await page.locator('[data-home-continue]').click();await page.locator('[data-category="nature"]').click();
 const node=page.locator('[data-map-node="flood-highground-practice"]');await node.scrollIntoViewIfNeeded();assert.equal(await node.getAttribute('data-status'),'available');
 await node.click();const entry=page.locator('[data-painted-intro][data-level-id="flood-highground-practice"]');await entry.waitFor({state:'visible'});await entry.locator('[data-painted-primary]').click();
 await page.waitForFunction(()=>{const player=document.querySelector('.configured-player');return player?.dataset.ready==='true'&&player.dataset.phase==='playing';});assert.equal(await page.locator('[data-painted-intro]').count(),0,'one map confirmation must not open a second introduction');assert.equal(await page.locator('.configured-player').getAttribute('data-level'),'flood-highground-practice');
 const scores=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1'));return s.players.find(p=>p.id===s.activePlayerId).completed;});assert.deepEqual(scores,{'quake-cover-practice':3,'quake-exit-practice':3});assert.deepEqual(report.errors,[]);report.status='passed';
}catch(e){report.failure=e.stack;process.exitCode=1;}finally{await browser.close();report.browserClosed=true;fs.writeFileSync(path.join(root,'flood-unlock-browser-report.json'),JSON.stringify(report,null,2));console.log(report);}
