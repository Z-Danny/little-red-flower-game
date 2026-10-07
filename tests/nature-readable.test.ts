import test from 'node:test';import assert from 'node:assert/strict';
import {lessonFor} from '../app/game/journey/knowledge';
import {checkHunt} from '../app/game/scene-hunt/schema';
import {createHunt,reduceHunt} from '../app/game/scene-hunt/model';
import {auditHuntViewport} from '../app/game/scene-hunt/viewport';
import qr from '../content/scenes/quake-bedroom-v2/rules.json';import qs from '../content/scenes/quake-bedroom-v2/skins/readable-v3.json';import qp from '../content/scenes/quake-bedroom-v2/presentation.json';import qf from '../content/scenes/quake-bedroom-v2/performance.json';
import sr from '../content/scenes/storm-street-check-v2/rules.json';import ss from '../content/scenes/storm-street-check-v2/skins/readable-v4.json';import sp from '../content/scenes/storm-street-check-v2/presentation.json';import sf from '../content/scenes/storm-street-check-v2/performance.json';
import type {HuntPack} from '../app/game/scene-hunt/schema';
const packs=[{rules:qr,skin:qs,presentation:qp,performance:qf},{rules:sr,skin:ss,presentation:sp,performance:sf}] as unknown as HuntPack[];
for(const pack of packs){
 test(pack.rules.id+' passes shared schema and every viewport gate',()=>{assert.equal(checkHunt(pack),pack);assert.deepEqual(auditHuntViewport(pack.skin),[]);});
 test(pack.rules.id+' keeps recognition timings, rewards and arbitrary target order',()=>{for(const targets of [pack.rules.targets,[...pack.rules.targets].reverse()]){let r=reduceHunt(pack.rules,createHunt(),{type:'start'});for(const t of targets){r=reduceHunt(pack.rules,r,{type:'tap',id:t.id,x:1,y:1});for(let i=0;i<8;i++)r=reduceHunt(pack.rules,r,{type:'tick',ms:100});}assert.equal(r.phase,'reveal');assert.equal(r.stars,3);assert.equal(r.found.length,5);assert.equal(pack.rules.seconds,50);assert.equal(pack.rules.markMs,800);}});
}
test('storm teaching feedback has five distinct labels and no target-id drift',()=>{assert.deepEqual(Object.keys(sp.targetFeedback).sort(),sr.targets.map(t=>t.id).sort());assert.equal(new Set(Object.values(sp.targetFeedback).map(t=>t.label)).size,5);assert.equal(sp.retainLastLesson,true);const bad=structuredClone(packs[1]);bad.presentation!.targetFeedback!.unknown={label:'错误',caption:'无对应目标'};assert.throws(()=>checkHunt(bad),/teaching feedback/);});
test('quiz is optional, one correct answer, no reward or rule mutation',()=>{const q=lessonFor('storm-street-check-v2').question!;assert.equal(q.options.length,2);assert.equal(q.options.filter(a=>a.correct).length,1);assert.equal(q.options.find(a=>a.correct)!.id,'stay');assert.match(q.options.find(a=>!a.correct)!.explanation,/没有被修复/);assert.equal(lessonFor('quake-bedroom-v2').question,undefined);assert.equal(qp.compareEnding,true);});
