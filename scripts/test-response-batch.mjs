import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,cpSync,writeFileSync,readFileSync,symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './lib/dependencies.mjs';
const parent=join(root,'outputs/response-batch-smoke');mkdirSync(parent,{recursive:true});const fixture=mkdtempSync(join(parent,'run-'));
for(const path of ['scripts/lib','app/game/runtime','app/game/response','content/templates','content/response']){mkdirSync(join(fixture,path),{recursive:true});cpSync(join(root,path),join(fixture,path),{recursive:true});}
cpSync(join(root,'scripts/levels.mjs'),join(fixture,'scripts/levels.mjs'));cpSync(join(root,'tsconfig.json'),join(fixture,'tsconfig.json'));
symlinkSync(join(root,'node_modules'),join(fixture,'node_modules'),'junction');symlinkSync(join(root,'public'),join(fixture,'public'),'junction');
writeFileSync(join(fixture,'content/catalog.json'),'[]');
writeFileSync(join(fixture,'batch.json'),JSON.stringify([{id:'response-batch-a',kind:'response',title:'批产验收 A',order:901},{id:'response-batch-b',kind:'response',title:'批产验收 B',order:902}]));
const run=(...args)=>spawnSync(process.execPath,['scripts/levels.mjs',...args],{cwd:fixture,encoding:'utf8'});
const created=run('batch','--file','batch.json');assert.equal(created.status,0,created.stderr);const catalog=JSON.parse(readFileSync(join(fixture,'content/catalog.json')));assert.equal(catalog.length,2);assert.ok(catalog.every(x=>!x.enabled));
for(const entry of catalog){const skin=JSON.parse(readFileSync(join(fixture,'content/levels',entry.id,'skins/illustrated.json')));assert.equal(skin.response.kind,'fire');assert.equal(skin.response.cues.actions['water-error'].sound,'fx-water');assert.ok(!JSON.stringify(skin.response).includes('voice'));}
assert.notEqual(run('batch','--file','batch.json').status,0);assert.notEqual(run('enable','--id','response-batch-a').status,0);
console.log('PASS: two isolated response drafts inherit pressure/actor/nonverbal audio; duplicate creation and unreviewed enable refused. '+fixture);
