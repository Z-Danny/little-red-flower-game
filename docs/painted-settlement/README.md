# 全关卡手绘完成弹窗

本次将用户确认的“还得是你！”完成卡接入 24 个正式关卡共用的 `Settlement`。三类找隐患/处置/专用灾害引擎仍通过原有 `onFinish → claimFirstCompletion → receipt → returnMap` 路径完成结算。

## 外观与内容

- 深绿标题牌、朝向玩家的手势、米白纸面、金色边框及独立金色主按钮，右下角保留叶片与小红花。
- 标题“还得是你！”，下方为实际关卡名称和各关独立短句；不用“· 已完成”等后缀。
- 三朵奖励花缩小，中央花略高；首次到账后依次绽开，并有一片短暂飘落的花瓣。开启减少动态效果时关闭这些动画。
- 每关三条科普，以粗体要点加短正文呈现；正文每条 36–43 字，共 72 条。来源可点击，放在按钮上方。
- 第一遍有效完成显示“+3 朵小红花 / 种下小红花”；重玩显示“小红花已种下 · 本次为巩固练习 / 回到地图”。没有按钮下方文字。
- 保存期间按钮禁用；真实保存失败显示错误及“重试保存”；原有存储空间不足时的页面暂存提示仍由游戏统一展示。
- 长内容在小屏内垂直滚动，正文不缩小成图片。弹窗打开时焦点在标题，来源与按钮留在原有模态焦点范围内。

## 实现位置

| 内容 | 文件 |
| --- | --- |
| 共用完成卡与保存状态 | `components/game/journey/settlement.tsx` |
| 弹窗样式及初始焦点参数 | `components/game/journey/dialog.tsx` |
| 独立样式 | `app/painted-settlement.css` |
| 24 关短句、知识与来源 | `app/game/journey/knowledge.ts` |
| 美术源图、提示词与哈希 | `art-source/painted-settlement-v1/` |
| 运行时无字美术 | `public/ui/painted-settlement-v1/` |
| 最终 HTML 验收 | `scripts/test-painted-settlement-browser.mjs` |

面板使用连续的 header/body/footer 切片，只有纸面正文纵向伸缩；手势、标题牌、角花和按钮保持比例。动态文字全部由 HTML 渲染，不烤入图片。`app/layout.tsx` 与离线导出脚本均加载新样式。

## 范围与依据

不改变关卡 ID、玩法、蒙版、角色坐标、镜头、完成判定、奖励及存档规则。既有开始关卡的金绿手绘界面继续使用原组件。

科普根据每关实际目标和现有规则收窄适用范围：待援仍是待援，找到隐患不代表现实灾害消失，模拟操作也不等于所有真实情境。见 [逐关内容与官方来源](SOURCES.md)。

旧浏览器回归脚本中与完成弹窗有关的定位器同步迁移到稳定 `data-testid`；没有改变旧脚本的玩法输入或完成流程。

## 验证与复现

```sh
pnpm verify
pnpm export:offline
node scripts/test-painted-settlement-browser.mjs
node scripts/test-painted-ui-browser.mjs
```

- `pnpm verify` 已通过：1,867 项单元检查、厨房美术校验、TypeScript 和生产构建。
- 最终 HTML 浏览器证据见 [验收报告](verification/README.md)，其中明确区分 24 关受控完成边界验证与真实指针通关。
- 完成弹窗已通过 24 关、96 个视口样本；台风关实际触摸通关，奖励与保存异常检查通过。既有开始弹窗和 HUD 回归亦通过，见 [开场回归](../painted-ui/verification/README.md)。
- [正常动效冒烟](normal-motion.json) 检测三花绽放、花瓣出现及消失、按钮返回后地图种花；这是正常动态偏好下的 DOM 时序检查，不是真机或人眼观感测试。
- 保存失败/重试、重玩不重复加花、页面暂存降级、4 种视口、滚动和焦点均由最终 HTML 脚本验证。
- 修改前已有未提交工作；本次保存了受影响共用文件的原始副本，并比较 26 份规则/关卡 JSON 哈希无变化。基线在 `outputs/painted-settlement-baseline/`。
- 真机触控：`not_run`。人耳音频：`not_run`。浏览器均隔离、静音，使用 `finally` 关闭。
- 本次未提交、推送或发布。

离线成品：`outputs/本地离线版/小红花应急行动.html`。
