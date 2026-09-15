# 挑战失败弹窗：完整功能验证与导出审计

> 功能、奖励与负例检查均通过。长跑唯一失败为并行任务重导出造成的整文件 SHA 一致性断言；原始记录保留如下。最新稳定导出已另行通过 [三入口复核](../latest-artifact-smoke/README.md)，该次文件前后 SHA 一致。并行新增的开场流程源码不属于本轮已导出的验证范围。

**功能与负例通过；唯一失败是并行导出导致的整文件 SHA 一致性；最新稳定版本抽验见 [latest-artifact-smoke](../latest-artifact-smoke/README.md)。**

## 结论

- **功能检查通过**：14/14失败入口、56/56视口、18项检查通过；0运行时错误、0HTTP(S)请求、0失败请求。
- **长跑的整体HTML一致性检查失败**：并行音乐任务多次重新导出，完整文件SHA改变。原脚本的失败状态和断言保留在report.json；不将此差异称为交互失败，也不伪称整套矩阵跑在单一最新文件上。
- **最新文件抽验通过**：3入口、6布局、Retry/Back；首尾SHA均为 2b4ca25fdc634239ec36f1ffb01d39372da84476c01a42a399bf787ea12e89fa。
- [完整功能结果](report.json) · [变化审计](artifact-change-audit.json) · [最新导出抽验](../latest-artifact-smoke/README.md)

## 导出与源文件边界

- 长跑期间观察到的导出链：
  - dfcf85ba2eb884b7955373303d4bf1c00058196e44dfbd12e6218523629edba8
  - d5841e3d55ab088300e4439dc372f12cbc6b5f207d5ace043c4ad72c4a3c3eb7
  - 2b4ca25fdc634239ec36f1ffb01d39372da84476c01a42a399bf787ea12e89fa
- 每个隔离context分别读取主文件，未逐case采集SHA，因此不把14关整套结果全部归给旧候选或最新候选。
- 审计时8份UI相关源文件有4份不变；并行启动流程修改涉及 components/game/scene-hunt/player.tsx、components/game/disaster/player.tsx、components/game/configured/player.tsx、components/game/configured/practice-player.tsx。5份失败美术资源全部不变。
- 失败组件和CSS的hash仍与候选基线一致；完整原始源hash表附在审计JSON中。本任务没有覆盖或回滚并行修改。**不声称后来新增、未导出的启动源改动已经过本轮浏览器验证。**
- 审计时主HTML SHA：2b4ca25fdc634239ec36f1ffb01d39372da84476c01a42a399bf787ea12e89fa；data-auto-start标记=false，level-launch-status标记=false。

## 已验证行为

- 初次失败由实际目标点击后、Playwright加速RAF驱动的原引擎超时触发；动态已完成/剩余数与真实进度一致。
- 高楼隔烟关真实关门后再次开门触发危险错误；洪水危险拖拽保留真实原因。
- 台风真实超时0花 → 重新挑战清空目标/倒计时 → 五个真实目标点击 → 原成功Settlement → 仅发3花。
- 其他类型重试后用明确标记的受控reducer tick/elapsed边界再触发一次失败，只验证返回按钮，不伪称第二次真实等待。
- 安全提前上楼仍为evacuated；火灾隔烟和油锅训练计时归零均可继续，无失败/奖励误判。
- 390×844、320×568、430×932、1440×900：无横向溢出、两按钮可达、正反Tab焦点限制、reduced-motion。
- 18/18隔离context与browser均在finally关闭；headless、offline、--mute-audio。
- physicalDevice: not_run；humanAudio: not_run。

## 截图

- [quake-bedroom-v2-390x844.png](quake-bedroom-v2-390x844.png)
- [quake-bedroom-v2-320x568.png](quake-bedroom-v2-320x568.png)
- [quake-bedroom-v2-430x932.png](quake-bedroom-v2-430x932.png)
- [quake-bedroom-v2-1440x900.png](quake-bedroom-v2-1440x900.png)
- [typhoon-home-390x844.png](typhoon-home-390x844.png)
- [typhoon-home-320x568.png](typhoon-home-320x568.png)
- [typhoon-home-430x932.png](typhoon-home-430x932.png)
- [typhoon-home-1440x900.png](typhoon-home-1440x900.png)
- [typhoon-failure-retry-genuine-success.png](typhoon-failure-retry-genuine-success.png)
- [fire-shelter-practice-390x844.png](fire-shelter-practice-390x844.png)
- [fire-shelter-practice-320x568.png](fire-shelter-practice-320x568.png)
- [fire-shelter-practice-430x932.png](fire-shelter-practice-430x932.png)
- [fire-shelter-practice-1440x900.png](fire-shelter-practice-1440x900.png)
- [flood-unsafe-action.png](flood-unsafe-action.png)
