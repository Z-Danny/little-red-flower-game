# 参与贡献

感谢帮助改进“小红花游戏”。可以通过 Issue 报告问题，也可以 Fork 后提交 Pull Request。

## 开发流程

1. 从 `main` 创建短分支，例如 `fix/gas-switch-hit-area` 或 `feat/new-level`。
2. 执行 `pnpm install` 和 `pnpm dev`，在手机宽度及桌面宽度下检查交互。
3. 规则写入 `app/game/<level>/`，渲染与输入写入 `components/game/<level>/`，美术放在 `public/levels/<level>/`。
4. 为新规则补充 `tests/` 中的自动测试。
5. 提交前执行 `pnpm verify`。

## 关卡验收底线

- 可见物与点击/拖拽判定区域一致，不能依赖透明矩形热区蒙混过关。
- 固定处理动画持续 0.5–1.5 秒，并在动画结束后提交结果。
- 正确、危险和无关操作都有立即且可理解的反馈。
- 错误操作不能把关卡永久锁死；风险到顶后仍允许完成训练。
- 手机竖屏能够辨认目标、完成全部动作和阅读结算文案。
- 不提交密钥、账号、生成缓存、`node_modules` 或 `outputs`。

完整的批量关卡制作方式见 `docs/AI关卡生产流水线执行规范.md`。
