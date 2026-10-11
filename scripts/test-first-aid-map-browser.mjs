// Verify the FINAL self-contained HTML in an isolated, muted, always-closed browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html=path.resolve(root,process.env.OFFLINE_HTML || 'outputs/本地离线版/小红花应急行动.html');
const out=path.join(root,'outputs/first-aid-map-verification');
fs.mkdirSync(out,{recursive:true});
const chapter=JSON.parse(fs.readFileSync(path.join(root,'content/journey-first-aid.json'),'utf8'));
const report={status:'running',html,sha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),checks:[],errors:[],network:[],realDevice:'not_run',humanAudio:'not_run',closed:false};
let browser,context,page;
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined,args:['--mute-audio']});
  context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url());});
  await page.goto(pathToFileURL(html).href,{waitUntil:'load',timeout:120000});
  await page.locator('[data-home-start]').click();
  await page.locator('[data-journey-map]').waitFor();
  const saved=await page.evaluate(()=>localStorage.getItem('little-red-flower-leaderboard-v1'));
  await page.locator('[data-map-fan-toggle]').click();
  await page.locator('[data-archipelago]').waitFor();
  assert.equal(await page.locator('[data-island]').count(),4);
  await page.screenshot({path:path.join(out,'four-islands-390.png')});
  await page.locator('[data-island="first-aid"]').click();
  await page.locator('[data-journey-map][data-region="first-aid"]').waitFor();
  assert.equal(await page.locator('[data-map-node]').count(),8);
  await page.locator('.garden-map-art').evaluate(img=>img.decode());
  assert.equal(await page.locator('[data-map-node="first-aid-comprehensive"]').count(),0);
  pass('fourth island navigates to eight-node first-aid map; ninth entry removed');
  for (const [width,height] of [[320,740],[390,844],[430,932],[1440,1000]]) {
    await page.setViewportSize({width,height});
    for (const [index,level] of chapter.levels.entries()) {
      const node=page.locator(`[data-map-node="${level.id}"]`);
      await node.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
      await page.waitForTimeout(120);
      assert((await node.innerText()).includes(level.title));
      assert.equal(await node.locator('.garden-node-subtitle').count(),0, 'no yellow subtitle below map titles');
      assert((await node.getAttribute('aria-label')).includes(level.number));
      assert.equal(await node.locator('.garden-node-number').innerText(), String(index + 1).padStart(2, '0'));
      assert.equal(await node.getAttribute('data-status'), 'locked');
      const motif = node.locator('.garden-sign-motif');
      assert.equal(await motif.count(), 1);
      await motif.evaluate(img => img.decode());
      const motifBounds = await motif.boundingBox();
      const labelBounds = await node.locator('.garden-node-label').boundingBox();
      assert(motifBounds.x > labelBounds.x + labelBounds.width / 2 && motifBounds.y < labelBounds.y + labelBounds.height / 2);
      const bounds=await node.locator('.garden-node-label').boundingBox();
      assert(bounds.x>=-1 && bounds.x+bounds.width<=width+1,`${width} ${level.number}: sign in viewport`);
      const overlap=await node.locator('.garden-node-label').evaluate(label=>{
        const a=label.getBoundingClientRect();
        return [...document.querySelectorAll('.map-corner-button,[data-map-fan-toggle]')].some(el=>{
          const b=el.getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
        });
      });
      assert.equal(overlap,false,`${width} ${level.number}: HUD-safe sign`);
      if(index===0 || index===4 || index===7)await page.screenshot({path:path.join(out,`chapter4-${level.number}-${width}.png`)});
      await node.locator('.garden-node-label').click();
      await page.locator(`[data-painted-intro][data-level-id="${level.id}"]`).waitFor();
      assert.equal(await page.locator('.painted-intro-title').innerText(),level.title);
      assert((await page.locator('.painted-intro-note').innerText()).includes(level.difficulty));
      const previewOnly=await node.getAttribute('data-preview-only')==='true';
      assert.equal(await page.locator('[data-painted-primary]').innerText(), previewOnly ? '玩法待开放' : '尚未解锁');
      if(!previewOnly && index > 0) assert((await page.locator('.painted-intro-description').innerText()).includes(chapter.levels[index - 1].title));
      assert(await page.locator('[data-painted-primary]').isDisabled());
      if(index===0&&width===390)await page.screenshot({path:path.join(out,'preview-entry-390.png')});
      if(index===1&&width===390)await page.screenshot({path:path.join(out,'sequential-lock-390.png')});
      await page.keyboard.press('Escape');
      await page.locator('[data-painted-intro]').waitFor({state:'detached'});
    }
    const aed = page.locator('[data-map-node="first-aid-aed"]');
    await page.locator('.garden-scroll').evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(200);
    assert.equal(await aed.getAttribute('data-sign-side'), 'right', 'AED title returns to the other side of the road after HUD avoidance');
    const aedLabel = await aed.locator('.garden-node-label').boundingBox();
    const aedAnchor = await aed.boundingBox();
    assert(aedLabel.x > aedAnchor.x + aedAnchor.width / 2);
    await page.screenshot({path:path.join(out,`aed-right-no-subtitles-${width}.png`)});
    pass(`${width}x${height}: 01-08 counters, eight corner motifs, shared sequential locks, no subtitles and AED title on right`);
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('little-red-flower-leaderboard-v1')),saved);
  pass('map browsing and eight entries do not change scores or player saves');
  await page.setViewportSize({width:390,height:844});
  for(const id of ['nature','public','home','first-aid']) {
    await page.locator('[data-map-fan-toggle]').click();
    await page.locator(`[data-island="${id}"]`).click();
    await page.locator(`[data-journey-map][data-region="${id}"]`).waitFor();
    await page.locator('.garden-map-art').evaluate(img=>img.decode());
  }
  pass('all four chapters remain navigable with decodable map images');
  await page.locator('[data-journal-open]').click();
  await page.locator('[data-testid="journal-island-first-aid"]').waitFor();
  await page.locator('[data-testid="journal-island-first-aid"] img').first().evaluate(img=>img.decode());
  assert.equal(await page.locator('[data-testid="journal-completed"]').getAttribute('data-total'),'26');
  assert((await page.locator('[data-testid="journal-island-first-aid"]').innerText()).includes('8'));
  assert((await page.locator('[data-testid="journal-island-first-aid"]').getAttribute('aria-label')).includes('已开放 2 关'));
  pass('player journal shows fourth-island partial release with exactly 26 playable completions');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);
  pass('final exported HTML has no page errors or external requests');
  report.status='passed';
} catch(error) {
  report.status='failed';report.failure=error.stack;process.exitCode=1;console.error(error);
  await page?.screenshot({path:path.join(out,'FAIL.png')}).catch(()=>{});
} finally {
  await context?.close();await browser?.close();report.closed=true;
  fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2)+'\n');
}
