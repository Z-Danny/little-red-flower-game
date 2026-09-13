# 地震落石与生命通道路线

- 地震卧室、室内避震：保留尘土，加入五块绘本碎石。错开时间从墙侧下落、轻弹、落地衰减。震后撤离、道路塌陷及其他关卡不改动。
- 畅通的生命通道：2026-09-13 按反馈取消脚印，恢复原来的流动虚线路径。线宽从 3 增至 8，单段长度从 5 增至 10，间距为 12；其他关卡保持原尺寸。
- 配置仍解耦：`journey-motion.json` 的 `waypoints` 描述等间隔运动点，`envelope: fall` 描述落石出现与衰减；`route.width/dash` 控制路线粗细、段长和间距。`journey-signals.json` 单独选择对应关卡的演出。
- 碎石素材为内置 imagegen 生成的透明 PNG：[painterly-stone-v1.png](../../public/levels/journey-map/signals/painterly-stone-v1.png)。不把文字、编号或运动烘焙进图片。

## 最终生成提示词

Use case: illustration-story. One isolated small angular piece of broken sandstone masonry, a single irregular chunky stone, warm grey brown ochre shaded facets, rich crisp outline through painterly shading, delicate gouache pigment texture, warm picture-book game style, three-quarter view. A production sprite for tumbling masonry in a miniature earthquake scene. Recognizable solid stone, not a jewel. Truly transparent background, no ground, no shadow outside the stone, no dust, no motion lines, no letters, no face, no interface, no border. Center the single stone with a small transparent margin, fill about 80 percent of frame.

## 验证

最终离线 HTML 用隔离静音浏览器检查 320×568、390×844 的碎石运动与落地回弹、加粗虚线与流动效果、真实简介入口、悬停不改存档、完成态回顾和减少动态模式。报告：[report.json](corridor-dash-verification/report.json)。另外运行既有地图特效测试与 TypeScript。关卡规则、地图位置和存档代码保持原 SHA。
