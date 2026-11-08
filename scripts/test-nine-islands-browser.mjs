/** Final HTML: isolated offline/muted browser, guaranteed cleanup, no user profile. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(path.dirname(process.execPath), 'node_modules/playwright'));
const html = path.join(root, 'outputs/本地离线版/小红花应急行动.html');
const output = path.join(root, 'outputs/nine-islands-original-verification');
fs.mkdirSync(output, { recursive: true });
const ids = ['campus','home','traffic','water','network','emergency','social','food','outdoor'];
const report = { status:'running', html, sha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'), checks:[], errors:[], failedRequests:[], externalRequests:[], physicalDevice:'not_run', humanAudio:'not_run', browserClosed:false, contextClosed:false };
let browser, context;
try {
  browser = await chromium.launch({ executablePath:process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true, args:['--mute-audio'] });
  context = await browser.newContext({viewport:{width:390,height:844}, reducedMotion:'reduce', offline:true, hasTouch:true});
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('requestfailed', r => report.failedRequests.push(r.failure()?.errorText));
  page.on('request', r => { if (/^https?:/.test(r.url())) report.externalRequests.push(r.url()); });
  await page.goto(pathToFileURL(html).href, {waitUntil:'load',timeout:120000});
  await page.locator('[data-home-start]:enabled').click();
  await page.locator('[data-archipelago]:not([aria-hidden])').waitFor();
  report.checks.push({name:'start game opens island picker directly, no legacy map click'});
  const current = () => page.locator('[data-archipelago]').getAttribute('data-current-category');
  const select = async id => {
    const index = ids.indexOf(await current()), target = ids.indexOf(id);
    for (let n=0;n<Math.abs(target-index);n++) await page.keyboard.press(target>index?'ArrowRight':'ArrowLeft');
    await page.waitForFunction(id=>document.querySelector('[data-archipelago]').dataset.currentCategory===id,id);
  };
  const originalMap = JSON.parse(fs.readFileSync(path.join(root,'content/journey-map.json'),'utf8'));
  const chooseSource = async levelId => {
    const region=originalMap.regions.find(r=>r.nodes.some(n=>n.id===levelId));
    const tab=page.locator(`[data-island-scene-tab="${region.id}"]`);
    if(await tab.count()) await tab.click();
  };
  const island = id => page.locator(`[data-island="${id}"]`);
  const saved = () => page.evaluate(() => localStorage.getItem('little-red-flower-leaderboard-v1'));
  const before = await saved();
  assert.equal(await page.locator('[data-island]').count(),9);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('[data-island-art]')].map(img=>img.decode()));});
  assert.equal(await page.locator('.archipelago-details,.archipelago-controls,.archipelago-footer,.archipelago-dots,[data-island-explore]').count(),0);
  for (const viewport of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390},{width:1440,height:900}]) {
    await page.setViewportSize(viewport); await select('home'); await page.waitForTimeout(100);
    const geometry = await page.evaluate(()=>{
      const root=document.querySelector('[data-archipelago]').getBoundingClientRect();
      const island=document.querySelector('[data-island][data-selected="true"]').getBoundingClientRect();
      const header=document.querySelector('.archipelago-header').getBoundingClientRect();
      return {width:root.width,height:root.height,ratio:root.width/root.height,frameInside:root.x>=-1&&root.y>=-1&&root.right<=innerWidth+1&&root.bottom<=innerHeight+1,
        islandInside:island.left>=root.left-1&&island.right<=root.right+1&&island.top>=header.bottom&&island.bottom<=root.bottom,
        noPageOverflow:document.documentElement.scrollWidth<=innerWidth};
    });
    assert(Math.abs(geometry.ratio-9/16)<0.002,JSON.stringify(geometry));
    assert(geometry.frameInside&&geometry.islandInside&&geometry.noPageOverflow,JSON.stringify({viewport,geometry}));
    await page.locator('#archipelago-title').click();
    if(viewport.width===390) await page.locator('[data-archipelago]').screenshot({path:path.join(output,'portrait-9x16.png'),animations:'disabled'});
    await page.screenshot({path:path.join(output,`${viewport.width}x${viewport.height}.png`),animations:'disabled'});
    report.checks.push({name:'strict portrait 9:16 and no lower UI',viewport,geometry});
    const imageWidth = await island('home').evaluate(el=>el.getBoundingClientRect().width);
    assert(Math.abs(imageWidth / geometry.width - .7) < .02, 'island reduced from 90% to 70%');
    await island('home').click();
    await page.locator('[data-island-levels="home"]').waitFor();
    const fullPage = await page.locator('[data-island-levels]').boundingBox();
    assert(Math.abs(fullPage.height-geometry.height)<2,'level selection must occupy entire frame');
    assert(await page.locator('[data-island-levels] .garden-sign-texture').first().evaluate(img=>img.complete&&img.naturalWidth>0));
    await chooseSource('first-aid-burn');
    await page.locator('[data-island-level="first-aid-burn"]').scrollIntoViewIfNeeded();
    assert(await page.locator('[data-island-level="first-aid-burn"]').isVisible());
    await chooseSource('oil-fire');
    await page.waitForTimeout(120);
    await page.locator('#island-levels-title').click();
    await page.screenshot({path:path.join(output,`levels-${viewport.width}x${viewport.height}.png`),animations:'disabled'});
    if(viewport.width===390) await page.locator('[data-island-levels]').screenshot({path:path.join(output,'level-selection-portrait.png'),animations:'disabled'});
    await page.locator('[data-levels-close]').click();
  }
  await page.setViewportSize({width:390,height:844});
  for (const id of ids) {
    await select(id); await island(id).click();
    await page.locator(`[data-island-levels="${id}"]`).waitFor();
    const levels=[];
    const tabs=await page.locator('[data-island-scene-tab]').evaluateAll(elements=>elements.map(e=>e.dataset.islandSceneTab));
    for (const source of tabs.length?tabs:[await page.locator('[data-island-levels]').getAttribute('data-original-scene')]) {
      if(!source) continue;
      if(tabs.length) await page.locator(`[data-island-scene-tab="${source}"]`).click();
      const original=originalMap.regions.find(r=>r.id===source);
      const nodes=await page.locator('[data-island-level]').evaluateAll(elements=>elements.map(e=>({id:e.dataset.islandLevel,left:parseFloat(e.style.left),top:parseFloat(e.style.top)})));
      for(const node of nodes){
        const old=original.nodes.find(n=>n.id===node.id);
        assert(old);assert(Math.abs(node.left-old.x/original.width*100)<.01);assert(Math.abs(node.top-old.y/original.height*100)<.01);
        levels.push(node.id);
      }
      const dimensions=await page.locator('[data-island-levels] .garden-world').boundingBox();
      assert(Math.abs(dimensions.width/dimensions.height-original.width/original.height)<.002);
      const edges=await page.locator('[data-island-levels] [data-route-from]').evaluateAll(es=>es.map(e=>[e.dataset.routeFrom,e.dataset.routeTo]));
      for(const [from,to] of edges){const i=original.nodes.findIndex(n=>n.id===from);assert.equal(original.nodes[i+1]?.id,to,'only retain original adjacent routes');}
    }
    if(['network','food'].includes(id)) {assert.equal(levels.length,0);assert(await page.locator('[data-island-empty]').isVisible());}
    report.checks.push({name:'direct island click opens levels or explicit empty state',id,levels});
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.island),id);
  }
  // Choose the visible portion of the neighboring island, not its offscreen center.
  await select('home');
  const point=await island('traffic').evaluate(button=>{
    const b=button.getBoundingClientRect(), f=document.querySelector('[data-archipelago]').getBoundingClientRect();
    for(let y=Math.max(b.top,f.top)+4;y<Math.min(b.bottom,f.bottom)-4;y+=5) for(let x=Math.max(b.left,f.left)+4;x<Math.min(b.right,f.right)-4;x+=5)
      if(button.contains(document.elementFromPoint(x,y))) return {x,y};
    return null;
  });
  assert(point,'neighbor must have a clickable visible portion');
  await page.mouse.click(point.x,point.y); assert.equal(await current(),'traffic');
  await page.locator('[data-island-levels="traffic"]').waitFor();
  await page.locator('[data-levels-close]').click();
  report.checks.push({name:'click neighboring island directly enters its full-page level selector',point});
  const pose=()=>island('traffic').evaluate(button=>{
    const slot=button.parentElement, arm=slot.parentElement, b=slot.getBoundingClientRect(),hub=arm.getBoundingClientRect();
    const radius=parseFloat(getComputedStyle(slot).top), x=b.x+b.width/2-hub.x, y=b.y+b.height/2-hub.y;
    return {x,y,radius,error:Math.abs(Math.hypot(x,y)-radius)};
  });
  const area=await page.locator('.archipelago-carousel').boundingBox();
  const p0=await pose();
  await page.mouse.move(area.x+area.width*.75,area.y+area.height*.48);await page.mouse.down();
  await page.mouse.move(area.x+area.width*.5,area.y+area.height*.48,{steps:6});const p1=await pose();
  await page.mouse.move(area.x+area.width*.25,area.y+area.height*.48,{steps:6});const p2=await pose();
  assert([p0,p1,p2].every(p=>p.error<2),JSON.stringify([p0,p1,p2]));
  assert(p1.y<p0.y-4&&p2.y<p1.y-4,'drag must rise along an arc, not a straight horizontal line');
  await page.screenshot({path:path.join(output,'arc-mid-drag.png'),animations:'disabled'});
  await page.mouse.up(); assert.equal(await current(),'water');
  assert.equal(await page.locator('[data-island-levels]').count(),0,'drag must not open a list');
  report.checks.push({name:'drag follows circle continuously, not a chord; no accidental click',poses:[p0,p1,p2]});
  const cdp=await context.newCDPSession(page);
  const touch=(x,y)=>[{x,y,id:1}];
  const y=area.y+area.height*.48;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(area.x+area.width*.8,y)});
  for(let t=.7;t>=.2;t-=.1)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch(area.x+area.width*t,y)});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(120);
  assert.equal(await current(),'network');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(area.x+area.width*.8,y)});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch(area.x+area.width*.4,y)});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(120);
  assert.equal(await current(),'network');
  assert.equal(await page.locator('.archipelago-track').getAttribute('data-dragging'),'false');
  await island('network').tap();await page.locator('[data-island-empty]').waitFor();await page.keyboard.press('Escape');
  report.checks.push({name:'real browser touch swipe, cancellation and tap'});
  await page.keyboard.press('Home');await page.keyboard.press('ArrowLeft');assert.equal(await current(),'campus');
  await page.keyboard.press('End');await page.keyboard.press('ArrowRight');assert.equal(await current(),'outdoor');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await select('traffic');await page.waitForTimeout(550);
  await page.keyboard.press('ArrowRight');await page.waitForTimeout(180);
  const animated=await pose();assert(animated.error<2,JSON.stringify(animated));
  await page.waitForTimeout(650);assert.equal(await current(),'water');
  await page.waitForTimeout(1200);assert.equal(await current(),'water','there must be no autoplay');
  report.checks.push({name:'animated snap follows the same arc; no autoplay; keyboard bounds',animated});
  assert.equal(await saved(),before);
  await select('emergency');await page.waitForTimeout(550);await island('emergency').click();
  await chooseSource('first-aid-aed');
  await page.locator('[data-island-level="first-aid-aed"]').click();
  await page.locator('[data-painted-intro][data-level-id="first-aid-aed"][data-locked="true"]').waitFor();
  assert(await page.locator('[data-painted-primary]').isDisabled());
  await page.keyboard.press('Escape');await page.locator('[data-painted-intro]').waitFor({state:'detached'});
  await page.locator('[data-island-levels="emergency"]').waitFor();
  assert.equal(await page.locator('[data-archipelago]').getAttribute('data-page'),'levels');
  await chooseSource('typhoon-home');
  await page.locator('[data-island-level="typhoon-home"]').click();
  await page.locator('[data-painted-intro][data-level-id="typhoon-home"]').waitFor();
  assert(await page.locator('[data-painted-primary]').isEnabled());await page.locator('[data-painted-primary]').click();
  await page.locator('.hunt-player,.typhoon-player').first().waitFor();
  assert.equal(await saved(),before);
  report.checks.push({name:'unchanged original level prerequisites, launch and scores'});
  await page.locator('.hunt-player [aria-label="返回关卡"]').click();
  await page.locator('[data-island-levels="emergency"]').waitFor();
  assert.equal(await page.locator('[data-archipelago]').getAttribute('data-page'),'levels');
  assert.equal(await page.locator('[data-archipelago]').getAttribute('inert'),null);
  await page.locator('[data-levels-close]').click();
  await page.locator('[data-carousel-close]').click();
  await page.locator('[data-home-start]:enabled').waitFor();
  await page.locator('[data-home-start]').click();
  await page.locator('[data-archipelago]:not([aria-hidden])').waitFor();
  assert.equal(await page.locator('[data-archipelago]').getAttribute('data-page'),'islands');
  assert.equal(await saved(),before);
  report.checks.push({name:'game returns to level selector; selector returns home; animated title entry opens islands again'});
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);assert.deepEqual(report.externalRequests,[]);
  report.status='passed';
} catch(error){report.status='failed';report.failure=error.stack;process.exitCode=1;}
finally{
  try{if(context){await context.close();report.contextClosed=true;}}
  finally{try{if(browser){await browser.close();report.browserClosed=true;}}finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));}}
}
console.log(JSON.stringify(report,null,2));
