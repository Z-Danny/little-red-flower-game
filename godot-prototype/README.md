# 小红花应急行动：Godot 版

## 开发分支

`godot-mini-game` 是 Godot 工程的开发分支，入口为 `godot-prototype/project.godot`。微信小游戏与 Godot 网页版共用这份源码；浏览器版用 Godot 的 `Web` 预设导出，微信版另做平台适配和资源分包。`main` 保留原 React 网页版；Godot 改动不合入 `main`，也不触发旧网页部署。

```text
git clone --branch godot-mini-game https://github.com/Z-Danny/little-red-flower-game.git
```

## 运行

用 [Godot 4.6.2 标准版](https://github.com/godotengine/godot-builds/releases/tag/4.6.2-stable)导入 `project.godot`。首次导入素材结束后按 F5。编辑器和 Windows 完整导出自带素材，不依赖网页或资源服务器。渲染用 Compatibility，逻辑画布为 576 × 1024。

- 「开始游戏」按老版的前置条件解锁；岛内可点「去首关」定位第一个可玩的入口。
- 「试玩已迁移关卡」只对本次从首页进入的旅程临时跳过前置条件，可到不同岛逐关验证。没有玩法的 6 个旧预告和 28 个新占位仍只能看介绍。
- 小红花按稳定关卡 ID 保存在 `user://prototype-progress-v1.cfg`。油锅原型的记录仍有效，每关补发超过旧成绩的差额。旧网页版的多人存档与本工程分开。

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
| 找隐患类九关 | `scenes/hunt_runner.tscn`、`scripts/hunt_runner/`、`assets/hunt_runner/` |
| 背包、收纳、分步处置及 AED | `scenes/configured_runner.tscn`、`scripts/configured_runner/`、`assets/configured_runner/levels/` |
| 暴雨街道、洪水居家避险 | `scenes/disaster_runner.tscn`、`scripts/disaster_rules.gd`、`assets/disaster_runner/` |
| 心肺复苏 | `scenes/cpr_runner.tscn`、`scripts/cpr_rules.gd`、`assets/cpr_runner/` |
| 结算、评分、小红花和存档 | `scenes/settlement.tscn`、`scripts/journey_save.gd` |
| 界面字体、按钮及配色 | `theme/storybook.tres` |

`scenes/main.tscn` 通过 ID 调用各类场景，共用地图和结算。原版手绘界面的素材来源见 `assets/restored_ui/sources.json` 和[结算美术索引](tools/settlement_art_sources.md)。找隐患和灾害关共 11 关有独立的原过关图；其他 15 关让原有场景停在处置完成的状态，放在结算卡后。同一玩法只改一套运行器；关卡的规则、美术和坐标单独改。`assets/*/verified.json` 是迁移验收记录；确认旧版曾可玩、迁移通过且有对应场景才允许开始。`tools/` 的旧版素材导入命令用于追溯和批量重导，日常改 Godot 工程无需重跑；重导会替换对应快照。导出的 HTML、WASM、PCK 和微信目录都不是编辑入口。

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
