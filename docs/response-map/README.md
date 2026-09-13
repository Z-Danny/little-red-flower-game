# 处置练习接入实际地图（2026-09-12）

## 发布边界

本次在原有 16 关之外接入 8 关，总计 24 关。用户明确暂不加入的两关：**外伤大出血、触电**，保留 **待专业审核** 状态，仍在独立审阅包，不在本版本关卡注册表、地图或奖励池。机器检查、浏览器试玩和图像检查不是专业认证。

发布决策独立记录在 `content/response-release.json`；未来不得仅为凑满十关而绕过这份决策。

## 从地图进入

底部仍是三个原分类。每个分类上方可切换「守护行动」和「处置练习」。旧地图位置、关卡 ID、存储键与旧花数不变，新分篇独立从首关逐一解锁。

|分类|处置练习（顺序）|
|---|---|
|自然灾害|地震室内避险 → 震动停止后的撤离 → 塌陷被困求救 → 洪水围困待援|
|公共安全|汽车落水离车 → 电梯被困求助|
|居家校园办公|隔烟与定位待援 → 沿可用楼梯撤离|

同一分类的两篇使用现有地图画作，节点与信号各自配置，不声称新增了三张地图原画。场景仍使用已审阅的统一绘本资源；本次不重新生成或二次抠图。

## 修改入口

- `content/levels/<id>/level.json`：原规则、阶段前置、演出完成后提交目标、观察时间；不按地图序号改 ID。
- `content/levels/<id>/skins/paper-gouache.json`：资源、场景边界、人物/道具位置、动画、目标框、声音配置。`illustrated.json` 保留同美术别名兼容。
- `content/catalog.json`：实际启用包。未注册的两关无法通过正式入口选取。
- `content/journey-map.json`、`journey-categories.json`、`journey-signals.json`：地图分篇、分类和环境信号。
- `content/journey-copy.json`：地图短标题；不影响规则和存档。
- `app/game/journey/knowledge.ts`：结算知识与出处；待援关不得显示「危机已解除」。
- `components/game/configured/practice-player.tsx`、`practice-renderer.ts`：新处置关的可选播放器；旧厨房、台风、找隐患和既有配置关保留原播放器。
- `app/game/runtime/drop-zones.ts`：拖动预览与松手共用判定；不要在 UI 再加一套热区。
- 统一视口、图集 frame 支持、旧防范关相机策略继续沿用维护源码。

## 构建与验收

运行 `npm test`、`npm run typecheck`、`npm run build`、`npm run export:offline`。

`node scripts/test-journey-browser.mjs` 从实际离线 HTML 的地图进入关卡，以隔离浏览器真实指针逐关完成；不注入目标完成或分数。验证分类/分篇、24 关通关、44 像素控件、初次 +3、重玩不重复奖励、刷新及多玩家隔离。输出在 `outputs/response-map-verification/browser`。

`node scripts/test-response-map.mjs` 额外检查 8 关的阶段前置、暂停冻结、错误动作可恢复、动画完成才提交目标、等待观察和两关排除。完整 `npm test` 已包含同组测试。

离线导出仍是 `outputs/本地离线版/小红花应急行动.html`。交付时必须用同一个经测试文件更新用户原入口，不只更新开发页或审阅页。HTML 自带图像、字体、运行代码与合成声音；知识出处链接需联网，但游戏游玩无需联网。

技术测试不等于手机真机测试或人工听音。声音使用非朗读合成音乐/环境/交互音效，没有新增 AI 朗读。

## 本次验收结果

- 完整 `npm test`：939 项通过；`tsc --noEmit`、生产构建与离线导出退出码均为 0。
- 隔离 Edge 152：从实际地图进入全部 24 关，真实点击/拖放通关；41 项浏览器检查通过，无页面异常、无外部网络请求，测试浏览器已关闭。
- 验证了地图 320×568、375×667、390×844、430×932、540×960、1440×900，24 关实际交互在 390×844 完成。此处不将地图尺寸检查说成每关全尺寸交互测试。
- 新处置关重玩不重复领奖；24 关完成后为 72 朵花；刷新、切换玩家与返回地图种花均通过。
- 交互与抠图素材沿用经 SHA-256 核对的审阅版：导入 8 关共 119 个配置/图片文件。本次未重新生成素材。
- 本次通过测试的 HTML SHA-256：`6f7235aa32ccef6bb3ecc38fdc74c1d98069f7a507a25699ba5724104dff4cea`。
- 工作副本中的证据：`outputs/response-map-verification/{browser/browser-report.json,tests.log,typecheck.log,build.log,export.log,import.json}`。实际交付记录及备份位置写在 `published.json`。
