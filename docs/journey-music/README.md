# 首页与地图配乐

用户选定第二批第 3 首「忙归忙，能搞定」：应急主题、幽默救场、略有紧张感和行动感。首次接入覆盖首页、地图、档案及排行榜等关卡外页面。

## 当前行为

- 首次鼠标、触摸或 Enter／空格操作后创建音乐 AudioContext、解码并播放；首次操作前没有自动音频播放。
- 首页、三张地图、介绍卡、档案及游戏设置之间保持同一条循环。进入任何关卡播放器时用 250 ms 淡出、停止音源；返回地图从保留位置续播。
- 地图右上角的花匠调节匣打开游戏设置，提供独立的「首页／地图音乐」和按钮／奖励音效开关；音乐仍使用 `red-flower:journey-music-muted` 保存当前浏览器偏好。开关由守护档案迁移，原持久状态和各关声音控制保留。
- 切后台时立即停源、冻结播放位置，回前台时按当前页面和静音状态恢复；未解锁或保持静音的页面不会偷偷开声。
- 新音乐使用统一播放器，不复制关卡引擎，也不改关卡规则、ID、存档或画面视口。

## 文件

| 文件 | 用途 |
| --- | --- |
| `content/journey-audio.json` | 音乐路径、音量、循环范围、转场时间 |
| `public/audio/journey-v1/busy-rescue-loop.mp3` | 约 27.826 秒的本地循环资源，约 669 KB |
| `app/game/journey/music.ts` | 手势解锁、循环、淡出、续播、异步生命周期防护 |
| `components/game/journey/use-journey-music.ts` | 页面状态、持久设置和可观测状态 |
| `art-source/journey-audio-v1/` | 原始生成文件、提示词、处理脚本、来源及声音测量 |

导出工具将 MP3 内嵌为 data URL，离线加载使用直接解码，不依赖 fetch 或网络。素材首尾做短交叉衔接，去掉原小样末尾的衰减，数值连续性与人耳听感分别验收。

## 验证

```sh
pnpm test:journey
pnpm typecheck
pnpm build
pnpm export:offline
pnpm test:journey-music-browser
```

旅程回归包含 12 项音乐生命周期测试。浏览器专项在全新隔离上下文、`--mute-audio` 模式下运行，始终 finally 关闭；检查最终离线 HTML 的手势播放、跨页面连续性、单一音源、进入关卡停播、返回续播、静音记忆、模拟后台及跨整轮循环。

最新机器验收见 `outputs/journey-music-verification/report.json`，其中记录对应 HTML 的 SHA-256。此报告不会把浏览器静音执行等同于人耳试听。人耳、真机与音乐接缝听感验收：**not_run**。

以下为配乐首次接入的历史验收，摘要保存在同目录 `verification.json`：旅程与音乐测试共 60 项通过，类型检查及构建通过；最终离线 HTML 在 390×844、320×568 隔离静音浏览器中通过播放与设置检查，完整一轮循环没有重新创建或叠加音源，网络请求和页面错误均为 0，浏览器已关闭。

本轮设置入口迁移后，浏览器专项通过 `[data-map-settings]` 打开“游戏设置”验证静音和恢复；最终 `outputs/地图透明图标版/小红花应急行动.html` 的 13 项音乐检查通过，报告见 `outputs/map-corner-garden-verification/music/report.json`。页面错误和网络请求均为 0，浏览器已关闭；真机和人耳听音为 `not_run`。

后续按钮、种花与两处无声关卡的补齐，以及本轮最终 HTML 音乐回归，见 [音效验收](../audio-feedback/README.md)。
