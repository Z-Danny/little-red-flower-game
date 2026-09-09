/** Offline text compiler only. It never generates art, runs a shell, or edits the game. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const text = (v, name) => {
  assert.equal(typeof v, 'string', `${name}: 必须是文字`);
  assert.ok(v.trim() && !/\{\{|\}\}|待填写|TODO/i.test(v), `${name}: 不可为空或含未填写占位符`);
};
export function validateSpec(s) {
  assert.equal(s?.schemaVersion, 1, '不支持的工作单版本');
  assert.ok(['reference-rebuild','skin-swap','new-level'].includes(s.mode), 'mode 不合法');
  assert.equal(s.level?.kind, 'scene-hunt', '本模板仅支持整场景红圈识别，不支持拖拽处置');
  assert.match(s.level.id, /^[a-z][a-z0-9-]*$/, '关卡 ID 使用小写英文数字短横线');
  text(s.level.title,'level.title');
  assert.ok(Number.isInteger(s.level.order)&&s.level.order>0,'order 必须为正整数');
  assert.equal(s.style?.templateId, 'architecture-space', '当前提示词模板采用 architecture-space');
  for(const key of ['reference','artDirection'])text(s.style[key],`style.${key}`);
  for(const key of ['location','camera','furniture','charactersBefore','charactersAfter','weatherBefore','weatherAfter'])text(s.scene?.[key],`scene.${key}`);
  for(const key of ['geometryLocks','physicalChecks']){assert.ok(Array.isArray(s.scene[key])&&s.scene[key].length>=2,`${key} 至少两项`);s.scene[key].forEach((v,i)=>text(v,`${key}[${i}]`));}
  for(const key of ['width','height','pressureSeconds'])assert.ok(Number.isInteger(s.runtime?.[key])&&s.runtime[key]>0,`${key} 必须为正整数`);
  assert.ok(s.runtime.width<s.runtime.height,'本模板以竖屏为目标');
  assert.ok(s.runtime.pressureSeconds>=20,'增强时间至少 20 秒；真实题材是否允许倒计时需人工审核');
  assert.ok(Number.isInteger(s.runtime.markMs)&&s.runtime.markMs>=500&&s.runtime.markMs<=1500,'描圈需为 500–1500ms 整数');
  assert.ok(Number.isInteger(s.runtime.revealMs)&&s.runtime.revealMs>=3500,'现有渲染器 800ms+1800ms 淡化，结算时间至少留到 3500ms');
  text(s.safety?.premise,'safety.premise');
  assert.equal(s.safety.reviewStatus,'needs-review','生成器不授予内容审核通过状态，reviewStatus 固定 needs-review');
  assert.ok(Array.isArray(s.safety.sourceUrls)&&s.safety.sourceUrls.length>0,'请提供待核对的权威来源');
  for(const u of s.safety.sourceUrls){assert.equal(new URL(u).protocol,'https:','来源须为 HTTPS URL；脚本不会访问它');}
  assert.ok(Array.isArray(s.targets)&&s.targets.length>=3&&s.targets.length<=6,'每关 3–6 个目标');
  const ids=new Set(),colors=[];
  for(const [i,t]of s.targets.entries()){
    for(const k of ['id','name','location','unsafe','whyRisk','lesson','safe','maskIncludes','maskExcludes'])text(t[k],`targets[${i}].${k}`);
    assert.match(t.id,/^[a-z][a-z0-9-]*$/);assert.ok(!ids.has(t.id),'目标 ID 不可重复');ids.add(t.id);
    assert.ok(Array.isArray(t.maskColor)&&t.maskColor.length===3&&t.maskColor.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'RGB 必须含三个 0–255 整数');
    const palette=[[255,0,0],[0,255,0],[0,0,255],[255,255,0],[255,0,255],[0,255,255]];
    assert.ok(palette.some(c=>c.every((v,j)=>v===t.maskColor[j])),'使用六种标准纯色 ID，避免与白色人物或阈值量化冲突');
    for(const previous of [[0,0,0],[255,255,255],...colors])assert.ok(t.maskColor.some((v,j)=>Math.abs(v-previous[j])>=36),'颜色不能重复、接近、占用黑色背景或白色人物');
    colors.push(t.maskColor);
  }
  for(const key of ['defect','correction','preserve'])text(s.localFix?.[key],`localFix.${key}`);
  return s;
}
const list = a => a.map((v,i)=>`${i+1}. ${v}`).join('\n');
export function makePrompts(spec) {
  const s=validateSpec(spec),n=s.targets.length,world=`逻辑画布 ${s.runtime.width}×${s.runtime.height}，竖屏；记录真实输出像素尺寸。后续派生图须与已批准原图完全同尺寸、同取景。`,locks=list(s.scene.geometryLocks),noArt='只输出一张图，不要文字、标签、UI、红圈、箭头、水印、边框、拼贴展示板或棋盘格。';
  const danger=list(s.targets.map(t=>`${t.id} / ${t.name}：${t.unsafe}；位置：${t.location}。`));
  const inputRoles='输入图片角色必须写清楚：风格参考图仅用于纸纹、笔触、色彩，不是需要直接复刻的房间；approved-unsafe.png 是后续蒙版、补空和安全状态编辑的唯一构图母版。';
  return [
    ['01_内容复核',`你负责应急科普内容审核，不负责生图。关卡：《${s.level.title}》。\n前提：${s.safety.premise}\n目标清单：\n${list(s.targets.map(t=>`${t.name}；风险：${t.whyRisk}；知识：${t.lesson}；结局：${t.safe}`))}\n待核对来源：\n${list(s.safety.sourceUrls)}\n请逐条核实并给出事实依据、适用情境、歧义、需删改内容、图中应看见的证据。来源不能访问或不支持结论时明确标记待核对，不能编造引用。分开记录程序检查和专业内容审核。任何误导公众冒险操作的目标不得进入制作。最终输出风险表与人工审核结论，不生成图片。`],
    ['02_完整含隐患场景',`任务：为《${s.level.title}》生成原创完整找隐患游戏场景。不是空背景，不是物件素材表。\n${inputRoles}\n构图：${s.scene.camera}。空间：${s.scene.location}。家具：${s.scene.furniture}。\n视觉风格和材质：${s.style.artDirection}\n人物：${s.scene.charactersBefore}\n环境：${s.scene.weatherBefore}\n把以下 ${n} 个目标直接画进同一房间，透视、照明、笔触、接触阴影一致，每个恰好一处：\n${danger}\n物理关系：\n${list(s.scene.physicalChecks)}\n顶部约 8% 只放非关键细节；底部约 12% 不放唯一识别特征。具体可点性须按真实手机 UI 再检查，不能只相信百分比。保持场景自然丰富，不用装饰堆砌遮住目标。\n${world}\n${noArt}`],
    ['03_局部纠错_仅需要时',`编辑目标：最近一张已生成的完整场景。不是重新设计。\n只修正此问题：${s.localFix.defect}\n改成：${s.localFix.correction}\n必须保留：${s.localFix.preserve}\n其余镜头、图像宽高、房间结构、其他目标、人物身份和笔触不变。禁止顺手“美化”其他区域。输出单张修正场景；人工确认后保存为 approved-unsafe.png，之前的蒙版与派生图全部视为需要复核。\n${noArt}`],
    ['04_同构ID蒙版',`输入图1：approved-unsafe.png，精确分割母版，不是风格参考。\n输出与图1同像素尺寸、同构图、逐物件对齐的平涂 ID 蒙版。不重画物体形状，不移动、旋转、缩放或补出被遮挡部分。纯黑 RGB(0,0,0) 表示所有背景和未列物品。\n各 ID 的颜色、包含/排除边界如下：\n${list(s.targets.map(t=>`${t.id} / ${t.name}，位置 ${t.location}，纯色 RGB(${t.maskColor.join(',')})。包含：${t.maskIncludes}。排除：${t.maskExcludes}。`))}\n纯白 RGB(255,255,255)：${s.scene.charactersBefore} 中人物及随身物品的可见轮廓，仅供人物提取，不是隐患。不要包含投影、背景空隙或邻近物件。\n颜色必须实心纯色，无渐变、纹理、透明棋盘、文字、描边、抗锯齿彩边。保留对象真实遮挡关系，不能以包围矩形代替轮廓。输出蒙版一张。AI 结果仅为候选，必须交由程序量化和人工叠加复核后才能用于点击。`],
    ['05_人物补空底图',`编辑目标：图1 approved-unsafe.png。仅移除这些人物及随身物：${s.scene.charactersBefore}，并移除他们的投影。补出其后方被遮挡的地面、墙、栏杆等既有表面。\n严禁改变的空间基准：\n${locks}\n所有 ${n} 个隐患原封不动：\n${danger}\n不增加新人物或物件，不改变任何目标位置和不安全状态，不关闭门窗，不将房间变成安全结局。镜头、像素尺寸与纸纹不变。\n${noArt}\n这是补空候选，不直接替代整幅场景；程序只采纳人物区域，并强制保护目标像素。`],
    ['06_完整安全结局',`编辑目标：图1 approved-unsafe.png。生成同一房间“完成规范准备后”的整幅效果图，不生成单个物件贴图。\n保持：\n${locks}\n只改变以下状态：\n${list(s.targets.map(t=>`${t.name}：${t.safe}`))}\n人物结局：${s.scene.charactersAfter}\n环境结局：${s.scene.weatherAfter}\n保证人物身份、家具尺度和空间关系延续原图。安全状态不能只靠加盾牌或绿色对勾表示，必须能在图上看见具体变化。\n${world}\n${noArt}`],
    ['07_程序接入',`你负责把已审核素材接入模块化游戏，不再生图。模式 ${s.mode}，关卡 ID ${s.level.id}，标题《${s.level.title}》，编号 ${s.level.order}。\n先读项目内 scene-hunt 工作流、实际 registry/model/schema/renderer/player/sound、关卡目录、现有导出脚本和 git status。输入为 approved-unsafe.png、approved-id-mask.png、approved-clean.png、approved-safe.png；缺任一批准输入则停在对应阶段。\n继承原则：隐患与房间是完整原画，不能重新切成可移动物件。只提取同源人物真透明层，补空时保护所有目标原像素。图标从目标蒙版及原画像素裁切，点击用同构 ID 蒙版而不是圈或矩形框。逻辑尺寸 ${s.runtime.width}×${s.runtime.height}。\n目标 ID：${s.targets.map(t=>t.id).join(', ')}。描圈 ${s.runtime.markMs}ms；全部识别才进入结局，结算展示期 ${s.runtime.revealMs}ms；环境演出增强期 ${s.runtime.pressureSeconds}s。误点不扣分、峰值可继续。\n层级：场景底图→受区域约束的天气→原画人物→红圈/反馈→完整安全图→精简 UI。禁止脸上雨滴/汗滴，禁止 AI 朗读、TTS、重复步骤栏；音频只用背景音乐/环境/交互音，首次操作解锁，暂停/后台/离开要静音或清理。\n只换皮必须比较改前改后 rules 哈希保持一致，ID 和存档不变。新关要有独立 ID、目录、注册和关卡入口；现有脚本、天气、文字有台风专用项，逐项参数化或写独立适配器并补测试，不能假装只填 JSON 就已完成。不得运行台风硬编码素材脚本覆盖现有关卡。\n输出更改清单、输入素材哈希、配置、实际验证结果和离线文件，不提交/推送，不覆盖用户无关修改。`],
    ['08_验收交付',`检查《${s.level.title}》当前产物，不要只看截图。先核对输入批准状态和 SHA-256，再做规则/素材/渲染/浏览器/离线五层验收。\n1. 原图、底图、安全图、ID 蒙版同逻辑尺寸；全部 ID 唯一、无交叠、无漏目标；补空没有改变任何目标像素，剪影有真正透明通道。\n2. 每目标内点、边缘点、外部点；真实手机 contain 坐标换算和 UI 遮挡；误点/连点/重复点击/暂停/后台/重玩。${n} 目标要测试 ${n}! 种顺序，描圈未完成不记数，全部找到才显示安全图，峰值不锁关。\n3. 初始、中期、峰值、圈全、安全五种状态，人物不漂浮、不变形穿帮，雨不在脸前；安全图逐项对照，不能因完成识别就暗示真实灾害消失。\n4. 先静音检查画面，需要听感验收再短时开声；无朗读、无后台残音、无重复领奖；结束立即关闭测试页。记录浏览器、尺寸及实际做过的动作，没做的写“未验证”。\n5. typecheck、全回归、构建、单文件导出，禁止外部资源依赖；file:// 与 HTTP 分开报告，不能相互替代。\n失败即退回对应阶段，不给“已完成”。交付含素材来源与提示词、配置、测试记录、离线文件、备份和哈希；没有新的明确授权不提交或发布。`]
  ].map(([name,prompt])=>({name,prompt}));
}
export function generate(specPath,outPath) {
  const spec=JSON.parse(fs.readFileSync(specPath,'utf8').replace(/^\uFEFF/,''));
  const prompts=makePrompts(spec),out=path.resolve(outPath);
  assert.ok(!fs.existsSync(out),'输出目录已存在；换一个新目录以保护已有内容');
  fs.mkdirSync(out,{recursive:true});
  for(const p of prompts)fs.writeFileSync(path.join(out,p.name+'.md'),`# ${p.name}\n\n${p.prompt}\n`,'utf8');
  const combined=prompts.map(p=>`## ${p.name}\n\n\`\`\`text\n${p.prompt}\n\`\`\``).join('\n\n');
  fs.writeFileSync(path.join(out,'全部提示词.md'),`# 《${spec.level.title}》分步提示词\n\n生成器只生成文字，不审核专业知识、不生图、不接入游戏。按 README 的阶段检查执行，不能把八段拼成一次生图请求。\n\n${combined}\n`);
  fs.writeFileSync(path.join(out,'输入参数快照.json'),JSON.stringify(spec,null,2)+'\n');
  return {out,level:spec.level.id,prompts:prompts.length,contentReview:'needs-review',artGenerated:false,gameModified:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{assert.equal(process.argv.length,4,'用法：node generate-prompts.mjs 工作单.json 新输出目录');console.log(JSON.stringify(generate(process.argv[2],process.argv[3]),null,2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
