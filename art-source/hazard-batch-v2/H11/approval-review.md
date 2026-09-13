# H11《雷雨来临的公园》素材复核记录

日期：2026-09-10。状态：**静态语义与像素结构检查通过，可进入整合试玩；未锁定，未声称浏览器或音频验收。**

## 输入与身份

- 运行 ID：`thunder-park-v2`；作者卡：H11。依据 `docs/hazard-batch-v2/cards/H11/design.md` 与 `docs/hazard-batch-v2/reviews/outdoor.md`。
- 实际逐图检查了 `scene-original.png`、`mask-candidate.png`、`clean-candidate.png`、`ending.png`。四图均为 941×1672，编译为 720×1280。
- 母图 SHA256：`ec25e800ce6db2f080b8681b890654fa5ce68b09db72c9c3a01a0d14ced71d75`。其余实际哈希和当前 spec 哈希见 `processing.json`；旧未批准草稿由 `--refresh` 保留在 `compiled-history/`。

## 逐目标原画—蒙版对应

|目标|原画可见判据与边界|真实内部样本（逻辑坐标）|
|---|---|---|
|isolated_tree|独立高树树冠与树干；没有把整片树林或树下草坪圈作矩形目标。|[134,122]|
|open_gazebo|开放亭屋顶、柱子、栏杆和桌凳组合；柱间可见背景的自然空隙保留。不是密闭坚固建筑。|[450,294]|
|pond_platform|池塘边木钓台及其固定在画面上的椅、钓竿、箱子构成同一钓台组合；不把整池水作点击区。|[256,537]|
|open_cart|有顶但侧面开放的高尔夫球车；柱框、车厢之间的实际空隙未填。不是全封闭金属车。|[498,568]|
|camping_tent|普通帐篷布体与支撑杆；不把周围草地算入。|[247,696]|

上述样本来自实体蒙版最大内距点，不是矩形中心。object-mask 与 id-mask 完全相同，未使用 hitFillPolygons。五个真实 RGBA 图标均由同一母图实体提取。

## 人物、补空和环境

- 人物是母图三名家人的原像素；使用同构白色候选及 GrabCut。已检查 `proof/family-on-checker-2x.png`、`proof/reconstructed.png` 和全幅 alpha。
- 初版透明人物误带了右下方桌上植物和水杯边缘。现通过 `corrections.characters.excludePolygons` 排除这些静物；该排除同时作用于 alpha、补空许可和微动许可，静物不跟随呼吸移动。
- 人物在桌后自然遮挡裁切，不补造腿脚或身体。右侧母亲触画布边是原构图。实际微动下裁切边是否仍自然，必须在 0/30/60/90 秒试玩再看，静态截图不替代该验收。
- 窗外天气许可按真实窗框内轮廓给定；室内墙、桌、人物不在雨区。水波只给可见池水，闪光只给远处天空；再减去全部目标与人物微动保护。`proof/effects-permission-overlay.png` 是许可范围示意，不是游戏效果截图。
- 非火环境 skin 仅注册 character/weather/water/sky 四种 mask；fire/smoke 输出全黑 QA 文件但不注册。
- 补空候选曾改变远处墙报字样；合成只使用人物和小边界，墙报原像素保留。五个目标及修补许可外像素完全不变。

## 结局与安全边界

结局仍在同一坚固建筑室内，家人放松但没有走进雷雨；窗外五个场所均无人，降雨仍在，不能暗示找齐目标会停止雷雨。图像不能认证真实建筑的防雷条件，也不能推断人物离窗距离已达任何技术标准；字幕应保留“进入合适的坚固建筑避险并远离窗户”。误点文案不能暗示其余户外位置安全。

## 已执行与未执行

已执行 `prepare-hazard-batch.py ... --refresh` 和 `check-hazard-batch-art.py ...`，均退出 0。像素 QA 为 `pixel_structure_pass`：精确五色、真透明同源图标、人物原画 RGB、非矩形实体、目标原像素不变、修补边界、效果许可、文件哈希和真实命中样本均通过。

未执行：浏览器手机尺寸实际点击、暂停/重试、四档动态、真实听音、HTTP/file 离线流程。不能据此文件宣称整关已最终验收；不写 APPROVED.lock。此为内部制作审核，不是专业认证或政府审签。
