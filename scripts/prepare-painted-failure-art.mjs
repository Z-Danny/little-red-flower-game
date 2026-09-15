// Reusable failure-modal artwork. Creative edits come only from built-in ImageGen.
// Sharp only crops alpha margins, scales proportionally, slices and encodes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dependency, root } from './lib/dependencies.mjs';
const sharp = dependency('sharp');
const source = join(root, 'art-source/painted-failure-v1');
const output = join(root, 'public/ui/painted-failure-v1');
mkdirSync(output, {recursive: true});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assets = {};
async function record(name, png, webp, extra = {}) {
  const meta = await sharp(png).metadata();
  assert(meta.hasAlpha, `${name}: actual transparency required`);
  const {data, info} = await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let alphaMin = 255, alphaMax = 0, transparent = 0;
  for(let i=3; i<data.length; i+=4) { alphaMin=Math.min(alphaMin,data[i]);alphaMax=Math.max(alphaMax,data[i]);if(data[i]===0)transparent++; }
  assert(alphaMin===0 && alphaMax===255, `${name}: alpha bounds invalid`);
  assets[name] = {width:info.width,height:info.height,
    png:`public/ui/painted-failure-v1/${name}.png`,webp:`public/ui/painted-failure-v1/${name}.webp`,
    pngBytes:png.length,webpBytes:webp.length,pngSha256:hash(png),webpSha256:hash(webp),
    validation:{hasAlpha:true,alphaMin,alphaMax,fullyTransparentFraction:transparent/(info.width*info.height)},...extra};
}
async function save(name, png, extra={}) {
  const webp = await sharp(png).webp({quality:94,alphaQuality:100,effort:6}).toBuffer();
  writeFileSync(join(output, `${name}.png`),png);
  writeFileSync(join(output, `${name}.webp`),webp);
  await record(name,png,webp,extra);
}
for(const name of ['panel','secondary-button']) {
  const bytes=readFileSync(join(source,`${name}-source.png`));
  assert((await sharp(bytes).metadata()).hasAlpha);
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let x0=info.width,y0=info.height,x1=0,y1=0;
  // Locate visible silhouette; retain every original pixel within the rectangle.
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>1){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  assert(x0>0&&y0>0&&x1<info.width-1&&y1<info.height-1,`${name}: artwork must not touch source boundary`);
  const pad=6;
  const crop={left:Math.max(0,x0-pad),top:Math.max(0,y0-pad),width:Math.min(info.width,x1+pad+1)-Math.max(0,x0-pad),height:Math.min(info.height,y1+pad+1)-Math.max(0,y0-pad)};
  const png=await sharp(bytes).extract(crop).resize({width:960})
    .extend({top:2,right:2,bottom:2,left:2,background:'#00000000'}).png().toBuffer();
  await save(name,png,{source:`art-source/painted-failure-v1/${name}-source.png`,sourceSha256:hash(bytes),sourceSize:{width:info.width,height:info.height},crop,transparentOutputBorder:2});
}
// Reuse approved primary button byte-for-byte, not an artistic recoloring.
for(const extension of ['png','webp'])copyFileSync(join(root,`public/ui/painted-settlement-v1/button.${extension}`),join(output,`button.${extension}`));
await record('button',readFileSync(join(output,'button.png')),readFileSync(join(output,'button.webp')),
  {reusedFrom:'public/ui/painted-settlement-v1/button.{png,webp}',creativeModification:'none; identical bytes'});
const panel=readFileSync(join(output,'panel.png'));
const {width,height}=assets.panel;
const crops={header:{left:0,top:0,width,height:250},body:{left:0,top:250,width,height:830},footer:{left:0,top:1080,width,height:height-1080}};
for(const [name,crop] of Object.entries(crops))await save(name,await sharp(panel).extract(crop).png().toBuffer(),{source:'public/ui/painted-failure-v1/panel.png',crop});
const manifest={version:1,generation:'OpenAI built-in image_gen, exact empty completion frame edited to a gentle try-again sibling.',
  preparation:'Sharp only alpha-bounding crop, transparent padding, proportional resize, rectangular slicing and encoding. Golden primary copied byte-for-byte.',
  reference:{path:'art-source/painted-failure-v1/reference-panel.png',sha256:hash(readFileSync(join(source,'reference-panel.png')))},
  generatedSources:{panel:'/Users/danny/.codex/generated_images/01a0a350-9461-7171-b9b2-738b870c448c/exec-2b0a8ef1-49f0-4ee2-9f2a-461800a97727.png',secondaryButton:'/Users/danny/.codex/generated_images/01a0a350-9461-7171-b9b2-738b870c448c/exec-b19b5786-5c50-41b4-b3a3-2c0bf24b1443.png',secondaryButtonWideBeforeAdjustment:'/Users/danny/.codex/generated_images/01a0a350-9461-7171-b9b2-738b870c448c/exec-de98c0ee-da27-499a-9dc9-366a79416796.png'},
  prompts:['art-source/painted-failure-v1/prompts.json','art-source/painted-failure-v1/secondary-button-proportion-prompt.txt'],assets,
  layout:{units:'percent of identified image/slice',titleRelativeToHeaderSlice:{left:24,top:19,width:52,height:54},bodyText:{left:9,width:81},buttonLabel:{left:12,top:17,width:76,height:62},secondaryButtonLabel:{left:14,top:20,width:72,height:58},headerHeightToWidthRatio:250/width,footerHeightToWidthRatio:(height-1080)/width,
    sliceRule:'Full-width continuous slices. Header and footer preserve natural aspect ratio; only body stretches vertically. Main and secondary buttons live in body bottom with normal HTML flow, above footer flower-bud ornament. Do not put body text or buttons into corner decoration.',
    nineSliceAlternative:{top:250,left:50,right:50,bottom:height-1080},
    suggestedButtonsAt390Viewport:{primaryWidth:164,secondaryWidth:120,height:52,note:'Secondary source is intentionally shorter than primary; proportional source preparation only. Modest CSS size adjustment is permitted for the specified button slots.'}},
  visualReview:{text:'none',hand:'none',openRewardFlowers:'none',trophy:'none',topLeft:'one hopeful closed red bud with two leaves',bottomRight:'small closed red bud and leaves',allTipsFullyInsideSource:true,alpha:'verified'}};
writeFileSync(join(source,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(assets).map(([name,a])=>[name,{width:a.width,height:a.height,bytes:a.webpBytes,alpha:a.validation}])),null,2));
