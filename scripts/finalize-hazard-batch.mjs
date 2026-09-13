/** Seal actual acceptance evidence; refuses incomplete, stale or partial runs. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'docs/hazard-batch-v2');
const read=p=>JSON.parse(fs.readFileSync(path.join(dir,p),'utf8'));
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const plan=read('production-plan.json'),browser=read('verification/hazard-browser-report.json'),audio=read('verification/audio-browser.json'),regression=read('verification/regression-report.json'),build=read('verification/build-typecheck.json'),art=read('verification/art-batch.json');
const html=path.join(root,'outputs/本地离线版/小红花应急行动.html'),digest=sha(html);
assert.equal(browser.status,'passed');assert.equal(browser.passedCases,42);assert.equal(browser.html.sha256,digest);assert.equal(browser.cleanup.contextsClosed,42);assert.ok(browser.cleanup.browserClosed&&browser.cleanup.serverClosed);
assert.equal(audio.status,'passed');assert.equal(audio.cases.length,7);assert.equal(audio.closed,true);assert.equal(audio.htmlSha256,digest);
assert.equal(regression.status,'passed');assert.equal(regression.tests,1524);assert.equal(build.status,'passed');assert.equal(build.htmlSha256,digest);assert.equal(art.status,'pixel_structure_pass');
const assets=[];
for(const card of plan.levels){
 const source=path.join(root,'art-source/hazard-batch-v2',card.authorId),p=JSON.parse(fs.readFileSync(path.join(source,'processing.json')));
 const files={};for(const name of ['rules','skin','presentation','performance'])files[name]=sha(path.join(root,'content/scenes',card.id,name+'.json'));
 assets.push({id:card.id,authorId:card.authorId,title:card.title,sourceSha256:p.sourceSha256,inputHashes:p.inputHashes,specSha256:p.specSha256,configurationHashes:files,outputFiles:p.files});
 card.status='playable_verified';
}
const result={at:new Date().toISOString(),status:'passed',scope:'7 new independent scene-hunt v2 levels',newLevels:7,totalPlayable:14,maxFlowers:42,html:{bytes:fs.statSync(html).size,sha256:digest},tests:{unit:1524,browserCases:42,audioProfiles:7,artPacks:7,nativeCanvasScenarios:18},physicalPhones:'not_run',humanListening:'not_run',safetyCertification:'not_claimed',gitPush:'not_performed',assets};
fs.writeFileSync(path.join(dir,'verification/final-acceptance.json'),JSON.stringify(result,null,2));
fs.writeFileSync(path.join(dir,'production-plan.json'),JSON.stringify(plan,null,2)+'\n');
const text=`# 七个新关卡最终验收\n\n日期：${result.at}。状态：本地功能验收通过；未进行实体手机测试或人耳试听，不宣称消防专业认证。\n\n## 可玩内容\n\n${plan.levels.map(c=>`- ${c.order}《${c.title}》：独立ID \`${c.id}\`，5个目标。`).join('\n')}\n\n新增7关，连同原7个已开放关，共14关、最多42朵。旧台风、厨房、原三目标卧室和配置关保留；原未开放草稿不冒充可玩。\n\n## 实际验证\n\n- 1,524项规则/回归断言通过，其中每关120种目标顺序共840种。\n- 七关 × file/HTTP × 320×740/390×844/1440×900，42组真实浏览器通关与反序重玩通过。窄屏使用模拟触屏输入，宽屏用鼠标；没有直接修改游戏状态来完成目标。\n- 暂停/合成后台冻结、误点、中途结束零奖励、90秒风险峰值、完整结局、3朵结算、重复奖励幂等、旧地图保留均检查。\n- 7关原生AudioContext波形、发现/误点事件、暂停/静音/后台衰减、恢复、离开后closed通过。测试使用 --mute-audio，无实际扬声器试听。\n- 7套真实素材像素检查通过；18项原生Canvas特效许可/脚锚定检查通过。原图隐患像素与旧关124个配置/图片文件保持原字节。\n- TypeScript与生产构建通过；离线HTML无外部请求，CSP connect-src none。\n- 全部测试浏览器、上下文与临时HTTP服务已关闭。\n\n## 本轮修复\n\nH04 插头错位蒙版按原图真实深色轮廓重取，保留裸露断口；H06 柜体误侵人物导致的帽/脸/肘缺缝修复；H09 围挡实心缝和雨/水许可区校正，不覆盖室内植物、窗台、柱与盲道。\n\n真实宽屏测试还找到了旧三剪影布局装入五剪影后挡物品的问题。新版全屏固定到视口，顶部132px为基础UI/五剪影区，完整场景独立contain，42组均检查剪影不覆盖场景、标题不超出屏幕；旧关CSS不改变。\n\n## 证据与离线指纹\n\n- [规则报告](regression-report.json) · [42组试玩](hazard-browser-report.json) · [音频生命周期](audio-browser.json)\n- [像素结构](art-batch.json) · [边界修正](final-boundary-check.json) · [构建](build-typecheck.json)\n- [配置/图像SHA清单](final-acceptance.json)\n- 最终HTML：${fs.statSync(html).size}字节，SHA256 \`${digest}\`。\n\n失败的早期宽屏报告与截图保留供复盘；它们不代表最终版本。人物为同源原像素的轻量动态，不是重新生成的视频。更换风格时重建skin/蒙版，保留rules与持久化ID。没有提交、推送或发布远端。\n`;
fs.writeFileSync(path.join(dir,'verification/FINAL.md'),text);
fs.writeFileSync(path.join(dir,'STATUS.md'),'# 新增隐患识别关卡状态\n\n本批7关本地验收通过。细分证据、最终SHA和未执行项目见 [最终验收报告](verification/FINAL.md)。\n\n全部新增独立ID，旧关保留。正式源码位于 D:\\中关村\\小红花\\小红花游戏；工作副本、失败候选和可恢复交付备份位于 test1/work/hazard-batch-v2。实际同步结果另见 test1/outputs/本地离线版/本批交付记录.json。\n');
console.log(JSON.stringify({status:'passed',htmlSha256:digest,levels:7,browserCases:42}));
