# 绘本设置界面接入

2026-09-19。以已确认的“游戏设置-效果图-v1.png”为视觉参考，不把整张效果图作为假按钮页面。

- `public/ui/painted-settings-v1/panel.png`：通过 imagegen 从已批准效果图生成的透明空白面板。保留纸面、描金深绿边框和小红花，去除静态文字、地图与控件；PNG为1086×1448，带alpha。
- 蓝色工具箱和金色返回按钮复用项目已有美术。所有文字、开关和操作均为真实DOM控件，读屏状态使用 `role=switch` 与 `aria-checked`；关闭、Esc、焦点约束仍由现有对话框管理。
- `JourneySettings` 继续调用原有音乐／音效、关闭和重置回调；无新增设置存储键，不变更存档格式。原有 `window.confirm` 保留，确认才重置当前玩家，其他玩家不受影响。
- `painted-settings.css` 仅作用于设置弹窗。小高度屏幕使用弹窗内滚动；按钮最小44px；减少动态效果设置下关闭开关位移动画。
- 已接入网页CSS和离线导出。导出拼接样式时移除行首BOM，防止Windows写入的BOM被当成选择器一部分。

## 验证

```powershell
pnpm test
pnpm typecheck
pnpm build
node scripts/export-offline.mjs --output "离线输出目录"
# PLAYWRIGHT_PATH=本机Playwright包，EDGE_PATH可选。
node scripts/test-settings-browser.mjs "最终HTML路径" "报告目录"
```

专项覆盖：两路声音独立切换与持久化、实际音乐静音状态、鼠标和键盘操作、关闭／返回／Esc、取消与确认重置、其他玩家存档不受影响、焦点循环、320×568／390×844／844×390／1440×900布局、图片离线内嵌及无外网依赖。测试使用独立浏览器与合成存档，finally关闭浏览器。

实际手机硬件和人耳听感：not_run。声音开关的状态与持久化已自动验证，不把静音浏览器测试当作人耳听感验收。
