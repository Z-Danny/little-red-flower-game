/** Final-HTML inventory acceptance. Disposable profiles, real pointer/keyboard input, no injected progress. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dependency, root } from './lib/dependencies.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const html = path.resolve(root, process.argv[2] ?? 'outputs/本地离线版/小红花应急行动.html');
const out = path.resolve(root, process.env.SAVE_BACKUP_TEST_OUTPUT ?? 'outputs/save-backup-verification'); fs.mkdirSync(out, { recursive: true });
const pack = { rules: JSON.parse(fs.readFileSync(path.join(root, 'content/levels/flood-kit/level.json'))), skin: JSON.parse(fs.readFileSync(path.join(root, 'content/levels/flood-kit/skins/paperbook.json'))) };
const report = { html, sha256: createHash('sha256').update(fs.readFileSync(html)).digest('hex'), checks: [], errors: [], network: [], browserClosed: false, physicalDevice: 'not_run', humanListening: 'not_run' };
const pass = name => { report.checks.push(name); console.log('PASS ' + name); };
let browser;
try {
 browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--mute-audio'] });
 for (const [width, height, denied] of [[390,844,false],[320,568,false],[1280,900,false],[390,844,true]]) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: width < 600, reducedMotion: width === 390 ? 'no-preference' : 'reduce' });
  try {
   if(denied)await context.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='little-red-flower-leaderboard-v1')throw new DOMException('Test quota','QuotaExceededError');return set.call(this,key,value);};});
   await context.route(/^https?:/, route => { report.network.push(route.request().url()); return route.abort(); });
   const watchdog=setTimeout(()=>void context.close().catch(()=>{}),180000);watchdog.unref();
   const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => report.errors.push(error.message));
   await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 120000 });
   await page.locator('[data-home-unlock-all]').click();
   const home = await page.locator('[data-home-continue]').evaluate(button => { const b=button.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2; return {x,y,hit:document.elementFromPoint(x,y)?.closest('button')===button}; });
   assert(home.hit); await page.mouse.click(home.x, home.y);
   await page.locator('[data-map-fan-toggle]').click(); await page.locator('[data-island="nature"]').click(); await page.locator('[data-archipelago]').waitFor({state:'detached'});
   const enter = async () => { const node=page.locator('[data-map-node="flood-kit"]'); await node.scrollIntoViewIfNeeded(); await node.click(); assert.match(await page.locator('.painted-intro-note').innerText(),/≤25秒：3朵.*≤40秒：2朵/); await page.locator('[data-painted-primary]').click(); };
   await enter();
   const game = page.locator('.configured-player[data-level="flood-kit"][data-ready="true"]'); await game.waitFor(); await page.waitForTimeout(1600);
   await page.clock.install(); await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+100)));
   const tick = ms => page.clock.runFor(ms), shot = name => page.screenshot({path:path.join(out,`${width}-${name}.png`)});
   const saved = () => page.evaluate(()=>{const v=JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1'));return v.players.find(p=>p.id===v.activePlayerId).completed;});
   const contents = async () => (await game.getAttribute('data-inventory')).split(',').filter(Boolean);
   const pointFor = async id => {
    const pose=pack.skin.poses[id],asset=pack.skin.assets[pose.asset];
    const {data,info}=await dependency('sharp')(path.join(root,'public',asset.src.slice(1))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const b=await game.locator('canvas').boundingBox(),scale=Math.min(b.width/pack.skin.world.width,b.height/pack.skin.world.height);
    const origin={x:b.x+(b.width-pack.skin.world.width*scale)/2,y:b.y+(b.height-pack.skin.world.height*scale)/2};
    const points=[];for(let y=Math.floor(info.height*.25);y<info.height*.8;y+=8)for(let x=Math.floor(info.width*.25);x<info.width*.8;x+=8)if(data[(y*info.width+x)*4+3]>200)points.push({x:origin.x+(pose.x+x/info.width*pose.w)*scale,y:origin.y+(pose.y+y/info.height*pose.h)*scale});
    const center={x:origin.x+(pose.x+pose.w/2)*scale,y:origin.y+(pose.y+pose.h/2)*scale};points.sort((a,b)=>Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y));
    const hit=await page.evaluate(points=>points.find(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS'),points);assert(hit,id+' visible on canvas');return hit;
   };
   const tap = async id => { const p=await pointFor(id);await page.touchscreen.tap(p.x,p.y); };
   const packItems = async ids => { for(const id of ids){await tap(id);await tick(1200);assert((await contents()).includes(id),id+' committed');} };
   const panel=game.locator('[data-inventory-panel]'), depart=game.locator('[data-inventory-depart]');
   const closeBag = async () => { await panel.getByRole('button',{name:'收起背包'}).click(); await tick(32); };
   const retry = async () => { await page.getByTestId('failure-retry').click();await tick(1200);await page.waitForTimeout(500);assert.deepEqual(await contents(),[]);assert.equal(await panel.count(),0); };


   await packItems(pack.rules.inventory.required);await tap('bag');await tick(100);await depart.click();await tick(7500);
   await page.getByTestId('settlement-save-status').waitFor();
   assert.equal(await page.getByTestId('settlement-save-status').getAttribute('data-persistence'),denied?'session':'saved');
   await shot(denied?'session-only-settlement':'saved-settlement');
   let homePage;
   if(denied){
    await page.getByTestId('settlement-primary').click();await tick(14000);
    await page.getByRole('button',{name:'返回游戏首页',exact:true}).click();await page.clock.resume();homePage=page;
   } else {
    const before=await saved();assert.equal(before['flood-kit'],3);
    // Close the gameplay page completely; opening the same file reads persisted progress.
    await page.clock.resume();await page.close();homePage=await context.newPage();homePage.on('pageerror',e=>report.errors.push(e.message));
    await homePage.goto(pathToFileURL(html).href,{waitUntil:'load',timeout:120000});
    await homePage.locator('[data-home-continue]').waitFor();
    assert.equal(await homePage.locator('[data-home-continue]').getAttribute('class'),'title-primary');
    assert.deepEqual(await homePage.evaluate(()=>{const b=JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1'));return b.players.find(p=>p.id===b.activePlayerId).completed;}),before);
   }
   const clickStable=async locator=>{await locator.focus();await locator.press('Enter');};
   await homePage.locator('[data-home-save]').click();const manager=homePage.locator('.save-manager');await manager.waitFor();
   assert.equal(await manager.locator('[data-persistence]').getAttribute('data-persistence'),denied?'session':'saved');
   const download=homePage.waitForEvent('download');await manager.locator('[data-save-export]').click();const file=await download;assert.equal(await file.failure(),null);
   const text=fs.readFileSync(await file.path(),'utf8'),backup=JSON.parse(text);assert.equal(backup.player.completed['flood-kit'],3);assert.equal(backup.player.allLevelsUnlocked,true);
   assert(!('id' in backup.player));
   const original=denied?null:await homePage.evaluate(()=>localStorage.getItem('little-red-flower-leaderboard-v1'));
   const input=manager.getByLabel('选择小红花存档文件');
   await input.setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('not JSON')});await manager.getByRole('alert').filter({hasText:'无法读取'}).waitFor();
   assert.equal(await manager.locator('[data-save-preview]').count(),0);
   await input.setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(text)});await manager.locator('[data-save-preview]').waitFor();
   await manager.getByRole('button',{name:'取消导入',exact:true}).click();assert.equal(await manager.locator('[data-save-preview]').count(),0);
   if(!denied)assert.equal(await homePage.evaluate(()=>localStorage.getItem('little-red-flower-leaderboard-v1')),original);
   await input.setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(text)});await manager.locator('[data-save-preview]').waitFor();
   await homePage.screenshot({path:path.join(out,width+'-'+denied+'-import-preview.png')});
   const confirm=manager.locator('[data-save-confirm]');await confirm.scrollIntoViewIfNeeded();await confirm.click();
   await manager.locator('[data-save-message]').filter({hasText:'已导入为新的本机玩家'}).waitFor();
   assert.equal(await manager.locator('[data-persistence]').getAttribute('data-persistence'),denied?'session':'saved');
   if(!denied){
    const after=await homePage.evaluate(()=>JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1')));const old=JSON.parse(original);
    assert.equal(after.players.length,old.players.length+1);assert.deepEqual(after.players.slice(0,-1),old.players);assert.notEqual(after.activePlayerId,old.activePlayerId);
    assert.deepEqual(after.players.at(-1).completed,backup.player.completed);
   }
   await manager.getByRole('button',{name:'关闭',exact:true}).click();
   await homePage.screenshot({path:path.join(out,width+'-'+denied+'-home-restored.png')});
   // Continue after import never routes through reset/new-game confirmation.
   homePage.on('dialog',dialog=>{report.errors.push('unexpected dialog '+dialog.message());void dialog.dismiss();});
   await clickStable(homePage.locator('[data-home-continue]'));await homePage.locator('[data-journey-map]').waitFor({timeout:6000}).catch(async error=>{console.log(await homePage.evaluate(()=>({title:document.querySelector('[data-title-screen]')?.outerHTML.slice(-2000),body:document.body.innerText.slice(-2500)})));await homePage.screenshot({path:path.join(out,'continue-debug.png')});throw error;});
   await homePage.locator('[data-map-settings]').click();await homePage.getByRole('button',{name:'存档管理 / 导入导出',exact:true}).click();await homePage.locator('.save-manager').waitFor();
   pass(width+'x'+height+(denied?' denied storage':'')+': completed progress '+(denied?'honestly session-only':'survives closed page')+'; JSON download, invalid reject, cancel unchanged, import new player, old save retained, continue works');
  } finally { await context.close(); }
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';
} catch(error){report.status='failed';report.failure=error.stack;throw error;}
finally{if(browser){await browser.close();report.browserClosed=true;}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
