# 地图解锁顺序验收

三张分类地图独立推进。每张地图仅第 01 关初始开放，后续关卡的 `unlockAfter` 必须等于同图编号的上一关 ID。地图节点数组既是显示编号顺序，也是配置校验依据；当前路径自下向上，y 坐标递减。

维护文件：`content/journey-map.json`。禁止把新插入的中间关卡设为 `unlockAfter: null`，或指向其他地图的关卡。调整排序时同步修改前置关系及测试。

本次修正四处：

- 自然灾害 09 `quake-cover-practice` ← 08 `flood-house-response-v1`。
- 公共安全 05 `car-window-practice` ← 04 `clear-corridor-check-v2`。
- 公共安全 07 `collapse-signal-practice` ← 06 `lift-contact-practice`，不再跨图关联地震撤离。
- 居家校园办公 05 `fire-shelter-practice` ← 04 `kitchen-before-cooking-v2`。

地图显示、进入场景、奖励存储继续共用 `journey/progress.ts` 的 `nodeStatus/canEnter`。不修改关卡内部机制、美术、既有成绩或奖励。旧存档已经完成的关卡仍允许重玩，并保留完成状态；这是历史成绩兼容，不应与空存档的新游戏混淆。开始新游戏在用户确认后仅重置当前玩家。

## 自动验收

1. `npm run test:journey`：24 个节点顺序约束，全部地图每个已完成前缀、跨地图隔离、锁定关卡奖励拒绝、新游戏重置及旧成绩保留。
2. `npm run export:offline`。
3. `node scripts/test-map-order-browser.mjs`：独立 Edge 测试档，实际打开本地 HTML；执行新游戏确认，检查所有 24 个节点并点击三个曾误开的入口；用明确标记的进度夹具检查四处连接；320px/390px 截图、无外网请求及无页面错误。可传入第一个参数指定实际交付 HTML、第二个参数指定报告目录。
4. 同步源码与实际 HTML 后再次运行第 3 步，比较报告的 HTML SHA256。

测试不得使用或清除用户浏览器的真实存档。浏览器模拟尺寸不代表真机验收。
