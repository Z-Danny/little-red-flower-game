# 地图场景特效（第五版）

2026-09-12：三张独立场景地图覆盖 24 关。分类依据、地图替换说明和新增关卡落点见 [MAP-REFRESH.md](MAP-REFRESH.md)。

地图特效采用透明绘本素材与独立运动轨迹。鼠标悬停对应建筑、街道或关卡节点可增强显示；键盘聚焦、触屏按住节点也可触发。点击仍进入原关卡简介。已种花关卡默认保持安全，悬停时标明“情景回顾 · 已种花”，离开恢复安全；演出不写存档或奖励。

## 配置边界

- `content/journey-signals.json`：关卡 ID → 效果主题、地图锚点、效果框、场景悬停区域 `hitArea`。名称仍由原关卡配置提供。
- `content/journey-motion.json`：透明图片注册表 `assets` 与可复用多层演出 `recipes`。火焰保留已认可的原图片和运动；其余 11 类主题使用此文件。
- `app/game/journey/signals.ts`：纯配置解析和场景命中检测。
- `app/game/journey/motion.ts`：纯三次贝塞尔路径采样，不依赖页面、存档、玩法。
- `components/game/journey/sprite-tracks.tsx`：共享素材轨迹渲染器，每层独立透明度、缩放、角度和相位。
- `components/game/journey/scene-effect.tsx`：组合原火焰、通用素材轨迹和安全暖光。旧折线电弧、套圈旋风、规则雨线等绘制已移除。
- `components/game/journey/map-signal.tsx`：地图坐标换算、场景悬停和触屏按压；使用父层事件，不增加阻挡滚动的透明按钮。
- `app/map-signals.css` 与 `use-visible-motion.ts`：CSS 运动、屏外/隐藏页面暂停、减少动态效果、完成态显示。

## 换图、换位置、换动作

1. 换同类主题图片：修改 `journey-motion.json.assets` 对应本地路径。
2. 只换某一关的主素材：给 `journey-signals.json.nodes[关卡ID]` 设置 `image`；会替换该轨迹方案的主素材，保留次级层和路径。
3. 只换某一关的动作：复制一个 `recipes` 条目并改参数，再给节点设置 `motion` 指向新方案。
4. 移动整个效果：改节点 `anchor`；调整大小改 `width/height`；鼠标交互范围单独改 `hitArea`。
5. 调整轨迹：改每条 `tracks[].path` 的四个点。坐标相对效果框，固定为 160×200，和地图缩放无关。

地图锚点为效果框底部中心。三张地图的世界尺寸均为 720×2160。`hitArea` 用世界坐标的左上角和宽高描述。位置和大小按地图实际宽高分别换算，保留原竖屏最小高度规则。

`restOpacity` 控制未悬停时整组透明度。原火焰使用 `seconds/particles`；新素材方案由 `tracks[].seconds/copies` 控制速度与层数，避免两个参数来源混淆。

完整制作方法、火焰生成总结、字段示例和素材清单见 [PAINTERLY-WORKFLOW.md](PAINTERLY-WORKFLOW.md)。

## 检查

运行 `node scripts/test-map-signals.mjs`、`node scripts/test-journey.mjs`、`node scripts/export-offline.mjs`、`node scripts/test-map-signals-browser.mjs`。

浏览器检查使用隔离、静音 Edge，最终关闭；覆盖 24 节点×3 尺寸、生成素材内嵌、实际轨迹变化、建筑悬停、完成态回顾与恢复、键盘、减少动态效果及触屏节点按压。完成态用独立存档样本验证展示，不作为奖励发放的证据；另有全部 24 关的实际点击通关脚本验证奖励。实体手机与人耳未测。


## 颜色与可见度

非火焰素材有独立 `appearance` 配置：`alpha` 加强原图透明度，`saturation` 控制饱和度，`brightness/contrast` 控制亮度与明暗对比，`edge` 设置柔和边缘阴影颜色。风和蒸汽稍微压暗亮部以便从浅色地图中分离，水保留蓝绿色，电花保留明亮蓝白色。图像文件不修改，效果仅作用于通用素材层，原火焰不经过此调色。

未悬停预览的 `restOpacity` 为 0.32；悬停整体为 1，主层透明度峰值为 0.82–0.95（灯光、水面单独降低）。原有淡入淡出与路径保留。颜色强度、单层透明度和整组透明度是不同层级，调整时需看最终地图效果。
