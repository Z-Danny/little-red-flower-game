# 洪水围困：恢复室内待援版

2026-09-13，按用户明确要求，只恢复地图第28关 `flood-highground-practice`，保留同一ID、地图前置关系、其他关卡与当前公共运行时。不操作浏览器个人成绩，不解锁其他关卡。

## 当前玩法

恢复来源为 `test1/outputs/版本存档/洪水围困_室内待援版_20260913/关卡包/content/levels/flood-highground-practice`，三份规则/皮肤文件逐字节恢复，13项引用资源与旧档清单SHA一致。不是从测试夹具生成生产配置。

六步：到更高楼层 → 手机联系救援 → 安置饮用水 → 收听电台 → 在室内挥布示意 → 高处等待。具体可交换顺序、前置条件、人物动作、窗外雨层和声音使用已存档配置，不混入屋顶版新增道具。

正式规则与两套皮肤仍在 `content/levels/flood-highground-practice`。继续保持规则、皮肤、音频、公共视口分离，不覆盖公共引擎。现有个人最佳成绩保留，重复通关不重复加花。

## 版本保留与验证

- 旧室内原始存档不修改。
- 切换前屋顶版完整HTML及三份关卡配置存入 `D:/中关村/小红花/test1/outputs/版本存档/洪水围困_屋顶转移版_20260913`，附SHA清单。
- 室内专项测试 `node scripts/test-flood-refinement.mjs` 检查实际生产配置。
- 屋顶专项规则测试改用独立冻结夹具，浏览器脚本默认打开屋顶存档。`author-flood-rooftop-skin.mjs` 增加前置门禁，不允许误覆盖现行室内版皮肤。
- 离线导出：`node scripts/export-offline.mjs`。
- 浏览器回归：`node scripts/test-flood-refinement-browser.mjs`，隔离静音上下文，不访问用户存档。查看本目录 `verification` 的本次报告；实体手机和人工试听未测。

以后切换版本：先备份当前HTML与本关配置，校验基线；只恢复指定关卡包，运行当前引擎校验/测试并重新导出，禁止用旧整包覆盖其他近期改动。
