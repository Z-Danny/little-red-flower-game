# 小红花应急行动：Godot 版

## 开发分支

`godot-mini-game` 是 Godot 工程的开发分支，入口为 `godot-prototype/project.godot`。微信小游戏与 Godot 网页版共用这份源码；浏览器版用 Godot 的 `Web` 预设导出，微信版另做平台适配和资源分包。`main` 保留原 React 网页版；Godot 改动不合入 `main`，也不触发旧网页部署。

```text
git clone --branch godot-mini-game https://github.com/Z-Danny/little-red-flower-game.git
```

## 运行

用 [Godot 4.6.2 标准版](https://github.com/godotengine/godot-builds/releases/tag/4.6.2-stable)导入 `project.godot`。首次导入素材结束后按 F5。编辑器和 Windows 完整导出自带素材，不依赖网页或资源服务器。渲染用 Compatibility，逻辑画布为 576 × 1024。

- 「开始游戏」按各岛的地标编号逐关解锁。从结算返回地图时，镜头移到下一关。点「去首关」可定位当前岛第一个尚未完成且可进入的关卡。
- 首页「测试模式 · 解锁全部关卡」对本次旅程临时跳过前置条件，60 个地标均可进入。新增和重做的关卡见[九岛新增关卡与玩法表](../docs/nine-islands/new-levels.md)。
- 小红花按稳定关卡 ID 保存。守护档案包含闯关进度与小红花排行榜，可在本机添加或切换玩家。原有玩家记录继续使用 `user://prototype-progress-v1.cfg`，每关补发超过旧成绩的差额。

## 旧关来历

`data/original_levels.json` 记录九岛 60 个地标、26 个原正式关、原 ID、规则引擎、解锁关系、评分参考时长和历史比对。对照 GitHub 主线 `aeded70`、换图前 `510d159`、旧四章 `ce17904`、横屏 `b96cdf7` 和早期 24 关 `edaa408`，旧正式地图地标都能在新九岛找到。

`fire-patrol`（早期同名睡前防火）、`rainstorm`、`gas-leak`、`scald` 在所核版本只留定义，从未标为可玩，也不在正式进度图中。正式「睡前防火巡查」用 `bedroom-night-check-v2`；正式「暴雨街道找险」用 `rain-street-preparation-v1`。早期定义不重复导入。

## 编辑入口

| 修改内容 | Godot 文件 |
| --- | --- |
| 首页、按钮和标题图 | `scenes/home.tscn` |
| 九岛顺序、名字、图片与徽标 | `scenes/archipelago.tscn` 根节点的 `islands`；`scenes/island_card.tscn` 的 `Badge` |
| 九张地图、右上角工具和关卡木牌 | `scenes/island_map.tscn`、`scenes/map_corner_tools.tscn`、`scenes/map_level_stop.tscn`；地标坐标在 `data/original_levels.json` |
| 关卡介绍、我的进度、游戏设置 | `scenes/painted_map_intro.tscn`、`scenes/journey_progress.tscn`、`scenes/journey_settings.tscn` |
| 油锅关 | `scenes/oil_fire.tscn`；[交互和美术](assets/oil_fire/README.md) |
| 找隐患类十一关 | `scenes/hunt_runner.tscn`、`scripts/hunt_runner/`、`assets/hunt_runner/` |
| 背包、收纳、分步处置及 AED | `scenes/configured_runner.tscn`、`scripts/configured_runner/`、`assets/configured_runner/levels/` |
| 找三件合成 | `scenes/find_three.tscn`、`data/find_three.json`、`data/find_three_skin.json`、`assets/find_three/` |
| 情境判断、过街与路线选择、急救分流 | `scenes/safety_choices.tscn`、`data/safety_choices.json`、`data/safety_choices_more.json`、`assets/safety_choices/` |
| 情境点击、拖放和入场演绎 | `scenes/scene_actions.tscn`、`data/scene_actions*.json`、`assets/scene_actions/` 与 `assets/scene_actions_extra/` |
| 暴雨街道、洪水居家避险 | `scenes/disaster_runner.tscn`、`scripts/disaster_rules.gd`、`assets/disaster_runner/` |
| 心肺复苏 | `scenes/cpr_runner.tscn`、`scripts/cpr_rules.gd`、`assets/cpr_runner/` |
| 结算、评分、小红花和存档 | `scenes/settlement.tscn`、`scripts/journey_save.gd` |
| 界面字体、按钮及配色 | `theme/storybook.tres` |

`scenes/main.tscn` 通过 ID 调用各类场景，共用地图和结算。原版手绘界面的素材来源见 `assets/restored_ui/sources.json` 和[结算美术索引](tools/settlement_art_sources.md)。同一玩法共用运行器，关卡规则、美术和坐标按关配置。`assets/*/verified.json` 记录 26 个旧关的迁移验收，`data/new_island_levels.json` 记录新增关的运行器和配置。同一地标启用玩法后沿用原 ID。`tools/` 的旧版素材导入命令用于追溯和批量重导，日常改 Godot 工程无需重跑。导出的 HTML、WASM、PCK 和微信目录用于试玩和分发。

## 导出

在 Godot 安装对应版本的官方导出模板后，从「项目 → 导出」选 `Web` 或 `Windows`。Web 完整导出走 HTTP 或 HTTPS。`Web` 预设包含 `*.json`，才能读取地图和运行配置。以下命令用 `godot` 表示 Godot 4.6.2 编辑器，路径从仓库根目录算起：

```text
godot --headless --path godot-prototype --import
godot --headless --path godot-prototype --script res://tests/navigation_test.gd
godot --headless --path godot-prototype --script res://tests/launch_migrated_test.gd
godot --headless --path godot-prototype --script res://tests/journey_save_test.gd
godot --headless --path godot-prototype --script res://tests/restored_ui_test.gd
```

大资源版先构建完整 Web 导出，再用 `tools/split-release-pck.py` 将其拆为含代码和规则的 `core.pck`，以及按岛和关卡加载的图像、音频包。`tools/stage-streamed-web.py` 生成可验证的分包网页版；HTTPS 专用 `packs/` 地址在构建时固定。下载后校验 SHA-256，再挂载并缓存。Godot 编辑器中的完整工程无需调用网络版构建。预览服务可用 `python godot-prototype/tools/serve_preview.py --directory <导出路径>`。

分包网页版的触控回归为 `node godot-prototype/tests/restored-ui-web.mjs`。运行前将 `GODOT_PREVIEW_URL` 设为实际的 HTTPS 预览地址，`GODOT_UI_WEB` 设为对应的导出目录，`PLAYWRIGHT_MODULE` 设为本机已安装的 Playwright 模块路径。可用 `BROWSER_EXECUTABLE` 指定 Chromium 或 Edge 可执行文件。

微信包体的静态检查独立于浏览器测试。正式微信测试需要可配置的 HTTPS 资源域名、可用的小游戏 AppID 或测试号，并在开发者工具与 iOS、Android 真机上分别核验。运行条件见[微信导出说明](tools/wechat-export.md)。

## 游戏音效

Godot 用独立的音乐和音效总线。首页和地图共用背景音乐，进入关卡和结算时暂停，返回地图时接着播放。关卡按各自配置播放音乐与环境声。游戏设置里的音效开关控制按钮、关内动作和小红花奖励。固定音效来自原工程，重新生成 `assets/journey_sfx/` 可运行 `node godot-prototype/tools/prepare_journey_sfx.mjs`。

| 玩家动作 | 音效 |
| --- | --- |
| 开始、打开关卡卡片、关弹窗、点提示 | 点击、打开、收起和提示 |
| 找隐患、三件合成、拖放、情景练习 | 圈选、拾取、放回、合成、正确和错误。找隐患和旧处置继续使用各关的专用音轨 |
| 暴雨圈选、洪水处置 | 起笔、拾取、上楼、断电、求救、装包和整理材料 |
| 结算、点「种下小红花」 | 胜负短音。首次通关返回地图时播放落地、冒芽、开花和计数，实际解锁下一关时加解锁声 |

Web 分包导出会保留 iPhone 浏览器使用的同源 WAV。原生 Godot 和微信导出使用内置音效。导出回归运行 `node godot-prototype/tests/mobile-music-web.mjs <HTTPS试玩地址> chromium sfx`，检查实际播放和种花声完整播完。同一关等分重玩时的奖励边界由 `res://tests/progression_board_test.gd` 检查。
