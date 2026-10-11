// FINAL full-game HTML only. Fresh contexts, offline, muted; never uses a user's browser/storage.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(import.meta.dirname,'..');
const html=path.join(root,'outputs/本地离线版/小红花应急行动.html');
const out=path.resolve(root,process.env.AED_REPORT_DIR || 'outputs/aed-integration-verification');fs.mkdirSync(out,{recursive:true});
const report={status:'running',html,sha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),checks:[],errors:[],network:[],realDevice:'not_run',humanAudio:'not_run',medicalProfessionalReview:'not_run',closed:false};
const pass=s=>{report.checks.push(s);console.log('PASS '+s);};
let browser,context,page;
try {
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
 for(const [index,scenario] of ['shock-advised','no-shock-advised'].entries()) {
  context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce',offline:true});
  // Deterministic scenario selection is confined to this disposable test context.
  await context.addInitScript(value=>{Math.random=()=>value;},index===0?.1:.9);
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url());});
  const load=()=>page.goto(pathToFileURL(html).href,{waitUntil:'load',timeout:120000});
  const scores=()=>page.evaluate(()=>{const b=JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1'));return b.players.find(p=>p.id===b.activePlayerId).completed;});
  const map=async()=>{await page.locator('[data-home-start]').waitFor();if(await page.locator('[data-home-continue]').count())await page.locator('[data-home-continue]').click();else await page.locator('[data-home-start]').click();await page.locator('[data-journey-map]').waitFor();await page.locator('[data-map-fan-toggle]').click();await page.locator('[data-island="first-aid"]').click();await page.locator('[data-journey-map][data-region="first-aid"]').waitFor();};
  const inspect=async()=>{const node=page.locator('[data-map-node="first-aid-aed"]');await node.scrollIntoViewIfNeeded();await node.click();await page.locator('[data-painted-intro]').waitFor();};
  await load();await map();await inspect();assert(await page.locator('[data-painted-primary]').isDisabled());assert((await page.locator('.painted-intro-description').innerText()).includes('心肺复苏'));
  assert.deepEqual(await scores(),{});pass(scenario+': fresh profile cannot bypass CPR prerequisite');
  await page.keyboard.press('Escape');
  if(index===0) {
   await load();await page.locator('[data-home-unlock-all]').click();await map();
   assert.deepEqual(await scores(),{});pass('Session-only homepage unlock grants access without forging scores');
  } else {
   // An isolated prior-CPR-save fixture, never a real player's save.
   await page.evaluate(()=>{const key='little-red-flower-leaderboard-v1',b=JSON.parse(localStorage.getItem(key));b.players.find(p=>p.id===b.activePlayerId).completed={'first-aid-cpr':3};localStorage.setItem(key,JSON.stringify(b));});
   await load();await map();pass('Existing CPR completion normally unlocks AED without test mode');
  }
  const node=page.locator('[data-map-node="first-aid-aed"]');assert.equal(await node.getAttribute('data-status'),'available');assert.equal(await node.getAttribute('data-preview-only'),'false');assert(!(await node.getAttribute('aria-label')).includes('玩法待开放'));
  const surface=page.locator('[data-level="first-aid-aed"]');
  const solve=async()=>{
   await inspect();await page.locator('[data-painted-primary]').click();await page.waitForFunction(()=>document.querySelector('[data-level="first-aid-aed"]')?.getAttribute('data-entered')==='true');await page.waitForTimeout(600);
   assert.equal(await surface.getAttribute('data-scenario'),scenario);
   assert.equal(await surface.locator('canvas').getAttribute('data-critical-clipped'),'false');
   for (const [width,height] of [[320,568],[390,844],[430,932],[1440,1000]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(150);
    const notice=surface.locator('.configured-notice');
    if(await notice.count()) {
     const style=await notice.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderTopWidth,role:el.getAttribute('role'),pointer:s.pointerEvents,text:el.textContent};});
     assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.border,'0px');assert.equal(style.role,'status');assert.equal(style.pointer,'none');assert(style.text.length>0);
    } else throw Error('Expected initial AED guidance');
    assert.equal(await surface.locator('canvas').getAttribute('data-critical-clipped'),'false');
    await page.screenshot({path:path.join(out,scenario+'-no-black-panel-'+width+'.png')});
   }
   await page.setViewportSize({width:390,height:844});
   pass(scenario+': bottom black panel removed on four viewports; guidance retained');
   await page.screenshot({path:path.join(out,scenario+'-in-game.png')});
   const keyboard=surface.locator('.configured-keyboard');const key=async(name)=>{await keyboard.getByRole('button',{name,exact:true}).focus();await page.keyboard.press('Enter');await page.waitForTimeout(620);};const put=async(a,b)=>{await key(a);await key('放到 '+b);};
   await put('放置 AED','身旁干燥地面');await key('开启 AED');await key('解开上衣，露出胸部');await put('干毛巾擦干贴片区域','擦干贴片区域');await put('电极片 ①','右上胸 ①');await put('电极片 ②','左侧胸 ②');await key('清场：大家离开，不要接触');await page.waitForFunction(()=>document.querySelector('[data-level="first-aid-aed"]')?.getAttribute('data-stages')?.includes('analyzed'));
   if(scenario==='shock-advised'){await key('清场：大家离开，不要接触');await page.waitForFunction(()=>document.querySelector('[data-level="first-aid-aed"]')?.getAttribute('data-stages')?.includes('shock-ready'));await key('电击按钮');}
   await key('协助者：立即恢复 CPR');await key('接应并告知急救人员');
   await page.locator('.painted-settlement-card[data-practice="false"]').waitFor();await page.waitForFunction(()=>{const b=document.querySelector('[data-testid="settlement-primary"]');return b&&!b.disabled;});
   assert.equal(await page.getByTestId('settlement-point').count(),3);assert((await page.getByTestId('settlement-knowledge').innerText()).includes('不是每次开机都要电击'));
  };
  await solve();assert.equal(await page.getByTestId('settlement-reward').innerText(),'+3 朵小红花');
  const expected=index===0?{'first-aid-aed':3}:{'first-aid-cpr':3,'first-aid-aed':3};assert.deepEqual(await scores(),expected);
  await page.screenshot({path:path.join(out,scenario+'-formal-settlement.png')});pass(scenario+': real gameplay, sourced standard settlement, 3 flowers persisted');
  for(const [width,height] of [[320,740],[390,844],[430,932],[1440,1000]]){await page.setViewportSize({width,height});await page.getByTestId('settlement-primary').scrollIntoViewIfNeeded();const b=await page.getByTestId('settlement-primary').boundingBox();assert(b.x>=0&&b.x+b.width<=width&&b.y>=0&&b.y+b.height<=height+1);await page.screenshot({path:path.join(out,scenario+'-result-'+width+'.png')});}
  await page.setViewportSize({width:390,height:844});await page.getByTestId('settlement-primary').click();await page.locator('[data-journey-map]').waitFor();await page.waitForTimeout(4500);assert.equal(await node.getAttribute('data-status'),'complete');
  await load();assert.equal(await page.locator('[data-home-unlock-all]').isDisabled(),false);assert.notEqual(await page.evaluate(()=>{const b=JSON.parse(localStorage.getItem('little-red-flower-leaderboard-v1'));return b.players.find(p=>p.id===b.activePlayerId).allLevelsUnlocked;}),true);await map();assert.deepEqual(await scores(),expected);assert.equal(await node.getAttribute('data-status'),'complete');
  await solve();assert((await page.getByTestId('settlement-reward').innerText()).includes('不重复发放'));assert.deepEqual(await scores(),expected);pass(scenario+': reload retains completion, replay does not duplicate rewards, session unlock resets without losing earned progress');
  await context.close();context=undefined;
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';
} catch(error){report.status='failed';report.failure=error.stack;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;console.error(error);}
finally{await context?.close();await browser?.close();report.closed=true;fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');}
