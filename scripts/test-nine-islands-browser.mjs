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
const html = path.resolve(root, process.env.NINE_ISLANDS_HTML || 'outputs/本地离线版/小红花应急行动.html');
const output = path.resolve(root, process.env.NINE_ISLANDS_REPORT || 'outputs/nine-islands-corner-verification');
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
  const current = () => page.locator('[data-archipelago]').getAttribute('data-current-category');
  assert.equal(await current(),'campus','Start Game must select Campus Safety first');
  assert.equal(await page.locator('[data-island][data-selected="true"]').getAttribute('data-island'),ids[0]);
  const bottomGap=()=>page.locator('[data-island-level-scroll]').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop);
  await page.locator('[data-island-levels="campus"]').waitFor();
  assert.equal(await page.locator('[data-archipelago]').getAttribute('data-page'),'levels');
  assert(Math.abs(await bottomGap())<=2,'new games must show the bottom of the campus map');
  await page.locator('[data-island-levels="campus"]').screenshot({path:path.join(output,'campus-initial-bottom.png'),animations:'disabled'});
  report.checks.push({name:'Start Game opens Campus Safety directly, at the bottom of the first map'});
  await page.locator('[data-levels-close]').click();
  await page.locator('[data-archipelago][data-page="islands"]').waitFor();
  const select = async id => {
    const index = ids.indexOf(await current()), target = ids.indexOf(id);
    for (let n=0;n<Math.abs(target-index);n++) await page.keyboard.press(target>index?'ArrowRight':'ArrowLeft');
    await page.waitForFunction(id=>document.querySelector('[data-archipelago]').dataset.currentCategory===id,id);
  };
  const authoredMaps = JSON.parse(fs.readFileSync(path.join(root,'content/island-level-maps.json'),'utf8')).maps;
  const chooseSource = async levelId => {
    await page.locator(`[data-island-level="${levelId}"] .garden-node-label`).evaluate(sign => sign.scrollIntoView({block:'center',behavior:'instant'}));
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
    await page.locator('[data-island-level="oil-fire"] .garden-node-title').click();
    await page.locator('[data-painted-intro][data-level-id="oil-fire"]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('[data-painted-intro]').waitFor({state:'detached'});
    assert.equal(await page.locator('.island-level-header').count(),0,'yellow top header is removed');
    const chrome=await page.locator('[data-island-levels]').evaluate(root=>{
      const frame=root.getBoundingClientRect(), map=root.querySelector('.island-original-map').getBoundingClientRect();
      const button=root.querySelector('[data-levels-close]').getBoundingClientRect();
      const painting=[...root.querySelectorAll('.garden-world')].at(-1).getBoundingClientRect();
      return {paintedToBottom:painting.bottom>=frame.bottom-1,topInset:map.top-frame.top,leftInset:button.left-frame.left,bottomInset:frame.bottom-button.bottom,buttonWidth:button.width};
    });
    assert(Math.abs(chrome.topInset)<1,'map must extend to the top');
    assert(chrome.paintedToBottom,'do not introduce a blank navigation strip at the bottom');
    assert(chrome.leftInset<25&&chrome.bottomInset<40&&chrome.buttonWidth>=100,'original bottom-left map entrance');
    report.checks.push({name:'no top strip, original corner map entrance restored',viewport,chrome});
    await page.mouse.move(0,0);
    await page.locator('[data-levels-close]').evaluate(button=>button.blur());
    await page.screenshot({path:path.join(output,`levels-${viewport.width}x${viewport.height}.png`),animations:'disabled'});
    if(viewport.width===390) await page.locator('[data-island-levels]').screenshot({path:path.join(output,'level-selection-portrait.png'),animations:'disabled'});
    await page.locator('[data-levels-close]').click();
  }
  await page.setViewportSize({width:390,height:844});
  const seenLevels=new Set();
  for (const id of ids) {
    await select(id); await island(id).click();
    await page.locator(`[data-island-levels="${id}"]`).waitFor();
    assert(Math.abs(await bottomGap())<=2,`${id}: maps always open at the bottom`);
    assert.equal(await page.locator('.island-level-header').count(),0);
    assert(await page.locator('[data-levels-close] .map-fan-current-art').isVisible());
    const levels=[];
    assert.equal(await page.locator('[data-island-scene-tab]').count(),0,'bottom-right scene buttons removed');
    assert.equal(await page.locator('[data-island-levels] [data-map-corner-tools] button').count(),3);
    const map=authoredMaps.find(map=>map.id===id);
    const scene=page.locator(`[data-island-authored-scene="${id}"]`);
    assert.equal(await page.locator('[data-island-authored-scene]').count(),1);
    const image=scene.locator('.garden-map-art');
    assert.deepEqual(await image.evaluate(async img=>{await img.decode();return [img.naturalWidth,img.naturalHeight,img.src.startsWith('data:image/png;')];}),[map.width,map.height,true]);
    const dimensions=await scene.locator('.garden-world').boundingBox();
    assert(Math.abs(dimensions.width/dimensions.height-map.width/map.height)<.0001);
    assert.equal(await scene.locator('[data-route-from],.map-signal,.garden-location-fog').count(),0,'old coordinate overlays cannot be reused on new paintings');
    const stops=scene.locator('[data-island-level]');
    assert.deepEqual(await stops.evaluateAll(es=>es.map(e=>e.dataset.islandLevel)),map.stops.map(stop=>stop.id));
    const numbered=await stops.evaluateAll(es=>es.map(e=>({number:e.querySelector('.garden-node-number').textContent.trim(),y:parseFloat(e.style.top)})));
    assert.deepEqual(numbered.map(node=>node.number),map.stops.map((_,i)=>String(i+1).padStart(2,'0')));
    for(let i=1;i<numbered.length;i++)assert(numbered[i].y<=numbered[i-1].y,`${id}: numbering must run upward`);
    for(const item of map.stops) {
      assert(!seenLevels.has(item.id),'every stop appears exactly once across all islands');
      seenLevels.add(item.id);
      const stop=scene.locator(`[data-island-level="${item.id}"]`);
      const position=await stop.evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));
      assert(Math.abs(position.x-item.x/map.width*100)<.001 && Math.abs(position.y-item.y/map.height*100)<.001);
      await chooseSource(item.id);
      const sign=stop.locator('.garden-node-label');
      const bounds=await sign.boundingBox();
      assert(bounds.width>=72 && bounds.height>=44 && bounds.x>=0 && bounds.x+bounds.width<=390+1,`${item.id}: readable sign bounds`);
      await sign.click();
      const intro=page.locator(`[data-painted-intro][data-level-id="${item.id}"]`);
      await intro.waitFor();
      if(item.placeholder || await stop.getAttribute('data-preview-only')==='true'){
        assert.equal(await stop.getAttribute('data-status'),'locked');
        assert(await intro.locator('[data-painted-primary]').isDisabled());
      }
      if(item.placeholder){
        assert.match(await intro.locator('.painted-intro-description').textContent(),/地图预告/);
        assert.match(await sign.textContent(),/筹备中/);
      }
      await page.keyboard.press('Escape');
      await intro.waitFor({state:'detached'});
      assert.equal(await current(),id);
      levels.push(item.id);
    }
    await page.locator('[data-island-level-scroll]').evaluate(el=>el.scrollTop=el.scrollHeight);
    await page.locator('[data-island-levels]').screenshot({path:path.join(output,`${id}-map.png`),animations:'disabled'});
    assert.equal(await saved(),before);
    report.checks.push({name:'authored map uses surveyed coordinates; all entries open correct introductions; placeholders never start',id,levels});
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.island),id);
  }
  assert.equal(seenLevels.size,60);
  await select('home'); await island('home').click();
  const corners=page.locator('[data-island-levels] [data-map-corner-tools]');
  assert.equal(await corners.locator('[data-wallet]').textContent(),'0');
  await corners.locator('[data-map-settings]').click();
  const settings=page.getByRole('dialog',{name:'游戏设置',exact:true});await settings.waitFor();
  const music=settings.getByRole('switch',{name:'背景音乐：首页与地图'});const muted=await music.getAttribute('aria-checked');
  await music.click();assert.notEqual(await music.getAttribute('aria-checked'),muted);await music.click();
  await page.keyboard.press('Escape');await settings.waitFor({state:'detached'});
  assert.equal(await page.locator('[data-archipelago]').getAttribute('data-page'),'levels');
  await corners.locator('[data-journal-open]').click();
  const journal=page.getByRole('dialog',{name:'我的闯关进度',exact:true});await journal.waitFor();
  await page.keyboard.press('Escape');await journal.waitFor({state:'detached'});
  assert.equal(await page.locator('[data-archipelago]').getAttribute('data-page'),'levels');
  await page.locator('[data-levels-close]').click();
  report.checks.push({name:'original corner settings, sound toggles, flower count and progress journal work'});
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
  await island('network').tap();await page.locator('[data-island-authored-scene="network"]').waitFor();await page.keyboard.press('Escape');
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
  await page.locator('[data-island-levels] [data-map-home]').click();
  await page.locator('[data-home-start]:enabled').waitFor();
  await page.locator('[data-home-start]').click();
  await page.locator('[data-archipelago]').waitFor();
  assert.equal(await current(),ids[0],'the first island must be selected during the cover transition');
  await page.locator('[data-archipelago]:not([aria-hidden])').waitFor();
  assert.equal(await page.locator('[data-archipelago]').getAttribute('data-page'),'levels');
  assert.equal(await current(),ids[0]);
  assert(Math.abs(await bottomGap())<=2);
  assert.equal(await saved(),before);
  report.checks.push({name:'game returns to level selector; a new game opens the campus map bottom again'});
  await page.locator('[data-levels-close]').click();

  // Seed progress only in this disposable browser's save.
  const progressedSave=await page.evaluate(()=>{
    const key='little-red-flower-leaderboard-v1', state=JSON.parse(localStorage.getItem(key));
    const player=state.players.find(p=>p.id===state.activePlayerId);
    player.completed={'oil-fire':1};
    const json=JSON.stringify(state);
    localStorage.setItem(key,json);
    localStorage.setItem('little-red-flower-journey-location-v1',JSON.stringify({
      [player.id]:{levelId:'typhoon-home',visitedAt:1},
    }));
    return json;
  });
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.reload({waitUntil:'load',timeout:120000});
  await page.locator('[data-home-continue]:enabled').click();
  await page.locator('[data-archipelago]:not([aria-hidden])').waitFor();
  assert.equal(await current(),'emergency');
  assert.equal(await saved(),progressedSave);
  report.checks.push({name:'Continue still opens the saved island without changing the save'});
  await select('home');
  await island('home').click();
  assert.equal(await page.locator('[data-island-level="oil-fire"]').getAttribute('data-status'),'complete');
  await page.locator('[data-levels-close]').click();

  await page.locator('[data-carousel-close]').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-home-start]:enabled').click();
  await page.locator('[data-archipelago]:not([aria-hidden])').waitFor();
  assert.equal(await current(),ids[0]);
  assert.equal(await page.locator('[data-archipelago]').getAttribute('data-page'),'levels');
  assert(Math.abs(await bottomGap())<=2);
  report.checks.push({name:'confirmed restart also opens Campus Safety at the bottom'});
  await page.locator('[data-levels-close]').click();

  await page.locator('[data-carousel-close]').click();
  const beforeUnlock=await saved();
  await page.locator('[data-home-unlock-all]').click();
  await page.locator('[data-home-continue]:enabled').click();
  await page.locator('[data-archipelago]:not([aria-hidden])').waitFor();
  let playable=0,previews=0,placeholders=0;
  for(const map of authoredMaps) {
    await select(map.id);await island(map.id).click();
    for(const item of map.stops) {
      const stop=page.locator(`[data-island-level="${item.id}"]`);
      const preview=await stop.getAttribute('data-preview-only')==='true';
      assert.equal(await stop.getAttribute('data-status'),preview?'locked':'available',item.id);
      if(preview)previews++;else playable++;
      if(item.placeholder) {
        placeholders++;
        await chooseSource(item.id);
        await stop.locator('.garden-node-label').click();
        assert(await page.locator('[data-painted-primary]').isDisabled());
        await page.keyboard.press('Escape');
        await page.locator('[data-painted-intro]').waitFor({state:'detached'});
      }
    }
    await page.locator('[data-levels-close]').click();
  }
  assert.equal(playable,26);assert.equal(previews,34);assert.equal(placeholders,28);
  assert.equal(await saved(),beforeUnlock);
  report.checks.push({name:'Unlock All only opens the 26 implemented games; 28 new placeholders and six existing previews stay unavailable',playable,previews,placeholders});
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);assert.deepEqual(report.externalRequests,[]);
  report.status='passed';
} catch(error){report.status='failed';report.failure=error.stack;process.exitCode=1;}
finally{
  try{if(context){await context.close();report.contextClosed=true;}}
  finally{try{if(browser){await browser.close();report.browserClosed=true;}}finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));}}
}
console.log(JSON.stringify(report,null,2));
