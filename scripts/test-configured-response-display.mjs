import {dependency,root} from './lib/dependencies.mjs';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {readPackage,checkArt} from './lib/packages.mjs';
const sharp=dependency('sharp');
for(const [id,original] of [['lift-wait','lift-room'],['well-call','well-room']]) {
  const pack=await readPackage({id,skin:'paperbook'});await checkArt(pack);
  const base=await sharp(join(root,'public/levels/transcript-v1',original+'.webp')).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const center=await sharp(join(root,'public',pack.skin.assets[pack.skin.background].src)).extract({left:0,top:0,width:base.info.width,height:base.info.height}).removeAlpha().raw().toBuffer();
  assert.deepEqual(center,base.data,`${id}: expanded background must retain the complete original RGB center`);
  console.log(`${id}: asset/alpha validation and original center RGB exact comparison passed`);
}
const out=join(mkdtempSync(join(tmpdir(),'flower-configured-display-')),'tests.mjs');
await dependency('esbuild').build({absWorkingDir:root,entryPoints:['tests/configured-response-display.test.ts'],bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
process.exitCode=spawnSync(process.execPath,['--test',out],{cwd:root,stdio:'inherit'}).status??1;
