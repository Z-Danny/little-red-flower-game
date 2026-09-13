import fs from 'node:fs';import path from 'node:path';import {dependency,root} from './lib/dependencies.mjs';
const sharp=dependency('sharp'),base=process.argv[2];
if(!base)throw Error('Usage: node scripts/prepare-fire-stairs-art.mjs <original-image-directory>; see image-prompts.md for the generated originals');
const targets=[['family-taking-phone','exec-b0531f6c-ed61-469c-b86a-7465390f567b.png'],['family-calling','exec-15dd82ae-03fb-45bf-8265-5711adf70c8d.png']];
const out=path.join(root,'public/levels/fire-stairs-refinement-v1');fs.mkdirSync(out,{recursive:true});
const report=[];
for(const [name,file]of targets){
 const src=path.join(base,file),{data,info}=await sharp(src).ensureAlpha().raw().toBuffer({resolveWithObject:true}),{width:w,height:h}=info,n=w*h;
 // Only flood-fill neutral checkerboard pixels reachable from the image edge.
 // The warm painting is kept; enclosed eyes, phone and clothing are not keyed.
 const bg=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0;
 const push=i=>{if(bg[i])return;const j=i*4,r=data[j],g=data[j+1],b=data[j+2];if(Math.min(r,g,b)>105&&Math.max(r,g,b)-Math.min(r,g,b)<16){bg[i]=1;queue[tail++]=i;}};
 for(let x=0;x<w;x++){push(x);push((h-1)*w+x);}for(let y=0;y<h;y++){push(y*w);push(y*w+w-1);}
 // Inspected enclosed background gap between mother and child (not their eyes).
 push(820*w+350);
 while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);if(x)push(i-1);if(x<w-1)push(i+1);if(y)push(i-w);if(y<h-1)push(i+w);}
 for(let i=0;i<n;i++)if(bg[i])data[i*4+3]=0;
 // Erode one edge pixel: discard neutral antialias contamination, retain alpha.
 const alpha=Uint8Array.from({length:n},(_,i)=>data[i*4+3]);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!alpha[i])continue;const near=[i-1,i+1,i-w,i+w].filter(k=>!alpha[k]).length;if(near)data[i*4+3]=near>=2?0:120;}
 const dest=path.join(out,name+'.webp');await sharp(data,{raw:{width:w,height:h,channels:4}}).webp({quality:94,alphaQuality:100}).toFile(dest);
 const meta=await sharp(dest).metadata();if(!meta.hasAlpha||tail<n*.25||tail>n*.85)throw Error('Cutout review required');
 report.push({name,source:src,width:w,height:h,transparentPixels:tail,hasAlpha:meta.hasAlpha});
}
fs.mkdirSync(path.join(root,'docs/fire-stairs-refinement'),{recursive:true});
fs.writeFileSync(path.join(root,'docs/fire-stairs-refinement/art-processing.json'),JSON.stringify(report,null,2));console.log(report);
