# 台风关去尖叫修订

日期：2026-09-13。

最新验收要求：**背景音乐可以保留，现在只去掉人物尖叫。** 先前“禁用背景音乐”的呼吸音制作简报不再作为本次交付要求。

## 修改范围

唯一生产行为修改是 `content/scenes/typhoon-home/presentation.json` 的 `characterAudio` 从 `nonverbal-fear` 改为 `none`。共享播放器已有该配置支持，不复制播放器、不修改声音算法、关卡规则、图片、坐标、视口或存档。

结果：台风关不再调度8/27/43秒的录制惊叫；不显示无作用的人物音开关。背景音乐仍默认开启并可单独开关，风雨、发现隐患、成功和失败的反馈音保持原实现。其他关卡不变。

没有生成新呼吸音，不能将这次修改描述为“已完成三段呼吸生成”。历史原始音频和授权记录保留，没有删除素材；只是停止在台风关播放。

## 当前验证

- `node scripts/test-typhoon-immersion.mjs`：41项通过，含禁用人物音后，所有旧触发点不产生人物音源、音乐和风雨通道仍有增益、重玩不恢复人物声。
- `node scripts/test-scene-hunt.mjs`：312项通过。
- `node scripts/test-hunt-pipeline.mjs`：73项通过。
- `node node_modules/typescript/bin/tsc --noEmit`：退出码0。
- `node node_modules/vinext/dist/cli.js build`：退出码0；保留已有大chunk提示。
- `node scripts/export-offline.mjs`：导出自包含HTML，7项导出检查通过。
- 原生浏览器完整50秒验收：见 `verification/browser.json`，绑定实际测试HTML的SHA。检查人物触发计数为0、未创建旧尖叫样本播放源、音乐开关仍开、音频有输出、暂停/后台/静音无输出，以及超时重玩和真实点击全部目标通关。
- 使用隔离Edge、硬件静音、独立存档，finally关闭浏览器。没有改变用户存档，也没有新建有声网页。
- `humanListening: not_run`，`physicalPhone: not_run`；自动音源及RMS检查不能代替真人听感或物理手机测试。

完整源码只同步本任务文件，SHA校验后逐项备份。最终离线交付路径仍为 `D:/中关村/小红花/test1/outputs/本地离线版/小红花应急行动.html`。交付指纹、备份位置和逐文件变更见同目录 `台风去尖叫交付记录.json`。刷新或重新打开HTML后生效。
