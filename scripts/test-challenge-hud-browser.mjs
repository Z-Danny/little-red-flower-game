/** All 12 live challenges: isolated mobile input, accelerated activity clock, no audible test windows. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {root,dependency} from './lib/dependencies.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const map=read('content/journey-map.json'),ids=map.regions.flatMap(r=>r.nodes.map(n=>n.id));
const hunts=read('content/scenes/catalog.json').filter(e=>e.enabled).map(e=>({id:e.id,engine:'hunt'}));
const entries=[...hunts,{id:'rain-street-preparation-v1',engine:'disaster'},...['flood-kit','clear-corridor'].map(id=>({id,engine:'configured'}))];
const out=path.resolve(root,process.env.CHALLENGE_REPORT_DIR??'docs/challenge-hud/verification');
const html=path.resolve(root,process.env.CHALLENGE_HTML??'outputs/本地离线版/小红花应急行动.html');fs.mkdirSync(out,{recursive:true});
const report={frameSchedule:'controlled 10fps via test-only rAF scheduling; real input and state machine; full realtime audio tested separately',at:new Date().toISOString(),status:'running',htmlSha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),checks:[],errors:[],network:[],physicalPhone:'not_run',humanListening:'not_run',closed:false};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
const check=(id,name)=>{report.checks.push({id,name,status:'passed'});console.log(id,name);};
let page;
try{
 for(const entry of entries.filter(e=>(!process.argv.includes('--other-engines') || e.engine!=='hunt')&&(!process.env.CHALLENGE_LEVELS || process.env.CHALLENGE_LEVELS.split(',').includes(e.id)))){
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  try{
   await ctx.addInitScript(ids=>{localStorage.setItem('little-red-flower-leaderboard-v1',JSON.stringify({version:1,activePlayerId:'qa',players:[{id:'qa',name:'测试',region:'',createdAt:1,completed:Object.fromEntries(ids.map(id=>[id,3]))}]}));},ids);
   page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url());});
   await page.goto(pathToFileURL(html).href);
      await page.locator('[data-home-continue]').click();
   const region=map.regions.find(r=>r.nodes.some(n=>n.id===entry.id));assert.ok(region,entry.id);
   await page.locator('[data-map-region="'+region.id+'"]').click();await page.locator('[data-map-node="'+entry.id+'"]').click();await page.getByRole('button',{name:'再守护一次',exact:true}).click();
   const host=page.locator('.'+entry.engine+'-player'),tray=page.locator(entry.engine==='hunt'?'.hunt-targets':entry.engine==='disaster'?'.disaster-clues':'.configured-targets'),bulb=page.getByRole('button',{name:'物件剪影提示',exact:true});
   const start=page.locator(entry.engine==='hunt'?'.hunt-entry>button':'.disaster-entry>button'),bar=page.getByRole('progressbar'),hud=page.locator('.'+entry.engine+'-hud');
   await start.waitFor();assert.equal(await host.getAttribute('data-phase'),'ready');assert.equal(await tray.isVisible(),false);
   assert.equal(await bar.getAttribute('aria-valuenow'),'50');
   for(const [width,height] of [[320,568],[390,844],[1440,900]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(150);
    await bulb.tap();assert.equal(await tray.isVisible(),true);
    const h=await hud.boundingBox(),track=await bar.boundingBox(),frame=await host.boundingBox();
    assert.equal((await page.locator('.hunt-countdown').innerText()).trim(),'');
    assert.equal(await hud.locator('time').count(),0);
    const padding=await hud.evaluate(e=>[parseFloat(getComputedStyle(e).paddingLeft),parseFloat(getComputedStyle(e).paddingRight)]);
    assert.ok(Math.abs(track.width-(h.width-padding[0]-padding[1]))<2,'Full-row track '+entry.id);
    const boxes=await hud.locator('button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
    for(const b of boxes){assert.ok(b.width>=44&&b.height>=44);assert.ok(b.left>=frame.x-.5&&b.right<=frame.x+frame.width+.5&&b.top>=frame.y-.5);}
    const tb=await tray.boundingBox();assert.ok(tb.x>=frame.x-.5&&tb.x+tb.width<=frame.x+frame.width+.5&&tb.y+tb.height<=frame.y+frame.height+.5);
    const bb=await bulb.boundingBox(),pause=await hud.getByRole('button',{name:/^暂停/}).boundingBox();assert.ok(bb.x+bb.width<=pause.x+1);
    await bulb.tap();assert.equal(await tray.isVisible(),false);
   }
   check(entry.id,'3 viewports: hidden/toggle clues, 44px buttons, full-row bar, no seconds');
   await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
   await page.screenshot({path:path.join(out,entry.id+'-ready.png')});await page.clock.install();await start.tap();
   await page.evaluate(()=>{window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),100);window.cancelAnimationFrame=id=>clearTimeout(id);});
   // Let the already-scheduled native frame hand off to the controlled scheduler.
   await page.waitForTimeout(250);
   // Freeze wall-clock drift while reading dense masks. Only runFor advances gameplay.
   await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
   if(process.env.CHALLENGE_SPARKS==='1'){
    const canvas=host.locator('canvas');
    const advance=async t=>{for(let i=0;i<8;i++){const n=Number(await host.getAttribute('data-elapsed'));if(n>=t)return;await page.clock.runFor(t-n+10);}};
    await advance(1070);await page.screenshot({path:path.join(out,entry.id+'-spark.png')});
    await advance(1600);const beforePause=await host.getAttribute('data-elapsed');
    await hud.getByRole('button',{name:/^暂停/}).tap();await page.clock.runFor(5000);assert.equal(await host.getAttribute('data-elapsed'),beforePause);
    await page.getByRole('button',{name:'继续游戏',exact:true}).tap();await advance(5800);
    await hud.getByRole('button',{name:/^暂停/}).tap();await page.getByRole('button',{name:'重新开始',exact:true}).tap();await start.click();await page.clock.runFor(100);
    check(entry.id,'local spark screenshot, paused activity clock, replay; native audio verified separately');
   }
   // Select an actual non-target pixel in the visible scene, not a HUD control.
   const skin=read(entry.engine==='hunt'?`content/scenes/${entry.id}/skin.json`:entry.engine==='disaster'?`content/disaster/${entry.id}/skin.json`:`content/levels/${entry.id}/skins/paperbook.json`);
   const world=skin.world??{width:skin.width,height:skin.height};
   const mask=skin.mask?await dependency('sharp')(path.join(root,'public',skin.mask.slice(1))).ensureAlpha().raw().toBuffer({resolveWithObject:true}):null;
   const colors=Object.values(skin.targets??skin.sprites??{}).filter(t=>t.color).map(t=>t.color.join(','));
   const objects=entry.engine==='configured'?read(`content/levels/${entry.id}/level.json`).objects.map(o=>skin.poses[o.id]):[];
   const colorAt=(x,y)=>{if(!mask)return '';const i=(Math.floor(y/world.height*mask.info.height)*mask.info.width+Math.floor(x/world.width*mask.info.width))*4;return mask.data[i+3]>0?[...mask.data.subarray(i,i+3)].join(','):'';};
   const screen=async p=>host.locator('canvas').evaluate((c,p)=>{const b=c.getBoundingClientRect(),m=c.getContext('2d').getTransform();return {x:b.x+(m.a*p.x+m.e)*b.width/c.width,y:b.y+(m.d*p.y+m.f)*b.height/c.height};},p);
   let wrong;
   for(let y=world.height*.35;y<world.height*.85&&!wrong;y+=35)for(let x=world.width*.15;x<world.width*.85&&!wrong;x+=35){
    if([-10,0,10].some(dx=>[-10,0,10].some(dy=>colors.includes(colorAt(x+dx,y+dy))))||objects.some(p=>p&&x>=p.x-10&&x<=p.x+p.w+10&&y>=p.y-10&&y<=p.y+p.h+10))continue;
    const at=await screen({x,y});if(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS',at))wrong=at;
   }
   assert.ok(wrong,'Visible non-target pixel');
   const used=async()=>Number(await host.getAttribute('data-elapsed'))+Number(await host.getAttribute('data-penalty')??0);
   const beforeMiss=await used();await page.touchscreen.tap(wrong.x,wrong.y);
   assert.ok(Math.abs((await used())-beforeMiss-5000)<150,'One physical tap costs exactly 5s '+JSON.stringify({wrong,beforeMiss,after:await used(),phase:await host.getAttribute('data-phase')}));
   assert.ok((await page.locator('body').innerText()).includes('−5'),'Visible minus-five feedback');
   const second=await used();await page.touchscreen.tap(wrong.x,wrong.y);assert.ok(Math.abs((await used())-second-5000)<150,'Rapid second tap also costs 5s');
   await page.screenshot({path:path.join(out,entry.id+'-minus-five.png')});
   const controlsBefore=await used();await bulb.tap();await bulb.tap();await hud.getByRole('button',{name:/^暂停/}).tap();await page.clock.runFor(1000);
   assert.ok(Math.abs((await used())-controlsBefore)<150,'Hint/pause controls never deduct');
   await page.getByRole('button',{name:'继续游戏',exact:true}).tap();
   const saveBeforeMiss=await page.evaluate(()=>localStorage.getItem('little-red-flower-leaderboard-v1'));
   for(let i=0;i<10&&(await host.getAttribute('data-phase'))==='playing';i++)await page.touchscreen.tap(wrong.x,wrong.y);
   assert.equal(await host.getAttribute('data-phase'),'failed');assert.equal(await bar.getAttribute('aria-valuenow'),'0');
   assert.equal(await page.evaluate(()=>localStorage.getItem('little-red-flower-leaderboard-v1')),saveBeforeMiss);
   await page.getByRole('button',{name:'重新挑战',exact:true}).tap();await page.clock.runFor(100);
   assert.ok((await used())<300,'Retry clears all deductions');
   check(entry.id,'real wrong pixels: -5 each, rapid -10, controls free, zero fails without award, reset');
   if(process.env.CHALLENGE_SMOKE==='1')continue;
   const advanceTo=async target=>{for(let i=0;i<8;i++){const value=Number(await host.getAttribute('data-elapsed'));if(value>=target)return;await page.clock.runFor(target-value+25);}throw Error('Activity clock did not advance: '+await host.getAttribute('data-elapsed'));};
   await advanceTo(26000);assert.equal(await host.getAttribute('data-phase'),'playing');
   assert.equal(await page.locator('.hunt-countdown').getAttribute('data-stage'),'warning');
   await hud.getByRole('button',{name:/^暂停/}).tap();const elapsed=await host.getAttribute('data-elapsed');await page.clock.runFor(1500);assert.equal(await host.getAttribute('data-elapsed'),elapsed);
   await page.getByRole('button',{name:'继续游戏',exact:true}).tap();await advanceTo(40500);
   assert.equal(await page.locator('.hunt-countdown').getAttribute('data-stage'),'danger');
   const saved=await page.evaluate(()=>localStorage.getItem('little-red-flower-leaderboard-v1'));
   await advanceTo(50000);assert.equal(await host.getAttribute('data-phase'),'failed');assert.equal(await bar.getAttribute('aria-valuenow'),'0');
   assert.equal(await page.evaluate(()=>localStorage.getItem('little-red-flower-leaderboard-v1')),saved);
   await page.screenshot({path:path.join(out,entry.id+'-failed.png')});
   await page.getByRole('button',{name:'重新挑战',exact:true}).tap();await page.clock.runFor(100);
   assert.equal(await host.getAttribute('data-phase'),'playing');assert.equal(await tray.isVisible(),false);assert.ok(Number(await bar.getAttribute('aria-valuenow'))>=49);
   check(entry.id,'50-second deadline, amber/red phases, pause, no failure award, one-click retry');
   {
    let points;
    if(entry.engine==='hunt'){
     points=[];
     for(const [id,t] of Object.entries(skin.targets)){
      let hit;const b=t.bounds;
      for(let y=b.y+3;y<b.y+b.h&&!hit;y+=5)for(let x=b.x+3;x<b.x+b.w&&!hit;x+=5){
       if(![-6,0,6].every(dx=>[-6,0,6].every(dy=>colorAt(x+dx,y+dy)===t.color.join(','))))continue;const at=await screen({x,y});
       // Touch browsers may retarget points immediately beside a control. Use an
       // interior scene sample, not the one-pixel seam beneath the floating HUD.
       const head=await hud.boundingBox();
       if(at.y>head.y+head.height+16&&await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS',at))hit={id,x,y};
      }
      assert.ok(hit,'Visible target '+id);points.push(hit);
     }
    }
    else if(entry.engine==='disaster')points=Object.entries(read('public/levels/rain-flood-v1/street/hit-samples.json')).map(([id,p])=>({id,...p}));
    else{
     const rules=read('content/levels/'+entry.id+'/level.json'),skin=read('content/levels/'+entry.id+'/skins/paperbook.json');points=[];
     for(const g of rules.goals){
      const pose=skin.poses[g.object],a=skin.assets[pose.asset],{data,info}=await dependency('sharp')(path.join(root,'public',a.src.slice(1))).ensureAlpha().raw().toBuffer({resolveWithObject:true}),pixels=[];
      for(let y=Math.floor(info.height*.25);y<info.height*.75;y+=2)for(let x=Math.floor(info.width*.25);x<info.width*.75;x+=2)if(data[(y*info.width+x)*4+3]>220)pixels.push({x,y});
      assert.ok(pixels.length);const hit=pixels[Math.floor(pixels.length/2)];points.push({id:g.id,x:pose.x+hit.x/info.width*pose.w,y:pose.y+hit.y/info.height*pose.h});
     }
    }
    for(const p of points){
     const at=await host.locator('canvas').evaluate((c,p)=>{const b=c.getBoundingClientRect(),m=c.getContext('2d').getTransform();return {x:b.x+(m.a*p.x+m.e)*b.width/c.width,y:b.y+(m.d*p.y+m.f)*b.height/c.height};},p);
     assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,at),'CANVAS');
     const timeBefore=await used();await page.touchscreen.tap(at.x,at.y);
     if(process.env.CHALLENGE_SPARKS==='1'&&entry.engine==='hunt'&&p===points[0]){
      await page.touchscreen.tap(wrong.x,wrong.y);assert.equal((await used())-timeBefore,5000,'Miss during active circle deducts 5s');
      await page.clock.runFor(200);await page.screenshot({path:path.join(out,entry.id+'-busy-minus-five.png')});
     }
     await page.clock.runFor(1300);
     assert.notEqual(await host.getAttribute('data-paused'),'true','Target click must not activate a nearby HUD control');
     assert.ok((await host.getAttribute(entry.engine==='disaster'?'data-goals':entry.engine==='hunt'?'data-found':'data-resolved')).split(',').includes(p.id),'Actual pointer hit '+p.id+' '+JSON.stringify({world:p,screen:at,phase:await host.getAttribute('data-phase'),found:await host.getAttribute('data-found'),marking:await host.getAttribute('data-marking'),elapsed:await used()}));
    }
    await page.clock.runFor(7000);assert.equal(await host.getAttribute('data-phase'),'complete');await page.screenshot({path:path.join(out,entry.id+'-complete.png')});check(entry.id,'original collection/circle interactions complete via real pointer after retry');
   }
  }catch(e){await page?.screenshot({path:path.join(out,entry.id+'-failure.png')}).catch(()=>{});throw e;}finally{await ctx.close();}
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='passed';
}catch(e){report.status='failed';report.error=String(e.stack??e);await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;console.error(e);}
finally{await browser.close();report.closed=true;fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2));}
