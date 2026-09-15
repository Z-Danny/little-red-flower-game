# 天空群岛选择页

左下角保留 112px 的四分之一圆按钮，图标换成树木浮岛。点击进入共享竖屏画框中的完整天空群岛页。旧扇形菜单和圆环选项已移除。

## 画面与操作

- 三座岛尺寸一致，排成三角形：自然灾害在上方居中，公共安全在左下，居家校园办公在右下。三个标题都用独立文字单行显示，长标题缩小字号。
- 三层云缓慢漂移；岛屿上下浮动总幅度为 6px，各自节奏错开；“当前”红旗轻轻摆动。
- 选择新岛：岛屿放大至 1.04 倍，播放点击声；唯一一面旗子约 350ms 到达、轻落并播放确认声，约 800ms 后进入所选地图。
- 点击当前岛：约 250ms 的短反馈后回到地图，不重新飞旗或改变滚动位置。
- 返回按钮 / Escape 可取消选择过程并恢复刚才地图的位置。过渡中防连点，取消后不留下延迟跳转；键盘焦点留在群岛页，关闭时回到入口。
- 底层关卡地图保持挂载，以保留滚动位置；隐藏时禁止交互。切换其他岛后定位到该区域当前可用节点。
- 同一首页／地图配乐连续播放；点击和落旗使用已有音效系统，遵循现有音乐与音效开关。切后台暂停过渡，减少动态效果偏好下使用短淡入淡出。
- 种花期间入口沿用禁用状态。导航不修改关卡 ID、规则、解锁关系、成绩或存档结构。

## 维护入口

| 内容 | 文件 |
| --- | --- |
| 素材路径、旗子位置、切换时序、目的地计算 | `app/game/journey/archipelago.ts` |
| 群岛交互、旗子迁移与键盘行为 | `components/game/journey/archipelago.tsx` |
| 群岛布局与动效 | `app/archipelago.css` |
| 左下角入口与地图角落工具 | `components/game/journey/map-chrome.tsx`、`app/map-wheel.css` |
| 原地图保持与群岛页面接入 | `components/game/level-hub.tsx` |
| PNG 源信息与提示词 | `art-source/map-archipelago-v1/` |

## 最终文件验证

```sh
node scripts/export-offline.mjs --output outputs/天空群岛版
node scripts/test-archipelago-browser.mjs --html outputs/天空群岛版/小红花应急行动.html
OFFLINE_FILE=outputs/天空群岛版/小红花应急行动.html JOURNEY_MUSIC_TEST_OUTPUT=outputs/archipelago-music-verification node scripts/test-journey-music-browser.mjs
```

定向浏览器报告输出在 `outputs/archipelago-verification/report.json`，音乐连续性报告在 `outputs/archipelago-music-verification/report.json`。报告记录所测 HTML 的 SHA-256，避免将源码检查当成最终产物验收。浏览器在隔离存储与静音环境中运行并于 `finally` 中关闭；实体手机、人耳听音及非零系统安全区检查为 `not_run`。

旧 `test-map-fan-browser.mjs` / `test-map-wheel-browser.mjs` 保留为历史布局记录；当前导航以 `test-archipelago-browser.mjs` 为准。

本轮等大三角布局的最终 HTML：`d2beb638a741be352f2915350a9f95cdb01e491c717a1b23d889abbbc0f221d8`。6 种视口、24 项导航与布局检查、15 项音乐检查通过；包含三岛等大断言和真实关卡开始／暂停返回链路。`pnpm test`、类型检查、定向 lint 与正式构建通过。汇总见 `outputs/archipelago-verification/summary.json`。
