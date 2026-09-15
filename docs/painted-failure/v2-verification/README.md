# 第二版失败弹窗：最终 HTML 动效验收

- 结果：passed
- HTML：/Users/danny/dannyprojects/小红花/outputs/本地离线版/小红花应急行动.html
- 初始 SHA-256：780267e8fc0208868321719e6b6bf43b5e42a45d7f0c99f94bcb51d70336e921
- 结束 SHA-256：780267e8fc0208868321719e6b6bf43b5e42a45d7f0c99f94bcb51d70336e921
- 浏览器：152.0.7977.83；隔离、离线、headless、--mute-audio。
- 样本：8/8；布局：16/16；退出路径：17/17。
- 已关闭 context：9/9；browser：true。
- 脚本错误：0；HTTP 请求：0；失败请求：0。
- 真机：not_run；人耳音频：not_run。

## 证据边界

Each private test profile presets the other 23 levels complete only for access. The existing modelContext start callback opens a real autoStart player. First normal-motion hunt failure uses real target input and Playwright RAF timeout; collection and repeat timeouts use documented mounted-engine clock boundaries. Flood/shelter mistakes use real canvas input. No completion/reward callback is injected.

Native setTimeout/clearTimeout are wrapped transparently after Playwright clock installation. Actual animation events and DOM phase changes are recorded with document.timeline.currentTime. First actions use real click/keyboard; captured existing React button handlers are then repeated to challenge the synchronous lock without altering callbacks or React state. One optional interrupted-animation check cancels only the current CSS exit animation to exercise the existing fallback.

## 验收内容

- 正确场景名、实际原因与缺失数，0 朵奖励，存档字节不变。
- 390×844、320×568 按钮纵排、滚动可达、Tab/Shift+Tab 焦点约束。
- 普通模式真实 animationend 后启动；退出中失败状态和计时保持、按钮同时禁用；连续旧事件处理器不重复安排/执行退出。
- 减少动态效果立即退出且无动画/240ms 延迟；重试清空目标、恢复计时，返回地图不种花。
- 单独的人为取消 CSS 动画样本验证 240ms 兜底；此项不代表正常用户操作。

## 实际动态录屏

- [播放录屏](motion-preview.html) · [quake-normal-motion-390x844.webm](quake-normal-motion-390x844.webm)：390×844 真实浏览器连续录屏，包含进入关卡、引擎受控超时、原生失败动效及真实点击重试；无尺寸切换或动态拼接。独立录屏验证见 [motion-recording-report.json](motion-recording-report.json)。

## 截图

- [quake-bedroom-v2-no-preference-390x844.png](quake-bedroom-v2-no-preference-390x844.png)
- [quake-bedroom-v2-no-preference-320x568.png](quake-bedroom-v2-no-preference-320x568.png)
- [quake-bedroom-v2-reduce-390x844.png](quake-bedroom-v2-reduce-390x844.png)
- [quake-bedroom-v2-reduce-320x568.png](quake-bedroom-v2-reduce-320x568.png)
- [flood-house-response-v1-no-preference-390x844.png](flood-house-response-v1-no-preference-390x844.png)
- [flood-house-response-v1-no-preference-320x568.png](flood-house-response-v1-no-preference-320x568.png)
- [flood-house-response-v1-reduce-390x844.png](flood-house-response-v1-reduce-390x844.png)
- [flood-house-response-v1-reduce-320x568.png](flood-house-response-v1-reduce-320x568.png)
- [flood-kit-no-preference-390x844.png](flood-kit-no-preference-390x844.png)
- [flood-kit-no-preference-320x568.png](flood-kit-no-preference-320x568.png)
- [flood-kit-reduce-390x844.png](flood-kit-reduce-390x844.png)
- [flood-kit-reduce-320x568.png](flood-kit-reduce-320x568.png)
- [fire-shelter-practice-no-preference-390x844.png](fire-shelter-practice-no-preference-390x844.png)
- [fire-shelter-practice-no-preference-320x568.png](fire-shelter-practice-no-preference-320x568.png)
- [fire-shelter-practice-reduce-390x844.png](fire-shelter-practice-reduce-390x844.png)
- [fire-shelter-practice-reduce-320x568.png](fire-shelter-practice-reduce-320x568.png)
