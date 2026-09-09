import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {validateSpec,makePrompts,generate} from './generate-prompts.mjs';
const example=JSON.parse(fs.readFileSync(new URL('./production.spec.example.json',import.meta.url),'utf8'));
test('台风示例结构通过且仍需内容审核',()=>{assert.equal(validateSpec(example).safety.reviewStatus,'needs-review');});
test('生成八阶段中文提示词，禁止朗读与脸前雨',()=>{const p=makePrompts(example);assert.equal(p.length,8);const t=p.map(p=>p.prompt).join('\n');assert.ok(t.includes('台风前的家'));assert.ok(t.includes('RGB(255,0,0)'));assert.ok(t.includes('禁止脸上雨滴/汗滴'));assert.ok(t.includes('禁止 AI 朗读'));assert.ok(!/\{\{|\}\}/.test(t));});
const badCases=[
 ['拒绝未知版本',s=>s.schemaVersion=2],['拒绝拖拽关冒充识别关',s=>s.level.kind='response'],
 ['拒绝空标题',s=>s.level.title=''],['拒绝未替换占位符',s=>s.scene.camera='{{camera}}'],
 ['拒绝两个目标',s=>s.targets=s.targets.slice(0,2)],['拒绝七个目标',s=>s.targets=[...s.targets,s.targets[0],s.targets[1]]],
 ['拒绝重复ID',s=>s.targets[1].id=s.targets[0].id],['拒绝重复颜色',s=>s.targets[1].maskColor=s.targets[0].maskColor],
 ['拒绝人物白色作为目标',s=>s.targets[0].maskColor=[255,255,255]],['拒绝非标准近似色',s=>s.targets[0].maskColor=[220,50,10]],
 ['拒绝错误宽高',s=>s.runtime.width=-1],['拒绝横屏工作单',s=>s.runtime.width=2000],
 ['拒绝不可见短动画',s=>s.runtime.markMs=50],['拒绝结算早于完整画面',s=>s.runtime.revealMs=2500],
 ['拒绝缺少来源',s=>s.safety.sourceUrls=[]],['拒绝不安全URL协议',s=>s.safety.sourceUrls=['javascript:alert(1)']],
 ['不伪造审核通过',s=>s.safety.reviewStatus='approved'],['拒绝缺少人物说明',s=>delete s.scene.charactersBefore],
];
for(const [name,fn]of badCases)test(name,()=>{const s=structuredClone(example);fn(s);assert.throws(()=>validateSpec(s));});
test('支持六个标准颜色目标',()=>{const s=structuredClone(example);s.targets.push({...s.targets[0],id:'sixth',maskColor:[0,255,255]});assert.equal(makePrompts(s).length,8);});
test('生成十个文本文件，不修改输入；拒绝覆盖输出',()=>{const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hunt-workflow-')),input=path.join(temp,'input.json'),output=path.join(temp,'out'),bytes=JSON.stringify(example);fs.writeFileSync(input,bytes);const result=generate(input,output);assert.equal(result.artGenerated,false);assert.equal(result.gameModified,false);assert.equal(fs.readdirSync(output).length,10);assert.equal(fs.readFileSync(input,'utf8'),bytes);assert.throws(()=>generate(input,output));});
test('非法工作单在创建目录前失败',()=>{const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hunt-workflow-bad-')),input=path.join(temp,'input.json'),output=path.join(temp,'out');fs.writeFileSync(input,'{}');assert.throws(()=>generate(input,output));assert.ok(!fs.existsSync(output));});
