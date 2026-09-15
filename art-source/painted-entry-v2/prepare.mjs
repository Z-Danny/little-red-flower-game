// ImageGen handles artwork; Sharp only crops transparent margins, resizes
// proportionally, adds a clear border, and encodes WebP.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { dependency } from '../../scripts/lib/dependencies.mjs';
const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(dir,'../..');
const sharp=dependency('sharp');
const sources={panel:'/Users/danny/.codex/generated_images/01a0a37e-e09f-74c2-9f71-7315c6dd632e/exec-cb5790a5-6eb3-4d2c-92d3-b94724f71bf7.png',button:'/Users/danny/.codex/generated_images/01a0a37e-e09f-74c2-9f71-7315c6dd632e/exec-ce28e371-b435-4e79-b78e-a7330e5cc856.png'};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const assets={};
copyFileSync(resolve(root,'public/ui/painted-v1/modal.png'),resolve(dir,'approved-reference.png'));
for(const [name,path] of Object.entries(sources)){
  copyFileSync(path,resolve(dir,`${name}-source.png`));
  const bytes=readFileSync(path),meta=await sharp(bytes).metadata();
  assert(meta.hasAlpha,`${name} must have generated alpha`);
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let left=info.width,top=info.height,right=0,bottom=0,clear=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const a=data[(y*info.width+x)*4+3];
    if(a===0)clear++;
    // Ignore invisible distant alpha=1 specks for bounding only; never repaint pixels.
    if(a>1){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  }
  assert(clear>0 && clear<info.width*info.height,`${name} needs real transparency and artwork`);
  const crop={left:Math.max(0,left-3),top:Math.max(0,top-3),width:Math.min(info.width,right+4)-Math.max(0,left-3),height:Math.min(info.height,bottom+4)-Math.max(0,top-3)};
  const scaled=await sharp(bytes).extract(crop).resize({width:956}).extend({top:2,right:2,bottom:2,left:2,background:'#00000000'}).png().toBuffer();
  const webp=await sharp(scaled).webp({quality:94,alphaQuality:100,effort:6}).toBuffer();
  const outfile=`public/ui/painted-v1/modal-${name}-v2.webp`;
  writeFileSync(resolve(root,outfile),webp);
  const check=await sharp(webp).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let alphaMin=255,alphaMax=0,transparent=0,edgeMax=0;
  for(let y=0;y<check.info.height;y++)for(let x=0;x<check.info.width;x++){
    const a=check.data[(y*check.info.width+x)*4+3];alphaMin=Math.min(alphaMin,a);alphaMax=Math.max(alphaMax,a);transparent+=a===0;
    if(!x||!y||x===check.info.width-1||y===check.info.height-1)edgeMax=Math.max(edgeMax,a);
  }
  assert.equal(edgeMax,0);assert.equal(alphaMin,0);assert.equal(alphaMax,255);
  assets[name]={path:outfile,width:check.info.width,height:check.info.height,bytes:webp.length,sha256:hash(webp),source:`art-source/painted-entry-v2/${name}-source.png`,sourceSha256:hash(bytes),sourceSize:{width:info.width,height:info.height},crop,transparentOutputBorder:2,validation:{hasAlpha:true,alphaMin,alphaMax,edgeAlphaMax:edgeMax,fullyTransparentFraction:transparent/(check.info.width*check.info.height)}};
}
const manifest={version:1,generation:'OpenAI built-in image_gen__imagegen. Two edit calls with the original modal as referenced_image_paths. No CLI/API fallback.',preparation:'Sharp only: alpha bounding crop, proportional resize to width 956, 2px transparent border, WebP compression. Generated alpha preserved.',approvedReference:{path:'art-source/painted-entry-v2/approved-reference.png',sha256:hash(readFileSync(resolve(dir,'approved-reference.png')))},generatedSources:sources,prompts:{path:'art-source/painted-entry-v2/prompts.json',sha256:hash(readFileSync(resolve(dir,'prompts.json')))},assets,layout:{units:'percent of full image unless noted',title:{left:24,top:5,width:55,height:13},bodySafe:{left:10,top:29,width:79,height:48},buttonSuggested:{left:15,top:70,width:70},buttonLabel:{left:12,top:18,width:76,height:60},recommendedCss:{panelWidth:320,buttonWidth:220,buttonHeight:52},note:'Panel is a complete single image around 1.10:1. Keep title within the green plaque; place body and independent button with CSS. Decorative lower-right leaves begin around 82% down the panel.'},visualReview:{embeddedPanelButton:'removed and natural ivory paper filled',titleAndBodyText:'none',buttonTextAndIcons:'none',exteriorAlpha:'verified',leafTips:'complete'}};
writeFileSync(resolve(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(assets,null,2));
