import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const {chromium}=require(process.argv[2]||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.argv[3]||undefined,args:['--mute-audio']});
const checks=[];
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(pathToFileURL(path.join(root,'outputs/本地离线版/小红花应急行动.html')).href);
 await page.locator('.map-level').filter({hasText:'充电中的卧室'}).click();
 await page.getByRole('button',{name:/进入场景/}).waitFor();
 assert.equal(await page.locator('.hunt-player').getAttribute('data-audio'),'locked');checks.push('audio locked before gesture');
 await page.getByRole('button',{name:/进入场景/}).click();
 await page.waitForFunction(()=>Number(document.querySelector('.hunt-world canvas')?.dataset.audioRms)>0.0001,{},{timeout:10000});
 checks.push('real AudioContext analyser has nonzero music waveform');
 await page.getByRole('button',{name:'暂停游戏'}).click();
 await page.waitForFunction(()=>Number(document.querySelector('.hunt-world canvas')?.dataset.audioRms)<0.0001,{},{timeout:5000});checks.push('pause waveform fades to zero');
 await page.getByRole('button',{name:'关闭声音',exact:true}).click();
 await page.getByRole('button',{name:'继续游戏'}).click();
 await page.waitForTimeout(700);
 assert.equal(Number(await page.locator('.hunt-world canvas').getAttribute('data-audio-rms')),0);checks.push('mute persists after resume');
 await page.getByRole('button',{name:'暂停游戏'}).click();
 await page.getByRole('button',{name:'打开声音',exact:true}).click();
 await page.getByRole('button',{name:'继续游戏'}).click();
 await page.waitForFunction(()=>Number(document.querySelector('.hunt-world canvas')?.dataset.audioRms)>0.0001,{},{timeout:10000});checks.push('unmute resumes music');
 await page.getByRole('button',{name:'返回关卡',exact:true}).click();
 assert.equal(await page.locator('.hunt-player').count(),0);checks.push('player unmounted; disposal covered by lifecycle unit tests');
} finally {
 await browser.close();
 fs.writeFileSync(path.join(root,'docs/charging-bedroom/verification/audio-browser.json'),JSON.stringify({at:new Date().toISOString(),checks,closed:true,speakersMuted:true,humanListening:false},null,2));
}
console.log(JSON.stringify(checks));
