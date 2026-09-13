import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const file=path.resolve(root,process.argv[2]??'outputs/本地离线版/小红花应急行动.html');
const baseline=process.argv.includes('--baseline');
const out=path.join(root,'docs/flower-journey/entry-layout-verification',baseline?'baseline':'');
fs.mkdirSync(out,{recursive:true});
const report={status:'running',sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),checks:[],geometry:[],errors:[],network:[],browserClosed:false,physicalDevice:'not_run'};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--mute-audio']});
let p;
const check=s=>{report.checks.push(s);console.log('PASS '+s);};
const save=()=>p.evaluate(()=>localStorage.getItem('little-red-flower-leaderboard-v1'));
try {
 p=await browser.newPage({viewport:{width:704,height:828},reducedMotion:'reduce'});
 p.on('pageerror',e=>report.errors.push(e.message));
 p.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url());});
 await p.goto(pathToFileURL(file).href);
 await p.locator('[data-home-start]').waitFor();
 await p.evaluate(()=>document.fonts.ready);
 // Screenshot fixture only; no game reward is claimed by this layout test.
 const ids=JSON.parse(fs.readFileSync(path.join(root,'content/journey-map.json'),'utf8')).regions.flatMap(r=>r.nodes.map(n=>n.id));
 await p.evaluate(ids=>{const k='little-red-flower-leaderboard-v1',s=JSON.parse(localStorage.getItem(k));s.players.find(x=>x.id===s.activePlayerId).completed=Object.fromEntries(ids.slice(0,12).map((id,i)=>[id,i===11?2:3]));localStorage.setItem(k,JSON.stringify(s));},ids);
 await p.reload();
 await p.locator('[data-home-continue]').waitFor();
 const before=await save();
 const sizes=baseline?[[704,828]]:[[320,568],[390,844],[520,830],[540,830],[704,828],[1440,900]];
 for(const [width,height]of sizes){
  await p.setViewportSize({width,height});
  const title=await p.locator('.title-screen').boundingBox();
  await p.screenshot({path:path.join(out,`title-${width}.png`)});
  await p.locator('[data-home-continue]').click();
  await p.locator('.garden-shell').waitFor();
  const map=await p.locator('.garden-shell').boundingBox();
  const item={viewport:{width,height},title,map,regions:[]};report.geometry.push(item);
  for(const region of ['nature','public','home']){
   await p.locator(`[data-category="${region}"]`).click();
   const g=await p.locator('.garden-header').evaluate(header=>{
    const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const link=header.querySelector('.garden-home-link');
    const texts=[...link.children].map(n=>{const r=document.createRange();r.selectNodeContents(n);return {text:n.textContent,...rect(r)};});
    return {link:rect(link),actions:rect(header.querySelector('.garden-top-actions')),texts,controls:[...header.querySelectorAll('button')].map(rect)};
   });
   item.regions.push({region,...g});
   if(region==='nature'||(region==='home'&&width===320))await p.screenshot({path:path.join(out,`map-${region}-${width}.png`)});
   if(!baseline){
    for(const t of g.texts){assert(t.left>=map.x&&t.right<=map.x+map.width,`clipped text ${width} ${region} ${JSON.stringify(t)}`);assert(t.left>=g.link.left-1&&t.right<=g.link.right+1,`text overflows button ${width} ${region}`);assert(t.right<=g.actions.left,`text overlaps actions ${width} ${region}`);}
    for(const c of g.controls)assert(c.width>=44&&c.height>=44,`small target ${width} ${region}`);
   }
  }
  await p.getByRole('button',{name:'返回游戏首页',exact:true}).click();
  if(!baseline){for(const key of ['x','y','width','height'])assert(Math.abs(title[key]-map[key])<1,`frame mismatch ${width} ${key}: ${title[key]} vs ${map[key]}`);assert.equal(title.width,Math.min(width,520));check(`matching frame and complete three-region headers ${width}x${height}`);}
 }
 assert.equal(await save(),before);check('navigation preserves the 35-flower save fixture');
 await p.reload();await p.locator('[data-home-continue]').click();await p.locator('.garden-shell').waitFor();assert.equal(await save(),before);check('continue after reload preserves save');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);
 report.status=baseline?'baseline-recorded':'passed';
}catch(e){report.status='failed';report.failure=e.stack;process.exitCode=1;console.error(e);await p?.screenshot({path:path.join(out,'FAIL.png')}).catch(()=>{});}
finally{await browser.close();report.browserClosed=true;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
