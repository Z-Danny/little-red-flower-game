# 洪水室内待援版：冻结回归夹具

此目录只用于测试，不是新关卡模板，不注册生产关卡，不得从这里覆盖当前生产配置。

冻结时间：2026-09-13。原关卡 ID：`flood-highground-practice`，六项目标：先到高处、报告位置、取饮水、收听指引、持衣示意、高处待援。冻结输入取自已校验的本地版本存档，而非正在修改的工作副本。

对应存档：`D:/中关村/小红花/test1/outputs/版本存档/洪水围困_室内待援版_20260913/`。该版 HTML 的 SHA-256 是 `478479f54a104ccb6403fecbde1b6aa0db8067a7ce1f59a59ed65c2813e94b45`。

源文件 SHA-256（存档原始字节，夹具行尾可能由工具标准化）：

| 文件 | SHA-256 |
| --- | --- |
| `level.json` | `7896d532dee7e04db4ba65cecf9454d57c7e5ce90f64fbdc269521ae621a471e` |
| `skins/paper-gouache.json` | `eeb5096e26c817a81a1821b63d005ef05e8d52d7d508ab01398801400ea6765d` |
| `skins/illustrated.json` | `7226e5af3e65efc6837e7c26a262964ad12c1068cc341078998ec7670e094293` |

使用者：`tests/flood-refinement.test.ts`、`tests/flood-audio.test.ts`、`tests/flood-presentation.test.ts`。它们继续检查当前公共运行时是否兼容冻结版的动作、雨层、循环音和状态条件。通过这些测试不代表新的七步屋顶关已验收；新流程必须有独立测试。

此处只冻结规则与皮肤，不冻结运行时实现。素材引用仍指向现有 `public/levels/`，已发布素材不能在原路径上无记录地替换。若要验证旧版本的完整运行行为，应打开版本存档中的 HTML。

旧浏览器脚本 `scripts/test-flood-refinement-browser.mjs` 的动作表是六步室内版，不能拿它直接验证新的七步生产版。该脚本若用于归档重放，必须显式读取此夹具、指定旧 HTML，并把输出写到新的验收目录，不能覆盖历史证据。
