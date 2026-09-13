import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const file=path.join(root,'outputs/本地离线版/小红花应急行动.html'),out=path.join(root,'docs/flower-journey/new-game-verification');
fs.mkdirSync(out,{recursive:true});
const report={status:'running',sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),checks:[],errors:[],network:[],browserClosed:false};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
const check=n=>{report.checks.push(n);console.log('PASS '+n);};
let p;
const bytes=()=>p.evaluate(()=>({board:localStorage.getItem('little-red-flower-leaderboard-v1'),locations:localStorage.getItem('little-red-flower-journey-location-v1')}));
const answer=async yes=>{p.once('dialog',async d=>{assert.equal(d.type(),'confirm');assert(d.message().includes('其他玩家'));report.confirmation=d.message();await(yes?d.accept():d.dismiss());});await p.locator('[data-home-start]').click();};
try{
 p=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 p.on('pageerror',e=>report.errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url());});
 await p.goto(pathToFileURL(file).href);await p.locator('[data-home-start]').waitFor();
 assert.equal(await p.locator('[data-home-start]').innerText(),'开始新游戏');
 // Controlled save fixture. Never uses or modifies the user's browser profile.
 const ids=JSON.parse(fs.readFileSync(path.join(root,'content/journey-map.json'),'utf8')).regions.flatMap(r=>r.nodes.map(n=>n.id));
 await p.evaluate(ids=>{
  const k='little-red-flower-leaderboard-v1',s=JSON.parse(localStorage.getItem(k));
  const a=s.players[0];a.name='重新出发';a.completed=Object.fromEntries(ids.slice(0,12).map((id,i)=>[id,i===11?2:3]));
  s.players.push({id:'other-player',name:'保留的玩家',region:'青岛',createdAt:2,completed:{'oil-fire':3,'charging-bedroom':3}});
  localStorage.setItem(k,JSON.stringify(s));localStorage.setItem('little-red-flower-journey-location-v1',JSON.stringify({[a.id]:{levelId:'clear-corridor',visitedAt:1},'other-player':{levelId:'charging-bedroom',visitedAt:2}}));
 },ids);
 await p.reload();await p.locator('[data-home-start]').waitFor();
 const before=await bytes(),saved=JSON.parse(before.board),id=saved.activePlayerId,other=saved.players[1];
 await answer(false);assert.deepEqual(await bytes(),before);assert(await p.locator('[data-title-screen]').isVisible());check('cancel new game preserves all save and bookmark bytes');
 await p.locator('[data-home-continue]').click();await p.locator('.garden-shell').waitFor();assert.equal(await p.locator('[data-wallet]').innerText(),'35');
 await p.getByRole('button',{name:'返回游戏首页',exact:true}).click();check('continue retains 35 flowers');
 // Simulate another tab switching the active player after the title was rendered.
 await p.evaluate(()=>{const k='little-red-flower-leaderboard-v1',s=JSON.parse(localStorage.getItem(k));s.activePlayerId='other-player';localStorage.setItem(k,JSON.stringify(s));});
 const switched=await bytes();await answer(true);await p.getByRole('alert').waitFor();assert.deepEqual(await bytes(),switched);assert(await p.locator('[data-title-screen]').isVisible());check('stale-player reset is rejected and remains on title with an error');
 await p.evaluate(id=>{const k='little-red-flower-leaderboard-v1',s=JSON.parse(localStorage.getItem(k));s.activePlayerId=id;localStorage.setItem(k,JSON.stringify(s));},id);
 await p.reload();await p.locator('[data-home-start]').waitFor();
 await answer(true);await p.locator('.garden-shell').waitFor();
 assert.equal(await p.locator('[data-wallet]').innerText(),'0');
 assert.equal(await p.locator('[data-status="completed"]').count(),0);
 assert.equal(await p.locator('[data-map-node="flood-kit"]').getAttribute('data-status'),'locked');
 assert.equal(await p.locator('[data-map-node="typhoon-home"]').getAttribute('data-status'),'available');
 const after=await bytes(),state=JSON.parse(after.board),locations=JSON.parse(after.locations);
 assert.deepEqual(state.players.find(x=>x.id===id),{...saved.players[0],completed:{}});
 assert.deepEqual(state.players.find(x=>x.id==='other-player'),other);
 assert.equal(locations[id].levelId,'typhoon-home');assert.deepEqual(locations['other-player'],JSON.parse(before.locations)['other-player']);
 await p.screenshot({path:path.join(out,'new-game-map.png')});
 check('confirmed new game clears current flowers, completion and locks; returns to first node');
 check('other player and bookmark unchanged; current profile retained');
 await p.reload();await p.locator('[data-home-continue]').click();await p.locator('.garden-shell').waitFor();assert.equal(await p.locator('[data-wallet]').innerText(),'0');assert.deepEqual(JSON.parse((await bytes()).board),state);check('new zero-progress save survives reload and continue');
 await p.getByRole('button',{name:'返回游戏首页',exact:true}).click();
 await p.locator('.title-board').click();await p.getByRole('button',{name:'切换为 保留的玩家',exact:true}).click();await p.getByRole('button',{name:'返回关卡首页',exact:true}).click();await p.locator('[data-home-continue]').click();await p.locator('.garden-shell').waitFor();assert.equal(await p.locator('[data-wallet]').innerText(),'6');check('other player still continues their own six-flower game');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';
}catch(e){report.failure=e.stack;report.status='failed';process.exitCode=1;console.error(e);await p?.screenshot({path:path.join(out,'FAIL.png')}).catch(()=>{});}
finally{await browser.close();report.browserClosed=true;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
