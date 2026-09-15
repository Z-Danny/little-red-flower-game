# 完成弹窗：最终离线 HTML 验证

- 结果：passed
- HTML：/Users/danny/dannyprojects/小红花/outputs/本地离线版/小红花应急行动.html
- SHA-256：f27d20afa948d94999bba0635f638c1d3a0b23cb22aa6b8179bb22172c8cdee2
- 浏览器：152.0.7977.83；headless、独立存储、offline、--mute-audio。
- finally 清理：27/27 contexts；browserClosed=true。
- 受控完成边界：24/24；视口样本：96/96。
- 视口：390×844、320×568、430×932、1440×900；检查滚动、无横向溢出、CTA可见可点、键盘焦点限制与 reduced-motion。
- 24关受控样本通过现有 MainGameApp/player.onFinish → 真正共用 Settlement；预设23关解锁夹具。**不是24关实际通关测试。**
- 真实指针通关：typhoon-home；随后受控重玩检查0奖励与不重复种花。
- 真实claim失败/恢复重试：用另一份有效测试存档临时移除session玩家，再恢复；不修改真实用户数据。
- localStorage配额失败：验证既有session降级提示、旧持久存档不变且可继续。
- 科普来源仅核对页面显示与已审阅数据一致、HTTPS及新窗口隔离；脚本不会访问链接。
- 运行时错误 0；HTTP(S)请求 0；失败请求 0。
- physicalDevice: not_run
- humanAudio: not_run

## 截图

- [oil-fire-390x844.png](oil-fire-390x844.png)
- [oil-fire-320x568.png](oil-fire-320x568.png)
- [oil-fire-320x568-scrolled.png](oil-fire-320x568-scrolled.png)
- [oil-fire-430x932.png](oil-fire-430x932.png)
- [oil-fire-1440x900.png](oil-fire-1440x900.png)
- [typhoon-home-390x844.png](typhoon-home-390x844.png)
- [typhoon-home-320x568.png](typhoon-home-320x568.png)
- [typhoon-home-320x568-scrolled.png](typhoon-home-320x568-scrolled.png)
- [typhoon-home-430x932.png](typhoon-home-430x932.png)
- [typhoon-home-1440x900.png](typhoon-home-1440x900.png)
- [fire-shelter-practice-390x844.png](fire-shelter-practice-390x844.png)
- [fire-shelter-practice-320x568.png](fire-shelter-practice-320x568.png)
- [fire-shelter-practice-320x568-scrolled.png](fire-shelter-practice-320x568-scrolled.png)
- [fire-shelter-practice-430x932.png](fire-shelter-practice-430x932.png)
- [fire-shelter-practice-1440x900.png](fire-shelter-practice-1440x900.png)
- [genuine-typhoon-completion.png](genuine-typhoon-completion.png)
- [save-failure-retry.png](save-failure-retry.png)
- [save-retry-success.png](save-retry-success.png)
- [quota-session-fallback.png](quota-session-fallback.png)
