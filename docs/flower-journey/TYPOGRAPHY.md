# 字体与排版维护

本轮只调整展示层；三类名称、8/4/4 关卡分组、节点坐标、关卡交互和奖励存档保持原配置。

## 统一入口

- `app/typography.css`：字体声明、标题/正文/辅助信息颜色、字号与间距，以及窄屏规则。页面通过 `globals.css` 引入；离线导出器在各场景样式之后加载它。
- `--font-game-title`：霞鹜文楷屏幕阅读版的本地子集，用于地图关卡名、页面与弹窗标题。只用正常字重，避免伪粗体损伤笔画。
- `--font-game-body`：Noto Sans SC 可变字体本地子集，用于正文、按钮、数字和局内 HUD；数字采用等宽数字特性。
- Canvas 动态标签通过 `app/game/typography.ts` 读取同一个 CSS 字体变量，避免场景绘制器各自写死字体。变量在每次页面加载后读取一次，修改后刷新即可。
- `--type-ink/body/muted/accent`：深绿标题、正文、辅助文字、花朵奖励色。地图名字使用轻描边式阴影以适应插画背景。
- 布局以 4/8/16/24px 为基础。介绍正文 14px，弹窗标题 26–29px，关卡名 15–17px。顶栏长分类同一行显示，保留窄屏字号与 44px 点击区域。

## 图片和关卡名称仍然独立

替换地图/节点图片：`content/journey-map.json` 和 `content/journey-skin.json`。
修改分类：`content/journey-categories.json`；地图区域简称在 `journey-map.json`。
修改关卡文案：关卡自身配置和 `content/journey-copy.json`。不必编辑字体样式。

## 本地字体与许可证

`public/fonts/manifest.json` 记录原始来源、原文件与子集 SHA256、大小和覆盖字数。两个衍生字体分别命名为 Flower Display、Flower UI，保留上游版权与 OFL 1.1。字体和许可证全文均嵌入离线 HTML，无在线字体请求。

子集包含 GB2312 常用汉字、当前代码/关卡文案中的汉字、ASCII 和常见标点。新增生僻字或玩家昵称超出覆盖时回退到系统中文字体，不显示空白；需要统一生僻字外观时可重新生成子集。

再生成：准备官方原文件 `WenKai.ttf`（LXGWWenKaiGBScreen v1.522）、`NotoSansSC.ttf`（Noto Sans SC 可变字体）和 `WenKai-OFL.txt`、`NotoSansSC-OFL.txt` 放在同一个目录。Python 环境安装 fonttools、brotli 后执行：

```sh
python scripts/subset-ui-fonts.py /path/to/originals
node scripts/export-offline.mjs
```

替换成其他字体时同时更新 `@font-face`、清单、许可证与导出器中的许可证文件名。换字体后要验证 320px 窄屏、介绍/结算高度、离线字体加载和最终导出 HTML。

设计参考：https://datawhalechina.github.io/easy-vibe/zh-cn/stage-2/frontend/llm-skills-beautiful/ 。采用清晰字体角色与间距层级，适配现有温暖绘本地图。

## 本轮验证

- 17 项旅程单测、TypeScript 检查和正式构建通过。
- 隔离静音 Edge 对最终离线 HTML 检查：2 套字体真实加载；三类地图/介绍在 320×568、390×844、1440×900 共 9 组布局通过；档案、排行榜和 48 朵花窄屏样本通过；没有外部网络请求。
- 16 关通过真实指针操作完成，检查首次 +3、重玩不重复、失败不奖励、种花、区域奖章、刷新与多玩家隔离。完整流程后仅收紧了窄屏档案间距；最终导出的 JavaScript SHA256 与完整流程测试版本一致，最终 HTML 重新通过排版检查。
- 浏览器模拟手机尺寸；尚未做实体手机验收。测试浏览器已自动关闭，用户存档未用于测试。
