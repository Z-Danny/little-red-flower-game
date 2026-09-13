# 洪水围困待援：动作、物件、窗外天气与声音

版本：2026-09-13。关卡 ID：`flood-highground-practice`。仅优化该关的表现与摆放，保留六项规则、既有解锁前置及玩家存档格式。

## 本轮改动

| 阶段 | 人物与道具 | 声音与天气 |
| --- | --- | --- |
| 楼下 | 牵手上楼姿态；物资只在楼上，不鼓励返回低处取物 | 窗外洪水涌流＋密集雨声 |
| 到达高处 | 站稳护住孩子，脚不再维持奔跑姿态 | 风雨仍持续，上楼后不错误表达洪水已消失 |
| 求救通话 | 母亲持电话贴耳；台面电话暂时隐藏，通话后回到独立台面位置 | 接通提示；无对白、朗读或怪叫 |
| 备水、收听 | 水移至干燥待援位置；收音机留在桌面 | 瓶子放置、广播操作声 |
| 室内示意 | 母亲握住展开的红衣，两幅手臂/衣料状态循环；双脚仍在室内地板 | 布料动作声，窗外声持续 |
| 等待救援 | 衣物收低在母亲手中，母子互相依靠 | 保留室外洪水和雨声，不播放灾害结束音效 |

独立衣物道具在交到人物手中后 `opacity:0, blockInput:false`，不能留一件悬空副本。通话关键帧 `restoreHome` 恢复动作前的姿态，支持先示意后通话等操作顺序。

## 文件与职责

- `content/levels/flood-highground-practice/level.json`：既有规则，未改。
- 同目录 `skins/paper-gouache.json` 与 `illustrated.json`：资产、摆放、动作、玻璃蒙版、声音配置；两份别名保持一致。
- `public/levels/flood-performance-v1/`：四张独立人物透明图；挥衣两张保持同一 1024×1536 画布，禁止分别 trim 后直接替换。
- `app/game/runtime/schema.ts`、`validate.ts`：可选配置契约与严格检查。
- `app/game/runtime/scene.ts`：关键帧状态恢复；不授予目标、不更改计时。
- `app/game/runtime/presentation.ts`：按条件切换人物帧、脚底为轴的轻微身体动作。
- `components/game/configured/presentation.ts`：真实玻璃多边形裁切；判断当前正在绘制的背景，而非只看动作是否提交。
- `app/game/runtime/flood-sound.ts`：固定种子原创程序合成洪水/雨声。

## 天气层不可破坏的约束

1. 楼下和楼上分别标定玻璃，不能套一个矩形。
2. `clipPolygons` 为 world 720×1280 坐标，多个玻璃多边形取并集，再与 effect.box 相交。窗框、窗棂、前景盆栽都要排除。
3. `whenScene: {object:'world-scene', asset:'…'}` 按实际场景资产门控，包括上楼过渡中的背景切换时刻。
4. 天气深度低于人物/道具；不通过在人物脸上扣一个洞来补救错误的整屏雨。
5. 缩放、绘制、alpha 点击判定复用统一 camera；不得重新实现 per-level contain、拉伸或额外黑边。`framing.criticalRegions` 保护手机、饮水、收音机、衣物及人物区域，仅允许共享 cover 相机平移，不改变缩放比例。

## 可复跑制作流程

1. 核对当前完整源码与用户实际离线文件；保存 SHA 基线，避免从旧副本覆盖。
2. 先列阶段与道具归属，再生成素材。完整生图文字见 `image-prompts.json`，使用内置 image_gen；工具不能核实具体模型名称。
3. 原图生成后检查 alpha。当前四张原图含棋盘格，已经用户允许的本地程序去背；`scripts/prepare-flood-performance-art.mjs <原图目录>` 保留浅色衣服，只清理连通背景及人工核验的封闭空隙。
4. 查看暖底与深底对照，核对手握物、同帧脚底、透明边缘；见 `art-audit.json` 与 `art-check-*.png`。
5. 更新皮肤，不修改玩法规则。四个楼上任务的 24 种排列均须可完成。错误仍可纠正，待援不能绕过前五项。
6. 音频单独配置 `ambientProfile:'flood-window'`，其他关卡不启用即维持原表现。详见 `audio.md`。
7. 执行 `node scripts/verify-flood-refinement.mjs`；包含全套原回归、新的动作/声音/原生 Canvas 像素测试和类型检查。
8. 执行 `node scripts/export-offline.mjs`，再运行 `node scripts/test-flood-refinement-browser.mjs`。五种尺寸真实输入，隔离存档，静音浏览器 finally 关闭；不能拿脚本状态推演替代实际试玩。
9. 人工查看起始、上楼、通话、挥衣、待援截图。测试通过后仅同步本轮文件，SHA 守卫避免覆盖未知并发修改，备份再更新实际离线 HTML。最后在实际文件上再跑浏览器回归。

## 验收边界

环境声是可重复的程序合成 PCM，不是洪水现场录音或联网生成语音。音频采样、浏览器播放与生命周期测试不等于扬声器听感验收；真机手机和人工听音须单独记录。已有背景音乐保留，没有新增人物语音。

最终测试记录位于 `verification/`；以对应 HTML 的 SHA 为准，不用旧导出的截图证明新版。
