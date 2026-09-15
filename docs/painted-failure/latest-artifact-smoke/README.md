# 挑战失败弹窗：最终离线 HTML 验证

- 结果：passed
- HTML：/Users/danny/dannyprojects/小红花/outputs/本地离线版/小红花应急行动.html
- SHA-256：2b4ca25fdc634239ec36f1ffb01d39372da84476c01a42a399bf787ea12e89fa
- 模式：latest-artifact-three-entry-smoke
- 浏览器：152.0.7977.83；隔离存储、offline、headless、--mute-audio。
- finally关闭：3/3 contexts；browserClosed=true。
- 最新文件抽验：3/3入口；布局：6/6。受控时钟仅检验最新导出渲染/CTA，不宣称重新做了14关真实超时。
- 本轮在最新文件用实际目标点击＋受控时钟触发找隐患失败，用真实开门错误触发practice失败；完整真实时钟覆盖见 ../verification。
- 重新挑战后，二次超时通过受控React reducer tick/elapsed边界触发，只用于验证失败页返回按钮；未调用成功或奖励回调。
- 保存23关的隔离夹具仅用于解锁；逐次核对失败/重试/返回的存档字节不变，不重复发花。
- 当前未开启failureReveal的正式practice即时失败；如果既有flag开启，则先验证演出期间没有失败弹窗，再验证演出结束出现。
- 覆盖窄屏滚动、两按钮可达、无横向溢出、正反Tab焦点限制、reduced-motion、来源图片内嵌完整解码。
- 运行时错误 0；HTTP(S)请求 0；失败请求 0。
- physicalDevice: not_run
- humanAudio: not_run

## 截图

- [quake-bedroom-v2-390x844.png](quake-bedroom-v2-390x844.png)
- [quake-bedroom-v2-320x568.png](quake-bedroom-v2-320x568.png)
- [typhoon-home-390x844.png](typhoon-home-390x844.png)
- [typhoon-home-320x568.png](typhoon-home-320x568.png)
- [fire-shelter-practice-390x844.png](fire-shelter-practice-390x844.png)
- [fire-shelter-practice-320x568.png](fire-shelter-practice-320x568.png)
