# 高楼火灾 V6：50秒与连续烟效

正式源码：`D:/中关村/小红花/小红花游戏`。交付主入口：`D:/中关村/小红花/test1/outputs/本地离线版/小红花应急行动.html`。审阅版仍为无正式发奖的测试入口。

## 计时与规则边界

本关 risk.seconds=50、presentation.timer=countdown。显示从00:50到00:00；与现行厨房相同，归零后仍可练习，不新增超时死亡。暂停和切后台不计时，完成后停止倒计时。六动作、危险选择的即时失败、胶带与手电拖动、厨房同款结算及地图发奖保持不变。50秒仅为训练节奏，不是现实火场安全时间。

## 连续演出

- `app/game/runtime/room-smoke.ts`：只读演出模型。用已提交动作的 resolvedAt 时间积分进烟量，分别输出门口流量、门底流量、已积烟量。关门不回写清空烟量，堵缝不删除旧烟。
- `components/game/configured/room-smoke.ts`：门口与门底沿独立二次曲线路径翻卷，粒子按出生时刻决定是否产生；关门后的旧烟团继续向室内上方移动，约4.8秒内离开门口流场。门口不再产生新大股烟，门底仍有细烟。湿毛巾使门底流量降至原来的25%，胶带继续减弱；这些是演出系数，不是过滤效率或防护保证。
- 顶部半透明烟层随累计量增厚，局部缓存的模糊背景逐渐降低吊灯与墙面上部清晰度，底部用渐隐遮罩衔接。烟效不覆盖整个屏幕，不通过蒙灰伪装进烟。
- 皮肤 `presentation.roomSmoke` 配置源点、路径、半径、扩散范围、寿命、吊顶区域、提交目标与充填速度。与人物、道具共用等比相机，无新命中区。角色与必需物品保持可操作。
- 减少动态设置停止烟团游动，仍保留分阶段烟量；暂停冻结粒子和积烟。重玩重置提交时间。只对显式配置 roomSmoke 的关卡生效。

## 验证

运行 `node scripts/test-fire-shelter.mjs`、`npm test`、`npm run typecheck`、`npm run build`。专项浏览器 `node scripts/test-shelter-browser.mjs` 检查50秒、归零继续、30秒积烟、关门旧烟保留、堵缝减流、暂停、四手机尺寸/桌面拖放及完整通关。`--main` 验证正式主地图结算、失败无奖及重玩不重复奖励。

证据在本次独立工作副本 `work/shelter-smoke-20260913/outputs/shelter-verification*`。重点截图：smoke-30s-open、smoke-close-immediate、smoke-closed-tail、smoke-sealed、countdown-zero。使用隔离静音浏览器，finally关闭；未做真机性能或人耳试听。本轮无新生图、无TTS、无外部发布。
