# 处置关屏幕适配契约

本轮按用户最新范围只处理四个已启用处置关：《厨房着火了》《电梯停住了》《井口边的求助》《洪水围困》。放置/防范关及新草稿不纳入本轮继续制作；不修改关卡机制、原对象坐标、动画提交时序或蒙版。找隐患流水线保留现行入口，不用旧代码覆盖。

## 实际入口

| 关卡 | 当前组件 | 相机配置 |
| --- | --- | --- |
| 厨房着火了 | `components/game/kitchen/kitchen-player.tsx` / `scene-canvas.tsx` | `content/presets/kitchen/skin.json` |
| 电梯停住了、井口边的求助 | `components/game/configured/player.tsx` / `renderer.ts` | `content/levels/<id>/skins/paperbook.json` |
| 洪水围困 | `components/game/disaster/player.tsx` / `render.ts` | `content/disaster/flood-house-response-v1/skin.json` |

地图和完整离线入口为 `offline/main.tsx → GameApp`。`scripts/response-preview.tsx` 的 `/kitchen` 是实际厨房组件，`/lab` 是合成状态验收台，不能用它当通关证据。离线导出必须从维护源码目录运行，不能从 test1 根目录的旧两关源码覆盖完整游戏。

## 共享模块

- `app/game/display/viewport.ts`：visualViewport可见尺寸和偏移；手机竖屏占满内容区，桌面宽度最多520px、顶部水平居中并不超可用高度。
- `use-game-viewport.ts`：resize/scroll/orientation合并更新，player挂载期间锁文档滚动，卸载恢复；`enabled=false`时保留不在本轮范围的旧布局。
- `camera.ts`：背景、人物、道具和特效共用等比cover；同一个逆变换供点击、拖动、alpha/蒙版命中使用。
- `use-camera-obstacles.ts`：按真实HUD控件矩形平移相机，避免把整个顶部错误当成必须空出的横栏。
- `app/game-viewport.css`：surface基础约束和至少44×44 CSS px按钮；安全区只加在文字/按钮上，背景不缩进。

不自动请求浏览器系统全屏；厨房保留原有可选手动全屏按钮。手机“全屏”只指当前可见浏览器内容，不含地址栏。主应用、完整预览和离线导出都显式加载共享CSS，单独改开发页面不足以完成交付。

## 构图与等比规则

原 `world`、`width/height` 始终是设计坐标。`framing.sceneBounds` 表示真实绘画范围，可有负坐标；计算公式固定：

`scale = max(surfaceWidth / sceneBounds.w, surfaceHeight / sceneBounds.h)`

相机只在cover允许的平移范围内保护 `critical` / `criticalRegions`，不能为了露全目标偷偷缩为contain。所有必要物件和目标区域应完整可见，人物脸部不能被HUD或不合理裁切遮挡；无法满足则报告构图并真实扩画。只裁切外围非关键内容，禁止拉伸、黑边、镜像重复、模糊填充。

Canvas backing尺寸需要取整数；分别用 `backingWidth/rect.width`、`backingHeight/rect.height` 补偿像素取整，再乘同一个逻辑scale。最终CSS像素中的横纵倍率必须相同，不能只看原始context矩阵是否相等。输入不重复乘DPR，不重复减visualViewport偏移。

本轮外围生成只补新区域，原场景中心重新原样合成并无损保存；允许的本地后处理仅对新外围配准、色差匹配。原中心解码后RGB差必须为0，不修改人物/道具/蒙版。数学指标通过仍须看接缝、建筑线条和通关状态。

Configured仅 `kind=response` 接入本次沉浸相机；非本轮的旧放置/防范关保留原适配，不能为统一代码顺带裁掉它们的目标。新增同类处置关使用共享相机，只配置设计尺寸、真实背景范围和关键区域，不复制组件。

## 验收与命令

在含 `package.json` 的源码目录执行：

```powershell
node scripts/verify-response-display.mjs
node scripts/export-offline.mjs --output outputs/response-display-final
node scripts/test-configured-display.mjs --level lift-wait,well-call --html outputs/response-display-final/小红花应急行动.html --output outputs/display-adaptation/configured-final
node scripts/test-kitchen-disaster-display.mjs --level kitchen,flood --html outputs/response-display-final/小红花应急行动.html --output outputs/display-adaptation/kitchen-flood-final
node scripts/test-kitchen-disaster-display.mjs --level kitchen --size 360x900 --html outputs/response-display-final/小红花应急行动.html --output outputs/display-adaptation/kitchen-extra-final
```

四关×五尺寸：320×568、375×667、390×844、430×932、1366×900。另测360×900厨房，以及DPR2、正常动态下的厨房完整alpha/脸部/目标区和真实错误反馈。所有报告绑定最终HTML的前后SHA256；不把旧候选通过记录混作新文件证据。

测试覆盖开始、游玩、暂停、结算、重玩、地址栏高度变化模拟、拖动中resize取消、实际边缘命中和完整目标区；页面无滚动或空白条，HUD控件不越界。稳定状态与动画采样不是逐帧完整证明。隔离无头浏览器静音运行，finally关闭；**实体手机、真实移动浏览器地址栏动画和人耳试听均须独立标注，未做不能写通过**。

## 同步保护

本轮由当前维护源码的只读快照建立独立整合目录，精确合入处置显示修改；不复制旧Stage的整套找隐患/放置实现。离线导出器只追加共享CSS，保留现有草稿预览等功能。同步前逐文件比对快照哈希，任何新并发修改均停止对应覆盖；先备份再写，不能把备份当作覆盖冲突的授权。源文件和最终用户实际打开的HTML必须分别核对哈希，不以3010地址没变证明服务已加载新版。

本文件是执行契约，不是当前所有项已经通过的声明。最终实际状态以同目录交付报告及对应哈希测试记录为准。未经用户要求不提交、不推送、不发布。
