# 校园与居家选关图：左右交错改版

按用户 2026-11-22 的要求，仅修改七岛预览的前两张图，不改变关卡数、关卡 ID 或其他地图。校园 8 处、居家 9 处仍按原顺序；从上到下沿弯曲步道逐个左右交错，不再两列对称并排。预览点击位置根据新构图重新标注，不套用旧图坐标。

本轮仅修改图片和独立预览，不继续上轮被中断的游戏接入，不新增玩法、不重新生图其余岛。

## 输入输出

两次调用 OriginGame Generate MCP `edit_image`，直接传入上一轮返回的 `media_url` 作为编辑源，未另起文本生图请求。模型返回 `gpt-image-2.6-sunburst`。工具异步受理后，用原任务 ID 查询成功结果，没有重复提交。

| 项目 | 校园安全 | 居家安全 |
| --- | --- | --- |
| 原图文件 | `outputs/island-level-maps/seven-islands/campus.png` | `outputs/island-level-maps/seven-islands/home.png` |
| 源媒体 ID | `2bafa36e119ffbbe7bc508dc593448a8` | `8adbba89ca2f70b63d73051d0c0d5751` |
| 编辑任务 ID | `media_20261122103149a0fac78f151c2a3a8aa6` | `media_20261122103220bdf0b76effe60b4b3178` |
| 输出媒体 ID | `001ec51b38a2b9d958129290493c3899` | `301584119d1ae5fbbe8c60332a5c7bfe` |
| 新原图 | `outputs/island-level-maps/seven-islands/campus-staggered-v2.png` | `outputs/island-level-maps/seven-islands/home-staggered-v2.png` |
| 游戏素材副本 | `public/levels/journey-map/campus-island-v2-staggered.png` | `public/levels/journey-map/home-island-v2-staggered.png` |
| 原生尺寸 | 724 × 2171 | 724 × 2172 |
| 字节数 | 3526365 | 3548114 |
| 输出 SHA-256 | `5ef10a70969bd83f7eebf919c386c1a85fa9f2a26bfe81eafee5cbae11168726` | `2d2d1d1197f1ff066c1d9efbcb26336d6bcc3237502e247b17e2448e759efe0d` |

旧 PNG 保留不覆盖；`art-source/island-level-maps/seven-islands.json` 记录原图与编辑任务，预览选择 v2 文件。预览按每幅图的真实宽高绘制，没有把校园图拉伸到 2172 高。

## 实际发送的编辑提示词

### 校园安全

```text
Edit the supplied SCHOOL SAFETY map. Preserve its exact warm hand-painted storybook illustration style, stone and colored tile materials, recognizable props and EIGHT distinct learning scenes. CHANGE THE COMPOSITION: eliminate the current bilateral symmetry, two-across rows, straight central axis, paired terraces and identical facing houses. Make ONE long continuous narrow 1:3 portrait illustration, 724x2172 composition, with a winding pale stone S-shaped path and organically staggered open-front buildings. Exactly ONE main station per vertical band, alternating LEFT then RIGHT descending from top to bottom. No two buildings have entrances on the same horizontal line. Each scene must have its own roof, room, entrance and garden separation, remain readable on a phone. Required TOP TO BOTTOM order: (1) upper LEFT, clean care first-aid cabin with large white round wash basin and gauze; (2) RIGHT one step lower, lilac nurse room with chair and large tissue box, distinct from basin clinic; (3) LEFT lower, classroom with green chalkboard and wooden desks; (4) RIGHT lower, science laboratory with safety goggles, test-tube rack and laboratory bench; (5) LEFT lower, open sports-field pavilion giving view of red oval running track and play equipment; (6) RIGHT lower, stairwell building cutaway with multi-storey switchback stairs and handrails; (7) LEFT lower, rain-wet entrance shelter with umbrella rack, wet steps and puddles; (8) lowest RIGHT, canteen handwashing veranda with taps and soap. The eight station focal centers should descend approximately y=9%,21%,33%,45%,57%,69%,81%,92%, each building offset left/right, NOT side by side, no extra large background school or spare houses that look like extra stations. Let winding garden paths and irregular flowering hedges connect them, rather than a grid. Buildings of neighboring bands can gently interlock vertically but must not obscure any key prop. Critical constraint: EIGHT stations only, same function and order as listed, not six, not nine. Keep top and bottom stations whole. No words, labels, UI, numbering, border or watermark. This edit is primarily a layout rearrangement, not new unrelated scenery.
```

### 居家安全

```text
Edit the supplied HOME SAFETY level-selection image. Preserve warm hand-painted storybook miniature architecture, terracotta and ceramic roof textures, cream stone, fruit trees, illustrated room props, palette and the same NINE individual learning destinations. Recompose completely from the current symmetric two-column terraces into an organic winding garden-village walk, portrait 1:3 724x2172 composition. NOT symmetric, NOT two houses side by side, NOT a grid, NOT paired rows. Exactly ONE station per successive height band with entrances staggered LEFT RIGHT LEFT RIGHT LEFT RIGHT LEFT RIGHT LEFT from top to bottom. Keep exactly these NINE recognizable different scenes in this order: (1) TOP LEFT sage-roof oil-pan kitchen with frying pan, stove and separate pan lid; (2) RIGHT below sunny peach child's bedroom with phone, plug and visible charging cable on wooden desk; (3) LEFT below winter night bedroom with stars outside window, radiator heater and bedside lamp; (4) RIGHT below pre-cooking kitchen with wok, chopping board, vegetables and shelves; (5) LEFT below smoke shelter living room with telephone and a CLOSED refuge door, gray smoky corridor visible in cutaway on the OTHER side of the closed door, never show open door connecting safe room to smoke; (6) RIGHT below a distinct tall apartment stairwell cutaway with switchback stairs and street exit; (7) LEFT below scald care nook with flowing tap in sink, separate kettle and towel; (8) RIGHT below home food preparation counter, two contrasting cutting boards with raw-food tray kept separate from prepared food dish; (9) BOTTOM LEFT pantry and cold-storage room, shelves, large refrigerator and independent freezer, one unified storage destination not multiple houses. Make all nine landmarks and clear individual entrance landings easy to read. Suggested focal centers descend y=8%,18.5%,29%,39.5%,50%,60.5%,71%,81.5%,92%; adjust freely to ensure complete roof, key props and entry fit without covering each other. A single pale curved stone walkway meanders between them and continues at bottom, flowerbeds and fruit trees flow naturally into gaps. No mirror symmetry and no giant bottom centered storage facade. Do not add more destinations. No text, number, label, floating badge, UI, logo or border. Main priority is changing paired layout to alternating organic left-right zigzag while preserving all nine functions.
```

输出与建议构图并非像素级完全一致，实际按生成结果标注入口。例如居家最下方储藏间仍较宽，前庭偏左，不是和另一座房子并排；本轮不把编辑提示词中的安全描述当作已通过关内内容审查的证明。它们是地图美术，不是安全行为示范或已完成关卡。

## 预览验收

已重新生成最终独立预览 `outputs/island-level-maps/seven-islands/index.html`，SHA-256 为 `2a646eb03d16a926218ef39b2b8f84becf3cd17cb4779641af29a5488d151a36`。构建时核对校园、居家旧原图保留，其他五张地图及网络、食品原图摘要不变；新增入口坐标按高度递增、左右交错校验。

`node scripts/test-seven-island-art-preview.mjs` 通过：实际点击七张地图的全部 48 个入口，校园 8 处和居家 9 处均打开对应介绍，并检查 320×568、390×844、1440×900 的原生宽高比与布局。测试浏览器隔离、离线、静音且已关闭；无页面错误、资源失败或外网请求。真机触控、人耳试听 `not_run`。
