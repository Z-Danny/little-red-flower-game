# 《充电中的卧室》交付入口

这是追加的独立第 13 关，ID `charging-bedroom`，不是替换第 01 关或第 02 关。打开游戏关卡地图，选择《充电中的卧室》。圈出三个隐患，完整观看停用待处理的结局，即可获得小红花。

- 双击离线游戏：项目 `outputs/本地离线版/小红花应急行动.html`。
- 可维护配置：`content/scenes/charging-bedroom/` 的 rules / skin / presentation 三份 JSON。
- 最终母版、蒙版、结局、实际生成提示词：`art-source/charging-bedroom-v1/`。
- 运行资源：`public/levels/charging-bedroom-v1/`，不得用过程候选图替换。
- 制作过程、安全知识支持边界、验证结果：本目录 `制作记录.md`、`knowledge-review.json` 和 `verification/`。

画面修订：破损黑线接在插线板顶面的黑插头上；插线板自身的白供电线从侧面进入，两路不合并、不变色。这里没有用发黑表示线缆烧焦，也不模拟起火。

图片生成使用内置工具，具体模型版本未公开；所有实际提示词已留档。无 AI 朗读、无卧室雨火粒子。源码没有提交、推送到远端；后续可通过 GitHub Desktop 审阅改动。
