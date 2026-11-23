/** Actual Godot HTML/WASM; browser touch inputs, isolated userfs, no real profile. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const root=path.resolve(import.meta.dirname,'../..');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||path.join(root,'outputs/browser-tools/node_modules/playwright'));
const url=process.env.GODOT_PREVIEW_URL;
if(!url) throw new Error('Set GODOT_PREVIEW_URL to the HTTPS URL of the streamed Godot build.');
const origin=new URL(url).origin, staging=process.env.GODOT_STAGING_HTTP;
const out=path.resolve(root,process.env.GODOT_UI_BROWSER||'outputs/godot-ui/browser');
const release=process.env.GODOT_UI_WEB||'outputs/godot-ui/release/web';
const report={url,staging:!!staging,widths:[],checks:[],errors:[],failures:[],media:[],physicalDevice:'not_run',humanAudio:'not_run'};
fs.mkdirSync(out,{recursive:true});
report.sha256=Object.fromEntries(['index.html','index.pck','index.js','index.wasm'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.resolve(root,release,name))).digest('hex')]));

function readUserFile(filename) {
  return indexedDB.databases().then(databases=>{
    if(!databases.some(db=>db.name==='/userfs')) return '';
    return new Promise((resolve,reject)=>{
      const r=indexedDB.open('/userfs');r.onerror=()=>reject(r.error);
      r.onsuccess=()=>{
        const db=r.result;
        if(!db.objectStoreNames.contains('FILE_DATA')){db.close();resolve('');return;}
        const c=db.transaction('FILE_DATA','readonly').objectStore('FILE_DATA').openCursor();
        c.onerror=()=>{db.close();reject(c.error);};
        c.onsuccess=()=>{const item=c.result;
          if(!item){db.close();resolve('');}
          else if(String(item.key).endsWith('/'+filename)){db.close();resolve(new TextDecoder().decode(item.value.contents));}
          else item.continue();
        };
      };
    });
  });
}

let browser;
async function visit(view,{full}) {
  const ctx=await browser.newContext({viewport:view,hasTouch:true,reducedMotion:'reduce'});
  try {
    await ctx.route('**/*',async route=>{
      const from=new URL(route.request().url());
      if(from.origin!==origin){report.failures.push('Blocked unexpected origin '+from.origin);await route.abort();return;}
      if(!staging){await route.continue();return;}
      // Keep the canonical same-origin HTTPS URLs in Godot. Point this isolated
      // browser's exact requests at the unpublished loopback staging build.
      const response=await route.fetch({url:new URL(from.pathname+from.search,staging).href,headers:{...route.request().headers(),'accept-encoding':'identity'},maxRedirects:0});
      await route.fulfill({response});
    });
    const page=await ctx.newPage(),cdp=await ctx.newCDPSession(page);
    page.on('pageerror',e=>report.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'||/SCRIPT ERROR|^ERROR:/.test(m.text()))report.errors.push(m.text());});
    page.on('requestfailed',r=>report.failures.push(r.url()+' '+r.failure()?.errorText));
    page.on('response',r=>{if(r.status()>=400)report.failures.push(r.status()+' '+r.url());if(r.ok()&&r.url().includes('/packs/'))report.media.push(r.url().split('/').at(-1));});
    const resize=Math.min(view.width/576,view.height/1024);
    const at=(x,y)=>[(view.width-576*resize)/2+x*resize,(view.height-1024*resize)/2+y*resize];
    const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const tap=async(x,y)=>{await page.touchscreen.tap(...at(x,y));await frame();};
    const shot=async name=>{await frame();await page.screenshot({path:path.join(out,`${view.width}-${name}.png`)});};
    const pack=async name=>{const r=await page.waitForResponse(resp=>resp.ok()&&resp.url().includes('/packs/'+name+'-'),{timeout:26000});await r.finished();};
    const waitSave=async(filename,predicate)=>{
      for(let i=0;i<27;i++){const data=await page.evaluate(readUserFile,filename);if(predicate(data))return data;await page.waitForTimeout(300);}
      throw new Error(`Changed local Godot file did not persist: ${filename}`);
    };
    const swipe=async(from,to)=>{
      const a=at(...from),b=at(...to),touch=(x,y)=>[{x,y,id:3}];
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(...a)});
      for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch(a[0]+(b[0]-a[0])*i/10,a[1]+(b[1]-a[1])*i/10)});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frame();
    };
    const firstMedia=report.media.length;
    assert.equal((await page.goto(url,{waitUntil:'domcontentloaded',timeout:65000}))?.status(),200);
    await page.locator('#status').waitFor({state:'detached',timeout:70000});
    assert.equal(report.media.length,firstMedia,'initial title does not prefetch level media');
    await shot('01-painted-title');
    await tap(101,879);await shot('01b-painted-ranking');await tap(288,50);
    await tap(475,879);
    await tap(208,786);await page.waitForTimeout(420);
    const map=pack('map-home');await tap(348,530);await map;await page.waitForTimeout(820);
    await shot('02-painted-map');
    // Real journal and settings controls must not reload the map or start gameplay.
    await tap(527,121);await shot('03-painted-journal');await tap(288,950);
    await tap(527,43);await tap(59,55);await shot('04-painted-settings');
    const pre=report.media.length;
    await tap(399,467);
    await waitSave('journey-audio-v1.cfg',text=>/music_muted=true/.test(text));
    await tap(399,533);
    await waitSave('journey-audio-v1.cfg',text=>/effects_muted=true/.test(text));
    await tap(288,124);
    await tap(288,879);await page.waitForTimeout(500);
    assert.equal(report.media.length,pre);
    await tap(138,429);await shot('05-painted-intro');
    if(!full) {
      await tap(23,545);await tap(527,43);await shot('06-home-return');
      assert.equal(report.media.length,firstMedia+1);
      report.widths.push(view.width);return;
    }
    // Real solution and mistake; no cheating through JS or injected saves.
    const oil=pack('oil-fire');await tap(288,628);await oil;await page.waitForTimeout(1100);
    await shot('06-painted-hud');
    await tap(127,49);await shot('07-painted-pause');await tap(287,591);
    await swipe([315,658],[214,326]);await page.waitForTimeout(2150);
    await shot('08-painted-failure');
    assert.doesNotMatch(await page.evaluate(readUserFile,'prototype-progress-v1.cfg'),/\[oil-fire\]/);
    await tap(288,763);await page.waitForTimeout(400);
    await tap(201,390);await page.waitForTimeout(800);
    await swipe([152,689],[214,326]);await page.waitForTimeout(1040);
    await swipe([460,416],[484,368]);await page.waitForTimeout(1850);
    await waitSave('prototype-progress-v1.cfg',text=>/\[oil-fire\][\s\S]*flowers=3/.test(text));
    await shot('09-painted-success-kitchen');
    await tap(274,922);await page.waitForTimeout(450);await shot('10-painted-flower-stamp');
    report.checks.push('native painted title, map icons, journal, sound switches, entry and pause; real Web failure/retry and oil-fire success save');
    await tap(438,568);await shot('11-next-unlocked');
    const bedroom=pack('charging-bedroom'),shared=pack('hunt-shared');
    await tap(288,628);await Promise.all([bedroom,shared]);await page.waitForTimeout(1000);
    for(const point of [[74,288.4],[150.8,859.6],[483.6,556.4]]) {await tap(...point);await page.waitForTimeout(920);}
    await page.waitForTimeout(880);
    await waitSave('prototype-progress-v1.cfg',text=>/\[charging-bedroom\][\s\S]*flowers=3/.test(text));
    await shot('12-painted-success-hunt');
    await tap(274,922);await page.waitForTimeout(450);
    await tap(527,121);await shot('13-painted-journal-progress');await tap(288,950);
    await tap(527,43);await shot('14-home-return');
    report.checks.push('actual old hunt success picture and new credit; real journal reflects both finished levels');
    report.widths.push(view.width);
  } finally {await ctx.close();}
}

try {
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio','--no-proxy-server','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  await visit({width:390,height:844},{full:true});
  if(process.env.GODOT_UI_ONE_SIZE!=='1') await visit({width:320,height:640},{full:false});
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failures,[]);
  report.status='passed';
} catch(error){report.status='failed';report.exception=error.stack;process.exitCode=1;}
finally{try{if(browser)await browser.close();}finally{report.browserClosed=true;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}}
console.log(JSON.stringify(report,null,2));
