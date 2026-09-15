# 手机地图标牌与手绘地图

## 展示方式

- 自然灾害地图使用用户确认的 Q 版手绘图 `public/levels/journey-map/nature-v3-chibi.png`；源图、尺寸和 SHA-256 见 `art-source/journey-map/nature-v3-chibi.json`。
- 公共安全与居家校园办公使用用户确认的 `public-v3-handpainted.png`、`home-v3-handpainted.png`，各建筑采用不同造型，并参考封面强化暖光、深浅绿和绘画笔触。两图的原图、尺寸、SHA-256 记录在 `art-source/journey-map/` 同名 JSON 中，局部薄雾同时绑定新图并核对范围。
- 三张地图共用一套绘本路牌：自然绿木牌、公共蓝搪瓷牌、居家暖棕木牌。标题为 14–16 CSS px，最大牌宽 152px，最小高度 38px；窄侧可换行，始终保留完整标题和原有短连接线。右上角叠加本关专属小刻纹，不增加状态文字栏。
- 标牌与花朵属于同一个按钮，点击两处都会打开同一关介绍。编号保留在花朵上，未解锁由花苞上的锁和场景薄雾提示；读屏名称仍包含关卡状态。名称牌上下有透明点击扩展区，触摸高度保持 44px。
- 标牌放在花朵左右空余较多的一侧，按地图容器宽度计算可用空间，保留 10px 边距。与右上角工具重叠的牌子使用共用避让：始终从本关花朵重新计算，先找纵向空位，密集处再调整方向、宽度与二维偏移；偏移后的牌子用细连接杆连回本关花朵。共用节点接地点、SVG 路径及特效的坐标系统保持不变。
- 24 个名称统一为 5–6 字，介绍为一句任务说明，全部由 `content/journey-copy.json` 提供。地图、进入弹窗、关内标题和档案共用正式显示名称；规则、关卡 ID 和成绩存储键不依赖文案。
- 较长的任务说明放在点击后的介绍中，地图牌的文字仅显示关卡名称，避免密集区域的牌子相互遮挡。

标牌参考图仅用于层次与花牌对应关系，没有复制其中的文字或图片资源。自然灾害、公共安全、居家校园办公原图分别为 726×2167、724×2171、726×2167，沿用 720×2160 的逻辑坐标系；实际图中的主要地标已看图核对，不涉及关内找隐患素材或蒙版。

## 已确认的路牌素材与动效

用户于 2026-09-15 确认独立素材审核页后，三张底牌、24 枚刻纹和小红花印章接入 `public/ui/map-signs-v1/`。原始素材、生成提示词、用户批准记录和 SHA-256 见 `art-source/map-signs-v1/`。静态地图效果示意不作为地图底图使用。

| 状态 | 路牌表现 |
| --- | --- |
| 未解锁 | 材质降低饱和度和亮度，标题仍清楚；原花苞锁保留 |
| 可进入 | 奶油白金亮边、短暖金光晕，3.2 秒慢呼吸；低亮阶段仍保留明显金边 |
| 首次解锁下一关 | 现有种花引导开始后，仅新解锁路牌扫光一次，花苞回应 650ms |
| 已完成 | 保留普通材质与小红花印章；首次通关时花印轻落 380ms |

所有牌子按压时下沉 1px 并回弹；键盘焦点围住可点击路牌。离屏和页面隐藏时暂停路牌动画；系统减少动态效果时保持静态高光。重新打开地图、切换区域或重玩已完成关卡不会重播首次解锁扫光与盖章。扫光自身持续 1000ms，即使种花总计时已结束，也能在可见时完整播放后移除。

- `content/journey-signs.json`：三类材质、原图主体边界、固定关卡 ID 对应刻纹，以及动效时长。
- `app/game/journey/signs.ts`：只读取表现配置。
- `components/game/journey/map-sign.tsx`：文字、材质、刻纹、印章、亮边与扫光分层。
- `components/game/journey/use-sign-celebration.ts`：仅消费实际种花事件，不写进度或奖励。
- `components/game/journey/use-hud-safe-signs.ts`：共用 HUD 避让，检查 44px 触区、其他花床、牌花归属与地图边界；不使用关卡专用坐标或样式。
- `app/garden.css`：共用尺寸与演出，保留现有 HUD 避让偏移和 44px 触摸区域。
- `scripts/export-offline.mjs`：PNG 和 SVG 一并内嵌，离线文件不请求外部素材。

本次最终导出验收使用：

```sh
node scripts/export-offline.mjs --output outputs/绘本路牌动效版
OFFLINE_FILE=outputs/绘本路牌动效版/小红花应急行动.html MAP_SIGNS_TEST_OUTPUT=outputs/map-signs-integration-verification/layout node scripts/test-map-signs-browser.mjs
OFFLINE_FILE=outputs/绘本路牌动效版/小红花应急行动.html MAP_SIGN_MOTION_OUTPUT=outputs/map-signs-integration-verification/motion node scripts/test-map-sign-motion-browser.mjs
```

布局脚本检查素材原字节、文字下的实际纹理对比度，以及三张地图、六种视口、24 关的边界与点击，额外复查换尺寸、滚动往返后的偏移稳定性。动效脚本用全新隔离存档真实完成楼道关两次，核对首次解锁一次扫光、花苞回应、通关盖章、按压下沉、重玩不重复，以及离屏、合成后台事件和减少动态效果。报告见上述 `outputs/map-signs-integration-verification/`；历史记录不代表这次导出。

2026-09-15 最终验收通过：288 个布局样本、48 次点击关联、48 次往返稳定性和两个隔离通关分支的 10 项动效检查全部通过；28 份素材原字节一致。实测最小字号 14px、原纹理最低文字对比度 4.623，往返累计偏移 0px。正常首次通关的原生动画完整播放：扫光 1000ms、花苞回应 650ms、花印 380ms 各一次；另一隔离分支验证花印结束后切换动态偏好不重播。最终 HTML 指纹、报告和截图索引见 `painted-map-signs-verification.json`。真机、人耳和原生系统后台切换均为 `not_run`；页面后台暂停使用合成生命周期事件验证。

## 验证

```sh
pnpm test:journey
pnpm typecheck
pnpm build
pnpm export:offline
MAP_SIGNS_TEST_OUTPUT=outputs/compact-map-signs-verification node scripts/test-map-signs-browser.mjs
```

浏览器脚本直接读取最终导出的离线 HTML，在隔离、静音的无头浏览器中验证，并在 `finally` 中关闭浏览器。本次缩小标牌的结果、实际 HTML 指纹和截图输出到 `outputs/compact-map-signs-verification/`；摘要见 `compact-map-signs-verification.json`。原 `map-signs-verification.json` 和 `outputs/map-signs-verification/` 保留为双栏标牌的历史记录。

覆盖三张地图、24 个节点、320×568 / 375×667 / 390×844 / 430×932 / 540×960 / 1440×900，按 100% 缩放检查字号、文字边界、牌子与花的遮挡和点击关联；完成态存档仅为布局检查预置，不代表实际通关。

真机测试：`not_run`。人耳试听：`not_run`。

## 公共安全与居家地图替换

两张 `v3-handpainted` 图在用户确认后接入。保留关卡 ID、花朵坐标、关卡规则和存档；公共紫顶楼道的薄雾顶部由逻辑 y=660 上移到 620，高度由 440 增至 480，覆盖新屋脊，其余薄雾范围不变。

本次替换在当前轮盘界面上单独验收，使用 `outputs/painted-map-replacement-verification/run-verification.mjs` 直接打开最终离线 HTML。实际结果及 HTML 指纹见同目录 `report.json` 与 `docs/flower-journey/painted-map-replacement-verification.json`；上节标牌脚本的历史验证记录不能作为这次导出的结果。
