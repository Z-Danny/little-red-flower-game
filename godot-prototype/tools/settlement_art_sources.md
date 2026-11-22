# Godot 结算素材与证据

## 公共画面

| Godot 素材 | Web 原件及核对依据 |
| --- | --- |
| `assets/settlement_ui/success/` 的三段纸框及金色按钮 | `public/ui/painted-settlement-v1/`；[原始清单](../../art-source/painted-settlement-v1/manifest.json)、[完成卡说明](../../docs/painted-settlement/README.md) |
| `assets/settlement_ui/failure/` 的三段纸框、皱眉小红花及绿色按钮 | `public/ui/painted-failure-v2/`；[原始清单](../../art-source/painted-failure-v2/manifest.json)、[失败卡说明](../../docs/painted-failure/v2-verification/DESIGN.md)。主按钮和成功卡共用同一资源 |
| 奖励花、花瓣、标题字体 | 花沿用 `res://assets/ui/flower.webp`，其原件是 Web `Flower` 的 `public/levels/journey-map/flower.png`；花瓣复制 `public/ui/painted-v1/petal.webp`；标题用 `public/fonts/flower-display.woff2` 并保留 OFL |

公共画框采用原有无字切片，首尾等比，只有正文纸面纵向伸展。Godot 用真实文本排版；正文独立滚动，分数和累计按实际结果显示，两按钮固定。成功淡入奖励花和飘落花瓣，失败小红花轻摆一次。未迁移整卡进出场动画，返回、重玩与 Escape 沿用原来的信号。

[素材 SHA-256](../assets/settlement_ui/art_sources.json) 记录仓库原件。`settlement_prepare.mjs` 按原始清单校验切片，再从 [lessonFor](../../app/game/journey/knowledge.ts) 导出 26 关完整原文、78 条要点和官方出处，包括 [CPR](../../app/game/first-aid/cpr-content.ts) 与 [AED](../../app/game/first-aid/aed-content.ts)。生成文件是 `assets/settlement_ui/lessons.json`。原引擎结果、油锅冷却/禁水/撤离报警提示及保存状态仍显示；可用滚轮或键盘上下键、Page Up / Page Down 查看科普，出处链接只在主动点选时打开。

## 逐关结局画面

结算页不根据关卡名挑图。成功先用运行器传入的 `detail.safe_art: Texture2D`，按等比 `cover` 显示；没有纹理时，`detail.live_backdrop == true` 保留暂停的尾场，结算只覆盖半透明暗色。两者均未提供时使用公共天空。失败不带入成功图。原关卡的终局状态和奖励判定仍由各自运行器负责。

| 正式关卡 | 仓库证据及展示方式 |
| --- | --- |
| `typhoon-home`、`charging-bedroom`、`bedroom-night-check-v2`、`kitchen-before-cooking-v2`、`clear-corridor-check-v2`、`quake-bedroom-v2`、`storm-street-check-v2`、`thunder-park-v2`、`forest-fire-sources-v2` | [找隐患正式清单](../../content/scenes/catalog.json)所选皮肤的 `safe`。Godot `assets/hunt_runner/<id>/pack.tres` 的 `metadata/source` 记录每张原图和哈希；沿用运行器的 `detail.safe_art` |
| `rain-street-preparation-v1`、`flood-house-response-v1` | 两个[灾害配置](../../content/disaster/)的 `skin.json` 均定义 `ending`，分别是 `public/levels/rain-flood-v1/street/ending.webp`、`public/levels/rain-flood-v1/flood/ending.webp`；见[原美术说明](../../docs/rain-flood-v1/README.md) |
| `flood-kit`、`clear-corridor`、`lift-wait`、`well-call` | [正式配置](../../content/catalog.json)选用 `paperbook`，通过 `assets`、`states` 和动作在原场地更新物件与人物；没有单独结局画。原 Web `components/game/configured/player.tsx` 在原场上进入结算，Godot 保留同类终态 |
| `quake-cover-practice`、`quake-exit-practice`、`collapse-signal-practice`、`flood-highground-practice`、`car-window-practice`、`lift-contact-practice`、`fire-shelter-practice`、`fire-stairs-practice` | 正式配置的 `paper-gouache` 通过 `states`/`presentation` 显示终态，无独立结局画。`quake-exit`、`car-window`、`fire-stairs` 的 `outside.webp`、`fire-shelter` 的 `closed-background.webp` 是终态中的原图层；`flood-highground` 保留[现行室内待援版](../../docs/flood-indoor-restore/README.md)的上层场地及人物，未套用历史屋顶版。Godot 保留完整原分层终态 |
| `oil-fire` | Web `components/game/kitchen/kitchen-player.tsx`、`renderer.ts` 在原厨房中表现旋钮、锅盖和人员撤离；未找到单独结局画，Godot 保留原场地终态 |
| `first-aid-cpr` | `plaza-safe.png` 是适配视口的初始广场层，见 [CPR 美术清单](../../docs/cpr-practice/art-manifest.json)。原结算下仍有 `helper.png` 协助压胸，[设计说明](../../docs/cpr-practice/README.md)明确不演患者恢复；Godot 保留当前分层救助状态 |
| `first-aid-aed` | `realistic-v2` 配置没有 `ending`，在原场地保留患者、已贴电极和继续按压的协助者。见 [原 AED 结算与安全语义](../../docs/aed-cooperation/README.md)。Godot 保留当前分层救助状态 |

## 验证

```text
node godot-prototype/tools/settlement_prepare.mjs --check
godot --headless --audio-driver Dummy --path <已导入的独立项目副本> --script res://tools/settlement_test.gd
```

- Godot 4.6.2 隔离导入、无头输入回归、432 × 768 和 320 × 568 的 Compatibility 渲染回归通过。覆盖逐字科普、出处链接数据、背景优先级、成绩、失败安全提示、滚轮和键盘、按钮实际 GUI 输入。测试直接给结算传受控结果，没有冒充逐关实际通关，不写个人存档。
- 独立 Web 导出的 PCK 校验通过，含同一结算场景、切片与逐关 JSON。整合工程的实际浏览器通关证据由主验证另记。
- 本地日志及截图：`outputs/settlement-native-ad1/settlement_checked_*.log`、`outputs/settlement-native-ad1/screenshots-{432x768,320x568}/`。导出取证：`outputs/settlement-web-ad1/web/`，该副本 `index.pck` SHA-256 `3bb6da179512506b65490ba6e3c0c92eb77981167e18a3381a016f9ffa33cbd5`。
- 真机、人耳：`not_run`。

## 576 × 1024 点击区域

| 卡片 | `%Replay`（中心） | `%Map`（中心） |
| --- | --- | --- |
| 成功 | x124–452, y785–865（288, 825） | x80–468, y878–967（274, 922.5） |
| 失败 | x76–500, y714–812（288, 763） | x76–500, y820–923（288, 871.5） |
