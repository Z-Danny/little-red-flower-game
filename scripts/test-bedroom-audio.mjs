import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire}from'node:module';import{pathToFileURL}from'node:url';import{createHash}from'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),root=path.resolve(import.meta.dirname,'..');
const html=process.env.CHALLENGE_HTML??path.join(root,'outputs/本地离线版/小红花应急行动.html'),out=path.resolve(root,process.env.BEDROOM_AUDIO_REPORT??'outputs/bedroom-audio');fs.mkdirSync(out,{recursive:true});
const report={status:'running',sha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),clock:'native realtime',hardwareMuted:true,humanListening:'not_run',physicalPhone:'not_run',errors:[],network:[],closed:false};
const ids=JSON.parse(fs.readFileSync(path.join(root,'content/journey-map.json'),'utf8')).regions.flatMap(r=>r.nodes.map(n=>n.id));
const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
try{
 const p=await b.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});p.on('pageerror',e=>report.errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url());});
 await p.addInitScript(ids=>{
  localStorage.setItem('little-red-flower-leaderboard-v1',JSON.stringify({version:1,activePlayerId:'qa',players:[{id:'qa',name:'测试',region:'',createdAt:1,completed:Object.fromEntries(ids.map(id=>[id,3]))}]}));
  window.qaAnalysers=[];const Native=window.AudioContext;window.AudioContext=class extends Native{createAnalyser(){const a=super.createAnalyser();window.qaAnalysers.push(a);return a;}};
 },ids);
 await p.goto(pathToFileURL(html).href);await p.locator('[data-home-continue]').click();await p.locator('[data-map-region="home"]').click();await p.locator('[data-map-node="bedroom-night-check-v2"]').click();await p.getByRole('button',{name:'再守护一次',exact:true}).click();await p.locator('.hunt-entry>button').click();
 const host=p.locator('.hunt-player'),canvas=host.locator('canvas'),pause=p.getByRole('button',{name:'暂停游戏',exact:true});
 report.peak=await p.evaluate(()=>new Promise(resolve=>{let max=0;const timer=setInterval(()=>{for(const a of window.qaAnalysers){const data=new Float32Array(a.fftSize);a.getFloatTimeDomainData(data);max=Math.max(max,...data.map(Math.abs));}},20);setTimeout(()=>{clearInterval(timer);resolve(max);},1900);}));
 assert.ok(report.peak>.0001,'Actual WebAudio graph produces PCM');assert.equal(await host.getAttribute('data-audio'),'running');const count=Number(await canvas.getAttribute('data-spark-count'));assert.ok(count>=1);report.firstCount=count;
 await pause.click();const elapsed=await host.getAttribute('data-elapsed');await p.waitForTimeout(800);assert.equal(await host.getAttribute('data-elapsed'),elapsed);assert.equal(Number(await canvas.getAttribute('data-spark-count')),count);
 await p.getByRole('button',{name:'继续游戏',exact:true}).click();await p.waitForTimeout(4000);report.resumedCount=Number(await canvas.getAttribute('data-spark-count'));assert.ok(report.resumedCount>count);
 await pause.click();await p.getByRole('button',{name:'关闭声音',exact:true}).click();await p.getByRole('button',{name:'继续游戏',exact:true}).click();await p.waitForTimeout(4400);assert.equal(Number(await canvas.getAttribute('data-spark-count')),report.resumedCount);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';console.log(report);
}catch(e){report.status='failed';report.error=String(e.stack??e);console.error(e);process.exitCode=1;}finally{await b.close();report.closed=true;fs.writeFileSync(path.join(out,'audio.json'),JSON.stringify(report,null,2));}
