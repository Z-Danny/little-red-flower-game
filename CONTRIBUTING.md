# 参与贡献

感谢帮助改进“小红花游戏”。可以通过 Issue 报告问题，也可以 Fork 后提交 Pull Request。

## 开发流程

1. 从 `main` 创建短分支，例如 `fix/gas-switch-hit-area` 或 `feat/new-level`。
2. 执行 `pnpm install` 和 `pnpm dev`，在手机宽度及桌面宽度下检查交互。
3. 找隐患从 `content/hunt-template` 和 `docs/hunt-pipeline/README.md` 开始；规则、皮肤、演出和文案分别配置，共用现有引擎和统一视口。处置关参见 `docs/response-workflow/README.md`，不要为每关复制一套渲染与存档逻辑。
4. 为新规则补充 `tests/` 中的自动测试。
5. 提交前执行 `pnpm verify`。

## 关卡验收底线

- 可见物与点击/拖拽判定区域一致，不能依赖透明矩形热区蒙混过关。
- 固定处理动画持续 0.5–1.5 秒，并在动画结束后提交结果。
- 正确、危险和无关操作都有立即且可理解的反馈。
- 允许纠正还是立即失败由具体关卡规则决定。失败必须可退出或重试，且不得发放奖励或提前解锁。
- 手机竖屏能够辨认目标、完成全部动作和阅读结算文案。
- 不提交密钥、账号、生成缓存、`node_modules` 或 `outputs`。

完整的批量关卡制作方式见 `docs/hunt-pipeline/README.md`。

新增或调整首页、地图、存档逻辑后，必须验证开始新游戏、取消确认、继续游戏、刷新保存及玩家隔离。以最终导出的 HTML 为准检查手机布局；浏览器验证请使用隔离环境、静音，并在结束时关闭浏览器。普通使用、离线导出、Pages 和 Release 发布步骤见根目录 README。
