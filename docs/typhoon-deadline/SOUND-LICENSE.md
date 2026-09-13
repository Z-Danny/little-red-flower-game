# 台风人物惊惧音素材记录

声音源为录制的无台词女性惊叫，非语音朗读、非模仿指定人物、非原来的合成呼气。

- 作品：Female Scream 1
- 发布者：Nocturnal_Vanguard（发布页自述配音名 AuraVoice）
- 原页面：https://opengameart.org/content/female-scream-1
- 官方文件：https://opengameart.org/sites/default/files/female_scream_1.ogg
- 发布页许可：CC0，核验日期 2026-09-13。
- 许可原文：https://creativecommons.org/publicdomain/zero/1.0/
- 原始文件保存在本目录 `source-audio/female_scream_1.ogg`；SHA 见 `audio-build.json`。
- 仅剪辑该录音的三个短片段；没有使用搜索中其他作者的样本。

后处理：单声道 22050Hz PCM16；移除直流和低频杂音；剪去前后留白；12ms淡入/90ms淡出；峰值分别控制在0.52/0.56/0.60。保留原音高，不拉长、不循环、不添加朗读。游戏内再经人物独立增益、音乐闪避和母线压缩。

`scripts/build-typhoon-fear.mjs` 从原始文件重建三段 WAV 和 `fear-clips.generated.ts`。后者是离线 PCM 嵌入数据，避免运行时下载或解码器差异。可用自有授权表演替换原始录音，再重建；不要把样本名当作主观听感验收。

技术检查与浏览器检查不等于人耳验收；本次自动检查记录人耳/真机为 not_run，仍需使用者试听确认表演强度是否适合目标年龄。
