# 地图右上角图标清晰度调整

用户要求：右上角局部轻微减淡，三个图标加米色描边，设置按钮改为蓝色，整体再缩小一点；不加投影或底板。

## 实现

- 三个按钮从 56 × 56px 缩至 50 × 50px，点击区仍大于 44px；间距为 6px。
- `.map-corner-tools::before` 通过渐变蒙版给后方地图轻微降低饱和度与对比度、提亮。没有背景填色或边框，不接收指针事件，滚动时保持在工具区后方。
- 共享 SVG 滤镜沿 PNG alpha 外轮廓扩张 0.85px，填充米色 `#f6e7c5`，再叠回原图。没有偏移、模糊或投影。
- 设置使用 `public/ui/map-corner-garden-v2/settings-blue.png`；蓝色匣身保留金色把手、旋钮和滑杆。原绿色 PNG 保留。
- 花数仍为实时 HTML 文本，单／双／三位数字字号为 18／14／12px。
- 三张地图共用同一组件与样式；关卡规则、存档和统一场景视口沿用现有实现。

## 验收入口

```sh
pnpm test:journey
pnpm typecheck
pnpm build
node scripts/export-offline.mjs --output outputs/地图图标清晰版
OFFLINE_FILE='outputs/地图图标清晰版/小红花应急行动.html' MAP_CORNER_GARDEN_TEST_OUTPUT='outputs/map-corner-clarity-verification' node scripts/test-map-corner-storybook-browser.mjs
```

最终 HTML 验收报告与截图保存在 `outputs/map-corner-clarity-verification/`。素材记录和实际生成提示词保存在 `art-source/map-corner-garden-v2/blue-variant/`。验收结果以该目录实际报告为准。

真机触控、人耳试听、非零设备安全区：`not_run`。

## 本轮结果

- 77 项旅程测试、类型检查、构建和离线导出均通过。
- 最终 HTML 的 20 项交互检查、15 组布局通过；浏览器错误与 HTTP(S) 请求为 0，隔离上下文及浏览器已在 `finally` 关闭。
- 已检查公共安全地图顶部、自然灾害地图 390px 与 320px 截图：细米色轮廓可见、设置匣为蓝色、没有额外投影或有边界的底板，花芯数字完整。
- 截图中的 0／9／63 花数来自隔离测试存档，不代表用户真实成绩。
- HTML SHA-256：`4dbc7fccaaf09102f0874745bb3f8f4f6ad9adf81eb569a742e8b33134f0dd64`。
- 源码、素材指纹和命令记录：`art-source/map-corner-garden-v2/clarity-verification.json`。
