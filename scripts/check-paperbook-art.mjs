import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {dependency,root} from './lib/dependencies.mjs';
const sharp=dependency('sharp'), report=[];
for(const level of ['kitchen','typhoon']) {
  const skin=JSON.parse(readFileSync(join(root,`content/presets/${level}/skin.json`),'utf8'));
  for(const [id,path] of Object.entries(skin.assets)) {
    assert.ok(path.startsWith(`/levels/paperbook-${level}-v1/`),`${level}/${id}: wrong skin`);
    const bytes=readFileSync(join(root,'public',path));
    const meta=await sharp(bytes).metadata();
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let transparent=0,opaque=0,edgeMax=0,magenta=0;
    for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
      const n=(y*info.width+x)*4, [r,g,b,a]=data.subarray(n,n+4);
      transparent+=a===0;opaque+=a===255;
      if(!x||!y||x===info.width-1||y===info.height-1) edgeMax=Math.max(edgeMax,a);
      if(a>220 && r-g>55 && b-g>55) magenta++;
    }
    if(id!=='room') {
      assert.ok(meta.hasAlpha && transparent && opaque,`${id}: alpha missing`);
      assert.equal(edgeMax,0,`${id}: opaque outer edge`);
      assert.equal(magenta,0,`${id}: chroma contamination`);
    }
    if(level==='kitchen' && id==='knife') {
      // Interior of the generated blade must not have been removed as gray matte.
      for(const [x,y] of [[.30,.34],[.39,.43],[.48,.52]]) {
        assert.ok(data[(Math.floor(y*info.height)*info.width+Math.floor(x*info.width))*4+3]>240,'knife blade has a hole');
      }
    }
    report.push({level,id,path,width:meta.width,height:meta.height,transparent,opaque,edgeMax,magenta,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
}
assert.equal(report.length,30);
const out=join(root,'outputs/paperbook-review');mkdirSync(out,{recursive:true});
writeFileSync(join(out,'asset-validation.json'),JSON.stringify({passed:true,assetCount:30,alphaSprites:28,checks:report},null,2));
console.log('PASS: 30 paperbook assets, 28 RGBA cutouts, no chroma contamination; knife blade intact.');
