# 挑战失败弹窗 · 诙谐版素材

由用户已确认的「怎么回事！」弹窗拆分为可动画、可换文案的透明素材。所有创意绘制和擦除由 OpenAI 内置 ImageGen 完成；未使用外部 API/CLI 图像生成。Sharp 仅裁透明边、等比缩放、连续切片和编码；金色主按钮从已批准的完成弹窗原样复制。

## 使用

- `public/ui/painted-failure-v2/header.webp`：964×270，绿金标题牌；标题建议放左31%、上16%、宽51%、高59%的安全区内。
- `body.webp`：964×877，中部奶油纸张及直边，可垂直自适应文本高度。
- `footer.webp`：964×150，完整金边和缩小的右下角花苞；不放按钮后文字。
- `mascot.webp`：484×466，独立小红花，眯眼、挑眉、歪笑、叶片抱臂；适合整体歪头、轻晃。没有单独眉毛/眼皮图层，不能宣称逐帧眨眼。
- `button.webp`：964×222，原样复用金色主按钮。
- `secondary-button.webp`：964×235，深绿金边宽按钮，适合与主按钮竖排。

每项同时提供 PNG。所有文字保持真实 DOM；素材没有烘焙文字。面板三段是连续同宽切片，正常顺序即可接合。页头和页尾保持自然比例，只有正文段适应高度。小红花可在左上约29%卡宽处独立叠放。

## 来源与复现

- 批准的带文案效果图：`/Users/danny/.codex/generated_images/01a0a333-7edd-7b03-be71-e0bcf67639ee/exec-bc073ae6-49a0-4c24-b2e6-74c898d7eab8.png`。
- 提示词：`prompts.json` 和 `panel-refinement-prompt.txt`。
- 工程内原图：`panel-source.png`、`mascot-source.png`、`secondary-button-source.png`。
- 复现：项目根执行 `node scripts/prepare-painted-failure-v2-art.mjs`。
- 尺寸、alpha 和 SHA-256 验证：`manifest.json`。

面板首稿右下装饰触碰画布且占用较高页脚，已通过 ImageGen 定向编辑为小花苞、完整透明外边距。最终人物花瓣、叶尖及整个外框均未裁切。保留生成源的 alpha：正文纸张最高254/255，其余素材达到255，外部均为0；未通过脚本重绘或强制去底。
