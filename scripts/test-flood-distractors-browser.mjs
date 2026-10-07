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
const out = path.resolve(root, process.env.FLOOD_INVENTORY_TEST_OUTPUT ?? 'outputs/inventory-verification'); fs.mkdirSync(out, { recursive: true });
const pack = { rules: JSON.parse(fs.readFileSync(path.join(root, 'content/levels/flood-kit/level.json'))), skin: JSON.parse(fs.readFileSync(path.join(root, 'content/levels/flood-kit/skins/paperbook.json'))) };
const report = { html, sha256: createHash('sha256').update(fs.readFileSync(html)).digest('hex'), checks: [], errors: [], network: [], browserClosed: false, physicalDevice: 'not_run', humanListening: 'not_run' };
const pass = name => { report.checks.push(name); console.log('PASS ' + name); };
let browser;
try {
 browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--mute-audio'] });
 for (const [width, height] of [[390,844],[320,568],[1280,900]]) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: width < 600, reducedMotion: width === 390 ? 'no-preference' : 'reduce' });
  try {
   await context.route(/^https?:/, route => { report.network.push(route.request().url()); return route.abort(); });
   const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => report.errors.push(error.message));
   await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 120000 });
   await page.locator('[data-home-unlock-all]').click();
   const home = await page.locator('[data-home-continue]').evaluate(button => { const b=button.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2; return {x,y,hit:document.elementFromPoint(x,y)?.closest('button')===button}; });
   assert(home.hit); await page.mouse.click(home.x, home.y);
   await page.locator('[data-map-fan-toggle]').click(); await page.locator('[data-island="nature"]').click(); await page.locator('[data-archipelago]').waitFor({state:'detached'});
   const enter = async () => { const node=page.locator('[data-map-node="flood-kit"]'); await node.scrollIntoViewIfNeeded(); await node.click(); await page.locator('[data-painted-primary]').click(); };
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
   await tick(200);await shot('01-table');
   // Clicking the real bag inspects rather than charging a miss; checking keeps the clock running.
   let before=Number(await game.getAttribute('data-elapsed'));await tap('bag');await tick(100);await panel.waitFor();
   assert.equal(await game.getAttribute('data-action'),'');assert(Number(await game.getAttribute('data-elapsed'))-before<500);assert(await depart.isDisabled());
   before=Number(await game.getAttribute('data-elapsed'));await tick(1000);assert(Number(await game.getAttribute('data-elapsed'))>=before+900);
   assert.equal(await panel.locator('[data-inventory-slot]').count(),5);await shot('02-empty-bag');await closeBag();
   // A correct item can also be taken out; checking/removal never writes a score.
   await packItems(['water']);await tap('bag');await tick(32);
   const remove=panel.getByRole('button',{name:'取出饮用水'});
   if(width===320){await remove.focus();await remove.press('Enter');}else await remove.click();
   await tick(32);assert.deepEqual(await contents(),[]);assert.equal(await game.getAttribute('data-resolved'),'');assert.deepEqual(await saved(),{});await closeBag();
   const bad=width===1280?['water','food','torch','tv-remote','ceramic-ornament']:['water','food','torch','radio',width===320?'ceramic-ornament':'tv-remote'];
   await packItems(bad);assert.equal(await game.getAttribute('data-phase'),'playing');assert.deepEqual(await saved(),{});
   before=Number(await game.getAttribute('data-elapsed'));await tap('whistle');await tick(32);assert.deepEqual(await contents(),bad);assert.match(await game.locator('.configured-notice').innerText(),/背包已满/);assert(Number(await game.getAttribute('data-elapsed'))-before<500);
   await tap('bag');await tick(100);assert(!(await depart.isDisabled()));
   assert.deepEqual(await panel.locator('[data-inventory-slot]').evaluateAll(nodes=>nodes.map(n=>n.dataset.item)),bad);
   for(const button of await panel.locator('button').all()){const b=await button.boundingBox();assert(b.height>=44&&b.width>=44&&b.x>=0&&b.x+b.width<=width&&b.y+b.height<=height,'drawer controls stay visible and touch-sized');}
   assert(await panel.locator('img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0)));
   await shot('03-mixed-full');await depart.click();await tick(300);await page.getByTestId('failure-title').waitFor();
   assert.equal(await page.locator('[data-failure-kind="wrong-inventory"]').count(),1);assert.match(await page.locator('.painted-failure-card').innerText(),/不需要的物品/);assert.match(await page.locator('.painted-failure-card').innerText(),/还缺/);assert.deepEqual(await saved(),{});await tick(1500);await page.waitForTimeout(800);await shot('04-wrong-departure');
   await retry();
   // Fill with a wrong fifth item, inspect, replace, and explicitly depart with the right five.
   await packItems(['water','food','torch','radio','ceramic-ornament']);await tap('bag');await tick(100);
   await panel.getByRole('button',{name:'取出陶瓷装饰摆件'}).click();await tick(32);assert.equal((await contents()).length,4);assert(await depart.isDisabled());await closeBag();
   await packItems(['whistle']);assert.equal(await game.getAttribute('data-phase'),'playing');assert.deepEqual(await saved(),{});
   await tap('bag');await tick(100);await shot('05-correct-full');
   before=Number(await game.getAttribute('data-elapsed'));await game.getByRole('button',{name:'暂停',exact:true}).click();await tick(2500);assert.equal(Number(await game.getAttribute('data-elapsed')),before);await page.keyboard.press('Escape');await tick(100);
   await depart.click();await tick(7500);await page.getByTestId('settlement-reward').waitFor();assert.equal((await saved())['flood-kit'],3);await shot('06-success');
   pass(`${width}x${height}: actual bag opens; 5 slots; capacity enforced; inspect/remove/repack; wrong departure fails with 0 flowers; corrected departure awards 3; pause and keyboard work`);
   if(width===390){
    await page.getByTestId('settlement-primary').click();await tick(14000);await enter();await game.waitFor();await tick(1200);await page.waitForTimeout(500);
    await packItems(pack.rules.inventory.required);await tap('bag');await tick(100);await depart.click();await tick(7500);await page.getByTestId('settlement-reward').waitFor();assert.equal((await saved())['flood-kit'],3);
    await page.getByTestId('settlement-primary').click();await tick(14000);await enter();await game.waitFor();await tick(1200);await page.waitForTimeout(500);
    await packItems(pack.rules.inventory.required);await tap('bag');await tick(100);await tick(51000-Number(await game.getAttribute('data-elapsed')));await page.getByTestId('failure-title').waitFor();
    assert.equal(await page.locator('[data-failure-kind="timeout"]').count(),1);assert.match(await page.locator('.painted-failure-card').innerText(),/还没有检查背包并确认出发/);assert.equal((await saved())['flood-kit'],3);await shot('07-full-but-timeout');await retry();
    pass('repeat success does not duplicate reward; a correct full bag still times out without departure; retry resets inventory');
   }
  } finally { await context.close(); }
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';
} catch(error){report.status='failed';report.failure=error.stack;throw error;}
finally{if(browser){await browser.close();report.browserClosed=true;}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
