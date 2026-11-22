# Godot 找隐患关卡

## 范围

`typhoon-home`、`charging-bedroom`、`bedroom-night-check-v2`、`kitchen-before-cooking-v2`、`clear-corridor-check-v2`、`quake-bedroom-v2`、`storm-street-check-v2`、`thunder-park-v2`、`forest-fire-sources-v2`。这 9 包来自 `app/game/scene-hunt/generated.ts` 的实际注册项。未启用草稿没有导入。

每个 `pack.tres` 保留原 `rules`、所选 `skin`、`presentation` 和注册表绑定的 `performance`。`source` 记录原 JSON 与图片的路径及 SHA-256。场景、人物、剪影、像素蒙版、演出许可蒙版和结局图按字节复制。运行时从 Godot 导入的纹理读精确 ID 色，不用目标边界框判定点击。胜负音保留审批的原始 PCM；其他反馈由原乐谱合成，环境和音乐由 Godot 播放。

## 入口

父场景先实例化 `res://scenes/hunt_runner.tscn`，再调用 `configure(entry)` 并连接 `finished(won, elapsed_seconds)`、`exited`，然后加入场景树。`entry.id` 决定读哪一关；标题可由父场景传入。找隐患 runner 不写存档、不发花朵，也不管理地图。

地图开始动作触发 50 秒挑战。一次有效误点扣 5 秒，正确目标描圈 800 毫秒；最后一处在截止前点中可画完圈。成功后显示本关原结局图 650 毫秒，再交给父结算。失败先展示未找到的数量，再通知父结算处理重试。暂停、应用失焦、离开均停止本关声音；台风没有人物惊叫。

## 素材准备

在仓库根运行（Node ≥22.13）：

```text
node godot-prototype/tools/prepare_hunt_assets.mjs
node godot-prototype/tools/prepare_hunt_assets.mjs --check
```

`--check` 不写文件。当前共有 203 个生成文件，36,876,433 字节。`verified.json` 单独记录逐关验收，不由素材生成器标记通过。

## 验收

Godot 4.6.2，源码复制到忽略的 `outputs/` 下并去除 `.godot` 后重新导入。`<copy>` 指该项目副本，`<shots>` 是已创建的截图目录。

```text
Godot --headless --path <copy> --import
Godot --headless --path <copy> --script res://scripts/hunt_runner/tests/hunt_runner_test.gd
Godot --path <copy> --audio-driver Dummy --resolution 432x768 --script res://scripts/hunt_runner/tests/hunt_render_test.gd -- <shots>
```

- 原生 GUI 回归：9/9，鼠标和触摸共命中 43 个原蒙版目标；每关检查暂停、重试、提示、提前退出、自然超时、扣时失败、49.999 秒点中最后目标和单次结果信号。
- OpenGL 实际渲染：9/9，抽查开场字幕、阶段变化、目标证据和原结局。6,529 个原目标内部采样点中，6,525 个在颜色误差阈值内；原结局的 1,584 个采样中，1,542 个在显示误差阈值内。截图及日志位于 `outputs/hunt-native-qa/20261122-235452-9535/`。
- 测试以导出后的 Web 和 Windows PCK 为 `--main-pack` 再跑一遍，检查关卡资源、信号和胜负音 PCM 仍可读。看实际浏览器和整包交付验证时，以父项目最终报告为准。
- Windows OpenGL 验证使用静音；移动真机、人耳试听：`not_run`。

## 表现差异

风雨、雷闪、电火花、人物动作及林火烟焰用 Godot 原生绘制，沿用原演出坐标、阶段和许可蒙版。Canvas 的混合、曲线边缘与 WebAudio 的滤波、压缩和声道增益在 Godot 中略有区别。失败提示沿用绘本风格，重试按钮归父结算。风雨街口的松动招牌靠近 HUD；保留原图和蒙版，收起提示后仍能点中招牌下沿。
