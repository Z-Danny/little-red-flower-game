# 地图局部薄雾

未解锁关卡只遮住对应建筑或街道；关卡进入 `available` 状态时移除该区域的薄雾，不必等该关通关。每张地图的第一关初始开放，其对应地物从一开始就不遮。底图没有全局薄雾，其他锁定区域的薄雾浓度不随完成比例变化。

## 配置与渲染

- `content/journey-fog.json`：每张图记录 `image`、`width/height`，以及按稳定关卡 ID 索引的 `areas`。`x/y` 是遮罩范围左上角，`width/height` 是尺寸，全部使用地图源坐标。
- `components/game/journey/map-scene.tsx`：沿用 `nodeStatus` 判断锁定状态，仅为 `locked` 节点渲染 `.garden-location-fog`。解锁时直接移除，没有依赖通关比例的透明度过渡。
- `app/garden.css`：所有地图共用固定浓度、低饱和度和柔边椭圆遮罩。百分比位置随地图缩放，遮罩不接收指针事件，关卡标牌和地图导航位于上层。

换地图必须重新核对建筑、街道位置，并更新对应薄雾配置。图片路径或地图尺寸不匹配时不套用旧范围。花径、灯光仍沿用原来的完成装饰逻辑，独立于薄雾。

## 最终离线 HTML 验收

```sh
pnpm export:offline
node scripts/test-map-fog-browser.mjs
```

脚本使用隔离、硬静音的浏览器并在 `finally` 中关闭，检查初始、部分解锁、全部完成的地图与多个视口。进度预置仅用于显示状态验收，不作为真实通关证据。报告与截图写入 `outputs/map-fog-verification/`；真机和人耳检查未执行时记录 `not_run`。
