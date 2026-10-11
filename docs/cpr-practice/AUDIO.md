# 急救岛音效接入（2026-10-11）

## 范围

- 急救岛地图、关卡入口和 AED 原有公共音效继续使用，不叠加第二套声音。
- 为心肺复苏关补上公共界面音效（返回、暂停、帮助）和操作反馈。
- 操作确认、可纠正错误、呼救分工、输入点按、AED 到达复用 `practiceSfxSamples`；完成播放既有审核版 `approvedSoundSamples('victory')` 原始 44100 Hz PCM。
- 点按音只确认游戏接受的输入，不充当真实心跳／生命体征，不改变节奏判定、不增加连击门槛。
- 暂停面板增加声音开关；静音、帮助／暂停、切到后台会清理关内音效。重新打开声音不补播过去的事件；退出关卡释放音频上下文。
- 不新增 TTS、语音、外部音源、网络请求或背景音乐。不修改救助规则、ID、场景坐标或前三张地图。

## 实现

- `app/game/first-aid/cpr-audio.ts`：只读输入到公共音效的映射，以及可取消的短音效会话。
- `components/game/first-aid/use-cpr-audio.ts`：React 生命周期、静音、AED 到达／完成事件。
- `components/game/first-aid/cpr-player.tsx`：公共按钮反馈、手势解锁、声音开关。
- `tests/cpr-audio.test.ts`、`scripts/test-cpr-audio.mjs`：共享 PCM 一致性、取消、静音、重放防护。
- `scripts/test-first-aid-audio-browser.mjs`：从最终离线 HTML 进入急救岛，检查实际 Web Audio 输出、输入、键盘、静音、模拟后台、完成及 AED。

## 验证证据

最终文件：`outputs/本地离线版/小红花应急行动.html`。
报告目录：`outputs/first-aid-audio-verification/`。

- `browser-report.json`：急救岛音频专项，隔离、离线、系统静音浏览器，finally 关闭。
- `suite-report.json`：标准测试套件逐项状态。
- `cpr-regression/browser-report.json`：9 种视口与 CPR 完整流程。
- `aed-regression/browser-report.json`：AED 两种判断分支及最终 HTML 布局。
- 真机测试、人耳听感：`not_run`。浏览器验证的是信号、事件与生命周期，不声称实际扬声器听感已验收。

### 额外测试的已知失败

额外运行（非标准 `test` 链）的 `test-approved-result-audio.mjs` 有 3 个失败，详情见 `approved-result-audio.log`：消防生产夹具没有测试预期的 fatal interaction、旧 response adapter 的 result 字段为 undefined 而测试要求 null、通用 PracticeAudioSession 的 reset 结果计数不符合测试预期。该测试不导入此次新增 CPR 音效模块；本次未修改上述通用实现或消防夹具，不把这份扩展测试报告为通过。
