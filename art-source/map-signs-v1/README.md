# 绘本路牌素材 · 第一版已确认

状态：**integrated_and_verified**。用户于 2026-09-15 确认完整审核页，并授权将素材与高光、扫光、花苞回应和通关花印动效接入游戏。原始审核页、指纹与审核记录保留；批准记录见 `asset-manifest.json` 的 `approvalHistory`。

本目录保存已批准的制作原件与独立审核页生成器。运行时的 3 张底牌 PNG、24 枚刻纹 SVG 和 1 枚花印 SVG 已原字节复制到 `public/ui/map-signs-v1/`；全部 28 个文件与本目录的 SHA-256 一致。显示配置独立放在 `content/journey-signs.json`，类型与读取函数在 `app/game/journey/signs.ts`，不改变关卡规则、ID、解锁关系或存档。

## 素材

- `assets/nature-base.png`：森林绿手绘木牌、叶片雕角。
- `assets/public-base.png`：蓝色搪瓷牌、浅色包边、小铆钉。
- `assets/home-base.png`：暖棕手绘木牌、木钉。
- `assets/motifs/`：24 个原创 SVG 牌角刻纹；关卡映射见 `motif-manifest.json`。
- `assets/completed-flower.svg`：通关小红花印章。
- `map-context-preview.png`：基于用户截图生成的静态效果示意，仅供评估视觉方向。它经过生成式重绘，不是游戏截图，不是可替换地图，不用于核对精确布局。

三张底牌均为内置 OpenAI `image_gen` 生成的 RGBA PNG，原图直接复制到本目录，没有对像素重绘、裁切或改色。自然底牌先生成，蓝色与棕色底牌以它为参考编辑，保持构图与轮廓一致。尺寸、透明度、来源与 SHA-256 见 `asset-manifest.json`。

SVG 刻纹与花印以代码绘制，适合小尺寸清晰显示；没有把文字或状态烘焙进底图。高光、慢呼吸、一次扫光是审核页中的独立状态层。关卡标题使用当前配置中的原名，24 个正式 ID 不变。

## 提示词

- `nature-base.prompt.txt`
- `public-base.prompt.txt`
- `home-base.prompt.txt`
- `map-context.prompt.txt`

## 审核页

运行 `node art-source/map-signs-v1/build-preview.mjs` 生成 `outputs/路牌素材待确认-v1/index.html`。审核页内嵌字体与素材，可离线打开，集中检查三种材质、三状态、24 关组合和手机尺寸。运行时素材只通过 CSS 取原图主体区域，不改原 PNG。

此页和 `verification.json` 记录的是接入前的独立素材审核，不是最终游戏验收。当前已完成素材、24/24 刻纹与全部动效的游戏接入；最终离线 HTML 的 288 个布局样本、48 次往返稳定性和 10 项动效检查全部通过。完整记录见 `../../docs/flower-journey/painted-map-signs-verification.json`，其中绑定实际 HTML 的 SHA-256。真机与人耳检查仍为 `not_run`。

## 运行时显示配置

三种材质共用原图尺寸 `2043 × 770` 和主体边界 `{ left: 32, top: 132, width: 1980, height: 480 }`。显示层通过这个边界定位原图，不重新裁切或改画 PNG。未知地图使用自然灾害底牌；未知关卡不附加刻纹。

`motion` 配置统一提供慢呼吸 `3200 ms`、一次扫光 `1000 ms`、花苞回应 `650 ms`、花印落下 `380 ms`。这些时间只影响演出，不参与游戏状态计算。
