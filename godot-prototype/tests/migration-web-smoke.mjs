/** Final exported HTML/WASM on private or local HTTPS, with real touch and isolated saves. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = path.resolve(import.meta.dirname, '../..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || path.join(root, 'outputs/browser-tools/node_modules/playwright'));
const url = process.env.GODOT_PREVIEW_URL;
if (!url) throw new Error('Set GODOT_PREVIEW_URL to the HTTPS URL of the streamed Godot build.');
const allowedOrigin = new URL(url).origin;
const out = path.resolve(root, process.env.GODOT_SMOKE_OUTPUT || 'outputs/godot-migration/browser');
const files = path.resolve(root, process.env.GODOT_EXPORT || 'outputs/godot-migration/web');
const report = {url, status:'running', checks:[], media:[], errors:[], failedRequests:[], physicalDevice:'not_run', humanAudio:'not_run'};
const view = {width:390,height:844};
fs.mkdirSync(out,{recursive:true});
report.sha256 = Object.fromEntries(['index.html','index.pck','index.js','index.wasm'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(files,name))).digest('hex')]));

async function savedProgress() {
  if (!(await indexedDB.databases()).some(db=>db.name==='/userfs')) return '';
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open('/userfs');
    r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{
      const db=r.result;
      if (!db.objectStoreNames.contains('FILE_DATA')) { db.close(); resolve(''); return; }
      const c=db.transaction('FILE_DATA','readonly').objectStore('FILE_DATA').openCursor();
      c.onerror=()=>{db.close();reject(c.error);};
      c.onsuccess=()=>{
        const item=c.result;
        if (!item) {db.close();resolve('');}
        else if (String(item.key).endsWith('/prototype-progress-v1.cfg')) {db.close();resolve(new TextDecoder().decode(item.value.contents));}
        else item.continue();
      };
    };
  });
}

let browser, context;
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio','--no-proxy-server','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:view,hasTouch:true});
  await context.route('**/*',route=>new URL(route.request().url()).origin===allowedOrigin?route.continue():route.abort());
  const page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'||/SCRIPT ERROR|^ERROR:/.test(m.text()))report.errors.push(m.text());});
  page.on('requestfailed',r=>report.failedRequests.push(r.url()+' '+r.failure()?.errorText));
  page.on('response',r=>{if(r.status()>=400)report.failedRequests.push(r.status()+' '+r.url()); if(r.ok() && r.url().includes('/packs/'))report.media.push(r.url().split('/').at(-1));});
  const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const screenshot=async name=>{await frame(); await page.screenshot({path:path.join(out,name+'.png')});};
  const locate=(x,y)=>[x*390/576,y*390/576+(844-1024*390/576)/2];
  const tap=async(x,y)=>{await page.touchscreen.tap(...locate(x,y));await frame();};
  const pack=async name=>{
    const response=await page.waitForResponse(r=>r.url().includes('/packs/'+name+'-')&&r.ok(),{timeout:22000});
    await response.finished();
  };
  const ready=async()=>{await page.locator('#status').waitFor({state:'detached',timeout:65000});await frame();};
  const drag=async(from,to)=>{
    const a=locate(...from),b=locate(...to);
    const touch=(x,y)=>[{x,y,id:4}];
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(...a)});
    for(let step=1;step<=10;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch(a[0]+(b[0]-a[0])*step/10,a[1]+(b[1]-a[1])*step/10)});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  const readUntil=async condition=>{
    for(let i=0;i<22;i++) {const data=await page.evaluate(savedProgress);if(condition(data))return data;await page.waitForTimeout(350);}
    throw new Error('Progress did not persist in IndexedDB');
  };
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:65000});
  assert.equal(response?.status(),200);
  await ready();
  assert.equal(report.media.length,0);
  await screenshot('01-title');
  await tap(475,879);
  const campus=pack('map-campus');await tap(348,530);await campus;await page.waitForTimeout(650);
  await tap(450,971);
  await screenshot('02-campus-locked');
  await tap(370,650);
  assert.equal(report.media.length,1,'a draft must not load or launch gameplay');
  assert.equal(await page.evaluate(savedProgress),'');
  await tap(152,645);
  await tap(78,50);
  await tap(208,786);await page.waitForTimeout(420);
  const home=pack('map-home');await tap(348,530);await home;await page.waitForTimeout(650);
  await screenshot('03-home-map');
  await tap(137,433);
  const oil=pack('oil-fire');await tap(375,650);await oil;await page.waitForTimeout(1000);
  await screenshot('04-oil-fire');
  await tap(201,390);await page.waitForTimeout(770);
  await drag([152,689],[214,326]);await page.waitForTimeout(970);
  await drag([460,416],[484,368]);await page.waitForTimeout(1760);
  const first=await readUntil(data=>/\[oil-fire\][\s\S]*flowers=3/.test(data));
  assert.doesNotMatch(first,/\[charging-bedroom\]/);
  await screenshot('05-oil-settlement');
  await tap(170,709);
  await tap(438,568);
  await screenshot('06-bed-room-unlocked');
  const bedroom=pack('charging-bedroom'),shared=pack('hunt-shared');
  await tap(375,650);await Promise.all([bedroom,shared]);await page.waitForTimeout(850);
  await screenshot('07-charge-room');
  for (const point of [[74,288.4],[150.8,859.6],[483.6,556.4]]) {
    await tap(...point);await page.waitForTimeout(940);
  }
  await page.waitForTimeout(820);
  const second=await readUntil(data=>/\[charging-bedroom\][\s\S]*flowers=3/.test(data));
  assert.match(second,/\[oil-fire\][\s\S]*flowers=3/);
  await screenshot('08-charge-settlement');
  report.checks.push('unfinished campus stop stays locked; oil fire unlocks the bedroom; two original levels complete and save by ID');
  const totalRequests=report.media.length;
  await page.reload({waitUntil:'domcontentloaded'});await ready();
  assert.equal(await page.evaluate(savedProgress),second);
  await tap(475,879);await tap(208,786);await page.waitForTimeout(420);
  await tap(348,530);await page.waitForTimeout(800);
  await screenshot('09-cached-home-map');
  assert.equal(report.media.length,totalRequests,'page reload must reuse the cached island instead of downloading again');
  assert.deepEqual(report.errors,[]);
  assert.deepEqual(report.failedRequests,[]);
  report.checks.push('web shell uses no island or game media before entry; five media transfers on demand; island pack cache and saves survive reload');
  report.status='passed';
} catch(error) {
  report.status='failed';report.failure=error.stack;process.exitCode=1;
} finally {
  try{if(context){await context.close();report.contextClosed=true;}}
  finally{try{if(browser){await browser.close();report.browserClosed=true;}}
  finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}}
}
console.log(JSON.stringify(report,null,2));
