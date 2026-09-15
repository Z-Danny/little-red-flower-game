# 已确认的结算与按钮音效

用户确认第二组试听的前三个声音：胜利、失败、按钮 A。

| 用途 | 已批准的单次 WAV | 时长 |
|---|---|---:|
| 胜利 | approved/01-victory-short.wav | 0.961429 秒 |
| 失败 | approved/02-failure-short.wav | 1.196259 秒 |
| 按钮 A | approved/03-button-a-warm.wav | 0.034558 秒 |

`approved/` 中的文件与试听 WAV 字节一致。`content/audio/approved-results.json` 直接保存其原始单声道 PCM16、小端序、44100 Hz 数据。接入时不重新调音量、改音高或滤波；采样率不同时由共享 helper 线性重采样。

`app/game/audio/result-samples.ts` 提供同步 `approvedSoundSamples(kind, sampleRate?)` 和 `approvedSoundDuration(kind)`，可供离线 HTML 使用。缓存返回的数组应视为只读，播放时复制进 AudioBuffer。

## 真实来源与许可

- 胜利原素材：Kenney [Music Jingles](https://kenney.nl/assets/music-jingles) 的 `jingles_SAX02.ogg`。
- 失败原素材：同包的 `jingles_SAX07.ogg`。
- 按钮 A 原素材：Kenney [Interface Sounds 1.0](https://kenney.nl/assets/interface-sounds) 的 `click_001.ogg`。
- 以上均为 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。作者官网完整 ZIP、选用的原始 OGG 与原许可证保存在 `sources/`。

`manifest.json` 记录实际官方包、原始文件、批准 WAV 和内嵌 PCM 的 SHA-256。早期素材库下载返回 401；未使用其下载文件。下载失败的 Retro Sounds 音效也未使用，因此早期 fetch-plan 不构成本批音效的来源证明。

`archive-approved.py` 可从第二组试听目录重新归档和编码，过程不改变任何样本。自动验证覆盖 WAV/PCM 精确一致、时长、峰值和重采样；代理人耳试听与实体设备实测为 `not_run`。
