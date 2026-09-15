# 天空群岛 · 素材确认页

这是一组独立的美术素材与静态页面预览，不接入正式游戏，不修改现有地图切换逻辑。

## 打开

- `preview.html`：引用 `assets/` 下的七张 PNG 和仓库现有中文字体。
- `review.html`：运行构建脚本后生成的单文件预览，图片、字体全部内嵌，可离线打开与传阅。

```sh
node art-source/map-archipelago-review-v1/build-preview.mjs
```

## 七张素材

| 文件 | 用途 |
| --- | --- |
| `assets/entry-island.png` | 左下角树木小浮岛入口；沿用四分之一圆外壳 |
| `assets/nature-island.png` | 自然灾害主题岛 |
| `assets/public-island.png` | 公共安全主题岛 |
| `assets/home-island.png` | 居家校园办公主题岛 |
| `assets/sky-background.png` | 不透明天空背景 |
| `assets/wood-plaque.png` | 通用空白木牌，标题由 HTML 单独排版 |
| `assets/current-flag.png` | 空白当前地图旗帜，文字单独排版 |

除天空背景外，其余素材应使用真实透明通道。预览的「独立素材」页签可切换棋盘底、深色底与米色底检查轮廓。

## 预览约定

- 群岛采用 A 布局：自然灾害在上，公共安全与居家校园办公并列在下。
- 所有岛名保持单行；六字的「居家校园办公」使用略小字号。
- 左下角入口沿用当前 `app/map-wheel.css` 的 112 px 四分之一圆构造，特写放大 2 倍，仅替换内部图标。
- 岛屿与返回木牌是静态审美预览，不触发游戏导航。

## 验收与截图

- `#map-preview`：竖屏群岛页面。
- `#entry-preview`：四分之一圆入口特写。
- `#asset-tab`：切换独立素材页签。
- `#asset-grid`：全部独立素材；`data-surface` 可为 `checker`、`dark`、`paper`。
- `.asset-card[data-asset="nature-island"] .asset-surface`：单个素材的透明边缘检查。

浏览器验收需针对生成后的 `review.html`，使用隔离、静音的浏览器上下文，并在 `finally` 中关闭。真机与人耳测试未执行时记录 `not_run`。

本版已完成最终内嵌 HTML 的离线浏览器验收：全部 18 个图片引用加载成功，无外部网络请求与页面错误；390 px 与 320 px 下三个岛名均为单行，无页面横向溢出。素材网格在棋盘底和深色底均已目视检查。记录见 `browser-review.json`。真机、人耳测试均为 `not_run`。

最终截图保存在 `screenshots/`：

- `combined-preview.png`：1200 px 宽的群岛与入口并排效果图。
- `map-page.png`：竖屏群岛完整页面。
- `entry-detail.png`：完整四分之一圆入口特写。
- `assets-checker.png` / `assets-dark.png`：独立素材与透明边缘预览。
- `map-page-390.png` / `map-page-320.png`：窄屏页面效果。
- `review-overview.png`：带标题与说明的完整确认页。
