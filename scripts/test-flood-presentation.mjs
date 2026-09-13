import {dependency,root} from './lib/dependencies.mjs';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const outfile=join(mkdtempSync(join(tmpdir(),'flood-presentation-tests-')),'tests.mjs');
const esbuild=dependency('esbuild');
await esbuild.build({absWorkingDir:root,entryPoints:['tests/flood-presentation.test.ts'],bundle:true,platform:'node',format:'esm',outfile,logLevel:'silent'});
const result=spawnSync(process.execPath,['--test',outfile],{cwd:root,stdio:'inherit'});
if(result.status!==0){process.exitCode=result.status??1;}else{
  const require=createRequire(import.meta.url);
  const {chromium}=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const bundle=await esbuild.build({absWorkingDir:root,entryPoints:['components/game/configured/presentation.ts'],bundle:true,platform:'browser',format:'iife',globalName:'FloodPresentationTest',write:false,logLevel:'silent'});
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
  try{
    const page=await browser.newPage({viewport:{width:320,height:568}});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const pixels=await page.evaluate(()=>{
      const api=globalThis.FloodPresentationTest;
      const canvas=document.createElement('canvas');canvas.width=220;canvas.height=220;
      const ctx=canvas.getContext('2d'),rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
      const box={x:10,y:10,w:190,h:190},polygons=[rect(20,20,70,170),rect(110,20,80,170).reverse()];
      const frame={kind:'rain',box,depth:1,intensity:1,time:5300,reduced:false,danger:0,inward:1,clipPolygons:polygons};
      const alpha=()=>ctx.getImageData(0,0,220,220).data;
      const scan=()=>{const data=alpha();let inside=0,outside=0;
        for(let y=0;y<220;y++)for(let x=0;x<220;x++)if(data[(y*220+x)*4+3]){
          if(y>=20&&y<190&&((x>=20&&x<90)||(x>=110&&x<190)))inside++;else outside++;
        }return {inside,outside};};
      const renders={};
      for(const kind of ['rain','water']){ctx.clearRect(0,0,220,220);api.drawPresentationEffect(ctx,{...frame,kind});renders[kind]=scan();}
      ctx.clearRect(0,0,220,220);ctx.save();
      api.clipPresentationRegion(ctx,{...frame,box:{x:40,y:40,w:100,h:100},clipPolygons:[rect(20,20,80,120),rect(80,20,100,120).reverse()]});
      ctx.fillStyle='#fff';ctx.fillRect(0,0,220,220);ctx.restore();
      const data=alpha(),at=(x,y)=>data[(y*220+x)*4+3];
      const union={left:at(50,60),overlap:at(90,60),right:at(120,60),outsideBox:at(30,60),belowBox:at(80,150)};
      ctx.clearRect(0,0,220,220);
      const gate={...frame,whenScene:{object:'scene',asset:'upstairs'}};
      const pack={skin:{world:{width:220,height:220},presentation:{durationMs:50000,effects:[gate]}},rules:{interactions:[]}};
      const run={elapsed:12000,resolved:[],action:null,risk:0,stages:[]};
      api.drawPresentation(ctx,pack,run,false,-Infinity,Infinity,[{id:'scene',asset:'downstairs'}]);
      const hidden=scan();
      api.drawPresentation(ctx,pack,run,false,-Infinity,Infinity,[{id:'scene',asset:'upstairs'}]);
      const visible=scan();
      return {renders,union,hidden,visible};
    });
    for(const [kind,counts] of Object.entries(pixels.renders))if(counts.outside!==0||counts.inside<30)throw new Error(`${kind} aperture pixel test failed: ${JSON.stringify(counts)}`);
    const u=pixels.union;if(u.left!==255||u.overlap!==255||u.right!==255||u.outsideBox!==0||u.belowBox!==0)throw new Error('polygon union / box intersection failed');
    if(pixels.hidden.inside||pixels.hidden.outside||pixels.visible.inside<30||pixels.visible.outside)throw new Error('actual scene filtering failed');
    const report={status:'passed',nodeTests:'passed',nativeCanvasPixels:pixels,browser:'isolated headless Edge, muted, finally closed',physicalPhone:'not_run'};
    const dir=join(root,'docs/flood-refinement/verification');mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,'generic-presentation-report.json'),JSON.stringify(report,null,2)+'\n');
    console.log('Native Canvas aperture, union, intersection and scene-switch pixel checks passed.');
  }finally{await browser.close();}
}
