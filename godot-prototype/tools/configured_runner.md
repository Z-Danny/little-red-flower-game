# 配置关原生运行器

## 入口与数据

- 场景：`res://scenes/configured_runner.tscn`，根节点为 576×1024 的 `Control`。实例先 `configure(entry)`，再加入场景树；读取目录项 `id`、`title`、`engine`。地图、解锁、计分和存档由外层负责。
- 完成信号 `finished(won: bool, elapsed_seconds: float)`。成功信号在原作结束动作、观察阶段与结果音播放后发出。用时统计到最后动作提交，观察与结果音不计入。失败立即冻结输入与用时，显示原作原因，点「查看结算」后发出失败信号。返回关卡只发 `exited`。`result_detail()` 提供 `title`、`reason`、`summary`、`progress`、`escaped`、`stars`。
- `assets/configured_runner/levels/*.json` 保存原 `rules`、`skin`、本地资源路径和像素遮罩。`source_index.json` 记录源规则、皮肤和导入包的 SHA-256；`verified.json` 是逐关门禁，只读取 `ready: true`。导入不自动更新门禁。导出应包含 JSON；各关所需纹理和音频可从其 JSON 的 `res://` 引用读取。公共字体为 `res://assets/ui/flower-ui.woff2`。
- 同一空间变换用于绘制、旋转像素命中、拖放和区位反馈。通用规则处理前置条件、动作提交、背包、对讲选择、时间和设备分支；画面、音频不授予目标。

## 复验

工具依赖仓库的 Node、TypeScript 和带 Pillow 的 Python。`CONFIGURED_PYTHON` 可指定 Python 可执行文件。以 Godot 4.6.2 执行；验证脚本为每次运行创建独立的 `outputs/configured-native-*` 项目副本。

```powershell
node .\godot-prototype\tools\prepare_configured_assets.mjs
node .\godot-prototype\tools\prepare_configured_assets.mjs --check
& .\godot-prototype\tools\test_configured_native.ps1
& .\godot-prototype\tools\test_configured_native.ps1 -Capture -Resolution 432x768
& .\godot-prototype\tools\test_configured_native.ps1 -Capture -Resolution 360x800
```

加 `-WriteVerified` 由通过的测试报告更新门禁。`-Only legacy` 或 `-Only <id>` 可局部复验。测试驱动 Godot 鼠标和按钮输入，检查动作 ID、目标值、观察期及终局信号；资产检查覆盖图片、遮罩、音频引用。桌面图形测试均使用 `Dummy` 音频驱动。

## 验证记录

13 关均已核验。无头共 2072 条断言；两个桌面尺寸各 2098 条断言，含 26 张截图，零失败。截图目录分别为 `outputs/configured-native-7ea3417e/screenshots/` 和 `outputs/configured-native-0537856b/screenshots/`。360×800 窗口内的游戏视口保持 9:16，截图为 360×640。真机触控、扬声器、耳机：`not_run`。

| 关卡 | 核验重点 |
| --- | --- |
| `flood-kit` | 五格背包、取出后回到原处、装满后确认出发、错包、超时 |
| `clear-corridor` | 四件杂物的正确放置、误放原位退回、三项巡检、超时 |
| `lift-wait` | 电话接通、位置与状况选择、留在待援区、可纠正警示 |
| `well-call` | 模拟 119/120、错误回答和危险区警示、指导旁人到外围、确认待援 |
| `quake-cover-practice` | 单步与组合防护路线、四秒阶段、震后动作 |
| `quake-exit-practice` | 鞋和楼梯检查前置、室内外切换、到集合点后报告 |
| `collapse-signal-practice` | 原地防护、电话、敲击求助、前置齐备后待援 |
| `flood-highground-practice` | 上楼切换、窗格雨水范围、两条环境音、上层待援 |
| `car-window-practice` | 安全带和车窗动作、窗外角色换图、抓取浮具后示意 |
| `lift-contact-practice` | 求助开启报告区域、位置与人数报告、脚下照明、安全站位 |
| `fire-shelter-practice` | 倒计时到底仍可操作、关门后残烟、补缝、灯光与救援音、四个原作失败动作 |
| `fire-stairs-practice` | 离开房间、入楼梯、到室外集合区、模拟报告；危险选择保留可纠正反馈 |
| `first-aid-aed` | `realistic-v2` 原图、贴片和胸部准备、两种设备情形、1600 ms 分析、900 ms 再次清场、继续 CPR 与交接 |

只有第一、第二及火灾房间练习有原作终局失败；其余关保留原作可纠正警示。火灾房间现行皮肤未启用失败后动画，原生结算同样立即冻结。巡检保留计时与勾选，未移植 Web 地面绿色虚线；室内烟保留源流量和已有烟层，未移植 Web 背景扩散模糊。场景衬底、HUD、粒子外观和混音使用 Godot 表现，不按 Web 像素或最终混音结果验收。
