# 右上角绘本图标

后续调整：用户要求局部轻微减淡、米色轮廓、蓝色设置图标和再次缩小，现行尺寸为 50 × 50px。当前实现与验收见 [图标清晰度调整](MAP-CORNER-CLARITY.md)。下文保留首次透明图标接入记录。

用户确认黄色小屋、小红花和花匠调节匣三张透明底预览后，要求放到地图上，并比原来缩小一点。右上角现按“首页 → 红花计数 → 设置”竖排，独立成就奖杯入口已移除。

## 图片与计数

- 三张图为透明底 PNG，直接显示在地图上，没有底牌、边框或额外按钮背景；共享按钮尺寸由 64 × 64px 缩至 56 × 56px。
- 首页为金黄屋顶小屋，设置为带花瓣旋钮、滑杆和小扳手的绿色花匠调节匣；没有可见文字标签，保留辅助技术可读名称。
- 红花保留空白花芯。真实 `wallet` 数字通过 HTML 文本显示在花芯中央，随游戏状态更新；按位数调整字号，不把预览数值当成玩家成绩。
- 小屋返回首页，小红花打开守护档案，调节匣打开“游戏设置”。种花演出期间首页保持禁用；左下角扇形地图切换沿用现有实现。
- 守护档案只展示花数、分类进度和本机排行榜入口，不再提供返回首页、声音开关和重置记录。声音开关与当前玩家记录重置迁入游戏设置，持久偏好和原有重置确认行为保留。
- 地图右侧标题滚入工具区时，自动移到原花朵的左侧，保留本次浏览中的避让结果以防来回跳动。通用避让测量修复了展开 `DOMRect` 时丢失 `left`／`right` 的问题，显式读取边界数据。地图图片、节点位置、路线和统一视口不变；标题避让使用共享测量规则，不针对某个关卡编写例外。

## 文件

| 路径 | 用途 |
| --- | --- |
| `public/ui/map-corner-garden-v2/home.png` | 黄色首页小屋 |
| `public/ui/map-corner-garden-v2/flower-counter.png` | 无数字的红花计数底图 |
| `public/ui/map-corner-garden-v2/settings.png` | 花匠调节匣设置图标 |
| `outputs/图标预览/地图透明图标-v1/` | 用户已确认的预览与生成提示词 |
| `components/game/journey/map-chrome.tsx` | 三按钮顺序、图片和真实花数；设置入口为 `data-map-settings` |
| `components/game/journey/archive.tsx` | 守护档案窗口 |
| `components/game/journey/settings.tsx` | 游戏设置窗口 |
| `components/game/journey/use-hud-safe-signs.ts` | 标题与工具区、相邻标题和花朵点击区的共享避让 |
| `app/map-wheel.css` | 共享角落布局、字号和交互状态 |

三张素材使用用户已确认的图片。本轮不重新生成美术，历史底牌图标不再作为当前地图入口。

## 导出与验收

```sh
node scripts/export-offline.mjs --output outputs/地图透明图标版
OFFLINE_FILE=outputs/地图透明图标版/小红花应急行动.html node scripts/test-map-corner-storybook-browser.mjs
OFFLINE_FILE=outputs/地图透明图标版/小红花应急行动.html JOURNEY_MUSIC_TEST_OUTPUT=outputs/map-corner-garden-verification/music node scripts/test-journey-music-browser.mjs
```

本轮专用交付为 `outputs/地图透明图标版/小红花应急行动.html`，避免其他并行任务重新导出默认目录时改变本轮验收文件。普通默认导出路径仍为 `outputs/本地离线版/小红花应急行动.html`。验收直接加载最终文件，以隔离、静音浏览器检查三个入口、透明素材、缩小后的布局、实时数字、档案与设置分工，以及左下角地图切换，并在 `finally` 中关闭。测试存档只用于计数显示验收，不代表真实通关。报告与截图位于 `outputs/map-corner-garden-verification/`。

本轮最终 HTML 验收通过：0 / 9 / 63 花数、5 种视口共 15 组布局，20 项图标与导航检查、13 项音乐检查；页面错误和网络请求均为 0，浏览器已关闭。顶部 320 / 390px 的关卡牌与花朵均已实际点击，修复 `DOMRect` 坐标读取后不再被右上按钮遮挡。77 项旅程测试、类型检查和构建通过。真机触控、人耳听音：`not_run`。

最终 HTML SHA-256：`780267e8fc0208868321719e6b6bf43b5e42a45d7f0c99f94bcb51d70336e921`。验证摘要见 `art-source/map-corner-garden-v2/verification.json`。
