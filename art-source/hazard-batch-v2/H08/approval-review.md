# H08 素材审核（已编译草稿，待运行验收）

审核时间：2026-09-10。作者卡 H08；运行 ID `quake-bedroom-v2`。没有创建 APPROVED.lock 或 .asset-approved。

## 输入与追溯

- 原画 SHA256：`4c0a5d608b7648158289e9709e0c42d1ea82ca46e2e0c7c2ac06f30eee3ec7ee`。
- 已阅读本卡设计、编译工具及真实规则；原画、mask 和人物补空候选已经目视。
- 修正后的 `ending.png` 已到位并重新目视；SHA256 为 `c8b56eb89970db20332255fd17fe8b86921c241c95cf23fc16eb05968e6f322e`。没有把固定带仍脱开的旧候选当成功图，也没有借用原画伪造结局。

## 允许的 mask 修正

`production.json` 的修正只裁减已有像素；不新增原画没有的物体：

- unsecured_cabinet：原候选把左书柜、房门、床头柜/台灯、桌子/桌灯等涂红。用 keepPolygons 仅保留右侧高柜及其脱开的固定带和墙面连接件，并用 excludePolygons 排除桌灯。已查看 `proof/cabinet-correction-preview.png`，普通家具不会变成红色目标。
- heavy_top：高处陶罐及其中植物属于一组沉重陶罐组合，可保留绿色植物整体；不把左书柜一并加入。
- overbed_frame：原画是实心厚重镜面，不是镂空框；仅对此单一目标设 fillEnclosedHoles=true，并记录审核理由。桌腿、把手等真实空隙不使用此项。
- exit_boxes：门口挡路箱，真实把手孔应保留。
- blocked_shelter：桌下箱篮组合；不能圈整个桌子或填桌腿之间的空气。

室内 weather / water / sky / fire / smoke 多边形全空；实际 skin 仅注册 characterMask，五份环境 mask 像素数量均为 0。

## 完成的实际检查

1. 已目视修正结局：高柜短固定带的柜体端与墙体端均有螺钉连接，原垂尾消失；高处陶罐低位收纳、床上镜子移开、门口和坚固桌下清空。原床、柜、桌位置没有通过搬动来伪造消除问题；家人放松，未演出地震。
2. 正式编译后再次逐张查看 `proof/unsecured_cabinet-overlay.png`、`heavy_top-overlay.png`、`overbed_frame-overlay.png`、`exit_boxes-overlay.png`、`blocked_shelter-overlay.png`。均为原图 50% 叠色；桌板/桌腿/普通柜不在目标内。镜面填充仅作用于真实实心物体。
3. 已看 `proof/family-alpha.png`、`proof/repair-mask.png`、`proof/reconstructed.png`、`clean.webp`：人物轮廓非矩形，脸、衣服与脚仍来自原图，没有白底贴片或另一套脸。人物像素 74,129；裁切框 (200,295,226,520)。母子腿间真实空隙保留。
4. 人物补空只用实际许可区；原画脚下阴影保留，脚锚定时合理。最终上身微动与边缘残影仍需浏览器观察，静态重组通过不等于动态已验收。

## 执行证据

```powershell
python scripts/prepare-hazard-batch.py art-source/hazard-batch-v2/H08/production.json
python scripts/check-hazard-batch-art.py art-source/hazard-batch-v2/H08/production.json
```

使用已加强 characters.exclude 的新版脚本；两命令 exit 0，返回 `pixel_structure_pass`。

- 5 项实体/命中像素依次 55,072 / 9,527 / 25,394 / 52,126 / 56,468。
- exactRgbMasks / sameSourceAlpha / protectedPixelsUnchanged / outsideRepairUnchanged / effectMasksExcludeTargetsAndCharacters 均为 true。
- 原图、补空、结果图、family、5 图标与所有 mask 的 SHA 可见 `processing.json`。
- object 和 hit 蒙版完全一致，没有加矩形热区；图标均由对应原图与真 alpha 提取。
- 没有执行当前关的实际手机浏览器、音效试听或 file/HTTP 离线验收；这些由主线程完成。草稿不锁，不因候选生成或像素检查通过自动批准发布。
