# 居家校园办公：道路与花位标注

底图：`public/levels/journey-map/home-v3-handpainted.png`。原图 726×2167，游戏按 720×2160 逻辑画布显示；原点在左上角，x 向右、y 向下。不要把屏幕像素或原图像素直接混入配置。

## 标注数据

- `content/journey-routes.json`：沿石板主径目视标注道路中心线，共 55 个不同采样点，按相邻关卡分为五段。包括厨房外侧、儿童房花廊、卧室与喷泉、校园厨房河岸、住宅与楼梯出口之间的弯道。
- `content/journey-map.json`：花朵接地点、`signSide`（标牌在本关花朵的左/右侧）、地点说明及恢复后的花丛。
- `app/game/journey/routes.ts`：平滑插值穿过标注点。只有图片、画布尺寸和两端节点都匹配时才使用标注；未标注地图保留原来的自动连线。

| 关卡 | 接地点 x,y | 标牌侧 | 地点 |
| --- | --- | --- | --- |
| 油锅起火处置 | 285,2025 | 右 | 厨房院门外，标牌避开左下角地图切换 |
| 卧室充电巡查 | 360,1658 | 右 | 儿童房门前主径，避开下方柏树 |
| 睡前防火巡查 | 350,1355 | 左 | 卧室台阶外主径 |
| 厨房开火检查 | 303,1020 | 右 | 校园厨房左下入口 |
| 火灾隔烟待援 | 289,700 | 左 | 住宅台阶外、木桥东端路灯左侧 |
| 火灾楼梯撤离 | 500,356 | 左 | 楼梯出口平台下方 |

节点坐标是花床底部中点，不是花朵图标中心。标牌随节点一起移动，宽度按指定一侧剩余空间收缩，保留地图边距和触摸范围。路线按原有前置关卡状态亮起，关卡 ID、规则、解锁顺序与存档不变。

## 核对和再标注

```sh
node scripts/annotate-journey-route.mjs home
```

打开 `outputs/home-map-alignment/道路坐标标注.html`：蓝线是游戏实际使用的插值曲线，黄点是采样点，红点是花床接地点。可切换网格、采样点，点击底图读取逻辑坐标。预览内嵌当前原图，并记录底图 SHA-256；不会修改游戏数据。

调整花位时，同步更新关联路段的首末点和恢复装饰。新增图片必须重新核对道路，不要套用旧构图坐标。视觉核对要检查整段曲线，尤其是路边柏树、灯柱、低墙和花坛。

## 最终产物验收

```sh
pnpm test:journey
pnpm typecheck
node scripts/export-offline.mjs --output outputs/居家地图对齐版
OFFLINE_FILE=outputs/居家地图对齐版/小红花应急行动.html MAP_SIGNS_REGIONS=home MAP_SIGNS_TEST_OUTPUT=outputs/home-route-verification node scripts/test-map-signs-browser.mjs
```

浏览器检查最终离线 HTML：居家图六种尺寸下的花朵/标牌关联与可点击性（省略 MAP_SIGNS_REGIONS 可回归三图）；曲线经过采样点、图片与 SVG 坐标一致、两端连接花床；完成 0–6 关时路线亮起情况；新游戏、全部完成、部分完成状态的全道路分段截图。完成状态使用隔离显示存档，不代表实际通关。浏览器 headless、静音，在 `finally` 中关闭。

验收结果见 `outputs/home-route-verification/report.json`，摘要见本目录 `home-route-verification.json`。真机：`not_run`；人耳听音：`not_run`。

本次交付使用 `outputs/居家地图对齐版/小红花应急行动.html`，避免共享默认导出文件被其他工作覆盖。验收以报告内该文件的 SHA-256 为准。

最终验收：72 个布局样本、12 组点击关联、17 组路线几何和 85 段路线状态均通过。附加三图巡检发现未改动的自然/公共地图在 320×568 下有角落控件遮挡标牌触区，原始报告保留于 `outputs/home-route-regression-before-sign-fix/report.json`；本次居家图中的同类遮挡已修复并复验通过。

后续已完成另外两图的道路与花位对齐，并解决上述自然/公共地图窄屏遮挡；最新整合版与三图回归结果见 [三图道路标注](MAP-ROUTES.md)。
