# 《台风前的家》50秒优化：已更新

唯一现行说明是 [../typhoon-deadline/README.md](../typhoon-deadline/README.md)。

原先“50秒后仍可继续寻找”和“合成吸气/呼气”的设计已按用户反馈退役。现在是50秒硬时限，未找齐则失败重试；人物使用无台词的录制惊惧短声。

本目录 verification 仅保留此前历史验收证据，不能证明当前版本。最新验收保存在 docs/typhoon-deadline/verification。原 scripts/verify-typhoon-50s.mjs 与 test-typhoon-50s-browser.mjs 名称保留兼容，已改测当前规则并输出新目录。
