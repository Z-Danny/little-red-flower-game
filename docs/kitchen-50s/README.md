# 厨房着火了 · 动态温度计与 50 秒训练节奏

本次仅优化 `oil-fire`。保持既有统一相机、图片、存档 ID、通关顺序兼容和地图奖励；不改其他关卡机制，不启用待专业审核的外伤、触电关。

## 玩家体验

- 按用户最新反馈移除顶部时间横条及大号秒数，改为左侧 48 CSS 像素宽的绘本温度计。内置生图生成透明外壳，液柱独立绘制并按玻璃槽形状裁切，420 ms 平滑过渡。液柱统一红色：拖延/错误时升高，关火/盖锅盖后下降，完全受控后液柱及液柱高光清空，底部球泡也不残留红色；外壳保留。不变黄或变绿，无摄氏度或虚构测量值。`minimumFill` 只适用于危险尚未解除的状态。
- 计时、风险分离。火势和恐惧在 50 秒训练周期内逐渐升级；操作失误另外强化火焰、烟和人物反应。暂停、隐藏页面不消耗训练时间。
- 锅盖 850 ms、旋钮 650 ms、撤离 1000 ms、错误反馈 900 ms；目标仍只在动画结束后完成。
- 移除右下角灭火器的渲染、点击、拖拽和键盘选项；模型拒绝其伪造输入。原资源及兼容定义保留，不影响模板/预览。
- 2026-09-13最新修订：只关闭本关人物声音，包括怪叫、惊喘、颤音、呼吸及放松短声；当前人物声道中的脚步也不播放。背景音乐、燃烧环境、物件操作和错误反馈音保留，人物画面动态不变。详情见 `docs/kitchen-no-character/README.md`。
- 三层音乐以同一播放速率 1.08–1.24 渐强加速，不拉伸物件音。场景互动后才解锁声音；暂停、静音、切换标签页时停止可听输出。

50 秒仅为游戏训练节奏，不是现实安全时间；保留现实火势失控应撤离求救、儿童不应灭火的提示。

## 可独立修改的位置

| 内容 | 文件 |
| --- | --- |
| 总时长、风险起点、动作时长、音乐速度 | `content/response/kitchen-experience.json` 的 `timing` |
| 当前场景可用物件 | `app/game/kitchen/config.ts` 的 `sceneItems` |
| 内部计时、紧急程度映射 | `app/game/kitchen/presentation.ts` 的 `countdown` / `thermometerState` |
| 人物声音启用政策、反应触发条件与间隔 | `content/response/kitchen-cues.json`；本关 `characterEnabled:false` |
| 音频 ID、资源文件、混音分组 | `content/response/audio-manifest.json` |
| 音效确定性生成 | `scripts/lib/fear-foley.mjs`、`scripts/build-response-audio.mjs` |
| 温度计资源、玻璃槽裁切、颜色、位置、尺寸 | `content/response/kitchen-thermometer.json` |
| 独立液柱和温度计外壳组件 | `components/game/kitchen/kitchen-thermometer.tsx`、`app/kitchen.css` 的 `.kitchen-thermometer*` |
| 图片与场景坐标（本次未修改） | `content/presets/kitchen/skin.json` |

`KitchenPlayer` 显式选择 `kitchen50sCues`，其 `characterEnabled:false` 在解码、创建音源、单次播放和混音边界禁用人物声道，不能通过音量滑块重新开启。旧的 `kitchenCues` 兼容预设保持原样，其他关卡不跟随静音。

温度计原始素材与完整生图提示词见 [thermometer-prompt.md](thermometer-prompt.md)。换图只修改皮肤资源及对应槽内坐标；逻辑、交互和相机不改。

## 历史声音来源与后处理（人物音现已停用）

旧的三种人物声音是原创确定性 DSP 合成的风格化非语言表演，不是 TTS、真人录音，也未截取参考视频。本关不再加载或播放这些声音；素材保留给其他使用者和历史追溯，不删除全局资产。以下只记录旧素材制作方法，不是重新启用人物声音的要求。

流水线：确定性种子 → 合成 → 去直流 → RMS 音量归一化及采样峰值限制 → 首尾 12 ms 淡入淡出 → PCM16 单声道 22050 Hz WAV。分别约 0.78、0.92、0.68 秒，便于未来直接替换为已授权的同名配音素材。

`npm run audio:build` 可重建全部音频；原有 18 个音频保持字节相同。报告在 `docs/response-workflow/verification/audio-assets.json`，报告的采样峰值/RMS 不等于 LUFS 或人工听感审核。

## 重复验收

在完整维护源码根目录运行：

```sh
npm test
npm run typecheck
npm run build
npm run export:offline
node scripts/test-kitchen-50s-browser.mjs
```

浏览器脚本使用隔离、静音的本地 Edge，真实点击燃气旋钮、拖拽锅盖和人物；不注入通关或存档状态。覆盖 320×568、375×667、390×844、430×932、1440×900，以及窗口高度变化、暂停、声音加载/信号、泼水/抹布反馈、两种正确顺序、归零继续、重玩和不重复奖励。

截图与报告默认输出至 `outputs/kitchen-50s-verification/browser`。传入第一参数可以验证指定离线 HTML，第二参数指定报告目录。最终交付报告需核对被测 HTML 的 SHA-256；不能用开发页测试代替用户实际离线文件。

验收边界：浏览器尺寸模拟不是真机验证；声音缓冲、播放事件、PCM 波形及非零输出信号不等于主观听感认可。真机与人工听音记为 `not_run`。

## 合并到当前本地版本的备注（2026-09-13）

厨房专项、音频专项、TypeScript、构建及离线浏览器验收分别记录。本轮完整红色温度计回归包括真实等待、错误、两种处置顺序和重玩；合并同期地图/台风更新后，再进行最终离线入口回归，并核对厨房及共用视口模块与完整回归版本的源文件哈希一致。

全库 `npm test` 在同期台风更新后有一个既存失败：`tests/hazard-batch.test.ts` 的历史冻结哈希仍期待旧的 `content/scenes/typhoon-home/rules.json`。厨房改动同步前已在完整维护源码直接复现同一失败（该测试批次 891 通过 / 1 失败）。没有篡改台风规则或更新历史快照来掩盖它；这项失败不应被描述为全库测试通过。
