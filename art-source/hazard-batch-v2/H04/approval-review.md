# H04 素材审核（草稿，不是发布批准）

## 2026-09-10 最终修订

下文漏罩记录是旧草稿历史，已修复：保留候选1已审断口，按母版真实黑色插头/尾线连通区域补齐mask，不采用上移且误涂插座面板的候选2。未绘制新插头、未改原画、未连起断口之间的空气。脚本 refine-hazard-batch-masks.py、mask-refinement.json 记录ROI、阈值、连通种子与全部输入输出SHA。已重新编译，damaged_kettle 为36,794个逻辑像素，放大叠色确认插头位置正确、面板保留正常背景、裸露断口仍在。其余四目标像素数量不变。最终像素检查通过，浏览器验收看 FINAL.md。

审核时间：2026-09-10。作者卡 H04；运行 ID `kitchen-before-cooking-v2`。没有创建 APPROVED.lock 或 .asset-approved。

## 输入与追溯

- 原画 SHA256：`4f41ff6972a569ba7f34ea3321f371d151604700938d5771bf816c5ca240276b`。
- 原始四图尺寸：941 × 1672；编译世界 720 × 1280。
- 实际输入与产物 SHA 全部见 `processing.json`；`production.json` 没有坐标矩形热区或手绘新增物体。
- 当前原画语义：开火前静态检查，无火、烟、喷水或燃气泄漏演出；成人、孩子在入口，未触碰故障。
- 暂不锁定，允许同一原画 SHA 的可恢复刷新。

## 逐项目视叠色审核

已逐张查看 `proof/*-overlay.png` 的原图 50% 叠色，不以像素数量代替目视：

|目标|检查结果|
|---|---|
|gas_hose|老化软管裂口、连续弯曲走线与两端接头都覆盖；不包含柜体。与钢瓶目标不重叠。|
|paper_near_hob|只覆盖纸卷及搭到炉头支架的纸张；不覆盖整个炉灶。|
|greasy_filter|覆盖同一梯形滤网平面；厚油垢可辨，不把整台油烟机或灯光当目标。|
|sideways_cylinder|横卧瓶身、底座和瓶上阀件覆盖；真实提手空隙保留，外接软管不混入。|
|damaged_kettle|壶、底座、电线主要曲线及两个破损露铜断头都覆盖，壶把内部真空隙保留。完整墙插插头与右端短竖线漏罩，见下项。|

## 已告知主线程的完善点

- 右端插头与约原画 x95–98%、y75–79% 的完好尾线不在当前品红 mask 内。危险处在 x84% 附近的两个露铜端，已被覆盖；这是整组物体命中完整性不足，不是关键风险证据失联。
- 如补此部分，仅补原画已有插头及所属线，墙面插座面板不应扩大成目标；必须重新生图候选并通过草稿刷新，不允许程序新画一个插头。
- 原画的电线为明显断开/露铜，不能把它解释成普通完整线。短字幕只要求停止使用，不教触摸或修理。

## 人物与维护结局

- 已看 `proof/family-alpha.png`、`proof/reconstructed.png`、输出 `family.png` 与 `clean.webp`。人物头发、衣物和脚部轮廓保持原画；没有白底贴片或重新生成的脸。可见人物像素 58,349，实际裁切框 (560,179,160,499)，alpha 不是矩形。
- 底图只在人物许可区补空；目视没有残留另一张脸、手或服装。脚下原有阴影仍在，脚锚定情况下需由主线程最终浏览器确认微动不会显出残影。
- 已查看 `ending.webp`：滤网变干净、纸巾收纳、钢瓶直立且软管完整，灶具仍关闭；成人与孩子放松。
- 水壶与底座分离且插头拔离插座，损坏线没有“胶带修好”。组件仍可见于右侧台面，属于停用、隔离待处理的结果表达，不可说它已修好可重新使用。最终字幕须保持专业维护/另一时点边界。

## 执行证据

```powershell
python scripts/prepare-hazard-batch.py art-source/hazard-batch-v2/H04/production.json
python scripts/check-hazard-batch-art.py art-source/hazard-batch-v2/H04/production.json
```

两命令 exit 0；QA 返回 `pixel_structure_pass`。

后续使用加强 characters.exclude 的新版只读 QA 再检一次，仍 exit 0 / pixel_structure_pass；本卡无 characters.exclude 配置，无须因此重复编译。

- 5 项实体/命中像素：4,189 / 3,222 / 13,757 / 21,860 / 35,373；object 与 hit 完全同源。
- exactRgbMasks / sameSourceAlpha / protectedPixelsUnchanged / outsideRepairUnchanged 全部 true。
- weather / water / sky / fire / smoke 像素均为 0；`skin.effects` 仅有 characterMask。
- 图标为对应原图像素及真 alpha 提取，不是另一套生成图。
- 没有做当前关的实际手机浏览器点击、计时、声音试听、离线 file/HTTP 测试；这些仍由主线程验收，不能据此宣布可发布。
