import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import baseline from './fixtures/display-response-baseline.json';
import {validatePackage} from '../app/game/runtime/validate';
import {cameraFor,toWorld} from '../app/game/runtime/scene';
import {ConfiguredPlayer} from '../components/game/configured/player';
const read=(p:string)=>readFileSync(join(process.cwd(),p));
const json=(p:string)=>JSON.parse(read(p).toString('utf8'));
const hash=(v:unknown)=>createHash('sha256').update(Buffer.isBuffer(v)?v:typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const pack=(id:string)=>validatePackage(json(`content/levels/${id}/level.json`),json(`content/levels/${id}/skins/paperbook.json`));
const sizes=[[320,568],[375,667],[390,844],[430,932],[360,900]];
for(const [id,frozen] of Object.entries(baseline.levels)) {
  test(`${id}: rules, every pose/state/animation/zone and non-background asset mapping unchanged`,()=>{
    const p=pack(id),skin=p.skin as unknown as Record<string,unknown>;
    assert.equal(hash(read(`content/levels/${id}/level.json`)),frozen.rulesSha256);
    for(const [field,sha] of Object.entries(frozen.logical))assert.equal(hash(skin[field]),sha,field);
    assert.equal(hash(Object.fromEntries(Object.entries(p.skin.assets).filter(([key])=>key!==p.skin.background))),frozen.nonBackgroundAssets);
  });
  for(const [width,height] of sizes)test(`${id}: ${width}x${height} exact cover and same inverse`,()=>{
    const p=pack(id),b=p.skin.framing!.sceneBounds,c=cameraFor(p,width,height);
    assert.equal(c.scale,Math.max(width/b.w,height/b.h));
    assert.ok(c.x+b.x*c.scale<=.001&&c.y+b.y*c.scale<=.001);
    assert.ok(c.x+(b.x+b.w)*c.scale>=width-.001&&c.y+(b.y+b.h)*c.scale>=height-.001);
    for(const point of [{x:0,y:0},{x:234.25,y:667.6},{x:720,y:1280}]) {
      const back=toWorld(p,{x:12+c.x+point.x*c.scale,y:17+c.y+point.y*c.scale},{left:12,top:17,width,height});
      assert.ok(Math.abs(back.x-point.x)<1e-8&&Math.abs(back.y-point.y)<1e-8);
    }
  });
  test(`${id}: framing validation rejects undocumented pixels or transparent replacement`,()=>{
    const p=pack(id);delete p.skin.assets[p.skin.background].sceneBounds;
    assert.throws(()=>validatePackage(p.rules,p.skin),/实际背景未覆盖/);
    const q=pack(id);q.skin.assets[q.skin.background].alpha=true;
    assert.throws(()=>validatePackage(q.rules,q.skin),/不透明背景/);
  });
}
test('independent foreground PNG bytes (including their alpha masks) remain identical',()=>{
  for(const [src,sha] of Object.entries(baseline.assetBytes))assert.equal(hash(read(`public${src}`)),sha,src);
});
test('engine, catalog, generated registry and both out-of-scope prevention packages remain byte-identical',()=>{
  for(const [path,sha] of Object.entries(baseline.unchanged))assert.equal(hash(read(path)),sha,path);
});
for(const id of ['flood-kit','clear-corridor'])test(`${id}: legacy prevention surface and contain camera are preserved`,()=>{
  const p=pack(id);
  for(const [w,h] of sizes){const scale=Math.min(w/p.skin.world.width,h/p.skin.world.height);assert.deepEqual(cameraFor(p,w,h),{scale,x:(w-p.skin.world.width*scale)/2,y:(h-p.skin.world.height*scale)/2});}
  const html=renderToStaticMarkup(createElement(ConfiguredPlayer,{pack:p,onBack:()=>{},onFinish:()=>{}}));
  assert.ok(!html.includes('data-game-surface'));assert.ok(html.includes('configured-targets'));
});
test('response surface opt-in does not introduce a new answer checklist or practice audio/stages',()=>{
  const html=renderToStaticMarkup(createElement(ConfiguredPlayer,{pack:pack('lift-wait'),onBack:()=>{},onFinish:()=>{}}));
  assert.ok(html.includes('data-game-surface'));assert.ok(!html.includes('configured-targets'));
  for(const file of ['components/game/configured/player.tsx','app/game/runtime/scene.ts'])assert.doesNotMatch(read(file).toString('utf8'),/usePracticeAudio|presentationActors|pickRelevantZone/);
});
