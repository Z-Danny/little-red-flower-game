# 天空群岛素材

使用用户确认的丰富手绘浮岛参考，制作三个独立岛屿、天空和云。生产素材位于 `public/ui/archipelago-v1/`；入口小岛、空白木牌、红旗沿用此前已确认素材。

- `nature-island.png`：乌云、闪电、降雨、湍流与地裂的自然灾害岛。
- `public-island.png`：小镇、石桥、河道与路灯的公共安全岛。
- `home-island.png`：住宅、校园与办公楼的生活场景岛。
- `entry-island.png`：左下角四分之一圆按钮中的树木浮岛。
- `sky-background.png`：独立绘本天空底图。
- `cloud.png`：透明云层，页面复用为三层缓慢漂移的云。
- `wood-plaque.png`：空白木牌，文字由界面绘制，标题保持一行。
- `current-flag.png`：空白红旗与旗杆，界面叠加“当前”。

使用内置 `image_gen.imagegen` 生成；完整新生成提示词记录在 [prompts.json](prompts.json)。素材源文件、尺寸、SHA-256 与真实透明边界记录在 [asset-manifest.json](asset-manifest.json)。除天空外均为真实透明背景，已检查主体未裁断。不把整页截图当背景，因此云、岛屿、旗子可独立运动。

入口、木牌和旗帜的透明留白在 CSS 中定位，原始 PNG 保留未裁剪。文字不写入岛屿图内。导航行为与最终离线 HTML 验收见 [MAP-ARCHIPELAGO.md](../../docs/flower-journey/MAP-ARCHIPELAGO.md)。
