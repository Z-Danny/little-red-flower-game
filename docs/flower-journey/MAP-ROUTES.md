# 三张地图：道路与花位标注

三张地图统一使用 `content/journey-routes.json` 中按底图标注的路线，替代仅按两朵花的位置自动生成的连线。花位和标牌侧向由 `content/journey-map.json` 管理。画布坐标均为 720×2160，原点位于左上角；每朵花的坐标表示花床底部中点。

## 对应地物

- **自然灾害**：临海住宅、备灾物资棚、卧室、斑马线街道、公园、营地、排水街道、被淹河畔住宅、木桌客厅、楼梯集合广场、高层避洪住宅，共 11 个花位。路线沿石板主径、河岸与广场铺装，避开水面、花坛和墙体。
- **公共安全**：底部石拱楼道、下部玻璃电梯、井口、紫色住宅楼道、落水蓝车旁的岸上平台、上部电梯、塌陷区外侧，共 7 个花位。路线绕楼道右侧、玻璃电梯左侧、井口东侧，并经过上部桥头。花朵落在警戒线外或岸上道路。
- **居家校园办公**：沿用上一轮已经验收的 6 个花位和 5 段道路，详见 [居家地图标注](HOME-MAP-ROUTES.md)。

标牌通过 `signSide` 选择花朵左侧或右侧。最下方的公共安全节点朝右，避开地图切换扇形；顶部节点和密集节点按实际路面位置与左右空间安排。宽度、点击范围、地图缩放仍使用原有共用组件和样式，没有新增专用相机。

自然图第 10 个节点位于广场支路，前后两段在入口共享一小段铺装路面，以避免横穿花坛；调整时应保留该地物约束。

## 数据与预览

- `content/journey-routes.json`：每张底图的图片路径、画布尺寸、按相邻关卡 ID 分段的道路采样点。
- `content/journey-map.json`：节点、标牌朝向、地物说明及恢复花丛与灯光。
- `app/game/journey/routes.ts`：经过每个采样点的平滑曲线；仅当图片、画布与两端节点匹配时使用对应标注。
- `scripts/annotate-journey-route.mjs`：使用游戏同源曲线和原图生成可点读坐标的网格叠加预览。

```sh
node scripts/annotate-journey-route.mjs nature
node scripts/annotate-journey-route.mjs public
node scripts/annotate-journey-route.mjs home
```

预览位于 `outputs/<地图ID>-map-alignment/道路坐标标注.html`。蓝线为道路，黄点为采样点，红点为花床接地点；点击地图可读取逻辑坐标。实际 PNG 尺寸与逻辑画布略有差异，预览和游戏使用相同缩放，不能直接混用原图像素坐标。

更换底图需要重新标注，不得沿用旧构图的道路。移动节点需要同步改两端路线与恢复装饰。关卡 ID、前置关系、存档、奖励和关内规则不随位置变化。

## 最终离线 HTML 验收

```sh
pnpm test:journey
pnpm typecheck
node scripts/export-offline.mjs --output outputs/三图道路对齐版
OFFLINE_FILE=outputs/三图道路对齐版/小红花应急行动.html MAP_SIGNS_TEST_OUTPUT=outputs/all-map-route-verification node scripts/test-map-signs-browser.mjs
```

使用独立输出目录，避免共享默认导出文件在测试后被覆盖。浏览器直接打开上述 HTML，并核对测试前后 SHA-256 一致。

检查包含三图六种尺寸的标牌文字、边界、点击关联；道路坐标范围、分段完整性、图片与 SVG 对齐、曲线经过采样点、首尾连接花床；每张地图从零进度、每个部分完成前缀到全部完成的道路亮起状态。显示存档仅用于布局和解锁状态检查，不代表实际通关。浏览器隔离、headless、静音，所有上下文和浏览器在 `finally` 中关闭。

完整结果与截图：`outputs/all-map-route-verification/`。摘要：`all-map-route-verification.json`。真机与人耳听音均为 `not_run`。

最终结果：288 个布局样本、48 组花朵与标牌点击关联、57 组路线几何和 413 条路线状态全部通过；此前自然图顶部、公共图底部在 320×568 的标牌遮挡均已解决。自然/公共新增 141 个不同道路采样点，三图合计 196 点、21 段。
