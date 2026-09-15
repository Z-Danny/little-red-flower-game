# 手绘红人榜与我的进度：最终离线 HTML 验收

- 结果：failed
- HTML：/Users/danny/dannyprojects/小红花/outputs/本地离线版/小红花应急行动.html
- SHA-256：6e25f1ea005d610c4fd1ccc532e8b795e984f175030ad343fdd6d1baae4feafe
- 浏览器：152.0.7977.83；独立 headless、offline、--mute-audio。
- finally 关闭 contexts：2/2；browser：true。
- 默认我的进度；真实当前进度、其他玩家只读查看、示例不写存档；明确切换才改变当前玩家。
- 0、混合旧版花数、24关全完成；自然灾害/公共安全/居家校园办公三岛数据与存档逐项比对。
- 320×568、390×844、1440×900布局；页签、内外点击、Escape、焦点、再打开与实际关卡入口。
- 动效、减少动态效果与点击音效计数均在浏览器实测；音频全程静音，无人耳试听结论。
- 样本：Independent offline browser contexts preset zero, mixed legacy 1/2/3-flower, and all-complete records for UI assertions. These are explicit synthetic fixtures, not earned gameplay results. Demo players remain read-only and must never be persisted. Tests use only native UI input except temporary, transparent AudioContext instrumentation and animation observations. One actual level launch follows journal dismissal; no completion callback or reward is injected.
- 错误 0；HTTP(S)请求 0；失败请求 0。
- physicalDevice: not_run
- humanAudio: not_run

## 失败

```text
locator.click: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for locator('[data-painted-primary]')[22m
[2m    - locator resolved to <button type="button" aria-busy="false" data-painted-primary="" data-long-label="false" class="painted-intro-start">…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <section data-planting="" data-plant-age="0" class="garden-shell" data-region="nature" data-journey-map="true" data-archipelago-open="false">…</section> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <section data-planting="" data-plant-age="0" class="garden-shell" data-region="nature" data-journey-map="true" data-archipelago-open="false">…</section> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m      - waiting 100ms[22m
[2m    29 × waiting for element to be visible, enabled and stable[22m
[2m       - element is visible, enabled and stable[22m
[2m       - scrolling into view if needed[22m
[2m       - done scrolling[22m
[2m       - <section data-planting="" data-plant-age="0" class="garden-shell" data-region="nature" data-journey-map="true" data-archipelago-open="false">…</section> intercepts pointer events[22m
[2m     - retrying click action[22m
[2m       - waiting 500ms[22m

    at launchAfterDismissal (/Users/danny/dannyprojects/小红花/scripts/test-painted-journal-browser.mjs:308:48)
    at async file:///Users/danny/dannyprojects/%E5%B0%8F%E7%BA%A2%E8%8A%B1/scripts/test-painted-journal-browser.mjs:343:7
```

## 截图

- [zero-390x844.png](zero-390x844.png)
- [mine-390x844.png](mine-390x844.png)
- [mine-320x568.png](mine-320x568.png)
- [mine-1440x900.png](mine-1440x900.png)
- [other-player-390x844.png](other-player-390x844.png)
- [demo-player-390x844.png](demo-player-390x844.png)
- [board-390x844.png](board-390x844.png)
- [board-320x568.png](board-320x568.png)
- [board-1440x900.png](board-1440x900.png)
- [failure.png](failure.png)
