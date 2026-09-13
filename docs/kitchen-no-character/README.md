# 《厨房着火了》仅关闭人物声音

日期：2026-09-13。用户要求：去掉人物怪叫，只处理人物声音。

## 当前行为

- `content/response/kitchen-cues.json` 设置 `characterEnabled:false`，只作用于厨房关显式使用的 `kitchen50sCues`。
- 不加载或启动人物声道中的惊喘、颤音、怪叫、循环呼吸、放松声及脚步声；直接play调用、开场、压力阶段、错误动作、通关或重玩均不能绕过这个设置。
- 背景音乐三条分轨、燃烧/气流两条环境轨、物件拾取、旋钮、锅盖、水、抹布、火焰扩大、成功等交互音效保留。
- 暂停设置保留音乐、环境、音效三项，不展示无效的人物音量滑块。人物的画面动作、表情、火势变化、规则、相机与温度计均未修改。
- 不删除全局音频素材、不改其他关卡的配置。未配置该字段时保持旧表现，既有处置模板仍使用自己的音频规则。

## 模块边界

`CueProfile.characterEnabled` 是可选布尔配置。`ResponseAudio` 在加载、创建音源、直接播放、人物事件及混音边界执行；仅把滑块调到0不算可靠禁用。通用关卡配置校验器接受布尔值、拒绝字符串false或数字0。厨房播放器仅选择该策略并隐藏不可用的控制。

台风关先前的去尖叫设置保留。开始本次修改时，用户离线包比完整源码目录的旧HTML更新；已核对该包192个源码指纹及344项内嵌资产均与当前完整维护源码匹配，基于该最新源码制作，保留同期新关卡内容。

## 验收方式与证据

- `node scripts/verify-kitchen-no-character.mjs` 按package.json顺序执行完整test集合，加跑台风去尖叫回归及TypeScript检查；实际结果见 `verification/regression.json` 和对应日志。
- `node node_modules/vinext/dist/cli.js build` 完整生产构建退出码0（保留既有大chunk提示）。
- `node scripts/export-offline.mjs` 重新打包，离线导出7项检查通过。
- `node scripts/test-kitchen-50s-browser.mjs outputs/本地离线版/小红花应急行动.html docs/kitchen-no-character/verification/browser`：通过真实点击/拖拽操作验证开场、等待、泼水、抹布、两种正确顺序、撤离、暂停、静音、重玩。原生AudioContext按解码素材SHA标记实际音源，要求人物播放为0，音乐/火焰/物件音实际启动。
- 浏览器覆盖320×568、375×667、390×844、430×932、1440×900及动态高度，使用受控游戏时钟推进；不是物理手机测试，也不将虚拟50秒说成实际等待50秒。
- 该关开启的是5条循环轨（3音乐+2环境），仅加载14条非人物资产；不能因旧测试期待6条循环/21条资源而恢复人物声音。
- 浏览器隔离存档、硬件静音、finally关闭，无声测试不会留下响声。`humanListening:not_run`、`physicalDevice:not_run`。

最终交付仍是 `D:/中关村/小红花/test1/outputs/本地离线版/小红花应急行动.html`。同步前核对每个原文件SHA并备份；逐项记录见同目录 `厨房关闭人物声交付记录.json`。刷新或重新打开后生效，未提交Git、推送或发布。
