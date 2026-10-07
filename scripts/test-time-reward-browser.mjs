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
const out = path.resolve(root, process.env.TIME_REWARD_TEST_OUTPUT ?? 'outputs/time-reward-verification'); fs.mkdirSync(out, { recursive: true });
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

   let best=0;
   for(const rating of width===390?[1,2,3,2]:[2]) {
    await packItems(pack.rules.inventory.required);
    const target=rating===1?44000:rating===2?32000:0;
    const elapsed=Number(await game.getAttribute('data-elapsed'));
    if(target>elapsed)await tick(target-elapsed);
    // Pause does not consume rating time even with a packed bag.
    const before=Number(await game.getAttribute('data-elapsed'));
    await game.getByRole('button',{name:'暂停',exact:true}).click();await tick(5000);
    assert.equal(Number(await game.getAttribute('data-elapsed')),before);
    await page.keyboard.press('Escape');await tick(100);
    await tap('bag');await tick(100);await depart.click();
    const stop=Number(await game.getAttribute('data-elapsed'));
    await tick(7500);await page.getByTestId('settlement-reward').waitFor();
    const card=page.locator('.painted-settlement-card');
    assert.equal(Number(await card.getAttribute('data-rating')),rating);
    const scoreMs=Number(await card.getAttribute('data-score-ms'));
    assert(Math.abs(scoreMs-stop)<100,'ending animation excluded');
    assert.equal(await card.locator('.painted-settlement-reward > .garden-flower').count(),rating);
    const reward=Math.max(0,rating-best);best=Math.max(best,rating);
    assert.equal((await saved())['flood-kit'],best);
    assert.match(await page.getByTestId('settlement-reward').innerText(),reward?new RegExp('\\+'+reward+' 朵'): /不重复发放/);
    const text=await page.getByTestId('settlement-time-rating').innerText();assert(text.includes('本次 '+rating+' 朵'));assert(text.includes('≤25秒：3朵'));
    await shot('rating-'+rating+'-best-'+best);
    assert(await card.evaluate(el=>el.getBoundingClientRect().width<=innerWidth));
    await page.getByTestId('settlement-primary').scrollIntoViewIfNeeded();
    await page.getByTestId('settlement-primary').click();await tick(14000);
    await enter();await game.waitFor();await tick(1200);await page.waitForTimeout(500);
    pass(width+'x'+height+': rating '+rating+', delta '+reward+', best '+best+'; correct flowers, pause and ending excluded');
   }
   await tick(51000);await page.getByTestId('failure-title').waitFor();assert.equal((await saved())['flood-kit'],best);
   pass(width+'x'+height+': failed replay leaves best intact');
  } finally { await context.close(); }
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';
} catch(error){report.status='failed';report.failure=error.stack;throw error;}
finally{if(browser){await browser.close();report.browserClosed=true;}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
