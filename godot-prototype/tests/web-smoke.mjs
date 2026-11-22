/** Play the generated HTML/WASM in an isolated, muted browser. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(root,'outputs/browser-tools/node_modules/playwright'));
const url = process.env.GODOT_PREVIEW_URL || 'http://127.0.0.1:8088/';
const origin = new URL(url).origin;
const output = path.resolve(root,'outputs/godot-prototype/verification');
const viewport = {width:390,height:844};
const report = {url,viewport,status:'running',checks:[],errors:[],failedRequests:[],offOrigin:[],physicalDevice:'not_run',humanAudio:'not_run'};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(output,{recursive:true});
report.sha256 = Object.fromEntries(['index.html','index.js','index.pck','index.wasm'].map(name=>[name,hash(fs.readFileSync(path.join(root,'outputs/godot-prototype/web',name)))]));

async function readUserfs() {
  if (!(await indexedDB.databases()).some(db=>db.name==='/userfs')) return null;
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('/userfs');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result;
      if (!db.objectStoreNames.contains('FILE_DATA')) {db.close();resolve(null);return;}
      const cursor=db.transaction('FILE_DATA','readonly').objectStore('FILE_DATA').openCursor();
      cursor.onerror=()=>{db.close();reject(cursor.error);};
      cursor.onsuccess=()=>{
        const row=cursor.result;
        if (!row) {db.close();resolve(null);}
        else if (String(row.key).endsWith('/prototype-progress-v1.cfg')) {
          const contents=new TextDecoder().decode(row.value.contents);
          db.close();resolve(contents);
        } else row.continue();
      };
    };
  });
}

let browser, context;
try {
  browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio','--no-proxy-server','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport,hasTouch:true});
  await context.route('**/*',async route=>{
    const target=route.request().url();
    if (new URL(target).origin===origin) await route.continue();
    else {report.offOrigin.push(target);await route.abort();}
  });
  const page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error'||/SCRIPT ERROR|^ERROR:/.test(message.text()))report.errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)report.failedRequests.push(response.status()+' '+response.url());});
  page.on('requestfailed',request=>report.failedRequests.push(request.failure()?.errorText+' '+request.url()));
  const status = await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  assert.equal(status?.status(),200);
  const ready=()=>page.locator('#status').waitFor({state:'detached',timeout:65000});
  await ready();
  const at=async(x,y)=>{
    const b=await page.locator('#canvas').boundingBox();
    const k=Math.min(b.width/576,b.height/1024);
    return {x:b.x+(b.width-k*576)/2+k*x,y:b.y+(b.height-k*1024)/2+k*y};
  };
  const tap=async(x,y)=>{const p=await at(x,y);await page.touchscreen.tap(p.x,p.y);};
  const drag=async(start,end)=>{
    const a=await at(...start),b=await at(...end);
    const touch=(x,y)=>[{x,y,id:7}];
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(a.x,a.y)});
    for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch(a.x+(b.x-a.x)*i/10,a.y+(b.y-a.y)*i/10)});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const shot=async name=>{await frame();return hash(await page.screenshot({path:path.join(output,name+'.png')}));};
  assert.equal(await page.evaluate(readUserfs),null);
  const start=await shot('01-home');
  await tap(288,860);
  const campus=await shot('02-campus-01');
  assert.notEqual(start,campus);
  await drag([473,650],[108,650]);
  await page.waitForTimeout(430);
  const island=await shot('03-home-island-02');
  assert.notEqual(island,campus);
  await tap(288,829);
  const map=await shot('04-home-map');
  assert.notEqual(map,island);
  await tap(138,443);
  const intro=await shot('05-practice-intro');
  assert.notEqual(intro,map);
  await tap(370,612);
  const kitchen=await shot('06-kitchen');
  assert.notEqual(kitchen,intro);
  report.checks.push('final exported HTML: touch swipe and badge tap open the home map and kitchen');

  await drag([315,664],[214,326]);
  await page.waitForTimeout(2250);
  const fail=await shot('07-failed');
  assert.notEqual(fail,kitchen);
  assert.equal(await page.evaluate(readUserfs),null,'failed run must not write rewards');
  await tap(397,713);
  await frame();
  await tap(201,390);
  await page.waitForTimeout(800);
  await drag([152,689],[214,326]);
  await page.waitForTimeout(1020);
  await drag([460,416],[484,368]);
  await page.waitForTimeout(1800);
  const win=await shot('08-succeeded');
  assert.notEqual(win,fail);
  let saved=null;
  for(let i=0;i<20 && saved===null;i++) {
    saved=await page.evaluate(readUserfs);
    if(saved===null)await page.waitForTimeout(350);
  }
  assert.match(saved??'',/\[oil-fire\]/);
  assert.match(saved??'',/flowers=3/);
  report.checks.push('failed water action grants nothing; retry, knob tap, lid drag and person drag award three flowers');
  await page.reload({waitUntil:'domcontentloaded'});
  await ready();
  assert.equal(await page.evaluate(readUserfs),saved);
  const continued=await shot('09-reload-continue');
  assert.notEqual(continued,start);
  report.checks.push('progress persists after browser reload');
  await page.setViewportSize({width:844,height:390});
  await shot('10-landscape-home');
  assert.deepEqual(report.errors,[]);
  assert.deepEqual(report.failedRequests,[]);
  assert.deepEqual(report.offOrigin,[]);
  report.status='passed';
} catch(error) {
  report.status='failed';report.failure=error.stack;process.exitCode=1;
} finally {
  try {if(context){await context.close();report.contextClosed=true;}}
  finally {
    try {if(browser){await browser.close();report.browserClosed=true;}}
    finally {fs.writeFileSync(path.join(output,'web-smoke.json'),JSON.stringify(report,null,2));}
  }
}
console.log(JSON.stringify(report,null,2));
