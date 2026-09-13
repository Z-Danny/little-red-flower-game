# 温度计素材生成记录

方式：内置 image_gen，按 imagegen 技能执行。没有指定或声称模型版本。

最终项目资源：`public/levels/kitchen-hud-v1/thermometer-shell.png`。原始 1024×1536 PNG，真实 alpha，保留生成像素及透明通道，未程序去背或修改。游戏以皮肤配置的 SVG viewBox 显示有效区域，动态液柱另绘制，不焊死在图片上。

验收：透明像素 1,192,475，半透明像素 380,389；边缘有画笔柔和过渡。液柱在玻璃槽形状内裁切，不遮盖外圈和刻度；游戏画面不显示摄氏度、倒计时横条或 50 秒大字。

完整提示词：

```text
Use case: stylized-concept
Asset type: production game HUD sprite, a single hand-painted thermometer OUTER SHELL for a vertical 2D picture-book kitchen emergency game.
Primary request: an ORIGINAL charming but restrained analog thermometer, warm cream enamel body, muted deep teal pencil outlines, honey brass rim, subtle watercolor/gouache paper-grain texture, small soft highlights; matches a grounded warm paper storybook kitchen illustration. NOT medical, not futuristic, not a stock UI symbol.
Composition: portrait PNG on a genuinely TRANSPARENT background. Thermometer strictly straight, front-on, symmetric, no tilt or perspective. Tall slim body ending in one larger round bulb at bottom. The object itself has width:height about 1:4, entirely visible, centered, only minimal transparent padding. Single object, no other objects.
Production-layer requirement: draw the shell, rim, subtle glass rim highlights, and 6 short unlabeled tick marks beside the central tube. The narrow vertical inner tube and round bulb chamber should be EMPTY neutral light gray/cream, with absolutely NO red mercury, NO colored liquid, NO colored progress fill, because the game will animate liquid inside these regions. Tube straight and uniform-width, rounded at top, joins the bulb neatly.
No words, numbers, letters, Celsius/Fahrenheit symbols, labels, banner, timer digits, flames, badges, arrows, hands, wall, room or cast shadow rectangle. No checkerboard squares painted into the image, no white background, no thick white sticker halo. Real alpha transparency outside the object.
Please generate one polished raster game asset, not an entire interface screenshot.
```
