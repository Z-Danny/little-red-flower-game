# 电梯故障待援交互改进（2026-09-27）

用户要求：落实试玩评审中的危险落点反馈、常驻进度、互动通话与短待援回合。

## 实现
- 共享拖放反馈读取当前匹配规则的 outcome。危险区域显示禁止符号、红色边框和放下前的危险说明；安全区保留金色确认反馈。未修改拾取蒙版、相机、落点判定或其他关卡目标。
- `Rules.coaching` 为传统处置运行器的可选配置：常驻任务、可回看提示、带前置/结束条件的对话卡。
- 对话选项通过 `Input.choice` 指向带 `Interaction.choice` 文案的规则。按钮本身不发放目标；动画结束后仍由 reduceRun 提交目标。普通点按不能触发对话选项，也不能跳过当前对话。
- 校验器验证选项引用及可达性；UI无关卡ID分支。未启用 coaching 的关卡保留原逻辑。
- 本关新增：接通对讲 → 报告电梯位置 → 如实报告人数/状况；进入等待区后，回应“保持联系”才能结束。允许先进入等待区再求助，不添加救援倒计时或强制挂机。
- 楼层键、已联络后的报警键均有具体解释。关键安全提示可反复查看，错误选择解释保留在当前对话卡内。
- 沿用当前场景资产；对话UI使用项目原有纸卡配色与HTML/CSS。无新图片资产、无TTS。

## 验证
- `npm test`：全部1968项测试通过（含新增7项状态机/配置测试）。
- `node node_modules/typescript/bin/tsc --noEmit`：通过。
- `node scripts/export-offline.mjs --output ../交互优化离线版`：规则/资产校验及离线导出通过。
- `scripts/test-lift-coaching-browser.mjs`：在最终导出HTML上验证正常路线、等待优先路线、错误反馈、暂停、重开、不重复奖励，以及320×568 / 390×844 / 844×390 / 1280×720视口。
- `scripts/test-pointer-feedback-browser.mjs`：同一最终HTML上回归手机/桌面下的楼道收集、遮罩边缘选择、电梯拖放和地震处置拖放。
- 两组浏览器测试均采用独立存档、静音，并在 finally 关闭；无 pageerror。
- 真机触控：not_run。人耳音频：not_run。没有声称已人工试玩全部关卡。

## 重跑
浏览器脚本通过 `PLAYWRIGHT_PATH` 指向已有Playwright安装，`EDGE_PATH` 可选覆盖Edge路径。默认不使用用户浏览器资料。

```powershell
node scripts/test-lift-coaching.mjs
node scripts/test-lift-coaching-browser.mjs '../交互优化离线版/小红花应急行动.html' '../电梯关改进-2026-09-27'
```

`config-review.json` 只批准用户本次要求涉及的电梯规则/皮肤配置变化；其他关卡和资产仍受原有冻结基线保护。
