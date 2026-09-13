import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const file=path.resolve(process.argv[2]??path.join(root,'outputs/本地离线版/小红花应急行动.html'));
const out=path.resolve(process.argv[3]??path.join(root,'outputs/map-order-verification'));
fs.mkdirSync(out,{recursive:true});
const map=JSON.parse(fs.readFileSync(path.join(root,'content/journey-map.json'),'utf8'));
const key='little-red-flower-leaderboard-v1';
const report={status:'running',htmlSha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),checks:[],errors:[],network:[],closed:false};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
let page;
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
try {
  page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url());});
  page.on('dialog',d=>d.accept()); // Only this isolated QA profile, never the user's browser/save.
  await page.goto(pathToFileURL(file).href);
  await page.locator('[data-title-screen]').waitFor();
  const other={id:'map-qa-other',name:'保留的测试玩家',region:'',createdAt:1,completed:{'oil-fire':2}};
  const completed=Object.fromEntries(map.regions.flatMap(r=>r.nodes.map(n=>[n.id,3])));
  await page.evaluate(({key,other,completed})=>{
    localStorage.setItem(key,JSON.stringify({version:1,activePlayerId:'map-qa',players:[{id:'map-qa',name:'地图顺序测试',region:'',createdAt:1,completed},other]}));
    localStorage.setItem('little-red-flower-journey-location-v1',JSON.stringify({'map-qa':{levelId:'quake-cover-practice',visitedAt:1}}));
  },{key,other,completed});
  await page.reload();
  await page.locator('[data-home-start]').click();
  await page.locator('.garden-node').first().waitFor();
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.deepEqual(saved.players.find(p=>p.id==='map-qa').completed,{});
  assert.deepEqual(saved.players.find(p=>p.id===other.id),other);
  pass('confirmed New Game clears only the QA player and preserves the other player');
  for(const region of map.regions){
    await page.locator(`[data-category="${region.id}"]`).click();
    for(const [i,n] of region.nodes.entries())
      assert.equal(await page.locator(`[data-map-node="${n.id}"]`).getAttribute('data-status'),i===0?'available':'locked',n.id);
    const id={nature:'quake-cover-practice',public:'car-window-practice',home:'fire-shelter-practice'}[region.id];
    const node=page.locator(`[data-map-node="${id}"]`);
    await node.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,`fresh-${region.id}-390.png`)});
    await node.click();
    await page.locator('.garden-locked-note').waitFor();
    assert.equal(await page.getByRole('button',{name:'进入场景',exact:true}).count(),0);
    assert((await page.locator('.garden-locked-note').innerText()).includes('先完成'));
    await page.screenshot({path:path.join(out,`locked-${region.id}-390.png`)});
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    pass(`${region.id}: all fresh nodes checked; ${id} is locked and has no game-start action`);
  }
  // Seed explicit progression fixtures; this checks map access, not a claim of playing every level.
  for(const [regionId,count,target] of [['nature',8,'quake-cover-practice'],['public',4,'car-window-practice'],['public',6,'collapse-signal-practice'],['home',4,'fire-shelter-practice']]){
    const region=map.regions.find(r=>r.id===regionId);
    const fixture=Object.fromEntries(region.nodes.slice(0,count).map(n=>[n.id,3]));
    await page.evaluate(({key,fixture})=>{const s=JSON.parse(localStorage.getItem(key));s.players.find(p=>p.id==='map-qa').completed=fixture;localStorage.setItem(key,JSON.stringify(s));}, {key,fixture});
    await page.reload();
    await page.locator('[data-home-continue]').click();
    await page.locator(`[data-category="${regionId}"]`).click();
    for(const [i,n] of region.nodes.entries())
      assert.equal(await page.locator(`[data-map-node="${n.id}"]`).getAttribute('data-status'),i<count?'complete':i===count?'available':'locked',n.id);
    await page.locator(`[data-map-node="${target}"]`).click();
    assert(await page.getByRole('button',{name:'进入场景',exact:true}).isVisible());
    assert.equal(await page.locator('.garden-locked-note').count(),0);
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    pass(`${regionId}: prefix ${count} opens exactly ${target}, later nodes stay locked`);
  }
  await page.setViewportSize({width:320,height:568});
  await page.locator('[data-map-node="fire-stairs-practice"]').click();
  assert(await page.locator('.garden-locked-note').isVisible());
  assert.equal(await page.getByRole('button',{name:'进入场景',exact:true}).count(),0);
  await page.screenshot({path:path.join(out,'locked-next-320.png')});
  pass('320px mobile-width locked successor cannot be started');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);
  pass('standalone file has no browser errors or external network requests');
  report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;process.exitCode=1;console.error(e);await page?.screenshot({path:path.join(out,'FAIL.png')}).catch(()=>{});}
finally{await browser.close();report.closed=true;fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2));}
