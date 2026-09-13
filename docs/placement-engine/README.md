# 放置测试引擎 V2

用策划案生产卡生成可离线试玩的放置关卡，支持批量、逐物品音效、阶段计时、长按和摆放编辑。当前首关为 **E07《晃动开始了》**；保留厨房样例作为回归基准。测试不发放正式游戏小红花。

## 先试 E07

双击 `放置测试引擎.html` 或 E07 批次的 `开始试玩.html`。点击开始后：坐垫→头颈、人物→桌下、按住桌腿 1.5 秒，保持到 12 秒结束；震后观察周围、关火、穿鞋、带包，人物→楼梯。

支持鼠标/触摸拖拽，也可用画面下方的点选按钮。长按支持按钮和桌腿处标牌；键盘持续按空格或 Enter 同样计时。暂停、取消、移出与页面失焦会取消未完成的长按。

正式主游戏入口仍为“我的守护档案”→“放置测试引擎”，或者地址末尾 `#placement-test`。打开 E07 的“记录”页可查看物品音效加载数量与实际触发记录。

## 给策划案与批量生成

- [策划案详细要求](./策划案详细要求.md)：必填内容、动作表、声音表、技术接口、完整执行提示词。
- [可填写模板](./策划案填写模板.md)：自然语言表格，坐标可由 Codex 补齐。
- [E07 设计与验收](./E07设计与验收.md)：本次具体规则、适用条件、音效和来源。
- [E07 美术提示词](./E07美术提示词.md)：冷调背景、分层精灵、角色参考、装配要求。

自然语言策划案由 Codex 转换为 `placement-plan-v1` 生产卡；离线工具本身没有语言模型服务。生产卡由编译器生成规则、目标、动画、落位和音效包，缺项关卡不会混入可试玩列表。

```powershell
node scripts/placement-batch.mjs sample --output my-plan.json
node scripts/placement-batch.mjs check my-plan.json --output report.json
node scripts/placement-batch.mjs build my-plan.json --output outputs/my-batch-001
```

每关包含 `.placement.json`、独立 `开始试玩.html`、WAV 音效与对应表；批次包含入口 HTML、全部关卡 JSON、生产卡、逐关报告与文件哈希。单批 1～20 关，生产卡/批量 JSON 上限 64 MB；目标目录必须为空。

界面顶部“导入策划案 / 批量包”接受 JSON，顶部列表切关；导入配置仅替换当前关。编辑后可导出当前配置或当前批量包。重新导入同名批次也会重新载入，不被旧草稿覆盖。

## 摆放与检查

“摆放编辑”分别编辑初始框、接收区、最终落位；白点为判定锚点。正确动作的动画终点与完成状态一起更新。位置使用场景逻辑像素，画面与输入等比映射。透明图像可声明精灵帧 `assets.*.frame`，绘制和透明像素命中共享该帧。

“规则”页编辑前置目标与反馈，查看每个动作的声音描述与触发比例；完整配置可在 JSON 编辑器修改。语法、引用、目标可达、阶段可达、区域重叠、越界、图层与声音缺失由检查器处理；视觉接触和常理仍需人看。

每个可交互物品必须具备拿起/按下、未命中、条件不足、回位四种音效，每个动作至少一个音效。环境声按需配置。声音使用独立音频层，普通放置关也能发声；支持内置合成拟音或 0.02～5 秒、单/双声道 16 位 PCM 内嵌 WAV。

大图草稿保存在 IndexedDB，避免 localStorage 配额不足。默认首次打开可恢复本机草稿；切换关卡与导入批次使用所选内容。导出 JSON 是可迁移的保存方式。

## 维护边界

- `app/game/placement/production.ts`：生产卡→单关编译、批量隔离与检查。
- `flow.ts`：阶段、长按配置、跟随物、阶段可达仿真；不把地震套进火情模型。
- `sound.ts`：音效契约、合成 WAV、与运行时钟同步的事件队列。
- `model.ts`：放置契约、落位编译、几何检查、规则仿真。
- `example-plan.ts`：E07 生产卡；`content/placement/e07-art.json`：本次分层美术，已内嵌保存。
- `sample.ts`：当前厨房基准；`draft-store.ts`：大容量草稿。
- `components/game/placement/*`：工作台、编辑/试玩、音频输出。
- `app/game/runtime/*`、`components/game/configured/*`：共享规则与绘图；新增可选精灵帧，不改变既有素材。

```powershell
node scripts/test-placement.mjs
node scripts/test-placement-production.mjs
node scripts/export-placement.mjs
node scripts/test-placement-production-browser.mjs path/to/开始试玩.html
```

旧命令 `placement.mjs sample/check` 保留。`compile` 仅用于基础 `rules + skin`，不能携带阶段或独立物品音频；E07 必须使用完整 placement 包或批量导出，不得当作基础包直接注册正式地图。新增正式关卡仍遵守现行处置工作流。

自动报告不会把未执行的真机测试或人工听音写成通过。
