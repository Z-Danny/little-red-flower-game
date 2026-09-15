# 红人榜 / 我的进度共用素材 v1

批准参考为 `reference-progress.png` 与 `reference-board.png`；头像按最新反馈换成压低墨镜、半眯侧眼与歪嘴笑的新小红花，和失败弹窗的叉手小花分开。

## 来源与生成

- 生成方式：OpenAI 内置 ImageGen。没有使用 CLI 或外部 API。
- 4 组完整生成提示：[`prompts.json`](prompts.json)。
- 原始输出：`frame-source.png`、`parts-source.png`、`islands-source.png`、`avatar-source.png`。
- 来源路径、裁切坐标、输出尺寸、SHA-256、透明通道统计：[manifest.json](manifest.json)。
- 可重复准备命令：`node scripts/prepare-painted-journal-art.mjs`。
- Sharp 仅执行矩形裁切、同比缩放、切片与编码；未去背、重画或程序化调色。原始图的外围已是真实透明通道。

## 运行时文件

全部位于 `public/ui/painted-journal-v1/`，每种都有 PNG / WebP；运行时优先 WebP。

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| frame-header | 960 × 224 | 木框顶部、空白红色绶带 |
| frame-body | 960 × 1026 | 纵向伸展的米白纸和侧木框 |
| frame-footer | 960 × 156 | 木框底部与绿叶角饰 |
| avatar | 512 × 500 | 新墨镜小红花头像 |
| stat-flowers / stat-progress | 640 × 218 | 深绿、金边、轻异形的统计牌 |
| island-sign | 640 × 136 | 岛屿名称牌 |
| count-tag | 384 × 202 | 两短绿扣悬挂的金色进度吊牌 |
| rank-leaf | 384 × 143 | 金叶形名次牌 |
| tab-active | 640 × 227 | 深绿选中页签 |
| tab-inactive | 640 × 228 | 米白未选中页签 |
| island-nature | 640 × 531 | 山、林、瀑布与木桥 |
| island-public | 640 × 537 | 广场、喷泉与石桥 |
| island-home | 640 × 537 | 住宅、学校、办公楼与操场 |

`frame.png/webp` 仅供复查全框，不必同时载入页面。

## 布局约束

- 标题、数字、玩家姓名、进度等必须使用真实 DOM 文本；所有美术素材无文字和假数据。
- 保持头部与尾部的自然比例，中间切片可按内容竖向伸展。
- 内容左右至少各留 8%；标题置于 header 的 `left:24%; top:12%; width:52%; height:56%`。
- 名称牌左侧绿叶、吊牌顶部扣子和金叶左侧叶片不放文字。精确安全区在 manifest。
- 三岛屿均为全彩原图，进度灰度、显色由运行时真实分类进度控制。不得把示例分数烘焙进图。
- 头像是单层透明图，适合短暂歪头动效；它不包含独立眼睛或墨镜动画图层。
- 无标题小红花、关闭叉、返回按钮或最近关卡记录；外部空白关闭由运行时完成。

## 检查

生成后逐图查看并验证所有输出 alpha 最小值为 0、最大值至少 250；核心图形完整、没有文字、没有占位数字。岛屿图集沿两处 alpha 最大仅为 4 的透明分隔线裁切，各自仍完整呈现独立的自然海岸线。
