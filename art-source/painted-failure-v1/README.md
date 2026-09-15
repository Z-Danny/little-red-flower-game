# 挑战失败弹窗 · 手绘母版 v1

从已批准的完成弹窗无字母版进行内置 **OpenAI image_gen** 编辑，保持金绿边框、象牙纸面和手绘质感。
失败版本使用未绽放红花苞表达“还可以再试”：左上为一个挺立的红花苞与两片小叶，右下为小花苞与叶片。
没有指人手势、盛开的奖励花、三花奖励、奖杯或嘲讽元素。所有标题、结果、场景知识及按钮文字必须由 HTML 生成。

## 交付与复现

运行 `node scripts/prepare-painted-failure-art.mjs`，输出 `public/ui/painted-failure-v1/`。

| 图片 | 像素尺寸 | 用途 |
| --- | --- | --- |
| `panel.webp` | 964 × 1272 | 整张空白母版 |
| `header.webp` | 964 × 250 | 深绿标题牌和左上花苞 |
| `body.webp` | 964 × 830 | 米白纸面与左右边框，仅该段可竖向拉伸 |
| `footer.webp` | 964 × 192 | 薄底边、右下花苞，保持比例 |
| `button.webp` | 964 × 222 | 金色无字主按钮，完全复用完成弹窗原字节 |
| `secondary-button.webp` | 964 × 355 | 较短的深绿金边无字次按钮，约 2.72:1 |

同时提供全部 PNG。原图与实际提示词在本目录：

- `reference-panel.png`：已批准完成弹窗的空白母版备份。
- `panel-source.png`：失败弹窗 image_gen 原始输出。
- `button-source.png`：已批准金色主按钮原图备份，没有重绘或改色。
- `secondary-button-wide-source.png`：次按钮第一版原图。
- `secondary-button-source.png`：根据双按钮布局缩短后的次按钮原图。
- `prompts.json`、`secondary-button-proportion-prompt.txt`：全部实际生成提示词。
- `manifest.json`：原图来源、源文件及输出 SHA-256、尺寸、裁切坐标、alpha 验证及布局区域。

## 响应式布局与安全区

三段来自同一面板的连续矩形切片，保持一致的横坐标，无间隙堆叠。

- header 自然高度：宽度 × `250/964`，约 `0.259336`。
- footer 自然高度：宽度 × `192/964`，约 `0.199170`。
- header 内的标题安全区：`left:24%; top:19%; width:52%; height:54%`。
- 正文：推荐 `padding-left:9%; padding-right:10%`，文字与按钮均为自然流排版。
- body 可以 `background-size:100% 100%` 竖向拉伸；不要拉伸 header/footer 的花苞。
- **双按钮放在 body 末尾。footer 只收边，不放按钮。** 这样右下叶片不会侵入次按钮。
- 主按钮文字安全区：自身 `left:12%; top:17%; width:76%; height:62%`。
- 次按钮文字安全区：自身 `left:14%; top:20%; width:72%; height:58%`。
- 在 390 宽视口可使用主按钮约 164 × 52、次按钮约 120 × 52 的 CSS 槽位；不在图中烤字。
- 主按钮强、次按钮弱，以金色与深绿的颜色对比区分“重新挑战”和“返回地图”。

## 已核对

所有输出都有真实透明 alpha（最小值 0、最大值 255）。原图边界与花苞、叶尖间有空白余量，没有裁掉装饰。
面板、按钮均无文字/数字/箭头/符号。header/footer 已逐张目检，body 仅有纸纹及连续两侧边框。
Sharp 仅用于 alpha 范围裁边、透明外边距、等比缩放、矩形切片及 PNG/WebP 编码；所有艺术编辑由 image_gen 完成。
这批新美术没有修改 `painted-settlement-v1` 及旧版美术文件。
