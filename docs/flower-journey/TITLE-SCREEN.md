# 正式游戏首页

日期：2026-09-13。

## 已接入的行为

打开网页或独立离线 HTML 后先显示正式首页。首次玩家以“开始新游戏”为主按钮；已有探索记录或旧版花朵存档的玩家以“继续游戏”为主按钮。

- 开始新游戏：有进度时先确认；确认后清空当前玩家的小红花、关卡完成记录和解锁进度，地图回到起点。保留昵称及其他玩家的数据；取消不作任何改动。详见 NEW-GAME.md。
- 继续游戏：恢复当前玩家上次探索的地图区域和节点。没有新书签的旧存档自动定位可进入节点。
- 刷新未完成关卡后，继续游戏返回地图；本次未完成的关内操作不恢复，也不会提前发奖。
- 点击地图顶部游戏标题可返回首页。种花过程中此入口暂时禁用，保留完整种花演出。
- 首页提供结算与种花音效开关、本机排行榜；关内声音仍由各关暂停菜单控制。排行榜切换玩家后，继续入口与花朵数跟随当前玩家。

## 模块与替换入口

| 文件 | 职责 |
| --- | --- |
| content/journey-home.json | 主标题、主按钮、提示文案、主题色与插画路径 |
| public/levels/journey-map/title-screen-v1.png | 独立首页绘本插画，不包含文字或按钮 |
| components/game/journey/title-screen.tsx | 首页视图，只接收状态和回调 |
| app/title-screen.css | 手机与桌面的排版、视觉样式、减少动态效果适配 |
| app/game/journey/resume.ts | 地图书签解析、开始和继续的定位策略 |
| components/game/journey/use-journey-location.ts | 按玩家保存书签、无法持久化时保留会话内导航 |
| components/game/game-app.tsx | 首页、地图、游戏、排行榜的启动和返回边界 |
| scripts/export-offline.mjs | 将首页 CSS、插画与字体一起嵌入离线单文件 |

替换插画时修改 JSON 的 image 路径并重新导出；插画建议保留顶部标题和底部按钮的留白，随后检查 320×568、390×844、540×960、1440×900。名称不应写进位图。

书签使用单独 localStorage 键 little-red-flower-journey-location-v1，以玩家 ID 为索引保存 levelId 和 visitedAt。原排行榜键与奖励、解锁、关卡规则保持不变。书签只能定位地图，不能越过关卡准入校验。损坏或已退役关卡书签会被忽略。文件移动到不同位置或浏览器时，浏览器的本地存储范围可能变化。

## 插画生成记录

使用内置 imagegen 工具，模式为生成新图；产物已复制到上述 public 路径。艺术方向：暖色水彩绘本、红花与蜿蜒石板路、河流与城镇，沿用当前游戏地图的色彩与质感；界面由代码叠加；首页与地图统一使用居中竖屏画面，宽屏两侧保留柔和底色。尺寸规则见 ENTRY-LAYOUT.md。

最终提示词：

```text
Use case: illustration-story. A polished hand-painted title-screen BACKGROUND illustration for a gentle Chinese emergency education game called Little Red Flower. Portrait 2:3 composition, high resolution. Warm sophisticated gouache and watercolor picture-book art matching an illustrated isometric village map, rich natural greens, terracotta roofs, cream limestone, clear turquoise river, tactile soft pigment. In the middle distance a beautiful small neighborhood with a cream home, school courtyard, city buildings across a bridge, green hills and river beyond. A winding pale stone path from the lower center toward the welcoming town suggests an upward journey. ONE gorgeous red five-petalled flower with golden yellow stamens and textured green leaves in the foreground at x24%, y58%, naturally growing beside the path; not a badge or icon. Gentle late afternoon light, calm optimistic mood, a few floating petals, finely crafted plants along the edges. Composition for a REAL game start screen: TOP 30 percent is mostly quiet pale warm ivory sky / atmospheric open space for large Chinese title drawn later by code. BOTTOM 26 percent is a soft uncluttered warm pale stone path and grassy mist with sufficient low-detail light space for two menu buttons drawn later by code. Main architectural scene occupies middle 32%-66%, largest red flower clearly seen around 58% height. Maintain detailed art in middle and sides, intentional negative space top and bottom. Avoid empty flat monochrome background: use subtle luminous paper atmosphere and painted edge foliage. NO text, letters, logos, numbers, buttons, frames, user interface, compass, panels, people, fire, disaster damage or photographic/3D effects.
```

## 验证

- 当前新增游戏逻辑验证见 NEW-GAME.md；此处原首页报告保留其对应版本的 SHA。
- scripts/test-title-screen-browser.mjs 对最终离线 HTML 运行：四种视口、44px 点击区域、键盘开始、旧存档、独立玩家书签、刷新继续与损坏书签降级均通过，浏览器异常和网络请求均为零。
- 截图与最终产物 SHA：title-screen-verification/report.json 及同目录 PNG。
- 全部 24 关真实指针操作回归通过，首次奖励累计 72 朵，刷新保留、重玩不重复奖励；记录见 title-screen-verification/journey-regression.json。此后仅将首页音效按钮的辅助名称明确为“奖励声音”并添加对应悬停提示；最终 HTML 再次通过首页专项验证，其 SHA 以 report.json 为准。
- 隔离、静音浏览器测试在 finally 中关闭。真实手机和人耳听感：not_run。
