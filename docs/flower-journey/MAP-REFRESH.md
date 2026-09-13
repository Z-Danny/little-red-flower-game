# 三张地图与关卡场景对应表

本轮以完整维护源码的 24 个已启用关卡为基线，读取了新增 8 关的场景、目标、处置步骤和适用条件。界面合并为自然灾害、公共安全、居家校园办公三张独立地图；删除分篇按钮、分类进度数及指南针。仍保留花朵总数、声音、排行榜和区域完成标记。

## 新增关卡的归类依据

| 关卡 ID | 分类 | 地图中的实际位置与表现 |
| --- | --- | --- |
| quake-cover-practice | 自然灾害 | 木桌客厅，局部尘土与震动感；桌子保留清晰可见 |
| quake-exit-practice | 自然灾害 | 完整楼梯出口与集合广场，灯光和沿楼梯移动的路线提示；不再表现为持续地震 |
| flood-highground-practice | 自然灾害 | 洪水上方的干燥高层平台，水面流动与窗口示意 |
| collapse-signal-practice | 公共安全 | 道路塌陷的空隙与警戒线，土尘及求救反馈；原配置并未限定为地震，因此从自然灾害移到公共安全 |
| car-window-practice | 公共安全 | 河岸落水蓝车与救生圈，流动水面靠近可用侧窗 |
| lift-contact-practice | 公共安全 | 稳定停在两层之间的客梯、关闭轿门、应急照明与通话面板；无下坠、火焰或电弧 |
| fire-shelter-practice | 居家校园办公 | 关闭房门的住宅、外侧烟气和窗口白布；避险房内无明火 |
| fire-stairs-practice | 居家校园办公 | 高楼上部烟气、完整清晰楼梯及室外集合点 |

原有关卡按实际场景保留：台风、洪水、雷雨、地震和森林火源归自然灾害；楼道、电梯和井口归公共安全；厨房、卧室及校园厨房归居家校园办公。总计 11 / 7 / 6 关，这些数量只写在维护文档，不显示在分类导航。

## 可替换的模块

- 地图图片与节点位置：`content/journey-map.json`，`image` 是本地资源路径；`x/y` 是花坛落地位置，`place` 记录选点依据。三张地图均以 720×2160 为世界坐标，顺序从下向上。
- 名称、简介：原关卡配置及 `content/journey-copy.json`；不要更改关卡 ID 来换显示名。
- 分类：`content/journey-categories.json`；每类只关联一张地图。
- 特效落点与交互：`content/journey-signals.json`，独立配置 `anchor`、`width/height`、`hitArea`。
- 素材与运动：`content/journey-motion.json`，`assets` 注册透明 PNG，`recipes` 组合路径、速度、相位、透明度、缩放、旋转；不访问游戏状态。
- `tracks[].pivot` 为素材自身的归一化发射点，电弧从插座固定位置发出；`envelope: burst` 表示快速显现再衰减。飞叶使用独立轨迹与相位，避免整张图片缓慢晃动。
- `recipes[].cues` 配置通话点与路线，`scene-cues.tsx` 只负责小范围灯光、波纹和流动虚线。玻璃电梯和上部客梯使用不同面板位置，轿厢不移动。
- `sprite-tracks.tsx`、`scene-effect.tsx` 与 `map-signals.css` 是共享演出层。离屏、页面隐藏及种花时暂停；减少动态效果模式显示静态提示。

火焰保留原有已认可素材与双层运动。电花加强亮起阶段的尺寸和分叉，加入不同方向的短促碎花；台风使用同方向快速掠过的绘画风带及多组飞叶。水、尘、烟、白布按各自场景组合。

## 存档与解锁兼容

所有关卡 ID、关卡规则、玩法运行时及存档服务不变。把旧六张分篇地图的隐式“前一节点”记录为各节点的 `unlockAfter`；空值表示原本就可进入的起点。这样移动关卡不会使旧存档中已开放的入口被锁回去，也不会补发奖励。

一条原有依赖链横跨新分类：震后撤离 → 道路塌陷求救 → 洪水高层避险。保留这条关系以兼容已有进度。锁定简介现在明确写出需要完成的前置关卡名，下一关由依赖关系选择。未来重新设计解锁顺序时，需要单独做进度迁移，而不是挪动图片时顺带改规则。

## 图像资产与提示词

使用内置 imagegen 生成，保留透明素材的原始 alpha：

- [自然灾害地图](../../public/levels/journey-map/nature-v2.png)
- [公共安全地图](../../public/levels/journey-map/public-v2.png)
- [居家校园办公地图](../../public/levels/journey-map/home-v2.png)
- [风吹叶片](../../public/levels/journey-map/signals/painterly-leaves-v1.png)
- [窗口白布](../../public/levels/journey-map/signals/painterly-cloth-v1.png)

完整提示词见 [MAP-REFRESH-PROMPTS.json](MAP-REFRESH-PROMPTS.json)，自然地图卧室局部修正见 [MAP-REFRESH-EDIT.txt](MAP-REFRESH-EDIT.txt)。图片不包含文字、关卡编号、花朵节点或指南针，后续可以独立替换。

## 验证与交付

- `node scripts/test-journey.mjs`：27 项，含 8 关处置流程、分类、旧存档解锁与奖励保护。
- `node scripts/test-map-signals.mjs`：6 项，检查每关效果、落点、移动路径、强风、电弧发射点及停梯条件。
- `node scripts/test-map-signals-browser.mjs`：最终离线文件，24 关 × 320×568、390×844、1440×900；真实悬停、时序运动、减少动态、触屏按压、离开恢复安全、存档不被特效更改。
- `node scripts/test-journey-browser.mjs`：隔离浏览器实际点击完成全部 24 关；结算、种花、72 朵花刷新保留、重复游玩、失败与中途退出、独立玩家。
- 另检查 TypeScript、lint、正式构建及离线资源哈希。最终交付只同步本任务差异，先校验基线 SHA 并备份，不覆盖其他关卡修改。

浏览器报告见 [特效检查](signal-verification/report.json) 与 [实际点击通关检查](journey-verification.json)。报告绑定受检 HTML 的 SHA，浏览器结束后关闭。移动端为桌面浏览器模拟竖屏，未使用实体手机。
