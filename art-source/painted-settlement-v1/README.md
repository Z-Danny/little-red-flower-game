# 完成关卡弹窗 · 手绘母版 v1

依据用户确认的完成弹窗 `approved-reference.png`，使用 **OpenAI 内置 image_gen** 编辑生成。
保留朝向玩家的手势、深绿标题牌、米白纸面、棕金边框、右下叶片和小红花。
所有标题、场景名、奖励、科普、来源和按钮文字必须由 HTML 动态排版；这组图片不含任何文字。

## 文件与复现

- `approved-reference.png`：用户确认示例的原图备份。
- `panel-source.png`：最终无字母版原图，已通过 image_gen 补足透明外边距，叶尖不再贴边。
- `button-source.png`：独立无字无箭头金色按钮原图。
- `prompts.json`、`panel-margin-prompt.txt`：实际使用的全部提示词。
- `manifest.json`：原图位置和哈希、导出尺寸、哈希、alpha 检验、布局安全区。
- 运行 `node scripts/prepare-painted-settlement-art.mjs` 重建 `public/ui/painted-settlement-v1/`。

Sharp 仅用于 alpha 范围裁边、透明外边距、等比例缩放、矩形切片、PNG/WebP 压缩。所有创意绘制及擦除均由 image_gen 完成。

## 响应式使用

| 图片 | 像素尺寸 | 用途 |
| --- | --- | --- |
| `panel.webp` | 964 × 1258 | 完整母版及设计检查 |
| `header.webp` | 964 × 250 | 标题牌和手势，保持等比例 |
| `body.webp` | 964 × 760 | 空白纸面与左右边框，只伸缩这里的高度 |
| `footer.webp` | 964 × 248 | 底部边框与右下开花，保持等比例 |
| `button.webp` | 964 × 222 | 金色主按钮，真实文字覆盖 |

所有图片同时提供 PNG。三段切片是同一母版连续的矩形裁切，横坐标完全一致。

建议从上至下无间隙堆叠 header、body、footer：

- header 和 footer 的宽度均为弹窗宽度，高度分别为宽度 × `250/964`、宽度 × `248/964`。
- 正文区域使用 `body.webp`，`background-size: 100% 100%` 仅在竖向伸缩；高度由文案决定。用纹理重复也可，但不保证每个重复接缝的纸纹连续，因此优先拉伸。
- header 标题安全区相对于该切片为 `left:24%; top:19%; width:52%; height:52%`。左手占据左侧约 22%，勿压住它。
- 正文左右留白推荐 `padding-left:9%; padding-right:10%`。
- 金色按钮的文字安全区为按钮自身 `left:12%; top:17%; width:76%; height:62%`。
- 主按钮可放在正文末尾。若放进 footer，其横向安全范围为 `left:10%; width:73%`，避开右下角花。
- 标题、正文、奖励花朵、科普列表、来源、按钮均使用独立 HTML 元素；弹窗超过视口时整体滚动，不将科普挤入固定高度。
- 若使用 9-slice，主图建议切线 `top=250, right=54, bottom=248, left=50`。但优先使用三段方式，避免横向拉扯手势和标题牌。

## 检查结果

- 面板及按钮 alpha 最小值 `0`、最大值 `255`，有真实透明区域。
- 标题牌、正文和按钮上均无烤入文字。
- 中央奖励区留白；无烤入三朵花、按钮或分隔枝条。
- 手势方向与批准稿一致，右下角花与完整叶尖保留。
- 没有改动关卡场景图、规则、交互代码或已有 `painted-v1` 美术。
