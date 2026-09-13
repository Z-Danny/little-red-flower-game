# 关卡制作与换肤

整场景找隐患：先读 docs/hunt-pipeline/AI_START.md 和 README.md。唯一模板在 content/hunt-template，建卡/换皮/校验/启用走 scripts/hunts.mjs。禁止从历史题卡、tests/fixtures、旧台风组件复制新模板。

规则、皮肤、文案、演出与统一视口解耦；换画风保留规则和ID。新图需重新编译同源蒙版、人物、剪影及结局，不能套旧坐标。所有同类关共享 app/game/scene-hunt/viewport.ts；不能新增关卡专用相机/CSS。新构图裁切或侵入HUD区不通过门禁。

处置类见 docs/response-workflow/README.md；七目标扣时暴雨与洪水关保持灾害专用规则。不要把这些玩法强行迁入识别模板。

完成后验证最终导出的HTML，不只验证源码。浏览器测试必须隔离、静音、finally关闭；真机/人耳未测明确not_run。用户没有要求时不提交、不推送、不发布。
