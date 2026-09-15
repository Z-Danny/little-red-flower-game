# 暂停纸卡素材

2026-09-15：用户确认纸卡＋金色书签样式，并要求紧凑、动态文字提示、声音总开关和「重新开始」。去掉顶栏、红花、继续按钮、重复重来图标和返回地图入口。

- approved-preview.png：用户已确认的效果图。
- paper-source.png：由确认图提取的无字米色纸卡，透明背景。
- bookmark-source.png：由确认图提取的无字金色书签按钮，透明背景。
- 生成方式：内置 image_gen；不是新关卡美术，不修改场景图、蒙版或视口。
- 运行资源：public/ui/pause-v1/paper.webp 和 bookmark.webp。通过 cwebp 88/90 质量转码，保留透明通道。
- 所有中文、提示和开关都由 DOM 呈现，未将固定关卡文案烧入运行图片。

实际生成提示词见 prompts.json；来源与运行图指纹见 manifest.json。
