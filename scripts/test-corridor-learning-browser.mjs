import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { dependency, root } from './lib/dependencies.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'playwright');
const html=path.resolve(root,process.argv[2]??'outputs/本地离线版/小红花应急行动.html');
const out=path.join(root,'outputs/corridor-learning-verification');fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'corridor-runtime-')),runtime=path.join(temp,'runtime.mjs');
await dependency('esbuild').build({stdin:{contents:"export * as scene from './app/game/runtime/scene'; export {createRun} from './app/game/runtime/engine';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:runtime,logLevel:'silent'});
const rt=await import(pathToFileURL(runtime));
const pack={rules:JSON.parse(fs.readFileSync(path.join(root,'content/levels/clear-corridor/level.json'))),skin:JSON.parse(fs.readFileSync(path.join(root,'content/levels/clear-corridor/skins/paperbook.json')))};
const report={html,sha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),checks:[],errors:[],network:[],browserClosed:false,physicalDevice:'not_run',humanListening:'not_run'};
let browser;
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
 for(const [width,height] of [[390,844],[320,568],[1280,900]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',hasTouch:true,isMobile:width<600});
  try{
   await context.route(/^https?:/,r=>{report.network.push(r.request().url());return r.abort();});
   const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
   await page.goto(pathToFileURL(html).href,{waitUntil:'load',timeout:120000});
   await page.locator('[data-home-unlock-all]').click();await page.locator('[data-home-continue]').click();
   await page.locator('[data-map-fan-toggle]').click();await page.locator('[data-island="public"]').click();await page.locator('[data-archipelago]').waitFor({state:'detached'});
   const node=page.locator('[data-map-node="clear-corridor"]');await node.scrollIntoViewIfNeeded();await node.click();await page.locator('[data-painted-primary]').click();
   const game=page.locator('.configured-player[data-level="clear-corridor"][data-ready="true"]');await game.waitFor();
   await page.clock.install();await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+100)));
   const tick=ms=>page.clock.runFor(ms);
   const canvas=game.locator('canvas'),controls=game.locator('[data-collection-controls]');
   const saved=()=>page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1'));return s.players.find(p=>p.id===s.activePlayerId).completed;});
   const screen=async p=>{const b=await canvas.boundingBox(),c=rt.scene.cameraFor(pack,b.width,b.height);return{x:b.x+c.x+p.x*c.scale,y:b.y+c.y+p.y*c.scale};};
   const pointFor=async id=>{
    const p=pack.skin.poses[id],a=pack.skin.assets[p.asset],{data,info}=await dependency('sharp')(path.join(root,'public',a.src.slice(1))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const bounds=await canvas.boundingBox(),camera=rt.scene.cameraFor(pack,bounds.width,bounds.height);
    const project=p=>({x:bounds.x+camera.x+p.x*camera.scale,y:bounds.y+camera.y+p.y*camera.scale});
    const candidates=[];for(let y=Math.floor(info.height*.2);y<info.height*.85;y+=12)for(let x=Math.floor(info.width*.2);x<info.width*.85;x+=12){if(data[(y*info.width+x)*4+3]>200)candidates.push(project({x:p.x+x/info.width*p.w,y:p.y+y/info.height*p.h}));}
    const result=await page.evaluate(points=>points.find(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS'),candidates);assert(result,`${id} has visible tappable artwork`);return result;
   };
   const select=async id=>{const p=await pointFor(id);if(width<600)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);await tick(32);assert.equal(await game.getAttribute('data-selected'),id);};
   const dropButton=async(id,target)=>{await select(id);await game.locator(`[data-collection-destination="${target}"]`).click();await tick(target==='storage'?1100:800);};
   await tick(200);await page.screenshot({path:path.join(out,`start-${width}x${height}.png`)});
   assert.equal(await game.locator('[data-check-route]').count(),0);assert.deepEqual(await saved(),{});
   await select('box');
   for(const button of await controls.locator('button').all()){const b=await button.boundingBox();assert(b.height>=44&&b.x>=0&&b.x+b.width<=width&&b.y+b.height<=height);}
   const painted = await controls.evaluate(element => ({
    style: element.dataset.uiStyle,
    paper: getComputedStyle(element).backgroundImage,
    buttons: [...element.querySelectorAll('button')].map(button => ({
     art: getComputedStyle(button).backgroundImage,
     font: getComputedStyle(button).fontFamily,
     fits: button.scrollWidth <= button.clientWidth && button.scrollHeight <= button.clientHeight,
    })),
   }));
   assert.equal(painted.style, 'painted');
   assert(painted.paper.includes(fs.readFileSync(path.join(root,'public/ui/pause-v1/paper.webp')).toString('base64')), 'original paper is embedded');
   for (const button of painted.buttons) {
    assert(button.art.includes(fs.readFileSync(path.join(root,'public/ui/painted-v1/modal-button-v2.webp')).toString('base64')), 'original gold button is embedded');
    assert(button.fits, 'button labels do not overflow');
   }
   assert.equal(new Set(painted.buttons.map(button => button.art)).size, 1, 'choices have equal visual emphasis');
   const panelBounds = await controls.boundingBox(), hudBounds = await game.locator('.configured-hud').boundingBox();
   assert(panelBounds.y >= hudBounds.y + hudBounds.height, 'panel does not overlap original HUD');
   for (const id of ['box','chair','case','scooter']) await pointFor(id);
   pass(width+'x'+height+': original paper/gold art; 44px controls; labels fit; HUD and all objects remain reachable');
   await page.screenshot({path:path.join(out,`choose-${width}x${height}.png`)});
   await game.locator('[data-collection-destination="corner"]').click();await tick(350);await page.screenshot({path:path.join(out,`wrong-${width}x${height}.png`)});await tick(500);
   assert.match(await controls.innerText(),/换个角落/);assert.equal(await game.getAttribute('data-resolved'),'');assert.deepEqual(await saved(),{});
   await dropButton('box','fire-access');assert.match(await controls.innerText(),/消防设施/);
   await dropButton('box','storage');
   // Drag using painted pixels, not fabricated run state.
   const chair=await pointFor('chair'),storage=await screen({x:635,y:735});
   await page.mouse.move(chair.x,chair.y);await page.mouse.down();await page.mouse.move(storage.x,storage.y,{steps:12});await page.mouse.up();await tick(1100);
   assert((await game.getAttribute('data-resolved')).includes('chair-stored'));
   // Two-tap in-scene destination is equivalent to a physical drag.
   await select('case');await page.mouse.click(storage.x,storage.y);await tick(1100);
   assert((await game.getAttribute('data-resolved')).includes('case-stored'));
   if(width===320){
    const item=game.locator('.configured-keyboard').getByRole('button',{name:'玩具滑板车',exact:true});await item.focus();await item.press('Enter');
    const destination=game.locator('.configured-keyboard').getByRole('button',{name:'放到 自家储物间',exact:true});await destination.focus();await destination.press('Enter');await tick(1100);
   }else await dropButton('scooter','storage');
   assert.equal((await game.getAttribute('data-resolved')).split(',').length,4);assert.equal(await game.getAttribute('data-phase'),'playing');assert.deepEqual(await saved(),{});
   await page.screenshot({path:path.join(out,`ready-to-check-${width}x${height}.png`)});
   await game.locator('[data-check-route]').click();await tick(1800);assert.equal(await game.locator('[data-route-check]').count(),1);assert.deepEqual(await saved(),{});
   await page.screenshot({path:path.join(out,`inspection-${width}x${height}.png`)});
   const elapsed=await game.getAttribute('data-elapsed');await game.getByRole('button',{name:'暂停',exact:true}).click();await tick(2500);assert.equal(await game.getAttribute('data-elapsed'),elapsed);await page.keyboard.press('Escape');
   await tick(7000);await page.locator('[data-testid="settlement-reward"]').waitFor();assert.equal((await saved())['clear-corridor'],3);
   await page.screenshot({path:path.join(out,`success-${width}x${height}.png`)});
   pass(`${width}x${height}: wrong choices recover; actual drag and two-tap work; four props alone do not reward; inspection pauses and awards 3`);
   if(width===390){
    await page.locator('[data-testid="settlement-primary"]').click();await tick(14000);await page.locator('[data-map-node="clear-corridor"]').click();await page.locator('[data-painted-primary]').click();await tick(200);await game.waitFor();
    for(const id of ['box','chair','case','scooter'])await dropButton(id,'storage');await game.locator('[data-check-route]').click();await tick(8000);await page.locator('[data-testid="settlement-reward"]').waitFor();assert.equal((await saved())['clear-corridor'],3);
    pass('replay retains exactly 3 flowers, never duplicates the first-completion reward');
    await page.locator('[data-testid="settlement-primary"]').click();await tick(1000);await page.locator('[data-map-node="clear-corridor"]').click();await page.locator('[data-painted-primary]').click();await tick(200);await game.waitFor();
    await tick(51000);await page.locator('[data-testid="failure-title"]').waitFor();assert.equal((await saved())['clear-corridor'],3);
    await page.locator('[data-testid="failure-retry"]').click();await tick(100);assert.equal(await game.getAttribute('data-resolved'),'');assert.equal(await game.getAttribute('data-phase'),'playing');
    assert.equal((await saved())['clear-corridor'],3);pass('timeout preserves previous score; retry starts a fresh sortable scene');
   }
  }finally{await context.close();}
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;throw error;}
finally{if(browser){await browser.close();report.browserClosed=true;}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));fs.unlinkSync(runtime);fs.rmdirSync(temp);}