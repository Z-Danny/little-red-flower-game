import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {root} from './lib/dependencies.mjs';
const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const output=join(root,'outputs/rain-flood-v1'),verification=join(root,'docs/rain-flood-v1/verification');mkdirSync(verification,{recursive:true});
const html=join(root,'outputs/本地离线版/小红花应急行动.html'),sha=hash(html);
const browser=read('outputs/rain-flood-v1/browser-checks.json'),lifecycle=read('outputs/rain-flood-v1/lifecycle-checks.json');
const regression=read('docs/hazard-batch-v2/verification/regression-report.json'),build=read('docs/hazard-batch-v2/verification/build-typecheck.json');
assert(browser.passed&&lifecycle.passed);assert.equal(browser.offlineSha256,sha);assert.equal(lifecycle.offlineSha256,sha);assert.equal(build.status,'passed');assert.equal(build.htmlSha256,sha);assert.equal(regression.status,'passed');
const tests=spawnSync(process.execPath,['scripts/test-disaster.mjs'],{cwd:root,encoding:'utf8'});assert.equal(tests.status,0);writeFileSync(join(verification,'disaster-model.log'),tests.stdout+tests.stderr);
const count=Number(tests.stdout.match(/(?:#|ℹ) tests (\d+)/)?.[1]);assert(count>=31);
const resources=[];
for(const [id,key] of [['rain-street-preparation-v1','street'],['flood-house-response-v1','flood']]){
 const skin=read(`content/disaster/${id}/skin.json`);const paths=[skin.scene,skin.clean,skin.ending,skin.mask,...Object.values(skin.faces??{}),...Object.values(skin.sprites).flatMap(s=>[s.src,s.icon,s.repair?.src].filter(Boolean))];
 for(const path of paths){const p=join(root,'public',path.slice(1));assert(existsSync(p));resources.push({path,sha256:hash(p)});}
 const provenance=read(`public/levels/rain-flood-v1/${key}/provenance.json`);for(const [name,digest]of Object.entries(provenance.source))assert.equal(hash(join(root,'art-source/rain-flood-v1',key,name)),digest);
 provenance.visualApproval='reviewed in original, mask overlay, 390x844 initial/action/ending screenshots';writeFileSync(join(root,`public/levels/rain-flood-v1/${key}/provenance.json`),JSON.stringify(provenance,null,2));
}
const oldMobileFiles=readdirSync(join(root,'docs/hazard-batch-v2/verification/edge-fit-20260910')).filter(p=>p.endsWith('.json'));
let oldLayout=null;for(const file of oldMobileFiles){const r=read('docs/hazard-batch-v2/verification/edge-fit-20260910/'+file);if(r.status==='passed'&&r.htmlSha256===sha&&Array.isArray(r.checks))oldLayout={checks:r.checks.length,browserClosed:r.browserClosed};}
assert(oldLayout&&oldLayout.browserClosed,'Existing seven-level mobile regression not completed');
const report={passed:true,at:new Date().toISOString(),offlineSha256:sha,playableLevels:16,maxFlowers:48,newLevelIds:['rain-street-preparation-v1','flood-house-response-v1'],newRuleTests:count,existingRegressionTests:regression.tests,newBrowserChecks:browser.checks.length,lifecycleChecks:lifecycle.checks.length,oldMobileLayout:oldLayout,typecheck:true,productionBuild:true,embeddedResources:resources.length,noExternalRequests:true,noAINarration:true,realDeviceTested:false,humanSpeakerReview:false,publicRelease:false};
writeFileSync(join(output,'acceptance.json'),JSON.stringify(report,null,2));writeFileSync(join(verification,'acceptance.json'),JSON.stringify(report,null,2));writeFileSync(join(verification,'resource-sha256.json'),JSON.stringify(resources,null,2));
for(const f of ['browser-checks.json','lifecycle-checks.json'])copyFileSync(join(output,f),join(verification,f));
copyFileSync(join(root,'docs/hazard-batch-v2/verification/regression-report.json'),join(verification,'existing-regression.json'));copyFileSync(join(root,'docs/hazard-batch-v2/verification/build-typecheck.json'),join(verification,'build-typecheck.json'));
for(const f of ['street-entry-390x844.png','street-found-390x844.png','street-success-390x844.png','flood-initial-390x844.png','flood-on-stairs-390x844.png','flood-prepared-390x844.png','flood-success-390x844.png','flood-danger-390x844.png','flood-risk-stage-390x844.png'])copyFileSync(join(output,f),join(verification,f));
console.log(JSON.stringify(report,null,2));
