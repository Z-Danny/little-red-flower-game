/** Controlled browser clock and visibility-event integration, not a physical-device claim. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './lib/dependencies.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=join(root,'outputs/rain-flood-v1');mkdirSync(out,{recursive:true});
const file=join(root,'outputs/本地离线版/小红花应急行动.html'),report={passed:false,checks:[],offlineSha256:createHash('sha256').update(readFileSync(file)).digest('hex')};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const page=await context.newPage();
const check=(name,value)=>{assert(value,name);report.checks.push(name);console.log('PASS '+name);};
try{
 await page.addInitScript(()=>{window.__testHidden=false;window.__testContexts=[];Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__testHidden});const Native=AudioContext;window.AudioContext=class extends Native{constructor(...args){super(...args);window.__testContexts.push(this);}};});
 await page.goto(pathToFileURL(file).href,{waitUntil:'load'});await page.locator('.game-hub').waitFor();await page.clock.install();
 await page.locator('.map-level').filter({hasText:'洪水围困'}).click();await page.locator('.disaster-entry button').click();await page.clock.runFor(400);
 const elapsed=()=>page.locator('.disaster-player').getAttribute('data-elapsed');
 await page.evaluate(()=>{window.__testHidden=true;document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(100);const hiddenAt=await elapsed();await page.clock.runFor(2500);check('visibility event freezes game time',hiddenAt===await elapsed());
 await page.evaluate(()=>{window.__testHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(300);check('visible resume excludes hidden time',Number(await elapsed())-Number(hiddenAt)<=350);
 await page.clock.runFor(61000);await page.screenshot({path:join(out,'flood-risk-stage-390x844.png')});check('risk advances and preserves playing until deadline',await page.locator('.disaster-player').getAttribute('data-phase')==='playing');
 await page.clock.runFor(61000);check('actual browser flood timeout fails',await page.locator('.disaster-player').getAttribute('data-phase')==='failed');
 await page.getByRole('button',{name:'重新开始',exact:true}).click();check('timeout replay returns to ready and clears progress',await page.locator('.disaster-player').getAttribute('data-phase')==='ready'&&await page.locator('.disaster-player').getAttribute('data-goals')==='');
 await page.getByRole('button',{name:'返回关卡',exact:true}).click();await page.clock.runFor(300);check('exit closes owned audio contexts',await page.evaluate(()=>window.__testContexts.every(c=>c.state==='closed')));
 await page.locator('.map-level').filter({hasText:'暴雨前的街道'}).click();await page.locator('.disaster-entry button').click();await page.clock.runFor(91000);check('actual browser street timeout fails',await page.locator('.disaster-player').getAttribute('data-phase')==='failed');check('timeout cannot award flowers',await page.locator('.disaster-player').getAttribute('data-stars')==='0');
 await page.locator('.disaster-dialog').getByRole('button',{name:'返回关卡',exact:true}).click();await page.clock.runFor(300);check('both level audio contexts disposed',await page.evaluate(()=>window.__testContexts.every(c=>c.state==='closed')));report.passed=true;
}catch(e){report.error=String(e);console.error(e);process.exitCode=1;}finally{writeFileSync(join(out,'lifecycle-checks.json'),JSON.stringify(report,null,2));await context.close();await browser.close();}
