# 顶部分类轮盘

> 历史设计记录。当前游戏已改为右上角竖排工具和左下角扇形切换，见 [MAP-FAN.md](MAP-FAN.md)。本页保留原始美术素材来源与旧版验收记录。

按照 2026-09-15 确认的效果图，将地图的旧顶部信息栏与底部分类导航合并为一个顶部 UI。

## 布局与交互

- 左侧：Q 版红花与玩家真实累计花数，点击打开守护档案。
- 中央：圆形底板、当前分类图标和名称。仅用左右箭头循环切换自然灾害、公共安全、居家校园办公三个分类，已移除下方三个圆点。
- 右侧：Q 版奖杯与“成就”，打开包含三类守护奖章的档案。
- 档案保留排行榜、返回首页和奖励声音开关，地图不再显示旧工具栏。
- 保留原来的分类开放检查、种花过程锁定和地图定位流程；分类变化不发奖励，也不更改关卡 ID 或前置条件。

## 独立美术素材

运行素材在 `public/levels/journey-map/map-wheel-v1/`：

| 文件 | 用途 |
| --- | --- |
| `category-nature.webp` | 山峰、云、闪电与水浪 |
| `category-public.webp` | 城镇与守护盾牌 |
| `category-home.webp` | 房屋、学校办公楼与书本 |
| `flower.webp` | 左侧红花 |
| `trophy.webp` | 右侧成就奖杯 |
| `plate-wing.png` | 横向奶油色底板 |
| `plate-wheel.png` | 圆形奶油色轮盘底板 |

五枚图标分别使用内置 ImageGen 生成透明 PNG，再仅做透明留白规范化、缩放与 WebP 编码；未使用截图中的文字或数字作为素材。底板由可编辑 SVG 绘制并转成 PNG。图标的原始 PNG、底板 SVG、确认图、完整提示词和校验清单保存在 `art-source/map-wheel-v1/`。

重新生成运行文件：

```sh
node scripts/prepare-map-wheel-art.mjs
```

原始生成大图按仓库约定保留在本地制作目录，正式运行的七份文件保存在 `public/`。数字、中文名称和方向箭头由 HTML/CSS 显示。花数不会固定为效果图中的 63。

## 实现入口

- `components/game/journey/map-chrome.tsx`：分类轮盘与侧翼入口。
- `app/map-wheel.css`：共享地图视口内的响应式布局。
- `components/game/journey/archive.tsx`：档案及首页、声音入口。
- `scripts/export-offline.mjs`：纳入新样式，沿用 PNG/WebP 内嵌路径处理。

顶部栏固定在共享游戏画面的最上沿，安全区由底色覆盖。圆盘直径为 96–108px（原先 132–164px），横向底板高度为 48–52px；左右箭头仍保留 44px 点击区。地图滚动区域从不透明顶部底栏下方开始，只在圆盘下缘短距离穿过，不会在底栏上方露出地图或关卡内容。已删除旧 100px 留白和镜像模糊背景，不移动原图坐标。底部只保留设备安全区，没有旧导航的额外色块。

仅改变地图导航 UI，地图插画、花朵关卡节点、找隐患蒙版、各关统一视口和规则不在本次改动范围内。

## 验证

```sh
pnpm test:journey
pnpm test:leaderboard
pnpm typecheck
pnpm export:offline
node scripts/test-map-wheel-browser.mjs
```

浏览器直接加载最终离线 HTML，使用隔离存储和静音无头浏览器，结束时在 `finally` 中关闭。检查响应式尺寸、箭头切换、贴顶和滚动裁切、素材内嵌哈希、花数和入口、存档与继续游戏。63 朵花仅为明确的视觉测试存档，不能作为实际通关验收。本次紧凑顶部栏的结果与截图写入 `outputs/map-wheel-compact-verification/`，旧轮盘验收位于 `outputs/map-wheel-verification/`。

本次交付另存为 `outputs/地图轮盘版/小红花应急行动.html`，以免与工作区其他任务的默认导出互相覆盖。针对该文件验证：

```sh
node scripts/export-offline.mjs --output outputs/地图轮盘版
OFFLINE_FILE=outputs/地图轮盘版/小红花应急行动.html node scripts/test-map-wheel-browser.mjs
```

独立素材包为 `outputs/地图轮盘素材.zip`，包含运行图片、高清透明原图、可编辑底板与提示词。

实体手机：`not_run`。人耳音频检查：`not_run`。
