# 找隐患关卡生产流水线（唯一现行入口）

版本：3.1 / 2026-09-13。适用：完整场景识别 → 红圈标记 → 整幅结果图。不是拖拽处置、收纳或七目标扣时关的模板。处置类继续使用 `docs/response-workflow/README.md`；《暴雨前的街道》的七目标扣时规则继续走灾害专用模块，不因本模板改为五目标。

现行统一挑战HUD（2026-09-13）：所有9个整场景找隐患关、7目标《暴雨前的街道》及两关点击收纳均为50秒、递减彩条且不显示数字、灯泡默认收起剪影。超时未完成失败重试。它们只共用HUD/时间节奏，不混用玩法引擎。模板默认已同步；接入合同见 `docs/challenge-hud/README.md`。台风关已按最新要求关闭人物惊叫，保留背景音乐、风雨和交互音效；见 `docs/typhoon-deadline/README.md`。禁止AI朗读，不从历史配置恢复惊叫。

本规范覆盖新增、批量建卡、换风格、统一适配、审核、接入及离线交付。现有台风关、充电卧室和七个整场景识别关共用适配；保留原 ID、规则和成绩。新模板支持 3～6 个目标，默认 5 个。资产编译器当前标准画布为 720×1280；若要更换基础画布，必须同步扩展编译/校验器和测试，不能只改 JSON 后声称支持。

## 1. 职责与唯一入口

|层|文件|可以修改什么|
|---|---|---|
|玩法|`content/scenes/<id>/rules.json`|身份、目标、知识；现行 v2 演出50s限时失败、800ms 描圈、5500ms 结局|
|皮肤|`content/scenes/<id>/skins/<style>.json`|图片、物体像素蒙版、坐标、人物、效果许可区和关键内容区|
|文案|`presentation.json`|开场、提示、安全边界、结束语义|
|演出|`performance.json`|四档人物、氛围、音乐配置；不放屏幕宽高判断|
|创作简报|`brief.json`|场景、人物、风格 ID、知识来源和审查状态|
|共用模板|`content/hunt-template/`|默认配置、独立风格描述、分阶段提示词|
|适配政策|`content/hunt-viewport.json`|手机阈值、电脑宽度上限、剪影尺寸、验收视口|
|适配实现|`app/game/scene-hunt/viewport.ts`|容器、等比相机、输入逆变换、裁切检查|
|接入清单|`content/scenes/catalog.json`|选中皮肤、是否启用；草稿默认关闭|
|生成注册|`app/game/scene-hunt/generated.ts`|只由 `hunts:sync` 生成，禁止手改|
|共用运行|`model.ts`、`player.tsx`、renderer、sound|所有同类关共享，新增皮肤不得复制这些文件|

换画风不改 rules，也不新建游戏组件。可以新增 `styles/<style>.json` 风格描述；它是生图输入，不会自动给旧图“换肤”。图片生成、物理关系核对与蒙版校准依然需要实际执行。

## 2. 手机适配合同（不能被制作卡覆盖）

1. 手机竖屏（当前宽 ≤600 CSS px）使用整个可见内容区域，宽高都铺满；不是强制浏览器全屏，不含地址栏。无父容器留白、固定最小高度、左右填充或滚动。
2. `visualViewport` 负责当前可见尺寸及偏移，监听 resize/scroll；桌面保留不超过 520px 的正常竖屏窗口，水平居中、顶部对齐，窗口外可有底色。
3. 场景统一 `scale=max(viewWidth/worldWidth,viewHeight/worldHeight)`，横纵比例相同。人物、特效、圈线同相机；点击经 `pointerToScene` 逆变换。禁止 CSS 拉伸、contain 留黑边、模糊补边或按关卡另写相机。
4. 背景绘制到四边；安全区只保护控件。标题、计时、暂停、顶部横排剪影覆盖在背景上，不另占顶部栏。按钮至少44×44 CSS px。长标题省略而非挤掉暂停。
5. 不同比例下，“完整原图＋无留白＋不变形”不能兼得。允许裁切非关键边缘；**新皮肤的目标 bounds 与脸部 criticalRegions 必须在验收视口内完整可见**，否则禁止启用，退回构图。HUD 遮挡、文字可读性仍须实际浏览器检查。
6. 默认新图720×1280。长屏390×844会裁去左右约64个设计像素；540×960等比例不裁切。B阶段就应用相机预览：目标不要贴边，脸不要贴顶。数字随政策变化以程序检查为准，不死记百分比。
7. 旧关初次迁移保留素材和机制。`check` 的 cropIssues 是旧素材欠缺安全边距的审计结果，不伪装为“整图完全不裁切”。新皮肤没有这项豁免，不能复制 `migrated:true` 绕过发布门禁。

## 3. 从零新增与批量生成

在含 `package.json`、`content/scenes/catalog.json` 的真正源码根目录运行，不改导出的 HTML。Node ≥22.13、项目已有依赖；不隐式全局安装。

```powershell
node scripts/hunts.mjs create --id new-hunt --title 新的观察关 --order 23 --count 5
node scripts/hunts.mjs prompts --id new-hunt
```

第一条只建草稿，不复制其他关的图、不开放给玩家，不伪造知识审核。第二条生成 `outputs/hunt-prompts/<id>/<时间>.md`；原模板不改。任何 TODO 都必须填完；新增 ID、关号要避开所有玩法目录，批量在任何一项非法时整体拒绝，不留下半批新关。

批量清单是 JSON 数组：

```json
[{"id":"new-hunt-a","title":"观察关A","order":23,"count":5},
 {"id":"new-hunt-b","title":"观察关B","order":24,"count":3}]
```

```powershell
node scripts/hunts.mjs batch --file jobs.json
```

不要把这些示例编号当成永久空闲编号，脚本会检查冲突。旧 `levels:create --kind prevention` 明确报退役错误，不再产出“点击移动物品”的错模板；通用处置引擎命令不受影响。

## 4. A–I 阶段与美术编译

按模板 `content/hunt-template/prompts.md` 一阶段一次请求，保存实际用过的提示词及输入输出哈希。不得把文档中建议视为已执行。

|阶段|产物|失败退回|
|---|---|---|
|A 内容与布局|来源、可见判据、人物身份、现实处理条件、裁切安全区|有歧义/依据未读/手机认不出就不生图|
|B 完整母版|`scene-original.png`；隐患与环境在同一幅原画|物理关系、数量、位置不对，修改母版|
|C 同构蒙版|`mask-candidate.png`；目标唯一色、人物白、背景黑|蒙版不能补造原图没有的实体|
|D 人物补空|`clean-candidate.png`，严格限人物许可区|区外和目标证据必须保留原像素|
|E 程序提取|ID蒙版、同源图标、透明人物、许可mask|真正alpha、无白边；不单独生图拼贴|
|F 整图结局|`ending.png`，同机位另时点规范结果|人物身份、空间或安全语义变化则重做|
|G 配置演出|performance/presentation；本地音乐音效|不得虚构火雨，不加AI朗读|
|H 草稿接入|隔离预览包、像素检查、适配审计|不合格不进入正式清单|
|I 审核交付|指纹、证据、正式导出、静音浏览器测试|未执行不写通过|

建立美术工作单：

```powershell
node scripts/hunts.mjs production --id new-hunt --name paperbook
```

输出 `art-source/hunts/<id>/<style>/production.json`。将 B/C/D/F 四张输入放在同一目录，填写 `sourceSha256`、经审查的 corrections、效果许可多边形以及 face `criticalRegions`。草稿skin可覆盖权限绑定 `draftSkinSha256`，变更后要显式核对并更新该值，不能绕过陌生文件覆盖保护。人物/目标坐标由编译器从实体像素导出；关键面部区域由审校者配置。

```powershell
python scripts/prepare-hazard-batch.py art-source/hunts/new-hunt/paperbook/production.json
python scripts/check-hazard-batch-art.py art-source/hunts/new-hunt/paperbook/production.json
node scripts/hunts.mjs check --id new-hunt --draft
node scripts/hunts.mjs inspect --id new-hunt
```

编译器名称保留是兼容旧七关，`pipelineVersion:3` 才走通用 ID/独立皮肤/3～6 目标接口。旧批次仍保留旧规则。依赖 Pillow/numpy/scipy/OpenCV；缺失先说明，不自动更换算法。二次同母版草稿编译用 `--refresh`，保存 compiled-history；批准锁、外部修改与母版SHA变化会阻止刷新。换母版或风格用新皮肤目录。

## 5. 草稿先玩，审核后启用

```powershell
node scripts/export-offline.mjs --preview-hunt new-hunt --output outputs/hunt-preview/new-hunt
```

该包只用于审核，导出校验标记 `draft-preview-not-production`，不修改正式目录或 catalog。先在这个包完成内容/画面/手机/玩法/离线五项检查，再建审校工作单：

```powershell
node scripts/hunts.mjs review-template --id new-hunt
```

填写 `content/scenes/<id>/reviews/<skin>.json`，每项须有 `status:passed`、reviewer 和仓库内证据文件路径；初始全是 `not_run`。指纹绑定规则、配置、图片、共用适配与运行代码。任何相关修改后旧批准无效，重新 inspect 和审校。文件存在不等于内容正确，脚本不会冒充专业审查或真人试玩。

```powershell
node scripts/hunts.mjs enable --id new-hunt
node scripts/hunts.mjs sync
node scripts/test-hunt-pipeline.mjs
node node_modules/typescript/bin/tsc --noEmit
pnpm test
pnpm build
node scripts/export-offline.mjs
node scripts/test-hunt-pipeline-browser.mjs
```

每条非0就停止发布，不能忽略错误继续导出。正式包在 `outputs/本地离线版/`。完成源码检查不等于用户打开的包已更新，最终核对该 HTML 的 SHA。

## 6. 换风格而不改玩法

```powershell
node scripts/hunts.mjs skin --id new-hunt --name watercolor
node scripts/hunts.mjs production --id new-hunt --name watercolor
```

只产生新皮肤配置及新素材路径，不拷贝旧图、不改规则、不自动切换；输出规则 SHA 作为对照。在新母版上重新制作所有关联蒙版、人物、剪影、结局及坐标。若只改画风描述，修改 brief.style 后重新生成提示词；可编辑独立 style JSON，不改模板程序。

```powershell
node scripts/export-offline.mjs --preview-hunt new-hunt --preview-skin skins/watercolor.json --output outputs/hunt-preview/new-hunt-watercolor
node scripts/hunts.mjs review-template --id new-hunt --skin skins/watercolor.json
# 实际完成审校并填写该皮肤的 review 后
node scripts/hunts.mjs select-skin --id new-hunt --name watercolor
node scripts/hunts.mjs sync
```

换皮肤后 ID 和最佳成绩仍相同，rules SHA 必须不变。想改目标数量或知识语义，应建新关或明确迁移，不能借换皮肤偷偷改变机制。

## 7. 验收合同

- 规则：3～6目标、任意顺序、500～1500ms机制范围内本模板固定800ms、每次误点扣5秒（只扣时间，不额外扣花朵）、忙碌不排队、未全部识别不奖励；50秒未找齐或扣时耗尽则失败；截止前的最后有效输入可完成既有描圈；截止后不接收新输入；暂停/后台冻结、重玩清空、奖励幂等。未来关卡沿用共享`app/game/challenge/rules.ts`，不得在皮肤内另写扣时逻辑。
- 像素：同源提取、精确颜色、许可外不改、人物不吞目标、图标透明、孔洞与遮挡真实；自动检查不代替语义和白边肉眼检查。
- 手机：320×568、375×667、390×844、430×932、540×960、桌面；四角实画、无留白/拉伸、HUD横排可见、每目标真实指针命中；开始/暂停/完成/重玩及可视高度变化都检查。
- 声音：首个用户手势解锁、暂停/后台/退出释放，不留有声测试标签页。用隔离无头浏览器 `--mute-audio`；自动RMS不等于人耳试听。
- 交付：正式包无网络资源依赖；最终报告标 passed/failed/not_run，包含源码与素材指纹、HTML SHA、测试命令/退出码、截图、浏览器型号、真机和听感状态。

本次迁移证据见 [验证记录](verification/REPORT.md)。旧来源卡、使用过的提示词、图片和真实验收报告仍可作为历史证据，**不是现行模板**。旧工作流、旧适配方案与旧模板移出活动目录并可从本次退役备份恢复；清单见 [退役记录](RETIRED.md)。
