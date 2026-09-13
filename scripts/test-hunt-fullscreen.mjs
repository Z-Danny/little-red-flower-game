/** Headless, silent responsive visual/input smoke test. No user profile or storage. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'), require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.join(root,'docs/hazard-batch-v2/verification/edge-fit-20260910/fullscreen');fs.mkdirSync(out,{recursive:true});
const html=path.resolve(root,process.argv[2]??'outputs/本地离线版/小红花应急行动.html');
const plan=JSON.parse(fs.readFileSync(path.join(root,'docs/hazard-batch-v2/production-plan.json'),'utf8'));
const report={at:new Date().toISOString(),cases:[],status:'running',browserClosed:false};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
try {
  for(const [width,height] of [[390,844],[360,640],[768,1024],[844,390]]) {
    for(const card of plan.levels) {
      const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true});
      try {
        const page=await context.newPage();
        await page.goto(pathToFileURL(html).href);
        await page.locator('button.map-level').filter({has:page.locator('.map-copy > strong').getByText(card.title,{exact:true})}).click();
        await page.locator('.hunt-entry > button').waitFor();
        await page.locator('.hunt-entry > button').click();
        await page.waitForTimeout(100);
        const layout=await page.evaluate(()=>Object.fromEntries(['.hunt-player','.hunt-world','.hunt-world canvas','.hunt-hud','.hunt-targets'].map(sel=>{
          const el=document.querySelector(sel),c=getComputedStyle(el);
          return [sel,{box:el.getBoundingClientRect().toJSON(),scrollTop:el.scrollTop,position:c.position,height:c.height,top:c.top,inset:c.inset}];
        })));
        const result={id:card.id,width,height,layout,targets:[]};report.cases.push(result);
        await page.screenshot({path:path.join(out,`${card.authorId}-${width}x${height}.png`)});
        const canvas=layout['.hunt-world canvas'].box;
        assert.ok(canvas.x>=0 && canvas.y>=0 && canvas.right<=width+1 && canvas.bottom<=height+1);
        assert.ok(canvas.width<=520.1 && canvas.y===0);
        const sample=JSON.parse(fs.readFileSync(path.join(root,'art-source/hazard-batch-v2',card.authorId,'hit-samples.json'),'utf8'));
        for(const [id,[x,y]] of Object.entries(sample.targets)){
          const scale=Math.max(canvas.width/720,canvas.height/1280);
          const at={x:canvas.x+(canvas.width-720*scale)/2+x*scale,y:canvas.y+(canvas.height-1280*scale)/2+y*scale};
          const top=await page.evaluate(p=>{const el=document.elementFromPoint(p.x,p.y);return {tag:el?.tagName,cls:el?.className};},at);
          assert.equal(top.tag,'CANVAS',`${card.id}/${id}/${width} obscured by ${JSON.stringify(top)}`);
          await page.touchscreen.tap(at.x,at.y);
          await page.waitForFunction(id=>document.querySelector('.hunt-player')?.dataset.found.split(',').includes(id),id);
          result.targets.push(id);
        }
        await page.locator('.hunt-dialog .hunt-flowers').waitFor();
        result.passed=true;
        console.log(card.authorId,width,height,'passed');
      } finally {await context.close();}
    }
  }
  report.status='passed';
} catch(e) {report.status='failed';report.error=String(e.stack??e);console.error(e);process.exitCode=1;}
finally {await browser.close();report.browserClosed=true;fs.writeFileSync(path.join(out,'responsive-smoke.json'),JSON.stringify(report,null,2));}
