# 地图单次开场与紧凑绘本窗口

2026-09-15。地图点击节点后只显示一次绘本介绍；点击金色按钮直接进入游戏。

## 行为

- `LevelEntry` 使用共享 `PaintedLevelIntro`，正文来自 `content/level-introductions.json`。已完成关显示「再玩一次」，未解锁关显示具体前置关卡和禁用按钮。
- 关卡时长等旧地图附加信息不再显示，避免旧展示字段的「不限时」与实际规则不一致。
- 删除绘本窗口的返回地图按钮；点击外侧或 Escape 关闭，保持地图滚动位置、恢复节点焦点。外侧按下拖入窗口、从窗口拖出及大幅滑动不关闭。
- 显示窗口期间地图控件 inert，阻止底层点击、Tab 与读屏导航；关闭时恢复原值。
- 入口组件和 `GameApp.startLevel` 均验证可玩与前置条件；即使移除 DOM disabled 属性也不能启动锁定关卡。
- 正式地图传 `autoStart`；5种播放器各自使用原开始逻辑。资源 ready 后等待 220ms 入场和两帧绘制，再开始计时。准备时不计时、不响应场景操作。重复点击不会重复启动。独立开发预览保留可选介绍。
- 正常加载直接过渡；超过800ms才显示轻量准备信息。资源失败提供重试与退出，不弹第二次介绍。重玩直接开始。
- 地图开始手势同步创建并恢复静音 AudioContext，场景准备好后由对应声音系统领取，播放器负责释放；离开准备过程释放未领取的上下文。真机是否能出声仍需真机验证。

## 视觉

- 390px视口中面板约322px宽、按钮约219px宽；面板桌面最大400px。按钮最小点击高度44px。
- 绘本底板和按钮为两张独立透明图，保留金边、深绿标题与米白纸张。采用内置 ImageGen 编辑，Sharp仅用于透明裁边、等比缩放与压缩。素材、实际提示词与SHA见 `art-source/painted-entry-v2/manifest.json`。
- 浮入220ms、关闭140ms、按钮按下缩至97%、游戏入场220ms。减少动态效果设置禁用这些动画。未采用可选循环装饰。
- 全部样式集中 `app/painted-ui.css`；没有改规则、ID、存档或场景相机。

## 验证入口

- `pnpm test`（包含新增音频手势交接生命周期单测）
- `pnpm typecheck`、`pnpm build`、`pnpm export:offline`
- `pnpm test:single-entry-browser`

本次交付使用独立目录 `outputs/单次开场离线版/小红花应急行动.html`，保留同工作区其它任务的导出文件。浏览器命令设置 `OFFLINE_FILE=outputs/单次开场离线版/小红花应急行动.html`，隔离本机存档、无头静音运行，并在 finally 关闭。报告默认 `outputs/single-entry-verification/report.json`，绑定最终HTML SHA，截图位于同目录。测试预置成绩仅用于验收入口，不代表实际游玩所得。真机与人耳试听标记 `not_run`。

## 本次交付结果

- 完整单测1880项、类型检查、生产构建、离线导出均通过。
- 最终HTML：24关入口、52组尺寸、5种玩法的准备与暂停计时、4项加载故障恢复、锁定防绕过及关闭焦点检查通过。网络请求、资源请求失败和运行错误均为0，5个测试context和浏览器均关闭。
- 人工检查320/390px及桌面弹窗，另检查「风雨街口找险」可开始状态截图；正文、标题和按钮无重叠。
- SHA-256：`def063396380d1674a60f08e7d41e0c7533252453330bd708f8e01b960d02cbf`，254786597 bytes。
- 导出后同工作区另一个任务继续修改地图标题避让文件 `components/game/journey/use-hud-safe-signs.ts`；独立交付包保持已经完整验证的快照，不跟随之后的地图改动重新覆写。此次入口相关改动均已包含。
- [汇总记录](verification.json)，完整浏览器证据为 `outputs/single-entry-verification/report.json`；[内置ImageGen素材与实际提示词记录](../../art-source/painted-entry-v2/manifest.json)。真机、人耳试听仍为 `not_run`。
- 本次未提交、推送或发布。
